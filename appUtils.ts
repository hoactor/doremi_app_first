// appUtils.ts — 프로젝트 공통 유틸리티 (중복 제거)

import type { GeneratedImage, CharacterDescription, NanoModel, Cut } from './types';
import { DEFAULT_SCENE_LAYER_ID } from './types/pipeline';

// ── 1. 엔진 판별 (14곳 중복 제거) ──

export function getEngineFromModel(model: NanoModel | string): 'nano-v3' | 'nano' {
    return (model === 'nano-3pro' || model === 'nano-3.1') ? 'nano-v3' : 'nano';
}

// ── 2. GeneratedImage 팩토리 (11곳+ 중복 제거) ──

export function createGeneratedImage(params: {
    imageUrl: string;
    sourceCutNumber: string;
    prompt: string;
    model?: NanoModel | string;
    /** Phase B: engine 직접 지정 (gpt-image-2 등 model로 추론 불가한 케이스). 미지정 시 model 기반 자동 추론. */
    engine?: GeneratedImage['engine'];
    tag?: 'rough' | 'normal' | 'hq';
    localPath?: string;
    id?: string;
    artStyleLabel?: string;
    /** Phase B: gpt-image-2 quality */
    openaiQuality?: import('./types').OpenAIImageQuality;
}): GeneratedImage {
    const { imageUrl, sourceCutNumber, prompt, model, engine, tag = 'hq', localPath, id, artStyleLabel, openaiQuality } = params;
    const resolvedEngine: GeneratedImage['engine'] = engine ?? (model ? getEngineFromModel(model) : 'nano');
    return {
        id: id || window.crypto.randomUUID(),
        imageUrl,
        localPath,
        sourceCutNumber,
        prompt,
        engine: resolvedEngine,
        tag,
        model: (model ?? '') as NanoModel,
        createdAt: new Date().toISOString(),
        ...(artStyleLabel !== undefined ? { artStyleLabel } : {}),
        ...(openaiQuality !== undefined ? { openaiQuality } : {}),
    };
}

// ── Phase 7: LocationEntry 헬퍼 (string[] ↔ LocationEntry[] 변환) ──

import type { LocationEntry, LocationCategory, TransitionType, OutfitSession } from './types/pipeline';

/**
 * 심화 1: 카테고리 전환 매트릭스. FROM × TO → TransitionType.
 * Step 1 후처리에서 outfitSessions를 순회하며 각 세션의 transitionFromPrev 계산.
 * 같은 카테고리끼리는 유지, 실내↔외부는 외투 추가/제거, home_return은 외출→집.
 */
const TRANSITION_MATRIX: Record<LocationCategory, Record<LocationCategory, TransitionType>> = {
    private_home: {
        private_home: 'maintain',
        visiting_home: 'full_change',
        public_indoor: 'full_change',
        public_outdoor: 'full_change',
        transit: 'full_change',
        formal: 'full_change',
        other: 'full_change',
    },
    visiting_home: {
        private_home: 'home_return',
        visiting_home: 'maintain',
        public_indoor: 'maintain',
        public_outdoor: 'add_outerwear',
        transit: 'maintain',
        formal: 'full_change',
        other: 'maintain',
    },
    public_indoor: {
        private_home: 'home_return',
        visiting_home: 'maintain',
        public_indoor: 'maintain',
        public_outdoor: 'add_outerwear',
        transit: 'maintain',
        formal: 'full_change',
        other: 'maintain',
    },
    public_outdoor: {
        private_home: 'home_return',
        visiting_home: 'maintain',
        public_indoor: 'remove_outerwear',
        public_outdoor: 'maintain',
        transit: 'maintain',
        formal: 'full_change',
        other: 'remove_outerwear',
    },
    transit: {
        private_home: 'home_return',
        visiting_home: 'maintain',
        public_indoor: 'remove_outerwear',
        public_outdoor: 'add_outerwear',
        transit: 'maintain',
        formal: 'full_change',
        other: 'maintain',
    },
    formal: {
        private_home: 'home_return',
        visiting_home: 'maintain',
        public_indoor: 'maintain',
        public_outdoor: 'add_outerwear',
        transit: 'maintain',
        formal: 'maintain',
        other: 'maintain',
    },
    other: {
        private_home: 'home_return',
        visiting_home: 'maintain',
        public_indoor: 'maintain',
        public_outdoor: 'add_outerwear',
        transit: 'maintain',
        formal: 'full_change',
        other: 'maintain',
    },
};

