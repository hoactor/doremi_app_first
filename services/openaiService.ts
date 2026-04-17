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
