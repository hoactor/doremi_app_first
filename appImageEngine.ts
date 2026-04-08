// appImageEngine.ts — React 의존 제로
// 이미지 생성 루프 핵심 로직

import type { AppAction, Cut, GeneratedImage, GeneratedScript, CharacterDescription, ImageEngine } from './types';
import { editImageWithNano, generateMultiCharacterImage } from './services/geminiService';
import { IS_TAURI, getGeminiApiKey } from './services/tauriAdapter';
import { generateMultiCharWithFlux, generateImageWithFlux, getFluxImageSize } from './services/falService';
import { resolveCharId } from './appUtils';
import type { PromptContext } from './appStyleEngine';

// ─── editImageWithNano 재시도 래퍼 (순수 함수) ──────────────────────
export async function editImageWithRetry(
    baseImageUrl: string,
    editPrompt: string,
    originalPrompt: string,
    artStylePrompt: string,
    modelName: string,
    imageRatio: string,
    referenceImageUrls?: string[],
    maskBase64?: string,
    masterStyleImageUrl?: string,
    isCreativeGeneration: boolean = false,
): Promise<{ imageUrl: string; textResponse: string; tokenCount: number }> {
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-3.1-flash-image-preview') {
        const geminiKey = IS_TAURI ? await getGeminiApiKey() : (globalThis as any).process?.env?.API_KEY;
        if (!geminiKey) throw new Error('Gemini API key not configured');
    }

    let attempt = 0;
    const maxAttempts = 3;
    while (attempt < maxAttempts) {
        try {
            const res = await editImageWithNano(baseImageUrl, editPrompt, originalPrompt, artStylePrompt, modelName, referenceImageUrls, maskBase64, masterStyleImageUrl, undefined, isCreativeGeneration, imageRatio);
            return { imageUrl: res.imageUrl, textResponse: res.textResponse, tokenCount: res.tokenCount };
        } catch (error: any) {
            attempt++;
            const isServerError = error.message && (error.message.includes('500') || error.message.includes('503') || error.message.includes('429') || error.message.includes('Internal error') || error.message.includes('Service Unavailable') || error.message.includes('Too Many Requests'));
            if (isServerError && attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            } else { throw error; }
        }
    }
    throw new Error("Maximum retry attempts reached.");
}

// ─── 이미지 자동 생성 루프 (단일 컷) ─────────────────────────────────
export interface CutGenerationContext {
    characterDescriptions: { [key: string]: CharacterDescription };
    artStylePrompt: string;
    modelName: string;
    imageRatio: string;
    selectedNanoModel: string;
    sceneImageMap?: Map<string, string>; // location → 이미 생성된 같은 씬 이미지 URL (인서트 컷 스타일 참조용)
    engine?: ImageEngine;               // ★ 엔진 선택 (기본 'gemini')
    promptContext?: PromptContext;       // ★ Flux 프롬프트 빌더용 컨텍스트
    fluxModel?: string;                 // ★ Flux 모델명 (flux-pro, flux-flex, flux-lora)
    loraUrls?: { path: string; scale: number }[];  // ★ LoRA URL 목록
    fluxEndpoint?: string;              // ★ fal 엔드포인트 (fal-ai/flux-2-pro 등)
}

