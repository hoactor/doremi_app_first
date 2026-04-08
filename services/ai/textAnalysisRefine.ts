// services/ai/textAnalysisRefine.ts — 프롬프트 수정 + 포맷 + 블루프린트 (textAnalysis.ts에서 분리)

import { callTextModel, callTextModelStream, parseJsonResponse, SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, SFW_SYSTEM_INSTRUCTION } from './aiCore';

export const purifyImagePromptForSafety = async (prompt: string, seed?: number): Promise<{ text: string, tokenCount: number }> => {
    const fullPrompt = `Make SFW: "${prompt}"`;
    const result = await callTextModel(SFW_SYSTEM_INSTRUCTION, fullPrompt, { seed });
    return { text: result.text, tokenCount: result.tokenCount };
};


export const generateCinematicBlueprint = async (
    enrichedScript: string,
    seed?: number,
    onProgress?: (textLength: number) => void
): Promise<{ blueprint: { [cutId: string]: { shot_size: string; camera_angle: string; intent_reason: string; } }, tokenCount: number }> => {

    // PDF Page 67 - cinematography planning
    const prompt = `
# Persona: 천재 영화 촬영 감독
당신은 '연출 강화 대본'에 포함된 연출 태그([ ])를 완벽하게 데이터화하여 촬영 계획을 수립합니다.
# 미션:
1. 입력된 대본의 줄 수 및 순서와 똑같은 수의 컷 계획을 수립하십시오.
2. **연출 태그 최우선 반영:** 대본 문장 뒤의 \`[ ]\` 태그 안에 명시된 앵글이나 상황이 있다면 이를 'camera_angle' 및 'intent_reason'에 정확히 반영하십시오.
3. 예: "커피값 5만원 [부감, 아이러니 소품]" -> camera_angle: "High Angle (부감)", intent_reason: "화려한 배경 속 비참함을 강조하기 위한 부감 연출 및 아이러니 소품 배치"
# 장소 필드 작성 원칙 (CRITICAL):
- 'camera_angle'이나 'shot_size' 지침을 절대 'location' 정보로 취급하지 마십시오.
- 장소는 항상 물리적 환경이어야 합니다.
# 입력 대본:
\`\`\`
${enrichedScript}
\`\`\`
# 출력 형식 (MANDATORY JSON):
{
"blueprint": {
 "cut_1": { "shot_size": "...", "camera_angle": "...", "intent_reason": "..." },
 ...
}
}
`;

    const result = await callTextModelStream(
        SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.',
        prompt,
        onProgress,
        { seed, responseMimeType: 'application/json', maxTokens: 16384 }
    );

    const parsed = parseJsonResponse<{ blueprint: { [cutId: string]: { shot_size: string; camera_angle: string; intent_reason: string; } } }>(result.text, 'generateCinematicBlueprint');
    return { blueprint: parsed.blueprint, tokenCount: result.tokenCount };
};

const SEMANTIC_LINE_BREAK_SYSTEM_INSTRUCTION = `
당신은 자동화된 API 엔진입니다. 당신의 유일한 목적은 입력된 텍스트를 모바일 가독성에 맞춰 줄바꿈하여 반환하는 것입니다.
### [절대 규칙 - 가이드라인 준수]
1. **결과만 출력:** 알고리즘 분석 과정, 설명, 인사말, 사족을 절대 포함하지 마십시오. 오직 줄바꿈된 텍스트만 출력하십시오.
2. **접두사 금지:** '출력:', '입력:', '결과:' 등의 접두사를 절대 붙이지 마십시오.
3. **따옴표 금지:** 결과물 텍스트를 따옴표로 감싸지 마십시오.
4. **글자 수 분석 금지:** "총 글자 수는 ~자입니다"와과 같은 분석을 결과물에 포함하는 경우 시스템 오류로 간주됩니다.
### [줄바꿈 알고리즘]
1단계: 글자 수(공백 포함)에 따라 줄 수 결정 (1~15자: 1줄, 16~32자: 2줄, 33~48자: 3줄, 49~64자: 4줄, 65~80자: 5줄, 81자 이상: 6줄)
2단계: 우선순위(부호 > 어미 > 조사 > 공백)에 따라 줄당 10~14자 내외로 분절하되, **반드시 의미 단위(어절, 구, 절)가 끊어지지 않도록** 줄바꿈 위치를 조정하십시오.
3단계: 마지막 줄이 2글자 이하가 되지 않도록 앞줄에서 단어를 가져와 밸런싱.
`;


