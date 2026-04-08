
import { Notification } from '../types';
import { IS_TAURI, callSupertoneTauri, loadApiKeys } from './tauriAdapter';

// Supertone API Endpoint
const SUPERTONE_API_URL = "https://supertoneapi.com/v1/text-to-speech";

// Browser fallback: process.env (Vite define)
function getApiKeyBrowser(): string {
    return process.env.SUPERTONE_API_KEY || "";
}

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
 * 브라우저: corsproxy.io 경유 (개발용 폴백)
 */
const performApiCall = async (config: SupertoneConfig): Promise<File> => {
    const { voiceId, text, language = 'ko', style = 'neutral', speed = 1.0, pitch = 0 } = config;

    if (!voiceId) {
        throw new Error("Voice ID가 유효하지 않습니다 (undefined or empty).");
    }

    // ─── Tauri: Rust 백엔드 프록시 (CORS-free, 키 안전) ───
    if (IS_TAURI) {
        try {
            const blob = await callSupertoneTauri(voiceId.trim(), text, language, style);
            return new File([blob], `supertone_${Date.now()}.wav`, { type: 'audio/wav' });
        } catch (error: any) {
            console.error("Supertone (Tauri) Failed:", error);
            throw new Error(`Supertone TTS 오류: ${error.message || error}`);
        }
    }

    // ─── 브라우저: CORS proxy 경유 (개발용) ───
    const apiKey = getApiKeyBrowser();
    if (!apiKey) {
        throw new Error("Supertone API Key가 설정되지 않았습니다.");
    }

    const cleanVoiceId = voiceId.trim();
    const cleanApiKey = apiKey.trim();
    const targetUrl = `${SUPERTONE_API_URL}/${cleanVoiceId}`;
    
    const body = {
        text: text,
        language: language,
        style: style,
        model: "sona_speech_1",
        voice_settings: {
            speed: speed,
            pitch_shift: pitch,
            pitch_variance: 1.0
        }
    };

    const headers = {
        'Content-Type': 'application/json',
        'x-sup-api-key': cleanApiKey,
    };

    // 프록시 URL 구성 (브라우저 직접 호출 시 CORS 에러 발생 방지)
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const status = response.status;
            let errorText = '';
            let isHtml = false;

            try {
                errorText = await response.text();
                if (errorText.trim().startsWith('<') || errorText.toLowerCase().includes('origin dns error')) {
                    isHtml = true;
                }
            } catch (e) { }

            let errorMessage = `Supertone API Error: ${status}`;
            
            if (status === 401) errorMessage = "인증 실패: API 키를 확인해주세요.";
            else if (status === 402) errorMessage = "크레딧 부족: 슈퍼톤 플랜을 확인해주세요.";
            else if (status === 429) errorMessage = "요청 한도 초과: 잠시 후 다시 시도해주세요.";
            else if (status === 404) errorMessage = "Voice ID를 찾을 수 없습니다.";
            else if (status === 403) errorMessage = "권한 없음: 해당 Voice ID에 접근할 수 없거나 프록시에서 헤더가 차단되었습니다.";
            else if (status === 530 || (status >= 500 && isHtml)) {
                errorMessage = "서버 연결 오류: Supertone API 서버에 연결할 수 없습니다.";
                errorText = ""; 
            }
            
            throw new Error(`${errorMessage} ${!isHtml && errorText ? `(${errorText})` : ''}`);
        }

        const blob = await response.blob();
        return new File([blob], `supertone_${Date.now()}.wav`, { type: 'audio/wav' });

    } catch (error) {
        console.error("Supertone Generation Failed:", error);
        if (error instanceof TypeError && error.message === "Failed to fetch") {
             throw new Error("네트워크 오류: 프록시 서버에 접근할 수 없거나 연결이 거부되었습니다.");
        }
        throw error;
    }
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
