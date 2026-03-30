
import {
    generateMultiCharacterImage,
} from './services/geminiService';
import {
    AppAction, Cut, GeneratedScript, ArtStyle, EditableCut,
} from './types';
import { UIState } from './appTypes';
import { createGeneratedImage } from './appUtils';

// --- Helper types ---

export interface GenerationActionHelpers {
    dispatch: React.Dispatch<AppAction>;
    stateRef: { current: any };
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
    handleAddUsage: (geminiTokens: number, dalleImages: number) => void;
    handleEditImageWithNanoWithRetry: (
        baseImageUrl: string,
        editPrompt: string,
        originalPrompt: string,
        referenceImageUrl?: string,
        maskBase64?: string,
        masterStyleImageUrl?: string,
        isCreativeGeneration?: boolean,
        artStylePromptOverride?: string
    ) => Promise<{ imageUrl: string; textResponse: string; tokenCount: number }>;
    getArtStylePrompt: (overrideStyle?: ArtStyle, overrideCustomText?: string) => string;
    getVisionModelName: () => string;
    triggerConfetti: (targetId?: string) => void;
    currentSessionIdRef: { current: number };
    isAutoGeneratingLocalRef: { current: boolean };
    updateUIState: (update: Partial<UIState>) => void;
    calculateFinalPrompt: (cut: Cut | EditableCut) => string;
}

// --- Factory ---

export function createGenerationActions(h: GenerationActionHelpers) {
    const {
        dispatch,
        stateRef,
        addNotification,
        handleAddUsage,
        handleEditImageWithNanoWithRetry,
        getArtStylePrompt,
        getVisionModelName,
        triggerConfetti,
        currentSessionIdRef,
        isAutoGeneratingLocalRef,
        calculateFinalPrompt,
    } = h;

    // --- handleRunSelectiveGeneration ---
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

        if (targets.length === 0) {
            addNotification('생성할 컷이 없습니다.', 'info');
            return;
        }

        isAutoGeneratingLocalRef.current = true;
        dispatch({ type: 'START_AUTO_GENERATION', payload: selectedCutNumbers.length > 0 ? '선택' : '전체' });

        const failedCuts: string[] = [];

        for (let i = 0; i < targets.length; i++) {
            if (!isAutoGeneratingLocalRef.current || currentSessionIdRef.current !== thisSessionId) break;
            const cut = targets[i];

            dispatch({ type: 'SET_LOADING_DETAIL', payload: `이미지 생성 진행 중... [컷 #${cut.cutNumber}] (${i+1}/${targets.length})` });
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cut.cutNumber, data: { imageLoading: true } } });

            try {
                // Check if this cut has a specific override style
                const styleToUse = cut.artStyleOverride || stateRef.current.artStyle;
                const artStylePrompt = getArtStylePrompt(styleToUse);
                const modelName = getVisionModelName();
                const prompt = cut.imagePrompt || calculateFinalPrompt(cut as any);

                // Dynamic character detection
                const presentCharKeys = Object.keys(characterDescriptions).filter((key: string) =>
                    cut.characters.some((c: string) => c.includes(characterDescriptions[key].koreanName))
                );

                let resultImageUrl = '';
                let tokenCountUsed = 0;

                // Build character array for generation
                const charsToGenerate: { name: string, url: string }[] = [];

                // Add main characters
                for (let j = 0; j < Math.min(2, presentCharKeys.length); j++) {
                    const key = presentCharKeys[j];
                    const char = characterDescriptions[key];
                    const ref = char.mannequinImageUrl || char.upscaledImageUrl || (char.characterSheetHistory && char.characterSheetHistory[char.characterSheetHistory.length - 1]);
                    if (ref) {
                        charsToGenerate.push({ name: char.koreanName || `Char${j+1}`, url: ref });
                    }
                }

                // Add guest character if present
                if (cut.guestCharacterUrl) {
                    charsToGenerate.push({ name: cut.guestCharacterName || 'Guest', url: cut.guestCharacterUrl });
                }

                if (charsToGenerate.length >= 2) {
                    // Handle multi-character (taking first 2 found characters + guest, up to 3)
                    const res = await generateMultiCharacterImage(prompt, charsToGenerate.slice(0, 3), artStylePrompt, modelName);
                    resultImageUrl = res.imageUrl;
                    tokenCountUsed = res.tokenCount;
                } else if (charsToGenerate.length === 1) {
                    const ref = charsToGenerate[0].url;
                    const res = await handleEditImageWithNanoWithRetry(ref, prompt, '', undefined, undefined, undefined, true, artStylePrompt);
                    resultImageUrl = res.imageUrl;
                    tokenCountUsed = res.tokenCount;
                } else {
                    const dummyRef = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
                    const res = await handleEditImageWithNanoWithRetry(dummyRef, prompt, '', undefined, undefined, undefined, true, artStylePrompt);
                    resultImageUrl = res.imageUrl;
                    tokenCountUsed = res.tokenCount;
                }

                if (currentSessionIdRef.current !== thisSessionId) break;

                if (resultImageUrl) {
                    const newImage = createGeneratedImage({ imageUrl: resultImageUrl, sourceCutNumber: cut.cutNumber, prompt: prompt, model: stateRef.current.selectedNanoModel });

                    dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImage, cutNumber: cut.cutNumber } });
                    handleAddUsage(tokenCountUsed, 0);
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
                addNotification(`${failedCuts.length}개 컷 생성 실패`, 'error');
            } else {
                addNotification('이미지 생성 작업 완료', 'success');
                triggerConfetti();
            }
        }
    };

    // --- handleRetryFailedCuts ---
    const handleRetryFailedCuts = async () => handleRunSelectiveGeneration(stateRef.current.failedCutNumbers);

    // --- handleAutoGenerateImageForCut ---
    const handleAutoGenerateImageForCut = (cut: Cut) => handleRunSelectiveGeneration([cut.cutNumber]);

    // --- handleApplyAndRunPrompt ---
    const handleApplyAndRunPrompt = (p: string, cutNumber: string) => {
        dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: stateRef.current.activeStudioTarget, data: { editPrompt: p, sourceCutForNextEdit: cutNumber } } });
    };

    // --- handleToggleAutoGeneration ---
    const handleToggleAutoGeneration = () => {
        if (stateRef.current.isAutoGenerating) {
            isAutoGeneratingLocalRef.current = false;
            dispatch({ type: 'STOP_AUTO_GENERATION' });
        } else {
            handleRunSelectiveGeneration([]);
        }
    };

    return {
        handleRunSelectiveGeneration,
        handleRetryFailedCuts,
        handleAutoGenerateImageForCut,
        handleApplyAndRunPrompt,
        handleToggleAutoGeneration,
    };
}
