import { describe, expect, test, vi } from 'vitest';
import type { AppDataState, Cut } from './types';
import { buildProjectMetadata, initialAppDataState } from './appReducer';
import { hydrateProjectAudio, persistProjectAudio } from './appAudioPersistence';

const makeCut = (audioDataUrls?: string[], audioPaths?: string[]): Cut => ({
    id: 'cut-audio-id',
    cutNumber: '1-A',
    narration: '오디오 테스트',
    characters: [],
    location: '',
    cameraAngle: '',
    sceneDescription: '',
    characterEmotionAndExpression: '',
    characterPose: '',
    characterOutfit: '',
    locationDescription: '',
    otherNotes: '',
    imageUrls: [],
    imageLoading: false,
    audioDataUrls,
    audioPaths,
    audioPath: audioPaths?.[0] || null,
    selectedImageId: null,
});

const makeState = (cut: Cut): AppDataState => ({
    ...initialAppDataState,
    currentProjectId: 'proj_audio',
    storyTitle: '오디오 프로젝트',
    generatedContent: {
        scenes: [{ sceneNumber: 1, title: '씬', settingPrompt: '', cuts: [cut] }],
    },
});

describe('project audio persistence', () => {
    test('data/blob audio is saved first and v3 metadata contains paths only', async () => {
        const blobUrl = URL.createObjectURL(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/ogg' }));
        const calls: Array<{ subPath: string; filename: string; data: string }> = [];
        try {
            const original = makeState(makeCut([
                'data:audio/mpeg;base64,QUJD',
                blobUrl,
            ]));
            expect(() => buildProjectMetadata(original)).toThrow('오디오 파일 저장이 완료되지 않아');
            const result = await persistProjectAudio(original, 'proj_audio', async (subPath, filename, data) => {
                calls.push({ subPath, filename, data });
                return `projects/${subPath}/${filename}`;
            });

            expect(result.savedCount).toBe(2);
            expect(calls.map(call => call.subPath)).toEqual(['proj_audio/audio', 'proj_audio/audio']);
            expect(calls[0].filename).toMatch(/\.mp3$/);
            expect(calls[1].filename).toMatch(/\.ogg$/);
            expect(calls[1].data).toBe('data:audio/ogg;base64,AQIDBA==');
            expect(original.generatedContent!.scenes[0].cuts[0].audioPaths).toBeUndefined();

            const persistedCut = result.state.generatedContent!.scenes[0].cuts[0];
            expect(persistedCut.audioPaths).toHaveLength(2);
            const metadata = buildProjectMetadata(result.state);
            expect(metadata.scenes[0].cuts[0].audioPaths).toEqual(persistedCut.audioPaths);
            expect(metadata.scenes[0].cuts[0].audioDataUrls).toBeUndefined();
            expect(JSON.stringify(metadata)).not.toContain('data:audio');
            expect(JSON.stringify(metadata)).not.toContain('blob:');
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    });

    test('an explicit empty runtime audio list clears stale paths without mutating input', async () => {
        const original = makeState(makeCut([], [
            'projects/proj_audio/audio/old-1.wav',
            'projects/proj_audio/audio/old-2.wav',
        ]));
        const before = JSON.stringify(original);
        const result = await persistProjectAudio(original, 'proj_audio', async () => {
            throw new Error('should not save');
        });

        expect(result.savedCount).toBe(0);
        expect(result.state.generatedContent!.scenes[0].cuts[0].audioPaths).toEqual([]);
        expect(JSON.stringify(original)).toBe(before);
    });

    test('legacy paths hydrate to playable data URLs and v1/v2 inline audio remains compatible', async () => {
        const state = makeState(makeCut(undefined, [
            'projects/proj_audio/audio/a.wav',
            'projects/proj_audio/audio/b.mp3',
        ]));
        const hydrated = await hydrateProjectAudio(state, async path =>
            path.endsWith('.wav')
                ? 'data:audio/wav;base64,V0FW'
                : 'data:audio/mpeg;base64,TVAz'
        );
        const cut = hydrated.generatedContent!.scenes[0].cuts[0];
        expect(cut.audioDataUrls).toEqual([
            'data:audio/wav;base64,V0FW',
            'data:audio/mpeg;base64,TVAz',
        ]);

        const legacyInline = makeState(makeCut(['data:audio/wav;base64,TEVHQUNZ']));
        const unchanged = await hydrateProjectAudio(legacyInline, async () => {
            throw new Error('no path should be read');
        });
        expect(unchanged.generatedContent!.scenes[0].cuts[0].audioDataUrls)
            .toEqual(['data:audio/wav;base64,TEVHQUNZ']);
    });

    test('a partial read failure keeps path ordering and does not create a shifted audio list', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const state = makeState(makeCut(undefined, [
            'projects/proj_audio/audio/missing.wav',
            'projects/proj_audio/audio/good.wav',
        ]));
        try {
            const hydrated = await hydrateProjectAudio(state, async path => {
                if (path.includes('missing')) throw new Error('missing');
                return 'data:audio/wav;base64,R09PRA==';
            });
            const cut = hydrated.generatedContent!.scenes[0].cuts[0];
            expect(cut.audioPaths).toEqual([
                'projects/proj_audio/audio/missing.wav',
                'projects/proj_audio/audio/good.wav',
            ]);
            expect(cut.audioDataUrls).toBeUndefined();
        } finally {
            warn.mockRestore();
        }
    });

    test('a failed file write rejects without changing project state', async () => {
        const original = makeState(makeCut(['data:audio/wav;base64,QUJD']));
        const before = JSON.stringify(original);
        await expect(persistProjectAudio(original, 'proj_audio', async () => {
            throw new Error('disk full');
        })).rejects.toThrow('disk full');
        expect(JSON.stringify(original)).toBe(before);
    });

    test('different audio content gets different filenames and a partial failure preserves old paths', async () => {
        const oldPaths = [
            'projects/proj_audio/audio/old-1.wav',
            'projects/proj_audio/audio/old-2.wav',
        ];
        const original = makeState(makeCut([
            'data:audio/wav;base64,QUFB',
            'data:audio/wav;base64,QkJC',
        ], oldPaths));
        const filenames: string[] = [];

        await expect(persistProjectAudio(original, 'proj_audio', async (_subPath, filename) => {
            filenames.push(filename);
            if (filenames.length === 2) throw new Error('disk full');
            return `projects/proj_audio/audio/${filename}`;
        })).rejects.toThrow('disk full');

        expect(filenames).toHaveLength(2);
        expect(filenames[0]).not.toBe(filenames[1]);
        expect(original.generatedContent!.scenes[0].cuts[0].audioPaths).toEqual(oldPaths);
    });

    test('unknown audio MIME is rejected instead of being mislabeled as WAV', async () => {
        const original = makeState(makeCut(['data:audio/unknown;base64,QUJD']));
        await expect(persistProjectAudio(original, 'proj_audio', async () => 'unused'))
            .rejects.toThrow('지원하지 않는 오디오 형식');
    });
});