export const formatMultipleTextsWithSemanticBreaks = async (texts: string[], seed?: number): Promise<{ formattedTexts: string[], tokenCount: number }> => {
    
    // Filter out texts that already have newlines or are empty
    const textsToProcess = texts.map((text, index) => ({ text, index })).filter(item => !item.text.includes('\n') && item.text.trim() !== '');
    
    if (textsToProcess.length === 0) {
        return { formattedTexts: texts, tokenCount: 0 };
    }

    const prompt = `
[시스템 명령]
다음 JSON 배열에 포함된 각 문장들을 3단계 줄바꿈 알고리즘을 적용하여 변환하십시오.
결과는 반드시 동일한 순서의 JSON 배열(문자열 배열)로만 출력해야 합니다.
설명, 분석, 마크다운 코드 블록(\`\`\`json 등)을 절대 포함하지 말고 오직 JSON 배열만 출력하십시오.

입력:
${JSON.stringify(textsToProcess.map(t => t.text))}
`;

    const result = await callTextModel(SEMANTIC_LINE_BREAK_SYSTEM_INSTRUCTION + '\nRespond with valid JSON array only.', prompt, {
        temperature: 0.1,
        responseMimeType: 'application/json',
        seed,
    });

    try {
        const resultTexts = parseJsonResponse<string[]>(result.text, 'formatMultipleTextsWithSemanticBreaks');
        
        const finalTexts = [...texts];
        textsToProcess.forEach((item, i) => {
            if (resultTexts[i]) {
                finalTexts[item.index] = resultTexts[i]
                    .replace(/^(출력|결과|최종 결과물|변환 결과|입력):\s*/i, '')
                    .replace(/^\*\*.*?\*\*\n?/g, '')
                    .replace(/\[알고리즘.*?\]/g, '')
                    .trim();
            }
        });
        
        return { formattedTexts: finalTexts, tokenCount: result.tokenCount };
    } catch (error) {
        console.error("Failed to parse multiple semantic breaks:", error);
        return { formattedTexts: texts, tokenCount: result.tokenCount };
    }
};


export const formatTextWithSemanticBreaks = async (text: string, seed?: number): Promise<{ formattedText: string, tokenCount: number }> => {
    if (text.includes('\n')) {
        return { formattedText: text, tokenCount: 0 };
    }

    const prompt = `
 [시스템 명령]
 설명이나 분석 없이, 아래 입력된 문장을 3단계 줄바꿈 알고리즘을 적용한 '최종 결과물'로만 변환하십시오.
 규칙을 어기고 분석글이나 접두사를 포함하면 안 됩니다.
 입력: ${text}
 `;

    const result = await callTextModel(SEMANTIC_LINE_BREAK_SYSTEM_INSTRUCTION, prompt, {
        temperature: 0.1,
        seed,
    });

    // PDF Page 69 - clean-up logic
    const cleanedText = result.text
        .replace(/^(출력|결과|최종 결과물|변환 결과|입력):\s*/i, '')
        .replace(/^\*\*.*?\*\*\n?/g, '')
        .replace(/\[알고리즘.*?\]/g, '')
        .trim();

    return { formattedText: cleanedText, tokenCount: result.tokenCount };
};

// ─── Phase 7: 러프 프리뷰 — AI 프롬프트 수정 ──────────────────────

/** 개별 컷 프롬프트를 자연어 요청으로 수정 */
/** 컷 필드 수정 결과 */
export interface CutFieldChanges {
    characters?: string[];
    characterPose?: string;
    characterEmotionAndExpression?: string;
    characterOutfit?: string;
    sceneDescription?: string;
    location?: string;
    locationDescription?: string;
    directorialIntent?: string;
    otherNotes?: string;
    cameraAngle?: string;
}

