// appImagePersistence.ts — 저장 전 메모리/가져오기 이미지를 프로젝트 폴더로 독립 복사한다.

import type { AppDataState, GeneratedImage } from './types';

export type SaveProjectImageFn = (
    target: 'project',
    subPath: string,
    filename: string,
    base64Data: string,
) => Promise<string>;

export type ReadProjectImageFn = (relativePath: string) => Promise<string>;

const sanitizeFilenamePart = (value: string): string =>
    value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'image';

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
    if (!response.ok) throw new Error(`이미지 URL 읽기 실패 (${response.status})`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${blob.type || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
};

const normalizeImageData = async (image: GeneratedImage): Promise<string | null> => {
    if (image.imageUrl?.startsWith('data:')) return image.imageUrl;
    if (/^(?:blob:|https?:)/i.test(image.imageUrl || '')) return fetchAsDataUrl(image.imageUrl);
    return null;
};

const imageExtension = (dataUrl: string): string => {
    const mime = /^data:([^;,]+)[;,]/i.exec(dataUrl)?.[1]?.toLowerCase();
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';

    const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (payload.startsWith('iVBOR')) return 'png';
    if (payload.startsWith('/9j/')) return 'jpg';
    if (payload.startsWith('UklGR')) return 'webp';
    if (payload.startsWith('R0lGO')) return 'gif';
    throw new Error(`지원하지 않는 이미지 형식입니다: ${mime || 'unknown'}`);
};

const imageContentKey = async (dataUrl: string): Promise<string> => {
    const bytes = new TextEncoder().encode(dataUrl);
    if (globalThis.crypto?.subtle) {
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
        return Array.from(digest.subarray(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
};

export interface PersistProjectImagesResult {
    state: AppDataState;
    savedCount: number;
    localPathReplacements: Array<{ cutNumber: string; from: string; to: string }>;
}

/** 저장된 localPath 이미지를 화면용 data URL로 복원하고 컷별 URL을 안전하게 재조립한다. */
export async function hydrateProjectImages(
    state: Partial<AppDataState>,
    readImage: ReadProjectImageFn,
): Promise<Partial<AppDataState>> {
    if (!Array.isArray(state.generatedImageHistory) || state.generatedImageHistory.length === 0) {
        return state;
    }
    const originalHistory = state.generatedImageHistory;
    const generatedImageHistory = await Promise.all(originalHistory.map(async image => {
        if (!image.localPath || image.imageUrl) return { ...image };
        try {
            return { ...image, imageUrl: await readImage(image.localPath) };
        } catch (error) {
            console.warn(`이미지 복원 실패: ${image.localPath}`, error);
            return { ...image };
        }
    }));
    if (!state.generatedContent) return { ...state, generatedImageHistory };

    const generatedContent = {
        ...state.generatedContent,
        scenes: state.generatedContent.scenes.map(scene => ({
            ...scene,
            cuts: scene.cuts.map(cut => {
                const before = originalHistory.filter(image => image.sourceCutNumber === cut.cutNumber);
                const represented = new Set(before.flatMap(image => [image.localPath, image.imageUrl].filter(Boolean)));
                const extras = (cut.imageUrls || []).filter(url => !represented.has(url));
                const resolved = generatedImageHistory
                    .filter(image => image.sourceCutNumber === cut.cutNumber)
                    .map(image => image.imageUrl || image.localPath)
                    .filter((url): url is string => Boolean(url));
                return { ...cut, imageUrls: Array.from(new Set([...resolved, ...extras])) };
            }),
        })),
    };
    return { ...state, generatedImageHistory, generatedContent };
}

export async function persistProjectImages(
    state: AppDataState,
    projectId: string,
    saveImage: SaveProjectImageFn,
    readImage: ReadProjectImageFn,
): Promise<PersistProjectImagesResult> {
    const ownPrefix = `projects/${projectId}/`;
    let savedCount = 0;
    const generatedImageHistory: GeneratedImage[] = [];
    const replacementsByCut = new Map<string, Map<string, Set<string>>>();
    const localPathReplacements: Array<{ cutNumber: string; from: string; to: string }> = [];
    const addReplacement = (cutNumber: string, from: string, to: string): void => {
        if (!from || from === to) return;
        const byUrl = replacementsByCut.get(cutNumber) || new Map<string, Set<string>>();
        const targets = byUrl.get(from) || new Set<string>();
        targets.add(to);
        byUrl.set(from, targets);
        replacementsByCut.set(cutNumber, byUrl);
    };

    for (const image of state.generatedImageHistory || []) {
        if (image.localPath?.startsWith(ownPrefix)) {
            generatedImageHistory.push({ ...image });
            continue;
        }

        let imageData = await normalizeImageData(image);
        if (!imageData && image.localPath) {
            try {
                imageData = await readImage(image.localPath);
            } catch (error: any) {
                throw new Error(
                    `이미지 "${image.id}"를 새 프로젝트로 복사하지 못했습니다: ${error?.message || error}`
                );
            }
        }
        if (!imageData) {
            generatedImageHistory.push({ ...image });
            continue;
        }

        const extension = imageExtension(imageData);
        const contentKey = await imageContentKey(imageData);
        const filename = [
            'img',
            sanitizeFilenamePart(projectId),
            sanitizeFilenamePart(image.id),
            contentKey,
        ].join('_') + `.${extension}`;
        const localPath = await saveImage('project', `${projectId}/images`, filename, imageData);
        if (image.localPath && image.localPath !== localPath) {
            addReplacement(image.sourceCutNumber, image.localPath, localPath);
            localPathReplacements.push({
                cutNumber: image.sourceCutNumber,
                from: image.localPath,
                to: localPath,
            });
        }
        if (image.imageUrl) addReplacement(image.sourceCutNumber, image.imageUrl, localPath);
        generatedImageHistory.push({ ...image, imageUrl: imageData, localPath });
        savedCount += 1;
    }

    const generatedContent = state.generatedContent
        ? {
            ...state.generatedContent,
            scenes: state.generatedContent.scenes.map(scene => ({
                ...scene,
                cuts: scene.cuts.map(cut => ({
                    ...cut,
                    imageUrls: Array.from(new Set(
                        (cut.imageUrls || []).flatMap(url => {
                            const targets = replacementsByCut.get(cut.cutNumber)?.get(url);
                            return targets ? Array.from(targets) : [url];
                        })
                    )),
                })),
            })),
        }
        : state.generatedContent;

    return {
        state: {
            ...state,
            currentProjectId: projectId,
            generatedImageHistory,
            generatedContent,
        },
        savedCount,
        localPathReplacements,
    };
}
