
import { 
    enrichScriptWithDirections, analyzeCharacters, editImageWithNano, generateEditableStoryboard, 
    generateCharacterMask, generateTitleSuggestions,
    purifyImagePromptForSafety, regenerateCutFieldsForCharacterChange,
    regenerateCutFieldsForIntentChange, generateOutfitsForLocations, generateOutfitImage,
    verifyAndEnrichCutPrompt, regenerateOutfitDescription, injectPersonalityAndCreateSignaturePose,
    upscaleImageWithNano, renderTextOnImage, replaceBackground, generateMultiCharacterImage,
    outpaintImageWithNano, fillImageWithNano, generateFinalStoryboardFromEditable, generateSpeech,
    regenerateSceneFromModification, extractFieldsFromSceneDescription, regenerateSingleCutDraft, regenerateImagePrompts,
    generateCinematicBlueprint, analyzeHairStyle, formatTextWithSemanticBreaks, formatMultipleTextsWithSemanticBreaks, normalizeScriptCuts
} from './services/geminiService';
import React, { createContext, useContext, useReducer, useRef, useEffect, useCallback, useState } from 'react';
import { 
    AppDataState, AppAction, Cut, GeneratedImage, Notification, TextEditingTarget, EditableScene, StudioSession, CharacterDescription, NanoModel, EditableCut, ClosetCharacter, LibraryAsset, Scene, GeneratedScript, ArtStyle
} from './types';
import { loadOpenAiApiKey } from './utils/settingsStorage';
import JSZip from 'jszip';
import { AudioSplitterModal } from './components/AudioSplitterModal';
import { get, set } from 'idb-keyval';

// Define ConfettiPiece component locally
const ConfettiPiece: React.FC<{ type: 'fall' | 'explode'; style: React.CSSProperties }> = ({ type, style }) => (
    <div className={`fixed z-[100] pointer-events-none ${type === 'fall' ? 'animate-confetti-fall' : 'animate-confetti-explode'}`} style={style} />
);

// --- Types for UI State ---
interface UIState {
    isDownloadDropdownOpen: boolean;
    isModelDropdownOpen: boolean;
    headerHeight: number;
    isEditorOpen: boolean;
    editingImageInfo: any | null;
    isImageViewerOpen: boolean;
    viewerImage: { url: string, alt: string, prompt?: string } | null;
    isTextEditorOpen: boolean;
    textEditingTarget: TextEditingTarget | null;
    isSlideshowOpen: boolean;
    isCostumeModalOpen: boolean;
    isBatchAudioModalOpen: boolean;
    isAudioSplitterOpen: boolean;
    isCutSelectionModalOpen: boolean;
    titleSuggestions: string[];
    isGeneratingTitles: boolean;
    isStyleModalOpen: boolean;
    isStyleSettingsOpen?: boolean;
    isEnrichedScriptVisible: boolean;
    isThirdCharacterStudioOpen: boolean;
    isCutAssignmentModalOpen: boolean;
    imageToAssign: GeneratedImage | null;
    isTargetCutSelectionModalOpen: boolean;
    targetCutSelectionStudioId: 'a' | 'b' | null;
    youtubeUrl: string;
    confetti: React.ReactElement[];
    isStoryboardReviewModalOpen: boolean;
    isSceneAnalysisReviewModalOpen: boolean; 
    isCutPreviewModalOpen: boolean;
    analysisStage: 'character' | 'enrichment' | 'blueprint' | 'spatial' | 'storyboard' | 'idle';
    analysisProgress: number; 
}

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

// Factory for independent studio session objects
const createInitialStudioSession = (): StudioSession => ({
    originalImage: null,
    currentImage: null,
    history: [],
    referenceImageUrl: null,
    editPrompt: '',
    zoom: 1,
    pan: { x: 0, y: 0 },
    sourceCutForNextEdit: null,
});

const sanitizeState = (state: AppDataState): AppDataState => {
    const sanitized = JSON.parse(JSON.stringify(state)) as AppDataState;
    
    // Clean up global transient states
    sanitized.isLoading = false;
    sanitized.loadingMessage = '';
    sanitized.loadingMessageDetail = '';
    sanitized.isZipping = false;
    sanitized.zippingProgress = null;
    sanitized.isAutoGenerating = false;
    sanitized.isGeneratingSRT = false;
    sanitized.failedCutNumbers = [];
    
    // Clean up UI states that shouldn't persist across sessions
    sanitized.isAssetLibraryOpen = false;
    sanitized.isCutSplitterOpen = false;
    sanitized.backgroundReplacementTargetCutNumber = null;
    sanitized.backgroundReplacementSourceUrl = null;
    sanitized.guestSelectionTargetCutNumber = null;
    sanitized.cutToSplit = null;
    
    // Clean up character transient states
    if (sanitized.characterDescriptions) {
        Object.values(sanitized.characterDescriptions).forEach(char => {
            delete char.isEditingSheet;
            delete char.imageLoading;
            delete char.isRemovingBackground;
            delete char.isGeneratingAPose;
            delete char.isRegeneratingPrompt;
            delete char.isAutoGenerating;
            delete char.isRefiningAppearance;
            delete char.isGeneratingLocationOutfits;
        });
    }
    
    // Clean up cut transient states
    if (sanitized.generatedContent && sanitized.generatedContent.scenes) {
        sanitized.generatedContent.scenes.forEach(scene => {
            if (scene.cuts) {
                scene.cuts.forEach(cut => {
                    delete cut.imageLoading;
                    delete cut.isUpdatingIntent;
                    delete cut.isFormattingNarration;
                });
            }
        });
    }
    
    return sanitized;
};

