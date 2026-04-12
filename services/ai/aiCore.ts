// services/ai/aiCore.ts — AI 공유 내부 함수
// geminiService.ts에서 분리됨. 기능 변경 없음.


import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { callClaude, callClaudeStream, callClaudeVision } from '../claudeService';
import { IS_TAURI, getGeminiApiKey } from '../tauriAdapter';
import { CharacterDescription, GeneratedScript, ImageRatio, Scene, Cut, SceneDirectionTheme, CharacterLocationStyle, CharacterImage, ComicPanelPlan, LibraryAsset, MasterStyleGuide, Gender, EditableScene, EditableCut, CostumeSuggestion, TextEditingTarget, ScenarioAnalysis, CharacterBible, ContiCut, CinematographyCut, CinematographyPlan, CutType } from '../../types';

/**
 * Gemini AI 인스턴스 생성 — Tauri: Store에서 키 로드, 브라우저: process.env
 */
let _cachedGeminiKey: string | null = null;
export async function getGeminiAI(): Promise<GoogleGenAI> {
    if (IS_TAURI) {
        if (!_cachedGeminiKey) {
            _cachedGeminiKey = await getGeminiApiKey();
        }
        return new GoogleGenAI({ apiKey: _cachedGeminiKey });
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
}
/** 키 변경 시 캐시 초기화 (설정 저장 후 호출) */
export function clearGeminiKeyCache() { _cachedGeminiKey = null; }

/**
 * AI Provider 설정 — TEXT 분석은 기본 Claude, 이미지 생성/TTS는 Gemini
 * setUseClaudeForText(false)로 런타임 전환 시 텍스트도 Gemini 사용
 */
let USE_CLAUDE_FOR_TEXT = true;
export function setUseClaudeForText(value: boolean) { USE_CLAUDE_FOR_TEXT = value; }

/**
 * TEXT 모델 브릿지 — Claude 또는 Gemini로 라우팅
 * geminiService 내부 함수들이 이것을 호출
 */
export async function callTextModel(
    systemInstruction: string,
    prompt: string,
    options?: { temperature?: number; seed?: number; responseMimeType?: string; maxTokens?: number }
): Promise<{ text: string; tokenCount: number }> {
    if (USE_CLAUDE_FOR_TEXT) {
        const isJson = options?.responseMimeType === 'application/json';
        // Claude has no native JSON mode — enforce via system prompt
        const sysPrompt = isJson
            ? `${systemInstruction}\n\n[CRITICAL OUTPUT FORMAT] You MUST respond with RAW JSON only. NO markdown code fences, NO backticks, NO explanation. Start your response with { and end with }. Output NOTHING else.`
            : systemInstruction;
        const result = await callClaude(sysPrompt, prompt, {
            temperature: options?.temperature,
            maxTokens: options?.maxTokens || 8192,
            responseFormat: isJson ? 'json' : 'text',
        });
        return { text: result.text, tokenCount: result.totalTokens };
    }
    // Fallback to Gemini
    const ai = await getGeminiAI();
    const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            systemInstruction,
            ...(options?.responseMimeType && { responseMimeType: options.responseMimeType }),
            ...(options?.seed !== undefined && { seed: options.seed }),
            ...(options?.temperature !== undefined && { temperature: options.temperature }),
        },
    });
    return { text: getResponseText(response, 'callTextModel'), tokenCount: getTokenCountFromResponse(response) };
}

/**
 * TEXT 모델 브릿지 (스트리밍) — onProgress 콜백 지원
 */
export async function callTextModelStream(
    systemInstruction: string,
    prompt: string,
    onProgress?: (textLength: number) => void,
    options?: { temperature?: number; seed?: number; responseMimeType?: string; maxTokens?: number }
): Promise<{ text: string; tokenCount: number }> {
    if (USE_CLAUDE_FOR_TEXT) {
        const result = await callClaudeStream(systemInstruction, prompt, onProgress, {
            temperature: options?.temperature,
            maxTokens: options?.maxTokens || 8192,
        });
        return { text: result.text, tokenCount: result.totalTokens };
    }
    // Fallback to Gemini streaming
    const ai = await getGeminiAI();
    const responseStream = await ai.models.generateContentStream({
        model: MODELS.TEXT,
        contents: prompt,
        config: {
            systemInstruction,
            ...(options?.responseMimeType && { responseMimeType: options.responseMimeType }),
            ...(options?.seed !== undefined && { seed: options.seed }),
            ...(options?.temperature !== undefined && { temperature: options.temperature }),
        },
    });
    let fullText = '';
    let tokenCount = 0;
    for await (const chunk of responseStream) {
        const c = chunk as any;
        if (c.text) {
            fullText += c.text;
            if (onProgress) onProgress(fullText.length);
        }
        if (c.usageMetadata) tokenCount = c.usageMetadata.totalTokenCount;
    }
    return { text: fullText.trim(), tokenCount };
}

