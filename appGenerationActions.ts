// appGenerationActions.ts — 이미지 생성/수정 액션 (AppContext에서 분리)

import type { AppAction, Cut, GeneratedImage, GeneratedScript, EditableCut, ArtStyle, LoRAEntry } from './types';
import { getEngineFromModel, createGeneratedImage, buildMechanicalOutfit } from './appUtils';
import { buildArtStylePrompt, buildFinalPrompt, PromptContext } from './appStyleEngine';
import { generateImageForCut, CutGenerationContext } from './appImageEngine';
import { refinePromptWithAI, refineAllPromptsWithAI } from './services/geminiService';
import { buildFluxPromptSmart, FluxPromptContext, translateImageScriptToFlux } from './appFluxPromptEngine';

export interface GenerationActionHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: any };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; callback: () => void }) => void;
    handleAddUsage: (tokens: number, source: 'gemini' | 'claude') => void;
    calculateFinalPrompt: (cut: any) => string;
    getArtStylePrompt: (overrideStyle?: ArtStyle, overrideCustomText?: string) => string;
    getVisionModelName: () => string;
    handleEditImageWithNanoWithRetry: (...args: any[]) => Promise<{ imageUrl: string; textResponse: string; tokenCount: number }>;
    persistImageToDisk: (base64Url: string, cutNumber: string, imageId: string) => Promise<string | undefined>;
    triggerConfetti: (targetId?: string) => void;
    currentSessionIdRef: { current: number };
    isAutoGeneratingLocalRef: { current: boolean };
    generateForCutRef: { current: (cutNumber: string, mode: 'rough' | 'normal') => Promise<void> };
    cancelGenerateAllRef: { current: boolean };
    loraRegistryRef: { current: LoRAEntry[] };
}

