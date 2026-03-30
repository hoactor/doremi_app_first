
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

// ─── Gemini Model Constants ───────────────────────────────────────────────────
export const MODELS = {
    TEXT: 'gemini-3-flash-preview',
    VISION: 'gemini-3-flash-preview',
    IMAGE: 'gemini-2.5-flash-image',
    TTS: 'gemini-2.5-flash-preview-tts',
};

// ─── System Instructions ──────────────────────────────────────────────────────
// PDF Page 18-19: Golden Rule for Acting & Expression
export const SFW_SYSTEM_INSTRUCTION = `You are an AI assistant for a family-friendly comic book application.
Your absolute top priority is SFW (Safe For Work) content.
[HIGH PERFORMANCE RULE]: Safety does NOT mean stiffness. You must generate EXTREMELY EXPRESSIVE and DYNAMIC MANGA-STYLE ACTING.
Instead of reducing intensity for risky scenes, use "Gag Manga Exaggeration" or "Comical Reactions".
Characters should never "just stand there". Use expressive hand gestures, body weight shifts, and manga icons (sweat drops, hearts, veins) to communicate emotions.
[SEQUENTIAL FLOW RULE]: Ensure that the action flows logically from one cut to the next, like an animation storyboard. Maintain continuity of motion and emotion.`;

export const SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION = `You are an AI assistant for a webtoon creation application.
Your task is to accurately analyze scripts and generate visual descriptions.
[SAFETY RULE]: Your absolute top priority is SFW (Safe For Work) content. Avoid generating explicit, violent, or prohibited content.
[DIRECTING RULE]: Every scene must have "Active Character Performance".
Translate character emotions into "Action Verbs" and "Manga Iconography".
If a character is 'shocked', don't just say 'shocked'; describe it as 'falling backward with limbs flailing, a giant sweat drop, and eyes popping out'.
[CONTEXT AWARENESS]: Analyze the script as a continuous sequence. Understand the cause and effect between lines to create a cohesive visual narrative.`;