/**
 * ★ Phase 12+: base64 이미지 리사이즈 (Claude Vision 5MB 한도)
 */
/**
 * ★ Phase 12+: base64 매직 바이트로 실제 MIME 감지 (확장자 불일치 대응)
 */
function detectActualMimeType(base64: string, declaredMime: string): string {
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('iVBOR')) return 'image/png';
    if (base64.startsWith('UklGR')) return 'image/webp';
    if (base64.startsWith('R0lGO')) return 'image/gif';
    return declaredMime;
}

async function resizeBase64IfNeeded(base64: string, mimeType: string, maxBytes: number = 4 * 1024 * 1024): Promise<{ base64: string; mimeType: string }> {
    const byteSize = Math.ceil(base64.length * 3 / 4);
    if (byteSize <= maxBytes) return { base64, mimeType };
    console.log(`[Vision] 이미지 리사이즈: ${(byteSize / 1024 / 1024).toFixed(1)}MB → ~${(maxBytes / 1024 / 1024).toFixed(0)}MB`);
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.sqrt(maxBytes / byteSize) * 0.85;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const resized = canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '';
            resolve({ base64: resized, mimeType: 'image/jpeg' });
        };
        img.onerror = () => resolve({ base64, mimeType });
        img.src = `data:${mimeType};base64,${base64}`;
    });
}

/**
 * VISION 모델 브릿지 (이미지 분석 → 텍스트) — Claude Vision 사용
 */
export async function callVisionTextModel(
    systemInstruction: string,
    prompt: string,
    imageBase64: string,
    mimeType: string,
    options?: { seed?: number; responseMimeType?: string }
): Promise<{ text: string; tokenCount: number }> {
    // ★ 확장자-내용 불일치 MIME 보정 + 5MB 초과 이미지 자동 리사이즈
    const correctedMime = detectActualMimeType(imageBase64, mimeType);
    if (correctedMime !== mimeType) console.log(`[Vision] MIME 보정: ${mimeType} → ${correctedMime}`);
    const resized = await resizeBase64IfNeeded(imageBase64, correctedMime);
    const finalBase64 = resized.base64;
    const finalMimeType = resized.mimeType;

    if (USE_CLAUDE_FOR_TEXT) {
        const result = await callClaudeVision(systemInstruction, prompt, finalBase64, finalMimeType);
        return { text: result.text, tokenCount: result.totalTokens };
    }
    // Fallback to Gemini Vision
    const ai = await getGeminiAI();
    const response = await ai.models.generateContent({
        model: MODELS.VISION,
        contents: { parts: [{ inlineData: { mimeType: finalMimeType, data: finalBase64 } }, { text: prompt }] },
        config: {
            systemInstruction,
            ...(options?.responseMimeType && { responseMimeType: options.responseMimeType }),
            ...(options?.seed !== undefined && { seed: options.seed }),
        },
    });
    return { text: getResponseText(response, 'callVisionTextModel'), tokenCount: getTokenCountFromResponse(response) };
}


// Helper function to convert data URL to Blob
export const dataUrlToBlob = async (dataUrl: string): Promise<{ blob: Blob, mimeType: string }> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return { blob, mimeType: blob.type };
};

// Helper function to convert Blob to Base64 string
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


/**
 * Safely retrieves the text content from a Gemini response.
 */
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

/**
 * Extracts the first valid JSON block (object or array) from a string by counting braces.
 * Handles nested structures and strings correctly to avoid trailing garbage.
 */
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

/**
 * Attempts to close unclosed JSON structures (braces, brackets, quotes)
 * caused by model response truncation.
 */
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

