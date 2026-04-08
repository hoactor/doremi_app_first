// appUtils.ts — 프로젝트 공통 유틸리티 (중복 제거)

import type { GeneratedImage, CharacterDescription, NanoModel } from './types';

// ── 1. 엔진 판별 (14곳 중복 제거) ──

export function getEngineFromModel(model: NanoModel | string): 'nano-v3' | 'nano' {
    return (model === 'nano-3pro' || model === 'nano-3.1') ? 'nano-v3' : 'nano';
}

// ── 2. GeneratedImage 팩토리 (11곳+ 중복 제거) ──

export function createGeneratedImage(params: {
    imageUrl: string;
    sourceCutNumber: string;
    prompt: string;
    model: NanoModel | string;
    tag?: 'rough' | 'normal' | 'hq';
    localPath?: string;
    id?: string;
}): GeneratedImage {
    const { imageUrl, sourceCutNumber, prompt, model, tag = 'hq', localPath, id } = params;
    return {
        id: id || window.crypto.randomUUID(),
        imageUrl,
        localPath,
        sourceCutNumber,
        prompt,
        engine: getEngineFromModel(model),
        tag,
        model: model as NanoModel,
        createdAt: new Date().toISOString(),
    };
}

// ── 3. 의상 조립 (6곳 중복 제거) ──

export interface OutfitBuildOptions {
    /** characterDescriptions에 없는 캐릭터 폴백: true → `[name: standard outfit]` (기본 false → skip) */
    fallbackUnknown?: boolean;
    /** 한국어 의상 사용 (StoryboardReviewModal용): true → koreanLocations/koreanBaseAppearance */
    useKorean?: boolean;
}

export function buildMechanicalOutfit(
    names: string[],
    characterDescriptions: { [key: string]: CharacterDescription },
    location: string,
    options: OutfitBuildOptions = {},
): string {
    const { fallbackUnknown = false, useKorean = false } = options;
    const parts: string[] = [];

    names.forEach(name => {
        const key = Object.keys(characterDescriptions).find(k => {
            const cd = characterDescriptions[k];
            return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name;
        });
        if (key && characterDescriptions[key]) {
            const desc = characterDescriptions[key];

            let outfitText: string;
            if (useKorean) {
                outfitText = desc.koreanLocations?.[location] || desc.koreanBaseAppearance || '기본 의상';
            } else {
                outfitText = desc.locations?.[location] || desc.locations?.['기본 의상'] || desc.baseAppearance || 'standard outfit';
            }
            parts.push(`[${name}: ${outfitText}]`);
        } else if (fallbackUnknown) {
            parts.push(`[${name}: standard outfit]`);
        }
    });

    return parts.join(' ');
}
