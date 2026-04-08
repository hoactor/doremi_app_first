// types.ts — Re-export 허브
// 실제 정의는 types/ 폴더에 분리, 기존 import 경로 호환 유지

// ─── 분리된 모듈 re-export ────────────────────────────────────────
export type { UniversalScriptSchema, USSCharacter, USSLocation, USSCut } from './types/uss';
export type {
    CutType, PipelineCheckpoint, ApiSource, EnrichedBeat,
    ScenarioAnalysis, BehaviorPatterns, OutfitRecommendation,
    CharacterBible, ContiCut, CinematographyCut, CinematographyPlan,
} from './types/pipeline';

// ─── 기본 타입 ────────────────────────────────────────────────────
export type Gender = 'male' | 'female';
export type ImageRatio = '1:1' | '16:9' | '9:16';
export type AppState = 'initial' | 'storyboardGenerated';
export type SceneDirectionTheme = string;
export type NanoModel = 'nano-2.5' | 'nano-3.1' | 'nano-3pro';
export type ArtStyle = 'normal' | 'moe' | 'dalle-chibi' | 'custom' | 'vibrant' | 'kyoto';
export type ContentFormat = 'ssul-shorts' | 'webtoon' | 'anime';
export type AIModelTier = 'sonnet' | 'opus';
export type ImageEngine = 'gemini' | 'flux';
export type FluxModel = 'flux-pro' | 'flux-flex' | 'flux-lora';
export type ScriptInputMode = 'narration' | 'msf' | 'uss';

// ─── Phase 6: LoRA 레지스트리 ────────────────────────────────────
export interface LoRAEntry {
    id: string;
    name: string;
    url: string;
    triggerWord: string;
    scale: number;
    type: 'character' | 'style';
    baseAppearance?: string;            // 캐릭터 LoRA 전용 — 외형 묘사 (프롬프트 자동 삽입용)
    createdAt: string;
}

