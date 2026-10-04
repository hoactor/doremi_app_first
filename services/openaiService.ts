// services/openaiService.ts — DALL-E 3 원본 이미지 생성 + 키 테스트
// 용도: 대표 캐릭터/배경/의상/소품의 "원본 참조 이미지" 생성
//      (썰쇼츠 본편은 Gemini/Flux. DALL-E는 치비/치밀도가 원탑이라 참조용으로 최적)

import { ImageRatio } from '../types';
import { callOpenAiChatTauri, callOpenAiDalleTauri, testStoredOpenAiKey } from './tauriAdapter';

export type DalleAssetType = 'character' | 'background' | 'outfit' | 'prop';

/**
 * 에셋 타입에 따라 DALL-E 3 size 자동 선택.
 * - 캐릭터/의상/소품: 1024x1024 (정사각, 레퍼런스 시트용)
 * - 배경: imageRatio에 따라 1792x1024 / 1024x1792 / 1024x1024
 */
function pickDalleSize(
    assetType: DalleAssetType,
    ratio: ImageRatio,
): '1024x1024' | '1792x1024' | '1024x1792' {
    if (assetType === 'background') {
        if (ratio === '16:9') return '1792x1024';
        if (ratio === '9:16') return '1024x1792';
        return '1024x1024';
    }
    return '1024x1024';
}

export interface DalleGenerateOptions {
    prompt: string;
    assetType: DalleAssetType;
    ratio?: ImageRatio;
    style?: 'vivid' | 'natural';
    quality?: 'standard' | 'hd';
}

export interface DalleGenerateResult {
    imageUrl: string;       // data:image/png;base64,...
    revisedPrompt: string;  // DALL-E가 재작성한 프롬프트
    size: string;           // 실제 생성된 크기 (예: "1024x1024")
    quality: 'standard' | 'hd';
    style: 'vivid' | 'natural';
}

export type DalleErrorKind =
    | 'missing-key'
    | 'content-policy'
    | 'rate-limit'
    | 'server'
    | 'network'
    | 'invalid-response'
    | 'unknown';

export class DalleError extends Error {
    kind: DalleErrorKind;
    constructor(kind: DalleErrorKind, message: string) {
        super(message);
        this.kind = kind;
    }
}

function classifyOpenAiProxyError(error: unknown): DalleError {
    if (error instanceof DalleError) return error;
    const raw = String((error as any)?.message || error || '');
    if (raw.includes('OPENAI_MISSING_KEY')) {
        return new DalleError('missing-key', 'OpenAI API 키가 설정되지 않았거나 유효하지 않습니다. 설정 → API 키에서 확인해주세요.');
    }
    if (raw.includes('OPENAI_CONTENT_POLICY')) {
        return new DalleError('content-policy', 'OpenAI 콘텐츠 정책에 의해 거부됐습니다. 프롬프트를 다듬어 다시 시도해주세요.');
    }
    if (raw.includes('OPENAI_RATE_LIMIT')) {
        return new DalleError('rate-limit', 'OpenAI 요청 한도에 걸렸습니다. 잠시 후 다시 시도해주세요.');
    }
    if (raw.includes('OPENAI_SERVER')) {
        return new DalleError('server', 'OpenAI 서버 오류입니다. 잠시 후 다시 시도해주세요.');
    }
    if (raw.includes('OPENAI_NETWORK')) {
        return new DalleError('network', '네트워크 오류. 연결 확인 후 다시 시도해주세요.');
    }
    if (raw.includes('OPENAI_INVALID_RESPONSE')) {
        return new DalleError('invalid-response', 'OpenAI 응답을 해석할 수 없습니다.');
    }
    return new DalleError('unknown', `OpenAI 오류: ${raw || '알 수 없는 오류'}`);
}

/**
 * DALL-E 3 이미지 생성 (HD 기본)
 * 에러는 DalleError로 kind 분류되어 던져짐 → UI에서 kind로 분기 처리.
 */
