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

    const handleRunNormalization = async (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => {
        dispatch({ type: 'START_LOADING', payload: 'AI 연출 엔진이 변경된 설정을 처리하고 있습니다...' });

        try {
            const { characterDescriptions, locationVisualDNA, generatedContent, generatedImageHistory } = stateRef.current;
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
                    const mechanicalOutfit = buildMechanicalOutfit(cut.character || [], characterDescriptions, cut.location, { fallbackUnknown: true });

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
                        reconstructedCuts.push({ ...cut, characterOutfit: existingOutfit.length > 5 ? existingOutfit : mechanicalOutfit, locationDescription: finalLocationDescription });
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
                    const { formattedTexts, tokenCount } = await withTimeout(
                        formatMultipleTextsWithSemanticBreaks(textsToFormat),
                        15000, { formattedTexts: textsToFormat, tokenCount: 0 }
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

        // 캐릭터 시트 → 스튜디오 연동
        const getFinalImg = (key: string) => {
            const char = characterDescriptions[key];
            if (!char) return null;
            const url = char.mannequinImageUrl || char.upscaledImageUrl || (char.characterSheetHistory?.[char.characterSheetHistory.length - 1]);
            if (!url) return null;
            return createGeneratedImage({
                id: `char-sheet-${key}-${Date.now()}`,
                imageUrl: url,
                sourceCutNumber: 'character-sheet',
                prompt: char.baseAppearance || 'Character Sheet Base',
                model: stateRef.current.selectedNanoModel,
            });
        };

        const charKeys = Object.keys(characterDescriptions);
        if (charKeys.length > 0) {
            const imgA = getFinalImg(charKeys[0]);
            if (imgA) {
                dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: 'a', image: imgA } });
                dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: 'a', image: imgA } });
            }
        }
        if (editableStoryboard) {
            const syncedDraft = editableStoryboard.map((scene: any) => ({
                ...scene,
                cuts: scene.cuts.map((cut: any) => {
                    return { ...cut, characterOutfit: buildMechanicalOutfit(cut.character || [], characterDescriptions, cut.location) };
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
