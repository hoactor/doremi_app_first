
export type Gender = 'male' | 'female';
export type ImageRatio = '1:1' | '16:9' | '9:16';
export type AppState = 'initial' | 'storyboardGenerated';
export type SceneDirectionTheme = string;
export type NanoModel = 'nano-2.5' | 'nano-3.1' | 'nano-3pro';
export type ArtStyle = 'normal' | 'moe' | 'dalle-chibi' | 'custom' | 'vibrant' | 'kyoto';

export interface GeneratedImage {
    id: string;
    imageUrl: string;
    sourceCutNumber: string;
    prompt: string;
    engine: 'dalle3' | 'nano' | 'nano-v3';
    createdAt: string;
}

export interface CostumeSuggestion {
    id: string;
    styleName: string;
    englishDescription: string;
    koreanDescription: string;
    imageUrl?: string;
    imageLoading?: boolean;
}

export interface CharacterImage {
    id: string;
    url: string;
    prompt: string;
}

export interface CharacterDescription {
    koreanName: string;
    koreanBaseAppearance: string;
    baseAppearance: string;
    gender: 'male' | 'female';
    personality: string;
    locations: { [location: string]: string };
    koreanLocations: { [location: string]: string };
    firstScenePrompt?: string;
    revisedPrompt?: string;
    characterSheetHistory?: string[]; // Formerly characterSheetUrl
    isEditingSheet?: boolean; // For loading state
    imageLoading?: boolean;
    images?: CharacterImage[]; // Versions of the character image
    transparentImageUrl?: string;
    aPoseImageUrl?: string;
    isRemovingBackground?: boolean;
    isGeneratingAPose?: boolean;
    isRegeneratingPrompt?: boolean;
    isAutoGenerating?: boolean;
    isRefiningAppearance?: boolean;
    firstSceneAction?: string;
    isExtractingBackgrounds?: boolean;
    costumeSourceImageUrl?: string | null;
    costumeEnglishDescription?: string | null;
    costumeKoreanDescription?: string | null;
    isAnalyzingCostume?: boolean;
    isGeneratingLocationOutfits?: boolean;
    outfitPresets?: { name: string, description: string }[];
    locationOutfitImages?: { [location: string]: { imageUrl?: string; imageLoading?: boolean } };
    // New fields for Costume Studio
    mannequinImageUrl?: string | null;
    mannequinHistory?: string[]; // NEW: For step 3 undo functionality
    isApplyingCostume?: boolean;
    isRequestingOutfitModification?: { [location: string]: boolean };
    
    // New fields for Character Sheet Studio
    sourceImageUrl?: string; // The very first image uploaded by the user
    isUnifyingStyle?: boolean;
    isInjectingPersonality?: boolean;
    upscaledImageUrl?: string;
    isUpscaling?: boolean;

    // NEW: Character Visual DNA Tracking
    hairStyleDescription?: string; 
    facialFeatures?: string; // NEW: Added facial bone structure and features
    isAnalyzingHair?: boolean;
}

export interface Cut {
    id: string;
    cutNumber: string;
    narration: string;
    characters: string[];
    location: string;
    cameraAngle: string;
    sceneDescription: string;
    characterEmotionAndExpression: string;
    characterPose: string;
    characterOutfit: string;
    locationDescription: string;
    otherNotes: string;
    imageUrls: string[];
    suggestedEffect?: { name: string; prompt: string; } | null;
    imageLoading: boolean;
    audioDataUrls?: string[];
    audioDuration?: number; // Duration of the assigned audio in seconds
    selectedImageId: string | null;
    directorialIntent?: string;
    isUpdatingIntent?: boolean;
    dialogueSpeaker?: string; // Explicitly selected speaker for dialogue in this cut
    // Guest Character Fields
    guestCharacterUrl?: string | null;
    guestCharacterName?: string | null;
    // Typecast Specific Fields
    voiceEmotion?: string;
    voicePitch?: number;
    voiceSpeed?: number;
    isFormattingNarration?: boolean;
    imagePrompt?: string; // Final combined prompt used for generation
    artStyleOverride?: ArtStyle; // NEW: Specific art style for this cut
}

