// services/openaiStyleRegistry.ts — OpenAI(DALL-E 3) 전용 화풍 레지스트리
// 화풍은 사용자 한글 요청 + 코드에서 합치는 styleBlock으로 분리 관리.
// Gemini/Flux 경로와는 완전히 격리 (CLAUDE.md 절대 규칙).

import type { OpenAIStylePreset, OpenAIStyleRegistry } from '../types';
import { IS_TAURI, loadOpenAIStyles, saveOpenAIStyles } from './tauriAdapter';

// ─── 빌트인 시드 ────────────────────────────────────────────────────

const WEBTOON_CHIBI_BLOCK =
    'Korean webtoon-style super cute chibi illustration. Characters have ' +
    'oversized round heads, tiny bodies (around 3 heads tall), extremely big ' +
    'sparkling eyes, and puffy round cheeks. Highly expressive faces with ' +
    'exaggerated emotions, blushing cheeks, and sweat drops. Colorful, clean, ' +
    'highly expressive rendering with exaggerated motion effects on a soft ' +
    'pastel background.';

const ANIME_CHIBI_BLOCK =
    'chibi anime style, cute moe 2D illustration, oversized head, small rounded body, ' +
    'short rounded limbs, big sparkling eyes, soft blush, tiny nose and mouth, ' +
    'cheerful expressive face, pastel color palette, clean line art, soft cel shading, ' +
    'glossy highlights, rounded shapes, wholesome cute aesthetic, polished anime illustration';

export const BUILTIN_STYLES: OpenAIStylePreset[] = [
    {
        id: 'webtoon-chibi',
        label: '웹툰 치비 (현재)',
        styleBlock: WEBTOON_CHIBI_BLOCK,
        isBuiltin: true,
    },
    {
        id: 'anime-chibi',
        label: '아니메 치비 (모에)',
        styleBlock: ANIME_CHIBI_BLOCK,
        isBuiltin: true,
    },
];

export const FALLBACK_STYLE_ID = 'webtoon-chibi';
export const BUILTIN_ID_PREFIXES = ['webtoon-', 'anime-'];

const EMPTY_REGISTRY: OpenAIStyleRegistry = {
    styles: [...BUILTIN_STYLES],
    defaultStyleId: FALLBACK_STYLE_ID,
};

// ─── 메모리 캐시 (load 1회 후 재사용) ──────────────────────────────

let cached: OpenAIStyleRegistry | null = null;

/** 영속 저장소에서 레지스트리 로드. 빌트인 누락 시 자동 보강. */
export async function loadStyleRegistry(): Promise<OpenAIStyleRegistry> {
    if (cached) return cached;

    if (!IS_TAURI) {
        cached = mergeWithBuiltins(null);
        return cached;
    }

    let raw: OpenAIStyleRegistry | null = null;
    try {
        raw = await loadOpenAIStyles();
    } catch {
        raw = null;
    }

    cached = mergeWithBuiltins(raw);
    return cached;
}

/** 사용자 변경사항 저장 후 캐시 갱신. */
export async function saveStyleRegistry(reg: OpenAIStyleRegistry): Promise<void> {
    const merged = mergeWithBuiltins(reg);
    if (IS_TAURI) {
        await saveOpenAIStyles(merged);
    }
    cached = merged;
}

/** ID로 styleBlock 조회 — 없으면 default → fallback 체인. */
export async function getStyleBlockById(id: string | undefined | null): Promise<string> {
    const reg = await loadStyleRegistry();
    if (id) {
        const hit = reg.styles.find(s => s.id === id);
        if (hit) return hit.styleBlock;
    }
    const def = reg.styles.find(s => s.id === reg.defaultStyleId);
    if (def) return def.styleBlock;
    const fallback = reg.styles.find(s => s.id === FALLBACK_STYLE_ID);
    return fallback?.styleBlock || WEBTOON_CHIBI_BLOCK;
}

/** ID로 프리셋 전체 조회 (라벨 표시용). 없으면 null. */
export async function getStyleById(id: string): Promise<OpenAIStylePreset | null> {
    const reg = await loadStyleRegistry();
    return reg.styles.find(s => s.id === id) || null;
}