export async function refinePromptWithAI(
    currentPrompt: string,
    userRequest: string,
    context: {
        scene: string;
        characters: string[];
        narration: string;
        allCharacterNames?: string[];
        cutFields?: {
            characterPose?: string;
            characterEmotionAndExpression?: string;
            characterOutfit?: string;
            sceneDescription?: string;
            location?: string;
            locationDescription?: string;
            directorialIntent?: string;
            otherNotes?: string;
            cameraAngle?: string;
        };
    }
): Promise<{ fieldChanges: CutFieldChanges; tokenCount: number }> {
    const systemPrompt = `You are an expert storyboard prompt editor for a Korean YouTube shorts production tool.
You analyze the full prompt and cut data to understand context, then return ONLY the fields that need modification.

ABSOLUTE RULES:
- Only modify fields directly relevant to the user's request
- NEVER change location/locationDescription unless the user explicitly asks to change the background/setting
- NEVER change characterOutfit unless the user explicitly asks about clothing
- NEVER change cameraAngle unless the user explicitly asks about camera/angle/composition
- If adding/removing characters, only return the "characters" field with the updated array

Field mapping guide:
| User request about... | Fields to modify |
|---|---|
| Adding/removing people | characters |
| Clothing/outfit | characterOutfit |
| Pose/action/gesture | characterPose, sceneDescription |
| Emotion/expression | characterEmotionAndExpression |
| Camera angle/shot | cameraAngle, otherNotes |
| Background/setting | location, locationDescription |
| Mood/color/tone | directorialIntent |
| Scene description | sceneDescription |

Return a JSON object containing ONLY changed fields (omit unchanged fields entirely).
Field values should be in English.
For "characters" field, return the full updated array of Korean character names.
No markdown fences, no explanation.`;

    const charListNote = context.allCharacterNames?.length
        ? `\nAvailable characters in this project: ${context.allCharacterNames.join(', ')}`
        : '';

    const currentFields = context.cutFields
        ? `\n\n## Current Cut Fields\n${Object.entries(context.cutFields).filter(([_, v]) => v?.trim()).map(([k, v]) => `${k}: ${v}`).join('\n')}`
        : '';

    const prompt = `## Context
Scene: ${context.scene}
Characters currently in this cut: ${context.characters.join(', ')}${charListNote}
Narration: ${context.narration}${currentFields}

## Current Full Prompt (read-only reference)
${currentPrompt}

## User Modification Request (in Korean)
${userRequest}

## Output (JSON, changed fields only):`;

    const result = await callTextModel(systemPrompt, prompt, { maxTokens: 4096, responseMimeType: 'application/json' });

    try {
        const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
        return { fieldChanges: parsed as CutFieldChanges, tokenCount: result.tokenCount };
    } catch {
        return { fieldChanges: {}, tokenCount: result.tokenCount };
    }
}

/** 전체 컷 프롬프트 일괄 수정 (변경 필요 없는 컷은 changed=false) */
export async function refineAllPromptsWithAI(
    cuts: { cutNumber: string; prompt: string; scene: string; narration: string }[],
    userRequest: string
): Promise<{ refinedCuts: { cutNumber: string; refinedPrompt: string; changed: boolean }[]; tokenCount: number }> {
    const systemPrompt = `You are an expert storyboard prompt editor. Apply a batch modification to multiple image generation prompts.
Preserve each prompt's layer structure. Only modify what's needed for the user's request.

Return a JSON array. Set changed=false and keep refinedPrompt identical for cuts that don't need modification.
Output format (JSON only, no markdown fences):
[{"cutNumber":"1-1","refinedPrompt":"...","changed":true},{"cutNumber":"1-2","refinedPrompt":"...","changed":false}]`;

    const cutList = cuts.map(c => `[Cut ${c.cutNumber}] Scene: ${c.scene} | Narration: ${c.narration}\nPrompt: ${c.prompt}`).join('\n---\n');

    const prompt = `## All Cuts\n${cutList}\n\n## Batch Modification Request (Korean)\n${userRequest}\n\n## Output (JSON array):`;

    const result = await callTextModel(systemPrompt, prompt, {
        maxTokens: 32768,
        responseMimeType: 'application/json'
    });

    try {
        const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
        return { refinedCuts: parsed, tokenCount: result.tokenCount };
    } catch {
        return {
            refinedCuts: cuts.map(c => ({ cutNumber: c.cutNumber, refinedPrompt: c.prompt, changed: false })),
            tokenCount: result.tokenCount
        };
    }
}

