import { describe, expect, test, vi } from 'vitest';
import type { AppDataState, GeneratedImage } from './types';
import { initialAppDataState } from './appReducer';
import { hydrateProjectImages, persistProjectImages } from './appImagePersistence';

const image = (overrides: Partial<GeneratedImage>): GeneratedImage => ({
    id: 'img-1',
    imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
    sourceCutNumber: '1',
    prompt: 'test',
    engine: 'nano',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const stateWith = (images: GeneratedImage[]): AppDataState => ({
    ...initialAppDataState,
    currentProjectId: null,
    generatedImageHistory: images,
    generatedContent: {
        scenes: [{
            sceneNumber: 1,
            title: '씬',
            settingPrompt: '',
            cuts: [{
                id: 'cut-1',
                cutNumber: '1',
                narration: '',
                characters: [],
                location: '',
                cameraAngle: '',
                sceneDescription: '',
                characterEmotionAndExpression: '',
                characterPose: '',
                characterOutfit: '',
                locationDescription: '',
                otherNotes: '',
                imageUrls: images.map(item => item.localPath || item.imageUrl),
                imageLoading: false,
                selectedImageId: images[0]?.id || null,
            }],
        }],
    },
});

describe('project image persistence', () => {
    test('an imported image is copied into the new project even when it has an old localPath', async () => {
        const save = vi.fn(async (_target, subPath: string, filename: string) =>
            `projects/${subPath}/${filename}`
        );
        const result = await persistProjectImages(
            stateWith([image({ localPath: 'projects/proj_old/images/old.png' })]),
            'proj_new',
            save,
            async () => { throw new Error('data URL should be preferred'); },
        );

        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][1]).toBe('proj_new/images');
        expect(save.mock.calls[0][2]).toMatch(/^img_proj_new_img-1_[a-f0-9]+\.png$/);
        expect(result.state.generatedImageHistory[0].localPath).toContain('projects/proj_new/images/');
        expect(result.state.generatedContent!.scenes[0].cuts[0].imageUrls[0]).toContain('projects/proj_new/images/');
        expect(JSON.stringify(result.state)).not.toContain('projects/proj_old/images/old.png');
        expect(result.localPathReplacements).toEqual([{
            cutNumber: '1',
            from: 'projects/proj_old/images/old.png',
            to: result.state.generatedImageHistory[0].localPath,
        }]);
    });

    test('an image already owned by the target project is not rewritten', async () => {
        const save = vi.fn();
        const original = stateWith([image({ localPath: 'projects/proj_new/images/owned.png' })]);
        const result = await persistProjectImages(original, 'proj_new', save, async () => 'unused');
        expect(save).not.toHaveBeenCalled();
        expect(result.state.generatedImageHistory[0].localPath).toBe('projects/proj_new/images/owned.png');
    });

    test('a stale cross-project path without image data aborts save instead of persisting a broken reference', async () => {
        const original = stateWith([image({ imageUrl: '', localPath: 'projects/proj_old/images/missing.png' })]);
        await expect(persistProjectImages(
            original,
            'proj_new',
            async () => 'unused',
            async () => { throw new Error('missing'); },
        )).rejects.toThrow('새 프로젝트로 복사하지 못했습니다');
        expect(original.generatedImageHistory[0].localPath).toContain('proj_old');
    });

    test('a shared old path is remapped independently for each source cut', async () => {
        const shared = 'projects/proj_old/images/shared.png';
        const original = stateWith([
            image({ id: 'img-cut-1', sourceCutNumber: '1', localPath: shared }),
            image({ id: 'img-cut-2', sourceCutNumber: '2', localPath: shared }),
        ]);
        const firstCut = original.generatedContent!.scenes[0].cuts[0];
        original.generatedContent!.scenes[0].cuts = [
            { ...firstCut, cutNumber: '1', imageUrls: [shared], selectedImageId: 'img-cut-1' },
            { ...firstCut, id: 'cut-2', cutNumber: '2', imageUrls: [shared], selectedImageId: 'img-cut-2' },
        ];
        const result = await persistProjectImages(
            original,
            'proj_new',
            async (_target, subPath, filename) => `projects/${subPath}/${filename}`,
            async () => { throw new Error('inline data should be used'); },
        );
        const [cutOneUrl] = result.state.generatedContent!.scenes[0].cuts[0].imageUrls;
        const [cutTwoUrl] = result.state.generatedContent!.scenes[0].cuts[1].imageUrls;
        expect(cutOneUrl).toContain('img-cut-1');
        expect(cutTwoUrl).toContain('img-cut-2');
        expect(cutOneUrl).not.toBe(cutTwoUrl);
        expect(JSON.stringify(result.state)).not.toContain(shared);
    });

    test('stored image paths hydrate into playable per-cut URLs without cross-cut mixing', async () => {
        const original = stateWith([
            image({ id: 'one', imageUrl: '', sourceCutNumber: '1', localPath: 'projects/p/images/one.png' }),
            image({ id: 'two', imageUrl: '', sourceCutNumber: '2', localPath: 'projects/p/images/two.png' }),
        ]);
        const firstCut = original.generatedContent!.scenes[0].cuts[0];
        original.generatedContent!.scenes[0].cuts = [
            { ...firstCut, cutNumber: '1', imageUrls: ['projects/p/images/one.png'] },
            { ...firstCut, id: 'cut-2', cutNumber: '2', imageUrls: ['projects/p/images/two.png'] },
        ];
        const hydrated = await hydrateProjectImages(original, async path =>
            path.endsWith('one.png')
                ? 'data:image/png;base64,T05F'
                : 'data:image/png;base64,VFdP'
        );
        expect(hydrated.generatedContent!.scenes[0].cuts[0].imageUrls).toEqual(['data:image/png;base64,T05F']);
        expect(hydrated.generatedContent!.scenes[0].cuts[1].imageUrls).toEqual(['data:image/png;base64,VFdP']);
    });
});
