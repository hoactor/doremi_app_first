/**
 * falService.ts — fal.ai Flux API 클라이언트
 *
 * imageGeneration.ts (Gemini)와 병행 운영되는 Flux 전용 서비스.
 * 기존 Gemini 코드는 일절 수정하지 않음.
 *
 * fal CDN URL은 임시 → 반환 즉시 base64 변환 필수.
 * base64 data URL은 fal.storage.upload로 업로드 후 URL 전달 필수 (ValidationError 방지).
 *
 * ★ FLUX.2 Pro/Flex/LoRA vs FLUX.1 General 파라미터 차이:
 *   FLUX.2 Pro/Flex: zero-config (num_inference_steps/guidance_scale/strength 없음)
 *           /edit 엔드포인트: image_urls (배열), reference_image_url 없음
 *           txt2img: prompt, image_size, seed, output_format, enable_safety_checker
 *   FLUX.2 LoRA (fal-ai/flux-2/lora): FLUX.2 기반이지만 loras 파라미터 지원
 *           /edit 엔드포인트: image_urls (배열) + loras 지원
 *   FLUX.1 General: 전통적 파라미터 (num_inference_steps, guidance_scale, strength 지원)
 *           /image-to-image 엔드포인트: image_url (단수), reference_image_url 지원
 *           LoRA, ControlNet 지원
 */

import { fal } from "@fal-ai/client";
import { getFalApiKey } from './tauriAdapter';

// ─── 초기화 ─────────────────────────────────────────────────────

let initialized = false;

export async function initFalClient(): Promise<void> {
    if (initialized) return;
    const key = await getFalApiKey();
    if (!key) {
        throw new Error('fal.ai API 키가 설정되지 않았습니다. 설정 > API 키에서 입력해주세요.');
    }
    fal.config({ credentials: key });
    initialized = true;
}

/** 초기화 상태 리셋 (API 키 변경 시) */
export function resetFalClient(): void {
    initialized = false;
}

// ─── 재시도 래퍼 ─────────────────────────────────────────────────

async function falRequestWithRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3
): Promise<T> {
    let attempt = 0;
    while (attempt < maxAttempts) {
        try {
            return await fn();
        } catch (error: any) {
            attempt++;
            const msg = error.message || String(error);
            const isValidation = msg.includes('ValidationError') || msg.includes('422') || msg.includes('validation');
            const isRetryable = !isValidation && (msg.includes('500') || msg.includes('503')
                || msg.includes('429') || msg.includes('timeout')
                || msg.includes('ECONNRESET'));

            if (isRetryable && attempt < maxAttempts) {
                const delay = 2000 * attempt;
                console.warn(`[falService] Retry ${attempt}/${maxAttempts} after ${delay}ms:`, msg);
                await new Promise(r => setTimeout(r, delay));
            } else {
                if (msg.includes('401') || msg.includes('403')) {
                    throw new Error('fal.ai API 키가 유효하지 않습니다. 설정에서 확인해주세요.');
                }
                if (msg.includes('402') || msg.includes('payment')) {
                    throw new Error('fal.ai 크레딧이 부족합니다. 결제 정보를 확인해주세요.');
                }
                if (msg.includes('429')) {
                    throw new Error('fal.ai 요청 한도 초과. 잠시 후 다시 시도해주세요.');
                }
                throw new Error(`Flux 이미지 생성 실패: ${msg.slice(0, 200)}`);
            }
        }
    }
    throw new Error('Flux 최대 재시도 횟수 초과');
}

// ─── 유틸: fal CDN URL → base64 data URL 변환 ───────────────────

