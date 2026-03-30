
import {
    enrichScriptWithDirections, analyzeCharacters, editImageWithNano, generateEditableStoryboard,
    generateTitleSuggestions,
    purifyImagePromptForSafety, regenerateCutFieldsForCharacterChange,
    regenerateCutFieldsForIntentChange,
    verifyAndEnrichCutPrompt,
    generateFinalStoryboardFromEditable, generateSpeech,
    regenerateSceneFromModification, extractFieldsFromSceneDescription, regenerateSingleCutDraft, regenerateImagePrompts,
    generateCinematicBlueprint, formatMultipleTextsWithSemanticBreaks, normalizeScriptCuts
} from './services/geminiService';
import React, { createContext, useContext, useReducer, useRef, useEffect, useCallback, useState } from 'react';
import { 
    AppDataState, AppAction, Cut, GeneratedImage, Notification, TextEditingTarget, EditableScene, StudioSession, CharacterDescription, NanoModel, EditableCut, ClosetCharacter, LibraryAsset, Scene, GeneratedScript, ArtStyle
} from './types';
import { loadOpenAiApiKey } from './utils/settingsStorage';
import { UIState, initialUIState } from './appTypes';
import { createInitialStudioSession, sanitizeState, getEngineFromModel } from './appUtils';
import { initialAppDataState, appReducer } from './appReducer';
import JSZip from 'jszip';
import { createCharacterActions } from './appCharacterActions';
import { createCutEditActions } from './appCutEditActions';
import { createGenerationActions } from './appGenerationActions';
import { createMiscActions } from './appMiscActions';
import { AudioSplitterModal } from './components/AudioSplitterModal';
import { get, set } from 'idb-keyval';

// Define ConfettiPiece component locally
const ConfettiPiece: React.FC<{ type: 'fall' | 'explode'; style: React.CSSProperties }> = ({ type, style }) => (
    <div className={`fixed z-[100] pointer-events-none ${type === 'fall' ? 'animate-confetti-fall' : 'animate-confetti-explode'}`} style={style} />
);