export const SEMANTIC_LINE_BREAK_SYSTEM_INSTRUCTION = `
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

// ─── Gemini Client Factory ────────────────────────────────────────────────────
// Gemini API key: Tauri → Keychain (cached), Browser → process.env
let _cachedGeminiKey: string | null = null;

export async function getGeminiApiKey(): Promise<string> {
    if (_cachedGeminiKey) return _cachedGeminiKey;
    // Try Tauri Keychain first
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const keys = await invoke<{ gemini: string | null }>('load_api_keys');
            if (keys.gemini) {
                _cachedGeminiKey = keys.gemini;
                return keys.gemini;
            }
        } catch {}
    }
    // Fallback: env variable or localStorage
    const envKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (envKey) {
        _cachedGeminiKey = envKey;
        return envKey;
    }
    // Browser localStorage fallback
    try {
        const stored = JSON.parse(localStorage.getItem('api_keys') || '{}');
        if (stored.gemini) {
            _cachedGeminiKey = stored.gemini;
            return stored.gemini;
        }
    } catch {}
    throw new Error('Gemini API Key가 설정되지 않았습니다. API 키 설정에서 입력해주세요.');
}

// Invalidate cache when keys are updated
export function invalidateGeminiKeyCache() {
    _cachedGeminiKey = null;
}

export const createGeminiClient = async () => {
    const apiKey = await getGeminiApiKey();
    return new GoogleGenAI({ apiKey });
};

// ─── Helper: data URL to Blob ─────────────────────────────────────────────────
export const dataUrlToBlob = async (dataUrl: string): Promise<{ blob: Blob, mimeType: string }> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return { blob, mimeType: blob.type };
};

// ─── Helper: Blob to Base64 ───────────────────────────────────────────────────
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result !== 'string') {
                return reject(new Error("Failed to read blob as a data URL."));
            }
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// ─── Helper: Extract image from vision response ──────────────────────────────
export function getVisionImageResponse(response: GenerateContentResponse, functionName: string): { imageUrl: string, textResponse: string } {
    const candidate = response.candidates?.[0];

    if (!candidate || !candidate.content?.parts) {
        let errorMessage = `Nano가 유효하지 않은 응답을 반환했습니다 (${functionName}).`;

        if (candidate?.finishReason) {
            const finishReasonStr = String(candidate.finishReason);
            if (finishReasonStr === 'IMAGE_RECITATION' || finishReasonStr === 'RECITATION') {
                errorMessage = `이미지 생성 중 저작권/유사성 필터에 걸렸습니다. 프롬프트를 조금 수정해서 다시 시도해주세요.`;
            } else if (finishReasonStr === 'SAFETY') {
                errorMessage = `이미지 생성 중 안전 필터에 걸렸습니다. 프롬프트를 수정해주세요.`;
            } else if (finishReasonStr === 'OTHER') {
                errorMessage = `알 수 없는 이유로 이미지 생성이 중단되었습니다. 잠시 후 다시 시도해주세요.`;
            } else {
                errorMessage += ` (사유: ${finishReasonStr})`;
            }
        } else if (response.promptFeedback?.blockReason) {
            errorMessage += ` (사유: ${response.promptFeedback.blockReason})`;
        } else if (response.promptFeedback?.safetyRatings?.some(r => r.blocked)) {
            const blockedCategories = response.promptFeedback.safetyRatings
                .filter(r => r.blocked)
                .map(r => r.category)
                .join(', ');
            errorMessage += ` (사유: 안전 필터에 의해 차단됨 - ${blockedCategories})`;
        }
        console.error(`Invalid response structure from Nano in ${functionName}:`, JSON.stringify(response, null, 2));
        throw new Error(errorMessage);
    }

    const responseParts = candidate.content.parts;
    const imageResponsePart = responseParts.find(part => part.inlineData);
    const textResponsePart = responseParts.find(part => part.text);
    const textResponseFromAI = textResponsePart?.text?.trim() || "작업이 성공적으로 완료되었습니다.";

    if (!imageResponsePart || !imageResponsePart.inlineData) {
        console.error(`Nano did not return an image part in ${functionName}:`, JSON.stringify(response, null, 2));
        throw new Error(`Nano가 이미지를 반환하지 않았습니다 (${functionName}): ${textResponseFromAI}`);
    }

    const newBase64 = imageResponsePart.inlineData.data;
    const newMimeType = imageResponsePart.inlineData.mimeType;

    return {
        imageUrl: `data:${newMimeType};base64,${newBase64}`,
        textResponse: textResponseFromAI,
    };
}

// ─── Helper: Safely get text from response ────────────────────────────────────
export function getResponseText(response: GenerateContentResponse, functionName: string): string {
    const candidate = response.candidates?.[0];
    if (!candidate) {
        let errorMessage = `AI 응답이 비어있거나 차단되었습니다 (${functionName}).`;
        if (response.promptFeedback?.blockReason) {
            errorMessage += ` (사유: ${response.promptFeedback.blockReason})`;
        }
        console.error(`AI response from ${functionName} is empty or blocked.`, JSON.stringify(response, null, 2));
        throw new Error(errorMessage);
    }

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        let reasonMsg: string = String(candidate.finishReason);
        if (candidate.finishReason === 'PROHIBITED_CONTENT' || candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
            reasonMsg = '안전 정책 위반 (PROHIBITED_CONTENT/SAFETY)';
            console.error(`AI response from ${functionName} stopped early. Reason: ${candidate.finishReason}`, JSON.stringify(response, null, 2));
            throw new Error(`AI 응답이 중단되었습니다 (${functionName}): ${reasonMsg}. 대본에 부적절한 내용이 포함되어 있을 수 있습니다.`);
        } else if (candidate.finishReason === 'MAX_TOKENS') {
            console.warn(`AI response from ${functionName} stopped early due to MAX_TOKENS. Attempting to parse truncated response.`);
        } else {
            console.error(`AI response from ${functionName} stopped early. Reason: ${candidate.finishReason}`, JSON.stringify(response, null, 2));
            if (!response.text) {
                throw new Error(`AI 응답이 중단되었습니다 (${functionName}): ${reasonMsg}.`);
            }
        }
    }

    const text = response.text;
    if (text === null || text === undefined) {
        console.error(`AI response from ${functionName} did not contain text.`, JSON.stringify(response, null, 2));
        throw new Error(`AI 응답에 텍스트가 포함되어 있지 않습니다 (${functionName}).`);
    }
    return text.trim();
}

// ─── Helper: Extract valid JSON block ─────────────────────────────────────────
export function extractValidJsonBlock(text: string): string {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');

    let start = -1;
    if (firstBrace === -1 && firstBracket === -1) return text.trim();

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
    } else {
        start = firstBracket;
    }

    let stack = 0;
    let inString = false;
    let escaped = false;
    const startChar = text[start];
    const endChar = startChar === '{' ? '}' : ']';

    for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
        } else {
            if (char === '"') {
                inString = true;
            } else if (char === startChar) {
                stack++;
            } else if (char === endChar) {
                stack--;
                if (stack === 0) {
                    // Found the matching end brace
                    return text.substring(start, i + 1);
                }
            }
        }
    }

    // If loop finishes without stack reaching 0, return from start to end (likely truncated)
    return text.substring(start).trim();
}

// ─── Helper: Repair truncated JSON ────────────────────────────────────────────
export function repairTruncatedJson(json: string): string {
    let repaired = json.trim();
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === '{' || char === '[') {
            stack.push(char);
        } else if (char === '}' || char === ']') {
            stack.pop();
        }
    }

    // If truncated inside a string, close it
    if (inString) repaired += '"';

    // Close all open structures in reverse order
    while (stack.length > 0) {
        const last = stack.pop();
        repaired += (last === '{' ? '}' : ']');
    }

    return repaired;
}

// ─── Helper: Strip JSON comments ──────────────────────────────────────────────
export function stripJsonComments(text: string): string {
    return text.replace(/("(?:\\.|[^\\"])*")|(\/\/.*)|(\/\*[\s\S]*?\*\/)/g, (match, str) => {
        if (str) return str; // Keep strings
        return ""; // Remove comments
    });
}

// ─── Helper: Escape newlines in JSON strings ──────────────────────────────────
export function escapeNewlinesInStrings(jsonString: string): string {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString[i];
        if (inString) {
            if (escaped) {
                escaped = false;
                result += char;
            } else if (char === '\\') {
                escaped = true;
                result += char;
            } else if (char === '"') {
                inString = false;
                result += char;
            } else if (char === '\n') {
                result += '\\n';
            } else if (char === '\r') {
                result += '\\r';
            } else if (char === '\t') {
                result += '\\t';
            } else {
                result += char;
            }
        } else {
            if (char === '"') {
                inString = true;
            }
            result += char;
        }
    }
    return result;
}

// ─── Super Resilient JSON Parser ──────────────────────────────────────────────
export function parseJsonResponse<T>(response: GenerateContentResponse | string, functionName: string): T {
    const rawText = typeof response === 'string' ? response : getResponseText(response, functionName);
    let text = rawText;

    // 1. Remove Markdown Code Fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1].trim();
    }

    // 2. Extract Valid JSON Block using Brace Counting
    // This removes leading non-json text and trailing garbage.
    let jsonString = extractValidJsonBlock(text);

    // 3. Strip Comments (Crucial for Gemini which loves to explain steps in comments)
    jsonString = stripJsonComments(jsonString);

    // 4. Escape unescaped newlines inside strings
    jsonString = escapeNewlinesInStrings(jsonString);

    // 5. Define a function to clean trailing commas and keys without values
    const cleanCommas = (str: string) => str.replace(/,(?=\s*?[\}\]])/g, '');
    const cleanTrailingKeys = (str: string) => {
        let cleaned = str.replace(/,\s*"[^"]*"\s*:\s*(?=[\}\]])/g, '');
        cleaned = cleaned.replace(/\{\s*"[^"]*"\s*:\s*(?=[\}\]])/g, '{');
        return cleaned;
    };

    try {
        // Try standard parsing first (with comma fix)
        return JSON.parse(cleanCommas(jsonString));
    } catch (e) {
        console.warn(`Initial JSON parse failed in ${functionName}, attempting repair...`);
        try {
            // Attempt to repair truncation
            let repaired = repairTruncatedJson(jsonString);
            // Apply comment stripping again on repaired string just in case
            repaired = stripJsonComments(repaired);

            // CRITICAL FIX: Clean trailing keys then clean commas
            repaired = cleanTrailingKeys(repaired);
            repaired = cleanCommas(repaired);

            return JSON.parse(repaired);
        } catch (repairError) {
            console.error(`JSON Repair Failed in ${functionName}. Raw:`, rawText, "Extracted:", jsonString, "Error:", repairError);
            throw new Error(`AI 응답 파싱 실패 (${functionName}): JSON 구조가 손상되었습니다. (토큰 제한 또는 형식 오류)`);
        }
    }
}

// ─── Helper: Get token count ──────────────────────────────────────────────────
export function getTokenCountFromResponse(response: GenerateContentResponse): number {
    return response.usageMetadata?.totalTokenCount ?? 0;
}

// ─── Helper: Analyze global story context ─────────────────────────────────────
export async function analyzeStoryContext(script: string, seed?: number): Promise<{ context: string, tokenCount: number }> {
    try {
        const ai = await createGeminiClient();
        const prompt = `
        # Role: Senior Story Editor / Narrative Consultant
        # Task: Analyze the provided script to extract the "Global Narrative Context" for a visual director.
        # Output Format: A concise summary (Korean) covering:
        1. **Core Theme & Tone** (e.g., Melancholic Romance, High-Octane Action, Noir Thriller)
        2. **Key Narrative Arc** (Beginning -> Climax -> Ending flow)
        3. **Dominant Emotions** (The overarching emotional journey)
        4. **Visual Key** (Keywords for lighting, color palette, and atmosphere)

        This summary will be used to ensure every individual cut aligns with the bigger picture.

        # Script:
        \`\`\`
        ${script}
        \`\`\`
        `;

        const response = await ai.models.generateContent({
            model: MODELS.TEXT,
            contents: prompt,
            config: {
                temperature: 0.7,
                ...(seed !== undefined && { seed }),
            }
        });

        return {
            context: getResponseText(response, 'analyzeStoryContext'),
            tokenCount: getTokenCountFromResponse(response)
        };
    } catch (error) {
        console.warn("analyzeStoryContext failed, using fallback:", error);
        return {
            context: "전체적인 맥락을 분석하는 중 오류가 발생했습니다. 개별 컷의 나레이션에 집중하여 연출을 진행합니다.",
            tokenCount: 0
        };
    }
}
