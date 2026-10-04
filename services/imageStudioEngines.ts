// services/imageStudioEngines.ts — Phase A.7: 통합 이미지 스튜디오 엔진 어댑터
// Gemini (Nano) + Flux (fal.ai) + OpenAI (gpt-image-2 / DALL-E 3) 3엔진을
// 단일 진입점으로 흡수. UnifiedImageStudio가 호출하는 추상 레이어.
//
// 각 엔진의 시그니처 차이 (Gemini 트리플 프롬프트, Flux size/seed, OpenAI quality enum)를
// 어댑터가 흡수. 엔진 전용 옵션은 EngineOptions로 받음.

import { editImageWithNano, generateOutfitImage } from './ai/imageGeneration';
import { editImageWithFlux, generateImageWithFlux, getFluxEndpoint } from './falService';
import { editWithGptImage2, generateWithGptImage2 } from './openaiImageService';
import { generateImageWithDalle } from './openaiService';
import { composePromptWithStyle, getStyleBlockById } from './openaiStyleRegistry';
import type { ImageRatio, OpenAIImageQuality, NanoModel, FluxModel } from '../types';
import type { DalleAssetType } from './openaiService';

export type StudioEngine = 'gemini' | 'flux' | 'openai-gpt2' | 'openai-dalle3';

/** 공통 입력 — 텍스트→이미지 (생성 모드) */
export interface StudioGenerateInput {
    prompt: string;
    ratio: ImageRatio;
    /** Gemini 화풍 프롬프트 (옵션) */
    artStylePrompt?: string;
    /** Gemini 모델 (기본 nano-3.1) */
    geminiModel?: NanoModel;
    /** Flux 모델 (미지정 시 호환 폴백인 flux-2-flex) */
    fluxModel?: FluxModel;
    /** OpenAI quality */
    openaiQuality?: OpenAIImageQuality;
    /** DALL-E 3 assetType (size 결정에 영향) */
    dalleAssetType?: DalleAssetType;
    /** DALL-E 3 화풍 프리셋 ID — 미지정 시 레지스트리 defaultStyleId 사용 */
    dalleStyleId?: string;
    /** 시드 (Gemini/Flux) */
    seed?: number;
    /** 결과 식별용 (히스토리 라벨링) */
    sourceLabel?: string;
}

/** 공통 입력 — 이미지+텍스트→이미지 (편집 모드) */
export interface StudioEditInput extends StudioGenerateInput {
    /** 편집 대상 base 이미지 (data:URL 또는 http(s)) */
    baseImage: string;
    /** 추가 reference 이미지들 (max 5) */
    references?: string[];
    /** 마스크 (인페인팅용, base64만, prefix 제외) */
    maskBase64?: string;
}

/** 공통 출력 */
export interface StudioOutput {
    /** data:image/png;base64,... 또는 외부 URL */
    imageUrl: string;
    /** 토큰/비용 메타 (엔진별 다름) */
    metadata: {
        engine: StudioEngine;
        tokenCount?: number;
        estimatedCostUsd?: number;
        revisedPrompt?: string; // DALL-E 3 / OpenAI가 다듬은 프롬프트
    };
}

// ───────────────────────────────────────────────────────────────
// 헬퍼: ImageRatio → Flux 사이즈
// ───────────────────────────────────────────────────────────────

function ratioToFluxSize(ratio: ImageRatio): { width: number; height: number } {
    if (ratio === '9:16') return { width: 768, height: 1344 };
    if (ratio === '16:9') return { width: 1344, height: 768 };
    return { width: 1024, height: 1024 };
}

function ratioToOpenAiSize(ratio: ImageRatio): '1024x1024' | '1024x1536' | '1536x1024' {
    if (ratio === '9:16') return '1024x1536';
    if (ratio === '16:9') return '1536x1024';
    return '1024x1024';
}

// ───────────────────────────────────────────────────────────────
// 생성 (텍스트 → 이미지)
// ───────────────────────────────────────────────────────────────

export async function studioGenerate(
    engine: StudioEngine,
    input: StudioGenerateInput,
): Promise<StudioOutput> {
    if (engine === 'gemini') {
        // Gemini: generateOutfitImage가 가장 단순한 텍스트→이미지 (외형 묘사 기반).
        // 사용자가 자유 입력 시 같은 함수로 사용 가능.
        const model = input.geminiModel || 'nano-3.1';
        const result = await generateOutfitImage(input.prompt, model, input.seed, input.ratio);
        return {
            imageUrl: result.imageUrl,
            metadata: { engine, tokenCount: result.tokenCount },
        };
    }

    if (engine === 'flux') {
        const result = await generateImageWithFlux(input.prompt, {
            seed: input.seed,
            imageSize: ratioToFluxSize(input.ratio),
            endpoint: getFluxEndpoint(input.fluxModel),
        });
        return {
            imageUrl: result.imageUrl,
            metadata: { engine, tokenCount: result.tokenCount },
        };
    }

    if (engine === 'openai-gpt2') {
        // 사용자가 화풍을 명시 선택한 경우만 합치기. 미선택이면 raw prompt 그대로 (기존 동작).
        const finalPrompt = input.dalleStyleId
            ? composePromptWithStyle(input.prompt, await getStyleBlockById(input.dalleStyleId))
            : input.prompt;
        const result = await generateWithGptImage2({
            prompt: finalPrompt,
            quality: input.openaiQuality || 'medium',
            sourceCutNumber: input.sourceLabel || 'studio',
            size: ratioToOpenAiSize(input.ratio),
            n: 1,
        });
        const first = result.images[0];
        if (!first) throw new Error('OpenAI 응답에 이미지가 없습니다');
        return {
            imageUrl: first.imageUrl,
            metadata: {
                engine,
                tokenCount: result.inputTokens + result.outputTokens,
                estimatedCostUsd: result.estimatedCostUsd,
            },
        };
    }

    if (engine === 'openai-dalle3') {
        // 명시 선택 시만 합치기. 미선택이면 raw prompt 그대로 (기존 직접 입력 흐름 유지).
        const finalPrompt = input.dalleStyleId
            ? composePromptWithStyle(input.prompt, await getStyleBlockById(input.dalleStyleId))
            : input.prompt;
        const result = await generateImageWithDalle({
            prompt: finalPrompt,
            assetType: input.dalleAssetType || 'character',
            ratio: input.ratio,
            quality: 'hd',
            style: 'vivid',
        });
        return {
            imageUrl: result.imageUrl,
            metadata: { engine, revisedPrompt: result.revisedPrompt },
        };
    }

    throw new Error(`Unsupported engine: ${engine}`);
}

