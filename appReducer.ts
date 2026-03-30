import { AppDataState, AppAction, GeneratedImage, StudioSession, GeneratedScript } from './types';
import { createInitialStudioSession, sanitizeState, getEngineFromModel } from './appUtils';

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

export function appReducer(state: AppDataState, action: AppAction): AppDataState {
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
            const newImage: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl: imageDataUrl, sourceCutNumber: 'user-upload-original', prompt: 'User-uploaded image', engine: getEngineFromModel(state.selectedNanoModel), createdAt: new Date().toISOString() };
            return { ...state, studioSessions: { ...state.studioSessions, [studioId]: { ...state.studioSessions[studioId], originalImage: newImage } } };
        }
        case 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD': {
            const { studioId, imageDataUrl } = action.payload;
            const session = state.studioSessions[studioId];
            const newImage: GeneratedImage = { id: window.crypto.randomUUID(), imageUrl: imageDataUrl, sourceCutNumber: session.currentImage?.sourceCutNumber || 'user-upload', prompt: 'User-uploaded image (edit)', engine: getEngineFromModel(state.selectedNanoModel), createdAt: new Date().toISOString() };
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