export interface GeneratedImage {
    id: string;
    imageUrl: string;
    localPath?: string;
    sourceCutNumber: string;
    prompt: string;
    engine: 'dalle3' | 'nano' | 'nano-v3' | 'imagen-rough';
    createdAt: string;
    tag?: 'rough' | 'normal' | 'hq';
    model?: string;
    artStyleLabel?: string;
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
    /** 영어 정규 이름 — 내부 매칭 키. 없으면 koreanName 폴백 (기존 프로젝트 호환) */
    canonicalName?: string;
    /** 대본에서 이 캐릭터를 가리키는 모든 한국어 지칭 */
    aliases?: string[];
    koreanBaseAppearance: string;
    baseAppearance: string;
    gender: 'male' | 'female';
    personality: string;
    locations: { [location: string]: string };
    koreanLocations: { [location: string]: string };
    firstScenePrompt?: string;
    revisedPrompt?: string;
    characterSheetHistory?: string[];
    isEditingSheet?: boolean;
    imageLoading?: boolean;
    images?: CharacterImage[];
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
    mannequinImageUrl?: string | null;
    mannequinHistory?: string[];
    isApplyingCostume?: boolean;
    isRequestingOutfitModification?: { [location: string]: boolean };
    sourceImageUrl?: string;
    isUnifyingStyle?: boolean;
    isInjectingPersonality?: boolean;
    upscaledImageUrl?: string;
    isUpscaling?: boolean;
    hairStyleDescription?: string;
    facialFeatures?: string;
    isAnalyzingHair?: boolean;
    loraId?: string;
    loraScaleOverride?: number;
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
    characterIdentityDNA?: string;
    locationDescription: string;
    otherNotes: string;
    imageUrls: string[];
    suggestedEffect?: { name: string; prompt: string; } | null;
    imageLoading: boolean;
    audioDataUrls?: string[];
    audioDuration?: number;
    selectedImageId: string | null;
    directorialIntent?: string;
    isUpdatingIntent?: boolean;
    dialogueSpeaker?: string;
    guestCharacterUrl?: string | null;
    guestCharacterName?: string | null;
    voiceEmotion?: string;
    voicePitch?: number;
    voiceSpeed?: number;
    isFormattingNarration?: boolean;
    imagePrompt?: string;
    artStyleOverride?: ArtStyle;
    useIntenseEmotion?: boolean;
    isIntensifying?: boolean;
    characterEmotionAndExpressionIntense?: string;
    sceneDescriptionIntense?: string;
    characterPoseIntense?: string;
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
    type: 'error' | 'success' | 'info' | 'warning';
    action?: { label: string; callback: () => void };
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
    referenceImageUrls: string[];
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
    characterIdentityDNA?: string;
    locationDescription: string;
    otherNotes: string;
    suggestedEffect?: { name: string; prompt: string; } | null;
    directorialIntent?: string;
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
    referenceImageUrls?: string[],
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

// ─── AppDataState ─────────────────────────────────────────────────
import type { EnrichedBeat, PipelineCheckpoint, ApiSource, ScenarioAnalysis, CharacterBible, ContiCut, CinematographyPlan } from './types/pipeline';

export interface AppDataState {
    appState: AppState;
    generatedContent: GeneratedScript | null;
    editableStoryboard: EditableScene[] | null;
    storyboardSeed: number | null;
    characterDescriptions: { [key: string]: CharacterDescription };
    locationVisualDNA: { [location: string]: string };
    contextSummary: string | null;
    isLoading: boolean;
    loadingMessage: string;
    loadingMessageDetail: string;
    isZipping: boolean;
    zippingProgress: { current: number, total: number, isCancelling: boolean } | null;
    notifications: Notification[];
    openAiApiKey: string | null;
    geminiTokenCount: number;
    claudeTokenCount: number;
    dalleImageCount: number;
    falUsage: { totalImages: number; totalCost: number; history: { date: string; images: number; cost: number; model: string }[] };
    userInputScript: string;
    enrichedScript: string | null;
    enrichedBeats: EnrichedBeat[] | null;
    storyTitle: string | null;
    storyBrief?: string;
    speakerGender: Gender;
    assetLibrary: LibraryAsset[];
    isAssetLibraryOpen: boolean;
    backgroundReplacementTargetCutNumber: string | null;
    backgroundReplacementSourceUrl: string | null;
    guestSelectionTargetCutNumber: string | null;
    closetCharacters: ClosetCharacter[];
    smartFieldSuggestions: { [cutId: string]: { [field: string]: string[] } };
    animationStyle: 'none' | 'kyoto' | 'pa_works';
    generatedImageHistory: GeneratedImage[];
    studioSessions: { a: StudioSession };
    filenameTemplate: string;
    activeStudioTarget: 'a';
    isAutoGenerating: boolean;
    isGeneratingSRT: boolean;
    backgroundMusicUrl: string | null;
    backgroundMusicName: string | null;
    failedCutNumbers: string[];
    isCutSplitterOpen: boolean;
    cutToSplit: Cut | null;
    artStyle: ArtStyle;
    customArtStyle: string;
    imageRatio: ImageRatio;
    selectedNanoModel: NanoModel;
    selectedImageEngine: ImageEngine;
    selectedFluxModel: FluxModel;
    aiModelTier: AIModelTier;
    contentFormat: ContentFormat;
    pipelineCheckpoint: PipelineCheckpoint;
    scriptMetadata?: { metadataByLine: Record<number, any>; isDetailed: boolean };
    scenarioAnalysis: ScenarioAnalysis | null;
    characterBibles: CharacterBible[] | null;
    contiCuts: ContiCut[] | null;
    cinematographyPlan: CinematographyPlan | null;
    locationRegistry: string[];
    logline: string;
    scriptInputMode: ScriptInputMode;
    styleLoraId?: string;
    styleLoraScaleOverride?: number;
    currentProjectId: string | null;
    isProjectSaved: boolean;
}

// ─── AppAction ────────────────────────────────────────────────────

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
    | { type: 'ADD_USAGE'; payload: { tokens: number; source: ApiSource } }
    | { type: 'ADD_FAL_USAGE'; payload: { images: number; model: FluxModel } }
    | { type: 'RESET_STATE' }
    | { type: 'START_NEW_ANALYSIS' }
    | { type: 'SET_USER_INPUT_SCRIPT'; payload: string }
    | { type: 'SET_ENRICHED_SCRIPT'; payload: string | null }
    | { type: 'SET_ENRICHED_BEATS'; payload: EnrichedBeat[] | null }
    | { type: 'SET_STORY_TITLE'; payload: string | null }
    | { type: 'SET_STORY_BRIEF'; payload: string }
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
    | { type: 'ADD_IMAGE_TO_CUT'; payload: { image: GeneratedImage; cutNumber: string } }
    | { type: 'DELETE_FROM_IMAGE_HISTORY'; payload: string }
    | { type: 'LOAD_IMAGE_INTO_STUDIO'; payload: { studioId: 'a'; image: GeneratedImage } }
    | { type: 'LOAD_USER_IMAGE_INTO_STUDIO'; payload: { studioId: 'a'; imageDataUrl: string } }
    | { type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: 'a', imageDataUrl: string } }
    | { type: 'UPDATE_STUDIO_SESSION', payload: { studioId: 'a'; data: Partial<StudioSession> } }
    | { type: 'SET_ORIGINAL_IMAGE', payload: { studioId: 'a', image: GeneratedImage } }
    | { type: 'PREPARE_STUDIO_FOR_CUT', payload: { studioId: 'a', cutNumber: string, prompt: string } }
    | { type: 'CLEAR_STUDIO_SESSION', payload: { studioId: 'a' } }
    | { type: 'REVERT_STUDIO_SESSION', payload: { studioId: 'a' } }
    | { type: 'UNDO_STUDIO_SESSION', payload: { studioId: 'a' } }
    | { type: 'COPY_ORIGINAL_TO_CURRENT', payload: { studioId: 'a' } }
    | { type: 'COPY_PROMPT_TO_STUDIOS', payload: string }
    | { type: 'SET_FILENAME_TEMPLATE', payload: string }
    | { type: 'SET_ACTIVE_STUDIO_TARGET', payload: 'a' }
    | { type: 'UPDATE_STUDIO_TRANSFORM', payload: { studioId: 'a', zoom: number, pan: { x: number, y: number } } }
    | { type: 'START_AUTO_GENERATION'; payload: string }
    | { type: 'STOP_AUTO_GENERATION' }
    | { type: 'SET_FAILED_CUTS', payload: string[] }
    | { type: 'SET_BACKGROUND_MUSIC', payload: { url: string | null, name: string | null } }
    | { type: 'SELECT_IMAGE_FOR_CUT', payload: { cutNumber: string, imageId: string | null } }
    | { type: 'TOGGLE_INTENSE_EMOTION', payload: { cutNumber: string } }
    | { type: 'TOGGLE_ALL_INTENSE_EMOTION' }
    | { type: 'OPEN_CUT_SPLITTER', payload: Cut }
    | { type: 'CLOSE_CUT_SPLITTER' }
    | { type: 'REPLACE_CUT', payload: { originalCutNumber: string; newCuts: Cut[] } }
    | { type: 'SET_LOCATION_OUTFIT_IMAGE_STATE', payload: { characterKey: string; location: string; state: Partial<{ imageUrl: string; imageLoading: boolean }> } }
    | { type: 'SET_ART_STYLE', payload: ArtStyle }
    | { type: 'SET_CUSTOM_ART_STYLE', payload: string }
    | { type: 'SET_IMAGE_RATIO', payload: ImageRatio }
    | { type: 'SET_OUTFIT_MODIFICATION_STATE', payload: { characterKey: string; location: string; isLoading: boolean } }
    | { type: 'UPDATE_LOCATION_OUTFIT', payload: { characterKey: string; location: string; korean: string; english: string } }
    | { type: 'SET_NANO_MODEL', payload: NanoModel }
    | { type: 'SET_IMAGE_ENGINE', payload: ImageEngine }
    | { type: 'SET_FLUX_MODEL', payload: FluxModel }
    | { type: 'SET_AI_MODEL_TIER', payload: AIModelTier }
    | { type: 'SET_CONTENT_FORMAT', payload: ContentFormat }
    | { type: 'SET_PIPELINE_CHECKPOINT', payload: PipelineCheckpoint }
    | { type: 'SET_SCRIPT_METADATA', payload: { metadataByLine: Record<number, any>; isDetailed: boolean } | undefined }
    | { type: 'SET_SCENARIO_ANALYSIS', payload: ScenarioAnalysis | null }
    | { type: 'SET_LOCATION_REGISTRY', payload: string[] }
    | { type: 'SET_LOGLINE', payload: string }
    | { type: 'SET_SCRIPT_INPUT_MODE', payload: ScriptInputMode }
    | { type: 'SET_STYLE_LORA'; payload: { id?: string; scaleOverride?: number } }
    | { type: 'SET_CHARACTER_BIBLES', payload: CharacterBible[] | null }
    | { type: 'SET_CONTI_CUTS', payload: ContiCut[] | null }
    | { type: 'UPDATE_CONTI_CUT', payload: { id: string; data: Partial<ContiCut> } }
    | { type: 'DELETE_CONTI_CUT', payload: string }
    | { type: 'SET_CINEMATOGRAPHY_PLAN', payload: CinematographyPlan | null }
    | { type: 'SET_CURRENT_PROJECT_ID', payload: string | null }
    | { type: 'SET_PROJECT_SAVED', payload: boolean }
    | { type: 'SET_ASSET_CATALOG', payload: AssetCatalogEntry[] };

