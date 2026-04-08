// appCutEditActions.ts — Studio 편집/생성 + 컷 필드 수정 액션 (AppContext에서 분리)

import type { AppAction, Cut, GeneratedImage, ArtStyle } from './types';
import { buildFinalPrompt, PromptContext } from './appStyleEngine';
import { regenerateCutFieldsForIntentChange } from './services/geminiService';
import { getEngineFromModel, createGeneratedImage, buildMechanicalOutfit } from './appUtils';

export interface CutEditActionHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: any };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; callback: () => void }) => void;
    handleAddUsage: (tokens: number, source: 'gemini' | 'claude') => void;
    calculateFinalPrompt: (cut: any) => string;
    getArtStylePrompt: (overrideStyle?: ArtStyle) => string;
    getVisionModelName: () => string;
    handleEditImageWithNanoWithRetry: (...args: any[]) => Promise<{ imageUrl: string; textResponse: string; tokenCount: number }>;
    persistImageToDisk: (base64Url: string, cutNumber: string, imageId: string) => Promise<string | undefined>;
    updateUIState: (update: any) => void;
}

export function createCutEditActions(h: CutEditActionHelpers) {
    const { dispatch, stateRef, addNotification, handleAddUsage, calculateFinalPrompt, getArtStylePrompt, getVisionModelName, handleEditImageWithNanoWithRetry, persistImageToDisk, updateUIState } = h;

    const handleEditForCut = async (cutNumber: string, img: GeneratedImage, p: string, refs: string[], mask?: string) => {
        const finalSourceCut = cutNumber || img.sourceCutNumber;
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: finalSourceCut, data: { imageLoading: true } } });
        try {
            const cut = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: Cut) => c.cutNumber === finalSourceCut);
            const styleToUse = cut?.artStyleOverride || stateRef.current.artStyle;
            const artStylePrompt = getArtStylePrompt(styleToUse);

            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(img.imageUrl, p, cut ? calculateFinalPrompt(cut) : img.prompt, refs.length > 0 ? refs : undefined, mask, undefined, false, artStylePrompt);
            handleAddUsage(tokenCount, 'gemini');

            const imgId = window.crypto.randomUUID();
            const localPath = await persistImageToDisk(imageUrl, finalSourceCut, imgId);
            const newImg = createGeneratedImage({ id: imgId, imageUrl, localPath, sourceCutNumber: finalSourceCut, prompt: p, model: stateRef.current.selectedNanoModel });

            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: finalSourceCut } });
        } catch { addNotification('수정 실패', 'error', { label: '재시도', callback: () => handleEditForCut(cutNumber, img, p, refs, mask) }); }
        finally { dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: finalSourceCut, data: { imageLoading: false } } }); }
    };

    // Legacy wrapper — 기존 호출부 호환
    const handleEditInStudio = async (_sId: 'a', img: GeneratedImage, p: string, refs: string[], mask?: string, override?: string) => {
        await handleEditForCut(override || img.sourceCutNumber, img, p, refs, mask);
    };

    const handleCreateForCut = async (cutNumber: string, base: GeneratedImage, p: string) => {
        const finalSourceCut = cutNumber || 'custom';
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: finalSourceCut, data: { imageLoading: true } } });
        try {
            const cut = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: Cut) => c.cutNumber === finalSourceCut);
            const styleToUse = cut?.artStyleOverride || stateRef.current.artStyle;
            const artStylePrompt = getArtStylePrompt(styleToUse);

            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(base.imageUrl, p, cut ? calculateFinalPrompt(cut) : base.prompt, undefined, undefined, undefined, true, artStylePrompt);
            handleAddUsage(tokenCount, 'gemini');

            const imgId = window.crypto.randomUUID();
            const localPath = await persistImageToDisk(imageUrl, finalSourceCut, imgId);
            const newImg = createGeneratedImage({ id: imgId, imageUrl, localPath, sourceCutNumber: finalSourceCut, prompt: p, model: stateRef.current.selectedNanoModel });

            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: finalSourceCut } });
        } catch { addNotification('생성 실패', 'error', { label: '재시도', callback: () => handleCreateForCut(cutNumber, base, p) }); }
        finally { dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: finalSourceCut, data: { imageLoading: false } } }); }
    };

    // Legacy wrapper — 기존 호출부 호환
    const handleCreateInStudio = async (_sId: 'a', base: GeneratedImage, p: string) => {
        await handleCreateForCut(base.sourceCutNumber || 'custom', base, p);
    };

    const handleUpdateCutCharacters = async (cutNumber: string, names: string[]) => {
        const target = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: Cut) => c.cutNumber === cutNumber);
        const { characterDescriptions } = stateRef.current;
        if (target) {
            const mechanicalOutfit = buildMechanicalOutfit(names, characterDescriptions, target.location);
            const nextCut = { ...target, characters: names, characterOutfit: mechanicalOutfit };
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { characters: names, characterOutfit: mechanicalOutfit, imagePrompt: calculateFinalPrompt(nextCut) } } });
        }
    };

    const handleUpdateCutIntent = async (cutNumber: string, intent: string) => {
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { directorialIntent: intent, isUpdatingIntent: true } } });
        try {
            const { characterDescriptions } = stateRef.current;
            const target = stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: Cut) => c.cutNumber === cutNumber);
            if (target) {
                const { regeneratedCut, tokenCount } = await regenerateCutFieldsForIntentChange(target, intent, characterDescriptions);
                handleAddUsage(tokenCount, 'claude');
                const updatedCutDataForPrompting = { ...target, directorialIntent: intent, ...regeneratedCut };
                const finalImagePrompt = calculateFinalPrompt(updatedCutDataForPrompting);
                dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { ...regeneratedCut, directorialIntent: intent, imagePrompt: finalImagePrompt, isUpdatingIntent: false } } });
            }
        } catch (e) {
            console.error("Failed to update cut intent:", e);
            addNotification(`컷 #${cutNumber} 연출 의도 업데이트 실패`, 'error');
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { isUpdatingIntent: false } } });
        }
    };

    const handleRefineCharacter = (cutNumber: string, name: string) => {
        const charKey = Object.keys(stateRef.current.characterDescriptions).find((k: string) => { const cd = stateRef.current.characterDescriptions[k]; return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name; });
        if (!charKey) return;
        const charDesc = stateRef.current.characterDescriptions[charKey];
        const ref = charDesc.upscaledImageUrl || (charDesc.characterSheetHistory && charDesc.characterSheetHistory[charDesc.characterSheetHistory.length - 1]);
        if (!ref) return;
        dispatch({ type: 'START_LOADING', payload: `${name} 얼굴 정제 중...` });
        const selectedImg = stateRef.current.generatedImageHistory.find((i: GeneratedImage) => i.id === stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: Cut) => c.cutNumber === cutNumber)?.selectedImageId);
        handleEditImageWithNanoWithRetry(selectedImg?.imageUrl || '', `Maintain face identity from reference. Match hairstyle: ${charDesc.hairStyleDescription}`, '', [ref]).then(res => {
            handleAddUsage(res.tokenCount, 'gemini');
            const newImg = createGeneratedImage({ imageUrl: res.imageUrl, sourceCutNumber: cutNumber, prompt: 'Identity refined', model: stateRef.current.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } });
            dispatch({ type: 'STOP_LOADING' });
        });
    };

    const handleRefineImage = async (cutNumber: string) => {
        dispatch({ type: 'START_LOADING', payload: '이미지 정제 중...' });
        const target = stateRef.current.generatedImageHistory.find((i: GeneratedImage) => i.id === stateRef.current.generatedContent?.scenes.flatMap((s: any) => s.cuts).find((c: Cut) => c.cutNumber === cutNumber)?.selectedImageId);
        if (target) {
            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(target.imageUrl, "Transform to high quality chibi illustration style. Clean lines, vibrant colors.", target.prompt);
            handleAddUsage(tokenCount, 'gemini');
            const newImg = createGeneratedImage({ imageUrl, sourceCutNumber: cutNumber, prompt: 'Refined Quality', model: stateRef.current.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } });
        }
        dispatch({ type: 'STOP_LOADING' });
    };

    const handleThirdCharacterEdit = async (baseImage: GeneratedImage, referenceImage: GeneratedImage, characterToReplace: string) => {
        dispatch({ type: 'START_LOADING', payload: '제3인물 교체 중...' });
        try {
            const editPrompt = `Replace the character "${characterToReplace}" with the character from the reference image. Maintain the original background and art style.`;
            const res = await handleEditImageWithNanoWithRetry(baseImage.imageUrl, editPrompt, baseImage.prompt, [referenceImage.imageUrl]);
            const newImg = createGeneratedImage({ imageUrl: res.imageUrl, sourceCutNumber: baseImage.sourceCutNumber, prompt: editPrompt, model: stateRef.current.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: baseImage.sourceCutNumber } });
            updateUIState({ isThirdCharacterStudioOpen: false });
            addNotification('제3인물 교체가 완료되었습니다.', 'success');
        } catch { addNotification('교체 실패', 'error'); }
        finally { dispatch({ type: 'STOP_LOADING' }); }
    };

    return {
        handleEditInStudio,
        handleCreateInStudio,
        handleEditForCut,
        handleCreateForCut,
        handleUpdateCutCharacters,
        handleUpdateCutIntent,
        handleRefineCharacter,
        handleRefineImage,
        handleThirdCharacterEdit,
    };
}
