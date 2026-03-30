
import {
    regenerateCutFieldsForIntentChange, formatMultipleTextsWithSemanticBreaks,
} from './services/geminiService';
import {
    AppAction, Cut, EditableScene, EditableCut, GeneratedScript, Scene,
} from './types';
import { UIState } from './appTypes';

// --- Helper types ---

export interface NormalizationActionHelpers {
    dispatch: React.Dispatch<AppAction>;
    stateRef: { current: any };
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
    handleAddUsage: (geminiTokens: number, dalleImages: number) => void;
    updateUIState: (update: Partial<UIState>) => void;
    calculateFinalPrompt: (cut: Cut | EditableCut) => string;
}

// --- Factory ---

export function createNormalizationActions(h: NormalizationActionHelpers) {
    const {
        dispatch,
        stateRef,
        addNotification,
        handleAddUsage,
        updateUIState,
        calculateFinalPrompt,
    } = h;

    // ---- handleRunNormalization ----
    const handleRunNormalization = async (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => {
        dispatch({ type: 'START_LOADING', payload: 'AI 연출 엔진이 변경된 설정을 처리하고 있습니다...' });

        // Helper: API 호출 타임아웃 처리
        const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
            return Promise.race([
                promise,
                new Promise<T>(resolve => setTimeout(() => {
                    console.warn(`[handleRunNormalization] Timeout after ${ms}ms`);
                    resolve(fallback);
                }, ms))
            ]);
        };

        try {
            const { characterDescriptions, locationVisualDNA, generatedContent, generatedImageHistory } = stateRef.current;
            const originalCutsMap = new Map<string, Cut>();
            if (generatedContent && generatedContent.scenes) {
                generatedContent.scenes.flatMap((s: Scene) => s.cuts || []).forEach((c: Cut) => originalCutsMap.set(c.cutNumber, c));
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
                    if (intentChanged) {
                        totalNeedsAI++;
                    }
                }
            }

            console.log(`[handleRunNormalization] Starting normalization. Total cuts needing AI: ${totalNeedsAI}`);
            console.log(`[handleRunNormalization] Modified cut IDs:`, Array.from(modifiedCutIds));

            for (const scene of updatedScenes) {
                const reconstructedCuts: EditableCut[] = [];
                for (const cut of scene.cuts) {
                    const isModified = modifiedCutIds.has(cut.id);
                    console.log(`[handleRunNormalization] Processing cut ${cut.id}. isModified: ${isModified}`);

                    // --- [정규화 1단계] 기계적 의상/헤어 동기화 (Master DNA Sync) ---
                    const profileOutfitParts: string[] = [];
                    (cut.character || []).forEach((name: string) => {
                        // Dynamic lookup by koreanName
                        const key = Object.keys(characterDescriptions).find((k: string) => characterDescriptions[k].koreanName === name);
                        if (key && characterDescriptions[key]) {
                            // 헤어 DNA 강제 주입 및 리터럴 복사 적용
                            const hair = characterDescriptions[key].hairStyleDescription ? `(${characterDescriptions[key].hairStyleDescription}) ` : '';
                            // NOTE: Using 'locations' (English) as source of truth
                            const outfitText = characterDescriptions[key].locations?.[cut.location] || characterDescriptions[key].locations?.['기본 의상'] || characterDescriptions[key].baseAppearance || 'standard outfit';
                            profileOutfitParts.push(`[${name}: ${hair}${outfitText}]`);
                        } else {
                            // Fallback for unknown characters to ensure outfit prompt exists
                            profileOutfitParts.push(`[${name}: standard outfit]`);
                        }
                    });
                    const mechanicalOutfit = profileOutfitParts.join(' ');

                    // --- [정규화 2단계] 장소 설명 자동 완성 (Spatial DNA Sync) ---
                    let finalLocationDescription = cut.locationDescription;
                    if (!finalLocationDescription || finalLocationDescription.trim().length < 5) {
                        finalLocationDescription = locationVisualDNA[cut.location] || 'Consistent visual background.';
                    }

                    // Only use AI regeneration if the directorialIntent was explicitly changed by the user
                    const original = originalCutsMap.get(cut.id);
                    const intentChanged = isModified && (!original || original.directorialIntent !== cut.directorialIntent) && !!cut.directorialIntent?.trim();
                    const needsAI = intentChanged;

                    if (needsAI) {
                        processedModifiedCount++;
                        dispatch({ type: 'SET_LOADING_DETAIL', payload: `[정규화 3단계] 컷 #${cut.cutNumber} 연출 설계 중... (${processedModifiedCount}/${totalNeedsAI || 1})` });
                        try {
                            console.log(`[handleRunNormalization] Regenerating intent for cut ${cut.id}`);
                            const { regeneratedCut, tokenCount } = await withTimeout(
                                regenerateCutFieldsForIntentChange(cut, cut.directorialIntent || '', characterDescriptions),
                                20000, // 20초 타임아웃
                                { regeneratedCut: {}, tokenCount: 0 }
                            );
                            handleAddUsage(tokenCount, 0);

                            let finalOutfit = String(regeneratedCut.characterOutfit || "").trim();
                            const missingCharacterInAIResult = cut.character.some((name: string) => !finalOutfit.includes(name));
                            const isTooShort = finalOutfit.length < 10;

                            if (missingCharacterInAIResult || isTooShort) {
                                finalOutfit = mechanicalOutfit;
                            }

                            reconstructedCuts.push({
                                ...cut,
                                ...regeneratedCut,
                                characterOutfit: finalOutfit,
                                locationDescription: finalLocationDescription
                            });
                        } catch (e) {
                            reconstructedCuts.push({
                                ...cut,
                                characterOutfit: mechanicalOutfit,
                                locationDescription: finalLocationDescription
                            });
                        }
                    } else {
                        // For unmodified cuts, keep existing outfit if it's substantial, otherwise use mechanical
                        const existingOutfit = String(cut.characterOutfit || "").trim();
                        reconstructedCuts.push({
                            ...cut,
                            characterOutfit: existingOutfit.length > 5 ? existingOutfit : mechanicalOutfit,
                            locationDescription: finalLocationDescription
                        });
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

                    const historyImages = generatedImageHistory.filter((img: any) => img.sourceCutNumber === editableCut.id);
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
                        locationDescription: editableCut.locationDescription,
                        otherNotes: editableCut.otherNotes,
                        imageUrls: historyImages.length > 0 ? historyImages.map((img: any) => img.imageUrl) : (original ? original.imageUrls : []),
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

            // --- [정규화 4단계] 나레이션 자동 줄바꿈 처리 ---
            const allCutsForFormatting = finalScenes.flatMap(s => s.cuts);

            // 포맷팅이 필요한 컷이 있는지 먼저 확인
            const cutsNeedingFormatting = allCutsForFormatting.filter(cut => {
                const original = originalCutsMap.get(cut.cutNumber);
                const isModified = modifiedCutIds.has(cut.cutNumber);
                // 첫 생성 시(original이 없을 때)는 무조건 포맷팅 대상(true)으로 간주
                const hasNarrationChanged = original ? original.narration !== cut.narration : true;
                return hasNarrationChanged && cut.narration && cut.narration.trim() && !cut.narration.includes('\n');
            });

            if (cutsNeedingFormatting.length > 0) {
                dispatch({ type: 'SET_LOADING_DETAIL', payload: `[정규화 4단계] 나레이션 자동 최적화 중... (0/${cutsNeedingFormatting.length})` });
            }

            let formattedCount = 0;
            const formattedCuts: Cut[] = [];

            // Batch processing for semantic line breaks
            const cutsToFormat: { cut: Cut, index: number }[] = [];

            for (let i = 0; i < allCutsForFormatting.length; i++) {
                const cut = allCutsForFormatting[i];
                const original = originalCutsMap.get(cut.cutNumber);
                const isModified = modifiedCutIds.has(cut.cutNumber);
                // 첫 생성 시(original이 없을 때)는 무조건 포맷팅 대상(true)으로 간주
                const hasNarrationChanged = original ? original.narration !== cut.narration : true;

                if (hasNarrationChanged && cut.narration && cut.narration.trim() && !cut.narration.includes('\n')) {
                    cutsToFormat.push({ cut, index: i });
                }
                formattedCuts.push(cut); // Initial push, will be updated later
            }

            if (cutsToFormat.length > 0) {
                try {
                    console.log(`[handleRunNormalization] Formatting narrations for ${cutsToFormat.length} cuts in batch`);
                    const textsToFormat = cutsToFormat.map(c => c.cut.narration);
                    const { formattedTexts, tokenCount } = await withTimeout(
                        formatMultipleTextsWithSemanticBreaks(textsToFormat),
                        15000, // 15초 타임아웃
                        { formattedTexts: textsToFormat, tokenCount: 0 }
                    );

                    handleAddUsage(tokenCount, 0);

                    cutsToFormat.forEach((item, i) => {
                        if (formattedTexts[i]) {
                            formattedCuts[item.index] = { ...item.cut, narration: formattedTexts[i] };
                        }
                    });

                    dispatch({ type: 'SET_LOADING_DETAIL', payload: `[정규화 4단계] 나레이션 자동 최적화 완료 (${cutsToFormat.length}/${cutsToFormat.length})` });
                } catch (e) {
                    console.error("Batch formatting failed:", e);
                }
            }

            const formattedCutsMap = new Map(formattedCuts.map(c => [c.cutNumber, c]));

            const finalContent: GeneratedScript = {
                scenes: finalScenes.map(s => ({
                    ...s,
                    cuts: s.cuts.map(c => formattedCutsMap.get(c.cutNumber) || c)
                }))
            };

            // 최종 상태 반영
            dispatch({ type: 'SET_GENERATED_CONTENT', payload: finalContent });
            dispatch({ type: 'SET_APP_STATE', payload: 'storyboardGenerated' });
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: null });
            updateUIState({ isStoryboardReviewModalOpen: false });
            addNotification(modifiedCutIds.size > 0 ? `${modifiedCutIds.size}개의 컷이 성공적으로 업데이트되었습니다.` : '검수 완료', 'success');

        } catch (error) {
            console.error(error);
            addNotification('스토리보드 업데이트 중 오류 발생', 'error');
        } finally {
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    // ---- handleApplyCharacterChangesToAllCuts ----
    const handleApplyCharacterChangesToAllCuts = async () => {
        const { generatedContent, characterDescriptions } = stateRef.current;
        if (!generatedContent) return;

        // 1. Update generatedContent with new outfit descriptions
        const updatedScenes = generatedContent.scenes.map((scene: Scene) => ({
            ...scene,
            cuts: scene.cuts.map((cut: Cut) => {
                const profileOutfitParts: string[] = [];
                (cut.characters || []).forEach((name: string) => {
                    const key = Object.keys(characterDescriptions).find((k: string) => characterDescriptions[k].koreanName === name);
                    if (key && characterDescriptions[key]) {
                        const hair = characterDescriptions[key].hairStyleDescription || 'Standard';
                        const outfitText = characterDescriptions[key].locations?.[cut.location] || characterDescriptions[key].locations?.['기본 의상'] || characterDescriptions[key].baseAppearance || 'standard outfit';
                        profileOutfitParts.push(`[${name}: (${hair}) ${outfitText}]`);
                    }
                });

                // If no characters found, keep original outfit, otherwise update
                const newOutfit = profileOutfitParts.length > 0 ? profileOutfitParts.join(' ') : cut.characterOutfit;

                // Update cut with new outfit
                const updatedCut = { ...cut, characterOutfit: newOutfit };

                // Recalculate prompt
                updatedCut.imagePrompt = calculateFinalPrompt(updatedCut);

                return updatedCut;
            })
        }));

        dispatch({ type: 'SET_GENERATED_CONTENT', payload: { ...generatedContent, scenes: updatedScenes } });
        updateUIState({ isCostumeModalOpen: false });

        // 2. Add a notification to inform the user that changes were applied
        addNotification('의상 변경사항이 적용되었습니다. 원하는 컷을 선택하여 다시 생성해주세요.', 'success');
    };

    return {
        handleRunNormalization,
        handleApplyCharacterChangesToAllCuts,
    };
}
