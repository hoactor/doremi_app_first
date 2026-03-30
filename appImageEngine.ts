import { NanoModel } from './types';
import { editImageWithNano } from './services/geminiService';

// ── Vision model name resolver (extracted from AppContext.getVisionModelName) ──

export function getVisionModelName(selectedNanoModel: NanoModel): string {
    switch (selectedNanoModel) {
        case 'nano-3.1':
            return 'gemini-3.1-flash-image-preview';
        case 'nano-3pro':
            return 'gemini-3-pro-image-preview';
        case 'nano-2.5':
        default:
            return 'gemini-2.5-flash-image';
    }
}

// ── Retry wrapper for editImageWithNano (extracted from AppContext) ──

export interface EditImageRetryDeps {
    getArtStylePrompt: (overrideStyle?: any, overrideCustomText?: string) => string;
    getVisionModelName: () => string;
    handleAddUsage: (geminiTokens: number, dalleImages: number) => void;
}

export async function editImageWithNanoWithRetry(
    deps: EditImageRetryDeps,
    baseImageUrl: string,
    editPrompt: string,
    originalPrompt: string,
    referenceImageUrl?: string,
    maskBase64?: string,
    masterStyleImageUrl?: string,
    isCreativeGeneration: boolean = false,
    artStylePromptOverride?: string,
): Promise<{ imageUrl: string; textResponse: string; tokenCount: number }> {
    const artStylePrompt = artStylePromptOverride || deps.getArtStylePrompt();
    const modelName = deps.getVisionModelName();

    // Check for API key if using gemini-3-pro-image-preview or gemini-3.1-flash-image-preview
    if (modelName === 'gemini-3-pro-image-preview' || modelName === 'gemini-3.1-flash-image-preview') {
        if (!(await (window as any).aistudio.hasSelectedApiKey())) {
            await (window as any).aistudio.openSelectKey();
        }
    }

    let attempt = 0;
    const maxAttempts = 3;
    while (attempt < maxAttempts) {
        try {
            const res = await editImageWithNano(
                baseImageUrl, editPrompt, originalPrompt, artStylePrompt, modelName,
                referenceImageUrl, maskBase64, masterStyleImageUrl, undefined, isCreativeGeneration,
            );
            deps.handleAddUsage(res.tokenCount, 0);
            return { imageUrl: res.imageUrl, textResponse: res.textResponse, tokenCount: res.tokenCount };
        } catch (error: any) {
            attempt++;
            const isServerError = error.message && (
                error.message.includes('500') || error.message.includes('503') ||
                error.message.includes('429') || error.message.includes('Internal error') ||
                error.message.includes('Service Unavailable') || error.message.includes('Too Many Requests')
            );
            if (isServerError && attempt < maxAttempts) {
                console.warn(`[editImageWithNanoWithRetry] Server/Rate limit error encountered. Retrying attempt ${attempt} of ${maxAttempts}...`, error);
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            } else {
                throw error;
            }
        }
    }
    throw new Error("Maximum retry attempts reached.");
}