/**
 * Strips comments from JSON string (single-line // and multi-line /* ... *\/)
 * Preserves comments inside double quotes.
 */
export function stripJsonComments(text: string): string {
    return text.replace(/("(?:\\.|[^\\"])*")|(\/\/.*)|(\/\*[\s\S]*?\*\/)/g, (match, str) => {
        if (str) return str; // Keep strings
        return ""; // Remove comments
    });
}

/**
 * Escapes unescaped newlines and tabs inside JSON strings.
 */
export function escapeNewlinesInStrings(jsonString: string): string {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString[i];
        const code = jsonString.charCodeAt(i);
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
            } else if (code < 0x20) {
                // All control characters (0x00-0x1F) must be escaped in JSON strings
                if (char === '\n') result += '\\n';
                else if (char === '\r') result += '\\r';
                else if (char === '\t') result += '\\t';
                else if (char === '\b') result += '\\b';
                else if (char === '\f') result += '\\f';
                else result += '\\u' + code.toString(16).padStart(4, '0');
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

/**
 * Super Resilient JSON Parser for Gemini (handles trailing commas, extra text, markdown blocks, comments, and truncation)
 */
export function parseJsonResponse<T>(response: GenerateContentResponse | string, functionName: string): T {
    const rawText = typeof response === 'string' ? response : getResponseText(response, functionName);
    let text = rawText;
    
    // 1. Remove Markdown Code Fences (3+ backticks — Claude sometimes uses 4)
    const jsonMatch = text.match(/`{3,}(?:json)?\s*([\s\S]*?)\s*`{3,}/);
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
    // 5b. Insert missing commas between properties/elements
    // Handles: ]\n"key" or }\n"key" or "value"\n"key" or number\n"key" or true/false/null\n"key"
    const insertMissingCommas = (str: string) =>
        str.replace(/([\]\}\"\d]|true|false|null)\s*\n(\s*")/g, '$1,\n$2');

    try {
        // Try standard parsing first (with missing comma insert + trailing comma fix)
        return JSON.parse(cleanCommas(insertMissingCommas(jsonString)));
    } catch (e) {
        console.warn(`Initial JSON parse failed in ${functionName}, attempting repair...`);
        try {
            // Attempt to repair truncation
            let repaired = repairTruncatedJson(jsonString);
            // Apply comment stripping again on repaired string just in case
            repaired = stripJsonComments(repaired);
            // Insert missing commas between properties
            repaired = insertMissingCommas(repaired);
            // CRITICAL FIX: Clean trailing keys then clean commas
            repaired = cleanTrailingKeys(repaired);
            repaired = cleanCommas(repaired);

            return JSON.parse(repaired);
        } catch (repairError) {
            // Last resort: re-process from rawText with aggressive sanitization
            try {
                let sanitized = rawText.replace(/[\x00-\x1f]/g, ' ');
                // Re-strip markdown fences
                const reMatch = sanitized.match(/`{3,}(?:json)?\s*([\s\S]*?)\s*`{3,}/);
                if (reMatch && reMatch[1]) sanitized = reMatch[1].trim();
                sanitized = extractValidJsonBlock(sanitized);
                sanitized = stripJsonComments(sanitized);
                sanitized = insertMissingCommas(sanitized);
                sanitized = cleanTrailingKeys(cleanCommas(sanitized));
                return JSON.parse(sanitized);
            } catch (finalError) {
                console.error(`JSON Repair Failed in ${functionName}. Raw:`, rawText, "Extracted:", jsonString, "Error:", finalError);
                throw new Error(`AI 응답 파싱 실패 (${functionName}): JSON 구조가 손상되었습니다. (토큰 제한 또는 형식 오류)`);
            }
        }
    }
}


/**
 * Safely retrieves the total token count from a Gemini response.
 */
export function getTokenCountFromResponse(response: GenerateContentResponse): number {
    return response.usageMetadata?.totalTokenCount ?? 0;
}

export const MODELS = {
    TEXT: 'gemini-3-flash-preview',
    VISION: 'gemini-3-flash-preview',
    IMAGE: 'gemini-3-flash-image-preview',
    TTS: 'gemini-2.5-flash-preview-tts',
};

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