export interface Scene {
    sceneNumber: number;
    title: string;
    settingPrompt: string;
    cuts: Cut[];
}

export interface GeneratedScript {
    scenes: Scene[];
}

export interface CharacterLocationStyle {}
export interface ComicPanelPlan {}

export interface LibraryAsset {
    id: string;
    imageDataUrl: string;
    prompt: string;
    tags: {
        location?: string[];
        objects?: string[];
        mood?: string[];
        time?: string;
        category?: ('인물' | '배경')[];
    };
    source: {
        type: 'character' | 'background' | 'cut';
        name: string;
    };
    createdAt: string;
}

export interface MasterStyleGuide {
    palette: string[];
    keywords: string[];
}

export interface Notification {
    id: number;
    message: string;
    type: 'error' | 'success' | 'info';
}

export interface ClosetCharacter {
    id: string;
    name: string;
    imageDataUrl: string;
}

export interface StudioSession {
    originalImage: GeneratedImage | null;
    currentImage: GeneratedImage | null;
    history: GeneratedImage[];
    referenceImageUrl: string | null;
    editPrompt: string;
    zoom: number;
    pan: { x: number; y: number };
    sourceCutForNextEdit: string | null;
}

export interface EditableCut {
    id: string;
    cutNumber: string;
    narrationText: string;
    character: string[];
    location: string;
    sceneDescription: string;
    characterEmotionAndExpression: string;
    characterPose: string;
    characterOutfit: string;
    locationDescription: string;
    otherNotes: string;
    suggestedEffect?: { name: string; prompt: string; } | null;
    directorialIntent?: string;
    // Chain of Thought fields (Optional, for AI internal logic)
    context_analysis?: string;
    primary_emotion?: string;
}

export interface EditableScene {
    sceneNumber: number;
    title: string;
    cuts: EditableCut[];
}

export interface ImageGenerationStatus {}

export type EditImageFunction = (
    baseImageUrl: string,
    editPrompt: string,
    originalPrompt: string,
    referenceImageUrl?: string,
    maskBase64?: string,
    masterStyleImageUrl?: string,
    isCreativeGeneration?: boolean
) => Promise<{ imageUrl: string; textResponse: string; tokenCount: number }>;

export interface TextEditingTarget {
    cutNumber: string;
    imageUrl: string;
    characters: string[];
}

export interface ReferenceBackground {
    key: string;
    url: string;
    koreanTitle: string;
}

export interface AppDataState {
    appState: AppState;
    generatedContent: GeneratedScript | null;
    editableStoryboard: EditableScene[] | null; // New field for draft review
    storyboardSeed: number | null; // To allow for storyboard regeneration
    characterDescriptions: { [key: string]: CharacterDescription };
    locationVisualDNA: { [location: string]: string }; // NEW: Spatial consistency DNA
    contextSummary: string | null;
    isLoading: boolean;
    loadingMessage: string;
    loadingMessageDetail: string;
    isZipping: boolean;
    zippingProgress: { current: number, total: number, isCancelling: boolean } | null;
    notifications: Notification[];
    openAiApiKey: string | null;
    geminiTokenCount: number;
    dalleImageCount: number;
    userInputScript: string;
    enrichedScript: string | null;
    storyTitle: string | null;
    speakerGender: Gender;
    assetLibrary: LibraryAsset[];
    isAssetLibraryOpen: boolean;
    backgroundReplacementTargetCutNumber: string | null;
    backgroundReplacementSourceUrl: string | null;
    guestSelectionTargetCutNumber: string | null; // New state for guest selection
    closetCharacters: ClosetCharacter[];
    smartFieldSuggestions: { [cutId: string]: { [field: string]: string[] } };
    animationStyle: 'none' | 'kyoto' | 'pa_works';
    generatedImageHistory: GeneratedImage[];
    studioSessions: {
        a: StudioSession;
        b: StudioSession;
    };
    nextStudioSlot: 'a' | 'b';
    filenameTemplate: string;
    activeStudioTarget: 'a' | 'b';
    isAutoGenerating: boolean;
    isGeneratingSRT: boolean;
    backgroundMusicUrl: string | null;
    backgroundMusicName: string | null;
    failedCutNumbers: string[];
    isCutSplitterOpen: boolean;
    cutToSplit: Cut | null;
    artStyle: ArtStyle;
    customArtStyle: string;
    selectedNanoModel: NanoModel;
}

