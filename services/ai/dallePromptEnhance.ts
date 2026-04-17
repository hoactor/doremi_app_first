// services/ai/dallePromptEnhance.ts
// 짧은 사용자 묘사 → DALL-E 3 최적화 영문 프롬프트
// 고정 화풍은 하드코딩된 DEFAULT_STYLE_PROMPT로 통일.
// 사용자가 모달에서 이 텍스트를 편집해 다른 화풍으로 바꿀 수 있음.
// 재요청(refine)도 지원: 기존 DALL-E 프롬프트 + 추가 지시 → 수정된 프롬프트

import { callClaude } from '../claudeService';
import type { DalleAssetType } from '../openaiService';

// ─── 기본 화풍 프롬프트 (DALL-E 고정 baseline) ─────────────────────────
// 이 앱의 DALL-E 생성 기본값. 사용자가 모달의 편집 textarea에서 직접 수정 가능.
// 주의: "A X character with..." 형태로 시작하면 DALL-E가 이 문장을 "주제 선언"으로
//       해석해서 뒤의 상황과 합쳐 "두 장면을 옆으로 나란히" 같은 composition을
//       만들어버림. 그래서 앞부분을 "스타일 선언"으로 분명히 시작하게 써야 함.
export const DEFAULT_STYLE_PROMPT = `Korean webtoon-style super cute chibi illustration. Characters have oversized round heads, tiny bodies (around 3 heads tall), extremely big sparkling eyes, and puffy round cheeks. Highly expressive faces with exaggerated emotions, blushing cheeks, and sweat drops. Colorful, clean, and highly expressive rendering with exaggerated motion effects on a soft pastel background.`;

