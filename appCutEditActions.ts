
import {
    regenerateCutFieldsForIntentChange,
    formatTextWithSemanticBreaks,
} from './services/geminiService';
import {
    AppAction, Cut, GeneratedImage, ArtStyle, EditableCut,
} from './types';
import { UIState } from './appTypes';
import { createGeneratedImage } from './appUtils';

// --- Helper types ---

export interface CutEditActionHelpers {
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
    updateUIState: (update: Partial<UIState>) => void;
    calculateFinalPrompt: (cut: Cut | EditableCut) => string;
}

// --- Factory ---

export function createCutEditActions(h: CutEditActionHelpers) {
    const {
        dispatch,
        stateRef,
        addNotification,
        handleAddUsage,
        handleEditImageWithNanoWithRetry,
        getArtStylePrompt,
        getVisionModelName,
        updateUIState,
        calculateFinalPrompt,
    } = h;

    // --- Cut modification handlers ---

    const handleUpdateCutCharacters = async (cutNumber: string, names: string[]) => {
        const target = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: any) => c.cutNumber === cutNumber);
        const { characterDescriptions } = stateRef.current;
        if (target) {
            const profileOutfitParts: string[] = [];
            names.forEach(name => {
                const key = Object.keys(characterDescriptions).find((k: string) => characterDescriptions[k].koreanName === name);
                if (key && characterDescriptions[key]) {
                    const hair = characterDescriptions[key].hairStyleDescription ? `(${characterDescriptions[key].hairStyleDescription}) ` : '';
                    const outfitText = characterDescriptions[key].locations?.[target.location] || characterDescriptions[key].locations?.['기본 의상'] || characterDescriptions[key].baseAppearance || 'standard outfit';
                    profileOutfitParts.push(`[${name}: ${hair}${outfitText}]`);
                }
            });
            const mechanicalOutfit = profileOutfitParts.join(' ');
            const nextCut = { ...target, characters: names, characterOutfit: mechanicalOutfit };
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { characters: names, characterOutfit: mechanicalOutfit, imagePrompt: calculateFinalPrompt(nextCut) } } });
        }
    };

    const handleUpdateCutIntent = async (cutNumber: string, intent: string) => {
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { directorialIntent: intent, isUpdatingIntent: true } } });
        try {
            const { characterDescriptions } = stateRef.current;
            const target = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: any) => c.cutNumber === cutNumber);
            if (target) {
                const { regeneratedCut, tokenCount } = await regenerateCutFieldsForIntentChange(target, intent, characterDescriptions);
                handleAddUsage(tokenCount, 0);
                const updatedCutDataForPrompting = { ...target, directorialIntent: intent, ...regeneratedCut };
                const finalImagePrompt = calculateFinalPrompt(updatedCutDataForPrompting);
                dispatch({
                    type: 'UPDATE_CUT',
                    payload: {
                        cutNumber,
                        data: {
                            ...regeneratedCut,
                            directorialIntent: intent,
                            imagePrompt: finalImagePrompt,
                            isUpdatingIntent: false
                        }
                    }
                });
            }
        } catch (e) {
            console.error("Failed to update cut intent:", e);
            addNotification(`컷 #${cutNumber} 연출 의도 업데이트 실패`, 'error');
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { isUpdatingIntent: false } } });
        }
    };

    const handleUpdateCutFieldAndRegenerate = async (cutNumber: string, field: keyof Cut, val: string) => {
        const target = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: any) => c.cutNumber === cutNumber);
        if (!target) return;
        const updates: any = { [field]: val };
        if (field !== 'imagePrompt') {
            const temp = { ...target, ...updates };
            updates.imagePrompt = calculateFinalPrompt(temp as any);
        }
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: updates } });
    };

    const handleUpdateCutIntentAndRegenerate = async (cutNumber: string, intent: string) => {
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { directorialIntent: intent, isUpdatingIntent: true } } });
        try {
            const { characterDescriptions } = stateRef.current;
            const target = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: any) => c.cutNumber === cutNumber);
            if (target) {
                const { regeneratedCut, tokenCount } = await regenerateCutFieldsForIntentChange(target, intent, characterDescriptions);
                handleAddUsage(tokenCount, 0);
                const updatedCutDataForPrompting = { ...target, directorialIntent: intent, ...regeneratedCut };
                const finalImagePrompt = calculateFinalPrompt(updatedCutDataForPrompting);
                dispatch({
                    type: 'UPDATE_CUT',
                    payload: {
                        cutNumber,
                        data: {
                            ...regeneratedCut,
                            directorialIntent: intent,
                            imagePrompt: finalImagePrompt,
                            isUpdatingIntent: false
                        }
                    }
                });
            }
        } catch (e) {
            console.error("Failed to update cut intent:", e);
            addNotification(`컷 #${cutNumber} 연출 의도 업데이트 실패`, 'error');
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { isUpdatingIntent: false } } });
        }
    };

    const handleRefineCharacter = (cutNumber: string, name: string) => {
        const charKey = Object.keys(stateRef.current.characterDescriptions).find((k: string) => stateRef.current.characterDescriptions[k].koreanName === name);
        if (!charKey) return;
        const ref = stateRef.current.characterDescriptions[charKey].upscaledImageUrl || (stateRef.current.characterDescriptions[charKey].characterSheetHistory && stateRef.current.characterDescriptions[charKey].characterSheetHistory![stateRef.current.characterDescriptions[charKey].characterSheetHistory!.length - 1]);
        if (!ref) return;
        dispatch({ type: 'START_LOADING', payload: `${name} 얼굴 정제 중...` });
        handleEditImageWithNanoWithRetry(stateRef.current.generatedImageHistory.find((i: any) => i.id === stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: any) => c.cutNumber === cutNumber)?.selectedImageId)?.imageUrl || '', `Maintain face identity from reference. Match hairstyle: ${stateRef.current.characterDescriptions[charKey].hairStyleDescription}`, '', ref).then(res => {
            handleAddUsage(res.tokenCount, 0);
            const newImg = createGeneratedImage({ imageUrl: res.imageUrl, sourceCutNumber: cutNumber, prompt: 'Identity refined', model: stateRef.current.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } });
            dispatch({ type: 'STOP_LOADING' });
        });
    };

    const handleRefineImage = async (cutNumber: string) => {
        dispatch({ type: 'START_LOADING', payload: '이미지 정제 중...' });
        const target = stateRef.current.generatedImageHistory.find((i: any) => i.id === stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: any) => c.cutNumber === cutNumber)?.selectedImageId);
        if (target) {
            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(target.imageUrl, "Transform to high quality chibi illustration style. Clean lines, vibrant colors.", target.prompt);
            handleAddUsage(tokenCount, 0);
            const newImg = createGeneratedImage({ imageUrl: imageUrl, sourceCutNumber: cutNumber, prompt: 'Refined Quality', model: stateRef.current.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } });
        }
        dispatch({ type: 'STOP_LOADING' });
    };

    const handleAddEffectToPrompt = (cutNumber: string, effectPrompt: string) => {};

    const handleRemoveEffectFromPrompt = (cutNumber: string, effectPrompt: string) => {};

    const handleDeleteCut = (cutNumber: string) => dispatch({ type: 'DELETE_CUT', payload: cutNumber });

    const handleUpdateCut = (cutNumber: string, data: Partial<Cut>) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data } });

    const handleSelectImageForCut = (cutNumber: string, id: string | null) => dispatch({ type: 'SELECT_IMAGE_FOR_CUT', payload: { cutNumber: cutNumber, imageId: id } });

    const handleAssignImageToCut = (cutNumber: string, image: GeneratedImage) => {
        const updated = { ...image, id: window.crypto.randomUUID(), sourceCutNumber: cutNumber };
        dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: updated, cutNumber } });
    };

    const handleUpdateAndFormatNarration = async (cutNumber: string, newNarration: string) => {
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { narration: newNarration, isFormattingNarration: true } } });
        try {
            const { formattedText, tokenCount } = await formatTextWithSemanticBreaks(newNarration);
            handleAddUsage(tokenCount, 0);
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { narration: formattedText, isFormattingNarration: false } } });
        } catch (error) {
            console.error("Narration formatting failed:", error);
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { isFormattingNarration: false } } });
        }
    };

    const handleUpdateCutArtStyle = (cutNumber: string, style: ArtStyle | undefined) => {
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { artStyleOverride: style } } });
    };

    const handleBatchUpdateStyle = (style: ArtStyle, customText: string) => {
        dispatch({ type: 'SET_ART_STYLE', payload: style });
        dispatch({ type: 'SET_CUSTOM_ART_STYLE', payload: customText });

        if (stateRef.current.editableStoryboard) {
            addNotification(`화풍이 '${style}'로 변경되었습니다. '검수 완료'를 누르면 새 스타일이 적용됩니다.`, 'success');
        }
    };

    const handleUploadImageForCut = (cutNumber: string, file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const newImg = createGeneratedImage({ imageUrl: e.target?.result as string, sourceCutNumber: cutNumber, prompt: 'User Upload', model: stateRef.current.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } });
        };
        reader.readAsDataURL(file);
    };

    // --- Studio edit handlers (that operate on cuts via studio) ---

    const handleEditInStudio = async (sId: 'a' | 'b', img: GeneratedImage, p: string, ref: string | null, mask?: string, override?: string) => {
        dispatch({ type: 'START_LOADING', payload: '이미지 수정 중...' });
        try {
            const finalSourceCut = override || stateRef.current.studioSessions[sId].sourceCutForNextEdit || img.sourceCutNumber;
            const cut = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: any) => c.cutNumber === finalSourceCut);
            const styleToUse = cut?.artStyleOverride || stateRef.current.artStyle;
            const artStylePrompt = getArtStylePrompt(styleToUse);

            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(img.imageUrl, p, img.prompt, ref || undefined, mask, undefined, false, artStylePrompt);
            handleAddUsage(tokenCount, 0);

            const newImg = createGeneratedImage({ imageUrl, sourceCutNumber: finalSourceCut, prompt: p, model: stateRef.current.selectedNanoModel });

            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: finalSourceCut } });
            dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { currentImage: newImg, history: [...stateRef.current.studioSessions[sId].history, newImg] } } });
        }
        catch (e) { addNotification('수정 실패', 'error'); } finally { dispatch({ type: 'STOP_LOADING' }); }
    };

    const handleCreateInStudio = async (sId: 'a' | 'b', base: GeneratedImage, p: string) => {
        dispatch({ type: 'START_LOADING', payload: '이미지 생성 중...' });
        try {
            const finalSourceCut = stateRef.current.studioSessions[sId].sourceCutForNextEdit || 'custom';
            const cut = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: any) => c.cutNumber === finalSourceCut);
            const styleToUse = cut?.artStyleOverride || stateRef.current.artStyle;
            const artStylePrompt = getArtStylePrompt(styleToUse);

            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(base.imageUrl, p, base.prompt, undefined, undefined, undefined, true, artStylePrompt);
            handleAddUsage(tokenCount, 0);

            const newImg = createGeneratedImage({ imageUrl, sourceCutNumber: finalSourceCut, prompt: p, model: stateRef.current.selectedNanoModel });

            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: finalSourceCut } });
            dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { currentImage: newImg, history: [...stateRef.current.studioSessions[sId].history, newImg] } } });
        }
        catch (e) { addNotification('생성 실패', 'error'); } finally { dispatch({ type: 'STOP_LOADING' }); }
    };

    const handleConfirmCutAssignment = (cutNumber: string) => {
        const img = stateRef.current.imageToAssign;
        if (img) {
            const updated = { ...img, id: window.crypto.randomUUID(), sourceCutNumber: cutNumber };
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: updated, cutNumber } });
            updateUIState({ isCutAssignmentModalOpen: false, imageToAssign: null });
        }
    };

    const handleOpenTargetCutSelector = (sId: 'a' | 'b') => updateUIState({ isTargetCutSelectionModalOpen: true, targetCutSelectionStudioId: sId });

    const handleConfirmTargetCutSelection = (cutNumber: string) => {
        const studioId = stateRef.current.targetCutSelectionStudioId;
        if (studioId) {
            const session = stateRef.current.studioSessions[studioId];

            const nextHistory = session.history.map((img: GeneratedImage) => ({ ...img, sourceCutNumber: cutNumber }));
            const nextCurrent = session.currentImage ? { ...session.currentImage, sourceCutNumber: cutNumber } : null;
            const nextOriginal = session.originalImage ? { ...session.originalImage, sourceCutNumber: cutNumber } : null;

            dispatch({
                type: 'UPDATE_STUDIO_SESSION',
                payload: {
                    studioId: studioId,
                    data: {
                        sourceCutForNextEdit: cutNumber,
                        history: nextHistory,
                        currentImage: nextCurrent,
                        originalImage: nextOriginal
                    }
                }
            });
            updateUIState({ isTargetCutSelectionModalOpen: false, targetCutSelectionStudioId: null });
        }
    };

    return {
        handleUpdateCutCharacters,
        handleUpdateCutIntent,
        handleUpdateCutFieldAndRegenerate,
        handleUpdateCutIntentAndRegenerate,
        handleRefineCharacter,
        handleRefineImage,
        handleAddEffectToPrompt,
        handleRemoveEffectFromPrompt,
        handleDeleteCut,
        handleUpdateCut,
        handleSelectImageForCut,
        handleAssignImageToCut,
        handleUpdateAndFormatNarration,
        handleUpdateCutArtStyle,
        handleBatchUpdateStyle,
        handleUploadImageForCut,
        handleEditInStudio,
        handleCreateInStudio,
        handleConfirmCutAssignment,
        handleOpenTargetCutSelector,
        handleConfirmTargetCutSelection,
    };
}
