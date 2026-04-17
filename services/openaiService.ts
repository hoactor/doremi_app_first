// services/openaiService.ts — DALL-E 3 원본 이미지 생성 + 키 테스트
// 용도: 대표 캐릭터/배경/의상/소품의 "원본 참조 이미지" 생성
//      (썰쇼츠 본편은 Gemini/Flux. DALL-E는 치비/치밀도가 원탑이라 참조용으로 최적)

import { ImageRatio } from '../types';
import { loadApiKeys } from './tauriAdapter';

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

async function getOpenAiKey(): Promise<string> {
    const keys = await loadApiKeys();
    const key = keys.openai?.trim();
    if (!key) {
        throw new DalleError('missing-key', 'OpenAI API 키가 설정되지 않았습니다. 설정 → API 키에서 등록해주세요.');
    }
    return key;
}

/**
 * DALL-E 3 이미지 생성 (HD 기본)
 * 에러는 DalleError로 kind 분류되어 던져짐 → UI에서 kind로 분기 처리.
 */
export async function generateImageWithDalle(
    options: DalleGenerateOptions,
): Promise<DalleGenerateResult> {
    const { prompt, assetType, ratio = '1:1', style = 'vivid', quality = 'hd' } = options;
    const apiKey = await getOpenAiKey();
    const size = pickDalleSize(assetType, ratio);

    let response: Response;
    try {
        response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'dall-e-3',
                prompt,
                n: 1,
                size,
                quality,
                style,
                response_format: 'b64_json',
            }),
        });
    } catch (err) {
        throw new DalleError('network', '네트워크 오류. 연결 확인 후 다시 시도해주세요.');
    }

    if (!response.ok) {
        let body: any = null;
        try { body = await response.json(); } catch { /* ignore */ }
        const apiMessage: string = body?.error?.message || response.statusText;
        const code: string | undefined = body?.error?.code;
        const type: string | undefined = body?.error?.type;

        // 콘텐츠 정책 거부 — 여러 형태로 올 수 있음
        if (
            code === 'content_policy_violation' ||
            /content[_\s-]?policy/i.test(apiMessage) ||
            /safety[_\s-]?system/i.test(apiMessage) ||
            /content filter/i.test(apiMessage)
        ) {
            throw new DalleError(
                'content-policy',
                'OpenAI 콘텐츠 정책에 의해 거부됐습니다. 프롬프트를 다듬어 다시 시도해주세요.',
            );
        }

        if (response.status === 401) {
            throw new DalleError('missing-key', 'OpenAI API 키가 유효하지 않습니다. 설정에서 다시 확인해주세요.');
        }
        if (response.status === 429 || type === 'rate_limit_exceeded') {
            throw new DalleError('rate-limit', 'OpenAI 요청 한도에 걸렸습니다. 잠시 후 다시 시도해주세요.');
        }
        if (response.status >= 500) {
            throw new DalleError('server', `OpenAI 서버 오류 (${response.status}). 잠시 후 다시 시도해주세요.`);
        }
        throw new DalleError('unknown', `DALL-E 3 오류: ${apiMessage}`);
    }

    let result: any;
    try { result = await response.json(); } catch {
        throw new DalleError('invalid-response', 'DALL-E 응답을 해석할 수 없습니다.');
    }

    const first = result?.data?.[0];
    if (!first?.b64_json) {
        throw new DalleError('invalid-response', 'DALL-E 응답에 이미지 데이터가 없습니다.');
    }

    return {
        imageUrl: `data:image/png;base64,${first.b64_json}`,
        revisedPrompt: first.revised_prompt || prompt,
        size,
        quality,
        style,
    };
}

// ─── OpenAI Chat API (프롬프트 생성/수정 전용) ────────────────────────
// ChatGPT의 DALL-E 모드와 유사하게 작동: GPT-4가 사용자 요청을 받아
// DALL-E 3 프롬프트를 생성/수정. Claude 대체.

const DEFAULT_CHAT_MODEL = 'gpt-4o';