export async function generateImageWithDalle(
    options: DalleGenerateOptions,
): Promise<DalleGenerateResult> {
    const { prompt, assetType, ratio = '1:1', style = 'vivid', quality = 'hd' } = options;
    const size = pickDalleSize(assetType, ratio);
    try {
        const result = await callOpenAiDalleTauri({
            prompt,
            size,
            quality,
            style,
        });
        if (!result.image_base64) {
            throw new DalleError('invalid-response', 'DALL-E 응답에 이미지 데이터가 없습니다.');
        }
        return {
            imageUrl: `data:image/png;base64,${result.image_base64}`,
            revisedPrompt: result.revised_prompt || prompt,
            size,
            quality,
            style,
        };
    } catch (error) {
        throw classifyOpenAiProxyError(error);
    }
}

// ─── OpenAI Chat API (프롬프트 생성/수정 전용) ────────────────────────
// ChatGPT의 DALL-E 모드와 유사하게 작동: GPT-4가 사용자 요청을 받아
// DALL-E 3 프롬프트를 생성/수정. Claude 대체.

const DEFAULT_CHAT_MODEL = 'gpt-4o';

// CHAT_SYSTEM_PROMPT — 콘텐츠 묘사 전용 (화풍은 styleRegistry가 따로 합침).
// 화풍 키워드/aesthetic 단어 일절 출력 금지.
const CHAT_SYSTEM_PROMPT = `You are an image content prompt assistant for DALL-E 3.

Your job: take the user's request (Korean or English) and produce a single
ENGLISH content description for the image. Output ONLY the final English
content description — no explanations, no quotes, no markdown, no prefix.

CRITICAL RULES:
- Describe ONLY content: subject, action, expression, clothing, setting,
  lighting mood. NEVER include style/aesthetic/illustration/medium words
  (no "chibi", "anime", "webtoon", "illustration", "cartoon", "pastel",
  "cel shading", "line art", etc.). Style is appended downstream.
- If a "Current prompt" is provided, modify it minimally per the user's
  request. Don't rewrite from scratch. Keep successful elements.
- Keep the output ONE cohesive image description — never "two scenes side by
  side", never character sheets or turnarounds.
- Keep total length under ~350 characters when possible.
- Never add policy-sensitive content (minors in distress, violence, nudity).`;

export interface OpenAiChatPromptOptions {
    request: string;            // 사용자가 한국어 또는 영어로 입력한 요청
    assetType: DalleAssetType;  // 저장 카테고리 힌트
    currentPrompt?: string;     // 비어있으면 신규 생성, 있으면 수정
    model?: string;             // 기본 gpt-4o
}

/**
 * OpenAI Chat API로 DALL-E 프롬프트를 생성 또는 수정.
 * ChatGPT의 DALL-E 모드와 유사한 흐름 — Claude 없이 OpenAI만으로 완결.
 */
export async function generateDallePromptViaOpenAI(
    opts: OpenAiChatPromptOptions,
): Promise<{ prompt: string }> {
    const model = opts.model || DEFAULT_CHAT_MODEL;
    if (model !== 'gpt-4o' && model !== 'gpt-4o-mini') {
        throw new DalleError('invalid-response', '지원하지 않는 OpenAI 모델입니다.');
    }

    const hasExisting = !!opts.currentPrompt?.trim();
    const userMessage = hasExisting
        ? `Asset type: ${opts.assetType}\n\nCurrent prompt:\n"""\n${opts.currentPrompt}\n"""\n\nUser request (modify the current prompt accordingly): "${opts.request}"\n\nOutput the revised DALL-E 3 prompt only.`
        : `Asset type: ${opts.assetType}\n\nUser request (create a new prompt): "${opts.request}"\n\nOutput the DALL-E 3 prompt only.`;

    let content: string;
    try {
        const response = await callOpenAiChatTauri({
            model,
            system: CHAT_SYSTEM_PROMPT,
            user: userMessage,
            temperature: 0.4,
            max_tokens: 600,
        });
        content = response.content;
    } catch (error) {
        throw classifyOpenAiProxyError(error);
    }

    if (!content || !content.trim()) {
        throw new DalleError('invalid-response', 'OpenAI Chat 응답이 비어있습니다.');
    }

    const prompt = content.trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^(DALL-E.{0,20}:|Prompt:|Revised prompt:)\s*/i, '');

    return { prompt };
}

