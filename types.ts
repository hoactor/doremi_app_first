// types.ts — Re-export 허브
// 실제 정의는 types/ 폴더에 분리, 기존 import 경로 호환 유지

// ─── 분리된 모듈 re-export ────────────────────────────────────────
export type { UniversalScriptSchema, USSCharacter, USSLocation, USSCut } from './types/uss';
export type { ContextSceneDesign, PlannedCut, ContextSceneGeneration, ContextGeneratedImage } from './types/contextMode';
export type {
    CutType, PipelineCheckpoint, ApiSource, EnrichedBeat,
    ScenarioAnalysis, BehaviorPatterns, OutfitRecommendation,
    CharacterBible, ContiCut, CinematographyCut, CinematographyPlan,
    SceneLayer, OutfitSession, ToneModifier, SceneVisualAnalysis,
} from './types/pipeline';
export { DEFAULT_SCENE_LAYER_ID } from './types/pipeline';

// ─── 기본 타입 ────────────────────────────────────────────────────
export type Gender = 'male' | 'female';
export type ImageRatio = '1:1' | '16:9' | '9:16';
export type AppState = 'initial' | 'storyboardGenerated';
export type SceneDirectionTheme = string;
export type NanoModel = 'nano-2.5' | 'nano-3.1' | 'nano-3pro';
export type ArtStyle = 'normal' | 'moe' | 'dalle-chibi' | 'custom' | 'vibrant' | 'kyoto';
export type ContentFormat = 'ssul-shorts' | 'webtoon' | 'anime';
export type AIModelTier = 'sonnet' | 'opus' | 'gemini';
export type ImageEngine = 'gemini' | 'flux' | 'openai';
export type FluxModel = 'flux-pro' | 'flux-flex' | 'flux-lora';
export type OpenAIImageQuality = 'low' | 'medium' | 'high';
export type ScriptInputMode = 'auto' | 'narration' | 'msf' | 'uss';

export interface OpenAIStylePreset {
    id: string;
    label: string;
    styleBlock: string;
    isBuiltin: boolean;
}

export interface OpenAIStyleRegistry {
    styles: OpenAIStylePreset[];
    defaultStyleId: string;
}

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
    engine: 'dalle3' | 'nano' | 'nano-v3' | 'imagen-rough' | 'gpt-image-2';
    /** Phase B: OpenAI gpt-image-2 quality (engine === 'gpt-image-2'일 때만) */
    openaiQuality?: OpenAIImageQuality;
    createdAt: string;
    tag?: 'rough' | 'normal' | 'hq';
    model?: string;
    artStyleLabel?: string;
    /**
     * Phase B v3: 이 이미지가 어느 outfitSession 배치의 anchor 인지.
     * 값이 있으면 해당 배치 후속 컷 생성 시 시각 reference로 자동 첨부됨.
     * 형식: `${location}::${layerId}::${lineRangeStart}-${lineRangeEnd}` (안정 키).
     * 없으면 일반 컷 이미지.
     */
    batchAnchorFor?: string;
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
    /** Phase A: 시점별 외형 variant. 회상/미래 등 sceneLayer 단위 외형 변형. */
    variants?: CharacterVariant[];
}

/**
 * Phase A: 캐릭터의 시점별(sceneLayer별) 외형 변형.
 * 어린 시절 회상 / 미래 / 다른 인격 등에 적용. 본 캐릭터는 그대로 두고 별도 슬롯에 보관.
 */
export interface CharacterVariant {
    variantId: string;
    label: string;
    appliedToLayerId: string;
    baseAppearance: string;
    koreanBaseAppearance: string;
    characterSheetUrl?: string;
}

/**
 * Phase A: 에피소드 단위 엔진 패러다임 선택.
 * - 'legacy': 현재 시스템 (Gemini + Flux, 컷 단위 독립 생성)
 * - 'context': Phase B에서 활성화 예정 (gpt-image-2, 배치 단위 첫 컷=anchor)
 * 에피소드 생성 시 1회 선택. 이후 변경 불가 (새 에피소드에서만 변경).
 */
