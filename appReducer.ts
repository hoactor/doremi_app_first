// appReducer.ts — 리듀서 + 순수 헬퍼 함수
// React 의존성 제로. AppContext.tsx에서 분리.
// 위치: AppContext.tsx와 같은 루트 레벨

import {
    AppDataState, AppAction, Cut, GeneratedImage, Notification,
    CharacterDescription, Scene, GeneratedScript, ArtStyle, ContentFormat, AIModelTier,
    ImageEngine, FluxModel, SceneLayer, OutfitSession, ContiCut, EditableScene
} from './types';
import { DEFAULT_SCENE_LAYER_ID } from './types/pipeline';
import { getEngineFromModel, createGeneratedImage, normalizeLocationEntries, findOutfitSessionForCut, findAnchorCutForBatch, deriveOutfitSessionsFromCuts, buildSessionKey } from './appUtils';
import { handleContextModeCases } from './appReducerHelpers/contextModeCases';
import { handleBlockEditorCases } from './appReducerHelpers/blockEditorCases';

export const sanitizeState = (state: AppDataState): AppDataState => {
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
    
    // ★ Phase 12: 새 필드 마이그레이션 안전장치 (옛날 상태에 없을 수 있음)
    if (!('enrichedBeats' in sanitized) || sanitized.enrichedBeats === undefined) {
        sanitized.enrichedBeats = null;
    }
    if (!('locationRegistry' in sanitized) || !Array.isArray(sanitized.locationRegistry)) {
        sanitized.locationRegistry = [];
    }
    // ★ Phase 5: 시간 레이어 / 의상 세션 마이그레이션
    // ★ Phase 7: locations를 string[] → LocationEntry[]로 마이그레이션 (카테고리 유추)
    if (sanitized.scenarioAnalysis) {
        const sa = sanitized.scenarioAnalysis;
        if (!Array.isArray(sa.sceneLayers) || sa.sceneLayers.length === 0) {
            sa.sceneLayers = [{ id: DEFAULT_SCENE_LAYER_ID, label: '현재', toneModifier: 'none' }];
        }
        if (!Array.isArray(sa.outfitSessions)) {
            sa.outfitSessions = [];
        }
        // Phase 7: 레거시 string[] 감지 → LocationEntry[]로 변환
        if (Array.isArray(sa.locations) && sa.locations.length > 0) {
            const firstItem = sa.locations[0];
            if (typeof firstItem === 'string') {
                sa.locations = normalizeLocationEntries(sa.locations);
            }
        }
        // ★ Phase B v3: outfitSessions 빈 배열 + locations 있음 → 자동 폴백 생성
        // USS 파이프라인은 outfitSessions를 채우지 않으므로 여기서 보강.
        if (sa.outfitSessions.length === 0 && Array.isArray(sa.locations) && sa.locations.length > 0) {
            const cuts = (sanitized.generatedContent?.scenes || []).flatMap(s => s.cuts || []);
            const totalLines = Math.max(cuts.length, 1);
            sa.outfitSessions = sa.locations
                .map(l => (typeof l === 'string' ? l : l.name))
                .filter(Boolean)
                .map((loc: string) => ({
                    location: loc,
                    layerId: DEFAULT_SCENE_LAYER_ID,
                    lineRange: [1, totalLines] as [number, number],
                }));
            console.warn('[sanitizeState] outfitSessions 빈 배열 → locations 기반 자동 생성 (USS/레거시 호환)');
        }
        // ★ Phase A: sceneLayers의 각 레이어에 toneModifier 기본값 부여 (기존 프로젝트 호환)
        sa.sceneLayers = sa.sceneLayers.map((layer: SceneLayer) => ({
            ...layer,
            toneModifier: layer.toneModifier ?? (layer.isFlashback ? 'warm-vintage' : layer.isImagined ? 'dream-blur' : 'none'),
        }));
        // ★ Phase A: outfitSession.userLabel 기본값 자동 생성 (없는 경우만)
        sa.outfitSessions = sa.outfitSessions.map((os: OutfitSession) => {
            if (os.userLabel) return os;
            const layer = sa.sceneLayers!.find((sl: SceneLayer) => sl.id === os.layerId);
            const layerLabel = layer?.label ?? os.layerId;
            return { ...os, userLabel: `${os.location} · ${layerLabel}` };
        });
        // ★ Phase A.5: visualAnalysis는 optional. 비배열이면 undefined 처리.
        if ('visualAnalysis' in sa && !Array.isArray(sa.visualAnalysis)) {
            sa.visualAnalysis = undefined;
        }
    }
    // ★ Phase A: characterDescriptions에 variants 빈 배열 기본값
    if (sanitized.characterDescriptions) {
        Object.values(sanitized.characterDescriptions).forEach((char: any) => {
            if (!Array.isArray(char.variants)) char.variants = [];
        });
    }
    // ★ Phase A: imageEngineMode 기본값
    if (!('imageEngineMode' in sanitized) || !sanitized.imageEngineMode) {
        sanitized.imageEngineMode = 'legacy';
    }
    // ★ Phase B: openaiImageQuality / openaiUsage 기본값
    if (!('openaiImageQuality' in sanitized) || !sanitized.openaiImageQuality) {
        sanitized.openaiImageQuality = 'medium';
    }
    if (!('openaiUsage' in sanitized) || !sanitized.openaiUsage) {
        sanitized.openaiUsage = { totalImages: 0, totalCostUsd: 0, history: [] };
    }
    // ★ Phase A.6: Context 모드 안전망
    if ('contextSceneDesigns' in sanitized && !Array.isArray(sanitized.contextSceneDesigns)) {
        sanitized.contextSceneDesigns = undefined;
    }
    // 진행 상태는 휘발성 — 새 세션에선 항상 초기화
    sanitized.contextAnalysisStatus = undefined;
    sanitized.contextGenerationStatus = undefined;
    if (!('logline' in sanitized) || sanitized.logline === undefined) {
        sanitized.logline = '';
    }
    // globalEnergyLevel 삭제됨 — 기존 프로젝트 호환: 필드 무시
    if (!('contentFormat' in sanitized) || !sanitized.contentFormat) {
        sanitized.contentFormat = 'ssul-shorts';
    }
    if (!('aiModelTier' in sanitized) || !sanitized.aiModelTier) {
        sanitized.aiModelTier = 'opus';
    }
    // ★ Flux 엔진 마이그레이션 안전장치
    if (!('selectedImageEngine' in sanitized) || !sanitized.selectedImageEngine) {
        sanitized.selectedImageEngine = 'gemini';
    }
    if (!('selectedFluxModel' in sanitized) || !sanitized.selectedFluxModel) {
        sanitized.selectedFluxModel = 'flux-pro';
    }
    if (!('scriptInputMode' in sanitized) || !sanitized.scriptInputMode) {
        sanitized.scriptInputMode = 'auto';
    }
    if (!('falUsage' in sanitized) || !sanitized.falUsage) {
        sanitized.falUsage = { totalImages: 0, totalCost: 0, history: [] };
    }
    // enriched_pause 상태에서 앱 재시작 시 idle로 리셋 (중간 상태 잔류 방지)
    if (sanitized.pipelineCheckpoint === 'enriched_pause' && !sanitized.enrichedBeats) {
        sanitized.pipelineCheckpoint = 'idle';
    }
    if (sanitized.pipelineCheckpoint === 'conti_pause' && !sanitized.contiCuts) {
        sanitized.pipelineCheckpoint = 'idle';
    }
    
    // Phase A.7 cleanup: 기존 studioSessions/activeStudioTarget 필드 제거 (UnifiedImageStudio로 대체됨)
    delete (sanitized as any).studioSessions;
    delete (sanitized as any).activeStudioTarget;

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

export const buildProjectMetadata = (state: any): object => {
    const scenes = state.generatedContent?.scenes?.map((scene: Scene) => ({
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        cuts: scene.cuts.map((cut: Cut) => {
            // generatedImageHistory에서 이 컷의 이미지 찾기
            const historyImages = (state.generatedImageHistory || []).filter(
                (img: GeneratedImage) => img.sourceCutNumber === cut.cutNumber
            );
            // localPath가 있는 이미지만 경로 저장, 없으면 빈 배열
            const imagePaths = historyImages
                .filter((img: GeneratedImage) => img.localPath)
                .map((img: GeneratedImage) => img.localPath!);
            
            const selectedImg = historyImages.find((img: GeneratedImage) => img.id === cut.selectedImageId);
            
            return {
                cutNumber: cut.cutNumber,
                narration: cut.narration,
                imagePaths,
                selectedImagePath: selectedImg?.localPath || null,
                audioPath: null, // TODO: 오디오 저장 연동
                imagePrompt: cut.imagePrompt || '',
                cutType: (cut as any).cutType,
                // 컷 필드 보존 (나중에 복원용)
                characters: cut.characters,
                location: cut.location,
                cameraAngle: cut.cameraAngle,
                sceneDescription: cut.sceneDescription,
                characterEmotionAndExpression: cut.characterEmotionAndExpression,
                characterPose: cut.characterPose,
                characterOutfit: cut.characterOutfit,
                characterIdentityDNA: cut.characterIdentityDNA || '',
                locationDescription: cut.locationDescription,
                otherNotes: cut.otherNotes,
                directorialIntent: cut.directorialIntent,
            };
        }),
    })) || [];

    // characterDescriptions에서 base64 이미지 제외, localPath만 보존
    const charDescs: Record<string, any> = {};
    if (state.characterDescriptions) {
        for (const [key, char] of Object.entries(state.characterDescriptions as Record<string, CharacterDescription>)) {
            charDescs[key] = { ...char };
            // base64 이미지 필드들 — 나중에 localPath 연동 시 교체
            // 현재는 그대로 보존 (작은 사이즈이므로)
        }
    }

    return {
        version: 2,
        id: state.currentProjectId,
        title: state.storyTitle || '제목 없음',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        artStyle: state.artStyle,
        imageRatio: state.imageRatio,
        speakerGender: state.speakerGender,
        characterDescriptions: charDescs,
        scenes,
        locationVisualDNA: state.locationVisualDNA || {},
        enrichedScript: state.enrichedScript || '',
        enrichedBeats: state.enrichedBeats || undefined,
        userInputScript: state.userInputScript || '',
        pipelineCheckpoint: state.pipelineCheckpoint,
        // Phase 4
        scenarioAnalysis: state.scenarioAnalysis,
        characterBibles: state.characterBibles,
        contiCuts: state.contiCuts,
        cinematographyPlan: state.cinematographyPlan,
        locationRegistry: state.locationRegistry || [],
        logline: state.logline || '',
        // 파이프라인 모드 + LoRA 설정 보존
        scriptInputMode: state.scriptInputMode || 'auto',
        storyBrief: state.storyBrief || '',
        styleLoraId: state.styleLoraId || null,
        styleLoraScaleOverride: state.styleLoraScaleOverride ?? undefined,
        contentFormat: state.contentFormat || 'ssul-shorts',
        aiModelTier: state.aiModelTier || 'opus',
        // 편집 중인 스토리보드 드래프트 (파이프라인 중간 상태 보존)
        editableStoryboard: state.editableStoryboard || null,
        // 이미지 히스토리 (localPath가 있는 것만, base64 제외)
        generatedImageHistory: (state.generatedImageHistory || [])
            .filter((img: GeneratedImage) => img.localPath)
            .map((img: GeneratedImage) => ({
                id: img.id,
                localPath: img.localPath,
                sourceCutNumber: img.sourceCutNumber,
                prompt: img.prompt,
                engine: img.engine,
                createdAt: img.createdAt,
            })),
    };
};


// 이전 프로젝트 포맷(참조 프로젝트) 호환용 스타일 마이그레이션
const LEGACY_STYLE_MAP: Record<string, string> = {
    'clean-webtoon': 'normal',
    'pastel-chibi': 'moe',
    'glow-chibi': 'dalle-chibi',
    'sparkle-glam': 'vibrant',
    'cinema-mood': 'kyoto',
};
const migrateArtStyle = (style: string | undefined): string =>
    LEGACY_STYLE_MAP[style || ''] || style || 'dalle-chibi';

export const restoreStateFromProject = (metadata: any): Partial<AppDataState> => {
    // scenes → generatedContent 복원
    const scenes: Scene[] = (metadata.scenes || []).map((scene: any) => ({
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        settingPrompt: '',
        cuts: (scene.cuts || []).map((cut: any) => ({
            id: cut.id || window.crypto.randomUUID(),
            cutNumber: cut.cutNumber,
            narration: cut.narration || '',
            characters: cut.characters || [],
            location: cut.location || '',
            cameraAngle: cut.cameraAngle || '',
            sceneDescription: cut.sceneDescription || '',
            characterEmotionAndExpression: cut.characterEmotionAndExpression || '',
            characterPose: cut.characterPose || '',
            characterOutfit: cut.characterOutfit || '',
            characterIdentityDNA: cut.characterIdentityDNA || '',
            locationDescription: cut.locationDescription || '',
            otherNotes: cut.otherNotes || '',
            imageUrls: [], // 이미지는 generatedImageHistory에서 복원
            imageLoading: false,
            selectedImageId: null, // 아래에서 재설정
            directorialIntent: cut.directorialIntent || '',
            imagePrompt: cut.imagePrompt || '',
        })),
    }));

    // generatedImageHistory 복원 (localPath → imageUrl은 나중에 resolveImageUrl로)
    const imageHistory: GeneratedImage[] = (metadata.generatedImageHistory || []).map((img: any) => ({
        id: img.id,
        imageUrl: '', // 로드 시 resolveImageUrl로 채워야 함 — 빈 문자열로 시작
        localPath: img.localPath,
        sourceCutNumber: img.sourceCutNumber,
        prompt: img.prompt || '',
        engine: img.engine || 'nano',
        createdAt: img.createdAt || '',
    }));

    // 컷에 selectedImageId 재설정 (각 컷의 첫 번째 이미지)
    for (const scene of scenes) {
        for (const cut of scene.cuts) {
            const cutImages = imageHistory.filter(img => img.sourceCutNumber === cut.cutNumber);
            if (cutImages.length > 0) {
                cut.selectedImageId = cutImages[0].id;
                cut.imageUrls = cutImages.map(img => img.localPath || img.imageUrl).filter(Boolean);
            }
        }
    }

    return {
        appState: scenes.length > 0 ? 'storyboardGenerated' : 'initial',
        generatedContent: scenes.length > 0 ? { scenes } : null,
        characterDescriptions: metadata.characterDescriptions || {},
        locationVisualDNA: metadata.locationVisualDNA || {},
        userInputScript: metadata.userInputScript || '',
        enrichedScript: metadata.enrichedScript || null,
        enrichedBeats: metadata.enrichedBeats || null,
        storyTitle: metadata.title || null,
        speakerGender: metadata.speakerGender || 'male',
        artStyle: migrateArtStyle(metadata.artStyle) as ArtStyle,
        imageRatio: metadata.imageRatio || '1:1',
        generatedImageHistory: imageHistory,
        currentProjectId: metadata.id,
        isProjectSaved: true,
        pipelineCheckpoint: metadata.pipelineCheckpoint || 'idle',
        scenarioAnalysis: metadata.scenarioAnalysis || null,
        characterBibles: metadata.characterBibles || null,
        contiCuts: metadata.contiCuts || null,
        cinematographyPlan: metadata.cinematographyPlan || null,
        editableStoryboard: metadata.editableStoryboard || null,
        contentFormat: metadata.contentFormat || 'ssul-shorts',
        aiModelTier: metadata.aiModelTier || 'opus',
        scriptInputMode: metadata.scriptInputMode || 'auto',
        logline: metadata.logline || '',
        locationRegistry: metadata.locationRegistry || [],
        storyBrief: metadata.storyBrief || '',
        styleLoraId: metadata.styleLoraId || null,
        styleLoraScaleOverride: metadata.styleLoraScaleOverride ?? undefined,
    };
};


export const initialAppDataState: AppDataState = {
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
    claudeTokenCount: 0,
    dalleImageCount: 0,
    falUsage: { totalImages: 0, totalCost: 0, history: [] },
    userInputScript: `[SCENE START]
[장소: 어두컴컴한 주인공의 방]
[연출: 깊은 절망과 좌절. 책상 위 '불합격' 모니터 화면이 유일한 빛이다.]
책상 앞에 엎드려 어깨를 들썩이며 조용히 흐느껴 운다.
...또 떨어졌어. 이번엔 진짜 될 줄 알았는데... 나란 놈은 도대체 뭐가 문제인 거야...`,
    enrichedScript: null,
    enrichedBeats: null,
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
    filenameTemplate: 'cut#{cut}_{character}_{id}',
    isAutoGenerating: false,
    isGeneratingSRT: false,
    backgroundMusicUrl: null,
    backgroundMusicName: null,
    failedCutNumbers: [],
    isCutSplitterOpen: false,
    cutToSplit: null,
    artStyle: 'dalle-chibi',
    imageRatio: '1:1',
    customArtStyle: `전체적으로 고퀄리티 치비(Chibi) 스타일을 유지하되, 장면의 감정에 어울리는 만화적 기호(Manpu/Manga iconography)를 모든 컷에 자동으로 풍부하게 그려넣어줘. 
- 설레는 컷: 눈 속에 별 모양 반짝임, 캐릭터 주변에 떠다니는 분홍색 하트와 방울들.
- 당황한 컷: 머리 옆에 커다란 파란색 식은땀 한 방울, 번개 모양 기호.
- 기쁜 컷: 배경에 화사한 꽃잎 입자와 반짝이는 마름모꼴 장식들.
모든 장식물은 캐릭터와 배경 위에 '스티커'나 '이모지'를 붙인 것처럼 선명하고 귀엽게 표현해줘.`,
    selectedNanoModel: 'nano-2.5',
    aiModelTier: 'opus' as AIModelTier,
    contentFormat: 'ssul-shorts' as ContentFormat,
    imageEngineMode: 'legacy', // ★ Phase A
    openaiImageQuality: 'medium', // ★ Phase B
    openaiUsage: { totalImages: 0, totalCostUsd: 0, history: [] }, // ★ Phase B
    pipelineCheckpoint: 'idle',
    // Phase 4: Preproduction Pipeline
    scenarioAnalysis: null,
    characterBibles: null,
    locationRegistry: [],
    logline: '',
    contiCuts: null,
    cinematographyPlan: null,
    // Phase 5: Local Storage
    currentProjectId: null,
    isProjectSaved: true,
    // ★ Flux 엔진 (병행 운영)
    selectedImageEngine: 'gemini' as ImageEngine,
    selectedFluxModel: 'flux-pro' as FluxModel,
    // ★ MSF 대본 모드
    scriptInputMode: 'auto' as const,
};

export function appReducer(state: AppDataState, action: AppAction): AppDataState {
    // ── 카테고리별 헬퍼 위임 (매칭되면 즉시 반환, 없으면 메인 switch로) ──
    const ctxResult = handleContextModeCases(state, action);
    if (ctxResult) return ctxResult;
    const blockResult = handleBlockEditorCases(state, action);
    if (blockResult) return blockResult;

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
        case 'TOGGLE_INTENSE_EMOTION': {
            if (!state.generatedContent) return state;
            const newScenes = state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => cut.cutNumber === action.payload.cutNumber ? { ...cut, useIntenseEmotion: !cut.useIntenseEmotion } : cut)
            }));
            return { ...state, generatedContent: { ...state.generatedContent, scenes: newScenes } };
        }
        case 'TOGGLE_ALL_INTENSE_EMOTION': {
            if (!state.generatedContent) return state;
            const allCuts = state.generatedContent.scenes.flatMap(s => s.cuts);
            const allOn = allCuts.length > 0 && allCuts.every(c => c.useIntenseEmotion);
            const newScenes = state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => ({ ...cut, useIntenseEmotion: !allOn }))
            }));
            return { ...state, generatedContent: { ...state.generatedContent, scenes: newScenes } };
        }
        case 'ADD_IMAGE_TO_CUT': {
            const { image, cutNumber } = action.payload;
            if (!state.generatedContent) return state;

            // Deduplicate history to prevent confusion
            const nextHistory = [image, ...state.generatedImageHistory.filter(img => img.id !== image.id)];

            // Phase B v3 Stage 2: anchor 컷 재생성 시 후속 컷에 staleByAnchor 표시.
            // Context 모드 + OpenAI 엔진일 때만 의미 있음.
            const allCuts = state.generatedContent.scenes.flatMap(s => s.cuts);
            const targetCut = allCuts.find(c => c.cutNumber === cutNumber);
            const realSessions = state.scenarioAnalysis?.outfitSessions || [];
            const outfitSessions = realSessions.length > 0
                ? realSessions
                : deriveOutfitSessionsFromCuts(allCuts);
            const isContextMode = state.imageEngineMode === 'context' && state.selectedImageEngine === 'openai';

            let staleCutNumbers: Set<string> | null = null;
            if (isContextMode && targetCut) {
                const found = findOutfitSessionForCut(targetCut, outfitSessions);
                if (found) {
                    const anchor = findAnchorCutForBatch(found.session, allCuts);
                    if (anchor && anchor.cutNumber === cutNumber) {
                        // 같은 배치의 다른 컷들 stale 표시
                        staleCutNumbers = new Set(
                            allCuts
                                .filter(c =>
                                    c.cutNumber !== cutNumber
                                    && c.location === found.session.location
                                    && (c.sceneLayerId || DEFAULT_SCENE_LAYER_ID)
                                        === (found.session.layerId || DEFAULT_SCENE_LAYER_ID)
                                )
                                .map(c => c.cutNumber)
                        );
                    }
                }
            }

            const nextScenes = state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => {
                    if (cut.cutNumber === cutNumber) {
                        // 자신은 새 이미지 받음 + stale 플래그 해제
                        return { ...cut, selectedImageId: image.id, staleByAnchor: false };
                    }
                    if (staleCutNumbers && staleCutNumbers.has(cut.cutNumber)) {
                        return { ...cut, staleByAnchor: true };
                    }
                    return cut;
                })
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
            
            // 컷 선택 이미지 초기화 (Selected Image)
            const nextScenes = state.generatedContent ? state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => cut.selectedImageId === imageId ? { ...cut, selectedImageId: null } : cut)
            })) : null;

            return {
                ...state,
                generatedImageHistory: nextHistory,
                generatedContent: nextScenes ? { ...state.generatedContent!, scenes: nextScenes } : state.generatedContent,
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
        case 'ADD_USAGE': {
            const { tokens, source } = action.payload;
            if (source === 'claude') return { ...state, claudeTokenCount: state.claudeTokenCount + tokens };
            return { ...state, geminiTokenCount: state.geminiTokenCount + tokens };
        }
        case 'ADD_FAL_USAGE': {
            const { images, model } = action.payload;
            const priceMap: Record<string, number> = { 'flux-pro': 0.03, 'flux-flex': 0.06, 'flux-lora': 0.075 };
            const cost = images * (priceMap[model] || 0.03);
            const today = new Date().toISOString().slice(0, 10);
            const prev = state.falUsage || { totalImages: 0, totalCost: 0, history: [] };
            return {
                ...state,
                falUsage: {
                    totalImages: prev.totalImages + images,
                    totalCost: prev.totalCost + cost,
                    history: [...prev.history, { date: today, images, cost, model }],
                },
            };
        }
        case 'RESET_STATE': return {
            ...initialAppDataState,
            // 인증 + 라이브러리 (세션 유지)
            openAiApiKey: state.openAiApiKey,
            assetLibrary: state.assetLibrary,
            closetCharacters: state.closetCharacters,
            // 사용자 선호 설정 (프로젝트 간 유지)
            filenameTemplate: state.filenameTemplate,
            aiModelTier: state.aiModelTier,
            selectedImageEngine: state.selectedImageEngine,
            selectedFluxModel: state.selectedFluxModel,
            contentFormat: state.contentFormat,
            artStyle: state.artStyle,
            customArtStyle: state.customArtStyle,
            imageRatio: state.imageRatio,
            scriptInputMode: state.scriptInputMode,
            styleLoraId: state.styleLoraId,
            styleLoraScaleOverride: state.styleLoraScaleOverride,
        };
        case 'START_NEW_ANALYSIS': return { ...initialAppDataState, openAiApiKey: state.openAiApiKey, userInputScript: state.userInputScript, storyTitle: state.storyTitle, speakerGender: state.speakerGender, closetCharacters: state.closetCharacters, assetLibrary: state.assetLibrary, filenameTemplate: state.filenameTemplate, artStyle: state.artStyle, customArtStyle: state.customArtStyle, imageRatio: state.imageRatio, logline: state.logline, scriptInputMode: state.scriptInputMode, styleLoraId: state.styleLoraId, styleLoraScaleOverride: state.styleLoraScaleOverride };
        case 'SET_USER_INPUT_SCRIPT': return { ...state, userInputScript: action.payload };
        case 'SET_ENRICHED_SCRIPT': return { ...state, enrichedScript: action.payload };
        case 'SET_ENRICHED_BEATS': return { ...state, enrichedBeats: action.payload };
        case 'SET_STORY_TITLE': return { ...state, storyTitle: action.payload };
        case 'SET_STORY_BRIEF': return { ...state, storyBrief: action.payload };
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
            try {
                const sanitizedPayload = sanitizeState(action.payload as AppDataState);
                return { ...initialAppDataState, ...sanitizedPayload, openAiApiKey: state.openAiApiKey };
            } catch (err) {
                console.warn('RESTORE_STATE 실패 — 초기 상태로 폴백:', err);
                return { ...initialAppDataState, openAiApiKey: state.openAiApiKey };
            }
        }
        case 'SET_SMART_FIELD_SUGGESTIONS': return { ...state, smartFieldSuggestions: { ...state.smartFieldSuggestions, [action.payload.cutId]: { ...state.smartFieldSuggestions[action.payload.cutId], [action.payload.field]: action.payload.suggestions } } };
        case 'CLEAR_SMART_FIELD_SUGGESTIONS': { const newSuggestions = { ...state.smartFieldSuggestions }; delete newSuggestions[action.payload.cutId]; return { ...state, smartFieldSuggestions: newSuggestions }; }
        case 'SET_ANIMATION_STYLE': return { ...state, animationStyle: action.payload };
        case 'ADD_TO_IMAGE_HISTORY': return { ...state, generatedImageHistory: [action.payload, ...state.generatedImageHistory] };
        case 'SET_FILENAME_TEMPLATE': return { ...state, filenameTemplate: action.payload };
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
        case 'SET_IMAGE_RATIO': return { ...state, imageRatio: action.payload };
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
        case 'SET_AI_MODEL_TIER': return { ...state, aiModelTier: action.payload };
        case 'SET_CONTENT_FORMAT': return { ...state, contentFormat: action.payload };
        case 'SET_PIPELINE_CHECKPOINT': return { ...state, pipelineCheckpoint: action.payload };
        case 'SET_SCRIPT_METADATA': return { ...state, scriptMetadata: action.payload };
        // Phase 4: Preproduction Pipeline
        case 'SET_SCENARIO_ANALYSIS': return { ...state, scenarioAnalysis: action.payload };
        case 'SET_LOCATION_REGISTRY': return { ...state, locationRegistry: action.payload };
        case 'SET_LOGLINE': return { ...state, logline: action.payload };
        case 'SET_SCRIPT_INPUT_MODE': return { ...state, scriptInputMode: action.payload };
        case 'SET_CHARACTER_BIBLES': return { ...state, characterBibles: action.payload };
        case 'SET_CONTI_CUTS': return { ...state, contiCuts: action.payload };
        case 'UPDATE_CONTI_CUT': {
            if (!state.contiCuts) return state;
            return { ...state, contiCuts: state.contiCuts.map(c => c.id === action.payload.id ? { ...c, ...action.payload.data } : c) };
        }
        case 'DELETE_CONTI_CUT': {
            if (!state.contiCuts) return state;
            return { ...state, contiCuts: state.contiCuts.filter(c => c.id !== action.payload) };
        }
        case 'SET_CINEMATOGRAPHY_PLAN': return { ...state, cinematographyPlan: action.payload };
        // ★ Flux 엔진 (병행 운영)
        case 'SET_IMAGE_ENGINE': {
            // Phase B v3: Context 모드는 OpenAI 엔진일 때만 활성. 다른 엔진 선택 시 자동 'legacy' 폴백.
            const nextEngine = action.payload;
            if (state.imageEngineMode === 'context' && nextEngine !== 'openai') {
                return { ...state, selectedImageEngine: nextEngine, imageEngineMode: 'legacy' };
            }
            return { ...state, selectedImageEngine: nextEngine };
        }
        case 'SET_FLUX_MODEL': return { ...state, selectedFluxModel: action.payload };
        // Phase 6: LoRA
        case 'SET_STYLE_LORA': return { ...state, styleLoraId: action.payload.id, styleLoraScaleOverride: action.payload.scaleOverride };
        // Phase 5: Local Storage
        case 'SET_CURRENT_PROJECT_ID': return { ...state, currentProjectId: action.payload };
        case 'SET_PROJECT_SAVED': return state.isProjectSaved === action.payload ? state : { ...state, isProjectSaved: action.payload };
        case 'SET_ASSET_CATALOG': return { ...state, assetLibrary: [] }; // placeholder — catalog is external
        case 'RESTORE_IMAGE_URLS' as any: {
            // 로컬 이미지 URL 복원 후 히스토리 + 컷 imageUrls 갱신
            const resolvedHistory = (action as any).payload as GeneratedImage[];
            if (!state.generatedContent) return { ...state, generatedImageHistory: resolvedHistory };
            const newScenes = state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => {
                    const cutImages = resolvedHistory.filter(img => img.sourceCutNumber === cut.cutNumber && img.imageUrl);
                    if (cutImages.length === 0) return cut;
                    return {
                        ...cut,
                        imageUrls: cutImages.map(img => img.imageUrl),
                        selectedImageId: cut.selectedImageId || cutImages[0].id,
                    };
                }),
            }));
            return {
                ...state,
                generatedImageHistory: resolvedHistory,
                generatedContent: { ...state.generatedContent, scenes: newScenes },
            };
        }
        // ── Phase A: Block Editor + Engine Mode ─────────────────────
        // ── Phase B: OpenAI gpt-image-2 ─────────────────────────────
        case 'SET_OPENAI_IMAGE_QUALITY':
            return { ...state, openaiImageQuality: action.payload };
        case 'SET_DALLE_STYLE_ID':
            return { ...state, selectedDalleStyleId: action.payload };
        case 'ADD_OPENAI_USAGE': {
            const { images, costUsd, quality } = action.payload;
            const today = new Date().toISOString().slice(0, 10);
            const history = [...state.openaiUsage.history];
            const todayEntry = history.find(h => h.date === today && h.quality === quality);
            if (todayEntry) {
                todayEntry.images += images;
                todayEntry.costUsd += costUsd;
            } else {
                history.push({ date: today, images, costUsd, quality });
            }
            return {
                ...state,
                openaiUsage: {
                    totalImages: state.openaiUsage.totalImages + images,
                    totalCostUsd: state.openaiUsage.totalCostUsd + costUsd,
                    history,
                },
            };
        }
        default: return state;
    }
}