export async function falUrlToDataUrl(url: string): Promise<string> {
    let res: Response;
    try {
        res = await fetch(url);
    } catch (e) {
        throw new Error('Flux 이미지 다운로드 실패. CDN URL이 만료되었을 수 있습니다.');
    }
    if (!res.ok) {
        throw new Error(`Flux 이미지 다운로드 실패 (${res.status})`);
    }
    const blob = await res.blob();
    if (blob.size < 1000) {
        throw new Error('Flux가 빈 이미지를 반환했습니다.');
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/** fal.subscribe 결과에서 이미지 URL 추출 (응답 구조 자동 감지) */
function extractImageUrl(result: any): string {
    const data = result?.data ?? result;
    const images = data?.images ?? data?.output?.images;
    const url = images?.[0]?.url ?? images?.[0];

    console.log('[falService] 응답 구조:', JSON.stringify({
        hasData: !!result?.data,
        hasImages: !!images,
        imageCount: images?.length,
        firstImageType: typeof images?.[0],
        extractedUrl: url ? url.substring(0, 80) + '...' : null,
    }));

    if (!url) {
        console.error('[falService] 이미지 URL 추출 실패. 전체 응답:', JSON.stringify(result).substring(0, 500));
        throw new Error('Flux 응답에서 이미지를 찾을 수 없습니다');
    }
    return url;
}

// ─── 유틸: base64 data URL → fal CDN URL 변환 ───────────────────

async function prepareImageUrl(dataUrl: string): Promise<string> {
    if (dataUrl.startsWith('http')) return dataUrl;
    try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], 'image.png', { type: blob.type || 'image/png' });
        const uploadedUrl = await fal.storage.upload(file);
        return uploadedUrl;
    } catch (e: any) {
        console.error('[falService] 이미지 업로드 실패:', e);
        throw new Error(`이미지 업로드에 실패했습니다: ${e?.message || '알 수 없는 오류'}`);
    }
}

// ─── 유틸: 이미지 비율 → Flux image_size 변환 ───────────────────

export function getFluxImageSize(imageRatio: string): { width: number; height: number } {
    switch (imageRatio) {
        case '9:16': return { width: 768, height: 1344 };
        case '16:9': return { width: 1344, height: 768 };
        case '1:1':  return { width: 1024, height: 1024 };
        case '3:4':  return { width: 768, height: 1024 };
        case '4:3':  return { width: 1024, height: 768 };
        default:     return { width: 768, height: 1344 };
    }
}

// ─── 유틸: endpoint 경로 결정 ────────────────────────────────────

/** 베이스 모델명 → 편집용 엔드포인트 자동 결정 */
function resolveEditEndpoint(baseEndpoint: string): string {
    // 이미 /edit 또는 /image-to-image가 포함되어 있으면 그대로
    if (baseEndpoint.includes('/edit') || baseEndpoint.includes('/image-to-image')) {
        return baseEndpoint;
    }
    // FLUX.2 (Pro/Flex/LoRA) → /edit, FLUX.1 → /image-to-image
    return baseEndpoint + (isFlux2Endpoint(baseEndpoint) ? '/edit' : '/image-to-image');
}

/** FLUX.2 계열 판정 (flux-2-pro, flux-2-flex, flux-2/lora 포함) */
function isFlux2Endpoint(endpoint: string): boolean {
    return endpoint.includes('flux-2');
}

/** FLUX.2 LoRA 판정 — loras 파라미터 허용 */
function isFluxLoraEndpoint(endpoint: string): boolean {
    return endpoint.includes('flux-2/lora');
}

// ─── 핵심: img2img 편집 ─────────────────────────────────────────