/**
 * 두 세션 간 전환 타입 계산.
 * - 다른 sceneLayer(회상 등) = full_change 무조건
 * - 같은 location+layer = maintain
 * - 카테고리 매트릭스 조회
 */
export function computeOutfitTransition(
    fromLocation: string,
    fromLayerId: string,
    fromCategory: LocationCategory,
    toLocation: string,
    toLayerId: string,
    toCategory: LocationCategory,
): TransitionType {
    if (fromLayerId !== toLayerId) return 'full_change';
    if (fromLocation === toLocation) return 'maintain';
    return TRANSITION_MATRIX[fromCategory]?.[toCategory] || 'full_change';
}

/**
 * outfitSessions 배열에 transitionFromPrev 필드를 채움 (in-place).
 * lineRange[0] 오름차순 정렬 후 각 세션의 직전 세션과 비교해 transition 계산.
 */
export function annotateOutfitSessionsWithTransitions(
    sessions: OutfitSession[],
    locations: LocationEntry[],
): void {
    if (sessions.length === 0) return;
    const categoryByName = new Map(locations.map(l => [l.name, l.category]));
    // 시간 순 정렬 (lineRange[0] 오름차순)
    sessions.sort((a, b) => a.lineRange[0] - b.lineRange[0]);
    for (let i = 0; i < sessions.length; i++) {
        if (i === 0) {
            sessions[i].transitionFromPrev = undefined; // 첫 세션
            continue;
        }
        const prev = sessions[i - 1];
        const curr = sessions[i];
        const prevCat = categoryByName.get(prev.location) || 'other';
        const currCat = categoryByName.get(curr.location) || 'other';
        curr.transitionFromPrev = computeOutfitTransition(
            prev.location, prev.layerId, prevCat,
            curr.location, curr.layerId, currCat,
        );
    }
}

/** TransitionType → 한국어 라벨 (프롬프트/UI 표시용). */
export function transitionLabel(t: TransitionType | undefined): string {
    if (!t) return '첫 세션';
    switch (t) {
        case 'maintain': return '유지';
        case 'add_outerwear': return '외투 추가';
        case 'remove_outerwear': return '외투 제거';
        case 'full_change': return '완전 교체';
        case 'home_return': return '귀가 변경';
    }
}

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

// Phase 7 수정: DNA 오염 감지 + 안전한 의상 폴백
const DNA_POLLUTION_PATTERN = /\b(hair|face|skin|eyes|jawline|forehead|wavy texture|cheekbone|eyebrow|eyelid|complexion|freckle|dimple|nose bridge|lip shape)\b/i;

/** baseAppearance 같은 외모 서술이 의상 필드로 흘러들지 못하도록 방어. */
function safeOutfitFallback(candidate: string | undefined, gender: 'male' | 'female' | string | undefined, useKorean: boolean): string {
    if (candidate && !DNA_POLLUTION_PATTERN.test(candidate)) return candidate;
    // 오염 감지됨 → 중립 의상 폴백 (외모 서술 제거 목적)
    if (useKorean) {
        return gender === 'female' ? '편안한 일상복' : '편안한 일상복';
    }
    return gender === 'female' ? 'neutral casual outfit in warm palette' : 'neutral casual outfit in warm palette';
}

