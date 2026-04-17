// services/ai/dallePromptEnhance.ts
// 짧은 사용자 묘사 → DALL-E 3 최적화 영문 프롬프트
// 고정 화풍은 하드코딩된 DEFAULT_STYLE_PROMPT로 통일.
// 사용자가 모달에서 이 텍스트를 편집해 다른 화풍으로 바꿀 수 있음.
// 재요청(refine)도 지원: 기존 DALL-E 프롬프트 + 추가 지시 → 수정된 프롬프트

import { callClaude } from '../claudeService';
import type { DalleAssetType } from '../openaiService';

// ─── 기본 화풍 프롬프트 (DALL-E 고정 baseline) ─────────────────────────
// 이 앱의 DALL-E 생성 기본값. 사용자가 모달의 편집 textarea에서 직접 수정 가능.
export const DEFAULT_STYLE_PROMPT = `A super cute chibi-style character with an oversized round head, tiny body (around 3 heads tall), extremely big sparkling eyes, and puffy round cheeks. The character has a highly expressive face with exaggerated emotions, blushing cheeks, and sweat drops. The style is colorful, clean, and highly expressive, with exaggerated motion effects and a soft pastel background.`;

// ─── 에셋 타입별 구조 지시 ────────────────────────────────────────────
const TYPE_INSTRUCTIONS: Record<DalleAssetType, string> = {
    character: `
- 용도: 자연스러운 일상 상황 속 단일 캐릭터 이미지 (얼굴/의상 참조용)
- 필수 구도: SINGLE character, ONE pose, ONE composition — 절대 시트/여러 얼굴/여러 뷰 아님
- 상황 설정: 구체적인 일상 장면 속에 배치 (자유롭게 발명 OK)
  예) smiling in a sunlit park / studying at a cafe with coffee /
       walking down a street / laughing by a window / relaxing on a bench /
       taking a selfie-like candid / reading a book in a bookstore
- 분위기 기본값: 밝고 따뜻하고 웃는 톤 (bright / warm / cheerful / inviting)
  사용자가 다른 감정을 명시하면 그에 맞춤
- 얼굴 가시성: 얼굴이 뚜렷이 보이는 각도 (front 또는 3/4 view)
  자연스러운 candid 느낌 — 카메라를 의식하되 경직되지 않음
- 디테일: face / hair / outfit 모두 식별 가능해야 함 (레퍼런스 용도)
- 금지 (절대): character reference sheet, multiple views, turnaround,
  color palette swatch, mannequin pose, empty white studio, plain solid
  background, stiff standing, multiple faces in one image, split layout`,

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

CHARACTER ASSETS — EXTRA RULES (MANDATORY):
- Never produce a character reference sheet, turnaround, or multiple views in one image.
- Always place the character in ONE specific natural everyday scene
  (park, cafe, street, bedroom, bookstore, etc.). One pose, one composition.
- Default mood: bright, warm, cheerful, smiling — unless the user specifies otherwise.
- If the user description lacks a situation, invent a simple pleasant one
  (e.g., "smiling in a sunlit park", "reading at a cozy cafe window").
- Do NOT include phrases like "character sheet", "reference sheet", "multiple views",
  "turnaround", "color palette", "mannequin" — these trigger sheet layouts.

PROMPT SHAPE:
<asset-type keyword> + <style block> + <subject specifics> + <composition/lighting>`;

// ─── 고정 프롬프트 생성기 ──────────────────────────────────────────────
// 모달에서 화풍/타입을 고를 때 이 함수로 기본 텍스트를 채워넣고, 사용자는
// 그 텍스트를 자유롭게 편집한 뒤 enhancePromptForDalle에 그대로 전달.

/**
 * 기본 고정 프롬프트 텍스트 생성 (DEFAULT_STYLE_PROMPT + 타입별 구도 지시).
 * 이 문자열이 모달의 "고정 프롬프트" 편집 영역의 초기값이 됨.
 * 사용자는 자유롭게 편집 가능 — 스타일 자체도 바꿀 수 있음.
 */
export function buildDefaultFixedPrompt(assetType: DalleAssetType): string {
    const typeInstructions = TYPE_INSTRUCTIONS[assetType].trim();
    return `# 화풍 (프롬프트 앞쪽에 들어감)
${DEFAULT_STYLE_PROMPT}

# 용도별 구도/분위기 지시
${typeInstructions}`;
}

// ─── 엔트리 함수 ──────────────────────────────────────────────────────

export interface EnhanceOptions {
    userInput: string;              // 사용자가 입력한 짧은 묘사 (한국어 가능)
    assetType: DalleAssetType;
    /** 사용자가 편집한 고정 프롬프트 블록 (화풍 + 용도 지시) — 모달이 직접 관리 */
    fixedPrompt: string;
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
 * fixedPrompt(편집 가능)를 그대로 받아 Claude에게 전달.
 * refine 모드면 previousPrompt를 기준으로 수정만 적용.
 */
export async function enhancePromptForDalle(opts: EnhanceOptions): Promise<EnhanceResult> {
    let userMessage: string;
    if (opts.refineFrom) {
        // Refine: 기존 프롬프트 유지하면서 수정 지시만 반영
        userMessage = `Asset type: ${opts.assetType}

${opts.fixedPrompt}

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

${opts.fixedPrompt}

User description (in Korean or English):
"${opts.userInput}"

Output the DALL-E 3 prompt. The style block above must appear near the front of the prompt.`;
    }

    const res = await callClaude(SYSTEM_PROMPT, userMessage, {
        temperature: 0.4,
        maxTokens: 600,
    });

    const prompt = res.text.trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^(DALL-E.{0,20}:|Prompt:)\s*/i, '');

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