export async function editImageWithFlux(
    baseImageUrl: string,
    prompt: string,
    options?: {
        referenceImageUrls?: string[];
        loraUrls?: { path: string; scale: number }[];
        controlImageUrl?: string;
        controlMode?: 'canny' | 'depth' | 'pose';
        strength?: number;
        seed?: number;
        imageSize?: { width: number; height: number };
        endpoint?: string;
    }
): Promise<{ imageUrl: string; textResponse: string; tokenCount: number }> {
    await initFalClient();

    const baseEndpoint = options?.endpoint || 'fal-ai/flux-2-pro';
    const isFlux2 = isFlux2Endpoint(baseEndpoint);
    const isLora = isFluxLoraEndpoint(baseEndpoint);
    const endpoint = resolveEditEndpoint(baseEndpoint);
    const uploadedBaseUrl = await prepareImageUrl(baseImageUrl);

    let input: any;

    if (isFlux2) {
        // ★ FLUX.2 Pro/Flex/LoRA: zero-config, image_urls (배열)
        input = {
            prompt,
            image_urls: [uploadedBaseUrl],
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            output_format: "png",
            safety_tolerance: "5",
        };
        if (!isLora) input.prompt_upsampling = false;   // ★ 프롬프트 자동확장 OFF → 인물 일관성 보호
        if (options?.seed != null) input.seed = options.seed;

        // LoRA: FLUX.2 LoRA 엔드포인트만 지원
        if (isLora && options?.loraUrls?.length) {
            input.loras = options.loraUrls;
        }
    } else {
        // ★ FLUX.1 General: 전통적 파라미터
        input = {
            prompt,
            image_url: uploadedBaseUrl,
            strength: options?.strength ?? 0.75,
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            enable_safety_checker: false,
        };

        // LoRA: FLUX.1도 지원
        if (options?.loraUrls?.length) {
            input.loras = options.loraUrls;
        }

        // ControlNet: FLUX.1만 지원
        if (options?.controlImageUrl && options?.controlMode) {
            const uploadedControl = await prepareImageUrl(options.controlImageUrl);
            input.controlnet_unions = [{
                control_image_url: uploadedControl,
                conditioning_scale: 0.7,
                control_mode: options.controlMode,
            }];
        }

        // reference_image_url: FLUX.1만 지원
        if (options?.referenceImageUrls?.length) {
            const uploadedRef = await prepareImageUrl(options.referenceImageUrls[0]);
            input.reference_image_url = uploadedRef;
            input.reference_strength = 0.6;
        }
    }

    console.log(`[falService] editImageWithFlux → ${endpoint} (isFlux2=${isFlux2}, isLora=${isLora})`, JSON.stringify(input, null, 2));
    const result = await falRequestWithRetry(() =>
        fal.subscribe(endpoint, { input })
    );
    const imgUrl = extractImageUrl(result);
    const dataUrl = await falUrlToDataUrl(imgUrl);

    return { imageUrl: dataUrl, textResponse: '', tokenCount: 0 };
}

// ─── txt2img 생성 ───────────────────────────────────────────────

export async function generateImageWithFlux(
    prompt: string,
    options?: {
        referenceImageUrls?: string[];
        loraUrls?: { path: string; scale: number }[];
        seed?: number;
        imageSize?: { width: number; height: number };
        endpoint?: string;
    }
): Promise<{ imageUrl: string; textResponse: string; tokenCount: number }> {
    await initFalClient();

    const endpoint = options?.endpoint || 'fal-ai/flux-2-pro';
    const isFlux2 = isFlux2Endpoint(endpoint);
    const isLora = isFluxLoraEndpoint(endpoint);

    let input: any;

    if (isFlux2) {
        // ★ FLUX.2: zero-config
        input = {
            prompt,
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            safety_tolerance: "5",
        };
        if (!isLora) input.prompt_upsampling = false;   // ★ 프롬프트 자동확장 OFF → 인물 일관성 보호

        // LoRA: FLUX.2 LoRA 엔드포인트만 지원
        if (isLora && options?.loraUrls?.length) {
            input.loras = options.loraUrls;
        }
    } else {
        // ★ FLUX.1: 전통적 파라미터
        input = {
            prompt,
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            enable_safety_checker: false,
        };

        if (options?.loraUrls?.length) {
            input.loras = options.loraUrls;
        }

        if (options?.referenceImageUrls?.length) {
            const uploadedRef = await prepareImageUrl(options.referenceImageUrls[0]);
            input.reference_image_url = uploadedRef;
            input.reference_strength = 0.6;
        }
    }

    console.log(`[falService] generateImageWithFlux → ${endpoint} (isFlux2=${isFlux2}, isLora=${isLora})`);
    const result = await falRequestWithRetry(() =>
        fal.subscribe(endpoint, { input })
    );
    const imgUrl = extractImageUrl(result);
    const dataUrl = await falUrlToDataUrl(imgUrl);

    return { imageUrl: dataUrl, textResponse: '', tokenCount: 0 };
}

