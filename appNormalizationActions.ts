// appNormalizationActions.ts — 정규화 + 스토리보드 의상적용 액션 (AppContext에서 분리)

import type { AppAction, Cut, EditableScene, EditableCut, Scene, GeneratedScript, GeneratedImage, CharacterDescription, ArtStyle } from './types';
import { createGeneratedImage, buildMechanicalOutfit } from './appUtils';
import { formatMultipleTextsWithSemanticBreaks, regenerateCutFieldsForIntentChange, convertContiToEditableStoryboard } from './services/geminiService';

export interface NormalizationActionHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: any };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    handleAddUsage: (tokens: number, source: 'gemini' | 'claude') => void;
    updateUIState: (update: any) => void;
    calculateFinalPrompt: (cut: any) => string;
    handleOpenReviewModalForEdit: () => void;
}

/** API 호출 타임아웃 헬퍼 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>(resolve => setTimeout(() => {
            console.warn(`[withTimeout] Timeout after ${ms}ms`);
            resolve(fallback);
        }, ms))
    ]);
}

export function createNormalizationActions(h: NormalizationActionHelpers) {
    const { dispatch, stateRef, addNotification, handleAddUsage, updateUIState, calculateFinalPrompt, handleOpenReviewModalForEdit } = h;

    // ── 타입 안전 헬퍼 (Claude/Gemini가 string을 array로 반환하는 케이스 방어) ──
    const toSafeStr = (v: any): string => {
        if (v == null) return '';
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v.map(toSafeStr).filter(Boolean).join(' ');
        return String(v);
    };
    const sanitizeCutStringFields = (cut: any) => {
        if (!cut) return cut;
        const stringFields = [
            'narration', 'narrationText', 'location', 'cameraAngle', 'sceneDescription',
            'characterEmotionAndExpression', 'characterPose', 'characterOutfit',
            'characterIdentityDNA', 'locationDescription', 'otherNotes', 'directorialIntent',
            'sceneDescriptionIntense', 'characterEmotionAndExpressionIntense', 'characterPoseIntense',
        ];
        for (const f of stringFields) {
            if (f in cut && typeof cut[f] !== 'string' && cut[f] != null) {
                cut[f] = toSafeStr(cut[f]);
            }
        }
        // characters / character 배열도 element 모두 string 강제
        if (Array.isArray(cut.characters)) {
            cut.characters = cut.characters.map(toSafeStr).filter((s: string) => s.length > 0);
        } else if (cut.characters != null && !Array.isArray(cut.characters)) {
            cut.characters = [toSafeStr(cut.characters)].filter((s: string) => s.length > 0);
        }
        if (Array.isArray(cut.character)) {
            cut.character = cut.character.map(toSafeStr).filter((s: string) => s.length > 0);
        }
        return cut;
    };

    const handleRunNormalization = async (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => {
        dispatch({ type: 'START_LOADING', payload: 'AI 연출 엔진이 변경된 설정을 처리하고 있습니다...' });

        try {
            const { characterDescriptions, locationVisualDNA, generatedContent, generatedImageHistory } = stateRef.current;
            // ★ 입력 단계에서 모든 컷의 string/array 필드 타입 강제 (Claude array 반환 방어)
            updatedScenes.forEach((s: any) => (s.cuts || []).forEach(sanitizeCutStringFields));
            const originalCutsMap = new Map<string, Cut>();
            if (generatedContent && generatedContent.scenes) {
                generatedContent.scenes.flatMap((s: any) => s.cuts || []).forEach((c: Cut) => originalCutsMap.set(c.cutNumber, c));
            }

            const reconstructedScenes: EditableScene[] = [];
            let processedModifiedCount = 0;

            // Calculate actual number of cuts needing AI regeneration
            let totalNeedsAI = 0;
            for (const scene of updatedScenes) {
                for (const cut of scene.cuts) {
                    const isModified = modifiedCutIds.has(cut.id);
                    const original = originalCutsMap.get(cut.id);
                    const intentChanged = isModified && (!original || original.directorialIntent !== cut.directorialIntent) && !!cut.directorialIntent?.trim();
                    if (intentChanged) totalNeedsAI++;
                }
            }

            console.log(`[handleRunNormalization] Starting. Total cuts needing AI: ${totalNeedsAI}`);

            for (const scene of updatedScenes) {
                const reconstructedCuts: EditableCut[] = [];
                for (const cut of scene.cuts) {
                    const isModified = modifiedCutIds.has(cut.id);

                    // --- [정규화 1단계] 기계적 의상/헤어 동기화 ---
                    const mechanicalOutfit = buildMechanicalOutfit(cut.character || [], characterDescriptions, cut.location, { fallbackUnknown: true, sceneLayerId: cut.sceneLayerId });

                    // --- [정규화 2단계] 장소 설명 자동 완성 ---
                    let finalLocationDescription = cut.locationDescription;
                    if (!finalLocationDescription || finalLocationDescription.trim().length < 5) {
                        finalLocationDescription = locationVisualDNA[cut.location] || 'Consistent visual background.';
                    }

                    const original = originalCutsMap.get(cut.id);
                    const intentChanged = isModified && (!original || original.directorialIntent !== cut.directorialIntent) && !!cut.directorialIntent?.trim();

                    if (intentChanged) {
                        processedModifiedCount++;
                        dispatch({ type: 'SET_LOADING_DETAIL', payload: `[정규화 3단계] 컷 #${cut.cutNumber} 연출 설계 중... (${processedModifiedCount}/${totalNeedsAI || 1})` });
                        try {
                            const { regeneratedCut, tokenCount } = await withTimeout(
                                regenerateCutFieldsForIntentChange(cut, cut.directorialIntent || '', characterDescriptions),
                                20000, { regeneratedCut: {}, tokenCount: 0 }
                            );
                            handleAddUsage(tokenCount, 'claude');

                            let finalOutfit = String(regeneratedCut.characterOutfit || "").trim();
                            const missingChar = cut.character.some((name: string) => !finalOutfit.includes(name));
                            if (missingChar || finalOutfit.length < 10) finalOutfit = mechanicalOutfit;

                            reconstructedCuts.push({ ...cut, ...regeneratedCut, characterOutfit: finalOutfit, locationDescription: finalLocationDescription });
                        } catch {
                            reconstructedCuts.push({ ...cut, characterOutfit: mechanicalOutfit, locationDescription: finalLocationDescription });
                        }
                    } else {
                        const existingOutfit = String(cut.characterOutfit || "").trim();
                        // ★ DNA 오염 감지: 기존 customOutfit에 외모 키워드가 섞여 있으면 mechanical로 강제 복구.
                        // Phase 5 이전 저장된 프로젝트에서 baseAppearance 폴백으로 인해 외모 서술이
                        // customOutfit에 박힌 케이스를 자동 치유.
                        const DNA_POLLUTION = /\b(hair|face|skin|eyes|jawline|forehead|wavy texture|cheekbone|eyebrow|eyelid|complexion|freckle|dimple|nose bridge|lip shape)\b/i;
                        const polluted = DNA_POLLUTION.test(existingOutfit);
                        const finalExisting = polluted ? mechanicalOutfit : existingOutfit;
                        reconstructedCuts.push({ ...cut, characterOutfit: finalExisting.length > 5 ? finalExisting : mechanicalOutfit, locationDescription: finalLocationDescription });
                    }
                }
                reconstructedScenes.push({ ...scene, cuts: reconstructedCuts });
            }

            // 최종 Scene 객체로 변환
            const finalScenes: Scene[] = reconstructedScenes.map(editableScene => ({
                sceneNumber: editableScene.sceneNumber,
                title: editableScene.title,
                settingPrompt: '',
                cuts: editableScene.cuts.map(editableCut => {
                    const original = originalCutsMap.get(editableCut.id);
                    const isModified = modifiedCutIds.has(editableCut.id);
                    const historyImages = generatedImageHistory.filter((img: GeneratedImage) => img.sourceCutNumber === editableCut.id);
                    const latestHistoryImage = historyImages[0];

                    const tempCut: Cut = {
                        id: original ? original.id : window.crypto.randomUUID(),
                        cutNumber: editableCut.id,
                        narration: editableCut.narrationText,
                        characters: editableCut.character,
                        location: editableCut.location,
                        cameraAngle: editableCut.otherNotes,
                        sceneDescription: editableCut.sceneDescription,
                        characterEmotionAndExpression: editableCut.characterEmotionAndExpression,
                        characterPose: editableCut.characterPose,
                        characterOutfit: String(editableCut.characterOutfit),
                        characterIdentityDNA: editableCut.characterIdentityDNA || '',
                        locationDescription: editableCut.locationDescription,
                        otherNotes: editableCut.otherNotes,
                        imageUrls: historyImages.length > 0 ? historyImages.map((img: GeneratedImage) => img.imageUrl) : (original ? original.imageUrls : []),
                        imageLoading: false,
                        selectedImageId: latestHistoryImage ? latestHistoryImage.id : (original ? original.selectedImageId : null),
                        directorialIntent: editableCut.directorialIntent,
                        audioDataUrls: original ? original.audioDataUrls : undefined,
                    };

                    if (isModified || !original?.imagePrompt) {
                        tempCut.imagePrompt = calculateFinalPrompt(tempCut);
                    } else {
                        tempCut.imagePrompt = original.imagePrompt;
                    }
                    return tempCut;
                })
            }));

            // --- [정규화 4단계] 나레이션 자동 줄바꿈 ---
            const allCutsForFormatting = finalScenes.flatMap(s => s.cuts);
            const cutsToFormat: { cut: Cut, index: number }[] = [];
            const formattedCuts: Cut[] = [];

            for (let i = 0; i < allCutsForFormatting.length; i++) {
                const cut = allCutsForFormatting[i];
                // narration이 array/객체로 들어온 레거시 데이터 방어
                if (typeof cut.narration !== 'string') {
                    cut.narration = Array.isArray(cut.narration)
                        ? (cut.narration as any[]).map(v => String(v ?? '')).filter(Boolean).join(' ')
                        : (cut.narration == null ? '' : String(cut.narration));
                }
                const original = originalCutsMap.get(cut.cutNumber);
                const hasNarrationChanged = original ? original.narration !== cut.narration : true;
                if (hasNarrationChanged && cut.narration && cut.narration.trim() && !cut.narration.includes('\n')) {
                    cutsToFormat.push({ cut, index: i });
                }
                formattedCuts.push(cut);
            }

            if (cutsToFormat.length > 0) {
                dispatch({ type: 'SET_LOADING_DETAIL', payload: `[정규화 4단계] 나레이션 자동 최적화 중... (0/${cutsToFormat.length})` });
                try {
                    const textsToFormat = cutsToFormat.map(c => c.cut.narration);
                    // 타임아웃: Opus + 많은 컷 + 서버 혼잡 시 15초 부족. 30초로 여유 확보.
                    // 그래도 폴백은 원본 텍스트 유지라 동작엔 지장 없음.
                    const { formattedTexts, tokenCount } = await withTimeout(
                        formatMultipleTextsWithSemanticBreaks(textsToFormat),
                        30000, { formattedTexts: textsToFormat, tokenCount: 0 }
                    );
                    handleAddUsage(tokenCount, 'claude');
                    cutsToFormat.forEach((item, i) => {
                        if (formattedTexts[i]) formattedCuts[item.index] = { ...item.cut, narration: formattedTexts[i] };
                    });
                    dispatch({ type: 'SET_LOADING_DETAIL', payload: `[정규화 4단계] 나레이션 자동 최적화 완료 (${cutsToFormat.length}/${cutsToFormat.length})` });
                } catch (e) {
                    console.error("Batch formatting failed:", e);
                }
            }

            const formattedCutsMap = new Map(formattedCuts.map(c => [c.cutNumber, c]));
            const finalContent: GeneratedScript = {
                scenes: finalScenes.map(s => ({ ...s, cuts: s.cuts.map(c => formattedCutsMap.get(c.cutNumber) || c) }))
            };

            dispatch({ type: 'SET_GENERATED_CONTENT', payload: finalContent });
            dispatch({ type: 'SET_APP_STATE', payload: 'storyboardGenerated' });
            dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'complete' });
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: null });
            updateUIState({ isStoryboardReviewModalOpen: false });
            addNotification(modifiedCutIds.size > 0 ? `${modifiedCutIds.size}개의 컷이 업데이트되었습니다.` : '검수 완료', 'success');
        } catch (error) {
            console.error(error);
            addNotification('스토리보드 업데이트 중 오류 발생', 'error');
        } finally {
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    const handleGenerateStoryboardWithCustomCostumes = async () => {
        let { editableStoryboard, characterDescriptions } = stateRef.current;

        if (!editableStoryboard) {
            const { contiCuts, cinematographyPlan, characterBibles } = stateRef.current;
            if (contiCuts && cinematographyPlan && characterBibles) {
                editableStoryboard = convertContiToEditableStoryboard(contiCuts, cinematographyPlan, characterBibles);
                dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: editableStoryboard });
            }
        }

        // Phase A.7: 기존 character sheet → studio 연동 코드는 통합 스튜디오로 대체됨 (제거)
        if (editableStoryboard) {
            const syncedDraft = editableStoryboard.map((scene: any) => ({
                ...scene,
                cuts: scene.cuts.map((cut: any) => {
                    return { ...cut, characterOutfit: buildMechanicalOutfit(cut.character || [], characterDescriptions, cut.location, { sceneLayerId: cut.sceneLayerId }) };
                })
            }));
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: syncedDraft });
        }
        dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'costume_done' });
        updateUIState({ isCostumeModalOpen: false });
        handleOpenReviewModalForEdit();
    };

    return {
        handleRunNormalization,
        handleGenerateStoryboardWithCustomCostumes,
    };
}
