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
export const DEFAULT_STYLE_PROMPT = `Super cute chibi illustration style. Characters have oversized round heads, tiny bodies (around 3 heads tall), extremely big sparkling eyes, and puffy round cheeks. Highly expressive faces with exaggerated emotions, blushing cheeks, and sweat drops. Colorful, clean, and highly expressive rendering with exaggerated motion effects on a soft pastel background.`;

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

// ─── 상황 생성용 시스템 프롬프트 (Claude에게 주는 지시) ────────────────
// Claude는 오직 "상황/감정/포즈 phrase"만 영어로 생성. 화풍은 손대지 않음.
// 출력은 아주 짧고 단순해야 함 — 복잡할수록 화풍 일관성이 떨어진다.
const SITUATION_SYSTEM_PROMPT = `You are a scene phrase writer for DALL-E 3 prompts.

Your ONLY job: convert a short Korean user description into a VERY BRIEF
English scene sentence. Style is handled separately — don't touch it.

STRICT RULES:
1. Output ONLY the scene sentence. No explanations, no quotes, no prefix.
2. KEEP IT VERY SHORT — ideally under 120 characters, NEVER exceed 180.
3. Include ONLY essentials in this order:
   <who (gender+age+one trait)> <action verb> <where>, <one brief mood/light word>
4. NEVER include style keywords — no "chibi", "anime", "illustration", "cute
   style", "sparkling", "pastel", "rendered", "artwork", "adorable", etc.
5. NEVER add decorative adjectives ("vibrant", "lively", "happy", "energetic").
   Let the user's words + basic action speak. Don't embellish.
6. NEVER describe multiple views, character sheets, side-by-side compositions.
7. If the user's description is vague, add ONE simple pleasant detail. No more.
8. Never describe minors in distress, violence, nudity, or policy-sensitive content.

GOOD OUTPUT EXAMPLES (this simple — under 120 chars):
- "a 20s Korean woman with ponytail jogging along the Han River, clear morning"
- "a male college student walking across an autumn campus, afternoon sun"
- "a young woman reading a book at a cozy cafe window, warm light"

BAD (too wordy):
- "a vibrant, lively South Korean university student happily running down the
   path of the Han River with a ponytail swinging in the wind..."

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
        temperature: 0.3,  // 창의성 낮춤 — 장식 형용사 최소화
        maxTokens: 150,    // 짧은 문장만 허용
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