export function buildMechanicalOutfit(
    names: string[],
    characterDescriptions: { [key: string]: CharacterDescription },
    location: string,
    options: OutfitBuildOptions = {},
): string {
    const { fallbackUnknown = false, useKorean = false, sceneLayerId } = options;
    const layerId = sceneLayerId || DEFAULT_SCENE_LAYER_ID;
    const parts: string[] = [];

    names.forEach(name => {
        const key = resolveCharId(name, characterDescriptions);
        if (key && characterDescriptions[key]) {
            const desc = characterDescriptions[key];

            // Phase 5-d: 복합 키 → "loc::현재" → 레거시 평문 순서 폴백
            // Phase 7 수정: baseAppearance 폴백을 명시적 "중립 의상"으로 대체 (외모 오염 방지)
            let outfitText: string | undefined;
            if (useKorean) {
                outfitText = desc.koreanLocations?.[`${location}::${layerId}`]
                          || desc.koreanLocations?.[`${location}::현재`]
                          || desc.koreanLocations?.[location];
                // outfitText가 없거나 DNA 오염됐으면 중립 폴백
                outfitText = safeOutfitFallback(outfitText, desc.gender, true);
            } else {
                outfitText = desc.locations?.[`${location}::${layerId}`]
                          || desc.locations?.[`${location}::현재`]
                          || desc.locations?.[location];
                outfitText = safeOutfitFallback(outfitText, desc.gender, false);
            }
            parts.push(`[${name}: ${outfitText}]`);
        } else if (fallbackUnknown) {
            parts.push(`[${name}: standard outfit]`);
        }
    });

    return parts.join(' ');
}

// ── 4. 캐릭터 ID 매칭 (레거시 호환) ──

/**
 * charId/canonicalName/koreanName/alias → charId 변환.
 * 괄호 속 역할 표기와 영문 대소문자 차이는 무시한다. 매칭 실패 시 null.
 */