export function createGenerationActions(h: GenerationActionHelpers) {
    const {
        dispatch, stateRef, addNotification, handleAddUsage, calculateFinalPrompt,
        getArtStylePrompt, getVisionModelName, handleEditImageWithNanoWithRetry,
        persistImageToDisk, triggerConfetti, currentSessionIdRef, isAutoGeneratingLocalRef,
        generateForCutRef, cancelGenerateAllRef, loraRegistryRef,
    } = h;

    const handleRunSelectiveGeneration = async (selectedCutNumbers: string[], overrideContent?: GeneratedScript) => {
        const content = overrideContent || stateRef.current.generatedContent;
        const characterDescriptions = stateRef.current.characterDescriptions;
        if (!content) return;

        const thisSessionId = ++currentSessionIdRef.current;
        isAutoGeneratingLocalRef.current = false;
        await new Promise(r => setTimeout(r, 100));

        const allCuts = content.scenes.flatMap((s: any) => s.cuts);
        const targets = selectedCutNumbers.length > 0
            ? allCuts.filter((c: Cut) => selectedCutNumbers.includes(c.cutNumber))
            : allCuts;

        if (targets.length === 0) { addNotification('생성할 컷이 없습니다.', 'info'); return; }

        isAutoGeneratingLocalRef.current = true;
        dispatch({ type: 'START_AUTO_GENERATION', payload: selectedCutNumbers.length > 0 ? '선택' : '전체' });
        const failedCuts: string[] = [];

        for (let i = 0; i < targets.length; i++) {
            if (!isAutoGeneratingLocalRef.current || currentSessionIdRef.current !== thisSessionId) break;
            const cut = targets[i];

            dispatch({ type: 'SET_LOADING_DETAIL', payload: `이미지 생성 진행 중... [컷 #${cut.cutNumber}] (${i + 1}/${targets.length})` });
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cut.cutNumber, data: { imageLoading: true } } });

            try {
                const styleToUse = cut.artStyleOverride || stateRef.current.artStyle;
                const artStylePrompt = getArtStylePrompt(styleToUse);
                const modelName = getVisionModelName();
                const geminiPrompt = cut.imagePrompt || calculateFinalPrompt(cut as any);

                // Flux 엔진: 스마트 프롬프트 (복잡 씬 → Claude 번역)
                let prompt = geminiPrompt;
                if (stateRef.current.selectedImageEngine === 'flux') {
                    const pCtx: FluxPromptContext = {
                        characterDescriptions,
                        locationVisualDNA: stateRef.current.locationVisualDNA || {},
                        cinematographyPlan: stateRef.current.cinematographyPlan,
                        artStyle: stateRef.current.artStyle || 'normal',
                        imageRatio: stateRef.current.imageRatio || '9:16',
                        loraRegistry: loraRegistryRef.current,
                        styleLoraId: stateRef.current.styleLoraId,
                        fluxModel: stateRef.current.selectedFluxModel,
                    };

                    // 이미지대본 직통 번역 경로 (한국어 sceneDescription → Flux)
                    const sceneDesc = cut.sceneDescription || '';
                    const hasKorean = /[가-힣]/.test(sceneDesc);
                    if (hasKorean && sceneDesc.length > 10) {
                        const charList = cut.characters.map((name: string) => {
                            const key = Object.keys(characterDescriptions).find(k => { const cd = characterDescriptions[k]; return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name; });
                            const char = key ? characterDescriptions[key] : null;
                            const loraEntry = (pCtx.fluxModel === 'flux-lora' && char?.loraId)
                                ? (pCtx.loraRegistry || []).find(e => e.id === char.loraId) : null;
                            return { koreanName: name, triggerWord: loraEntry?.triggerWord, appearance: char?.baseAppearance };
                        });
                        const translated = await translateImageScriptToFlux(sceneDesc, charList, pCtx.artStyle, {
                            styleLoraId: pCtx.styleLoraId, loraRegistry: pCtx.loraRegistry, fluxModel: pCtx.fluxModel,
                        });
                        if (translated) prompt = translated;
                    }

                    // 직통 번역 실패 or 비상세대본 → 기존 경로 폴백
                    if (prompt === geminiPrompt) {
                        prompt = await buildFluxPromptSmart(cut, pCtx);
                    }
                }

                // 인서트 컷용 sceneImageMap 빌드
                const sMap = new Map<string, string>();
                content.scenes.flatMap((sc: any) => sc.cuts).forEach((c: Cut) => {
                    if (c.characters.length > 0 && c.location && !sMap.has(c.location)) {
                        const img = (stateRef.current.generatedImageHistory || []).filter((i: GeneratedImage) => i.sourceCutNumber === c.cutNumber).pop();
                        if (img) sMap.set(c.location, img.imageUrl);
                    }
                });

                // ★ Flux LoRA: txt2img용 context 구성
                const st = stateRef.current;
                const isFluxLora = st.selectedImageEngine === 'flux' && st.selectedFluxModel === 'flux-lora';
                let loraUrlsForCtx: { path: string; scale: number }[] | undefined;
                let fluxEndpointForCtx: string | undefined;
                if (isFluxLora) {
                    loraUrlsForCtx = [];
                    const registry = loraRegistryRef.current;
                    // 캐릭터 LoRA
                    for (const charName of cut.characters) {
                        const key = Object.keys(characterDescriptions).find(k => { const cd = characterDescriptions[k]; return (cd.canonicalName && cd.canonicalName === charName) || cd.koreanName === charName; });
                        if (!key) continue;
                        const char = characterDescriptions[key];
                        if (!char.loraId) continue;
                        const entry = registry.find((e: LoRAEntry) => e.id === char.loraId);
                        if (entry) loraUrlsForCtx.push({ path: entry.url, scale: (char as any).loraScaleOverride ?? entry.scale });
                    }
                    // 화풍 LoRA
                    if (st.styleLoraId) {
                        const styleEntry = registry.find((e: LoRAEntry) => e.id === st.styleLoraId);
                        if (styleEntry) loraUrlsForCtx.push({ path: styleEntry.url, scale: (st as any).styleLoraScaleOverride ?? styleEntry.scale });
                    }
                    fluxEndpointForCtx = 'fal-ai/flux-2/lora';
                }

                const { imageUrl: resultImageUrl, tokenCount: tokenCountUsed } = await generateImageForCut(
                    cut, prompt,
                    {
                        characterDescriptions, artStylePrompt, modelName,
                        imageRatio: st.imageRatio || '1:1', selectedNanoModel: st.selectedNanoModel,
                        sceneImageMap: sMap, engine: st.selectedImageEngine as any,
                        fluxModel: isFluxLora ? 'flux-lora' : st.selectedFluxModel,
                        loraUrls: loraUrlsForCtx,
                        fluxEndpoint: fluxEndpointForCtx,
                    },
                    handleEditImageWithNanoWithRetry
                );

                if (currentSessionIdRef.current !== thisSessionId) break;

                // ★ Flux 생성 후: 번역된 프롬프트를 cut.imagePrompt에도 저장 (프롬프트 보기 창 동기화)
                if (stateRef.current.selectedImageEngine === 'flux' && prompt !== geminiPrompt) {
                    dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cut.cutNumber, data: { imagePrompt: prompt } } });
                }

                if (resultImageUrl) {
                    const imgId = window.crypto.randomUUID();
                    const localPath = await persistImageToDisk(resultImageUrl, cut.cutNumber, imgId);
                    // ★ 화풍 라벨: Gemini→화풍명, Flux LoRA→LoRA명, Flux Pro/Flex→없음
                    const artStyleLabel = (() => {
                        const st = stateRef.current;
                        if (st.selectedImageEngine !== 'flux') {
                            const names: Record<string, string> = { 'normal':'정통 썰툰','vibrant':'도파민','kyoto':'시네마 감성','moe':'극강 귀요미','dalle-chibi':'프리미엄','custom':'커스텀' };
                            return names[st.artStyle] || st.artStyle;
                        }
                        if (st.styleLoraId && loraRegistryRef.current.length > 0) {
                            const lora = loraRegistryRef.current.find(e => e.id === st.styleLoraId);
                            return lora?.name || undefined;
                        }
                        return undefined;
                    })();
                    const modelName = stateRef.current.selectedImageEngine === 'flux' ? (stateRef.current.selectedFluxModel || 'flux-pro') : stateRef.current.selectedNanoModel;
                    const newImage = createGeneratedImage({ id: imgId, imageUrl: resultImageUrl, localPath, sourceCutNumber: cut.cutNumber, prompt, model: modelName, artStyleLabel });
                    dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImage, cutNumber: cut.cutNumber } });
                    if (stateRef.current.selectedImageEngine === 'flux') {
                        dispatch({ type: 'ADD_FAL_USAGE', payload: { images: 1, model: stateRef.current.selectedFluxModel || 'flux-pro' } });
                    } else {
                        handleAddUsage(tokenCountUsed, 'gemini');
                    }
                }
            } catch (error) {
                console.error(`Failed to generate cut ${cut.cutNumber}:`, error);
                failedCuts.push(cut.cutNumber);
            } finally {
                dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cut.cutNumber, data: { imageLoading: false } } });
            }
        }

        if (currentSessionIdRef.current === thisSessionId) {
            isAutoGeneratingLocalRef.current = false;
            dispatch({ type: 'STOP_AUTO_GENERATION' });
            dispatch({ type: 'SET_FAILED_CUTS', payload: failedCuts });
            if (failedCuts.length > 0) {
                addNotification(`${failedCuts.length}개 컷 생성 실패`, 'error', { label: '실패 컷 재시도', callback: () => handleRunSelectiveGeneration(failedCuts) });
            } else {
                addNotification('이미지 생성 작업 완료', 'success');
                triggerConfetti();
            }
        }
    };

    const handleGenerateForCut = async (cutNumber: string, mode: 'rough' | 'normal') => {
        const s = stateRef.current;
        const cut = s.generatedContent?.scenes.flatMap((sc: any) => sc.cuts).find((c: Cut) => c.cutNumber === cutNumber);
        if (!cut) return;

        // ★ 스피너 즉시 표시 (프롬프트 빌드 전)
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { imageLoading: true } } });

        try {
        const geminiPrompt = cut.imagePrompt || calculateFinalPrompt(cut as any);

        // Flux 엔진: 스마트 프롬프트 (복잡 씬 → Claude 번역)
        let prompt = geminiPrompt;
        if (s.selectedImageEngine === 'flux') {
            const pCtx: FluxPromptContext = {
                characterDescriptions: s.characterDescriptions || {},
                locationVisualDNA: s.locationVisualDNA || {},
                cinematographyPlan: s.cinematographyPlan,
                artStyle: s.artStyle || 'normal',
                imageRatio: s.imageRatio || '9:16',
                loraRegistry: loraRegistryRef.current,
                styleLoraId: s.styleLoraId,
                fluxModel: s.selectedFluxModel,
            };

            // 이미지대본 직통 번역 경로 (한국어 sceneDescription → Flux)
            const sceneDesc = cut.sceneDescription || '';
            const hasKorean = /[가-힣]/.test(sceneDesc);
            if (hasKorean && sceneDesc.length > 10) {
                const charDescs = s.characterDescriptions || {};
                const charList = cut.characters.map((name: string) => {
                    const key = Object.keys(charDescs).find(k => { const cd = charDescs[k]; return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name; });
                    const char = key ? charDescs[key] : null;
                    const loraEntry = (pCtx.fluxModel === 'flux-lora' && char?.loraId)
                        ? (pCtx.loraRegistry || []).find(e => e.id === char.loraId) : null;
                    return { koreanName: name, triggerWord: loraEntry?.triggerWord, appearance: char?.baseAppearance };
                });
                const translated = await translateImageScriptToFlux(sceneDesc, charList, pCtx.artStyle, {
                    styleLoraId: pCtx.styleLoraId, loraRegistry: pCtx.loraRegistry, fluxModel: pCtx.fluxModel,
                });
                if (translated) prompt = translated;
            }

            // 직통 번역 실패 or 비상세대본 → 기존 경로 폴백
            if (prompt === geminiPrompt) {
                prompt = await buildFluxPromptSmart(cut, pCtx);
            }
        }

            let imageUrl: string, tokenCount: number;
            const artStylePrompt = buildArtStylePrompt(s.artStyle, s.customArtStyle || '');
            if (mode === 'rough') {
                const ctx: CutGenerationContext = { characterDescriptions: {}, artStylePrompt, modelName: 'gemini-2.5-flash-image', imageRatio: s.imageRatio || '1:1', selectedNanoModel: s.selectedNanoModel };
                const r = await generateImageForCut({ ...cut, characters: [] }, prompt, ctx, handleEditImageWithNanoWithRetry);
                imageUrl = r.imageUrl; tokenCount = r.tokenCount;
            } else {
                const sMap = new Map<string, string>();
                const allCuts = s.generatedContent?.scenes.flatMap((sc: any) => sc.cuts) || [];
                allCuts.forEach((c: Cut) => {
                    if (c.characters.length > 0 && c.location && !sMap.has(c.location)) {
                        const img = (s.generatedImageHistory || []).filter((i: GeneratedImage) => i.sourceCutNumber === c.cutNumber).pop();
                        if (img) sMap.set(c.location, img.imageUrl);
                    }
                });
                // ★ Flux LoRA: txt2img용 context (단일 컷 생성에도 적용)
                const isFluxLoraSingle = s.selectedImageEngine === 'flux' && s.selectedFluxModel === 'flux-lora';
                let loraUrlsSingle: { path: string; scale: number }[] | undefined;
                let fluxEndpointSingle: string | undefined;
                if (isFluxLoraSingle) {
                    loraUrlsSingle = [];
                    const registry = loraRegistryRef.current;
                    for (const charName of cut.characters) {
                        const key = Object.keys(s.characterDescriptions || {}).find(k => { const cd = s.characterDescriptions[k]; return (cd.canonicalName && cd.canonicalName === charName) || cd.koreanName === charName; });
                        if (!key) continue;
                        const char = s.characterDescriptions[key];
                        if (!char.loraId) continue;
                        const entry = registry.find((e: LoRAEntry) => e.id === char.loraId);
                        if (entry) loraUrlsSingle.push({ path: entry.url, scale: (char as any).loraScaleOverride ?? entry.scale });
                    }
                    if (s.styleLoraId) {
                        const styleEntry = registry.find((e: LoRAEntry) => e.id === s.styleLoraId);
                        if (styleEntry) loraUrlsSingle.push({ path: styleEntry.url, scale: (s as any).styleLoraScaleOverride ?? styleEntry.scale });
                    }
                    fluxEndpointSingle = 'fal-ai/flux-2/lora';
                }
                const ctx: CutGenerationContext = {
                    characterDescriptions: s.characterDescriptions, artStylePrompt, modelName: 'gemini-2.5-flash-image',
                    imageRatio: s.imageRatio || '1:1', selectedNanoModel: s.selectedNanoModel, sceneImageMap: sMap,
                    engine: stateRef.current.selectedImageEngine as any,
                    fluxModel: isFluxLoraSingle ? 'flux-lora' : s.selectedFluxModel,
                    loraUrls: loraUrlsSingle,
                    fluxEndpoint: fluxEndpointSingle,
                };
                const r = await generateImageForCut(cut, prompt, ctx, handleEditImageWithNanoWithRetry);
                imageUrl = r.imageUrl; tokenCount = r.tokenCount;
            }
            if (stateRef.current.selectedImageEngine === 'flux') {
                dispatch({ type: 'ADD_FAL_USAGE', payload: { images: 1, model: stateRef.current.selectedFluxModel || 'flux-pro' } });
            } else if (tokenCount > 0) {
                handleAddUsage(tokenCount, 'gemini');
            }
            const imgId = window.crypto.randomUUID();
            const localPath = await persistImageToDisk(imageUrl, cutNumber, imgId);
            const artStyleLabel2 = (() => {
                if (s.selectedImageEngine !== 'flux') {
                    const names: Record<string, string> = { 'normal':'정통 썰툰','vibrant':'도파민','kyoto':'시네마 감성','moe':'극강 귀요미','dalle-chibi':'프리미엄','custom':'커스텀' };
                    return names[s.artStyle] || s.artStyle;
                }
                if (s.styleLoraId && loraRegistryRef.current.length > 0) {
                    const lora = loraRegistryRef.current.find(e => e.id === s.styleLoraId);
                    return lora?.name || undefined;
                }
                return undefined;
            })();
            const modelName2 = s.selectedImageEngine === 'flux' ? (s.selectedFluxModel || 'flux-pro') : s.selectedNanoModel;
            const newImage = createGeneratedImage({ id: imgId, imageUrl, localPath, sourceCutNumber: cutNumber, prompt, model: modelName2, tag: mode === 'rough' ? 'rough' : 'normal', artStyleLabel: artStyleLabel2 });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImage, cutNumber } });
        } catch (err: any) { addNotification(`#${cutNumber} ${mode === 'rough' ? '러프' : '일반'} 실패: ${err.message?.slice(0, 50)}`, 'error', { label: '재시도', callback: () => handleGenerateForCut(cutNumber, mode) }); }
        finally { dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { imageLoading: false } } }); }
    };

    // Assign to ref so handleGenerateAll can call latest version
    generateForCutRef.current = handleGenerateForCut;

    const handleGenerateAll = async (mode: 'rough' | 'normal') => {
        const allCuts = stateRef.current.generatedContent?.scenes.flatMap((sc: any) => sc.cuts) || [];
        const targets = allCuts.filter((c: Cut) => {
            const hasImage = (stateRef.current.generatedImageHistory || []).some((img: GeneratedImage) => img.sourceCutNumber === c.cutNumber);
            return !hasImage;
        });
        if (!targets.length) { addNotification('모든 컷에 이미지가 있습니다.', 'info'); return; }
        cancelGenerateAllRef.current = false;
        dispatch({ type: 'START_LOADING', payload: `전체 ${mode === 'rough' ? '러프' : '일반'} 생성 (0/${targets.length})` });
        try {
            for (let i = 0; i < targets.length; i++) {
                if (cancelGenerateAllRef.current) break;
                dispatch({ type: 'START_LOADING', payload: `전체 ${mode === 'rough' ? '러프' : '일반'} (${i + 1}/${targets.length})` });
                await generateForCutRef.current(targets[i].cutNumber, mode);
            }
            if (!cancelGenerateAllRef.current) addNotification(`전체 ${mode === 'rough' ? '러프' : '일반'} 완료 (${targets.length}컷)`, 'success');
        } catch (e: any) {
            addNotification(`전체 생성 중 오류: ${e.message || e}`, 'error');
        } finally {
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    const handleRefinePrompt = async (cutNumber: string, request: string) => {
        if (!request.trim()) return;
        const s = stateRef.current;
        const cut = s.generatedContent?.scenes.flatMap((sc: any) => sc.cuts).find((c: Cut) => c.cutNumber === cutNumber);
        if (!cut) return;
        const currentPrompt = cut.imagePrompt || '';
        const allCharNames = Object.values(s.characterDescriptions).map((c: any) => c.koreanName).filter(Boolean);
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { imageLoading: true } } });
        try {
            const { fieldChanges, tokenCount } = await refinePromptWithAI(currentPrompt, request, {
                scene: cut.location, characters: [...cut.characters], narration: cut.narration, allCharacterNames: allCharNames,
                cutFields: { characterPose: cut.characterPose, characterEmotionAndExpression: cut.characterEmotionAndExpression, characterOutfit: cut.characterOutfit, sceneDescription: cut.sceneDescription, location: cut.location, locationDescription: cut.locationDescription, directorialIntent: cut.directorialIntent, otherNotes: cut.otherNotes, cameraAngle: cut.cameraAngle }
            });
            handleAddUsage(tokenCount, 'claude');
            if (!Object.keys(fieldChanges).length) { addNotification(`#${cutNumber}: 수정 사항 없음`, 'info'); return; }

            const merged: any = { ...cut };
            const chars = fieldChanges.characters || [...cut.characters];
            merged.characters = chars;
            for (const [k, v] of Object.entries(fieldChanges)) { if (k !== 'characters' && v !== undefined) merged[k] = v; }

            // characters 변경 시 characterOutfit 재조립
            if (fieldChanges.characters) {
                merged.characterOutfit = buildMechanicalOutfit(chars, s.characterDescriptions, cut.location);
            }
            const promptCtx: PromptContext = { characterDescriptions: s.characterDescriptions, locationVisualDNA: s.locationVisualDNA || {}, cinematographyPlan: s.cinematographyPlan || null, imageRatio: s.imageRatio || '1:1', artStyle: s.artStyle };
            const newPrompt = buildFinalPrompt(merged, promptCtx);
            const upd: Partial<Cut> = { ...fieldChanges, imagePrompt: newPrompt };
            if (fieldChanges.characters) upd.characterOutfit = merged.characterOutfit;
            delete (upd as any).characters;
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: upd } });
            if (fieldChanges.characters) dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { characters: chars } } });
            addNotification(`#${cutNumber} 수정 완료`, 'success');
        } catch (err: any) { addNotification(`수정 실패: ${err.message?.slice(0, 50)}`, 'error', { label: '재시도', callback: () => handleRefinePrompt(cutNumber, request) }); }
        finally { dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { imageLoading: false } } }); }
    };

    const handleBatchRefine = async (request: string) => {
        if (!request.trim()) return;
        const allCuts = stateRef.current.generatedContent?.scenes.flatMap((sc: any) => sc.cuts) || [];
        // 전체 화면 로딩 대신 각 컷에 imageLoading 표시
        allCuts.forEach((c: Cut) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: c.cutNumber, data: { imageLoading: true } } }));
        try {
            const data = allCuts.map((c: Cut) => ({ cutNumber: c.cutNumber, prompt: c.imagePrompt || '', scene: c.location, narration: c.narration }));
            const { refinedCuts, tokenCount } = await refineAllPromptsWithAI(data, request);
            handleAddUsage(tokenCount, 'claude');
            let cnt = 0;
            refinedCuts.forEach((r: any) => { if (r.changed) { dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: r.cutNumber, data: { imagePrompt: r.refinedPrompt } } }); cnt++; } });
            addNotification(`${cnt}개 컷 수정 완료`, 'success');
        } catch { addNotification('일괄 수정 실패', 'error', { label: '재시도', callback: () => handleBatchRefine(request) }); }
        finally { allCuts.forEach((c: Cut) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: c.cutNumber, data: { imageLoading: false } } })); }
    };

    return {
        handleRunSelectiveGeneration,
        handleGenerateForCut,
        handleGenerateAll,
        handleRefinePrompt,
        handleBatchRefine,
    };
}
