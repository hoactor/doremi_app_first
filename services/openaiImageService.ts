// services/openaiImageService.ts — Phase B: gpt-image-2 호출 래퍼
// generate(text→image) / edit(reference+mask→image) + reference 수집 + 비용 추정.
// imageGeneration.ts(Gemini)와 평등 위치. 모든 OpenAI 호출은 이 파일 통해서만.

import { invoke } from '@tauri-apps/api/core';
import type { GeneratedImage, OpenAIImageQuality, CharacterDescription } from '../types';
import { createGeneratedImage, resolveCharId } from '../appUtils';
import { DEFAULT_SCENE_LAYER_ID } from '../types/pipeline';
import { resolveImageUrl } from './tauriAdapter';

// ───────────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────────

export interface OpenAIGenerateOptions {
    prompt: string;
    size?: '1024x1024' | '1024x1536' | '1536x1024' | string;
    quality: OpenAIImageQuality;
    sourceCutNumber: string;
    n?: number;
    moderation?: 'auto' | 'low';
    artStyleLabel?: string;
}

export interface OpenAIEditOptions {
    prompt: string;
    /** 첫 이미지가 가장 high fidelity (캐릭터 reference 자리) */
    referenceImagesBase64: string[];
    maskBase64?: string;
    size?: string;
    quality: OpenAIImageQuality;
    sourceCutNumber: string;
    n?: number;
    inputFidelity?: 'low' | 'high';
    artStyleLabel?: string;
}

export interface OpenAIResponse {
    images: GeneratedImage[];
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
}

// ───────────────────────────────────────────────────────────────
// 비용 추정
// 가이드 단가: Image input $8/M, Image output $30/M (2026-04 기준, 콘솔 재확인 필수)
// ───────────────────────────────────────────────────────────────

export function estimateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * 8.0;
    const outputCost = (outputTokens / 1_000_000) * 30.0;
    return inputCost + outputCost;
}

// ───────────────────────────────────────────────────────────────
// 텍스트 → 이미지 (인서트 컷 / 캐릭터 없는 컷)
// ───────────────────────────────────────────────────────────────

export async function generateWithGptImage2(opts: OpenAIGenerateOptions): Promise<OpenAIResponse> {
    const result = await invoke<{
        images_base64: string[];
        output_tokens: number;
        input_tokens: number;
    }>('proxy_openai_image_generate', {
        request: {
            prompt: opts.prompt,
            size: opts.size ?? '1024x1024',
            quality: opts.quality,
            n: opts.n ?? 1,
            output_format: 'png',
            moderation: opts.moderation ?? 'auto',
        },
    });

    const images = result.images_base64.map(b64 =>
        createGeneratedImage({
            imageUrl: `data:image/png;base64,${b64}`,
            sourceCutNumber: opts.sourceCutNumber,
            prompt: opts.prompt,
            engine: 'gpt-image-2',
            tag: 'normal',
            openaiQuality: opts.quality,
            artStyleLabel: opts.artStyleLabel,
        })
    );

    return {
        images,
        inputTokens: result.input_tokens,
        outputTokens: result.output_tokens,
        estimatedCostUsd: estimateCost(result.input_tokens, result.output_tokens),
    };
}

// ───────────────────────────────────────────────────────────────
// 레퍼런스 + 선택적 마스크 → 이미지 (캐릭터 일관성)
// ───────────────────────────────────────────────────────────────

export async function editWithGptImage2(opts: OpenAIEditOptions): Promise<OpenAIResponse> {
    const result = await invoke<{
        images_base64: string[];
        output_tokens: number;
        input_tokens: number;
    }>('proxy_openai_image_edit', {
        request: {
            prompt: opts.prompt,
            size: opts.size ?? '1024x1024',
            quality: opts.quality,
            images_base64: opts.referenceImagesBase64,
            mask_base64: opts.maskBase64,
            n: opts.n ?? 1,
            input_fidelity: opts.inputFidelity,
        },
    });

    const images = result.images_base64.map(b64 =>
        createGeneratedImage({
            imageUrl: `data:image/png;base64,${b64}`,
            sourceCutNumber: opts.sourceCutNumber,
            prompt: opts.prompt,
            engine: 'gpt-image-2',
            tag: 'normal',
            openaiQuality: opts.quality,
            artStyleLabel: opts.artStyleLabel,
        })
    );

    return {
        images,
        inputTokens: result.input_tokens,
        outputTokens: result.output_tokens,
        estimatedCostUsd: estimateCost(result.input_tokens, result.output_tokens),
    };
}

// ───────────────────────────────────────────────────────────────
// 캐릭터 reference 수집 (배경 풍부한 에셋 우선)
// ───────────────────────────────────────────────────────────────

/**
 * 캐릭터의 reference 이미지 URL/path 선택.
 * 사용자 통찰: 배경 풍부한 이미지가 화풍/분위기 anchor 역할까지 함.
 * 흰 배경 transparent는 fallback (화풍 흔들림 위험).
 */
