// services/ai/dallePromptEnhance.ts
// 짧은 사용자 묘사 → DALL-E 3 최적화 영문 프롬프트
// 에셋 타입(character/background/outfit/prop)별 템플릿 + 현재 ArtStyle 반영
// 재요청(refine)도 지원: 기존 DALL-E 프롬프트 + 추가 지시 → 수정된 프롬프트

import { callClaude } from '../claudeService';
import type { ArtStyle } from '../../types';
import type { DalleAssetType } from '../openaiService';

// ─── 화풍 힌트 (DALL-E 3 용어에 맞게) ─────────────────────────────────
const ART_STYLE_HINTS: Record<ArtStyle, string> = {
    'normal':       'clean Korean webtoon, cel-shaded flat colors, black outlines, readable simple composition',
    'moe':          'moe chibi sticker illustration, flat pastel candy colors, thick brown outlines, no shadows, cute SD proportions',
    'dalle-chibi':  'premium super-deformed chibi anime, warm amber and rose-gold glow, sparkle particles, soft airbrush shading, dreamy bloom, big head tiny body',
    'vibrant':      'glamorous idol anime, jewel-tone palette, dramatic stage lighting, glossy polished rendering, mature adult proportions',
    'kyoto':        'cinematic Kyoto Animation anime, natural sunlight, detailed atmospheric background, thin delicate lines',
    'custom':       '',
};

function styleHint(artStyle: ArtStyle, customArtStyle?: string): string {
    if (artStyle === 'custom' && customArtStyle?.trim()) return customArtStyle.trim();
    return ART_STYLE_HINTS[artStyle] || ART_STYLE_HINTS['dalle-chibi'];
}

// ─── 에셋 타입별 구조 지시 ────────────────────────────────────────────
const TYPE_INSTRUCTIONS: Record<DalleAssetType, string> = {
    character: `
- 용도: 캐릭터 레퍼런스 시트 (나중에 다른 AI가 얼굴 참조로 사용)
- 구도: full body visible, 3/4 view OR front view, neutral standing pose
- 배경: clean solid background OR simple gradient — NO complex scene
- 얼굴: clearly visible, 명확한 표정 (neutral smile 기본)
- 디테일: face / hair / outfit 모두 뚜렷하게 식별 가능
- 금지: extreme camera angles, motion blur, complex backgrounds, cropped body`,

    background: `
- 용도: 장소/환경 참조 이미지 (나중에 씬 배경으로 활용)
- 필수: NO PEOPLE, NO CHARACTERS, empty scene
- 구도: establishing shot, 공간 전체가 보이도록
- 깊이: clear foreground / midground / background layers
- 조명: atmospheric, readable mood
- 디테일: 공간의 스타일과 시대/분위기가 명확히 드러나도록`,

    outfit: `
- 용도: 의상 레퍼런스 (나중에 캐릭터에 입힐 때 참조)
- 구도: 정면 + 측면 OR 마네킹 스타일, full outfit visible
- 배경: plain neutral background (white/grey), 의상에 집중
- 디테일: fabric texture, fold, seam, button, accessory 모두 식별 가능
- 금지: face features (얼굴 특징), 특정 인물성, 복잡한 배경`,

    prop: `
- 용도: 소품 레퍼런스 (나중에 씬에 배치)
- 구도: product photography style, 오브제가 프레임 중앙
- 배경: clean neutral background, studio lighting
- 디테일: material, texture, proportions 명확히 식별 가능
- 금지: people interacting with the prop, complex scenes, multiple objects`,
};

// ─── 시스템 프롬프트 (Claude에게 주는 지시) ────────────────────────────
const SYSTEM_PROMPT = `You are a DALL-E 3 prompt engineer for an animated storytelling app.

Your job: convert a short Korean user description into a DALL-E 3 image prompt.

RULES:
1. Output ONLY the DALL-E 3 English prompt. No explanations, no JSON, no quotes.
2. Keep the prompt under 400 characters.
3. Front-load the most important element (subject type + style + key identity).
4. Use descriptive phrases, not structured sections or markdown headers.
5. Never include text overlays, speech bubbles, watermarks.
6. Never describe minors in distress, violence, nudity, or any policy-sensitive content.
7. If the user's description is too short/vague, invent reasonable defaults that fit the asset type.
8. The art style block given by the user is mandatory — include it near the front.

PROMPT SHAPE:
<asset-type keyword> + <style block> + <subject specifics> + <composition/lighting>`;