// ─── 에셋 타입별 구조 지시 ────────────────────────────────────────────
const TYPE_INSTRUCTIONS: Record<DalleAssetType, string> = {
    character: `
출력은 반드시 다음 구조를 따를 것 (어순 고정):
<subject: gender+age+trait> <action verb> <where from 배경표>, <expression from 감정표>[, <outfit from 의상표 ONLY if user mentioned clothing>]

━━━ 감정 표현 테이블 (사용자 입력에 맞는 것 하나 선택 / 없으면 기본값) ━━━
- 기쁨     : "wide open eyes, big happy smile, blushing cheeks, excited pose"
- 집중/운동 : "determined expression, furrowed eyebrows, puffed cheeks, sweat drops"
- 힘듦     : "exhausted expression, heavy breathing, half-closed eyes, sweat drops"
- 놀람     : "big round eyes wide open, small 'O' shaped mouth, sparkling stars near head"
- 부끄러움  : "shy expression, rosy cheeks, slightly looking away, hands near face"
- 슬픔     : "downturned mouth, teary eyes, tilted head"
- 화남     : "frowning eyebrows, puffed cheeks, crossed arms"
- 평온     : "soft gentle smile, relaxed posture"
- 기본값   : "bright smile, blushing cheeks" (감정 언급 없을 때만)

━━━ 배경 테이블 (장면에 맞는 것 하나 선택) ━━━
조명은 일괄적으로 soft / diffused / gentle 톤으로 통일 — 과도하게 밝은 조명 금지.

- 헬스장    : "pastel gym background, workout bench, dumbbells, soft diffused lighting"
- 공원/야외 : "outdoor park with soft green grass, blue sky, gentle daylight, slight haze"
- 실내      : "cozy indoor room, soft pastel walls, gentle window light"
- 카페      : "cozy cafe interior, wooden table, pastel tones, soft diffused afternoon light"
- 학교      : "school classroom or hallway, pastel tones, soft diffused lighting"
- 거리      : "quiet city street, pastel buildings, soft overcast daylight"
- 한강/강가  : "riverside path, soft breeze, clear sky, gentle morning light with slight haze"
- 침실      : "cozy pastel bedroom, soft bedding, warm dim lamp light"
- 주방/식당  : "pastel kitchen with clean counter, soft diffused window light"
- 서점/도서관: "soft pastel bookstore with wooden shelves, warm dim reading light"
- 병원/진료실: "calm pastel hospital room, soft window light, muted tones"

━━━ 의상 테이블 (사용자가 의상을 언급했을 때만 포함, 없으면 생략) ━━━
- 운동복 : "sleeveless workout shirt, athletic shorts, sweatbands"
- 교복   : "neat school uniform with blazer, tie, and dress pants or skirt"
- 캐주얼 : "cozy oversized hoodie, soft sweatpants, comfy sneakers"
- 정장   : "tidy blazer and dress pants, clean shirt"
- 잠옷   : "soft pajamas, slippers"
- 원피스 : "cute casual dress"

━━━ 엄격 규칙 ━━━
- SINGLE character, ONE pose, ONE composition (복수 뷰 / 시트 절대 금지)
- 테이블에서 골라 쓸 것. 장식 형용사 (vibrant, lively, amazing, gorgeous 등) 추가 금지
- 스타일 키워드 (chibi, anime, illustration 등) 일절 넣지 말 것 — 화풍은 별도 처리됨
- 사용자가 의상 언급 안 하면 의상 부분 생략 (맨몸 X, 자연스러운 기본 복장 암묵)
- 절대 금지: character sheet, multiple views, turnaround, split layout, side-by-side scenes
- 최종 출력 200자 이내`,

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

// ─── 상황 생성용 시스템 프롬프트 (Claude에게 주는 지시) ────────────────
// Claude는 Type Guidance에 주어진 테이블에서 키워드를 "선택"만 함 — 자유 작문 금지.
// 이렇게 해야 매 생성마다 어휘가 수렴해서 스타일 일관성이 유지된다.
const SITUATION_SYSTEM_PROMPT = `You are a scene phrase writer for DALL-E 3 prompts.

Your ONLY job: convert a Korean user description into a scene sentence by
SELECTING keywords from the vocabulary tables in the Type Guidance provided.

HOW IT WORKS:
- The Type Guidance below contains vocabulary TABLES (감정표 / 배경표 / 의상표).
- Your output must PULL keywords from those tables — do NOT invent new adjectives.
- This keeps the style consistent across many generations.

OUTPUT STRUCTURE (follow exactly):
<subject (gender+age+trait)> <action> <background keyword block>, <emotion keyword block>[, <outfit keyword block IF user mentioned clothing>]

STRICT RULES:
1. Output ONLY the scene sentence. No explanations, no quotes, no prefix.
2. Under 200 characters total.
3. Subject and action: free-form from user input (short, plain English).
4. Emotion / Background / Outfit: MUST come from the tables in Type Guidance.
   Choose the row that best matches the user's input.
5. If user didn't mention an emotion → use the 기본값 row from 감정표.
6. If user didn't mention an outfit → OMIT outfit entirely. Do not invent.
7. NEVER add extra decorative adjectives outside the tables
   (vibrant, lively, happy, energetic, amazing, beautiful, gorgeous, etc.)
8. NEVER include style keywords: chibi, anime, illustration, cute style,
   sparkling, pastel, rendered, artwork, adorable.
8a. NEVER add brightness intensifiers (bright, brightly, glowing, radiant,
    vivid, saturated, intense sunlight, harsh light) outside what is already
    in the background table row you selected. Lighting must stay soft.
9. NEVER output: character sheet, multiple views, turnaround, side-by-side,
   split layout.
10. Never describe minors in distress, violence, nudity, or policy-sensitive content.

GOOD OUTPUT EXAMPLES:
Input: "20대 여대생이 한강에서 조깅"
Output: "a 20s Korean female college student with ponytail jogging at a
riverside path, soft breeze, clear sky, gentle morning light with slight
haze, determined expression with sweat drops"

Input: "카페에서 공부하는 여자"
Output: "a young Korean woman studying at a cozy cafe interior with wooden
table, pastel tones, soft diffused afternoon light, determined expression,
furrowed eyebrows, puffed cheeks, sweat drops"

Input: "놀라는 남자 대학생 교복"
Output: "a male Korean university student standing in a school classroom with
pastel tones and soft diffused lighting, big round eyes wide open, small 'O'
shaped mouth, sparkling stars near head, neat school uniform with blazer, tie,
and dress pants"

Never prefix with "A/An DALL-E prompt:" or wrap in quotes.`;

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
    return `# 화풍 (이 블록은 DALL-E에 그대로 전송 — Claude가 손대지 않음)
${DEFAULT_STYLE_PROMPT}

# 용도별 구도/분위기 지시 (Claude가 상황 phrase 만들 때 참고만 함)
${typeInstructions}`;
}

