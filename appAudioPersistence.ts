// appAudioPersistence.ts — 프로젝트 오디오 파일 영속화/복원
// React 의존성 없이 저장 액션에서 호출하는 순수 async 헬퍼.

import type { AppDataState, Cut, Scene } from './types';

export type SaveAudioFileFn = (
    subPath: string,
    filename: string,
    base64Data: string,
) => Promise<string>;

export type ReadAudioFileFn = (relativePath: string) => Promise<string>;

const AUDIO_EXTENSIONS: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/aiff': 'aiff',
    'audio/x-aiff': 'aiff',
    'audio/opus': 'opus',
};

const sanitizeFilenamePart = (value: string): string =>
    value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'unknown';

const mimeFromDataUrl = (dataUrl: string): string => {
    const match = /^data:([^;,]+)[;,]/i.exec(dataUrl);
    return match?.[1]?.toLowerCase() || 'audio/wav';
};

const bytesToBase64 = (bytes: Uint8Array): string => {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
};

const fetchAsDataUrl = async (url: string): Promise<string> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`오디오 URL 읽기 실패 (${response.status})`);
    const blob = await response.blob();
    const mime = blob.type || 'audio/wav';
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
};

const normalizeAudioForSave = async (url: string): Promise<string | null> => {
    if (url.startsWith('data:')) return url;
    if (/^(?:blob:|https?:)/i.test(url)) return fetchAsDataUrl(url);
    // 이미 디스크 상대 경로라면 재저장하지 않는다.
    if (url.startsWith('projects/')) return null;
    throw new Error('지원하지 않는 오디오 URL 형식입니다.');
};

const audioContentKey = async (dataUrl: string): Promise<string> => {
    const bytes = new TextEncoder().encode(dataUrl);
    if (globalThis.crypto?.subtle) {
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
        return Array.from(digest.subarray(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    // 구형 WebView에서도 기존 파일명을 덮어쓰지 않도록 매 저장마다 새 키를 쓴다.
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
};

const makeAudioFilename = async (cut: Cut, index: number, dataUrl: string): Promise<string> => {
    const mime = mimeFromDataUrl(dataUrl);
    const extension = AUDIO_EXTENSIONS[mime];
    if (!extension) {
        throw new Error(`지원하지 않는 오디오 형식입니다: ${mime}`);
    }
    const cutKey = sanitizeFilenamePart(cut.cutNumber);
    const idKey = sanitizeFilenamePart(cut.id).slice(0, 12);
    const contentKey = await audioContentKey(dataUrl);
    return `cut_${cutKey}_${idKey}_audio_${index + 1}_${contentKey}.${extension}`;
};

export interface PersistProjectAudioResult {
    state: AppDataState;
    savedCount: number;
}

/**
 * 현재 컷의 data:/blob: 오디오를 프로젝트 audio 폴더에 기록한다.
 * 입력 state는 변경하지 않으며, 하나라도 실패하면 호출자가 project.json 저장을 중단할 수 있다.
 */
export async function persistProjectAudio(
    state: AppDataState,
    projectId: string,
    saveAudioFile: SaveAudioFileFn,
): Promise<PersistProjectAudioResult> {
    if (!state.generatedContent) return { state: { ...state, currentProjectId: projectId }, savedCount: 0 };

    let savedCount = 0;
    const scenes: Scene[] = [];

    for (const scene of state.generatedContent.scenes) {
        const cuts: Cut[] = [];
        for (const cut of scene.cuts) {
            // undefined는 아직 런타임 오디오가 없다는 뜻이므로 기존 경로를 유지한다.
            // []는 사용자가 전부 제거한 명시적 상태이므로 경로도 비운다.
            if (!Array.isArray(cut.audioDataUrls)) {
                cuts.push(Array.isArray(cut.audioPaths)
                    ? { ...cut, audioPaths: [...cut.audioPaths] }
                    : cut);
                continue;
            }

            const audioPaths: string[] = [];
            for (let index = 0; index < cut.audioDataUrls.length; index++) {
                const audioUrl = cut.audioDataUrls[index];
                if (typeof audioUrl !== 'string' || !audioUrl) continue;
                const dataUrl = await normalizeAudioForSave(audioUrl);
                if (dataUrl === null) {
                    audioPaths.push(audioUrl);
                    continue;
                }
                const filename = await makeAudioFilename(cut, index, dataUrl);
                const relativePath = await saveAudioFile(`${projectId}/audio`, filename, dataUrl);
                audioPaths.push(relativePath);
                savedCount += 1;
            }
            cuts.push({
                ...cut,
                audioPaths,
                audioPath: audioPaths[0] || null,
                // 현재 세션에서는 기존 data/blob URL로 계속 재생한다.
                audioDataUrls: [...cut.audioDataUrls],
            });
        }
        scenes.push({ ...scene, cuts });
    }

    return {
        state: {
            ...state,
            currentProjectId: projectId,
            generatedContent: { ...state.generatedContent, scenes },
        },
        savedCount,
    };
}

/** 저장된 audioPaths를 UI가 즉시 재생할 수 있는 data URL로 복원한다. */
export async function hydrateProjectAudio(
    state: Partial<AppDataState>,
    readAudioFile: ReadAudioFileFn,
): Promise<Partial<AppDataState>> {
    if (!state.generatedContent) return state;

    const scenes = await Promise.all(state.generatedContent.scenes.map(async scene => ({
        ...scene,
        cuts: await Promise.all(scene.cuts.map(async cut => {
            const paths = cut.audioPaths || (cut.audioPath ? [cut.audioPath] : []);
            if (paths.length === 0) return cut;

            const existing = Array.isArray(cut.audioDataUrls) ? cut.audioDataUrls : [];
            const playable = await Promise.all(paths.map(async (audioPath, index) => {
                try {
                    return await readAudioFile(audioPath);
                } catch (error) {
                    console.warn(`오디오 복원 실패: ${audioPath}`, error);
                    return existing[index] || null;
                }
            }));
            // 일부만 복원된 배열은 인덱스와 audioPaths의 대응을 깨뜨린다.
            // 이 경우 경로는 그대로 두고 런타임 URL 갱신만 보류한다.
            if (playable.some(url => !url)) {
                return {
                    ...cut,
                    audioPaths: [...paths],
                    audioPath: paths[0] || null,
                    audioDataUrls: existing.length > 0 ? [...existing] : undefined,
                };
            }
            const audioDataUrls = playable.filter((url): url is string => typeof url === 'string' && url.length > 0);
            return {
                ...cut,
                audioPaths: [...paths],
                audioPath: paths[0] || null,
                audioDataUrls: audioDataUrls.length > 0 ? audioDataUrls : undefined,
            };
        })),
    })));

    return {
        ...state,
        generatedContent: { ...state.generatedContent, scenes },
    };
}
