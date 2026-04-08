/**
 * Claude API Service for DoReMiSsul Studio
 * Tauri 환경: Rust 백엔드 → API 키 안전 관리
 * 브라우저 환경: Vite proxy 폴백 (개발용)
 */

import {
    IS_TAURI,
    callClaudeTauri,
    callClaudeStreamTauri,
    callClaudeVisionTauri,
} from './tauriAdapter';

// ★ 동적 모델 선택 (기본 Opus)
let _claudeModelOverride: string | null = null;

export function setClaudeModel(tier: 'sonnet' | 'opus') {
    _claudeModelOverride = tier === 'opus'
        ? 'claude-opus-4-6'
        : 'claude-sonnet-4-20250514';
}

function getClaudeModel(): string {
    return _claudeModelOverride || 'claude-opus-4-6'; // 기본 Opus
}

interface ClaudeResponse {
    text: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// ─── Browser-only helpers (Vite dev proxy) ─────────────────────

async function callClaudeBrowser(
    systemPrompt: string,
    userPrompt: string,
    options?: { temperature?: number; maxTokens?: number; responseFormat?: 'text' | 'json' }
): Promise<ClaudeResponse> {
    const maxTokens = options?.maxTokens || 8192;
    const body: any = {
        model: getClaudeModel(),
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch('/api/claude/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('Claude API error:', response.status, errorBody);
        if (response.status === 401) throw new Error('Claude API 키가 유효하지 않습니다.');
        if (response.status === 429) throw new Error('Claude API 요청 한도 초과. 잠시 후 다시 시도해주세요.');
        throw new Error(`Claude API 오류 (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const textContent = data.content?.find((c: any) => c.type === 'text');
    return {
        text: textContent?.text?.trim() || '',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
}

async function callClaudeStreamBrowser(
    systemPrompt: string,
    userPrompt: string,
    onProgress?: (textLength: number) => void,
    options?: { temperature?: number; maxTokens?: number }
): Promise<ClaudeResponse> {
    const maxTokens = options?.maxTokens || 8192;
    const body: any = {
        model: getClaudeModel(),
        max_tokens: maxTokens,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch('/api/claude/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Claude API 스트리밍 오류 (${response.status}): ${errorBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('스트리밍 응답을 읽을 수 없습니다.');

    const decoder = new TextDecoder();
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
                const event = JSON.parse(jsonStr);
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    fullText += event.delta.text;
                    if (onProgress) onProgress(fullText.length);
                }
                if (event.type === 'message_delta' && event.usage) {
                    outputTokens = event.usage.output_tokens || 0;
                }
                if (event.type === 'message_start' && event.message?.usage) {
                    inputTokens = event.message.usage.input_tokens || 0;
                }
            } catch { /* skip */ }
        }
    }

    return { text: fullText.trim(), inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

async function callClaudeVisionBrowser(
    systemPrompt: string,
    userPrompt: string,
    imageBase64: string,
    mimeType: string = 'image/png',
    options?: { temperature?: number; maxTokens?: number }
): Promise<ClaudeResponse> {
    const maxTokens = options?.maxTokens || 4096;
    const body: any = {
        model: getClaudeModel(),
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                { type: 'text', text: userPrompt },
            ],
        }],
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch('/api/claude/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Claude Vision API 오류 (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const textContent = data.content?.find((c: any) => c.type === 'text');
    return {
        text: textContent?.text?.trim() || '',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
}

// ─── 429 Rate Limit 재시도 래퍼 (글로벌 UI 연동) ─────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 30_000; // 30초

/** 429 재시도 상태 콜백 (UI 카운트다운용) */
export type RetryStatusCallback = (status: { waiting: boolean; secondsLeft: number; attempt: number; maxAttempts: number } | null) => void;

/** 글로벌 429 상태 핸들러 — AppContext에서 설정 */
let _globalRetryHandler: RetryStatusCallback | null = null;
export function setGlobalRetryHandler(handler: RetryStatusCallback | null) {
    _globalRetryHandler = handler;
}

async function withRetryOn429<T>(fn: () => Promise<T>, label: string, onRetryStatus?: RetryStatusCallback): Promise<T> {
    const notify = (status: Parameters<RetryStatusCallback>[0]) => {
        if (onRetryStatus) onRetryStatus(status);
        if (_globalRetryHandler) _globalRetryHandler(status);
    };
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await fn();
            notify(null);
            return result;
        } catch (err: any) {
            const msg = String(err?.message || err || '');
            const is429 = msg.includes('429') || msg.includes('rate') || msg.includes('Rate');
            
            if (!is429 || attempt >= MAX_RETRIES) {
                notify(null);
                throw err;
            }
            
            const totalDelay = Math.round(BASE_DELAY_MS * Math.pow(1.5, attempt) / 1000);
            console.warn(`[Claude 429] ${label} — ${attempt + 1}/${MAX_RETRIES} 재시도, ${totalDelay}초 대기...`);
            
            for (let sec = totalDelay; sec > 0; sec--) {
                notify({ waiting: true, secondsLeft: sec, attempt: attempt + 1, maxAttempts: MAX_RETRIES });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            notify({ waiting: false, secondsLeft: 0, attempt: attempt + 1, maxAttempts: MAX_RETRIES });
        }
    }
    throw new Error('Unreachable');
}

// ─── Unified Exports (auto-selects Tauri vs Browser + 429 retry) ─

// ─── Direct fetch (Rust proxy 우회 — localStorage에서 API 키 로드) ──────

async function _getClaudeKey(): Promise<string> {
    const { loadApiKeys } = await import('./tauriAdapter');
    const keys = await loadApiKeys();
    if (!keys.claude) throw new Error('Claude API 키가 설정되지 않았습니다. 설정에서 입력해주세요.');
    return keys.claude;
}

async function callClaudeDirect(
    systemPrompt: string, userPrompt: string,
    options?: { temperature?: number; maxTokens?: number; responseFormat?: 'text' | 'json' }
): Promise<ClaudeResponse> {
    const apiKey = await _getClaudeKey();
    const body: any = {
        model: getClaudeModel(), max_tokens: options?.maxTokens || 8192,
        system: systemPrompt, messages: [{ role: 'user', content: userPrompt }],
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.text(); throw new Error(`Claude API 오류 (${res.status}): ${e}`); }
    const data = await res.json();
    const txt = data.content?.find((c: any) => c.type === 'text');
    return { text: txt?.text?.trim() || '', inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0, totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) };
}

async function callClaudeStreamDirect(
    systemPrompt: string, userPrompt: string, onProgress?: (len: number) => void,
    options?: { temperature?: number; maxTokens?: number }
): Promise<ClaudeResponse> {
    const apiKey = await _getClaudeKey();
    const body: any = {
        model: getClaudeModel(), max_tokens: options?.maxTokens || 8192, stream: true,
        system: systemPrompt, messages: [{ role: 'user', content: userPrompt }],
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.text(); throw new Error(`Claude 스트리밍 오류 (${res.status}): ${e}`); }
    const reader = res.body!.getReader(); const decoder = new TextDecoder();
    let fullText = '', inputTokens = 0, outputTokens = 0, buf = '';
    while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const j = line.slice(6); if (j === '[DONE]') continue;
            try {
                const ev = JSON.parse(j);
                if (ev.type === 'content_block_delta' && ev.delta?.text) { fullText += ev.delta.text; onProgress?.(fullText.length); }
                else if (ev.type === 'message_delta' && ev.usage) { outputTokens = ev.usage.output_tokens || 0; }
                else if (ev.type === 'message_start' && ev.message?.usage) { inputTokens = ev.message.usage.input_tokens || 0; }
            } catch { /* skip */ }
        }
    }
    return { text: fullText.trim(), inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

async function callClaudeVisionDirect(
    systemPrompt: string, userPrompt: string, imageBase64: string, mimeType: string = 'image/png',
    options?: { temperature?: number; maxTokens?: number }
): Promise<ClaudeResponse> {
    const apiKey = await _getClaudeKey();
    const b64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const body: any = {
        model: getClaudeModel(), max_tokens: options?.maxTokens || 8192, system: systemPrompt,
        messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
            { type: 'text', text: userPrompt },
        ]}],
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.text(); throw new Error(`Claude Vision 오류 (${res.status}): ${e}`); }
    const data = await res.json();
    const txt = data.content?.find((c: any) => c.type === 'text');
    return { text: txt?.text?.trim() || '', inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0, totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) };
}

export async function callClaude(
    systemPrompt: string, userPrompt: string,
    options?: { temperature?: number; maxTokens?: number; responseFormat?: 'text' | 'json'; onRetryStatus?: RetryStatusCallback }
): Promise<ClaudeResponse> {
    return withRetryOn429(() => callClaudeDirect(systemPrompt, userPrompt, options), 'callClaude', options?.onRetryStatus);
}

export async function callClaudeStream(
    systemPrompt: string, userPrompt: string, onProgress?: (len: number) => void,
    options?: { temperature?: number; maxTokens?: number; onRetryStatus?: RetryStatusCallback }
): Promise<ClaudeResponse> {
    return withRetryOn429(() => callClaudeStreamDirect(systemPrompt, userPrompt, onProgress, options), 'callClaudeStream', options?.onRetryStatus);
}

export async function callClaudeVision(
    systemPrompt: string, userPrompt: string, imageBase64: string, mimeType: string = 'image/png',
    options?: { temperature?: number; maxTokens?: number; onRetryStatus?: RetryStatusCallback }
): Promise<ClaudeResponse> {
    return withRetryOn429(() => callClaudeVisionDirect(systemPrompt, userPrompt, imageBase64, mimeType, options), 'callClaudeVision', options?.onRetryStatus);
}
