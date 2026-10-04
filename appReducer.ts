// appReducer.ts — 리듀서 + 순수 헬퍼 함수
// React 의존성 제로. AppContext.tsx에서 분리.
// 위치: AppContext.tsx와 같은 루트 레벨

import {
    AppDataState, AppAction, Cut, GeneratedImage, Notification,
    Scene, GeneratedScript, ArtStyle, ContentFormat, AIModelTier,
    ImageEngine, FluxModel, SceneLayer, OutfitSession, ContiCut, EditableScene,
    ProjectMetadata, ProjectCut
} from './types';
import { DEFAULT_SCENE_LAYER_ID } from './types/pipeline';
import { getEngineFromModel, createGeneratedImage, normalizeLocationEntries, findOutfitSessionForCut, findAnchorCutForBatch, deriveOutfitSessionsFromCuts, buildSessionKey } from './appUtils';
import { handleContextModeCases } from './appReducerHelpers/contextModeCases';
import { handleBlockEditorCases } from './appReducerHelpers/blockEditorCases';

const projectCreatedAtCache = new Map<string, string>();

/**
 * 내보내기/IndexedDB 저장 전에 API 키처럼 절대 프로젝트 데이터에 들어가면 안 되는
 * 필드를 중첩 객체까지 제거한다. 키 이름의 대소문자와 `_`/`-` 차이도 허용한다.
 */
const stripSecretFields = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        value.forEach(stripSecretFields);
        return;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (normalized === 'apikey' || normalized.endsWith('apikey') || normalized.endsWith('apikeys')) {
            delete record[key];
            continue;
        }
        stripSecretFields(record[key]);
    }
};