export function resolveCharId(
    nameOrId: string,
    characterDescriptions: Record<string, CharacterDescription>
): string | null {
    const rawName = nameOrId?.trim();
    if (!rawName) return null;

    // 1. charId 직접 매칭
    if (characterDescriptions[rawName]) return rawName;

    const entries = Object.entries(characterDescriptions);

    // 2. 모든 공식 이름/별칭의 정확 매칭
    const exact = entries.find(([key, char]) =>
        key === rawName
        || char.canonicalName === rawName
        || char.koreanName === rawName
        || (char.aliases || []).includes(rawName)
    );
    if (exact) return exact[0];

    // 3. 괄호 속 역할 표기, 전각 괄호, 연속 공백, 영문 대소문자를 정규화한 매칭
    const normalizeCharacterName = (value: string): string => value
        .normalize('NFKC')
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
    const normalizedName = normalizeCharacterName(rawName);
    const normalized = entries.find(([key, char]) => {
        const candidates = [key, char.canonicalName, char.koreanName, ...(char.aliases || [])]
            .filter((candidate): candidate is string => !!candidate);
        return candidates.some(candidate => normalizeCharacterName(candidate) === normalizedName);
    });
    if (normalized) return normalized[0];

    // 4. 레거시 키 매칭 (공백→언더스코어)
    const legacyKey = rawName.replace(/\s/g, '_');
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

// ── Phase B v3 Stage 1: 배치 anchor 헬퍼 ──

/**
 * outfitSessions가 비어있는 프로젝트(Phase 5 이전 분석 등)를 위한 자동 파생.
 * cuts를 (location, sceneLayerId) 조합으로 묶어 가상의 OutfitSession[] 반환.
 * lineRange는 컷 인덱스 기반 가짜 값 (1부터 +1씩) — 실제 라인 매핑은 안 됨.
 */
export function deriveOutfitSessionsFromCuts(cuts: Cut[]): OutfitSession[] {
    if (!Array.isArray(cuts) || cuts.length === 0) return [];
    const seen = new Map<string, OutfitSession>();
    cuts.forEach((c, idx) => {
        const layerId = c.sceneLayerId || DEFAULT_SCENE_LAYER_ID;
        const key = `${c.location}::${layerId}`;
        if (!seen.has(key)) {
            seen.set(key, {
                location: c.location || '',
                layerId,
                lineRange: [idx + 1, idx + 1],
            });
        } else {
            const existing = seen.get(key)!;
            existing.lineRange = [existing.lineRange[0], idx + 1];
        }
    });
    return Array.from(seen.values()).filter(s => s.location);
}

/**
 * outfitSession 안정 키. GeneratedImage.batchAnchorFor 값으로 사용.
 * `${location}::${layerId}::${lineRangeStart}-${lineRangeEnd}`
 */
export function buildBatchAnchorKey(session: OutfitSession): string {
    const layerId = session.layerId || DEFAULT_SCENE_LAYER_ID;
    const [start, end] = session.lineRange || [0, 0];
    return `${session.location}::${layerId}::${start}-${end}`;
}

/** Phase A.6: Context 모드 sessionKey alias — buildBatchAnchorKey와 동일 형식. */
export const buildSessionKey = buildBatchAnchorKey;

/**
 * 컷이 어느 outfitSession에 속하는지 판정.
 * (location, sceneLayerId) 복합 매칭. sceneLayerId 없으면 'DEFAULT_SCENE_LAYER_ID' 폴백.
 */
export function findOutfitSessionForCut(
    cut: Pick<Cut, 'location' | 'sceneLayerId'>,
    outfitSessions: OutfitSession[],
): { session: OutfitSession; index: number } | null {
    if (!Array.isArray(outfitSessions) || outfitSessions.length === 0) return null;
    const layerId = cut.sceneLayerId || DEFAULT_SCENE_LAYER_ID;
    const idx = outfitSessions.findIndex(
        os => os.location === cut.location && (os.layerId || DEFAULT_SCENE_LAYER_ID) === layerId,
    );
    if (idx === -1) return null;
    return { session: outfitSessions[idx], index: idx };
}

/**
 * 같은 outfitSession에 속한 컷들 중 anchor 컷 반환.
 * 우선순위: 1) session.anchorCutNumber 수동 오버라이드 → 2) cuts 순서상 첫 매칭 컷.
 */
export function findAnchorCutForBatch(
    session: OutfitSession,
    cuts: Cut[],
): Cut | null {
    if (!Array.isArray(cuts) || cuts.length === 0) return null;
    const layerId = session.layerId || DEFAULT_SCENE_LAYER_ID;
    if (session.anchorCutNumber) {
        const overridden = cuts.find(c => c.cutNumber === session.anchorCutNumber);
        if (overridden) return overridden;
    }
    return cuts.find(
        c => c.location === session.location
            && (c.sceneLayerId || DEFAULT_SCENE_LAYER_ID) === layerId,
    ) || null;
}

/**
 * 이 컷이 자기 배치에서 첫 컷(=자동 anchor)인가.
 * 사용자 수동 오버라이드된 anchorCutNumber도 anchor로 인정.
 */
export function isFirstCutInBatch(
    cut: Pick<Cut, 'cutNumber' | 'location' | 'sceneLayerId'>,
    cuts: Cut[],
    outfitSessions: OutfitSession[],
): boolean {
    const found = findOutfitSessionForCut(cut, outfitSessions);
    if (!found) return false;
    const anchor = findAnchorCutForBatch(found.session, cuts);
    return anchor?.cutNumber === cut.cutNumber;
}

/** 프롬프트 수정은 macOS ⌘+Enter에서만 실행한다. 일반 Enter는 textarea 줄바꿈이다. */
export function shouldSubmitPromptRefinement(
    event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'isComposing'> & { ctrlKey?: boolean },
    input: string,
): boolean {
    return !event.isComposing
        && event.key === 'Enter'
        && event.metaKey
        && input.trim().length > 0;
}