// ─── Phase 5: 로컬 스토리지 타입 ─────────────────────────────────

export interface ProjectMetadata {
    version: 2;
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    artStyle: ArtStyle;
    imageRatio: ImageRatio;
    speakerGender: Gender;
    characterDescriptions: { [key: string]: CharacterDescription };
    scenes: ProjectScene[];
    locationVisualDNA: { [location: string]: string };
    enrichedScript: string;
    enrichedBeats?: EnrichedBeat[];
    userInputScript: string;
    scenarioAnalysis?: any;
    characterBibles?: any[];
    contiCuts?: any[];
    cinematographyPlan?: any;
    locationRegistry?: string[];
    logline?: string;
    contentFormat?: ContentFormat;
    aiModelTier?: AIModelTier;
}

export interface ProjectScene {
    sceneNumber: number;
    title: string;
    cuts: ProjectCut[];
}

export interface ProjectCut {
    cutNumber: string;
    narration: string;
    imagePaths: string[];
    selectedImagePath: string | null;
    audioPath: string | null;
    imagePrompt: string;
    cutType?: string;
}

export interface ProjectListEntry {
    id: string;
    title: string;
    cutCount: number;
    thumbnailPath: string | null;
    updatedAt: string;
    artStyle?: string | null;
}

export interface AssetCatalogEntry {
    id: string;
    type: 'character' | 'outfit' | 'background';
    name: string;
    imagePath: string;
    thumbnailPath: string;
    tags: {
        character: string | null;
        artStyle: string | null;
        location: string | null;
        description: string | null;
    };
    visualDNA: {
        hair?: string;
        colorPalette?: { [key: string]: string };
        distinctiveMarks?: string;
    } | null;
    outfitData: {
        englishDescription?: string;
        locations?: string[];
    } | null;
    spatialDNA: string | null;
    prompt: string | null;
    createdAt: string;
}
