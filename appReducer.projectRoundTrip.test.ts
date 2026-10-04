import { assert, test } from 'vitest';
import type { AppDataState, Cut, GeneratedImage } from './types';
import {
    buildProjectMetadata,
    appReducer,
    initialAppDataState,
    restoreStateFromProject,
    sanitizeState,
} from './appReducer';
import { hydrateProjectAudio } from './appAudioPersistence';

const makeCut = (): Cut => ({
    id: 'cut-id-1',
    cutNumber: '1',
    narration: '나레이션',
    characters: ['하나'],
    location: '거실',
    cameraAngle: 'close-up',
    sceneDescription: '장면',
    characterEmotionAndExpression: '놀람',
    characterPose: '서 있음',
    characterOutfit: '파란 옷',
    characterIdentityDNA: 'identity',
    locationDescription: '따뜻한 거실',
    otherNotes: '메모',
    imageUrls: ['projects/proj_roundtrip/images/first.png', 'projects/proj_roundtrip/images/selected.png'],
    suggestedEffect: { name: 'spark', prompt: '반짝임' },
    imageLoading: false,
    audioPaths: ['projects/proj_roundtrip/audio/1.mp3', 'projects/proj_roundtrip/audio/2.mp3'],
    audioPath: 'projects/proj_roundtrip/audio/1.mp3',
    audioDataUrls: ['data:audio/mpeg;base64,AAAA', 'data:audio/mpeg;base64,BBBB'],
    audioDuration: 12.5,
    selectedImageId: 'img-selected',
    directorialIntent: '반전 강조',
    dialogueSpeaker: '하나',
    guestCharacterUrl: 'data:image/png;base64,GUEST',
    guestCharacterName: '손님',
    voiceEmotion: 'happy',
    voicePitch: 0,
    voiceSpeed: 1.2,
    imagePrompt: 'prompt',
    artStyleOverride: 'kyoto',
    useIntenseEmotion: false,
    characterEmotionAndExpressionIntense: '매우 놀람',
    sceneDescriptionIntense: '강한 장면',
    characterPoseIntense: '뒤로 물러남',
    sceneLayerId: 'memory-1',
    sceneNarrative: '자연어 장면',
    cameraNote: '낮은 카메라',
    moodNote: '긴장',
    detailsNarrative: '세부 묘사',
    staleByAnchor: true,
    cutType: 'reaction',
});

const images: GeneratedImage[] = [
    {
        id: 'img-first',
        imageUrl: 'data:image/png;base64,FIRST',
        localPath: 'projects/proj_roundtrip/images/first.png',
        sourceCutNumber: '1',
        prompt: 'first prompt',
        engine: 'flux',
        createdAt: '2026-01-02T00:00:00.000Z',
        tag: 'rough',
        model: 'flux-pro',
        artStyleLabel: 'Flux style',
    },
    {
        id: 'img-selected',
        imageUrl: 'data:image/png;base64,SELECTED',
        localPath: 'projects/proj_roundtrip/images/selected.png',
        sourceCutNumber: '1',
        prompt: 'selected prompt',
        engine: 'gpt-image-2',
        openaiQuality: 'high',
        createdAt: '2026-01-03T00:00:00.000Z',
        tag: 'normal',
        model: 'gpt-image-2',
        artStyleLabel: 'OpenAI style',
        batchAnchorFor: '거실::memory-1::1-2',
    },
];