// ───────────────────────────────────────────────────────────────
// 편집 (이미지 + 텍스트 → 이미지)
// ───────────────────────────────────────────────────────────────

export async function studioEdit(
    engine: StudioEngine,
    input: StudioEditInput,
): Promise<StudioOutput> {
    if (engine === 'gemini') {
        const model = input.geminiModel || 'nano-3.1';
        const result = await editImageWithNano(
            input.baseImage,
            input.prompt,                       // editPrompt
            input.sourceLabel || '',            // originalPrompt (라벨)
            input.artStylePrompt || '',         // artStylePrompt
            model,
            input.references || [],
            input.maskBase64,
            undefined,                          // masterStyleImageUrl
            input.seed,
            false,                              // isCreativeGeneration
            input.ratio,
        );
        return {
            imageUrl: result.imageUrl,
            metadata: { engine, tokenCount: result.tokenCount },
        };
    }

    if (engine === 'flux') {
        const result = await editImageWithFlux(input.baseImage, input.prompt, {
            referenceImageUrls: input.references,
            seed: input.seed,
            imageSize: ratioToFluxSize(input.ratio),
            endpoint: getFluxEndpoint(input.fluxModel),
        });
        return {
            imageUrl: result.imageUrl,
            metadata: { engine, tokenCount: result.tokenCount },
        };
    }

    if (engine === 'openai-gpt2') {
        // gpt-image-2 edit은 base + references를 모두 base64 배열로 받음.
        // baseImage는 첫 슬롯, references는 뒤이어 (캐릭터 reference 등).
        const allImages: string[] = [];
        const baseB64 = await dataUrlToBase64(input.baseImage);
        if (baseB64) allImages.push(baseB64);
        for (const ref of (input.references || [])) {
            const b64 = await dataUrlToBase64(ref);
            if (b64) allImages.push(b64);
        }

        const result = await editWithGptImage2({
            prompt: input.prompt,
            referenceImagesBase64: allImages,
            maskBase64: input.maskBase64,
            quality: input.openaiQuality || 'medium',
            sourceCutNumber: input.sourceLabel || 'studio',
            size: ratioToOpenAiSize(input.ratio),
            n: 1,
        });
        const first = result.images[0];
        if (!first) throw new Error('OpenAI 응답에 이미지가 없습니다');
        return {
            imageUrl: first.imageUrl,
            metadata: {
                engine,
                tokenCount: result.inputTokens + result.outputTokens,
                estimatedCostUsd: result.estimatedCostUsd,
            },
        };
    }

    if (engine === 'openai-dalle3') {
        // DALL-E 3는 편집 미지원. 호출 시 명시적 에러.
        throw new Error('DALL-E 3는 이미지 편집을 지원하지 않습니다. 다른 엔진을 선택해주세요.');
    }

    throw new Error(`Unsupported engine: ${engine}`);
}

// ───────────────────────────────────────────────────────────────
// 유틸
// ───────────────────────────────────────────────────────────────

/** data:image/...;base64,XXX 또는 base64 raw → base64 raw 반환. http(s)/blob은 fetch 필요 (현재 미지원). */
async function dataUrlToBase64(input: string): Promise<string | null> {
    if (!input) return null;
    if (input.startsWith('data:')) {
        const parts = input.split(',');
        return parts[1] || null;
    }
    // 이미 raw base64로 보이면 그대로
    if (/^[A-Za-z0-9+/=]+$/.test(input.slice(0, 100))) return input;
    // http(s)/blob: fetch
    try {
        const resp = await fetch(input);
        const blob = await resp.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1] ?? '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('[imageStudioEngines] dataUrlToBase64 실패:', e);
        return null;
    }
}

/** 엔진 사람 친화 이름 */
export function engineDisplayName(engine: StudioEngine): string {
    switch (engine) {
        case 'gemini': return 'Gemini Nano';
        case 'flux': return 'Flux';
        case 'openai-gpt2': return 'OpenAI gpt-image-2';
        case 'openai-dalle3': return 'OpenAI DALL-E 3';
    }
}

/** 편집 지원 엔진 (DALL-E 3 제외) */
export function engineSupportsEdit(engine: StudioEngine): boolean {
    return engine !== 'openai-dalle3';
}