// ─── 다중 캐릭터 (참조 이미지) ──────────────────────────────────

export async function generateMultiCharWithFlux(
    prompt: string,
    referenceImageUrls: string[],
    options?: {
        loraUrls?: { path: string; scale: number }[];
        seed?: number;
        imageSize?: { width: number; height: number };
        endpoint?: string;
    }
): Promise<{ imageUrl: string; textResponse: string; tokenCount: number }> {
    await initFalClient();

    const endpoint = options?.endpoint || 'fal-ai/flux-2-flex';
    const isFlux2 = isFlux2Endpoint(endpoint);
    const isLora = isFluxLoraEndpoint(endpoint);

    let input: any;

    if (isFlux2) {
        // ★ FLUX.2: 참조 이미지를 /edit의 image_urls로 전달
        const editEndpoint = resolveEditEndpoint(endpoint);
        // fal.ai API 제한: Pro ≤ 4장, Flex ≤ 10장 — 안전 마진으로 4장 통일
        const MAX_REFS = 4;
        const limitedRefs = referenceImageUrls.slice(0, MAX_REFS);
        if (referenceImageUrls.length > MAX_REFS) {
            console.warn(`[falService] 레퍼런스 ${referenceImageUrls.length}장 → ${MAX_REFS}장으로 제한`);
        }
        const uploadedRefs: string[] = [];
        for (const url of limitedRefs) {
            uploadedRefs.push(await prepareImageUrl(url));
        }

        input = {
            prompt,
            image_urls: uploadedRefs,
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            safety_tolerance: "5",
        };
        if (!isLora) input.prompt_upsampling = false;   // ★ 프롬프트 자동확장 OFF → 인물 일관성 보호

        // LoRA: FLUX.2 LoRA 엔드포인트만 지원
        if (isLora && options?.loraUrls?.length) {
            input.loras = options.loraUrls;
        }

        console.log(`[falService] generateMultiCharWithFlux → ${editEndpoint} (isFlux2=${isFlux2}, isLora=${isLora}, refs=${uploadedRefs.length})`);
        const result = await falRequestWithRetry(() =>
            fal.subscribe(editEndpoint, { input })
        );
        const imgUrl = extractImageUrl(result);
        const dataUrl = await falUrlToDataUrl(imgUrl);
        return { imageUrl: dataUrl, textResponse: '', tokenCount: 0 };
    } else {
        // ★ FLUX.1: reference_image_url 사용
        input = {
            prompt,
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            enable_safety_checker: false,
        };

        if (options?.loraUrls?.length) {
            input.loras = options.loraUrls;
        }

        if (referenceImageUrls.length > 0) {
            const uploadedRef = await prepareImageUrl(referenceImageUrls[0]);
            input.reference_image_url = uploadedRef;
            input.reference_strength = 0.6;
        }

        console.log(`[falService] generateMultiCharWithFlux → ${endpoint} (isFlux2=${isFlux2})`);
        const result = await falRequestWithRetry(() =>
            fal.subscribe(endpoint, { input })
        );
        const imgUrl = extractImageUrl(result);
        const dataUrl = await falUrlToDataUrl(imgUrl);
        return { imageUrl: dataUrl, textResponse: '', tokenCount: 0 };
    }
}

// ─── Phase 2-B 함수들 ───────────────────────────────────────────