test('project v3 build/restore is lossless for persistent cut, image, audio, and engine fields', async () => {
    const state: AppDataState = {
        ...initialAppDataState,
        currentProjectId: 'proj_roundtrip',
        projectCreatedAt: '2026-01-01T00:00:00.000Z',
        storyTitle: '왕복 테스트',
        generatedContent: {
            scenes: [{ sceneNumber: 1, title: '씬', settingPrompt: 'setting', cuts: [makeCut()] }],
        },
        generatedImageHistory: images,
        selectedNanoModel: 'nano-3.1',
        selectedImageEngine: 'openai',
        selectedFluxModel: 'flux-lora',
        imageEngineMode: 'context',
        openaiImageQuality: 'high',
        selectedDalleStyleId: 'style-id',
        locationRegistry: ['거실'],
        locationVisualDNA: { 거실: 'warm room' },
    };

    const metadata = buildProjectMetadata(state);
    assert.equal(metadata.version, 3);
    assert.equal(metadata.createdAt, state.projectCreatedAt);
    assert.equal(metadata.scenes[0].cuts[0].selectedImageId, 'img-selected');
    assert.deepEqual(metadata.scenes[0].cuts[0].audioPaths, state.generatedContent!.scenes[0].cuts[0].audioPaths);
    assert.equal(metadata.scenes[0].cuts[0].audioDataUrls, undefined);
    assert.equal(JSON.stringify(metadata).includes('data:audio'), false);

    const restored = await hydrateProjectAudio(restoreStateFromProject(metadata), async path =>
        path.endsWith('/1.mp3') ? 'data:audio/mpeg;base64,AAAA' : 'data:audio/mpeg;base64,BBBB'
    );
    const restoredCut = restored.generatedContent!.scenes[0].cuts[0];
    const restoredSelected = restored.generatedImageHistory!.find(image => image.id === 'img-selected')!;

    assert.equal(restoredCut.selectedImageId, 'img-selected');
    assert.equal(restoredCut.sceneLayerId, 'memory-1');
    assert.equal(restoredCut.artStyleOverride, 'kyoto');
    assert.equal(restoredCut.dialogueSpeaker, '하나');
    assert.equal(restoredCut.voicePitch, 0);
    assert.equal(restoredCut.useIntenseEmotion, false);
    assert.equal(restoredCut.staleByAnchor, true);
    assert.deepEqual(restoredCut.suggestedEffect, { name: 'spark', prompt: '반짝임' });
    assert.deepEqual(restoredCut.audioPaths, state.generatedContent!.scenes[0].cuts[0].audioPaths);
    assert.deepEqual(restoredCut.audioDataUrls, state.generatedContent!.scenes[0].cuts[0].audioDataUrls);
    assert.equal(restoredSelected.tag, 'normal');
    assert.equal(restoredSelected.model, 'gpt-image-2');
    assert.equal(restoredSelected.engine, 'gpt-image-2');
    assert.equal(restoredSelected.openaiQuality, 'high');
    assert.equal(restoredSelected.artStyleLabel, 'OpenAI style');
    assert.equal(restoredSelected.batchAnchorFor, '거실::memory-1::1-2');
    assert.equal(restoredSelected.createdAt, '2026-01-03T00:00:00.000Z');
    assert.equal(restored.selectedImageEngine, 'openai');
    assert.equal(restored.selectedFluxModel, 'flux-lora');
    assert.deepEqual(restored.locationRegistry, ['거실']);

    const secondSave = buildProjectMetadata({ ...state, ...restored } as AppDataState);
    assert.equal(secondSave.createdAt, metadata.createdAt, 'createdAt must not change on later saves');
});

test('v2 fallback restores the exact selected path and treats missing image tags as hq', () => {
    const restored = restoreStateFromProject({
        version: 2,
        id: 'proj_v2',
        title: 'v2',
        createdAt: '2025-01-01T00:00:00.000Z',
        scenes: [{
            sceneNumber: 1,
            title: 'legacy',
            cuts: [{
                cutNumber: '1',
                narration: '',
                imagePaths: ['projects/proj_v2/images/a.png', 'projects/proj_v2/images/b.png'],
                selectedImagePath: 'projects/proj_v2/images/b.png',
                imagePrompt: '',
            }],
        }],
        generatedImageHistory: [
            { id: 'a', localPath: 'projects/proj_v2/images/a.png', sourceCutNumber: '1', prompt: '', engine: 'nano', createdAt: '' },
            { id: 'b', localPath: 'projects/proj_v2/images/b.png', sourceCutNumber: '1', prompt: '', engine: 'nano-v3', createdAt: '' },
        ],
    });

    assert.equal(restored.generatedContent!.scenes[0].cuts[0].selectedImageId, 'b');
    assert.deepEqual(restored.generatedImageHistory!.map(image => image.tag), ['hq', 'hq']);
    assert.equal(restored.selectedFluxModel, 'flux-2-flex');
});

test('all API-key shaped fields are removed before export or project serialization', () => {
    const state = {
        ...initialAppDataState,
        currentProjectId: 'proj_secret_test',
        openAiApiKey: 'must-not-leak',
        futureSettings: {
            CLAUDE_API_KEY: 'also-secret',
            nested: { apiKey: 'nested-secret' },
        },
    } as AppDataState & { futureSettings: Record<string, unknown> };

    const sanitized = sanitizeState(state);
    const exportedJson = JSON.stringify(sanitized);
    assert.equal(exportedJson.includes('must-not-leak'), false);
    assert.equal(exportedJson.includes('also-secret'), false);
    assert.equal(exportedJson.includes('nested-secret'), false);
    assert.equal(exportedJson.toLowerCase().includes('openaiapikey'), false);

    const metadataJson = JSON.stringify(buildProjectMetadata(state));
    assert.equal(metadataJson.includes('must-not-leak'), false);
    assert.equal(metadataJson.toLowerCase().includes('apikey'), false);
});

