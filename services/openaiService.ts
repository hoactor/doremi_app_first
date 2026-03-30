
import { ImageRatio } from '../types';

const mapRatioToDalleSize = (ratio: ImageRatio): '1024x1024' | '1792x1024' | '1024x1792' => {
    switch (ratio) {
        case '16:9':
            return '1792x1024';
        case '9:16':
            return '1024x1792';
        case '1:1':
        default:
            return '1024x1024';
    }
}

export const generateImageWithDalle = async (prompt: string, apiKey: string, ratio: ImageRatio): Promise<{ imageUrl: string, revisedPrompt: string }> => {
    if (!apiKey) {
        throw new Error("OpenAI API 키가 필요합니다.");
    }

    // The prompt from Gemini now contains all style information.
    const finalPrompt = prompt;

    try {
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Authorization', `Bearer ${apiKey.trim()}`);
        
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: finalPrompt,
                n: 1,
                size: mapRatioToDalleSize(ratio),
                quality: "standard",
                response_format: "b64_json",
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData?.error?.message || `DALL-E 3 API error: ${response.statusText}`;
            if (errorMessage.includes('content filter')) {
                throw new Error("DALL-E 3 정책 위반: 이 프롬프트는 콘텐츠 필터에 의해 거부되었습니다.");
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        if (!result.data || result.data.length === 0) {
            throw new Error("DALL-E 3 API에서 이미지를 반환하지 않았습니다.");
        }
        
        const b64_json = result.data[0].b64_json;
        const revisedPrompt = result.data[0].revised_prompt;
        const imageUrl = `data:image/png;base64,${b64_json}`;

        return { imageUrl, revisedPrompt };

    } catch (error) {
        console.error("Error generating image with DALL-E:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("DALL-E 3 이미지 생성 중 알 수 없는 오류 발생");
    }
};

export const testOpenAiApiKey = async (apiKey: string): Promise<{ ok: boolean, message: string }> => {
    if (!apiKey) {
        return { ok: false, message: "API 키를 입력해주세요." };
    }

    try {
        const headers = new Headers();
        headers.append('Authorization', `Bearer ${apiKey.trim()}`);

        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: headers
        });

        if (response.ok) {
            return { ok: true, message: "API 키가 유효합니다!" };
        } else {
            const errorData = await response.json();
            const errorMessage = errorData?.error?.message || `API error: ${response.statusText}`;
            if (response.status === 401) {
                return { ok: false, message: "API 키가 유효하지 않습니다. 다시 확인해주세요." };
            }
            return { ok: false, message: `API 테스트 실패: ${errorMessage}` };
        }
    } catch (error) {
        console.error("Error testing OpenAI API key:", error);
        return { ok: false, message: "네트워크 오류 또는 API 엔드포인트에 연결할 수 없습니다." };
    }
};