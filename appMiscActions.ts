
import {
    replaceBackground, outpaintImageWithNano, fillImageWithNano,
    generateCharacterMask, renderTextOnImage,
} from './services/geminiService';
import {
    AppAction, GeneratedImage, TextEditingTarget, ArtStyle,
} from './types';
import { UIState } from './appTypes';
import { createGeneratedImage } from './appUtils';

// --- Helper types ---

export interface MiscActionHelpers {
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
}

// --- Factory ---

export function createMiscActions(h: MiscActionHelpers) {
    const {
        dispatch,
        stateRef,
        addNotification,
        handleAddUsage,
        handleEditImageWithNanoWithRetry,
        getVisionModelName,
        updateUIState,
    } = h;

    // handleReplaceBackground — calls replaceBackground service (currently a stub)
    const handleReplaceBackground = async (newBackgroundPrompt: string, cutNumber: string) => {
        // Stub — no-op, matches original behaviour
    };

    // handleThirdCharacterEdit — calls handleEditImageWithNanoWithRetry with character swap prompt
    const handleThirdCharacterEdit = async (baseImage: GeneratedImage, referenceImage: GeneratedImage, characterToReplace: string) => {
        dispatch({ type: 'START_LOADING', payload: '제3인물 교체 중...' });
        try {
            const editPrompt = `Replace the character "${characterToReplace}" with the character from the reference image. Maintain the original background and art style.`;
            const res = await handleEditImageWithNanoWithRetry(baseImage.imageUrl, editPrompt, baseImage.prompt, referenceImage.imageUrl);
            const newImg = createGeneratedImage({ imageUrl: res.imageUrl, sourceCutNumber: baseImage.sourceCutNumber, prompt: editPrompt, model: stateRef.current.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: baseImage.sourceCutNumber } });
            updateUIState({ isThirdCharacterStudioOpen: false });
            addNotification('제3인물 교체가 완료되었습니다.', 'success');
        } catch (e) { addNotification('교체 실패', 'error'); } finally { dispatch({ type: 'STOP_LOADING' }); }
    };

    // handleOutpaintImageWithNanoWithRetry — retry wrapper for outpaint
    const handleOutpaintImageWithNanoWithRetry = async (baseImageUrl: string, direction: 'up' | 'down' | 'left' | 'right', originalPrompt?: string) => {
        let attempt = 0;
        const maxAttempts = 3;
        while (attempt < maxAttempts) {
            try {
                const res = await outpaintImageWithNano(baseImageUrl, direction, getVisionModelName(), originalPrompt);
                handleAddUsage(res.tokenCount, 0);
                return { imageUrl: res.imageUrl, textResponse: res.textResponse, tokenCount: res.tokenCount };
            } catch (error: any) {
                attempt++;
                const isServerError = error.message && (error.message.includes('500') || error.message.includes('503') || error.message.includes('429') || error.message.includes('Internal error') || error.message.includes('Service Unavailable') || error.message.includes('Too Many Requests'));
                if (isServerError && attempt < maxAttempts) {
                    console.warn(`[handleOutpaintImageWithNanoWithRetry] Server/Rate limit error encountered. Retrying attempt ${attempt} of ${maxAttempts}...`, error);
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                } else {
                    throw error;
                }
            }
        }
        throw new Error("Maximum retry attempts reached.");
    };

    // handleFillImageWithNanoWithRetry — retry wrapper for fill
    const handleFillImageWithNanoWithRetry = async (baseImageUrl: string, originalPrompt?: string, maskBase64?: string) => {
        let attempt = 0;
        const maxAttempts = 3;
        while (attempt < maxAttempts) {
            try {
                const res = await fillImageWithNano(baseImageUrl, getVisionModelName(), originalPrompt, maskBase64);
                handleAddUsage(res.tokenCount, 0);
                return { imageUrl: res.imageUrl, tokenCount: res.tokenCount };
            } catch (error: any) {
                attempt++;
                const isServerError = error.message && (error.message.includes('500') || error.message.includes('503') || error.message.includes('429') || error.message.includes('Internal error') || error.message.includes('Service Unavailable') || error.message.includes('Too Many Requests'));
                if (isServerError && attempt < maxAttempts) {
                    console.warn(`[handleFillImageWithNanoWithRetry] Server/Rate limit error encountered. Retrying attempt ${attempt} of ${maxAttempts}...`, error);
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                } else {
                    throw error;
                }
            }
        }
        throw new Error("Maximum retry attempts reached.");
    };

    // handleStudioRefill — calls fill on studio session (currently a stub)
    const handleStudioRefill = (sId: 'a' | 'b') => Promise.resolve();

    // handleGenerateMask — calls generateCharacterMask
    const handleGenerateMask = async (url: string) => {
        const res = await generateCharacterMask(url, getVisionModelName());
        if (res) handleAddUsage(res.tokenCount, 0);
        return res?.imageUrl || null;
    };

    // handleTextRender — calls renderTextOnImage
    const handleTextRender = async (target: TextEditingTarget, text: string, type: 'speech' | 'narration', char?: string) => {
        dispatch({ type: 'START_LOADING', payload: '텍스트 렌더링 중...' });
        try {
            const { imageUrl, tokenCount } = await renderTextOnImage({ ...target, text, textType: type, characterName: char }, getVisionModelName());
            handleAddUsage(tokenCount, 0);
            const newImg = createGeneratedImage({ imageUrl, sourceCutNumber: target.cutNumber, prompt: text, model: stateRef.current.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: target.cutNumber } });
        } finally {
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    return {
        handleReplaceBackground,
        handleThirdCharacterEdit,
        handleOutpaintImageWithNanoWithRetry,
        handleFillImageWithNanoWithRetry,
        handleStudioRefill,
        handleGenerateMask,
        handleTextRender,
    };
}