test('resolved local image data is not embedded or duplicated after save and reopen', () => {
    const localImage: GeneratedImage = {
        id: 'img-local',
        imageUrl: '',
        localPath: 'projects/proj_images/images/local.png',
        sourceCutNumber: '1',
        prompt: 'local',
        engine: 'nano',
        createdAt: '2026-01-01T00:00:00.000Z',
        tag: 'hq',
    };
    const state: AppDataState = {
        ...initialAppDataState,
        currentProjectId: 'proj_images',
        storyTitle: '이미지 저장 테스트',
        generatedContent: {
            scenes: [{
                sceneNumber: 1,
                title: '씬',
                settingPrompt: '',
                cuts: [{ ...makeCut(), audioDataUrls: undefined, audioPaths: [], audioPath: null, imageUrls: [localImage.localPath!] }],
            }],
        },
        generatedImageHistory: [localImage],
    };
    const resolved = appReducer(state, {
        type: 'RESTORE_IMAGE_URLS',
        payload: [{ ...localImage, imageUrl: 'data:image/png;base64,TE9DQUw=' }],
    } as any);

    assert.deepEqual(resolved.generatedContent!.scenes[0].cuts[0].imageUrls, ['data:image/png;base64,TE9DQUw=']);
    const metadata = buildProjectMetadata(resolved);
    assert.equal(JSON.stringify(metadata).includes('TE9DQUw='), false);
    assert.deepEqual(metadata.scenes[0].cuts[0].imageUrls, []);

    const reopened = restoreStateFromProject(metadata);
    assert.equal(reopened.generatedImageHistory!.length, 1);
    assert.equal(reopened.generatedImageHistory![0].localPath, localImage.localPath);
});

test('a history-owned inline image is serialized only once, not again in cut imageUrls', () => {
    const inlineUrl = 'data:image/png;base64,SU5MSU5F';
    const inlineImage: GeneratedImage = {
        id: 'img-inline',
        imageUrl: inlineUrl,
        sourceCutNumber: '1',
        prompt: 'inline',
        engine: 'nano',
        createdAt: '2026-01-01T00:00:00.000Z',
        tag: 'hq',
    };
    const state: AppDataState = {
        ...initialAppDataState,
        currentProjectId: 'proj_inline',
        storyTitle: '인라인 이미지',
        generatedContent: {
            scenes: [{
                sceneNumber: 1,
                title: '씬',
                settingPrompt: '',
                cuts: [{ ...makeCut(), audioDataUrls: undefined, audioPaths: [], audioPath: null, imageUrls: [inlineUrl] }],
            }],
        },
        generatedImageHistory: [inlineImage],
    };

    const metadata = buildProjectMetadata(state);
    const serialized = JSON.stringify(metadata);
    assert.equal(serialized.split(inlineUrl).length - 1, 1);
    assert.deepEqual(metadata.scenes[0].cuts[0].imageUrls, []);
    assert.equal(restoreStateFromProject(metadata).generatedImageHistory!.length, 1);
});

test('splitting a cut keeps its selected image attached to the first new cut after reload', () => {
    const originalCut = { ...makeCut(), audioDataUrls: undefined, audioPaths: [], audioPath: null };
    const selectedImage: GeneratedImage = {
        id: 'img-split-selected',
        imageUrl: '',
        localPath: 'projects/proj_split/images/selected.png',
        sourceCutNumber: originalCut.cutNumber,
        prompt: 'selected',
        engine: 'nano',
        createdAt: '2026-01-01T00:00:00.000Z',
        tag: 'hq',
    };
    const state: AppDataState = {
        ...initialAppDataState,
        currentProjectId: 'proj_split',
        storyTitle: '컷 분할',
        generatedContent: { scenes: [{ sceneNumber: 1, title: '씬', settingPrompt: '', cuts: [originalCut] }] },
        generatedImageHistory: [selectedImage],
    };
    const split = appReducer(state, {
        type: 'REPLACE_CUT',
        payload: {
            originalCutNumber: originalCut.cutNumber,
            newCuts: [
                { ...originalCut, cutNumber: '1-1', selectedImageId: selectedImage.id },
                { ...originalCut, cutNumber: '1-2', selectedImageId: null },
            ],
        },
    });

    assert.equal(split.generatedImageHistory[0].sourceCutNumber, '1-1');
    assert.deepEqual(split.generatedContent!.scenes[0].cuts[1].imageUrls, []);
    const reopened = restoreStateFromProject(buildProjectMetadata(split));
    assert.equal(reopened.generatedContent!.scenes[0].cuts[0].selectedImageId, selectedImage.id);
    assert.equal(reopened.generatedImageHistory![0].sourceCutNumber, '1-1');
});