export function pickBestCharacterReferenceUrl(
    char: CharacterDescription,
    sceneLayerId: string | undefined,
): string | undefined {
    // 1순위: variant 시트 (회상/과거 시점)
    if (sceneLayerId && sceneLayerId !== DEFAULT_SCENE_LAYER_ID && char.variants) {
        const variant = char.variants.find(v => v.appliedToLayerId === sceneLayerId);
        if (variant?.characterSheetUrl) return variant.characterSheetUrl;
    }
    // 2순위 (★ 신규): 사용자가 캐릭터 모달에서 에셋으로 직접 적용한 이미지
    //   에셋 적용 시 char.sourceImageUrl에 저장됨 (CharacterStudio.tsx:147,149)
    //   이게 가장 최신의 사용자 의도. char.images[0]보다 우선.
    if ((char as any).sourceImageUrl) return (char as any).sourceImageUrl;
    // 3순위: 자동 생성 시트 (컨텍스트 풍부)
    if (char.images && char.images.length > 0 && char.images[0].url) {
        return char.images[0].url;
    }
    // 4순위: a포즈 (배경 있을 가능성)
    if (char.aPoseImageUrl) return char.aPoseImageUrl;
    // 5순위: 마네킹
    if (char.mannequinImageUrl) return char.mannequinImageUrl;
    // 6순위: transparentImageUrl (배경 제거 — fallback only)
    if (char.transparentImageUrl) return char.transparentImageUrl;
    return undefined;
}

/**
 * 등장 인물들의 reference 이미지를 base64로 수집 (최대 5명, gpt-image-2 high fidelity 한계).
 * resolveImageUrl을 거쳐 Tauri 로컬 파일도 정상 처리.
 */
/**
 * 멀티 캐릭터 reference 매핑 정보. 프롬프트의 [Subject] 섹션에서
 * "Image N (character "X"): ..." 라벨링에 사용.
 * OpenAI cookbook 권장 패턴 (https://developers.openai.com/cookbook/.../image-gen-models-prompting-guide).
 */
export interface CharacterReferenceMapping {
    /** cut.characters에 있던 원본 키 (한국어 이름인 경우 많음) */
    rawKey: string;
    /** characterDescriptions에서 실제 매칭된 키 (canonicalName 등) */
    resolvedKey: string;
    /** 이 캐릭터의 reference 이미지가 첨부된 0-indexed 인덱스 */
    imageIndex: number;
}

export async function collectCharacterReferences(
    characterDescriptions: { [key: string]: CharacterDescription },
    characterKeys: string[],
    sceneLayerId: string | undefined,
): Promise<{ base64Images: string[]; mapping: CharacterReferenceMapping[] }> {
    const refs: string[] = [];
    const mapping: CharacterReferenceMapping[] = [];
    // OpenAI 공식: gpt-image-2 최대 16장 reference 가능. 도레미썰 운영상 5명이면 충분.
    for (const rawKey of characterKeys.slice(0, 5)) {
        // ★ 한국어 이름 / canonicalName / aliases 모두 수용 (cut.characters는 koreanName인 경우 많음)
        const resolvedKey = resolveCharId(rawKey, characterDescriptions) ?? rawKey;
        const char = characterDescriptions[resolvedKey];
        if (!char) {
            console.warn(`[OpenAI ref] character not found: "${rawKey}" (resolved: "${resolvedKey}")`);
            continue;
        }
        const url = pickBestCharacterReferenceUrl(char, sceneLayerId);
        if (!url) {
            console.warn(`[OpenAI ref] no image for character: "${rawKey}" (key: "${resolvedKey}")`);
            continue;
        }
        const b64 = await urlToBase64(url);
        if (!b64) continue;
        refs.push(b64);
        mapping.push({
            rawKey,
            resolvedKey,
            imageIndex: refs.length - 1,
        });
    }
    return { base64Images: refs, mapping };
}

/**
 * URL → base64 추출.
 * - data:URL: 헤더 제거 후 base64 부분만
 * - 로컬 path: resolveImageUrl(Tauri: read_image_base64)로 data:URL 변환 후 추출
 * - http(s)/blob: fetch → blob → readAsDataURL
 */
/**
 * Phase B v3 Stage 1: 배치 anchor 이미지를 base64로 변환.
 * 외부에서 호출 가능 (appGenerationActions의 Context 분기에서 사용).
 */
export async function urlToBase64Public(url: string): Promise<string | null> {
    return urlToBase64(url);
}

async function urlToBase64(url: string): Promise<string | null> {
    try {
        // resolveImageUrl이 로컬 path는 data:URL로, 그 외는 그대로 반환
        const resolved = await resolveImageUrl(url);
        if (resolved.startsWith('data:')) {
            return resolved.split(',')[1] ?? null;
        }
        // http(s)/blob: fetch → base64
        const resp = await fetch(resolved);
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
    } catch (err) {
        console.warn('[urlToBase64] failed:', url.slice(0, 80), err);
        return null;
    }
}
