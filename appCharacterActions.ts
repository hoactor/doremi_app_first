// appCharacterActions.ts — 캐릭터 스튜디오 액션 (AppContext에서 분리)

import type { AppAction, ArtStyle } from './types';
import {
    analyzeHairStyle, upscaleImageWithNano, injectPersonalityAndCreateSignaturePose,
    generateOutfitsForLocations, generateOutfitImage, regenerateOutfitDescription,
} from './services/geminiService';
import { buildMechanicalOutfit } from './appUtils';

export interface CharacterActionHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: any };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; callback: () => void }) => void;
    handleAddUsage: (tokens: number, source: 'gemini' | 'claude') => void;
    getVisionModelName: () => string;
    getArtStylePrompt: (overrideStyle?: ArtStyle) => string;
    calculateFinalPrompt: (cut: any) => string;
    handleEditImageWithNanoWithRetry: (...args: any[]) => Promise<{ imageUrl: string; textResponse: string; tokenCount: number }>;
    updateUIState: (update: any) => void;
}

export function createCharacterActions(h: CharacterActionHelpers) {
    const { dispatch, stateRef, addNotification, handleAddUsage, getVisionModelName, getArtStylePrompt, calculateFinalPrompt, handleEditImageWithNanoWithRetry, updateUIState } = h;

    return {
        handleApplyCharacterChangesToAllCuts: async () => {
            const { generatedContent, characterDescriptions } = stateRef.current;
            if (!generatedContent) return;
            const updatedScenes = generatedContent.scenes.map((scene: any) => ({
                ...scene,
                cuts: scene.cuts.map((cut: any) => {
                    const newOutfit = buildMechanicalOutfit(cut.characters || [], characterDescriptions, cut.location) || cut.characterOutfit;
                    const updatedCut = { ...cut, characterOutfit: newOutfit };
                    updatedCut.imagePrompt = calculateFinalPrompt(updatedCut);
                    return updatedCut;
                })
            }));
            dispatch({ type: 'SET_GENERATED_CONTENT', payload: { ...generatedContent, scenes: updatedScenes } });
            updateUIState({ isCostumeModalOpen: false });
            addNotification('의상 변경사항이 적용되었습니다. 원하는 컷을 선택하여 다시 생성해주세요.', 'success');
        },

        handleUploadSourceImageForStudio: async (key: string, file: File) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { sourceImageUrl: e.target?.result as string, isAnalyzingHair: true } } });
                try {
                    const charName = stateRef.current.characterDescriptions[key]?.koreanName || key;
                    const res = await analyzeHairStyle(e.target?.result as string, charName);
                    handleAddUsage(res.tokenCount, 'claude');
                    dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { hairStyleDescription: res.hairDescription, facialFeatures: res.facialFeatures, isAnalyzingHair: false } } });
                } catch {
                    dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isAnalyzingHair: false } } });
                    addNotification('비주얼 DNA 분석에 실패했습니다.', 'error');
                }
            };
            reader.readAsDataURL(file);
        },

        handleUploadUpscaledImageForStudio: async (key: string, file: File) => {
            const reader = new FileReader();
            reader.onload = (e) => dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { upscaledImageUrl: e.target?.result as string } } });
            reader.readAsDataURL(file);
        },

        handleUpscaleCharacterImage: async (key: string) => {
            const char = stateRef.current.characterDescriptions[key];
            if (!char.sourceImageUrl) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isUpscaling: true } } });
            try {
                const { imageUrl, tokenCount } = await upscaleImageWithNano(char.sourceImageUrl, getVisionModelName(), undefined, stateRef.current.imageRatio || '1:1');
                handleAddUsage(tokenCount, 'gemini');
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { upscaledImageUrl: imageUrl } } });
                addNotification('이미지 업스케일 완료!', 'success');
            } catch (error: any) {
                console.error('Upscale failed:', error);
                addNotification(`업스케일 실패: ${error.message || '알 수 없는 오류'}`, 'error');
            } finally {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isUpscaling: false } } });
            }
        },

        handleInjectPersonality: async (key: string) => {
            const char = stateRef.current.characterDescriptions[key];
            if (!char.upscaledImageUrl) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isInjectingPersonality: true } } });
            try {
                const { imageUrl, tokenCount } = await injectPersonalityAndCreateSignaturePose(char.upscaledImageUrl, char, getVisionModelName(), getArtStylePrompt(), undefined, stateRef.current.imageRatio || '1:1');
                handleAddUsage(tokenCount, 'gemini');
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: [imageUrl] } } });
            } finally {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isInjectingPersonality: false } } });
            }
        },

        handleEditSignaturePose: async (key: string, p: string) => {
            const char = stateRef.current.characterDescriptions[key];
            const current = char.characterSheetHistory?.[char.characterSheetHistory.length - 1];
            if (!current) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isEditingSheet: true } } });
            try {
                const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(current, p, '', char.upscaledImageUrl ? [char.upscaledImageUrl] : undefined);
                handleAddUsage(tokenCount, 'gemini');
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: [...(char.characterSheetHistory || []), imageUrl] } } });
            } finally {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isEditingSheet: false } } });
            }
        },

        handleUndoSignaturePoseEdit: (key: string) => {
            const char = stateRef.current.characterDescriptions[key];
            if (char.characterSheetHistory && char.characterSheetHistory.length > 1) {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: char.characterSheetHistory.slice(0, -1) } } });
            }
        },

        handleEditMannequin: async (key: string, p: string) => {
            const char = stateRef.current.characterDescriptions[key];
            const current = char.mannequinImageUrl || (char.characterSheetHistory ? char.characterSheetHistory[char.characterSheetHistory.length - 1] : null);
            if (!current) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: true } } });
            try {
                const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(current, p, '', char.upscaledImageUrl ? [char.upscaledImageUrl] : undefined);
                handleAddUsage(tokenCount, 'gemini');
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { mannequinImageUrl: imageUrl, mannequinHistory: [...(char.mannequinHistory || []), imageUrl] } } });
            } finally {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: false } } });
            }
        },

        handleUndoMannequin: (key: string) => {
            const char = stateRef.current.characterDescriptions[key];
            if (char.mannequinHistory && char.mannequinHistory.length > 0) {
                const newHistory = char.mannequinHistory.slice(0, -1);
                const prevUrl = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { mannequinImageUrl: prevUrl, mannequinHistory: newHistory } } });
            }
        },

        handleGenerateLocationOutfits: async (key: string) => {
            const char = stateRef.current.characterDescriptions[key];
            if (!char) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isGeneratingLocationOutfits: true } } });
            try {
                const allLocs = Object.keys(char.locations || {});
                const emptyLocs = allLocs.filter((l: string) => !char.locations?.[l]?.trim());
                if (emptyLocs.length === 0) {
                    addNotification('모든 장소에 이미 의상이 설정되어 있습니다.', 'info');
                    return;
                }
                const existingOutfitsContext = allLocs
                    .filter((l: string) => char.locations?.[l]?.trim())
                    .map((l: string) => `${l}: ${char.locations![l]}`)
                    .join('; ');
                const contextNote = existingOutfitsContext ? ` (Existing outfits for tone consistency: ${existingOutfitsContext})` : '';
                const { locationOutfits, tokenCount } = await generateOutfitsForLocations(char.koreanName, char.gender, contextNote, emptyLocs);
                handleAddUsage(tokenCount, 'claude');
                const newK = { ...char.koreanLocations };
                const newE = { ...char.locations };
                Object.entries(locationOutfits).forEach(([l, o]) => { newK[l] = o; newE[l] = o; });
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { koreanLocations: newK, locations: newE } } });
            } finally {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isGeneratingLocationOutfits: false } } });
            }
        },

        handleGenerateOutfitImage: async (key: string, loc: string, desc: string) => {
            dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageLoading: true } } });
            try {
                const { imageUrl, tokenCount } = await generateOutfitImage(desc, getVisionModelName(), undefined, stateRef.current.imageRatio || '1:1');
                handleAddUsage(tokenCount, 'gemini');
                dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageUrl, imageLoading: false } } });
            } catch {
                dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageLoading: false } } });
            }
        },

        handleTryOnOutfit: async (key: string, _kor: string, eng: string) => {
            const char = stateRef.current.characterDescriptions[key];
            const current = char.characterSheetHistory?.[char.characterSheetHistory.length - 1];
            if (!current) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: true } } });
            try {
                const prompt = `Change character's clothes to: ${eng}. Keep identity.`;
                const { imageUrl, tokenCount = 0 } = await handleEditImageWithNanoWithRetry(current, prompt, '', char.upscaledImageUrl ? [char.upscaledImageUrl] : undefined);
                handleAddUsage(tokenCount, 'gemini');
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { mannequinImageUrl: imageUrl, mannequinHistory: [...(char.mannequinHistory || []), imageUrl] } } });
            } finally {
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: false } } });
            }
        },

        handleModifyOutfitDescription: async (key: string, loc: string, req: string) => {
            const char = stateRef.current.characterDescriptions[key];
            if (!char) return;
            dispatch({ type: 'SET_OUTFIT_MODIFICATION_STATE', payload: { characterKey: key, location: loc, isLoading: true } });
            try {
                const { newDescription, tokenCount } = await regenerateOutfitDescription(char.locations[loc], req, char.koreanName, char.gender);
                handleAddUsage(tokenCount, 'claude');
                dispatch({ type: 'UPDATE_LOCATION_OUTFIT', payload: { characterKey: key, location: loc, korean: newDescription, english: newDescription } });
            } finally {
                dispatch({ type: 'SET_OUTFIT_MODIFICATION_STATE', payload: { characterKey: key, location: loc, isLoading: false } });
            }
        },
    };
}
