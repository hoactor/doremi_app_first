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
    artStyleLabel?: string;
}): GeneratedImage {
    const { imageUrl, sourceCutNumber, prompt, model, tag = 'hq', localPath, id, artStyleLabel } = params;
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
        ...(artStyleLabel !== undefined ? { artStyleLabel } : {}),
    };
}

// ── Phase 7: LocationEntry 헬퍼 (string[] ↔ LocationEntry[] 변환) ──

import type { LocationEntry, LocationCategory } from './types/pipeline';

/** 레거시 string[] 또는 신규 LocationEntry[]를 name 배열로 정규화. */
export function getLocationNames(locations: unknown): string[] {
    if (!Array.isArray(locations)) return [];
    return locations.map((l: any) =>
        typeof l === 'string' ? l : (l?.name ?? '')
    ).filter(Boolean);
}

/** name으로 LocationEntry 찾기. 배열이 string[]이면 category='other'로 자동 생성. */
export function findLocationEntry(
    locations: unknown,
    name: string,
): LocationEntry | undefined {
    if (!Array.isArray(locations) || !name) return undefined;
    for (const l of locations) {
        if (typeof l === 'string') {
            if (l === name) return { name: l, category: 'other' };
        } else if (l?.name === name) {
            return l as LocationEntry;
        }
    }
    return undefined;
}

/** 이름에서 category 유추 (프롬프트 폴백 / 레거시 마이그레이션용 휴리스틱). */
export function inferLocationCategory(name: string): LocationCategory {
    const n = name.toLowerCase();
    // 사적 공간
    if (/(집|아파트|방|침실|본인|내 |우리 집)/.test(name) && !/(할머니|이모|친구|지인|외가|친가)/.test(name)) {
        return 'private_home';
    }
    // 방문지
    if (/(할머니|할아버지|이모|삼촌|고모|친구 집|지인|외가|친가|처가|시가)/.test(name)) {
        return 'visiting_home';
    }
    // 이동 수단
    if (/(자동차|차 안|지하철|버스|택시|비행기|기차|열차|전철|기내)/.test(name)) {
        return 'transit';
    }
    // 공공 실외
    if (/(공원|거리|광장|놀이터|바다|산|강|해변|골목|광화문|주차장)/.test(name)) {
        return 'public_outdoor';
    }
    // 포멀
    if (/(회사|사무실|병원|공항|예식장|법원|행사장|학교|경찰서)/.test(name)) {
        return 'formal';
    }
    // 공공 실내 (기본)
    if (/(카페|식당|옷가게|서점|마트|편의점|레스토랑|백화점|상점|가게|미용실|극장|영화관|피시방)/.test(name)) {
        return 'public_indoor';
    }
    return 'other';
}

/** string 또는 LocationEntry 혼재 배열을 LocationEntry[]로 정규화. 마이그레이션 전용. */
export function normalizeLocationEntries(locations: unknown): LocationEntry[] {
    if (!Array.isArray(locations)) return [];
    return locations.map((l: any): LocationEntry => {
        if (typeof l === 'string') {
            return { name: l, category: inferLocationCategory(l) };
        }
        if (l && typeof l === 'object' && typeof l.name === 'string') {
            return {
                name: l.name,
                category: (l.category as LocationCategory) || inferLocationCategory(l.name),
                ...(l.description ? { description: l.description } : {}),
            };
        }
        return { name: '', category: 'other' };
    }).filter(l => l.name);
}

// ── 3. 의상 조립 (6곳 중복 제거) ──

export interface OutfitBuildOptions {
    /** characterDescriptions에 없는 캐릭터 폴백: true → `[name: standard outfit]` (기본 false → skip) */
    fallbackUnknown?: boolean;
    /** 한국어 의상 사용 (StoryboardReviewModal용): true → koreanLocations/koreanBaseAppearance */
    useKorean?: boolean;
    /** Phase 5-d: 시간/서사 레이어. 없으면 "현재" 가정. 복합 키 "loc::layerId" 우선 조회. */
    sceneLayerId?: string;
}

export function buildMechanicalOutfit(
    names: string[],
    characterDescriptions: { [key: string]: CharacterDescription },
    location: string,
    options: OutfitBuildOptions = {},
): string {
    const { fallbackUnknown = false, useKorean = false, sceneLayerId } = options;
    const layerId = sceneLayerId || '현재';
    const parts: string[] = [];

    names.forEach(name => {
        const key = Object.keys(characterDescriptions).find(k => {
            const cd = characterDescriptions[k];
            return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name;
        });
        if (key && characterDescriptions[key]) {
            const desc = characterDescriptions[key];

            // Phase 5-d: 복합 키 → "loc::현재" → 레거시 평문 → baseAppearance 순서 폴백
            let outfitText: string;
            if (useKorean) {
                outfitText = desc.koreanLocations?.[`${location}::${layerId}`]
                          || desc.koreanLocations?.[`${location}::현재`]
                          || desc.koreanLocations?.[location]
                          || desc.koreanBaseAppearance
                          || '기본 의상';
            } else {
                outfitText = desc.locations?.[`${location}::${layerId}`]
                          || desc.locations?.[`${location}::현재`]
                          || desc.locations?.[location]
                          || desc.baseAppearance
                          || 'standard outfit';
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