export type ImageEngineMode = 'legacy' | 'context';

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
    /** Phase 5-d: 시간/서사 레이어 id. 없으면 "현재" 가정. buildFinalPrompt resolver 입력. */
    sceneLayerId?: string;
    /**
     * Phase A.5: 자연어 컷 묘사 (gpt-image-2 트랙 활용).
     * Gemini buildFinalPrompt는 미참조. 모두 optional.
     */
    sceneNarrative?: string;
    cameraNote?: string;
    moodNote?: string;
    detailsNarrative?: string;
    /**
     * Phase B v3 Stage 2: anchor 재생성 후 후속 컷이 stale 상태인지.
     * true → SceneCard 노란 보더. 후속 컷 재생성 시 false 복원.
     * anchor 여부 자체는 런타임 계산(isFirstCutInBatch)으로 결정.
     */
    staleByAnchor?: boolean;
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
        category?: ('인물' | '배경' | '의상' | '소품')[];
    };
    source: {
        type: 'character' | 'background' | 'outfit' | 'prop' | 'cut';
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
    useIntenseEmotion?: boolean;
    sceneDescriptionIntense?: string;
    characterPoseIntense?: string;
    characterEmotionAndExpressionIntense?: string;
    /** Phase 5-d: 시간/서사 레이어 id. 없으면 "현재" 가정. */
    sceneLayerId?: string;
    /**
     * Phase A.5: 자연어 컷 묘사 (gpt-image-2 트랙).
     * Gemini 미참조. 모두 optional.
     */
    sceneNarrative?: string;
    cameraNote?: string;
    moodNote?: string;
    detailsNarrative?: string;
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
import type { EnrichedBeat, PipelineCheckpoint, ApiSource, ScenarioAnalysis, CharacterBible, ContiCut, CinematographyPlan, SceneLayer, OutfitSession, ToneModifier } from './types/pipeline';

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
    filenameTemplate: string;
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
    /** Phase A: 에피소드 단위 엔진 모드. 'legacy'(기본) | 'context'(Phase B). initial 상태에서만 변경. */
    imageEngineMode: ImageEngineMode;
    /** Phase B: gpt-image-2 quality. 기본 'medium'. */
    openaiImageQuality: OpenAIImageQuality;
    /** OpenAI(DALL-E/gpt-image-2) 화풍 프리셋 ID. 미지정 시 레지스트리 defaultStyleId 폴백. */
    selectedDalleStyleId?: string;
    /** Phase B: gpt-image-2 사용량 추적 (falUsage와 평등 패턴) */
    openaiUsage: {
        totalImages: number;
        totalCostUsd: number;
        history: { date: string; images: number; costUsd: number; quality: OpenAIImageQuality }[];
    };
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
    /**
     * Phase A.6: Context 모드 씬 디자인. outfitSession별 1개.
     * sessionKey로 매칭. Context+OpenAI에서만 사용. 미정의=undefined.
     */
    contextSceneDesigns?: import('./types/contextMode').ContextSceneDesign[];
    /** Phase A.6: 분석 진행 상태 (휘발성, 세션 시작 시 초기화) */
    contextAnalysisStatus?: { isRunning: boolean; target: 'all' | string; progress: number; message?: string };
    /** Phase A.6: 생성 진행 상태 (휘발성) */
    contextGenerationStatus?: { isRunning: boolean; target: string; progress: number; message?: string };
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
    | { type: 'SET_FILENAME_TEMPLATE', payload: string }
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
    | { type: 'SET_ASSET_CATALOG', payload: AssetCatalogEntry[] }
    // ── Phase A: Block Editor + Engine Mode ─────────────────────────
    | { type: 'SET_IMAGE_ENGINE_MODE'; payload: ImageEngineMode }
    | { type: 'UPDATE_SCENE_LAYER'; payload: { layerId: string; data: Partial<SceneLayer> } }
    | { type: 'UPDATE_OUTFIT_SESSION'; payload: { index: number; data: Partial<OutfitSession> } }
    | { type: 'SPLIT_OUTFIT_SESSION'; payload: { index: number; splitAtLine: number } }
    | { type: 'MERGE_OUTFIT_SESSIONS'; payload: { firstIndex: number } }
    | { type: 'CONVERT_TO_MEMORY_BATCH'; payload: { sessionIndex: number; layerLabel: string; toneModifier?: ToneModifier } }
    | { type: 'ADD_SCENE_LAYER'; payload: SceneLayer }
    | { type: 'DELETE_SCENE_LAYER'; payload: string }
    | { type: 'ADD_CHARACTER_VARIANT'; payload: { characterKey: string; variant: CharacterVariant } }
    | { type: 'UPDATE_CHARACTER_VARIANT'; payload: { characterKey: string; variantId: string; data: Partial<CharacterVariant> } }
    | { type: 'DELETE_CHARACTER_VARIANT'; payload: { characterKey: string; variantId: string } }
    // ── Phase B: OpenAI gpt-image-2 ─────────────────────────────────
    | { type: 'SET_OPENAI_IMAGE_QUALITY'; payload: OpenAIImageQuality }
    | { type: 'ADD_OPENAI_USAGE'; payload: { images: number; costUsd: number; quality: OpenAIImageQuality } }
    | { type: 'SET_DALLE_STYLE_ID'; payload: string | undefined }
    // ── Phase A.6: Context 모드 씬 디자인 ─────────────────────────────
    | { type: 'SET_CONTEXT_ANALYSIS_STATUS'; payload: AppDataState['contextAnalysisStatus'] }
    | { type: 'SET_CONTEXT_SCENE_DESIGNS'; payload: import('./types/contextMode').ContextSceneDesign[] }
    | { type: 'UPDATE_CONTEXT_SCENE_DESIGN'; payload: { sessionKey: string; design: import('./types/contextMode').ContextSceneDesign } }
    | { type: 'DELETE_CONTEXT_SCENE_DESIGN'; payload: string }
    | { type: 'UPDATE_PLANNED_CUT'; payload: { sessionKey: string; cutIndex: number; data: Partial<import('./types/contextMode').PlannedCut> } }
    | { type: 'SET_TARGET_CUT_COUNT'; payload: { sessionKey: string; count: number } }
    | { type: 'SET_CONTEXT_GENERATION_STATUS'; payload: AppDataState['contextGenerationStatus'] }
    | { type: 'SET_CONTEXT_SCENE_GENERATION'; payload: { sessionKey: string; result: import('./types/contextMode').ContextSceneGeneration } }
    | { type: 'CLEAR_CONTEXT_SCENE_GENERATION'; payload: string }
    | { type: 'MARK_CONTEXT_DESIGNS_STALE'; payload: string[] };

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
    type: 'character' | 'outfit' | 'background' | 'prop';
    name: string;
    imagePath: string;
    thumbnailPath: string;
    tags: {
        character: string | null;
        artStyle: string | null;
        location: string | null;
        description: string | null;
        extraTypes?: string | null;
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
