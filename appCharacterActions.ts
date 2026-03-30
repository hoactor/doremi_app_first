import { AppAction, CharacterDescription } from './types';
import {
    analyzeHairStyle,
    upscaleImageWithNano,
    injectPersonalityAndCreateSignaturePose,
    generateOutfitsForLocations,
    generateOutfitImage,
    regenerateOutfitDescription,
} from './services/geminiService';

export interface CharacterActionHelpers {
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
    getArtStylePrompt: (overrideStyle?: any, overrideCustomText?: string) => string;
    getVisionModelName: () => string;
}

export function createCharacterActions(h: CharacterActionHelpers) {
    const { dispatch, stateRef, addNotification, handleAddUsage, handleEditImageWithNanoWithRetry, getArtStylePrompt, getVisionModelName } = h;

    const handleAllCharacterHairAnalysis = async (characterKey: string, imageUrl: string) => {
        // Empty stub - matches original implementation
    };

    const handleUploadSourceImageForStudio = async (key: string, file: File) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { sourceImageUrl: e.target?.result as string, isAnalyzingHair: true } } });
            try {
                const charName = stateRef.current.characterDescriptions[key]?.koreanName || key;
                const res = await analyzeHairStyle(e.target?.result as string, charName);
                handleAddUsage(res.tokenCount, 0);
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { hairStyleDescription: res.hairDescription, facialFeatures: res.facialFeatures, isAnalyzingHair: false } } });
            } catch (error) {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isAnalyzingHair: false } } });
                addNotification('비주얼 DNA 분석에 실패했습니다.', 'error');
            }
        };
        reader.readAsDataURL(file);
    };

    const handleUploadUpscaledImageForStudio = async (key: string, file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { upscaledImageUrl: e.target?.result as string } } });
        reader.readAsDataURL(file);
    };

    const handleUpscaleCharacterImage = async (key: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        if (!char.sourceImageUrl) return;
        dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isUpscaling: true } } });
        try {
            const { imageUrl, tokenCount } = await upscaleImageWithNano(char.sourceImageUrl, getVisionModelName());
            handleAddUsage(tokenCount, 0);
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { upscaledImageUrl: imageUrl } } });
        } finally {
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isUpscaling: false } } });
        }
    };

    const handleInjectPersonality = async (key: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        if (!char.upscaledImageUrl) return;
        dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isInjectingPersonality: true } } });
        try {
            const { imageUrl, tokenCount } = await injectPersonalityAndCreateSignaturePose(char.upscaledImageUrl, char, getVisionModelName(), getArtStylePrompt());
            handleAddUsage(tokenCount, 0);
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: [imageUrl] } } });
        } finally {
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isInjectingPersonality: false } } });
        }
    };

    const handleEditSignaturePose = async (key: string, p: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        const current = char.characterSheetHistory?.[char.characterSheetHistory.length - 1];
        if (!current) return;
        dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isEditingSheet: true } } });
        try {
            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(current, p, '', char.upscaledImageUrl);
            handleAddUsage(tokenCount, 0);
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: [...(char.characterSheetHistory || []), imageUrl] } } });
        } finally {
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isEditingSheet: false } } });
        }
    };

    const handleUndoSignaturePoseEdit = (key: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        if (char.characterSheetHistory && char.characterSheetHistory.length > 1) {
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: char.characterSheetHistory.slice(0, -1) } } });
        }
    };

    const handleEditMannequin = async (key: string, p: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        const current = char.mannequinImageUrl || (char.characterSheetHistory ? char.characterSheetHistory[char.characterSheetHistory.length - 1] : null);
        if (!current) return;
        dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: true } } });
        try {
            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(current, p, '', char.upscaledImageUrl);
            handleAddUsage(tokenCount, 0);
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { mannequinImageUrl: imageUrl, mannequinHistory: [...(char.mannequinHistory || []), imageUrl] } } });
        } finally {
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: false } } });
        }
    };

    const handleUndoMannequin = (key: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        if (char.mannequinHistory && char.mannequinHistory.length > 0) {
            const newHistory = char.mannequinHistory.slice(0, -1);
            const prevUrl = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { mannequinImageUrl: prevUrl, mannequinHistory: newHistory } } });
        }
    };

    const handleGenerateLocationOutfits = async (key: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        if (!char) return;
        dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isGeneratingLocationOutfits: true } } });
        try {
            const locs = Object.keys(char.locations || {});
            // Note: passing empty string for signatureOutfitDescription is intentional as we are now pure English based
            const { locationOutfits, tokenCount } = await generateOutfitsForLocations(char.koreanName, char.gender, '', locs);
            handleAddUsage(tokenCount, 0);
            // Populate both with the English result to maintain structure compatibility
            const newK = { ...char.koreanLocations };
            const newE = { ...char.locations };
            Object.entries(locationOutfits).forEach(([l, o]) => { newK[l] = o; newE[l] = o; });
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { koreanLocations: newK, locations: newE } } });
        } finally {
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isGeneratingLocationOutfits: false } } });
        }
    };

    const handleGenerateOutfitImage = async (key: string, loc: string, desc: string) => {
        dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageLoading: true } } });
        try {
            const { imageUrl, tokenCount } = await generateOutfitImage(desc, getVisionModelName());
            handleAddUsage(tokenCount, 0);
            dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageUrl, imageLoading: false } } });
        } catch (e) {
            dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageLoading: false } } });
        }
    };

    const handleTryOnOutfit = async (key: string, kor: string, eng: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        const current = char.characterSheetHistory?.[char.characterSheetHistory.length - 1];
        if (!current) return;
        dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: true } } });
        try {
            const prompt = `Change character's clothes to: ${eng}. Keep identity.`;
            const { imageUrl, tokenCount = 0 } = await handleEditImageWithNanoWithRetry(current, prompt, '', char.upscaledImageUrl);
            handleAddUsage(tokenCount, 0);
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { mannequinImageUrl: imageUrl, mannequinHistory: [...(char.mannequinHistory || []), imageUrl] } } });
        } finally {
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: false } } });
        }
    };

    const handleModifyOutfitDescription = async (key: string, loc: string, req: string) => {
        const char: CharacterDescription = stateRef.current.characterDescriptions[key];
        if (!char) return;
        dispatch({ type: 'SET_OUTFIT_MODIFICATION_STATE', payload: { characterKey: key, location: loc, isLoading: true } });
        try {
            // Pass English description as original
            const { newDescription, tokenCount } = await regenerateOutfitDescription(char.locations[loc], req, char.koreanName, char.gender);
            handleAddUsage(tokenCount, 0);
            // Update both fields with the new English description
            dispatch({ type: 'UPDATE_LOCATION_OUTFIT', payload: { characterKey: key, location: loc, korean: newDescription, english: newDescription } });
        } finally {
            dispatch({ type: 'SET_OUTFIT_MODIFICATION_STATE', payload: { characterKey: key, location: loc, isLoading: false } });
        }
    };

    return {
        handleAllCharacterHairAnalysis,
        handleUploadSourceImageForStudio,
        handleUploadUpscaledImageForStudio,
        handleUpscaleCharacterImage,
        handleInjectPersonality,
        handleEditSignaturePose,
        handleUndoSignaturePoseEdit,
        handleEditMannequin,
        handleUndoMannequin,
        handleGenerateLocationOutfits,
        handleGenerateOutfitImage: handleGenerateOutfitImage as (key: string, loc: string, desc: string) => Promise<void>,
        handleTryOnOutfit,
        handleModifyOutfitDescription,
    };
}
