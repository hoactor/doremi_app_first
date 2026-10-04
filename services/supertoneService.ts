
import { IS_TAURI, callSupertoneTauri } from './tauriAdapter';

export interface SupertoneConfig {
    voiceId: string;
    text: string;
    language?: 'ko' | 'en' | 'ja';
    style?: string;
    speed?: number;
    pitch?: number;
}

// --- Rate Limiting Queue System ---
// Limit: 20 requests per minute = 1 request every 3 seconds.
// Using 3200ms for safety.
const RATE_LIMIT_INTERVAL_MS = 3200;
export const SUPERTONE_MAX_TEXT_LENGTH = 300;

export const splitSupertoneText = (
    text: string,
    maxLength: number = SUPERTONE_MAX_TEXT_LENGTH,
): string[] => {
    if (!Number.isInteger(maxLength) || maxLength < 1) {
        throw new Error('Supertone 분할 길이가 올바르지 않습니다.');
    }
    const remaining = Array.from(text.trim());
    const parts: string[] = [];
    while (remaining.length > maxLength) {
        const minimumNaturalSplit = Math.floor(maxLength * 0.5);
        let splitAt = maxLength;
        for (let index = maxLength - 1; index >= minimumNaturalSplit; index--) {
            const char = remaining[index];
            if (/\s/u.test(char)) {
                splitAt = index;
                break;
            }
            if (/[.!?…。！？,，;；:：]/u.test(char)) {
                splitAt = index + 1;
                break;
            }
        }
        const part = remaining.splice(0, Math.max(1, splitAt)).join('').trim();
        while (remaining.length > 0 && /\s/u.test(remaining[0])) remaining.shift();
        if (part) parts.push(part);
    }
    const tail = remaining.join('').trim();
    if (tail) parts.push(tail);
    return parts;
};

interface QueueItem {
    config: SupertoneConfig;
    resolve: (file: File) => void;
    reject: (error: any) => void;
}

const requestQueue: QueueItem[] = [];
let isProcessingQueue = false;
let lastRequestTime = 0; 

/**
 * Supertone API 호출 로직
 * Tauri: Rust 백엔드가 직접 호출 (CORS 없음, API 키 안전)
 * 브라우저 실행에서는 API 키가 노출되지 않도록 호출을 차단한다.
 */
const performApiCall = async (config: SupertoneConfig): Promise<File> => {
    const { voiceId, text, language = 'ko', style = 'neutral', speed = 1.0, pitch = 0 } = config;

    if (!voiceId) {
        throw new Error("Voice ID가 유효하지 않습니다 (undefined or empty).");
    }
    const textLength = Array.from(text.trim()).length;
    if (textLength === 0 || textLength > SUPERTONE_MAX_TEXT_LENGTH) {
        throw new Error(`Supertone 문장은 1~${SUPERTONE_MAX_TEXT_LENGTH}자여야 합니다.`);
    }

    // ─── Tauri: Rust 백엔드 프록시 (CORS-free, 키 안전) ───
    if (IS_TAURI) {
        try {
            const blob = await callSupertoneTauri(voiceId.trim(), text, language, style, speed, pitch);
            return new File([blob], `supertone_${Date.now()}.wav`, { type: 'audio/wav' });
        } catch (error: any) {
            console.error("Supertone (Tauri) Failed:", error);
            throw new Error(`Supertone TTS 오류: ${error.message || error}`);
        }
    }

    throw new Error('Supertone 기능은 로컬 Tauri 앱에서만 사용할 수 있습니다.');
};

const processQueue = async () => {
    if (isProcessingQueue || requestQueue.length === 0) return;
    isProcessingQueue = true;

    while (requestQueue.length > 0) {
        const item = requestQueue[0];
        
        const now = Date.now();
        const timeSinceLastCall = now - lastRequestTime;
        
        if (timeSinceLastCall < RATE_LIMIT_INTERVAL_MS) {
            const waitTime = RATE_LIMIT_INTERVAL_MS - timeSinceLastCall;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        requestQueue.shift();
        lastRequestTime = Date.now();

        try {
            const result = await performApiCall(item.config);
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        }
    }

    isProcessingQueue = false;
};

export const generateSupertoneSpeech = (config: SupertoneConfig): Promise<File> => {
    return new Promise((resolve, reject) => {
        requestQueue.push({ config, resolve, reject });
        processQueue();
    });
};
