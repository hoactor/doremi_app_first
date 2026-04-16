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

// ── 4. 캐릭터 ID 매칭 (레거시 호환) ──

/** charId 또는 한국어 이름 → charId 변환. 매칭 실패 시 null */
export function resolveCharId(
    nameOrId: string,
    characterDescriptions: Record<string, CharacterDescription>
): string | null {
    if (!nameOrId) return null;
    // 1. charId 직접 매칭
    if (characterDescriptions[nameOrId]) return nameOrId;

    // 2. displayName 정확 매칭
    const byExact = Object.entries(characterDescriptions)
        .find(([, c]) => c.koreanName === nameOrId);
    if (byExact) return byExact[0];

    // 3. 괄호 제거 후 매칭
    const strip = (s: string) => s.replace(/\s*\(.*\)$/, '').trim();
    const stripped = strip(nameOrId);
    const byStripped = Object.entries(characterDescriptions)
        .find(([, c]) => strip(c.koreanName || '') === stripped);
    if (byStripped) return byStripped[0];

    // 4. 레거시 키 매칭 (공백→언더스코어)
    const legacyKey = nameOrId.replace(/\s/g, '_');
    if (characterDescriptions[legacyKey]) return legacyKey;

    return null;
}

// ── 5. 대본 포맷 자동 감지 ──

/**
 * 대본 텍스트를 보고 3개 파이프라인 중 어디로 보낼지 결정.
 *
 * 판정 순서 (위에서부터 강한 신호 먼저)
 *   1. MSF       : INT./EXT. 씬 헤딩, FADE IN/OUT, 대사 블록 (이름 + (V.O.))
 *   2. narration : 괄호 메타데이터 (등장인물: .. / 연출의도: .. / 이미지프롬프트: ..)
 *   3. uss       : 그 외 전부 (기본 나레이션 — 한 줄 = 한 컷)
 *
 * USS가 폴백인 이유: 감지 실패 시 가장 관대한 파이프라인(자유 나레이션)으로 보내서
 * 어떤 대본이 와도 최소한 진행은 되게 함.
 */
export function detectScriptFormat(script: string): 'narration' | 'msf' | 'uss' {
    if (!script || !script.trim()) return 'uss';

    // MSF: 씬 헤딩 / 페이드 / (V.O.) / (O.S.) 같은 극본 문법
    const msfPatterns = [
        /\bINT\.\s/i,
        /\bEXT\.\s/i,
        /\bFADE\s+(IN|OUT)[:\.]/i,
        /\([VO]\.?\s*[O]\.?\)/i,       // (V.O.) (O.S.)
        /^\s*#?씬\s*\d+/m,             // "씬 1", "#씬 1"
        /^\s*SCENE\s+\d+/im,
    ];
    if (msfPatterns.some(p => p.test(script))) return 'msf';

    // 이미지상세대본: 괄호 메타데이터 블록
    const narrationPatterns = [
        /\(\s*등장인물\s*[:：]/,
        /\(\s*연출의도\s*[:：]/,
        /\(\s*이미지프롬프트\s*[:：]/,
    ];
    if (narrationPatterns.some(p => p.test(script))) return 'narration';

    // 폴백: USS
    return 'uss';
}