interface AppContextType {
    state: AppDataState & UIState;
    dispatch: React.Dispatch<AppAction>;
    actions: {
        setUIState: (update: Partial<UIState>) => void;
        addNotification: (message: string, type: Notification['type']) => void;
        handleAddUsage: (geminiTokens: number, dalleImages: number) => void;
        handleGenerateTitles: () => Promise<void>;
        handleResetState: () => void;
        handleExportProject: () => void;
        handleImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
        handleStartStudio: (overrides?: { artStyle?: ArtStyle, customArtStyle?: string }) => Promise<void>;
        handleConfirmSceneAnalysis: () => void;
        handleRegenerateSceneAnalysis: () => Promise<void>;
        handleGenerateStoryboardWithCustomCostumes: () => Promise<void>;
        handleUploadSourceImageForStudio: (characterKey: string, file: File) => Promise<void>;
        handleUploadUpscaledImageForStudio: (characterKey: string, file: File) => Promise<void>;
        handleUpscaleCharacterImage: (characterKey: string) => Promise<void>;
        handleInjectPersonality: (characterKey: string) => Promise<void>;
        handleEditSignaturePose: (characterKey: string, prompt: string) => Promise<void>;
        handleUndoSignaturePoseEdit: (characterKey: string) => void;
        handleEditMannequin: (characterKey: string, prompt: string) => Promise<void>;
        handleUndoMannequin: (characterKey: string) => void;
        handleGenerateLocationOutfits: (characterKey: string) => Promise<void>;
        handleGenerateOutfitImage: (characterKey: string, location: string, outfitDescription: string) => Promise<void>;
        handleTryOnOutfit: (characterKey: string, outfitKorean: string, outfitEnglish: string) => Promise<void>;
        handleModifyOutfitDescription: (characterKey: string, location: string, userRequest: string) => Promise<void>;
        handleUpdateCutCharacters: (cutNumber: string, newCharacterNames: string[]) => Promise<void>;
        handleUpdateCutIntent: (cutNumber: string, newIntent: string) => Promise<void>;
        handleAnalyzeYoutubeUrl: () => Promise<void>;
        handleEditInStudio: (studioId: 'a' | 'b', imageToEdit: GeneratedImage, editPrompt: string, refUrl: string | null, maskBase64?: string, sourceCutNumberOverride?: string) => Promise<void>;
        handleCreateInStudio: (studioId: 'a' | 'b', baseIdentityImage: GeneratedImage, prompt: string) => Promise<void>;
        handleConfirmCutAssignment: (cutNumber: string) => void;
        handleOpenTargetCutSelector: (studioId: 'a' | 'b') => void;
        handleConfirmTargetCutSelection: (cutNumber: string) => void;
        handleReplaceBackground: (newBackgroundPrompt: string, cutNumber: string) => Promise<void>;
        handleClearStudioSession: (studioId: 'a' | 'b') => void;
        handleRevertInStudio: (studioId: 'a' | 'b') => void;
        handleUndoInStudio: (studioId: 'a' | 'b') => void;
        handleCopyOriginalToCurrent: (studioId: 'a' | 'b') => void;
        handleCopyPromptToStudios: (prompt: string) => void;
        handleCopyPromptToStudio: (studioId: 'a' | 'b', prompt: string) => void;
        handleSaveStudioToHistory: (studioId: 'a' | 'b') => void;
        handleSaveFromEditor: (newImageUrl: string, sourceInfo: GeneratedImage) => void;
        handleStudioReferenceChange: (studioId: 'a' | 'b', url: string | null) => void;
        handleStudioPromptChange: (studioId: 'a' | 'b', prompt: string) => void;
        handleStudioTransformChange: (studioId: 'a' | 'b', zoom: number, pan: { x: number; y: number }) => void;
        handleCommitStudioTransform: (studioId: 'a' | 'b', newImageDataUrl: string) => void;
        handleStudioRefill: (studioId: 'a' | 'b') => Promise<void>;
        handleSendImageToStudio: (image: GeneratedImage) => void;
        handleDeleteFromHistory: (imageId: string) => void;
        handleDownloadAllImagesZip: () => Promise<void>;
        handleCancelZipping: () => void;
        handleDownloadSRT: () => Promise<void>;
        handleCancelSRTGeneration: () => void;
        handleDownloadSelectedImagesZip: () => Promise<void>;
        handleOpenEditor: (info: any) => void;
        handleOpenImageViewer: (url: string, alt: string, prompt?: string) => void;
        handleOpenTextEditor: (cutNumber: string, imageUrl: string, characters: string[]) => void;
        handleDeleteCut: (cutNumber: string) => void;
        handleTextRender: (target: TextEditingTarget, text: string, textType: 'speech' | 'narration', characterName?: string) => Promise<void>;
        handleAutoGenerateImageForCut: (cut: Cut) => void;
        handleApplyAndRunPrompt: (prompt: string, cutNumber: string) => void;
        handleOriginalPromptToActiveStudio: (prompt: string) => void;
        handlePrepareStudioForCut: (cutNumber: string, prompt: string) => void;
        handleUpdateCutFieldAndRegenerate: (cutNumber: string, field: keyof Cut, newValue: string) => Promise<void>;
        handleUpdateCutIntentAndRegenerate: (cutNumber: string, newIntent: string) => Promise<void>;
        handleRefineCharacter: (cutNumber: string, characterName: string) => void;
        handleRefineImage: (cutNumber: string) => Promise<void>;
        handleUserImageUpload: (studioId: 'a' | 'b', imageDataUrl: string) => void;
        handleUpdateStudioImageFromUpload: (studioId: 'a' | 'b', imageDataUrl: string) => void;
        handleUserImageUploadForStudio: (studioId: 'a' | 'b', imageDataUrl: string) => void;
        handleLoadImageIntoStudio: (studioId: 'a' | 'b', image: GeneratedImage) => void;
        handleSetOriginalImage: (studioId: 'a' | 'b', image: GeneratedImage) => void;
        handleSetActiveStudioTarget: (studioId: 'a' | 'b') => void;
        handleToggleAutoGeneration: () => void;
        handleRunSelectiveGeneration: (selectedCutNumbers: string[], overrideContent?: GeneratedScript) => Promise<void>;
        handleRetryFailedCuts: () => Promise<void>;
        handleRunNormalization: (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => Promise<void>;
        handleAttachAudioToCut: (cutNumber: string, file: File) => void;
        handleRemoveAudioFromCut: (cutNumber: string, indexToRemove: number) => void;
        handleUpdateCut: (cutNumber: string, data: Partial<Cut>) => void;
        handleUpdateAndFormatNarration: (cutNumber: string, newNarration: string) => Promise<void>;
        handleSelectImageForCut: (cutNumber: string, id: string | null) => void;
        handleAssignImageToCut: (cutNumber: string, image: GeneratedImage) => void; // NEW
        handleSelectAsset: (asset: LibraryAsset) => void;
        handleSelectAssetForBackground: (asset: LibraryAsset, cutNumber: string) => void;
        handleAllCharacterHairAnalysis: (characterKey: string, imageUrl: string) => Promise<void>;
        handleAddEffectToPrompt: (cutNumber: string, effectPrompt: string) => void;
        handleRemoveEffectFromPrompt: (cutNumber: string, effectPrompt: string) => void;
        handleGenerateMask: (imageUrl: string) => Promise<string | null>;
        handleScrollToCut: (cutNumber: string) => void;
        handleOpenReviewModalForEdit: () => void;
        handleRegenerateStoryboardDraft: () => Promise<void>;
        handleRegenerateSingleCut: (cut: EditableCut) => Promise<Partial<EditableCut> | null>;
        handleOpenReviewModal: (cutNumber: string) => void;
        handleOpenReviewModalForDirectEntry: () => void;
        handleUploadImageForCut: (cutNumber: string, file: File) => void;
        handleOpenCutSplitter: (cut: Cut) => void;
        handleConfirmCutSplit: (originalCut: Cut, splitPoints: { time: number; textIndex: number }[]) => Promise<void>;
        handleConfirmDraftReview: (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => Promise<void>;
        handleOpenGuestSelection: (cutNumber: string) => void;
        handleOpenAudioSplitter: () => void;
        handleConfirmAudioSplit: (processedAudios: { cutNumber: string; audioUrl: string; duration: number }[]) => void;
        handleUploadProjectFile: (file: File) => Promise<void>;
        handleThirdCharacterEdit: (baseImage: GeneratedImage, referenceImage: GeneratedImage, characterToReplace: string) => Promise<void>;
        triggerConfetti: (targetId?: string) => void;
        handleEditImageWithNanoWithRetry: (baseImageUrl: string, editPrompt: string, originalPrompt: string, referenceImageUrl?: string, maskBase64?: string, masterStyleImageUrl?: string, isCreativeGeneration?: boolean, artStylePromptOverride?: string) => Promise<{ imageUrl: string, textResponse: string, tokenCount: number }>;
        handleOutpaintImageWithNanoWithRetry: (baseImageUrl: string, direction: 'up' | 'down' | 'left' | 'right') => Promise<{ imageUrl: string, textResponse: string, tokenCount: number }>;
        handleFillImageWithNanoWithRetry: (baseImageUrl: string) => Promise<{ imageUrl: string, tokenCount: number }>;
        handleUpdateCutArtStyle: (cutNumber: string, style: ArtStyle | undefined) => void;
        handleBatchUpdateStyle: (style: ArtStyle, customText: string) => void;
        handleApplyCharacterChangesToAllCuts: () => Promise<void>;
    };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [appState, dispatch] = useReducer(appReducer, initialAppDataState);
    const [uiState, setUIState] = useState<UIState>(initialUIState);
    const notificationIdCounter = useRef(0);
    const isAutoGeneratingLocalRef = useRef(false);
    const isGeneratingSRTLocalRef = useRef(false);
    const isCancellingZippingLocalRef = useRef(false);
    const zippingAbortControllerRef = useRef<AbortController | null>(null);
    const currentSessionIdRef = useRef<number>(0);
    const isInitializedRef = useRef(false);
    
    // Combined State
    const state = { ...appState, ...uiState };
    const stateRef = useRef(state); // Sync ref for async actions

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    // Auto-Restore on mount
    useEffect(() => {
        const loadSavedState = async () => {
            try {
                const savedState = await get('wvs_auto_save_state');
                if (savedState) {
                    dispatch({ type: 'RESTORE_STATE', payload: savedState });
                    console.log("Auto-restored previous session from IndexedDB.");
                }
            } catch (error) {
                console.error("Failed to restore state from IndexedDB:", error);
            } finally {
                isInitializedRef.current = true;
            }
        };
        loadSavedState();
    }, []);

    // Auto-Save on appState change
    useEffect(() => {
        if (!isInitializedRef.current) return;
        
        // Debounce saving to avoid performance issues on rapid state changes
        const timeoutId = setTimeout(() => {
            set('wvs_auto_save_state', appState).catch(err => {
                console.error("Failed to auto-save state to IndexedDB:", err);
            });
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [appState]);

    useEffect(() => {
        const apiKey = loadOpenAiApiKey();
        if (apiKey) dispatch({ type: 'SET_OPENAI_API_KEY', payload: apiKey });
    }, []);

    const updateUIState = useCallback((update: Partial<UIState>) => {
        setUIState(prev => ({ ...prev, ...update }));
    }, []);

    const addNotification = useCallback((message: string, type: Notification['type']) => {
        const id = notificationIdCounter.current++;
        dispatch({ type: 'ADD_NOTIFICATION', payload: { id, message, type } });
        setTimeout(() => {
            dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
        }, 5000);
    }, []);

    const triggerConfetti = useCallback((targetId?: string) => {
        const pieces: React.ReactElement[] = [];
        const count = 50;
        const colors = ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'];

        let startX = window.innerWidth / 2;
        let startY = window.innerHeight / 2;

        if (targetId) {
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                startX = rect.left + rect.width / 2;
                startY = rect.top + rect.height / 2;
            }
        }

        for (let i = 0; i < count; i++) {
            const type = targetId ? 'explode' : 'fall';
            const style: React.CSSProperties = {
                left: `${startX}px`,
                top: `${startY}px`,
                width: `${Math.random() * 8 + 4}px`,
                height: `${Math.random() * 8 + 4}px`,
                backgroundColor: colors[Math.floor(Math.random() * colors.length)],
                animationDelay: `${type === 'explode' ? 0 : Math.random() * 2}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
            };
            
            if (type === 'explode') {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * 150 + 50;
                (style as any)['--tx'] = `${Math.cos(angle) * distance}px`;
                (style as any)['--ty'] = `${Math.sin(angle) * distance}px`;
            }

            const key = `confetti-${Date.now()}-${i}`;
            pieces.push(<ConfettiPiece key={key} type={type} style={style} />);
        }

        updateUIState({ confetti: [...stateRef.current.confetti, ...pieces] });

        setTimeout(() => {
            updateUIState({
                confetti: stateRef.current.confetti.filter(c => !pieces.some(p => p.key === c.key)),
            });
        }, 3000); 
    }, [updateUIState]);

    const handleAddUsage = useCallback((geminiTokens: number, dalleImages: number) => {
        dispatch({ type: 'ADD_USAGE', payload: { geminiTokens, dalleImages } });
    }, []);

    const getArtStylePrompt = useCallback((overrideStyle?: ArtStyle, overrideCustomText?: string) => {
        const { artStyle, customArtStyle } = stateRef.current;
        const targetStyle = overrideStyle || artStyle;
        const targetCustomText = overrideCustomText !== undefined ? overrideCustomText : customArtStyle;

        const IDENTITY_PROTECTION_CLAUSE = `
# [CRITICAL: IDENTITY PROTECTION]
- **ABSOLUTE PRIORITY:** The facial features (eyes, nose, mouth shape, bone structure) defined in the 'Master Identity DNA' or provided in the reference image MUST be preserved 100%.
- **STYLE vs IDENTITY:** Apply the art style (coloring, lighting, line weight) to the *rendering*, but NEVER change the *geometry* of the character's face.
- **NO BABY FACE:** Do not make adult characters look like toddlers unless specified. Maintain their original age and maturity.
`;

        const COMMON_NEGATIVE = `(nsfw, low quality, worst quality:1.4), (text, signature, watermark:1.3)`;

        const MOE_PROMPT = `
[STYLE: Moe / Super-Deformed]
[COLOR PALETTE]: **Warm & Pastel**. Primary colors: Soft Pink, Cream Yellow, Peach. Avoid dark blacks; use dark browns or deep purples for outlines.
[LIGHTING]: Soft, diffused lighting with a "Bloom" effect. No harsh shadows.
[CHARACTER]: Head-to-body ratio 1:2.5. Large expressive eyes with sparkling highlights.
[VIBE]: Cute, bubbly, energetic, cheerful.`;

        const KYOTO_PROMPT = `
[STYLE: Kyoto Animation / High-Fidelity Anime]
[COLOR PALETTE]: **Cool & Transparent**. Primary colors: Azure Blue, Emerald Green, Pure White. High saturation but distinct "clear air" feel.
[LIGHTING]: Cinematic "Magic Hour" or Bright Daylight. Strong rim lighting (backlight) and lens flares. Detailed light reflections in eyes.
[DETAILS]: Delicate hair strands, intricate background art (Makoto Shinkai style clouds/sky).
[VIBE]: Emotional, nostalgic, high-budget production value.`;

        const VIBRANT_PROMPT = `
[STYLE: Mature Webtoon / Dopamine]
[COLOR PALETTE]: **High Contrast & Deep Saturation**. Primary colors: Royal Blue, Magenta, Gold. Deep, rich shadows (not grey).
[LIGHTING]: Dramatic studio lighting. "Rembrandt" lighting or strong Chiaroscuro. Glossy skin highlights.
[CHARACTER]: Adult proportions (1:7). Sharp jawlines, intense gaze.
[VIBE]: Sexy, intense, dynamic, impactful.`;

        const DALLE_CHIBI_PROMPT = `
[STYLE: Premium High-Detail SD Illustration]
[COLOR PALETTE]: **Warm, Creamy & Glowing**. Use a specific color grading: Soft Amber, Rose Gold, Warm Beige, and Pastel Pink. Avoid cold or dull grey tones. The image should look like it has a "Warm Filter" applied.
[LIGHTING]: **Magical Backlight & Bloom**. Strong rim lighting causing a "halo" effect around the character. Soft "Bloom" filter applied to the whole image. Sparkling particles in the air.
[RENDERING]: High-quality anime illustration. Soft gradients on hair and skin. Glossy eyes with complex reflections. NOT 3D, NOT Clay.
[VIBE]: Romantic, dreamy, cute, "idol merchandise" quality.`;

        const NORMAL_PROMPT = `
[STYLE: Standard Webtoon]
[COLOR PALETTE]: Bright, clean, standard digital art colors.
[LIGHTING]: Even, flat lighting for readability.
[RENDERING]: Cel-shading with hard edges.
[VIBE]: Casual, approachable, easy to read.`;

        const TECHNICAL_CONSTRAINTS = `ABSOLUTELY NO American cartoon, western comics, realism, or 3D rendering styles (unless specified). High quality illustration. Clear line art.
[HIGH PERFORMANCE GUIDANCE]: Focus on EXAGGERATED MANGA EXPRESSIONS. Body language must be dynamic with clear weight shifts.`;

        const fullPrompt = targetStyle === 'custom' && targetCustomText.trim() 
            ? targetCustomText 
            : (() => {
                switch(targetStyle) {
                    case 'vibrant': return `${TECHNICAL_CONSTRAINTS}\n\n${VIBRANT_PROMPT}`;
                    case 'moe': return `${TECHNICAL_CONSTRAINTS}\n\n${MOE_PROMPT}`;
                    case 'dalle-chibi': return DALLE_CHIBI_PROMPT;
                    case 'kyoto': return `${TECHNICAL_CONSTRAINTS}\n\n${KYOTO_PROMPT}`;
                    case 'normal': default: return `${TECHNICAL_CONSTRAINTS}\n\n${NORMAL_PROMPT}`;
                }
            })();

        return `${IDENTITY_PROTECTION_CLAUSE}\n\n${fullPrompt}`;
    }, []);
    
    const getVisionModelName = useCallback(() => {
        switch (stateRef.current.selectedNanoModel) {
            case 'nano-3.1':
                return 'gemini-3.1-flash-image-preview';
            case 'nano-3pro':
                return 'gemini-3-pro-image-preview';
            case 'nano-2.5':
            default:
                return 'gemini-2.5-flash-image';
        }
    }, []);

    const handleEditImageWithNanoWithRetry = useCallback(async (baseImageUrl: string, editPrompt: string, originalPrompt: string, referenceImageUrl?: string, maskBase64?: string, masterStyleImageUrl?: string, isCreativeGeneration: boolean = false, artStylePromptOverride?: string) => {
        const artStylePrompt = artStylePromptOverride || getArtStylePrompt();
        const modelName = getVisionModelName();
        // Check for API key if using gemini-3-pro-image-preview or gemini-3.1-flash-image-preview
        if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-3.1-flash-image-preview') {
            if (!(await (window as any).aistudio.hasSelectedApiKey())) {
                await (window as any).aistudio.openSelectKey();
            }
        }
        
        let attempt = 0;
        const maxAttempts = 3;
        while (attempt < maxAttempts) {
            try {
                // PDF Page 53 - Golden Rule construction
                const res = await editImageWithNano(baseImageUrl, editPrompt, originalPrompt, artStylePrompt, modelName, referenceImageUrl, maskBase64, masterStyleImageUrl, undefined, isCreativeGeneration);
                handleAddUsage(res.tokenCount, 0);
                return { imageUrl: res.imageUrl, textResponse: res.textResponse, tokenCount: res.tokenCount };
            } catch (error: any) {
                attempt++;
                const isServerError = error.message && (error.message.includes('500') || error.message.includes('503') || error.message.includes('429') || error.message.includes('Internal error') || error.message.includes('Service Unavailable') || error.message.includes('Too Many Requests'));
                if (isServerError && attempt < maxAttempts) {
                    console.warn(`[handleEditImageWithNanoWithRetry] Server/Rate limit error encountered. Retrying attempt ${attempt} of ${maxAttempts}...`, error);
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
                } else {
                    throw error;
                }
            }
        }
        throw new Error("Maximum retry attempts reached.");
    }, [getArtStylePrompt, getVisionModelName, handleAddUsage]);

    const calculateFinalPrompt = useCallback((cut: Cut | EditableCut) => {
        const charDescriptions = stateRef.current.characterDescriptions;
        const locDNA = stateRef.current.locationVisualDNA;
        const rawCharacters = 'characters' in cut ? cut.characters : (cut as EditableCut).character;
        const characters = rawCharacters ? rawCharacters.filter(c => c && c.trim() !== '') : []; // Filter empty
        
        // [NEW] 컷별 화풍 오버라이드 또는 전역 화풍 가져오기
        const activeStyle = ('artStyleOverride' in cut && cut.artStyleOverride) 
            ? cut.artStyleOverride 
            : stateRef.current.artStyle;

        const location = cut.location;
        const locDesc = 'locationDescription' in cut ? cut.locationDescription : (cut as EditableCut).locationDescription;
        const other = 'otherNotes' in cut ? cut.otherNotes : (cut as EditableCut).otherNotes;
        const intent = 'directorialIntent' in cut ? cut.directorialIntent : (cut as EditableCut).directorialIntent;
        const pose = 'characterPose' in cut ? cut.characterPose : (cut as EditableCut).characterPose;
        const emotion = 'characterEmotionAndExpression' in cut ? cut.characterEmotionAndExpression : (cut as EditableCut).characterEmotionAndExpression;
        
        // --- [NEW: 인서트 컷 처리 로직] ---
        // 인물이 한 명도 배정되지 않은 경우, 배경/소품 전용 프롬프트 생성
        if (characters.length === 0) {
            const spatialDNA = locDNA[location] || 'Consistent visual background.';
            return `
# [SCENE INSERT / BACKGROUND ONLY]
- **TYPE:** Background Art / Scenery / Object Insert / Close-up of props.
- **CRITICAL NEGATIVE:** NO HUMANS. NO CHARACTERS. NO PEOPLE. Do not draw any person. The scene must be empty of people.
- **LOCATION:** ${location}
- **SPATIAL DNA:** ${spatialDNA}
- **VISUAL DESCRIPTION:** ${locDesc}
- **ATMOSPHERE/INTENT:** ${intent || 'Atmospheric shot reflecting the story context'}
- **DETAILS:** ${other}
- **QUALITY:** Highly detailed webtoon background art, establishing shot or emotional landscape.
            `.trim();
        }

        // --- [1단계: 기계적 DNA 추출 - 헤어 DNA 잠금 해제] ---
        const mechanicalIdentityParts: string[] = [];
        const customOutfit = 'characterOutfit' in cut ? cut.characterOutfit : (cut as EditableCut).characterOutfit;

        characters.forEach(name => {
            // Dynamic lookup by koreanName
            const key = Object.keys(charDescriptions).find(k => charDescriptions[k].koreanName === name);
            if (key && charDescriptions[key]) {
                const char = charDescriptions[key];
                // 이미지 생성 모델용 영어 프로필 조립
                // 1. 기본값 설정 (캐릭터 설정 기반 - 가장 신뢰할 수 있는 소스)
                let profileOutfit = char.locations?.[location] || char.baseAppearance || 'standard casual outfit';
                
                // 2. 커스텀 의상(cut.characterOutfit)이 있으면 파싱 시도 (사용자 수동 수정 반영)
                if (customOutfit && customOutfit.trim().length > 2) {
                    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // [Name: Outfit] 형식 매칭 시도
                    const regex = new RegExp(`\\[${escapedName}:\\s*(.*?)\\]`, 'i');
                    const match = customOutfit.match(regex);
                    
                    if (match && match[1] && match[1].trim().length > 2) {
                        // 매칭 성공 시 해당 부분 사용
                        profileOutfit = match[1].trim();
                    } else if (characters.length === 1 && !customOutfit.includes('[')) {
                        // 캐릭터가 1명이고 대괄호 형식이 아니면 전체를 의상으로 사용 (단일 캐릭터 컷의 수동 수정)
                        profileOutfit = customOutfit;
                    }
                    // 매칭 실패 시(형식이 안 맞거나 다른 캐릭터 의상만 있는 경우) 기본값(profileOutfit) 유지
                }

                // 3. 최종 의상 정보가 너무 짧거나 없으면 다시 기본값 강제 (안전장치)
                if (!profileOutfit || profileOutfit.length < 3 || profileOutfit.toLowerCase() === 'none' || profileOutfit.toLowerCase() === 'n/a') {
                     profileOutfit = char.locations?.[location] || char.baseAppearance || 'standard casual outfit';
                }

                const hair = char.hairStyleDescription || 'Standard hairstyle';
                const features = char.facialFeatures || 'Match facial visage exactly';
                
                mechanicalIdentityParts.push(`# IDENTITY DNA FOR ${name.toUpperCase()}:
- HAIR (ABSOLUTE): ${hair}
- VISAGE (MANDATORY): ${features}
- CLOTHING: ${profileOutfit}`);
            }
        });
        const identityDNA = mechanicalIdentityParts.join('\n\n');

        const cameraKeywords = ['close up', 'zoom', 'shot', '클로즈업', '바스트', '풀샷', '앵글', '샷'];
        const isPolluted = cameraKeywords.some(k => location.toLowerCase().includes(k));
        const finalLocationString = isPolluted ? `the consistent physical environment described as: ${locDesc}` : location;
        
        // --- [2단계: 공간 DNA 주입 (Spatial Consistency)] ---
        const spatialDNA = locDNA[location] || 'consistent visual style';

        const fxMap: { [key: string]: string } = {
            "Vertical Gloom Lines": "Dramatic vertical gloom hatching lines, melancholic shadow gradients, heavy emotional burden, classic manga gloom effect.",
            "Speed Lines": "Dynamic radial speed lines, kinetic energy blur, intense high-motion impact, classic action manga lines.",
            "Soft Bloom": "Ethereal soft bloom glow, dreamy romantic lighting, gentle aura highlights, shoujo-manga atmosphere.",
            "Sparkling Aura": "Magical shimmering particles, glowing shoujo-manga sparkles, cute radiant aura, glittering fairy-dust effect."
        };
        
        let technicalFX = "";
        if (intent) {
            technicalFX = Object.keys(fxMap).filter(key => intent.includes(key)).map(key => fxMap[key]).join(" ");
        }

        // --- [NEW: 3단계 - 비율 강제 변환 로직 (Proportion Override)] ---
        let proportionInstruction = "";
        if (activeStyle === 'moe' || activeStyle === 'dalle-chibi') {
            proportionInstruction = `
[CRITICAL: BODY PROPORTION OVERRIDE]
- **TARGET STYLE**: SD (Super Deformed) / Chibi.
- **RULE**: IGNORE the body proportions of the reference image.
- **EXECUTION**: You MUST draw the character with a **1:2.5 Head-to-Body ratio** (Big head, tiny body).
- **ADAPTATION**: Keep the face identity and outfit design, but squish/shorten the body to fit the cute SD proportion.`;
        } else if (activeStyle === 'vibrant') {
            proportionInstruction = `[PROPORTION]: Maintain mature, tall adult proportions (1:7 to 1:8 ratio). Long legs, stylish silhouette.`;
        } else {
            proportionInstruction = `[PROPORTION]: Standard Webtoon proportions (1:6 to 1:7 ratio).`;
        }
        
        const lockInstruction = `[ABSOLUTE IDENTITY PRESERVATION & DYNAMIC ACTING]
- **FACE LOCK (PRIORITY #1):** The facial features in the reference image (or Identity DNA) are the GROUND TRUTH. You must NOT change the face to match the style. Style applies to *rendering*, not *identity*.
- MANDATORY: Match the hair, face, and clothing of the character(s) EXACTLY to the "IDENTITY DNA" section below.
- WARDROBE OVERRIDE: You MUST change the character's clothing to match the "IDENTITY DNA" section. Do NOT copy the clothing from the reference image unless it matches the DNA.
- ACTING FOCUS: Perform a high-energy, exaggerated manga-style pose. Avoid static standing. Ensure clear weight distribution and expressive silhouettes.
- MANPU USAGE: Incorporate visual manga symbols ONLY IF they match the specific emotion. Do NOT add sweat drops (💧) unless the emotion is 'nervous', 'tired', or 'confused'.
- COMPOSITIONAL FREEDOM: Completely ignore the reference image's background and camera distance.
- ZERO PERSISTENCE: Do NOT repeat the pose of the reference. Create an ENTIRELY NEW visual composition.
${proportionInstruction}
${technicalFX}`;

        return `
${lockInstruction}

# [CRITICAL: IDENTITY PRIORITY - HIGHEST]
${identityDNA}

# LAYER 2: SCENE DYNAMICS (FLEXIBLE)
- Dynamic Intent: ${intent}. Rebuild the scene with a fresh perspective and high-energy performance.
- Action/Pose: ${pose}. Do not copy the pose from the reference. Focus on dynamic posture and hand gestures.
- Facial Expression: ${emotion}. Use exaggerated manga-style facial features.

# LAYER 3: ENVIRONMENT & SPATIAL DNA
- Precise Location: ${finalLocationString}
- Spatial Architecture (DNA): ${spatialDNA}
- Environment Detail: ${locDesc}
- Technical Specs: ${other}

[FINAL GUIDANCE]: Treat the reference image/DNA as a **FACE MASK**. Even if the scene changes, the face must look like the EXACT SAME PERSON.
`.trim();
    }, []);

    // --- Cut edit actions from factory ---
    const cutEditActions = createCutEditActions({
        dispatch, stateRef, addNotification, handleAddUsage,
        handleEditImageWithNanoWithRetry, getArtStylePrompt, getVisionModelName,
        updateUIState, calculateFinalPrompt,
    });

    const handleEditInStudio = cutEditActions.handleEditInStudio;
    const handleCreateInStudio = cutEditActions.handleCreateInStudio;

    // --- Misc actions from factory ---
    const miscActions = createMiscActions({
        dispatch, stateRef, addNotification, handleAddUsage,
        handleEditImageWithNanoWithRetry, getArtStylePrompt: getArtStylePrompt, getVisionModelName,
        updateUIState,
    });

    const handleStartStudio = async (overrides?: { artStyle?: ArtStyle, customArtStyle?: string }) => {
        const { userInputScript, speakerGender, artStyle, customArtStyle } = stateRef.current;
        const selectedArtStyle = overrides?.artStyle || artStyle;
        const selectedCustomArtStyle = overrides?.customArtStyle || customArtStyle;

        if (!userInputScript.trim()) {
            addNotification('대본을 입력해주세요.', 'error');
            return;
        }

        dispatch({ type: 'START_LOADING', payload: '스튜디오 시작 중...' });
        updateUIState({ analysisStage: 'character', analysisProgress: 0 });

        try {
            // Normalize the script so that each logical cut is exactly one line
            const normalizedScript = normalizeScriptCuts(userInputScript);
            
            // Update the state with the normalized script so the user sees the clean version
            dispatch({ type: 'SET_USER_INPUT_SCRIPT', payload: normalizedScript });

            // Check if the script is already a "detailed script"
            // A detailed script contains explicit instructions like (등장인물: ..., 연출의도: ..., 이미지프롬프트: ...)
            const hasCharacterTag = /(등장인물|인물|캐릭터|Character)\s*[:：]/i.test(normalizedScript);
            const hasImageTag = /(이미지프롬프트|이미지|그림|프롬프트|Image)\s*[:：]/i.test(normalizedScript);
            const isDetailedScript = hasCharacterTag && hasImageTag;

            // 1. Character Analysis
            dispatch({ type: 'SET_LOADING_DETAIL', payload: '대본에서 등장인물을 분석하고 프로필을 생성하고 있습니다...' });
            const stylePrompt = getArtStylePrompt(selectedArtStyle, selectedCustomArtStyle);
            const { characters, firstScenePrompt, title, tokenCount: charToken } = await analyzeCharacters(
                normalizedScript, 
                speakerGender, 
                stylePrompt, 
                selectedArtStyle, 
                isDetailedScript,
                undefined, 
                (textLength) => {
                    dispatch({ type: 'SET_LOADING_DETAIL', payload: `대본에서 등장인물을 분석하고 프로필을 생성하고 있습니다... (${textLength}자 생성됨)` });
                }
            );
            handleAddUsage(charToken, 0);
            
            // Dispatch immediately to update state, but use local variable for next steps
            dispatch({ type: 'SET_CHARACTER_DESCRIPTIONS', payload: characters });
            if (title) dispatch({ type: 'SET_STORY_TITLE', payload: title });
            
            updateUIState({ analysisProgress: 25 });

            let enrichedScript = normalizedScript;
            let blueprint: any = {};

            if (isDetailedScript) {
                console.log("Detailed script detected. Skipping enrichment and blueprint generation.");
                updateUIState({ analysisStage: 'enrichment' });
                dispatch({ type: 'SET_LOADING_DETAIL', payload: '상세 대본이 감지되어 연출 지시문 추가를 건너뜁니다...' });
                updateUIState({ analysisProgress: 50 });
                
                updateUIState({ analysisStage: 'blueprint' });
                dispatch({ type: 'SET_LOADING_DETAIL', payload: '상세 대본이 감지되어 샷 구성 설계를 건너뜁니다...' });
                const seed = Math.floor(Math.random() * 100000);
                dispatch({ type: 'SET_STORYBOARD_SEED', payload: seed });
                updateUIState({ analysisProgress: 75 });
            } else {
                // 2. Script Enrichment
                updateUIState({ analysisStage: 'enrichment' });
                dispatch({ type: 'SET_LOADING_DETAIL', payload: '스토리의 전체 맥락을 파악하고 연출 지시문을 추가하고 있습니다...' });
                const enrichResult = await enrichScriptWithDirections(
                    normalizedScript, 
                    undefined, 
                    selectedArtStyle,
                    (textLength) => {
                        dispatch({ type: 'SET_LOADING_DETAIL', payload: `스토리의 전체 맥락을 파악하고 연출 지시문을 추가하고 있습니다... (${textLength}자 생성됨)` });
                    }
                );
                enrichedScript = enrichResult.enrichedScript;
                handleAddUsage(enrichResult.tokenCount, 0);
                dispatch({ type: 'SET_ENRICHED_SCRIPT', payload: enrichedScript });
                
                updateUIState({ analysisProgress: 50 });

                // 3. Cinematic Blueprint
                updateUIState({ analysisStage: 'blueprint' });
                dispatch({ type: 'SET_LOADING_DETAIL', payload: '최적의 카메라 앵글과 샷 구성을 설계하고 있습니다...' });
                const seed = Math.floor(Math.random() * 100000);
                dispatch({ type: 'SET_STORYBOARD_SEED', payload: seed });
                const blueprintResult = await generateCinematicBlueprint(
                    enrichedScript, 
                    seed,
                    (textLength) => {
                        dispatch({ type: 'SET_LOADING_DETAIL', payload: `최적의 카메라 앵글과 샷 구성을 설계하고 있습니다... (${textLength}자 생성됨)` });
                    }
                );
                blueprint = blueprintResult.blueprint;
                handleAddUsage(blueprintResult.tokenCount, 0);
                
                updateUIState({ analysisProgress: 75 });
            }

            // 4. Spatial DNA & Storyboard Generation
            updateUIState({ analysisStage: 'spatial' }); 
            dispatch({ type: 'SET_LOADING_DETAIL', payload: '장소별 공간 데이터를 생성하고 상세 스토리보드를 구성 중입니다...' });
            
            const { storyboard, locationDNAMap, tokenCount: sToken } = await generateEditableStoryboard(
                normalizedScript,
                enrichedScript,
                blueprint,
                speakerGender,
                characters, // Use the characters we just analyzed
                stateRef.current.storyboardSeed, // Use the seed we just generated or existing one
                selectedArtStyle,
                (part, total) => {
                    // Map remaining progress (75-95%)
                    const p = 75 + Math.floor((part / total) * 20);
                    updateUIState({ analysisProgress: p });
                    dispatch({ type: 'SET_LOADING_DETAIL', payload: `스토리보드 생성 중... (Part ${part}/${total})` });
                }
            );
            handleAddUsage(sToken, 0);

            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: storyboard });
            dispatch({ type: 'SET_LOCATION_VISUAL_DNA', payload: locationDNAMap });

            updateUIState({ analysisStage: 'storyboard', analysisProgress: 100 });
            
            // Open the Scene Analysis Review Modal instead of going straight to storyboard
            updateUIState({ isSceneAnalysisReviewModalOpen: true });

        } catch (error) {
            console.error(error);
            addNotification(`분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, 'error');
            updateUIState({ analysisStage: 'idle', analysisProgress: 0 });
        } finally {
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    const handleConfirmAudioSplit = useCallback((processedAudios: { cutNumber: string; audioUrl: string; duration: number }[]) => {
        processedAudios.forEach(item => {
            dispatch({
                type: 'UPDATE_CUT',
                payload: {
                    cutNumber: item.cutNumber,
                    data: { 
                        audioDataUrls: [item.audioUrl],
                        audioDuration: item.duration
                    }
                }
            });
        });
        addNotification(`${processedAudios.length}개의 컷에 오디오가 정밀 분할되어 할당되었습니다.`, 'success');
    }, [addNotification]);

    const handleOpenReviewModalForEdit = () => {
        const { editableStoryboard, generatedContent } = stateRef.current;
        if (!editableStoryboard && generatedContent) {
            // Reconstruct editable draft from final storyboard data for re-review
            const reconstructed: EditableScene[] = generatedContent.scenes.map(s => ({
                sceneNumber: s.sceneNumber,
                title: s.title,
                cuts: s.cuts.map(c => ({
                    id: c.cutNumber,
                    narrationText: c.narration,
                    character: c.characters,
                    location: c.location,
                    sceneDescription: c.sceneDescription,
                    characterEmotionAndExpression: c.characterEmotionAndExpression,
                    characterPose: c.characterPose,
                    characterOutfit: c.characterOutfit,
                    locationDescription: c.locationDescription,
                    otherNotes: c.otherNotes,
                    directorialIntent: c.directorialIntent
                }))
            }));
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: reconstructed });
        }
        updateUIState({ isStoryboardReviewModalOpen: true });
    };

    // --- Generation actions from factory ---
    const generationActions = createGenerationActions({
        dispatch, stateRef, addNotification, handleAddUsage,
        handleEditImageWithNanoWithRetry, getArtStylePrompt, getVisionModelName,
        triggerConfetti, currentSessionIdRef, isAutoGeneratingLocalRef,
        updateUIState, calculateFinalPrompt,
    });

    const handleRunSelectiveGeneration = generationActions.handleRunSelectiveGeneration;

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
                generatedContent.scenes.flatMap(s => s.cuts || []).forEach(c => originalCutsMap.set(c.cutNumber, c));
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
                    (cut.character || []).forEach(name => {
                        // Dynamic lookup by koreanName
                        const key = Object.keys(characterDescriptions).find(k => characterDescriptions[k].koreanName === name);
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
                            const missingCharacterInAIResult = cut.character.some(name => !finalOutfit.includes(name));
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
                    
                    const historyImages = generatedImageHistory.filter(img => img.sourceCutNumber === editableCut.id);
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
                        imageUrls: historyImages.length > 0 ? historyImages.map(img => img.imageUrl) : (original ? original.imageUrls : []),
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

    const handleGenerateStoryboardWithCustomCostumes = async () => { 
        const { editableStoryboard, characterDescriptions } = stateRef.current;
        
        // --- [1단계: 캐릭터 시트 결과물을 이미지 스튜디오로 연동] ---
        const getFinalImg = (key: string) => {
            const char = characterDescriptions[key];
            if (!char) return null;
            const url = char.mannequinImageUrl || char.upscaledImageUrl || (char.characterSheetHistory?.[char.characterSheetHistory.length - 1]);
            if (!url) return null;
            return {
                id: `char-sheet-${key}-${Date.now()}`,
                imageUrl: url,
                sourceCutNumber: 'character-sheet',
                prompt: char.baseAppearance || 'Character Sheet Base',
                engine: getEngineFromModel(stateRef.current.selectedNanoModel),
                createdAt: new Date().toISOString()
            };
        };

        const charKeys = Object.keys(characterDescriptions);

        if (charKeys.length > 0) {
            const imgA = getFinalImg(charKeys[0]);
            if (imgA) {
                dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: 'a', image: imgA } });
                dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: 'a', image: imgA } });
            }
        }

        if (charKeys.length > 1) {
            const imgB = getFinalImg(charKeys[1]);
            if (imgB) {
                dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: 'b', image: imgB } });
                dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: 'b', image: imgB } });
            }
        }

        if (editableStoryboard) {
            const syncedDraft = editableStoryboard.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => {
                    const profileOutfitParts: string[] = [];
                    (cut.character || []).forEach(name => {
                        const key = Object.keys(characterDescriptions).find(k => characterDescriptions[k].koreanName === name);
                        if (key && characterDescriptions[key]) {
                            // [이름: (헤어) 의상] 형식으로 리터럴 복사 및 DNA 주입
                            const hair = characterDescriptions[key].hairStyleDescription || 'Standard';
                            // Use English locations map as source
                            const outfitText = characterDescriptions[key].locations?.[cut.location] || characterDescriptions[key].locations?.['기본 의상'] || characterDescriptions[key].baseAppearance || 'standard outfit';
                            profileOutfitParts.push(`[${name}: (${hair}) ${outfitText}]`);
                        }
                    });
                    return { ...cut, characterOutfit: profileOutfitParts.join(' ') };
                })
            }));
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: syncedDraft });
        }
        updateUIState({ isCostumeModalOpen: false }); 
        handleOpenReviewModalForEdit(); 
    };

    const characterActions = createCharacterActions({
        dispatch,
        stateRef,
        addNotification,
        handleAddUsage,
        handleEditImageWithNanoWithRetry,
        getArtStylePrompt,
        getVisionModelName,
    });

    const actions = {
        setUIState: updateUIState,
        addNotification,
        handleAddUsage,
        handleGenerateTitles: async () => {
            updateUIState({ isGeneratingTitles: true });
            try {
                const { titles, tokenCount } = await generateTitleSuggestions(stateRef.current.userInputScript);
                handleAddUsage(tokenCount, 0);
                updateUIState({ titleSuggestions: titles, isGeneratingTitles: false });
            } catch (e) { updateUIState({ isGeneratingTitles: false }); }
        },
        handleResetState: () => {
            dispatch({ type: 'RESET_STATE' });
            setUIState(initialUIState);
        },
        handleExportProject: () => {
            const sanitizedState = sanitizeState(stateRef.current);
            const data = JSON.stringify(sanitizedState);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${stateRef.current.storyTitle || 'wvs_project'}.wvs_project`; a.click();
        },
        handleImportFile: (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target?.result as string);
                    dispatch({ type: 'RESTORE_STATE', payload: parsed });
                    setUIState(initialUIState);
                } catch (err) { addNotification('불러오기 실패', 'error'); }
                finally { e.target.value = ''; }
            };
            reader.readAsText(file);
        },
        handleStartStudio,
        handleConfirmSceneAnalysis: () => {
            updateUIState({ isSceneAnalysisReviewModalOpen: false, isCostumeModalOpen: true });
        },
        handleRegenerateSceneAnalysis: async () => handleStartStudio(),
        handleGenerateStoryboardWithCustomCostumes,
        handleApplyCharacterChangesToAllCuts: async () => {
            const { generatedContent, characterDescriptions } = stateRef.current;
            if (!generatedContent) return;

            // 1. Update generatedContent with new outfit descriptions
            const updatedScenes = generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => {
                    const profileOutfitParts: string[] = [];
                    (cut.characters || []).forEach(name => {
                        const key = Object.keys(characterDescriptions).find(k => characterDescriptions[k].koreanName === name);
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
        },
        ...characterActions,
        ...cutEditActions,
        handleAnalyzeYoutubeUrl: async () => {},
        handleReplaceBackground: miscActions.handleReplaceBackground,
        handleClearStudioSession: (sId: 'a' | 'b') => dispatch({ type: 'CLEAR_STUDIO_SESSION', payload: { studioId: sId } }),
        handleRevertInStudio: (sId: 'a' | 'b') => dispatch({ type: 'REVERT_STUDIO_SESSION', payload: { studioId: sId } }),
        handleUndoInStudio: (sId: 'a' | 'b') => dispatch({ type: 'UNDO_STUDIO_SESSION', payload: { studioId: sId } }),
        handleCopyOriginalToCurrent: (sId: 'a' | 'b') => dispatch({ type: 'COPY_ORIGINAL_TO_CURRENT', payload: { studioId: sId } }),
        handleCopyPromptToStudios: (prompt: string) => dispatch({ type: 'COPY_PROMPT_TO_STUDIOS', payload: prompt }),
        handleCopyPromptToStudio: (studioId: 'a' | 'b', prompt: string) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId, data: { editPrompt: prompt } } }),
        handleSaveStudioToHistory: (sId: 'a' | 'b') => {
            const sess = stateRef.current.studioSessions[sId]; 
            if (sess.currentImage) { 
                const newImg = { ...sess.currentImage, id: window.crypto.randomUUID() };
                dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: sess.sourceCutForNextEdit || 'custom' } }); 
                addNotification('저장되었습니다.', 'success'); 
            }
        },
        handleSaveFromEditor: (url: string, info: GeneratedImage) => { 
            const newImg = { ...info, id: window.crypto.randomUUID(), imageUrl: url, createdAt: new Date().toISOString() }; 
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: info.sourceCutNumber } }); 
        },
        handleStudioReferenceChange: (sId: 'a' | 'b', url: string | null) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { referenceImageUrl: url } } }),
        handleStudioPromptChange: (sId: 'a' | 'b', p: string) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { editPrompt: p } } }),
        handleStudioTransformChange: (sId: 'a' | 'b', z: number, p: { x: number; y: number }) => dispatch({ type: 'UPDATE_STUDIO_TRANSFORM', payload: { studioId: sId, zoom: z, pan: p } }),
        handleCommitStudioTransform: (sId: 'a' | 'b', url: string) => { const sess = stateRef.current.studioSessions[sId]; if (sess.currentImage) { const newImg = { ...sess.currentImage, id: window.crypto.randomUUID(), imageUrl: url, createdAt: new Date().toISOString() }; dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { currentImage: newImg, history: [...sess.history, newImg], zoom: 1, pan: { x: 0, y: 0 } } } }); } },
        handleStudioRefill: miscActions.handleStudioRefill,
        handleSendImageToStudio: (img: GeneratedImage) => dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: stateRef.current.activeStudioTarget, image: img } }),
        handleDeleteFromHistory: (id: string) => dispatch({ type: 'DELETE_FROM_IMAGE_HISTORY', payload: id }),
        handleCancelZipping: () => {
            isCancellingZippingLocalRef.current = true;
            if (zippingAbortControllerRef.current) {
                zippingAbortControllerRef.current.abort();
            }
            dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { ...stateRef.current.zippingProgress, isCancelling: true } as any });
        },
        handleDownloadAllImagesZip: async () => {
            dispatch({ type: 'START_ZIPPING' });
            isCancellingZippingLocalRef.current = false;
            zippingAbortControllerRef.current = new AbortController();
            const zip = new JSZip();
            try {
                const images = stateRef.current.generatedImageHistory;
                const total = images.length;
                let current = 0;
                
                for (const img of images) {
                    if (isCancellingZippingLocalRef.current) {
                        addNotification('다운로드가 취소되었습니다.', 'info');
                        return;
                    }
                    try {
                        const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current.signal });
                        const blob = await res.blob();
                        zip.file(`cut_${img.sourceCutNumber}_${img.id.substring(0,4)}.png`, blob);
                    } catch (e: any) {
                        if (e.name === 'AbortError') {
                            addNotification('다운로드가 취소되었습니다.', 'info');
                            return;
                        }
                        console.error("Failed to fetch image", img.imageUrl, e);
                    }
                    current++;
                    dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { current, total, isCancelling: false } });
                }
                
                if (isCancellingZippingLocalRef.current) return;
                
                const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
                    if (isCancellingZippingLocalRef.current) {
                        throw new Error("Cancelled");
                    }
                });
                if (isCancellingZippingLocalRef.current) return;
                
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'wvs_project.zip';
                a.click();
                URL.revokeObjectURL(url);
            } catch (error: any) {
                if (error.message === "Cancelled") {
                    addNotification('다운로드가 취소되었습니다.', 'info');
                } else {
                    console.error("Error zipping all images:", error);
                    addNotification('전체 이미지 압축 중 오류가 발생했습니다.', 'error');
                }
            } finally {
                dispatch({ type: 'END_ZIPPING' });
                isCancellingZippingLocalRef.current = false;
            }
        },
        handleDownloadSRT: async () => {
            const { generatedContent } = stateRef.current;
            if (!generatedContent || generatedContent.scenes.length === 0) {
                addNotification('다운로드할 자막이 없습니다.', 'info');
                return;
            }

            dispatch({ type: 'START_LOADING', payload: 'AI 자막(SRT) 생성 중...' });
            setUIState(prev => ({ ...prev, isGeneratingSRT: true }));
            isGeneratingSRTLocalRef.current = true;
            try {
                let srtContent = '';
                let subtitleIndex = 1;
                let currentStartTime = 0;

                const formatSRTTime = (seconds: number): string => {
                    const h = Math.floor(seconds / 3600);
                    const m = Math.floor((seconds % 3600) / 60);
                    const s = Math.floor(seconds % 60);
                    const ms = Math.floor((seconds % 1) * 1000);
                    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
                };

                const getAudioDuration = (url: string): Promise<number> => {
                    return new Promise((resolve) => {
                        const audio = new Audio(url);
                        
                        const timeoutId = setTimeout(() => {
                            resolve(3); // fallback after 3 seconds
                        }, 3000);

                        audio.addEventListener('loadedmetadata', () => {
                            clearTimeout(timeoutId);
                            resolve(audio.duration);
                        });
                        audio.addEventListener('error', () => {
                            clearTimeout(timeoutId);
                            resolve(3); // fallback
                        });
                    });
                };

                for (const scene of generatedContent.scenes) {
                    for (const cut of scene.cuts) {
                        if (!isGeneratingSRTLocalRef.current) {
                            addNotification('자막 생성이 중단되었습니다.', 'info');
                            return;
                        }

                        let cutDuration = cut.audioDuration;
                        if (!cutDuration) {
                            if (cut.audioDataUrls && cut.audioDataUrls.length > 0) {
                                cutDuration = await getAudioDuration(cut.audioDataUrls[0]);
                            } else {
                                // Calculate duration based on 1.3x TTS speed (0.1s per character)
                                const charCount = cut.narration ? cut.narration.replace(/\s/g, '').length : 0;
                                cutDuration = charCount > 0 ? charCount * 0.1 : 3; // fallback to 3s if no narration
                            }
                        }
                        
                        if (!cut.narration || cut.narration.trim() === '') {
                            currentStartTime += cutDuration;
                            continue;
                        }

                        // 1. Use existing semantic breaks (newlines) from normalization
                        const lines = cut.narration.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        
                        // 2. Calculate duration per line based on length
                        const totalLength = lines.reduce((acc, line) => acc + line.length, 0);
                        
                        for (const line of lines) {
                            const lineRatio = totalLength > 0 ? line.length / totalLength : 1;
                            const lineDuration = cutDuration * lineRatio;
                            
                            const startTimeStr = formatSRTTime(currentStartTime);
                            const endTimeStr = formatSRTTime(currentStartTime + lineDuration);
                            
                            srtContent += `${subtitleIndex}\n`;
                            srtContent += `${startTimeStr} --> ${endTimeStr}\n`;
                            srtContent += `${line}\n\n`;
                            
                            currentStartTime += lineDuration;
                            subtitleIndex++;
                        }
                    }
                }

                if (!isGeneratingSRTLocalRef.current) return;

                // Download file
                const blob = new Blob([srtContent], { type: 'text/srt;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${generatedContent.title || 'project'}_subtitles.srt`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                addNotification('SRT 자막 파일이 다운로드되었습니다.', 'success');
            } catch (error) {
                console.error('SRT generation failed:', error);
                addNotification('자막 생성에 실패했습니다.', 'error');
            } finally {
                isGeneratingSRTLocalRef.current = false;
                setUIState(prev => ({ ...prev, isGeneratingSRT: false }));
                dispatch({ type: 'STOP_LOADING' });
            }
        },
        handleCancelSRTGeneration: () => {
            isGeneratingSRTLocalRef.current = false;
        },
        handleDownloadSelectedImagesZip: async () => {
            dispatch({ type: 'START_ZIPPING' });
            isCancellingZippingLocalRef.current = false;
            zippingAbortControllerRef.current = new AbortController();
            const zip = new JSZip();
            try {
                const { generatedContent, generatedImageHistory, storyTitle } = stateRef.current;
                if (!generatedContent) {
                    addNotification('다운로드할 컷이 없습니다.', 'info');
                    return;
                }

                const selectedImageIds = new Set<string>();
                (generatedContent.scenes || []).forEach(scene => {
                    (scene.cuts || []).forEach(cut => {
                        if (cut.selectedImageId) {
                            selectedImageIds.add(cut.selectedImageId);
                        }
                    });
                });

                if (selectedImageIds.size === 0) {
                    addNotification('선택된 대표 이미지가 없습니다.', 'info');
                    return;
                }

                const imagesToDownload = generatedImageHistory.filter(img => selectedImageIds.has(img.id));
                const total = imagesToDownload.length;
                let current = 0;

                for (const img of imagesToDownload) {
                    if (isCancellingZippingLocalRef.current) {
                        addNotification('다운로드가 취소되었습니다.', 'info');
                        return;
                    }
                    try {
                        const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current.signal });
                        const blob = await res.blob();
                        const filename = `cut_${img.sourceCutNumber}_${img.id.substring(0, 4)}.png`;
                        zip.file(filename, blob);
                    } catch (e: any) {
                        if (e.name === 'AbortError') {
                            addNotification('다운로드가 취소되었습니다.', 'info');
                            return;
                        }
                        console.error("Failed to fetch image", img.imageUrl, e);
                    }
                    current++;
                    dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { current, total, isCancelling: false } });
                }

                if (isCancellingZippingLocalRef.current) return;

                const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
                    if (isCancellingZippingLocalRef.current) {
                        throw new Error("Cancelled");
                    }
                });
                if (isCancellingZippingLocalRef.current) return;

                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${storyTitle || 'wvs_project'}_selected.zip`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (error: any) {
                if (error.message === "Cancelled") {
                    addNotification('다운로드가 취소되었습니다.', 'info');
                } else {
                    console.error("Error zipping selected images:", error);
                    addNotification('선택 이미지 압축 중 오류가 발생했습니다.', 'error');
                }
            } finally {
                dispatch({ type: 'END_ZIPPING' });
                isCancellingZippingLocalRef.current = false;
            }
        },
        handleOpenEditor: (info: any) => updateUIState({ isEditorOpen: true, editingImageInfo: info }),
        handleOpenImageViewer: (url: string, alt: string, prompt?: string) => updateUIState({ isImageViewerOpen: true, viewerImage: { url, alt, prompt } }),
        handleOpenTextEditor: (cutNumber: string, url: string, chars: string[]) => updateUIState({ isTextEditorOpen: true, textEditingTarget: { cutNumber, imageUrl: url, characters: chars } }),
        handleTextRender: miscActions.handleTextRender,
        handleAutoGenerateImageForCut: generationActions.handleAutoGenerateImageForCut,
        handleApplyAndRunPrompt: generationActions.handleApplyAndRunPrompt,
        handleOriginalPromptToActiveStudio: (p: string) => handleCreateInStudio(stateRef.current.activeStudioTarget, stateRef.current.studioSessions[stateRef.current.activeStudioTarget].originalImage!, p),
        handlePrepareStudioForCut: (cutNumber: string, p: string) => dispatch({ type: 'PREPARE_STUDIO_FOR_CUT', payload: { studioId: stateRef.current.activeStudioTarget, cutNumber, prompt: p } }),
        handleUserImageUpload: (sId: 'a' | 'b', url: string) => dispatch({ type: 'LOAD_USER_IMAGE_INTO_STUDIO', payload: { studioId: sId, imageDataUrl: url } }),
        handleUpdateStudioImageFromUpload: (sId: 'a' | 'b', url: string) => dispatch({ type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: sId, imageDataUrl: url } }),
        handleUserImageUploadForStudio: (sId: 'a' | 'b', url: string) => dispatch({ type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: sId, imageDataUrl: url } }),
        handleLoadImageIntoStudio: (sId: 'a' | 'b', img: GeneratedImage) => dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: sId, image: img } }),
        handleSetOriginalImage: (sId: 'a' | 'b', image: GeneratedImage) => dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: sId, image: image } }),
        handleSetActiveStudioTarget: (sId: 'a' | 'b') => dispatch({ type: 'SET_ACTIVE_STUDIO_TARGET', payload: sId }),
        handleToggleAutoGeneration: generationActions.handleToggleAutoGeneration,
        handleRunSelectiveGeneration: generationActions.handleRunSelectiveGeneration,
        handleRetryFailedCuts: generationActions.handleRetryFailedCuts,
        handleRunNormalization,
        handleAttachAudioToCut: (cutNumber: string, file: File) => { const reader = new FileReader(); reader.onload = (e) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: { audioDataUrls: [...(stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.audioDataUrls || []), e.target?.result as string] } } }); reader.readAsDataURL(file); },
        handleRemoveAudioFromCut: (cutNumber: string, idx: number) => { const current = stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.audioDataUrls || []; dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: { audioDataUrls: current.filter((_, i) => i !== idx) } } }); },
        handleSelectAsset: (asset: LibraryAsset) => {
            if (stateRef.current.guestSelectionTargetCutNumber) {
                const cutNumber = stateRef.current.guestSelectionTargetCutNumber;
                const guestName = window.prompt('게스트의 역할이나 이름을 입력하세요 (예: 경찰관, 친구, 도둑):', '조연') || '조연';
                dispatch({ 
                    type: 'UPDATE_CUT', 
                    payload: { 
                        cutNumber, 
                        data: { 
                            guestCharacterUrl: asset.imageDataUrl,
                            guestCharacterName: guestName
                        } 
                    } 
                });
                dispatch({ type: 'CLOSE_ASSET_LIBRARY' });
            } else if (stateRef.current.backgroundReplacementTargetCutNumber) {
                // Handle background replacement if needed
                const cutNumber = stateRef.current.backgroundReplacementTargetCutNumber;
                // ... logic for background replacement
                dispatch({ type: 'CLOSE_ASSET_LIBRARY' });
            }
        },
        handleSelectAssetForBackground: (asset: LibraryAsset, cutNumber: string) => {},
        handleGenerateMask: miscActions.handleGenerateMask,
        handleScrollToCut: (cutNumber: string) => { const el = document.getElementById(`cut-${cutNumber}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
        handleOpenReviewModalForEdit,
        handleRegenerateStoryboardDraft: async () => { 
            const { userInputScript, enrichedScript, speakerGender, characterDescriptions } = stateRef.current; 
            dispatch({ type: 'START_LOADING', payload: '재생성 중...' }); 
            try { 
                const normalizedScript = normalizeScriptCuts(userInputScript); 
                const seed = Math.floor(Math.random() * 100000); 
                const { blueprint, tokenCount: bToken } = await generateCinematicBlueprint(enrichedScript!, seed); 
                handleAddUsage(bToken, 0); 
                const { storyboard, locationDNAMap, tokenCount: sToken } = await generateEditableStoryboard(normalizedScript, enrichedScript!, blueprint, speakerGender, characterDescriptions, seed, stateRef.current.artStyle); 
                handleAddUsage(sToken, 0); 
                dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: storyboard }); 
                dispatch({ type: 'SET_LOCATION_VISUAL_DNA', payload: locationDNAMap }); 
            } catch (error) {
                console.error("Failed to regenerate storyboard:", error);
                addNotification('스토리보드 재생성 중 오류가 발생했습니다.', 'error');
            } finally { 
                dispatch({ type: 'STOP_LOADING' }); 
            } 
        },
        handleRegenerateSingleCut: async (cut: EditableCut) => { 
            try {
                const seed = Math.floor(Math.random() * 100000); 
                const res = await regenerateSingleCutDraft(cut, stateRef.current.speakerGender, seed); 
                handleAddUsage(res.tokenCount, 0); 
                return res; 
            } catch (error) {
                console.error("Failed to regenerate single cut:", error);
                addNotification('단일 컷 재생성 중 오류가 발생했습니다.', 'error');
                return null;
            }
        },
        handleUpdateAndFormatNarration: cutEditActions.handleUpdateAndFormatNarration,
        handleOpenReviewModal: (cutNumber: string) => {},
        handleOpenReviewModalForDirectEntry: () => updateUIState({ isStoryboardReviewModalOpen: true }),
        handleOpenCutSplitter: (cut: Cut) => dispatch({ type: 'OPEN_CUT_SPLITTER', payload: cut }),
        handleConfirmCutSplit: async (orig: Cut, points: { time: number; textIndex: number }[]) => { dispatch({ type: 'CLOSE_CUT_SPLITTER' }); let lastIdx = 0; const newCuts = points.map((p, i) => { const text = orig.narration.substring(lastIdx, p.textIndex); lastIdx = p.textIndex; return { ...orig, id: window.crypto.randomUUID(), cutNumber: `${orig.cutNumber}-${i+1}`, narration: text.trim(), selectedImageId: i === 0 ? orig.selectedImageId : null }; }); newCuts.push({ ...orig, id: window.crypto.randomUUID(), cutNumber: `${orig.cutNumber}-${points.length+1}`, narration: orig.narration.substring(lastIdx).trim(), selectedImageId: null }); dispatch({ type: 'REPLACE_CUT', payload: { originalCutNumber: orig.cutNumber, newCuts: newCuts as Cut[] } }); },
        handleConfirmDraftReview: async (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => {
            await handleRunNormalization(updatedScenes, modifiedCutIds);
        },
        handleOpenGuestSelection: (cutNumber: string) => dispatch({ type: 'START_GUEST_SELECTION', payload: cutNumber }),
        handleOpenAudioSplitter: () => updateUIState({ isAudioSplitterOpen: true }),
        handleConfirmAudioSplit,
        handleUploadProjectFile: (file: File) => { 
            const reader = new FileReader(); 
            reader.onload = (ev) => { try { const parsed = JSON.parse(ev.target?.result as string); dispatch({ type: 'RESTORE_STATE', payload: parsed }); } catch (e) { addNotification('실패', 'error'); } }; 
            reader.readAsText(file); 
        },
        handleThirdCharacterEdit: miscActions.handleThirdCharacterEdit,
        triggerConfetti,
        handleEditImageWithNanoWithRetry,
        handleOutpaintImageWithNanoWithRetry: miscActions.handleOutpaintImageWithNanoWithRetry,
        handleFillImageWithNanoWithRetry: miscActions.handleFillImageWithNanoWithRetry,
    };

    return (
        <AppContext.Provider value={{ state, dispatch, actions }}>
            {children}
            {state.isAudioSplitterOpen && state.generatedContent && (
                <AudioSplitterModal 
                    isOpen={state.isAudioSplitterOpen}
                    onClose={() => updateUIState({ isAudioSplitterOpen: false })}
                    scenes={state.generatedContent.scenes}
                    onConfirm={handleConfirmAudioSplit}
                />
            )}
        </AppContext.Provider>
    );
};

export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (context === undefined) throw new Error('useAppContext must be used within AppProvider');
    return context;
};