const CHAT_SYSTEM_PROMPT = `You are an image prompt assistant for DALL-E 3,
working inside a Korean webtoon-style chibi character creation tool.

Your job: take the user's request (Korean or English) and produce a single
DALL-E 3 prompt. Output ONLY the final English prompt — no explanations,
no quotes, no markdown, no prefix.

Built-in style (include in every prompt you write):
"Korean webtoon-style super cute chibi illustration. Characters have
oversized round heads, tiny bodies (around 3 heads tall), extremely big
sparkling eyes, and puffy round cheeks. Highly expressive faces with
exaggerated emotions, blushing cheeks, and sweat drops. Colorful, clean,
highly expressive rendering with exaggerated motion effects on a soft
pastel background."

Behavior:
- If a "Current prompt" is provided, modify it minimally per the user's
  request. Don't rewrite from scratch. Keep successful elements.
- If no Current prompt, create a new one that integrates the built-in style
  with the user's request.
- Keep the output ONE cohesive image description — never "two scenes side by
  side", never character sheets or turnarounds.
- Prefer soft, diffused, natural lighting (not hyperreal/vivid).
- Keep total length under ~500 characters when possible.
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
    const apiKey = await getOpenAiKey();
    const model = opts.model || DEFAULT_CHAT_MODEL;

    const hasExisting = !!opts.currentPrompt?.trim();
    const userMessage = hasExisting
        ? `Asset type: ${opts.assetType}\n\nCurrent prompt:\n"""\n${opts.currentPrompt}\n"""\n\nUser request (modify the current prompt accordingly): "${opts.request}"\n\nOutput the revised DALL-E 3 prompt only.`
        : `Asset type: ${opts.assetType}\n\nUser request (create a new prompt): "${opts.request}"\n\nOutput the DALL-E 3 prompt only.`;

    let response: Response;
    try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: CHAT_SYSTEM_PROMPT },
                    { role: 'user', content: userMessage },
                ],
                temperature: 0.4,
                max_tokens: 600,
            }),
        });
    } catch {
        throw new DalleError('network', '네트워크 오류. 연결 확인 후 다시 시도해주세요.');
    }

    if (!response.ok) {
        let body: any = null;
        try { body = await response.json(); } catch { /* ignore */ }
        const msg: string = body?.error?.message || response.statusText;
        if (response.status === 401) {
            throw new DalleError('missing-key', 'OpenAI API 키가 유효하지 않습니다. 설정에서 다시 확인해주세요.');
        }
        if (response.status === 429) {
            throw new DalleError('rate-limit', 'OpenAI 요청 한도에 걸렸습니다. 잠시 후 다시 시도해주세요.');
        }
        if (response.status >= 500) {
            throw new DalleError('server', `OpenAI 서버 오류 (${response.status}). 잠시 후 다시 시도해주세요.`);
        }
        throw new DalleError('unknown', `OpenAI Chat 오류: ${msg}`);
    }

    let result: any;
    try { result = await response.json(); } catch {
        throw new DalleError('invalid-response', 'OpenAI Chat 응답을 해석할 수 없습니다.');
    }

    const content: string | undefined = result?.choices?.[0]?.message?.content;
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
        const apiKey = await getOpenAiKey();
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You name assets for a Korean chibi creation tool. Output ONLY the Korean name, under 20 characters, no quotes, no explanation.' },
                    { role: 'user', content: `Asset type: ${typeLabel}\nPrompt: "${dallePrompt.slice(0, 400)}"\n\nGenerate a short memorable Korean name.` },
                ],
                temperature: 0.7,
                max_tokens: 30,
            }),
        });
        if (!response.ok) return `새 ${typeLabel}`;
        const result = await response.json();
        const name: string | undefined = result?.choices?.[0]?.message?.content;
        return name?.trim().replace(/^["'`]+|["'`]+$/g, '').slice(0, 30) || `새 ${typeLabel}`;
    } catch {
        return `새 ${typeLabel}`;
    }
}

/** 키 유효성 간단 테스트 (models 엔드포인트 호출) */
export async function testOpenAiApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
    if (!apiKey?.trim()) return { ok: false, message: 'API 키를 입력해주세요.' };

    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
        });

        if (response.ok) return { ok: true, message: 'API 키가 유효합니다.' };

        const body = await response.json().catch(() => null);
        const msg = body?.error?.message || response.statusText;
        if (response.status === 401) return { ok: false, message: 'API 키가 유효하지 않습니다.' };
        return { ok: false, message: `API 테스트 실패: ${msg}` };
    } catch {
        return { ok: false, message: '네트워크 오류 또는 API 엔드포인트에 연결할 수 없습니다.' };
    }
}