// ─── 고정 프롬프트 파싱 ───────────────────────────────────────────────
// "# 화풍 ..." / "# 용도별 ..." 섹션을 분리.
// 사용자가 마커를 지웠거나 바꿨어도 동작하도록 느슨하게 처리.

function parseFixedPrompt(text: string): { styleBlock: string; typeInstructions: string } {
    const styleMatch = text.match(/#\s*화풍[^\n]*\n([\s\S]*?)(?=\n#\s|$)/);
    const typeMatch = text.match(/#\s*용도별[^\n]*\n([\s\S]*?)(?=\n#\s|$)/);

    const styleBlock = styleMatch?.[1]?.trim() || text.trim();  // 마커 없으면 전체를 스타일로
    const typeInstructions = typeMatch?.[1]?.trim() || '';

    return { styleBlock, typeInstructions };
}

// 이전 생성 프롬프트에서 상황 phrase만 추출 (refine 시 Claude에게 이전 상황만 전달)
function extractSituationFromPrompt(fullPrompt: string, styleBlock: string): string {
    if (styleBlock && fullPrompt.startsWith(styleBlock)) {
        return fullPrompt.slice(styleBlock.length).trim();
    }
    // 폴백: 마지막 단락을 상황으로 간주
    const parts = fullPrompt.split(/\n\n+/);
    return parts[parts.length - 1]?.trim() || fullPrompt;
}

// ─── 엔트리 함수 ──────────────────────────────────────────────────────

export interface EnhanceOptions {
    userInput: string;              // 사용자가 입력한 짧은 묘사 (한국어 가능)
    assetType: DalleAssetType;
    /** 사용자가 편집한 고정 프롬프트 블록 (화풍 + 용도 지시). 화풍 부분은 verbatim 사용. */
    fixedPrompt: string;
    /** refine 모드: 기존 프롬프트의 상황 phrase + 수정 요청 */
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
 * 2단계 생성:
 *   1) Claude는 상황/감정/포즈 phrase만 영어로 생성 (화풍 키워드 일절 추가 안 함)
 *   2) 고정 프롬프트의 "화풍" 부분은 verbatim으로 앞에 붙여 최종 DALL-E 프롬프트 조립
 *
 * 이렇게 분리하면 Claude가 형용사를 보태면서 화풍이 매 생성마다 흔들리는 문제가 없어짐.
 */
export async function enhancePromptForDalle(opts: EnhanceOptions): Promise<EnhanceResult> {
    const { styleBlock, typeInstructions } = parseFixedPrompt(opts.fixedPrompt);

    let userMessage: string;
    if (opts.refineFrom) {
        const prevSituation = extractSituationFromPrompt(opts.refineFrom.previousPrompt, styleBlock);
        userMessage = `Asset type: ${opts.assetType}

Type guidance (how to shape the scene — for your reference only, do not copy literally):
${typeInstructions}

Previous scene phrase (to be refined, not rewritten from scratch):
"""
${prevSituation}
"""

User's refinement request (Korean or English):
"${opts.refineFrom.modification}"

Output the revised English scene phrase only. Apply only what the user requested, keep the rest.`;
    } else {
        userMessage = `Asset type: ${opts.assetType}

Type guidance (how to shape the scene — for your reference only, do not copy literally):
${typeInstructions}

User description (Korean or English):
"${opts.userInput}"

Output the English scene phrase only.`;
    }

    const res = await callClaude(SITUATION_SYSTEM_PROMPT, userMessage, {
        temperature: 0.2,  // 창의성 최소 — 테이블에서 "선택"이 목적
        maxTokens: 220,    // 테이블 키워드 블록 합쳐지면 200자 근처까지 필요
    });

    const situation = res.text.trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^(DALL-E.{0,20}:|Prompt:|Scene:)\s*/i, '');

    // 최종 조립: 고정 화풍 블록을 그대로 앞에 + Claude가 만든 상황 phrase
    const finalPrompt = styleBlock
        ? `${styleBlock}\n\n${situation}`
        : situation;

    return {
        prompt: finalPrompt,
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