const initialAppDataState: AppDataState = {
    appState: 'initial',
    generatedContent: null,
    editableStoryboard: null,
    storyboardSeed: null,
    characterDescriptions: {},
    locationVisualDNA: {},
    contextSummary: null,
    isLoading: false,
    loadingMessage: '',
    loadingMessageDetail: '',
    isZipping: false,
    zippingProgress: null,
    notifications: [],
    openAiApiKey: null,
    geminiTokenCount: 0,
    dalleImageCount: 0,
    userInputScript: `[SCENE START]
[장소: 어두컴컴한 주인공의 방]
[연출: 깊은 절망과 좌절. 책상 위 '불합격' 모니터 화면이 유일한 빛이다.]
책상 앞에 엎드려 어깨를 들썩이며 조용히 흐느껴 운다.
...또 떨어졌어. 이번엔 진짜 될 줄 알았는데... 나란 놈은 도대체 뭐가 문제인 거야...`,
    enrichedScript: null,
    storyTitle: null,
    speakerGender: 'male',
    assetLibrary: [],
    isAssetLibraryOpen: false,
    backgroundReplacementTargetCutNumber: null,
    backgroundReplacementSourceUrl: null,
    guestSelectionTargetCutNumber: null,
    closetCharacters: [],
    smartFieldSuggestions: {},
    animationStyle: 'none',
    generatedImageHistory: [],
    studioSessions: { a: createInitialStudioSession(), b: createInitialStudioSession() },
    nextStudioSlot: 'a',
    filenameTemplate: 'cut#{cut}_{character}_{id}',
    activeStudioTarget: 'a',
    isAutoGenerating: false,
    isGeneratingSRT: false,
    backgroundMusicUrl: null,
    backgroundMusicName: null,
    failedCutNumbers: [],
    isCutSplitterOpen: false,
    cutToSplit: null,
    artStyle: 'kyoto',
    customArtStyle: `전체적으로 고퀄리티 치비(Chibi) 스타일을 유지하되, 장면의 감정에 어울리는 만화적 기호(Manpu/Manga iconography)를 모든 컷에 자동으로 풍부하게 그려넣어줘. 
- 설레는 컷: 눈 속에 별 모양 반짝임, 캐릭터 주변에 떠다니는 분홍색 하트와 방울들.
- 당황한 컷: 머리 옆에 커다란 파란색 식은땀 한 방울, 번개 모양 기호.
- 기쁜 컷: 배경에 화사한 꽃잎 입자와 반짝이는 마름모꼴 장식들.
모든 장식물은 캐릭터와 배경 위에 '스티커'나 '이모지'를 붙인 것처럼 선명하고 귀엽게 표현해줘.`,
    selectedNanoModel: 'nano-2.5',
};

const initialUIState: UIState = {
    isDownloadDropdownOpen: false,
    isModelDropdownOpen: false,
    headerHeight: 0,
    isEditorOpen: false,
    editingImageInfo: null,
    isImageViewerOpen: false,
    viewerImage: null,
    isTextEditorOpen: false,
    textEditingTarget: null,
    isSlideshowOpen: false,
    isCostumeModalOpen: false,
    isBatchAudioModalOpen: false,
    isAudioSplitterOpen: false,
    isCutSelectionModalOpen: false,
    titleSuggestions: [],
    isGeneratingTitles: false,
    isStyleModalOpen: false,
    isStyleSettingsOpen: false,
    isEnrichedScriptVisible: false,
    isThirdCharacterStudioOpen: false,
    isCutAssignmentModalOpen: false,
    imageToAssign: null,
    isTargetCutSelectionModalOpen: false,
    targetCutSelectionStudioId: null,
    youtubeUrl: '',
    confetti: [],
    isStoryboardReviewModalOpen: false,
    isSceneAnalysisReviewModalOpen: false,
    isCutPreviewModalOpen: false,
    analysisStage: 'idle',
    analysisProgress: 0,
};