/** 생성된 DALL-E 결과물에 대해 짧은 한국어 이름 제안 (gpt-4o-mini 사용, 저렴) */
export async function suggestAssetNameViaOpenAI(
    assetType: DalleAssetType,
    dallePrompt: string,
): Promise<string> {
    const typeLabel = { character: '캐릭터', background: '배경', outfit: '의상', prop: '소품' }[assetType];
    try {
        const result = await callOpenAiChatTauri({
            model: 'gpt-4o-mini',
            system: 'You name assets for a Korean chibi creation tool. Output ONLY the Korean name, under 20 characters, no quotes, no explanation.',
            user: `Asset type: ${typeLabel}\nPrompt: "${dallePrompt.slice(0, 400)}"\n\nGenerate a short memorable Korean name.`,
            temperature: 0.7,
            max_tokens: 30,
        });
        const name = result.content;
        return name?.trim().replace(/^["'`]+|["'`]+$/g, '').slice(0, 30) || `새 ${typeLabel}`;
    } catch {
        return `새 ${typeLabel}`;
    }
}

// ─── 화풍 styleBlock 자동 변환 (한글 묘사 → 영문 키워드) ───────────

const STYLE_BLOCK_CONVERTER_PROMPT = `You generate a DALL-E 3 / gpt-image-2 style block from a Korean description.

Output format (single line, comma-separated English keywords, no headers, no bullet points, no SD-style weights):
[medium/style] , [proportions/ratio] , [face features] , [line work] , [coloring] , [lighting] , [mood] , [polish]

CRITICAL RULES:
- ONE line only. Comma-separated. No newlines, no markdown, no quotes.
- 80~150 characters total.
- ENGLISH only — no Korean characters in output.
- NO weight syntax like (keyword:1.4). NO directives like "DO NOT". NO section headers like "[Style]:".
- NO content/subject words (no character, action, location). ONLY style/aesthetic descriptors.
- Cover all 8 axes when relevant: medium, proportions, face, lines, coloring, lighting, mood, polish.

EXAMPLES:
Input: 수채화풍 부드럽고 따뜻한 색감
Output: soft watercolor illustration, balanced proportions, gentle facial features, loose hand-painted lines, warm pastel color washes, diffused natural lighting, cozy nostalgic mood, polished hand-painted finish

Input: 사이버펑크 네온 분위기
Output: cyberpunk anime illustration, stylized proportions, sharp angular features, crisp neon-edged line art, saturated neon palette, dramatic rim lighting, gritty futuristic mood, polished cyberpunk rendering`;

export async function generateStyleBlockFromKorean(
    koreanDescription: string,
    model: string = DEFAULT_CHAT_MODEL,
): Promise<string> {
    const desc = koreanDescription.trim();
    if (!desc) throw new DalleError('invalid-response', '한글 묘사가 비어있습니다.');
    if (model !== 'gpt-4o' && model !== 'gpt-4o-mini') {
        throw new DalleError('invalid-response', '지원하지 않는 OpenAI 모델입니다.');
    }
    let content: string;
    try {
        const response = await callOpenAiChatTauri({
            model,
            system: STYLE_BLOCK_CONVERTER_PROMPT,
            user: `Korean description: "${desc}"\n\nOutput the style block (single line, English keywords only):`,
            temperature: 0.5,
            max_tokens: 220,
        });
        content = response.content;
    } catch (error) {
        throw classifyOpenAiProxyError(error);
    }

    if (!content || !content.trim()) {
        throw new DalleError('invalid-response', '응답이 비어있습니다.');
    }

    // 정리: 줄바꿈/따옴표/마크다운/prefix 제거, 한 줄로 평탄화
    return content
        .trim()
        .replace(/\n+/g, ' ')
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^(Output:|Style:|Style block:)\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 키 유효성 간단 테스트 (models 엔드포인트 호출) */
export async function testOpenAiApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
    if (!apiKey?.trim()) return { ok: false, message: 'API 키를 입력해주세요.' };
    try {
        return await testStoredOpenAiKey();
    } catch {
        return { ok: false, message: '네트워크 오류 또는 API 엔드포인트에 연결할 수 없습니다.' };
    }
}