export async function generateOutfitWithFlux(
    outfitDescription: string,
    options?: {
        seed?: number;
        imageSize?: { width: number; height: number };
        endpoint?: string;
    }
): Promise<{ imageUrl: string; tokenCount: number }> {
    await initFalClient();

    const endpoint = options?.endpoint || 'fal-ai/flux-2-pro';
    const isFlux2 = isFlux2Endpoint(endpoint);
    const prompt = `flat lay outfit photography, ${outfitDescription}, clean white background, top-down view, neatly arranged clothing items, fashion catalog style`;

    let input: any;

    if (isFlux2) {
        input = {
            prompt,
            image_size: options?.imageSize ?? { width: 1024, height: 1024 },
            seed: options?.seed,
            output_format: "png",
            safety_tolerance: "5",
            prompt_upsampling: false,   // ★ 프롬프트 자동확장 OFF → 인물 일관성 보호
        };
    } else {
        input = {
            prompt,
            image_size: options?.imageSize ?? { width: 1024, height: 1024 },
            seed: options?.seed,
            output_format: "png",
            enable_safety_checker: false,
        };
    }

    console.log(`[falService] generateOutfitWithFlux → ${endpoint}`);
    const result = await falRequestWithRetry(() =>
        fal.subscribe(endpoint, { input })
    );
    const imgUrl = extractImageUrl(result);
    const dataUrl = await falUrlToDataUrl(imgUrl);
    return { imageUrl: dataUrl, tokenCount: 0 };
}