export async function generateImageForCut(
    cut: Cut,
    prompt: string,
    ctx: CutGenerationContext,
    editWithRetry: (base: string, prompt: string, orig: string, refs?: string[], mask?: string, master?: string, creative?: boolean, artOverride?: string) => Promise<{ imageUrl: string; textResponse: string; tokenCount: number }>,
): Promise<{ imageUrl: string; tokenCount: number }> {
    const { characterDescriptions, artStylePrompt, modelName, imageRatio, selectedNanoModel, sceneImageMap } = ctx;

    // 캐릭터 감지 — cut.characters는 charId 배열 (resolveCharId로 레거시 폴백)
    const presentCharKeys = cut.characters
        .map(charId => resolveCharId(charId, characterDescriptions))
        .filter((id): id is string => id !== null && !!characterDescriptions[id]);

    const charsToGenerate: { name: string; url: string }[] = [];
    for (let j = 0; j < presentCharKeys.length; j++) {
        const charId = presentCharKeys[j];
        const char = characterDescriptions[charId];
        const cutLocation = ('location' in cut ? (cut as any).location : '') || '';
        const ref = char.locationOutfitImages?.[cutLocation]?.imageUrl || char.mannequinImageUrl || char.upscaledImageUrl || (char.characterSheetHistory && char.characterSheetHistory[char.characterSheetHistory.length - 1]) || char.sourceImageUrl;
        if (ref) charsToGenerate.push({ name: char.koreanName || charId, url: ref });
    }
    if ((cut as any).guestCharacterUrl) {
        charsToGenerate.push({ name: (cut as any).guestCharacterName || 'Guest', url: (cut as any).guestCharacterUrl });
    }

    let resultImageUrl = '';
    let tokenCountUsed = 0;

    if (charsToGenerate.length >= 2) {
        if (ctx.engine === 'flux' && ctx.fluxModel === 'flux-lora') {
            // ★ Flux LoRA: txt2img 전용 — 참조 이미지 없이 프롬프트+LoRA만
            const fluxImageSize = getFluxImageSize(imageRatio);
            const res = await generateImageWithFlux(prompt, {
                loraUrls: ctx.loraUrls,
                imageSize: fluxImageSize,
                endpoint: ctx.fluxEndpoint || 'fal-ai/flux-2/lora',
            });
            resultImageUrl = res.imageUrl;
            tokenCountUsed = 1;
        } else if (ctx.engine === 'flux') {
            // ★ Flux Pro/Flex 다중 캐릭터: IP-Adapter 참조
            const fluxImageSize = getFluxImageSize(imageRatio);
            const refUrls = charsToGenerate.map(c => c.url);
            const res = await generateMultiCharWithFlux(prompt, refUrls, { imageSize: fluxImageSize });
            resultImageUrl = res.imageUrl;
            tokenCountUsed = 1;
        } else {
            const res = await generateMultiCharacterImage(prompt, charsToGenerate.slice(0, 3), artStylePrompt, modelName, undefined, undefined, imageRatio);
            resultImageUrl = res.imageUrl;
            tokenCountUsed = res.tokenCount;
        }
    } else if (charsToGenerate.length === 1) {
        if (ctx.engine === 'flux' && ctx.fluxModel === 'flux-lora') {
            // ★ Flux LoRA: txt2img 전용 — 레퍼런스 이미지 없이 프롬프트+LoRA로 생성
            const fluxImageSize = getFluxImageSize(imageRatio);
            const res = await generateImageWithFlux(prompt, {
                loraUrls: ctx.loraUrls,
                imageSize: fluxImageSize,
                endpoint: ctx.fluxEndpoint || 'fal-ai/flux-2/lora',
            });
            resultImageUrl = res.imageUrl;
            tokenCountUsed = 1;
        } else {
            const res = await editWithRetry(charsToGenerate[0].url, prompt, '', undefined, undefined, undefined, true, artStylePrompt);
            resultImageUrl = res.imageUrl;
            tokenCountUsed = res.tokenCount;
        }
    } else {
        // [인서트 컷] 캐릭터 없음 → 같은 씬 이미지를 스타일 레퍼런스로 활용
        if (ctx.engine === 'flux' && ctx.fluxModel === 'flux-lora') {
            // ★ Flux LoRA: txt2img 전용 — 인서트 컷도 프롬프트+LoRA로 생성
            const fluxImageSize = getFluxImageSize(imageRatio);
            const res = await generateImageWithFlux(prompt, {
                loraUrls: ctx.loraUrls,
                imageSize: fluxImageSize,
                endpoint: ctx.fluxEndpoint || 'fal-ai/flux-2/lora',
            });
            resultImageUrl = res.imageUrl;
            tokenCountUsed = 1;
        } else {
            const sceneStyleRef = sceneImageMap?.get(cut.location);
            const baseRef = sceneStyleRef || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
            const res = await editWithRetry(baseRef, prompt, '', undefined, undefined, undefined, true, artStylePrompt);
            resultImageUrl = res.imageUrl;
            tokenCountUsed = res.tokenCount;
        }
    }

    return { imageUrl: resultImageUrl, tokenCount: tokenCountUsed };
}