// ─── 엔트리 함수 ──────────────────────────────────────────────────────

export interface EnhanceOptions {
    userInput: string;              // 사용자가 입력한 짧은 묘사 (한국어 가능)
    assetType: DalleAssetType;
    artStyle: ArtStyle;
    customArtStyle?: string;        // artStyle === 'custom'일 때
    /** refine 모드: 기존 DALL-E 프롬프트 + 수정 요청 */
    refineFrom?: {
        previousPrompt: string;
        modification: string;       // 예: "머리를 더 짧게, 안경 추가"
    };
}

export interface EnhanceResult {
    prompt: string;
    tokenCount: number;
}

/**
 * 사용자 입력 → DALL-E 최적화 프롬프트
 * refine 모드면 previousPrompt를 기준으로 수정만 적용.
 */
export async function enhancePromptForDalle(opts: EnhanceOptions): Promise<EnhanceResult> {
    const style = styleHint(opts.artStyle, opts.customArtStyle);
    const typeInstructions = TYPE_INSTRUCTIONS[opts.assetType];

    let userMessage: string;
    if (opts.refineFrom) {
        // Refine: 기존 프롬프트 유지하면서 수정 지시만 반영
        userMessage = `Asset type: ${opts.assetType}
Required art style (must include near the front): ${style}

Type-specific instructions:
${typeInstructions}

Previous DALL-E prompt (to be refined, not rewritten from scratch):
"""
${opts.refineFrom.previousPrompt}
"""

User's refinement request (in Korean or English):
"${opts.refineFrom.modification}"

Output the revised DALL-E 3 prompt. Keep all successful elements of the previous prompt and apply ONLY the changes the user requested. Don't drift the style or composition.`;
    } else {
        // 신규 생성
        userMessage = `Asset type: ${opts.assetType}
Required art style (must include near the front): ${style}

Type-specific instructions:
${typeInstructions}

User description (in Korean or English):
"${opts.userInput}"

Output the DALL-E 3 prompt.`;
    }

    const res = await callClaude(SYSTEM_PROMPT, userMessage, {
        temperature: 0.4,
        maxTokens: 600,
    });

    const prompt = res.text.trim()
        .replace(/^["'`]+|["'`]+$/g, '')   // 혹시 모를 감싸는 따옴표 제거
        .replace(/^(DALL-E.{0,20}:|Prompt:)\s*/i, '');  // "DALL-E 3 prompt:" 같은 접두어 제거

    return {
        prompt,
        tokenCount: res.totalTokens,
    };
}

/**
 * 생성된 DALL-E 결과물에 대해 짧은 한국어 이름 제안 (에셋 저장 시 default name)
 * 비싸지 않게 짧게 1회 호출.
 */
export async function suggestAssetName(
    assetType: DalleAssetType,
    dallePrompt: string,
): Promise<string> {
    const typeLabel = { character: '캐릭터', background: '배경', outfit: '의상', prop: '소품' }[assetType];
    const res = await callClaude(
        'You name assets for an animated storytelling app. Output ONLY the Korean name, under 20 characters, no quotes, no explanation.',
        `Asset type: ${typeLabel}
DALL-E prompt: "${dallePrompt.slice(0, 400)}"

Generate a short, memorable Korean name for this asset. Under 20 characters. Example format: "여주인공 시안 A" or "빨간 카페 배경".`,
        { temperature: 0.7, maxTokens: 60 },
    );
    return res.text.trim().replace(/^["'`]+|["'`]+$/g, '').slice(0, 30) || `새 ${typeLabel}`;
}