function appReducer(state: AppDataState, action: AppAction): AppDataState {
    switch (action.type) {
        case 'START_LOADING': return { ...state, isLoading: true, loadingMessage: action.payload, loadingMessageDetail: '', notifications: state.notifications.filter(n => n.type !== 'error') };
        case 'SET_LOADING_DETAIL': return { ...state, loadingMessageDetail: action.payload };
        case 'STOP_LOADING': return { ...state, isLoading: false, loadingMessage: '', loadingMessageDetail: '' };
        case 'SET_APP_STATE': return { ...state, appState: action.payload };
        case 'SET_CHARACTER_DESCRIPTIONS': return { ...state, characterDescriptions: action.payload };
        case 'SET_LOCATION_VISUAL_DNA': return { ...state, locationVisualDNA: action.payload };
        case 'UPDATE_CHARACTER_DESCRIPTION': return { ...state, characterDescriptions: { ...state.characterDescriptions, [action.payload.key]: { ...state.characterDescriptions[action.payload.key], ...action.payload.data } } };
        case 'SET_GENERATED_CONTENT': return { ...state, generatedContent: action.payload };
        case 'SET_EDITABLE_STORYBOARD': return { ...state, editableStoryboard: action.payload };
        case 'SET_STORYBOARD_SEED': return { ...state, storyboardSeed: action.payload };
        case 'UPDATE_CUT': {
            if (!state.generatedContent) return state;
            const newScenes = (state.generatedContent.scenes || []).map(scene => {
                const cuts = (scene.cuts || []);
                const cutIndex = cuts.findIndex(c => c.cutNumber === action.payload.cutNumber);
                if (cutIndex === -1) return scene;
                const newCuts = [...cuts];
                newCuts[cutIndex] = { ...newCuts[cutIndex], ...action.payload.data };
                return { ...scene, cuts: newCuts };
            });
            return { ...state, generatedContent: { ...state.generatedContent, scenes: newScenes } };
        }
        case 'SELECT_IMAGE_FOR_CUT': {
            const { cutNumber, imageId } = action.payload;
            if (!state.generatedContent) return state;
            const newScenes = state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => cut.cutNumber === cutNumber ? { ...cut, selectedImageId: imageId } : cut)
            }));
            return { ...state, generatedContent: { ...state.generatedContent, scenes: newScenes } };
        }
        case 'ADD_IMAGE_TO_CUT': {
            const { image, cutNumber } = action.payload;
            if (!state.generatedContent) return state;
            
            // Deduplicate history to prevent confusion
            const nextHistory = [image, ...state.generatedImageHistory.filter(img => img.id !== image.id)];
            const nextScenes = state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => cut.cutNumber === cutNumber ? { ...cut, selectedImageId: image.id } : cut)
            }));
            
            return { 
                ...state, 
                generatedImageHistory: nextHistory,
                generatedContent: { ...state.generatedContent, scenes: nextScenes }
            };
        }
        case 'DELETE_FROM_IMAGE_HISTORY': {
            const imageId = action.payload;
            if (!imageId) return state;
            const nextHistory = state.generatedImageHistory.filter(img => img.id !== imageId);
            
            // 1. 컷 선택 이미지 초기화 (Selected Image)
            const nextScenes = state.generatedContent ? state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => cut.selectedImageId === imageId ? { ...cut, selectedImageId: null } : cut)
            })) : null;
            
            // 2. 스튜디오 세션 이미지 정밀 제거 (Surgical nullification)
            const updateSessionSurgically = (session: StudioSession): StudioSession => {
                const isCurrentMatch = session.currentImage?.id === imageId;
                const isOriginalMatch = session.originalImage?.id === imageId;
                const nextSessionHistory = session.history.filter(img => img.id !== imageId);
                
                if (isCurrentMatch || isOriginalMatch || nextSessionHistory.length !== session.history.length) {
                    return {
                        ...session,
                        currentImage: isCurrentMatch ? null : session.currentImage,
                        originalImage: isOriginalMatch ? null : session.originalImage,
                        history: nextSessionHistory,
                        zoom: isCurrentMatch ? 1 : session.zoom,
                        pan: isCurrentMatch ? { x: 0, y: 0 } : session.pan
                    };
                }
                return session;
            };

            return { 
                ...state, 
                generatedImageHistory: nextHistory,
                generatedContent: nextScenes ? { ...state.generatedContent!, scenes: nextScenes } : state.generatedContent,
                studioSessions: { 
                    a: updateSessionSurgically(state.studioSessions.a), 
                    b: updateSessionSurgically(state.studioSessions.b) 
                } 
            };
        }
        case 'DELETE_CUT': {
            if (!state.generatedContent) return state;
            const updatedScenes = state.generatedContent.scenes.map(scene => ({
                ...scene, cuts: (scene.cuts || []).filter(cut => cut && cut.cutNumber !== action.payload)
            })).filter(scene => (scene.cuts || []).length > 0);
            return { ...state, generatedContent: { ...state.generatedContent, scenes: updatedScenes } };
        }
        case 'UPDATE_SCENES': 
            return { 
                ...state, 
                generatedContent: state.generatedContent 
                    ? { ...state.generatedContent, scenes: action.payload } 
                    : { scenes: action.payload } as GeneratedScript 
            };
        case 'UPDATE_SCENE': return state.generatedContent ? { ...state, generatedContent: { ...state.generatedContent, scenes: state.generatedContent.scenes.map(s => s.sceneNumber === action.payload.sceneNumber ? { ...s, ...action.payload.data } : s) } } : state;
        case 'START_ZIPPING': return { ...state, isZipping: true, zippingProgress: { current: 0, total: 0, isCancelling: false } };
        case 'END_ZIPPING': return { ...state, isZipping: false, zippingProgress: null };
        case 'SET_ZIPPING_PROGRESS': return { ...state, zippingProgress: action.payload };
        case 'ADD_NOTIFICATION': return { ...state, notifications: [...state.notifications, action.payload] };
        case 'REMOVE_NOTIFICATION': return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload) };
        case 'SET_OPENAI_API_KEY': return { ...state, openAiApiKey: action.payload };
        case 'SET_CONTEXT_SUMMARY': return { ...state, contextSummary: action.payload };
        case 'ADD_USAGE': return { ...state, geminiTokenCount: state.geminiTokenCount + action.payload.geminiTokens, dalleImageCount: state.dalleImageCount + action.payload.dalleImages };
        case 'RESET_STATE': return { ...initialAppDataState, openAiApiKey: state.openAiApiKey, assetLibrary: state.assetLibrary, closetCharacters: state.closetCharacters, filenameTemplate: state.filenameTemplate };
        case 'START_NEW_ANALYSIS': return { ...initialAppDataState, openAiApiKey: state.openAiApiKey, userInputScript: state.userInputScript, storyTitle: state.storyTitle, speakerGender: state.speakerGender, closetCharacters: state.closetCharacters, assetLibrary: state.assetLibrary, filenameTemplate: state.filenameTemplate };
        case 'SET_USER_INPUT_SCRIPT': return { ...state, userInputScript: action.payload };
        case 'SET_ENRICHED_SCRIPT': return { ...state, enrichedScript: action.payload };
        case 'SET_STORY_TITLE': return { ...state, storyTitle: action.payload };
        case 'SET_SPEAKER_GENDER': return { ...state, speakerGender: action.payload };
        case 'SET_ASSET_LIBRARY': return { ...state, assetLibrary: action.payload };
        case 'ADD_ASSET_TO_LIBRARY': return state.assetLibrary.some(a => a.id === action.payload.id) ? state : { ...state, assetLibrary: [...state.assetLibrary, action.payload] };
        case 'DELETE_ASSET_FROM_LIBRARY': return { ...state, assetLibrary: state.assetLibrary.filter(a => a.id !== action.payload) };
        case 'OPEN_ASSET_LIBRARY': return { ...state, isAssetLibraryOpen: true };
        case 'CLOSE_ASSET_LIBRARY': return { ...state, isAssetLibraryOpen: false, backgroundReplacementTargetCutNumber: null, backgroundReplacementSourceUrl: null, guestSelectionTargetCutNumber: null };
        case 'START_BACKGROUND_REPLACEMENT': return { ...state, isAssetLibraryOpen: true, backgroundReplacementTargetCutNumber: action.payload.cutNumber, backgroundReplacementSourceUrl: action.payload.sourceImageUrl };
        case 'FINISH_BACKGROUND_REPLACEMENT': return { ...state, isAssetLibraryOpen: false, backgroundReplacementTargetCutNumber: null, backgroundReplacementSourceUrl: null };
        case 'START_GUEST_SELECTION': return { ...state, isAssetLibraryOpen: true, guestSelectionTargetCutNumber: action.payload };
        case 'SET_CLOSET_CHARACTERS': return { ...state, closetCharacters: action.payload };
        case 'ADD_TO_CLOSET': return state.closetCharacters.some(c => c.id === action.payload.id) ? state : { ...state, closetCharacters: [...state.closetCharacters, action.payload] };
        case 'DELETE_FROM_CLOSET': return { ...state, closetCharacters: state.closetCharacters.filter(c => c.id !== action.payload) };
        case 'RESTORE_STATE': {
            const sanitizedPayload = sanitizeState(action.payload as AppDataState);
            return { ...initialAppDataState, ...sanitizedPayload, openAiApiKey: state.openAiApiKey };
        }
        case 'SET_SMART_FIELD_SUGGESTIONS': return { ...state, smartFieldSuggestions: { ...state.smartFieldSuggestions, [action.payload.cutId]: { ...state.smartFieldSuggestions[action.payload.cutId], [action.payload.field]: action.payload.suggestions } } };
        case 'CLEAR_SMART_FIELD_SUGGESTIONS': { const newSuggestions = { ...state.smartFieldSuggestions }; delete newSuggestions[action.payload.cutId]; return { ...state, smartFieldSuggestions: newSuggestions }; }
        case 'SET_ANIMATION_STYLE': return { ...state, animationStyle: action.payload };
        case 'ADD_TO_IMAGE_HISTORY': return { ...state, generatedImageHistory: [action.payload, ...state.generatedImageHistory] };
        case 'TOGGLE_NEXT_STUDIO_SLOT': return { ...state, nextStudioSlot: state.nextStudioSlot === 'a' ? 'b' : 'a' };
        case 'LOAD_IMAGE_INTO_STUDIO': return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: { ...state.studioSessions[action.payload.studioId], currentImage: action.payload.image, history: [action.payload.image], zoom: 1, pan: { x: 0, y: 0 }, sourceCutForNextEdit: action.payload.image.sourceCutNumber } } };
        case 'LOAD_USER_IMAGE_INTO_STUDIO': {
            const { studioId, imageDataUrl } = action.payload;
            const newImage: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl: imageDataUrl, sourceCutNumber: 'user-upload-original', prompt: 'User-uploaded image', engine: (state.selectedNanoModel === 'nano-3pro' || state.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', createdAt: new Date().toISOString() };
            return { ...state, studioSessions: { ...state.studioSessions, [studioId]: { ...state.studioSessions[studioId], originalImage: newImage } } };
        }
        case 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD': {
            const { studioId, imageDataUrl } = action.payload;
            const session = state.studioSessions[studioId];
            const newImage: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl: imageDataUrl, sourceCutNumber: session.currentImage?.sourceCutNumber || 'user-upload', prompt: 'User-uploaded image (edit)', engine: (state.selectedNanoModel === 'nano-3pro' || state.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', createdAt: new Date().toISOString() };
            if (!session.originalImage) return { ...state, studioSessions: { ...state.studioSessions, [studioId]: { ...createInitialStudioSession(), originalImage: newImage, currentImage: newImage, history: [newImage] } } };
            return { ...state, studioSessions: { ...state.studioSessions, [studioId]: { ...session, currentImage: newImage, history: [...session.history, newImage] } } };
        }
        case 'UPDATE_STUDIO_SESSION': return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: { ...state.studioSessions[action.payload.studioId], ...action.payload.data } } };
        case 'SET_ORIGINAL_IMAGE': return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: { ...state.studioSessions[action.payload.studioId], originalImage: action.payload.image } } };
        case 'PREPARE_STUDIO_FOR_CUT': return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: { ...state.studioSessions[action.payload.studioId], editPrompt: action.payload.prompt, sourceCutForNextEdit: action.payload.cutNumber } } };
        case 'CLEAR_STUDIO_SESSION': return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: createInitialStudioSession() } };
        case 'REVERT_STUDIO_SESSION': {
            const session = state.studioSessions[action.payload.studioId];
            const draftImage = session.history?.[0];
            if (!draftImage) return state;
            return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: { ...session, currentImage: draftImage, history: [draftImage], zoom: 1, pan: { x: 0, y: 0 } } } };
        }
        case 'UNDO_STUDIO_SESSION': {
            const session = state.studioSessions[action.payload.studioId];
            if (session.history.length <= 1) return state;
            const newHistory = session.history.slice(0, -1);
            return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: { ...session, currentImage: newHistory[newHistory.length - 1], history: newHistory } } };
        }
        case 'COPY_ORIGINAL_TO_CURRENT': {
            const session = state.studioSessions[action.payload.studioId];
            if (!session.originalImage) return state;
            return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: { ...session, currentImage: session.originalImage, history: [...session.history, session.originalImage], zoom: 1, pan: { x: 0, y: 0 } } } };
        }
        case 'COPY_PROMPT_TO_STUDIOS': return { ...state, studioSessions: { a: { ...state.studioSessions.a, editPrompt: action.payload }, b: { ...state.studioSessions.b, editPrompt: action.payload } } };
        case 'SET_FILENAME_TEMPLATE': return { ...state, filenameTemplate: action.payload };
        case 'SET_ACTIVE_STUDIO_TARGET': return { ...state, activeStudioTarget: action.payload };
        case 'UPDATE_STUDIO_TRANSFORM': return { ...state, studioSessions: { ...state.studioSessions, [action.payload.studioId]: { ...state.studioSessions[action.payload.studioId], zoom: action.payload.zoom, pan: action.payload.pan } } };
        case 'START_AUTO_GENERATION': {
            const targetType = action.payload || '전체';
            return { ...state, isAutoGenerating: true, isLoading: true, loadingMessage: `${targetType} 자동 생성 중...`, failedCutNumbers: [] };
        }
        case 'STOP_AUTO_GENERATION': return { ...state, isAutoGenerating: false, isLoading: false, loadingMessage: '', loadingMessageDetail: '' };
        case 'SET_FAILED_CUTS': return { ...state, failedCutNumbers: action.payload };
        case 'SET_BACKGROUND_MUSIC': return { ...state, backgroundMusicUrl: action.payload.url, backgroundMusicName: action.payload.name };
        case 'OPEN_CUT_SPLITTER': return { ...state, isCutSplitterOpen: true, cutToSplit: action.payload };
        case 'CLOSE_CUT_SPLITTER': return { ...state, isCutSplitterOpen: false, cutToSplit: null };
        case 'REPLACE_CUT': {
            if (!state.generatedContent) return state;
            const { originalCutNumber, newCuts } = action.payload;
            const newScenes = state.generatedContent.scenes.map(scene => {
                const cuts = (scene.cuts || []);
                const cutIndex = cuts.findIndex(c => c.cutNumber === originalCutNumber);
                if (cutIndex === -1) return scene;
                const updatedCuts = [...cuts];
                updatedCuts.splice(cutIndex, 1, ...newCuts);
                return { ...scene, cuts: updatedCuts };
            });
            return { ...state, generatedContent: { ...state.generatedContent, scenes: newScenes } };
        }
        case 'SET_LOCATION_OUTFIT_IMAGE_STATE': {
            const { characterKey, location, state: imageState } = action.payload;
            const char = state.characterDescriptions[characterKey];
            if (!char) return state;
            return { ...state, characterDescriptions: { ...state.characterDescriptions, [characterKey]: { ...char, locationOutfitImages: { ...(char.locationOutfitImages || {}), [location]: { ...(char.locationOutfitImages?.[location] || {}), ...imageState } } } } };
        }
        case 'SET_ART_STYLE': return { ...state, artStyle: action.payload };
        case 'SET_CUSTOM_ART_STYLE': return { ...state, customArtStyle: action.payload };
        case 'SET_OUTFIT_MODIFICATION_STATE': {
            const { characterKey, location, isLoading } = action.payload;
            const char = state.characterDescriptions[characterKey];
            if (!char) return state;
            return { ...state, characterDescriptions: { ...state.characterDescriptions, [characterKey]: { ...char, isRequestingOutfitModification: { ...(char.isRequestingOutfitModification || {}), [location]: isLoading } } } };
        }
        case 'UPDATE_LOCATION_OUTFIT': {
            const { characterKey, location, korean, english } = action.payload;
            const char = state.characterDescriptions[characterKey];
            if (!char) return state;
            // UPDATE: In English-only mode, we populate both fields with English to maintain structure compatibility
            return { ...state, characterDescriptions: { ...state.characterDescriptions, [characterKey]: { ...char, locations: { ...char.locations, [location]: english }, koreanLocations: { ...char.koreanLocations, [location]: english } } } };
        }
        case 'SET_NANO_MODEL': return { ...state, selectedNanoModel: action.payload };
        default: return state;
    }
}

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

    // --- Standalone function definitions to avoid circular reference in 'actions' object ---
    
    const handleEditInStudio = async (sId: 'a' | 'b', img: GeneratedImage, p: string, ref: string | null, mask?: string, override?: string) => {
        dispatch({ type: 'START_LOADING', payload: '이미지 수정 중...' });
        try { 
            const finalSourceCut = override || stateRef.current.studioSessions[sId].sourceCutForNextEdit || img.sourceCutNumber;
            const cut = stateRef.current.generatedContent?.scenes.flatMap(s => s.cuts).find(c => c.cutNumber === finalSourceCut);
            const styleToUse = cut?.artStyleOverride || stateRef.current.artStyle;
            const artStylePrompt = getArtStylePrompt(styleToUse);

            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(img.imageUrl, p, img.prompt, ref || undefined, mask, undefined, false, artStylePrompt); 
            handleAddUsage(tokenCount, 0); 
            
            const newImg: GeneratedImage = { 
                id: window.crypto.randomUUID(), 
                imageUrl, 
                sourceCutNumber: finalSourceCut, 
                prompt: p, 
                engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', 
                createdAt: new Date().toISOString() 
            }; 
            
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: finalSourceCut } });
            dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { currentImage: newImg, history: [...stateRef.current.studioSessions[sId].history, newImg] } } }); 
        }
        catch (e) { addNotification('수정 실패', 'error'); } finally { dispatch({ type: 'STOP_LOADING' }); }
    };

    const handleCreateInStudio = async (sId: 'a' | 'b', base: GeneratedImage, p: string) => {
        dispatch({ type: 'START_LOADING', payload: '이미지 생성 중...' });
        try { 
            const finalSourceCut = stateRef.current.studioSessions[sId].sourceCutForNextEdit || 'custom';
            const cut = stateRef.current.generatedContent?.scenes.flatMap(s => s.cuts).find(c => c.cutNumber === finalSourceCut);
            const styleToUse = cut?.artStyleOverride || stateRef.current.artStyle;
            const artStylePrompt = getArtStylePrompt(styleToUse);

            const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(base.imageUrl, p, base.prompt, undefined, undefined, undefined, true, artStylePrompt); 
            handleAddUsage(tokenCount, 0); 
            
            const newImg: GeneratedImage = { 
                id: window.crypto.randomUUID(), 
                imageUrl, 
                sourceCutNumber: finalSourceCut, 
                prompt: p, 
                engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', 
                createdAt: new Date().toISOString() 
            }; 
            
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: finalSourceCut } });
            dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { currentImage: newImg, history: [...stateRef.current.studioSessions[sId].history, newImg] } } }); 
        }
        catch (e) { addNotification('생성 실패', 'error'); } finally { dispatch({ type: 'STOP_LOADING' }); }
    };

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

        const handleRunSelectiveGeneration = useCallback(async (selectedCutNumbers: string[], overrideContent?: GeneratedScript) => {
        const content = overrideContent || stateRef.current.generatedContent;
        const characterDescriptions = stateRef.current.characterDescriptions;
        if (!content) return;

        const thisSessionId = ++currentSessionIdRef.current;
        isAutoGeneratingLocalRef.current = false;
        await new Promise(r => setTimeout(r, 100));

        const allCuts = content.scenes.flatMap(s => s.cuts);
        const targets = selectedCutNumbers.length > 0 
            ? allCuts.filter(c => selectedCutNumbers.includes(c.cutNumber))
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
                const presentCharKeys = Object.keys(characterDescriptions).filter(key => 
                    cut.characters.some(c => c.includes(characterDescriptions[key].koreanName))
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
                    const newImage: GeneratedImage = {
                        id: window.crypto.randomUUID(),
                        imageUrl: resultImageUrl,
                        sourceCutNumber: cut.cutNumber,
                        prompt: prompt,
                        engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano',
                        createdAt: new Date().toISOString(),
                    };

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
    }, [addNotification, dispatch, getArtStylePrompt, getVisionModelName, handleAddUsage, triggerConfetti, calculateFinalPrompt, handleEditImageWithNanoWithRetry]);

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
                engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano',
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
        handleUploadSourceImageForStudio: async (key: string, file: File) => {
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
        },
        handleUploadUpscaledImageForStudio: async (key: string, file: File) => {
            const reader = new FileReader(); reader.onload = (e) => dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { upscaledImageUrl: e.target?.result as string } } }); reader.readAsDataURL(file);
        },
        handleUpscaleCharacterImage: async (key: string) => {
            const char = stateRef.current.characterDescriptions[key]; if (!char.sourceImageUrl) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isUpscaling: true } } });
            try { const { imageUrl, tokenCount } = await upscaleImageWithNano(char.sourceImageUrl, getVisionModelName()); handleAddUsage(tokenCount, 0); dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { upscaledImageUrl: imageUrl } } }); }
            finally { dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isUpscaling: false } } }); }
        },
        handleInjectPersonality: async (key: string) => {
            const char = stateRef.current.characterDescriptions[key]; if (!char.upscaledImageUrl) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isInjectingPersonality: true } } });
            try { const { imageUrl, tokenCount } = await injectPersonalityAndCreateSignaturePose(char.upscaledImageUrl, char, getVisionModelName(), getArtStylePrompt()); handleAddUsage(tokenCount, 0); dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: [imageUrl] } } }); }
            finally { dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isInjectingPersonality: false } } }); }
        },
        handleEditSignaturePose: async (key: string, p: string) => {
            const char = stateRef.current.characterDescriptions[key]; const current = char.characterSheetHistory?.[char.characterSheetHistory.length - 1]; if (!current) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isEditingSheet: true } } });
            try { const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(current, p, '', char.upscaledImageUrl); handleAddUsage(tokenCount, 0); dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: [...(char.characterSheetHistory || []), imageUrl] } } }); }
            finally { dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isEditingSheet: false } } }); }
        },
        handleUndoSignaturePoseEdit: (key: string) => {
            const char = stateRef.current.characterDescriptions[key]; if (char.characterSheetHistory && char.characterSheetHistory.length > 1) dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { characterSheetHistory: char.characterSheetHistory.slice(0, -1) } } });
        },
        handleEditMannequin: async (key: string, p: string) => {
            const char = stateRef.current.characterDescriptions[key];
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
            const char = stateRef.current.characterDescriptions[key]; if (!char) return;
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
            }
            finally { dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isGeneratingLocationOutfits: false } } }); }
        },
        handleGenerateOutfitImage: async (key: string, loc: string, desc: string) => {
            dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageLoading: true } } });
            try { const { imageUrl, tokenCount } = await generateOutfitImage(desc, getVisionModelName()); handleAddUsage(tokenCount, 0); dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageUrl, imageLoading: false } } }); }
            catch (e) { dispatch({ type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: key, location: loc, state: { imageLoading: false } } }); }
        },
        handleTryOnOutfit: async (key: string, kor: string, eng: string) => {
            const char = stateRef.current.characterDescriptions[key]; const current = char.characterSheetHistory?.[char.characterSheetHistory.length - 1]; if (!current) return;
            dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: true } } });
            try { 
                const prompt = `Change character's clothes to: ${eng}. Keep identity.`; 
                const { imageUrl, tokenCount = 0 } = await handleEditImageWithNanoWithRetry(current, prompt, '', char.upscaledImageUrl); 
                handleAddUsage(tokenCount, 0); 
                dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { mannequinImageUrl: imageUrl, mannequinHistory: [...(char.mannequinHistory || []), imageUrl] } } }); 
            }
            finally { dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data: { isApplyingCostume: false } } }); }
        },
        handleModifyOutfitDescription: async (key: string, loc: string, req: string) => {
            const char = stateRef.current.characterDescriptions[key]; if (!char) return;
            dispatch({ type: 'SET_OUTFIT_MODIFICATION_STATE', payload: { characterKey: key, location: loc, isLoading: true } });
            try { 
                // Pass English description as original
                const { newDescription, tokenCount } = await regenerateOutfitDescription(char.locations[loc], req, char.koreanName, char.gender); 
                handleAddUsage(tokenCount, 0); 
                // Update both fields with the new English description
                dispatch({ type: 'UPDATE_LOCATION_OUTFIT', payload: { characterKey: key, location: loc, korean: newDescription, english: newDescription } }); 
            }
            finally { dispatch({ type: 'SET_OUTFIT_MODIFICATION_STATE', payload: { characterKey: key, location: loc, isLoading: false } }); }
        },
        handleUpdateCutCharacters: async (cutNumber: string, names: string[]) => {
            const target = stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber);
            const { characterDescriptions } = stateRef.current;
            if (target) {
                const profileOutfitParts: string[] = [];
                names.forEach(name => {
                    const key = Object.keys(characterDescriptions).find(k => characterDescriptions[k].koreanName === name);
                    if (key && characterDescriptions[key]) {
                        const hair = characterDescriptions[key].hairStyleDescription ? `(${characterDescriptions[key].hairStyleDescription}) ` : '';
                        // Use English locations
                        const outfitText = characterDescriptions[key].locations?.[target.location] || characterDescriptions[key].locations?.['기본 의상'] || characterDescriptions[key].baseAppearance || 'standard outfit';
                        profileOutfitParts.push(`[${name}: ${hair}${outfitText}]`);
                    }
                });
                const mechanicalOutfit = profileOutfitParts.join(' ');
                const nextCut = { ...target, characters: names, characterOutfit: mechanicalOutfit };
                dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { characters: names, characterOutfit: mechanicalOutfit, imagePrompt: calculateFinalPrompt(nextCut) } } });
            }
        },
        handleUpdateCutIntent: async (cutNumber: string, intent: string) => {
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { directorialIntent: intent, isUpdatingIntent: true } } });
            try {
                const { characterDescriptions } = stateRef.current;
                const target = stateRef.current.generatedContent?.scenes.flatMap(s => s.cuts).find(c => c.cutNumber === cutNumber);
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
        },
        handleAnalyzeYoutubeUrl: async () => {},
        handleEditInStudio,
        handleCreateInStudio,
        handleConfirmCutAssignment: (cutNumber: string) => {
            const img = stateRef.current.imageToAssign; if (img) { 
                const updated = { ...img, id: window.crypto.randomUUID(), sourceCutNumber: cutNumber }; 
                dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: updated, cutNumber } }); 
                updateUIState({ isCutAssignmentModalOpen: false, imageToAssign: null }); 
            }
        },
        handleOpenTargetCutSelector: (sId: 'a' | 'b') => updateUIState({ isTargetCutSelectionModalOpen: true, targetCutSelectionStudioId: sId }),
        handleConfirmTargetCutSelection: (cutNumber: string) => { 
            const studioId = stateRef.current.targetCutSelectionStudioId;
            if (studioId) { 
                const session = stateRef.current.studioSessions[studioId];
                
                // Update history images within session to the new target cut for consistency
                const nextHistory = session.history.map(img => ({ ...img, sourceCutNumber: cutNumber }));
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
        },
        handleReplaceBackground: async (newBackgroundPrompt: string, cutNumber: string) => {},
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
        handleStudioRefill: (sId: 'a' | 'b') => Promise.resolve(),
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
        handleDeleteCut: (cutNumber: string) => dispatch({ type: 'DELETE_CUT', payload: cutNumber }),
        handleTextRender: async (target: TextEditingTarget, text: string, type: 'speech' | 'narration', char?: string) => {
            dispatch({ type: 'START_LOADING', payload: '텍스트 렌더링 중...' });
            try { const { imageUrl, tokenCount } = await renderTextOnImage({ ...target, text, textType: type, characterName: char }, getVisionModelName()); handleAddUsage(tokenCount, 0); const newImg: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl, sourceCutNumber: target.cutNumber, prompt: text, engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', createdAt: new Date().toISOString() }; dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: target.cutNumber } }); } finally { dispatch({ type: 'STOP_LOADING' }); }
        },
        handleAutoGenerateImageForCut: (cut: Cut) => handleRunSelectiveGeneration([cut.cutNumber]),
        handleApplyAndRunPrompt: (p: string, cutNumber: string) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: stateRef.current.activeStudioTarget, data: { editPrompt: p, sourceCutForNextEdit: cutNumber } } }),
        handleOriginalPromptToActiveStudio: (p: string) => handleCreateInStudio(stateRef.current.activeStudioTarget, stateRef.current.studioSessions[stateRef.current.activeStudioTarget].originalImage!, p),
        handlePrepareStudioForCut: (cutNumber: string, p: string) => dispatch({ type: 'PREPARE_STUDIO_FOR_CUT', payload: { studioId: stateRef.current.activeStudioTarget, cutNumber, prompt: p } }),
        handleUpdateCutFieldAndRegenerate: async (cutNumber: string, field: keyof Cut, val: string) => { const target = stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber); if (!target) return; const updates: any = { [field]: val }; if (field !== 'imagePrompt') { const temp = { ...target, ...updates }; updates.imagePrompt = calculateFinalPrompt(temp as any); } dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: updates } }); },
        handleUpdateCutIntentAndRegenerate: async (cutNumber: string, intent: string) => {
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { directorialIntent: intent, isUpdatingIntent: true } } });
            try {
                const { characterDescriptions } = stateRef.current;
                const target = stateRef.current.generatedContent?.scenes.flatMap(s => s.cuts).find(c => c.cutNumber === cutNumber);
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
        },
        handleRefineCharacter: (cutNumber: string, name: string) => { 
            const charKey = Object.keys(stateRef.current.characterDescriptions).find(k => stateRef.current.characterDescriptions[k].koreanName === name);
            if (!charKey) return;
            const ref = stateRef.current.characterDescriptions[charKey].upscaledImageUrl || (stateRef.current.characterDescriptions[charKey].characterSheetHistory && stateRef.current.characterDescriptions[charKey].characterSheetHistory![stateRef.current.characterDescriptions[charKey].characterSheetHistory!.length - 1]);
            if (!ref) return;
            dispatch({ type: 'START_LOADING', payload: `${name} 얼굴 정제 중...` });
            handleEditImageWithNanoWithRetry(stateRef.current.generatedImageHistory.find(i => i.id === stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.selectedImageId)?.imageUrl || '', `Maintain face identity from reference. Match hairstyle: ${stateRef.current.characterDescriptions[charKey].hairStyleDescription}`, '', ref).then(res => { 
                handleAddUsage(res.tokenCount, 0); 
                const newImg: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl: res.imageUrl, sourceCutNumber: cutNumber, prompt: 'Identity refined', engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', createdAt: new Date().toISOString() }; 
                dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } });
                dispatch({ type: 'STOP_LOADING' }); 
            }); 
        },
        handleRefineImage: async (cutNumber: string) => { 
            dispatch({ type: 'START_LOADING', payload: '이미지 정제 중...' }); 
            const target = stateRef.current.generatedImageHistory.find(i=>i.id===stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.selectedImageId); 
            if (target) { 
                const { imageUrl, tokenCount } = await handleEditImageWithNanoWithRetry(target.imageUrl, "Transform to high quality chibi illustration style. Clean lines, vibrant colors.", target.prompt); 
                handleAddUsage(tokenCount, 0); 
                const newImg: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl: imageUrl, sourceCutNumber: cutNumber, prompt: 'Refined Quality', engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', createdAt: new Date().toISOString() }; 
                dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } });
            } 
            dispatch({ type: 'STOP_LOADING' }); 
        },
        handleUserImageUpload: (sId: 'a' | 'b', url: string) => dispatch({ type: 'LOAD_USER_IMAGE_INTO_STUDIO', payload: { studioId: sId, imageDataUrl: url } }),
        handleUpdateStudioImageFromUpload: (sId: 'a' | 'b', url: string) => dispatch({ type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: sId, imageDataUrl: url } }),
        handleUserImageUploadForStudio: (sId: 'a' | 'b', url: string) => dispatch({ type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: sId, imageDataUrl: url } }),
        handleLoadImageIntoStudio: (sId: 'a' | 'b', img: GeneratedImage) => dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: sId, image: img } }),
        handleSetOriginalImage: (sId: 'a' | 'b', image: GeneratedImage) => dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: sId, image: image } }),
        handleSetActiveStudioTarget: (sId: 'a' | 'b') => dispatch({ type: 'SET_ACTIVE_STUDIO_TARGET', payload: sId }),
        handleToggleAutoGeneration: () => { if (stateRef.current.isAutoGenerating) { isAutoGeneratingLocalRef.current = false; dispatch({ type: 'STOP_AUTO_GENERATION' }); } else handleRunSelectiveGeneration([]); },
        handleRunSelectiveGeneration,
        handleRetryFailedCuts: async () => handleRunSelectiveGeneration(stateRef.current.failedCutNumbers),
        handleRunNormalization,
        handleAttachAudioToCut: (cutNumber: string, file: File) => { const reader = new FileReader(); reader.onload = (e) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: { audioDataUrls: [...(stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.audioDataUrls || []), e.target?.result as string] } } }); reader.readAsDataURL(file); },
        handleRemoveAudioFromCut: (cutNumber: string, idx: number) => { const current = stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.audioDataUrls || []; dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: { audioDataUrls: current.filter((_, i) => i !== idx) } } }); },
        handleUpdateCut: (cutNumber: string, data: Partial<Cut>) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data } }),
        handleSelectImageForCut: (cutNumber: string, id: string | null) => dispatch({ type: 'SELECT_IMAGE_FOR_CUT', payload: { cutNumber: cutNumber, imageId: id } }),
        handleAssignImageToCut: (cutNumber: string, image: GeneratedImage) => {
            const updated = { ...image, id: window.crypto.randomUUID(), sourceCutNumber: cutNumber }; 
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: updated, cutNumber } }); 
        },
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
        handleAllCharacterHairAnalysis: async (characterKey: string, imageUrl: string) => {},
        handleAddEffectToPrompt: (cutNumber: string, effectPrompt: string) => {},
        handleRemoveEffectFromPrompt: (cutNumber: string, effectPrompt: string) => {},
        handleGenerateMask: async (url: string) => { const res = await generateCharacterMask(url, getVisionModelName()); if (res) handleAddUsage(res.tokenCount, 0); return res?.imageUrl || null; },
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
        handleUpdateAndFormatNarration,
        handleOpenReviewModal: (cutNumber: string) => {},
        handleOpenReviewModalForDirectEntry: () => updateUIState({ isStoryboardReviewModalOpen: true }),
        handleUploadImageForCut: (cutNumber: string, file: File) => { const reader = new FileReader(); reader.onload = (e) => { const newImg: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl: e.target?.result as string, sourceCutNumber: cutNumber, prompt: 'User Upload', engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', createdAt: new Date().toISOString() }; dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } }); }; reader.readAsDataURL(file); },
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
        handleThirdCharacterEdit: async (baseImage: GeneratedImage, referenceImage: GeneratedImage, characterToReplace: string) => {
            dispatch({ type: 'START_LOADING', payload: '제3인물 교체 중...' });
            try {
                const editPrompt = `Replace the character "${characterToReplace}" with the character from the reference image. Maintain the original background and art style.`;
                const res = await handleEditImageWithNanoWithRetry(baseImage.imageUrl, editPrompt, baseImage.prompt, referenceImage.imageUrl);
                const newImg: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl: res.imageUrl, sourceCutNumber: baseImage.sourceCutNumber, prompt: editPrompt, engine: (stateRef.current.selectedNanoModel === 'nano-3pro' || stateRef.current.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano', createdAt: new Date().toISOString() };
                dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: baseImage.sourceCutNumber } });
                updateUIState({ isThirdCharacterStudioOpen: false });
                addNotification('제3인물 교체가 완료되었습니다.', 'success');
            } catch (e) { addNotification('교체 실패', 'error'); } finally { dispatch({ type: 'STOP_LOADING' }); }
        },
        triggerConfetti,
        handleEditImageWithNanoWithRetry,
        handleOutpaintImageWithNanoWithRetry: async (baseImageUrl: string, direction: 'up' | 'down' | 'left' | 'right', originalPrompt?: string) => {
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
        },
        handleFillImageWithNanoWithRetry: async (baseImageUrl: string, originalPrompt?: string, maskBase64?: string) => { 
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
        },
        handleUpdateCutArtStyle: (cutNumber: string, style: ArtStyle | undefined) => {
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { artStyleOverride: style } } });
        },
        handleBatchUpdateStyle: (style: ArtStyle, customText: string) => {
            // 1. Update Global State
            dispatch({ type: 'SET_ART_STYLE', payload: style });
            dispatch({ type: 'SET_CUSTOM_ART_STYLE', payload: customText });
            
            // 2. Trigger updates for draft scenes if they exist (to ensure fresh state for generation)
            if (stateRef.current.editableStoryboard) {
                // Since the style is applied at *Generation Time* via getArtStylePrompt(),
                // we technically don't need to rewrite the `imagePrompt` text in the draft *unless* 
                // the style change implies a fundamental shift in character/scene description.
                // However, user feedback usually benefits from a notification.
                addNotification(`화풍이 '${style}'로 변경되었습니다. '검수 완료'를 누르면 새 스타일이 적용됩니다.`, 'success');
            }
        }
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