/** 화풍 추가. ID 중복/예약 prefix 검증. */
export async function addStyle(preset: Omit<OpenAIStylePreset, 'isBuiltin'>): Promise<OpenAIStylePreset> {
    const reg = await loadStyleRegistry();
    const id = preset.id.trim();

    if (!id) throw new Error('화풍 ID가 비어있습니다.');
    if (reg.styles.some(s => s.id === id)) {
        throw new Error(`이미 존재하는 화풍 ID입니다: ${id}`);
    }
    if (BUILTIN_ID_PREFIXES.some(p => id.startsWith(p))) {
        throw new Error(`예약된 ID prefix는 사용할 수 없습니다: ${BUILTIN_ID_PREFIXES.join(', ')}`);
    }

    const created: OpenAIStylePreset = {
        id,
        label: preset.label.trim() || id,
        styleBlock: preset.styleBlock.trim(),
        isBuiltin: false,
    };

    const next: OpenAIStyleRegistry = {
        ...reg,
        styles: [...reg.styles, created],
    };
    await saveStyleRegistry(next);
    return created;
}

/** 사용자 화풍만 편집 가능 (빌트인 차단). */
export async function updateStyle(id: string, patch: Partial<Pick<OpenAIStylePreset, 'label' | 'styleBlock'>>): Promise<OpenAIStylePreset> {
    const reg = await loadStyleRegistry();
    const idx = reg.styles.findIndex(s => s.id === id);
    if (idx < 0) throw new Error(`화풍을 찾을 수 없습니다: ${id}`);
    const target = reg.styles[idx];
    if (target.isBuiltin) throw new Error('빌트인 화풍은 수정할 수 없습니다.');

    const updated: OpenAIStylePreset = {
        ...target,
        label: patch.label?.trim() || target.label,
        styleBlock: patch.styleBlock?.trim() || target.styleBlock,
    };
    const styles = [...reg.styles];
    styles[idx] = updated;
    await saveStyleRegistry({ ...reg, styles });
    return updated;
}

/** 사용자 화풍 삭제. defaultStyleId면 fallback으로 되돌림. */
export async function deleteStyle(id: string): Promise<void> {
    const reg = await loadStyleRegistry();
    const target = reg.styles.find(s => s.id === id);
    if (!target) return;
    if (target.isBuiltin) throw new Error('빌트인 화풍은 삭제할 수 없습니다.');

    const styles = reg.styles.filter(s => s.id !== id);
    const defaultStyleId = reg.defaultStyleId === id ? FALLBACK_STYLE_ID : reg.defaultStyleId;
    await saveStyleRegistry({ styles, defaultStyleId });
}

/** 디폴트 화풍 변경. 존재하지 않는 ID면 거부. */
export async function setDefaultStyle(id: string): Promise<void> {
    const reg = await loadStyleRegistry();
    if (!reg.styles.some(s => s.id === id)) {
        throw new Error(`존재하지 않는 화풍 ID: ${id}`);
    }
    await saveStyleRegistry({ ...reg, defaultStyleId: id });
}

/** 멀티윈도우/외부 변경 후 재조회를 위한 캐시 무효화. */
export function invalidateStyleCache(): void {
    cached = null;
}

// ─── 내부: 빌트인 보강 ──────────────────────────────────────────────

function mergeWithBuiltins(input: OpenAIStyleRegistry | null): OpenAIStyleRegistry {
    if (!input || !Array.isArray(input.styles)) {
        return { styles: [...BUILTIN_STYLES], defaultStyleId: FALLBACK_STYLE_ID };
    }

    const userStyles = input.styles.filter(s => !s.isBuiltin && !BUILTIN_ID_PREFIXES.some(p => s.id.startsWith(p)));
    const merged = [...BUILTIN_STYLES, ...userStyles];

    const defaultStyleId = merged.some(s => s.id === input.defaultStyleId)
        ? input.defaultStyleId
        : FALLBACK_STYLE_ID;

    return { styles: merged, defaultStyleId };
}

/** 콘텐츠 prompt + styleBlock 조합. DALL-E에 최종으로 보낼 문자열. */
export function composePromptWithStyle(contentPrompt: string, styleBlock: string): string {
    const content = contentPrompt.trim();
    const style = styleBlock.trim();
    if (!style) return content;
    return `${content}\n\nStyle: ${style}`;
}