export const sanitizeState = (state: AppDataState): AppDataState => {
    const sanitized = JSON.parse(JSON.stringify(state)) as AppDataState;
    stripSecretFields(sanitized);
    
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
        sanitized.selectedFluxModel = 'flux-2-flex';
    }
    if (!('scriptInputMode' in sanitized) || !sanitized.scriptInputMode) {
        sanitized.scriptInputMode = 'auto';
    }
    if (!('falUsage' in sanitized) || !sanitized.falUsage) {
        sanitized.falUsage = { totalImages: 0, totalCost: 0, history: [] };
    }
    if (!Array.isArray(sanitized.generatedImageHistory)) {
        sanitized.generatedImageHistory = [];
    } else {
        sanitized.generatedImageHistory = sanitized.generatedImageHistory.map(image => ({
            ...image,
            // tag 없는 레거시 이미지는 hq로 취급한다.
            tag: image.tag || 'hq',
        }));
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

const uniqueStrings = (values: unknown[]): string[] => Array.from(new Set(
    values.filter((value): value is string => typeof value === 'string' && value.length > 0)
));

const isLocalMediaPath = (value: string): boolean =>
    !/^(?:data:|blob:|https?:)/i.test(value);

/**
 * 프로젝트 로컬 저장 포맷 v3.
 * v2의 기존 필드는 그대로 두고, 손실되던 컷/이미지/엔진 필드를 추가하는 방식이다.
 */
export const buildProjectMetadata = (state: AppDataState): ProjectMetadata => {
    const now = new Date().toISOString();
    const projectId = state.currentProjectId || '';
    const createdAt = state.projectCreatedAt
        || projectCreatedAtCache.get(projectId)
        || now;
    if (projectId) projectCreatedAtCache.set(projectId, createdAt);

    const scenes = state.generatedContent?.scenes?.map((scene: Scene) => ({
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        settingPrompt: scene.settingPrompt,
        cuts: scene.cuts.map((cut: Cut): ProjectCut => {
            const historyImages = state.generatedImageHistory.filter(
                (image: GeneratedImage) => image.sourceCutNumber === cut.cutNumber
            );
            const imagePaths = uniqueStrings([
                ...historyImages.map(image => image.localPath),
                ...(cut.imageUrls || []).filter(isLocalMediaPath),
            ]);
            const historyImageUrls = new Set(
                historyImages
                    .map(image => image.imageUrl)
                    .filter(Boolean)
            );
            const persistentImageUrls = uniqueStrings(
                (cut.imageUrls || []).filter(url =>
                    !imagePaths.includes(url) && !historyImageUrls.has(url)
                )
            );
            const selectedImage = historyImages.find(image => image.id === cut.selectedImageId);
            const audioPaths = uniqueStrings([
                ...(cut.audioPaths || []),
                cut.audioPath,
            ]);
            if (Array.isArray(cut.audioDataUrls) && cut.audioDataUrls.length !== audioPaths.length) {
                throw new Error(
                    `컷 #${cut.cutNumber} 오디오 파일 저장이 완료되지 않아 project.json 저장을 중단했습니다.`
                );
            }

            return {
                // v1/v2 필드
                id: cut.id,
                cutNumber: cut.cutNumber,
                narration: cut.narration,
                imagePaths,
                selectedImagePath: selectedImage?.localPath || null,
                selectedImageId: cut.selectedImageId,
                audioPath: audioPaths[0] || null,
                audioPaths,
                // v3 project.json에는 대용량 data/blob URL을 넣지 않는다.
                // persistProjectAudio가 먼저 파일로 저장하고 audioPaths를 채운다.
                audioDataUrls: undefined,
                audioDuration: cut.audioDuration,
                imagePrompt: cut.imagePrompt || '',
                cutType: cut.cutType,
                // 히스토리에 없는 업로드/레거시 이미지도 복구할 수 있게 보존
                imageUrls: persistentImageUrls,
                // v3: 실제 편집 가능한 Cut의 지속 필드 전체
                characters: [...(cut.characters || [])],
                location: cut.location,
                cameraAngle: cut.cameraAngle,
                sceneDescription: cut.sceneDescription,
                characterEmotionAndExpression: cut.characterEmotionAndExpression,
                characterPose: cut.characterPose,
                characterOutfit: cut.characterOutfit,
                characterIdentityDNA: cut.characterIdentityDNA,
                locationDescription: cut.locationDescription,
                otherNotes: cut.otherNotes,
                suggestedEffect: cut.suggestedEffect,
                directorialIntent: cut.directorialIntent,
                dialogueSpeaker: cut.dialogueSpeaker,
                guestCharacterUrl: cut.guestCharacterUrl,
                guestCharacterName: cut.guestCharacterName,
                voiceEmotion: cut.voiceEmotion,
                voicePitch: cut.voicePitch,
                voiceSpeed: cut.voiceSpeed,
                artStyleOverride: cut.artStyleOverride,
                useIntenseEmotion: cut.useIntenseEmotion,
                characterEmotionAndExpressionIntense: cut.characterEmotionAndExpressionIntense,
                sceneDescriptionIntense: cut.sceneDescriptionIntense,
                characterPoseIntense: cut.characterPoseIntense,
                sceneLayerId: cut.sceneLayerId,
                sceneNarrative: cut.sceneNarrative,
                cameraNote: cut.cameraNote,
                moodNote: cut.moodNote,
                detailsNarrative: cut.detailsNarrative,
                staleByAnchor: cut.staleByAnchor,
            };
        }),
    })) || [];

    const metadata: ProjectMetadata = {
        version: 3,
        id: projectId,
        title: state.storyTitle || '제목 없음',
        createdAt,
        updatedAt: now,
        artStyle: state.artStyle,
        customArtStyle: state.customArtStyle,
        imageRatio: state.imageRatio,
        speakerGender: state.speakerGender,
        characterDescriptions: state.characterDescriptions || {},
        scenes,
        locationVisualDNA: state.locationVisualDNA || {},
        enrichedScript: state.enrichedScript || '',
        enrichedBeats: state.enrichedBeats || undefined,
        userInputScript: state.userInputScript || '',
        pipelineCheckpoint: state.pipelineCheckpoint,
        scenarioAnalysis: state.scenarioAnalysis,
        characterBibles: state.characterBibles,
        contiCuts: state.contiCuts,
        cinematographyPlan: state.cinematographyPlan,
        locationRegistry: state.locationRegistry || [],
        logline: state.logline || '',
        storyBrief: state.storyBrief || '',
        storyboardSeed: state.storyboardSeed,
        scriptInputMode: state.scriptInputMode || 'auto',
        styleLoraId: state.styleLoraId || null,
        styleLoraScaleOverride: state.styleLoraScaleOverride,
        contentFormat: state.contentFormat || 'ssul-shorts',
        aiModelTier: state.aiModelTier || 'opus',
        editableStoryboard: state.editableStoryboard || null,
        scriptMetadata: state.scriptMetadata,
        contextSummary: state.contextSummary,
        contextSceneDesigns: state.contextSceneDesigns,
        selectedNanoModel: state.selectedNanoModel,
        selectedImageEngine: state.selectedImageEngine || 'gemini',
        selectedFluxModel: state.selectedFluxModel || 'flux-2-flex',
        imageEngineMode: state.imageEngineMode || 'legacy',
        openaiImageQuality: state.openaiImageQuality || 'medium',
        selectedDalleStyleId: state.selectedDalleStyleId,
        backgroundMusicUrl: state.backgroundMusicUrl,
        backgroundMusicName: state.backgroundMusicName,
        animationStyle: state.animationStyle,
        falUsage: state.falUsage,
        openaiUsage: state.openaiUsage,
        generatedImageHistory: state.generatedImageHistory.map((image): GeneratedImage => ({
            id: image.id,
            // 디스크 경로가 있으면 base64 중복 저장을 피하고, 없으면 업로드/편집본을 잃지 않는다.
            imageUrl: image.localPath ? '' : image.imageUrl,
            localPath: image.localPath,
            sourceCutNumber: image.sourceCutNumber,
            prompt: image.prompt,
            engine: image.engine,
            openaiQuality: image.openaiQuality,
            createdAt: image.createdAt,
            tag: image.tag || 'hq',
            model: image.model,
            artStyleLabel: image.artStyleLabel,
            batchAnchorFor: image.batchAnchorFor,
        })),
    };

    // 미래 필드에 비밀값이 섞여도 저장되지 않도록 최종 결과를 깊은 복제 후 방어한다.
    const safeMetadata = JSON.parse(JSON.stringify(metadata)) as ProjectMetadata;
    stripSecretFields(safeMetadata);
    return safeMetadata;
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

const stableLegacyId = (...parts: Array<string | number>): string =>
    parts.join('-').replace(/[^a-zA-Z0-9_-]/g, '_');

export const restoreStateFromProject = (metadata: any): Partial<AppDataState> => {
    // v1 전체-state 내보내기와 v2/v3 로컬 metadata를 모두 읽는다.
    const rawScenes: any[] = Array.isArray(metadata?.scenes)
        ? metadata.scenes
        : (Array.isArray(metadata?.generatedContent?.scenes) ? metadata.generatedContent.scenes : []);
    const projectCreatedAt = typeof metadata?.createdAt === 'string' ? metadata.createdAt : undefined;
    const projectId = typeof metadata?.id === 'string'
        ? metadata.id
        : (typeof metadata?.currentProjectId === 'string' ? metadata.currentProjectId : null);
    if (projectId && projectCreatedAt) projectCreatedAtCache.set(projectId, projectCreatedAt);

    const imageHistory: GeneratedImage[] = (Array.isArray(metadata?.generatedImageHistory)
        ? metadata.generatedImageHistory
        : []
    ).map((image: any, index: number): GeneratedImage => ({
        id: image.id || stableLegacyId('legacy-image', index, image.sourceCutNumber || 'unknown'),
        imageUrl: typeof image.imageUrl === 'string' ? image.imageUrl : '',
        localPath: typeof image.localPath === 'string' ? image.localPath : undefined,
        sourceCutNumber: String(image.sourceCutNumber ?? ''),
        prompt: image.prompt ?? '',
        engine: image.engine || 'nano',
        openaiQuality: image.openaiQuality,
        createdAt: image.createdAt || projectCreatedAt || '',
        // 호환 규칙: tag 없는 이미지는 hq.
        tag: image.tag || 'hq',
        model: image.model,
        artStyleLabel: image.artStyleLabel,
        batchAnchorFor: image.batchAnchorFor,
    }));

    const scenes: Scene[] = rawScenes.map((scene: any, sceneIndex: number): Scene => ({
        sceneNumber: scene.sceneNumber ?? sceneIndex + 1,
        title: scene.title ?? '',
        settingPrompt: scene.settingPrompt ?? '',
        cuts: (Array.isArray(scene.cuts) ? scene.cuts : []).map((cut: any, cutIndex: number): Cut => ({
            id: cut.id || stableLegacyId('legacy-cut', sceneIndex, cutIndex, cut.cutNumber ?? ''),
            cutNumber: String(cut.cutNumber ?? cutIndex + 1),
            narration: cut.narration ?? '',
            characters: Array.isArray(cut.characters) ? [...cut.characters] : [],
            location: cut.location ?? '',
            cameraAngle: cut.cameraAngle ?? '',
            sceneDescription: cut.sceneDescription ?? '',
            characterEmotionAndExpression: cut.characterEmotionAndExpression ?? '',
            characterPose: cut.characterPose ?? '',
            characterOutfit: cut.characterOutfit ?? '',
            characterIdentityDNA: cut.characterIdentityDNA ?? '',
            locationDescription: cut.locationDescription ?? '',
            otherNotes: cut.otherNotes ?? '',
            imageUrls: Array.isArray(cut.imageUrls) ? [...cut.imageUrls] : [],
            suggestedEffect: cut.suggestedEffect,
            imageLoading: false,
            audioPaths: Array.isArray(cut.audioPaths)
                ? [...cut.audioPaths]
                : (typeof cut.audioPath === 'string' ? [cut.audioPath] : []),
            audioPath: cut.audioPath ?? (Array.isArray(cut.audioPaths) ? cut.audioPaths[0] ?? null : null),
            audioDataUrls: Array.isArray(cut.audioDataUrls) ? [...cut.audioDataUrls] : undefined,
            audioDuration: cut.audioDuration,
            selectedImageId: typeof cut.selectedImageId === 'string' ? cut.selectedImageId : null,
            directorialIntent: cut.directorialIntent,
            dialogueSpeaker: cut.dialogueSpeaker,
            guestCharacterUrl: cut.guestCharacterUrl,
            guestCharacterName: cut.guestCharacterName,
            voiceEmotion: cut.voiceEmotion,
            voicePitch: cut.voicePitch,
            voiceSpeed: cut.voiceSpeed,
            imagePrompt: cut.imagePrompt ?? '',
            artStyleOverride: cut.artStyleOverride
                ? migrateArtStyle(cut.artStyleOverride) as ArtStyle
                : undefined,
            useIntenseEmotion: cut.useIntenseEmotion,
            characterEmotionAndExpressionIntense: cut.characterEmotionAndExpressionIntense,
            sceneDescriptionIntense: cut.sceneDescriptionIntense,
            characterPoseIntense: cut.characterPoseIntense,
            sceneLayerId: cut.sceneLayerId,
            sceneNarrative: cut.sceneNarrative,
            cameraNote: cut.cameraNote,
            moodNote: cut.moodNote,
            detailsNarrative: cut.detailsNarrative,
            staleByAnchor: cut.staleByAnchor,
            cutType: cut.cutType,
        })),
    }));

    // v1/v2에서 history가 빠졌어도 cut.imagePaths/imageUrls로 최소 히스토리를 재구성한다.
    rawScenes.forEach((rawScene: any, sceneIndex: number) => {
        const rawCuts = Array.isArray(rawScene?.cuts) ? rawScene.cuts : [];
        rawCuts.forEach((rawCut: any, cutIndex: number) => {
            const cut = scenes[sceneIndex]?.cuts[cutIndex];
            if (!cut) return;
            const candidates = uniqueStrings([
                ...(Array.isArray(rawCut.imagePaths) ? rawCut.imagePaths : []),
                ...(Array.isArray(rawCut.imageUrls) ? rawCut.imageUrls : []),
            ]);
            candidates.forEach((url, imageIndex) => {
                const exists = imageHistory.some(image =>
                    image.sourceCutNumber === cut.cutNumber
                    && (image.localPath === url || image.imageUrl === url)
                );
                if (exists) return;
                const useSelectedId = typeof rawCut.selectedImageId === 'string'
                    && !imageHistory.some(image => image.id === rawCut.selectedImageId)
                    && (rawCut.selectedImagePath === url || (!rawCut.selectedImagePath && imageIndex === 0));
                imageHistory.push({
                    id: useSelectedId
                        ? rawCut.selectedImageId
                        : stableLegacyId('legacy-image', sceneIndex, cutIndex, imageIndex),
                    imageUrl: isLocalMediaPath(url) ? '' : url,
                    localPath: isLocalMediaPath(url) ? url : undefined,
                    sourceCutNumber: cut.cutNumber,
                    prompt: rawCut.imagePrompt ?? '',
                    engine: 'nano',
                    createdAt: projectCreatedAt || '',
                    tag: 'hq',
                    model: metadata?.selectedNanoModel,
                });
            });
        });
    });

    // v3 selectedImageId 우선, v1/v2 selectedImagePath 차선, 그 뒤에만 첫 이미지 폴백.
    rawScenes.forEach((rawScene: any, sceneIndex: number) => {
        const rawCuts = Array.isArray(rawScene?.cuts) ? rawScene.cuts : [];
        rawCuts.forEach((rawCut: any, cutIndex: number) => {
            const cut = scenes[sceneIndex]?.cuts[cutIndex];
            if (!cut) return;
            const cutImages = imageHistory.filter(image => image.sourceCutNumber === cut.cutNumber);
            const selectedById = typeof rawCut.selectedImageId === 'string'
                ? cutImages.find(image => image.id === rawCut.selectedImageId)
                : undefined;
            const selectedByPath = typeof rawCut.selectedImagePath === 'string'
                ? cutImages.find(image => image.localPath === rawCut.selectedImagePath || image.imageUrl === rawCut.selectedImagePath)
                : undefined;
            cut.selectedImageId = selectedById?.id || selectedByPath?.id || cutImages[0]?.id || null;

            const explicitUrls = Array.isArray(rawCut.imageUrls) ? rawCut.imageUrls : [];
            const legacyPaths = Array.isArray(rawCut.imagePaths) ? rawCut.imagePaths : [];
            cut.imageUrls = uniqueStrings([
                ...legacyPaths,
                ...explicitUrls,
                ...cutImages.map(image => image.localPath || image.imageUrl),
            ]);
        });
    });

    const restored: Partial<AppDataState> = {
        appState: scenes.length > 0 ? 'storyboardGenerated' : 'initial',
        generatedContent: scenes.length > 0 ? { scenes } : null,
        characterDescriptions: metadata?.characterDescriptions || {},
        locationVisualDNA: metadata?.locationVisualDNA || {},
        userInputScript: metadata?.userInputScript ?? '',
        enrichedScript: metadata?.enrichedScript ?? null,
        enrichedBeats: metadata?.enrichedBeats ?? null,
        storyTitle: metadata?.title ?? metadata?.storyTitle ?? null,
        speakerGender: metadata?.speakerGender || 'male',
        artStyle: migrateArtStyle(metadata?.artStyle) as ArtStyle,
        imageRatio: metadata?.imageRatio || '1:1',
        generatedImageHistory: imageHistory,
        currentProjectId: projectId,
        projectCreatedAt,
        isProjectSaved: true,
        pipelineCheckpoint: metadata?.pipelineCheckpoint || 'idle',
        scenarioAnalysis: metadata?.scenarioAnalysis || null,
        characterBibles: metadata?.characterBibles || null,
        contiCuts: metadata?.contiCuts || null,
        cinematographyPlan: metadata?.cinematographyPlan || null,
        editableStoryboard: metadata?.editableStoryboard || null,
        contentFormat: metadata?.contentFormat || 'ssul-shorts',
        aiModelTier: metadata?.aiModelTier || 'opus',
        scriptInputMode: metadata?.scriptInputMode || 'auto',
        logline: metadata?.logline ?? '',
        locationRegistry: Array.isArray(metadata?.locationRegistry) ? metadata.locationRegistry : [],
        storyBrief: metadata?.storyBrief ?? '',
        storyboardSeed: metadata?.storyboardSeed ?? null,
        styleLoraId: metadata?.styleLoraId ?? undefined,
        styleLoraScaleOverride: metadata?.styleLoraScaleOverride,
        scriptMetadata: metadata?.scriptMetadata,
        contextSummary: metadata?.contextSummary ?? null,
        contextSceneDesigns: Array.isArray(metadata?.contextSceneDesigns) ? metadata.contextSceneDesigns : undefined,
        selectedNanoModel: metadata?.selectedNanoModel || 'nano-2.5',
        selectedImageEngine: metadata?.selectedImageEngine || 'gemini',
        selectedFluxModel: metadata?.selectedFluxModel || 'flux-2-flex',
        imageEngineMode: metadata?.imageEngineMode || 'legacy',
        openaiImageQuality: metadata?.openaiImageQuality || 'medium',
        selectedDalleStyleId: metadata?.selectedDalleStyleId,
        backgroundMusicUrl: metadata?.backgroundMusicUrl ?? null,
        backgroundMusicName: metadata?.backgroundMusicName ?? null,
        animationStyle: metadata?.animationStyle || 'none',
    };
    if (typeof metadata?.customArtStyle === 'string') restored.customArtStyle = metadata.customArtStyle;
    if (metadata?.falUsage) restored.falUsage = metadata.falUsage;
    if (metadata?.openaiUsage) restored.openaiUsage = metadata.openaiUsage;
    return restored;
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
    selectedFluxModel: 'flux-2-flex' as FluxModel,
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
        case 'UPDATE_IMAGE_LOCAL_PATHS': {
            const paths = new Map(action.payload.map(item => [item.id, item.localPath] as const));
            return {
                ...state,
                generatedImageHistory: state.generatedImageHistory.map(image => {
                    const localPath = paths.get(image.id);
                    return localPath ? { ...image, localPath } : image;
                }),
            };
        }
        case 'REMAP_CUT_IMAGE_URLS': {
            if (!state.generatedContent) return state;
            const replacements = new Map<string, Map<string, Set<string>>>();
            for (const item of action.payload) {
                const byUrl = replacements.get(item.cutNumber) || new Map<string, Set<string>>();
                const targets = byUrl.get(item.from) || new Set<string>();
                targets.add(item.to);
                byUrl.set(item.from, targets);
                replacements.set(item.cutNumber, byUrl);
            }
            return {
                ...state,
                generatedContent: {
                    ...state.generatedContent,
                    scenes: state.generatedContent.scenes.map(scene => ({
                        ...scene,
                        cuts: scene.cuts.map(cut => ({
                            ...cut,
                            imageUrls: Array.from(new Set(
                                (cut.imageUrls || []).flatMap(url => {
                                    const targets = replacements.get(cut.cutNumber)?.get(url);
                                    return targets ? Array.from(targets) : [url];
                                })
                            )),
                        })),
                    })),
                },
            };
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
        case 'SET_CONTEXT_SUMMARY': return { ...state, contextSummary: action.payload };
        case 'ADD_USAGE': {
            const { tokens, source } = action.payload;
            if (source === 'claude') return { ...state, claudeTokenCount: state.claudeTokenCount + tokens };
            return { ...state, geminiTokenCount: state.geminiTokenCount + tokens };
        }
        case 'ADD_FAL_USAGE': {
            const { images, model } = action.payload;
            const priceMap: Record<string, number> = { 'flux-pro': 0.03, 'flux-flex': 0.06, 'flux-2-flex': 0.06, 'flux-lora': 0.075 };
            const cost = images * (priceMap[model] || priceMap['flux-2-flex']);
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
            // 라이브러리 (세션 유지)
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
        case 'START_NEW_ANALYSIS': return { ...initialAppDataState, userInputScript: state.userInputScript, storyTitle: state.storyTitle, speakerGender: state.speakerGender, closetCharacters: state.closetCharacters, assetLibrary: state.assetLibrary, filenameTemplate: state.filenameTemplate, artStyle: state.artStyle, customArtStyle: state.customArtStyle, imageRatio: state.imageRatio, logline: state.logline, scriptInputMode: state.scriptInputMode, styleLoraId: state.styleLoraId, styleLoraScaleOverride: state.styleLoraScaleOverride };
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
                return { ...initialAppDataState, ...sanitizedPayload };
            } catch (err) {
                console.warn('RESTORE_STATE 실패 — 초기 상태로 폴백:', err);
                return { ...initialAppDataState };
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
            const firstCutNumber = newCuts[0]?.cutNumber;
            const normalizedCuts = newCuts.map((cut, index) => index === 0
                ? cut
                : { ...cut, imageUrls: [], selectedImageId: null });
            const newScenes = state.generatedContent.scenes.map(scene => {
                const cuts = (scene.cuts || []);
                const cutIndex = cuts.findIndex(c => c.cutNumber === originalCutNumber);
                if (cutIndex === -1) return scene;
                const updatedCuts = [...cuts];
                updatedCuts.splice(cutIndex, 1, ...normalizedCuts);
                return { ...scene, cuts: updatedCuts };
            });
            const generatedImageHistory = firstCutNumber
                ? state.generatedImageHistory.map(image => image.sourceCutNumber === originalCutNumber
                    ? { ...image, sourceCutNumber: firstCutNumber }
                    : image)
                : state.generatedImageHistory;
            return {
                ...state,
                generatedImageHistory,
                generatedContent: { ...state.generatedContent, scenes: newScenes },
            };
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
        case 'SET_CURRENT_PROJECT_ID': {
            const sameProject = action.payload !== null && action.payload === state.currentProjectId;
            return {
                ...state,
                currentProjectId: action.payload,
                projectCreatedAt: sameProject
                    ? state.projectCreatedAt
                    : (action.payload ? projectCreatedAtCache.get(action.payload) : undefined),
            };
        }
        case 'SET_PROJECT_SAVED': return state.isProjectSaved === action.payload ? state : { ...state, isProjectSaved: action.payload };
        case 'SET_ASSET_CATALOG': return { ...state, assetLibrary: [] }; // placeholder — catalog is external
        case 'RESTORE_IMAGE_URLS' as any: {
            // 로컬 이미지 URL 복원 후 현재 프로젝트의 같은 이미지에만 결과를 병합한다.
            const incoming = (action as any).payload as GeneratedImage[];
            const incomingById = new Map(incoming.map(image => [image.id, image] as const));
            const resolvedHistory = state.generatedImageHistory.map(current => {
                const resolved = incomingById.get(current.id);
                if (!resolved
                    || resolved.localPath !== current.localPath
                    || resolved.sourceCutNumber !== current.sourceCutNumber
                ) return current;
                return { ...current, imageUrl: resolved.imageUrl || current.imageUrl };
            });
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