export async function upscaleWithFlux(
    baseImageUrl: string,
    options?: {
        seed?: number;
        imageSize?: { width: number; height: number };
        endpoint?: string;
    }
): Promise<{ imageUrl: string; tokenCount: number }> {
    await initFalClient();

    const baseEndpoint = options?.endpoint || 'fal-ai/flux-2-pro';
    const isFlux2 = isFlux2Endpoint(baseEndpoint);
    const endpoint = resolveEditEndpoint(baseEndpoint);
    const uploadedBaseUrl = await prepareImageUrl(baseImageUrl);

    let input: any;

    if (isFlux2) {
        input = {
            prompt: "high resolution, masterpiece quality, detailed, sharp focus",
            image_urls: [uploadedBaseUrl],
            image_size: options?.imageSize ?? { width: 1344, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            safety_tolerance: "5",
        };
    } else {
        input = {
            prompt: "high resolution, masterpiece quality, detailed, sharp focus",
            image_url: uploadedBaseUrl,
            strength: 0.3,
            image_size: options?.imageSize ?? { width: 1344, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            enable_safety_checker: false,
        };
    }

    console.log(`[falService] upscaleWithFlux → ${endpoint}`);
    const result = await falRequestWithRetry(() =>
        fal.subscribe(endpoint, { input })
    );
    const imgUrl = extractImageUrl(result);
    const dataUrl = await falUrlToDataUrl(imgUrl);
    return { imageUrl: dataUrl, tokenCount: 0 };
}

export async function replaceBackgroundWithFlux(
    baseImageUrl: string,
    newBackgroundPrompt: string,
    options?: {
        strength?: number;
        seed?: number;
        imageSize?: { width: number; height: number };
        endpoint?: string;
    }
): Promise<{ imageUrl: string; tokenCount: number }> {
    await initFalClient();

    const baseEndpoint = options?.endpoint || 'fal-ai/flux-2-pro';
    const isFlux2 = isFlux2Endpoint(baseEndpoint);
    const endpoint = resolveEditEndpoint(baseEndpoint);
    const uploadedBaseUrl = await prepareImageUrl(baseImageUrl);
    const prompt = `same character in foreground, ${newBackgroundPrompt}, background replacement`;

    let input: any;

    if (isFlux2) {
        input = {
            prompt,
            image_urls: [uploadedBaseUrl],
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            safety_tolerance: "5",
        };
    } else {
        input = {
            prompt,
            image_url: uploadedBaseUrl,
            strength: options?.strength ?? 0.6,
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            enable_safety_checker: false,
        };
    }

    console.log(`[falService] replaceBackgroundWithFlux → ${endpoint}`);
    const result = await falRequestWithRetry(() =>
        fal.subscribe(endpoint, { input })
    );
    const imgUrl = extractImageUrl(result);
    const dataUrl = await falUrlToDataUrl(imgUrl);
    return { imageUrl: dataUrl, tokenCount: 0 };
}

export async function adjustPoseWithFlux(
    sourceImageUrl: string,
    prompt: string,
    options?: {
        controlImageUrl?: string;
        referenceImageUrls?: string[];
        referenceStrength?: number;
        strength?: number;
        seed?: number;
        imageSize?: { width: number; height: number };
        endpoint?: string;
    }
): Promise<{ imageUrl: string; tokenCount: number }> {
    await initFalClient();

    const baseEndpoint = options?.endpoint || 'fal-ai/flux-2-pro';
    const isFlux2 = isFlux2Endpoint(baseEndpoint);
    const endpoint = resolveEditEndpoint(baseEndpoint);
    const uploadedSourceUrl = await prepareImageUrl(sourceImageUrl);

    let input: any;

    if (isFlux2) {
        // ★ FLUX.2: image_urls에 소스 + 참조 이미지 모두 포함
        const imageUrls = [uploadedSourceUrl];
        if (options?.referenceImageUrls?.length) {
            for (const url of options.referenceImageUrls) {
                imageUrls.push(await prepareImageUrl(url));
            }
        }

        input = {
            prompt,
            image_urls: imageUrls,
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            safety_tolerance: "5",
        };
    } else {
        // ★ FLUX.1: 전통적 파라미터
        input = {
            prompt,
            image_url: uploadedSourceUrl,
            strength: options?.strength ?? 0.7,
            image_size: options?.imageSize ?? { width: 768, height: 1344 },
            seed: options?.seed,
            output_format: "png",
            enable_safety_checker: false,
        };

        // ControlNet: FLUX.1만 지원
        if (options?.controlImageUrl) {
            const uploadedControl = await prepareImageUrl(options.controlImageUrl);
            input.controlnet_unions = [{
                control_image_url: uploadedControl,
                conditioning_scale: 0.7,
                control_mode: "pose",
            }];
        }

        // reference_image_url: FLUX.1만 지원
        if (options?.referenceImageUrls?.length) {
            const uploadedRef = await prepareImageUrl(options.referenceImageUrls[0]);
            input.reference_image_url = uploadedRef;
            input.reference_strength = options?.referenceStrength ?? 0.8;
        }
    }

    console.log(`[falService] adjustPoseWithFlux → ${endpoint} (isFlux2=${isFlux2})`);
    const result = await falRequestWithRetry(() =>
        fal.subscribe(endpoint, { input })
    );
    const imgUrl = extractImageUrl(result);
    const dataUrl = await falUrlToDataUrl(imgUrl);
    return { imageUrl: dataUrl, tokenCount: 0 };
}

// ─── ESRGAN 업스케일 ────────────────────────────────────────────

/**
 * ESRGAN 업스케일 — fal-ai/esrgan (anime 모델)
 * @param imageUrl - 업스케일할 이미지 URL 또는 data URL
 * @param scale - 2 또는 4 (기본 2)
 * @returns 업스케일된 이미지 data URL
 * 가격: ~$0.001~0.003/장 (초당 $0.00111)
 */
export async function upscaleImageWithESRGAN(
    imageUrl: string,
    scale: 2 | 4 = 2
): Promise<string> {
    await initFalClient();

    const inputUrl = await prepareImageUrl(imageUrl);

    const result = await falRequestWithRetry(() =>
        fal.subscribe('fal-ai/esrgan', {
            input: {
                image_url: inputUrl,
                scale: scale,
                model: 'RealESRGAN_x4plus_anime_6B',
                output_format: 'png',
            },
        })
    );

    const data = (result as any)?.data ?? result;
    const outputUrl = data?.image?.url || data?.output?.url;
    if (!outputUrl) throw new Error('ESRGAN: 응답에서 이미지 URL을 찾을 수 없습니다');

    return await falUrlToDataUrl(outputUrl);
}