export type AppAction =
    | { type: 'START_LOADING'; payload: string }
    | { type: 'SET_LOADING_DETAIL'; payload: string }
    | { type: 'STOP_LOADING' }
    | { type: 'SET_APP_STATE'; payload: AppState }
    | { type: 'SET_CHARACTER_DESCRIPTIONS'; payload: { [key: string]: CharacterDescription } }
    | { type: 'SET_LOCATION_VISUAL_DNA'; payload: { [location: string]: string } }
    | { type: 'UPDATE_CHARACTER_DESCRIPTION'; payload: { key: string; data: Partial<CharacterDescription> } }
    | { type: 'SET_GENERATED_CONTENT'; payload: GeneratedScript | null }
    | { type: 'SET_EDITABLE_STORYBOARD'; payload: EditableScene[] | null }
    | { type: 'SET_STORYBOARD_SEED'; payload: number | null }
    | { type: 'UPDATE_CUT'; payload: { cutNumber: string; data: Partial<Cut> } }
    | { type: 'DELETE_CUT'; payload: string }
    | { type: 'UPDATE_SCENES'; payload: Scene[] }
    | { type: 'UPDATE_SCENE'; payload: { sceneNumber: number; data: Partial<Scene> } }
    | { type: 'START_ZIPPING' }
    | { type: 'END_ZIPPING' }
    | { type: 'SET_ZIPPING_PROGRESS'; payload: { current: number, total: number, isCancelling: boolean } | null }
    | { type: 'ADD_NOTIFICATION'; payload: Notification }
    | { type: 'REMOVE_NOTIFICATION'; payload: number }
    | { type: 'SET_OPENAI_API_KEY'; payload: string | null }
    | { type: 'SET_CONTEXT_SUMMARY'; payload: string | null }
    | { type: 'ADD_USAGE'; payload: { geminiTokens: number; dalleImages: number } }
    | { type: 'RESET_STATE' }
    | { type: 'START_NEW_ANALYSIS' }
    | { type: 'SET_USER_INPUT_SCRIPT'; payload: string }
    | { type: 'SET_ENRICHED_SCRIPT'; payload: string | null }
    | { type: 'SET_STORY_TITLE'; payload: string | null }
    | { type: 'SET_SPEAKER_GENDER'; payload: Gender }
    | { type: 'SET_ASSET_LIBRARY'; payload: LibraryAsset[] }
    | { type: 'ADD_ASSET_TO_LIBRARY'; payload: LibraryAsset }
    | { type: 'DELETE_ASSET_FROM_LIBRARY'; payload: string }
    | { type: 'OPEN_ASSET_LIBRARY' }
    | { type: 'CLOSE_ASSET_LIBRARY' }
    | { type: 'START_BACKGROUND_REPLACEMENT'; payload: { cutNumber: string; sourceImageUrl: string } }
    | { type: 'FINISH_BACKGROUND_REPLACEMENT' }
    | { type: 'START_GUEST_SELECTION'; payload: string }
    | { type: 'SET_CLOSET_CHARACTERS'; payload: ClosetCharacter[] }
    | { type: 'ADD_TO_CLOSET'; payload: ClosetCharacter }
    | { type: 'DELETE_FROM_CLOSET'; payload: string }
    | { type: 'RESTORE_STATE'; payload: Partial<AppDataState> }
    | { type: 'SET_SMART_FIELD_SUGGESTIONS'; payload: { cutId: string; field: 'action' | 'emotion' | 'location'; suggestions: string[] } }
    | { type: 'CLEAR_SMART_FIELD_SUGGESTIONS'; payload: { cutId: string } }
    | { type: 'SET_ANIMATION_STYLE'; payload: 'none' | 'kyoto' | 'pa_works' }
    | { type: 'ADD_TO_IMAGE_HISTORY'; payload: GeneratedImage }
    | { type: 'ADD_IMAGE_TO_CUT'; payload: { image: GeneratedImage; cutNumber: string } } // NEW
    | { type: 'TOGGLE_NEXT_STUDIO_SLOT' }
    | { type: 'DELETE_FROM_IMAGE_HISTORY'; payload: string }
    | { type: 'LOAD_IMAGE_INTO_STUDIO'; payload: { studioId: 'a' | 'b'; image: GeneratedImage } }
    | { type: 'LOAD_USER_IMAGE_INTO_STUDIO'; payload: { studioId: 'a' | 'b'; imageDataUrl: string } }
    | { type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: 'a' | 'b', imageDataUrl: string } }
    | { type: 'UPDATE_STUDIO_SESSION', payload: { studioId: 'a' | 'b'; data: Partial<StudioSession> } }
    | { type: 'SET_ORIGINAL_IMAGE', payload: { studioId: 'a' | 'b', image: GeneratedImage } }
    | { type: 'PREPARE_STUDIO_FOR_CUT', payload: { studioId: 'a' | 'b', cutNumber: string, prompt: string } }
    | { type: 'CLEAR_STUDIO_SESSION', payload: { studioId: 'a' | 'b' } }
    | { type: 'REVERT_STUDIO_SESSION', payload: { studioId: 'a' | 'b' } }
    | { type: 'UNDO_STUDIO_SESSION', payload: { studioId: 'a' | 'b' } }
    | { type: 'COPY_ORIGINAL_TO_CURRENT', payload: { studioId: 'a' | 'b' } }
    | { type: 'COPY_PROMPT_TO_STUDIOS', payload: string }
    | { type: 'SET_FILENAME_TEMPLATE', payload: string }
    | { type: 'SET_ACTIVE_STUDIO_TARGET', payload: 'a' | 'b' }
    | { type: 'UPDATE_STUDIO_TRANSFORM', payload: { studioId: 'a' | 'b', zoom: number, pan: { x: number, y: number } } }
    | { type: 'START_AUTO_GENERATION'; payload: string }
    | { type: 'STOP_AUTO_GENERATION' }
    | { type: 'SET_FAILED_CUTS', payload: string[] }
    | { type: 'SET_BACKGROUND_MUSIC', payload: { url: string | null, name: string | null } }
    | { type: 'SELECT_IMAGE_FOR_CUT', payload: { cutNumber: string, imageId: string | null } }
    | { type: 'OPEN_CUT_SPLITTER', payload: Cut }
    | { type: 'CLOSE_CUT_SPLITTER' }
    | { type: 'REPLACE_CUT', payload: { originalCutNumber: string; newCuts: Cut[] } }
    | { type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: string; location: string; state: Partial<{ imageUrl: string; imageLoading: boolean }> } }
    | { type: 'SET_ART_STYLE', payload: ArtStyle }
    | { type: 'SET_CUSTOM_ART_STYLE', payload: string }
    | { type: 'SET_OUTFIT_MODIFICATION_STATE', payload: { characterKey: string; location: string; isLoading: boolean } }
    | { type: 'UPDATE_LOCATION_OUTFIT', payload: { characterKey: string; location: string; korean: string; english: string } }
    | { type: 'SET_NANO_MODEL', payload: NanoModel };
