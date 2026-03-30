/**
 * Typecast Service (Firebase Functions / Cloud Run Proxy Mode)
 */
const SERVER_URL = "https://typecastproxy-j4ydyzhdza-uc.a.run.app"; 

export interface TypecastParams {
    actor_id: string;
    text: string;
    lang?: string;
    emotion_name?: string;
    emotion_variant_name?: string;
    speech_rate?: number;
    pitch?: number;
    tempo?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 응답 본문을 분석하여 데이터 또는 오디오 Blob을 반환합니다.
 */
async function processResponse(response: Response, context: string) {
    const contentType = response.headers.get("Content-Type") || "";
    
    if (contentType.includes("audio") || contentType.includes("application/octet-stream")) {
        const audioBlob = await response.blob();
        return { isAudio: true, blob: audioBlob };
    }

    const text = await response.text();
    
    if (response.status === 403 || text.includes("403 ERROR") || text.includes("CloudFront")) {
        throw new Error(`${context}: 보안 시스템이 요청을 차단했습니다. (403 Forbidden)`);
    }

    try {
        const data = JSON.parse(text);
        if (!response.ok || data.error) {
            const errorMsg = data.message || data.error || `오류 코드 ${response.status}`;
            throw new Error(`${context}: ${errorMsg}`);
        }
        return { isAudio: false, data };
    } catch (e) {
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
            throw new Error(`${context}: 서버 에러 페이지가 반환되었습니다. (Status: ${response.status})`);
        }
        throw new Error(`${context}: 응답 데이터 분석 실패 (JSON 형식이 아닙니다)`);
    }
}

export const generateTypecastSpeech = async (params: TypecastParams): Promise<File> => {
    const { actor_id, text, emotion_name = "normal", speech_rate = 1.3, pitch = 0 } = params;

    if (!actor_id) throw new Error("Actor ID가 누락되었습니다.");

    const targetUrl = `${SERVER_URL}/speak?actor_id=${encodeURIComponent(actor_id)}`;

    try {
        const finalRate = Number(speech_rate);
        const finalPitch = Number(pitch);

        // 디버그 로그: 서버로 보내기 직전의 최종 속도 값 확인
        console.debug(`[Typecast-Ready] Sending to Proxy - Actor: ${actor_id}, Speed: ${finalRate}`);

        // 1. 음성 합성 요청 전송
        // 서버(Proxy) 코드의 로직에 맞게 'speed'를 최상단과 prompt 내부에 모두 배치합니다.
        const speakRes = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                actorId: actor_id,
                voice_id: actor_id, // 서버에서 voice_id를 사용함
                speed: finalRate,    // 서버 로직: let finalSpeed = input.speed
                prompt: {
                    speed: finalRate, // 서버 로직: if (input.prompt.speed)
                    emotion_tone_preset: emotion_name,
                    pitch: finalPitch
                },
                lang: "ko"
            })
        });

        const initialResult = await processResponse(speakRes, "음성 합성 요청");
        
        if (initialResult.isAudio && initialResult.blob) {
            return new File([initialResult.blob], `typecast_${Date.now()}.wav`, { type: "audio/wav" });
        }

        const speakData = initialResult.data;
        if (!speakData.result || !speakData.result.speak_id) {
            throw new Error(`타입캐스트 응답 데이터 오류: speak_id 누락`);
        }

        const speakId = speakData.result.speak_id;

        // 2. 상태 확인 (Polling)
        let downloadUrl = "";
        const startTime = Date.now();
        const timeout = 120000; 

        while (Date.now() - startTime < timeout) {
            await sleep(3000); 

            const statusRes = await fetch(`${SERVER_URL}/status/${speakId}`);
            const statusResult = await processResponse(statusRes, "상태 확인");
            
            if (statusResult.isAudio && statusResult.blob) {
                return new File([statusResult.blob], `typecast_${Date.now()}.wav`, { type: "audio/wav" });
            }

            const statusData = statusResult.data.result;
            if (!statusData) continue;

            if (statusData.status === "done") {
                downloadUrl = statusData.download_url;
                break;
            } else if (statusData.status === "failed") {
                throw new Error("타입캐스트 서버 내부에서 음성 생성 중 오류가 발생했습니다.");
            }
        }

        if (!downloadUrl) throw new Error("음성 생성 대기 시간이 초과되었습니다.");

        // 3. 최종 파일 다운로드
        const audioRes = await fetch(`${SERVER_URL}/download?url=${encodeURIComponent(downloadUrl)}`);
        const finalResult = await processResponse(audioRes, "오디오 다운로드");
        
        if (finalResult.isAudio && finalResult.blob) {
            return new File([finalResult.blob], `typecast_${Date.now()}.wav`, { type: "audio/wav" });
        }
        
        throw new Error(`오디오 파일 다운로드에 실패했습니다.`);

    } catch (error) {
        console.error("Typecast Service Error:", error);
        throw error;
    }
};