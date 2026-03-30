
import { StudioSession, AppDataState, GeneratedImage, NanoModel } from './types';

// Factory for independent studio session objects
export const createInitialStudioSession = (): StudioSession => ({
    originalImage: null,
    currentImage: null,
    history: [],
    referenceImageUrl: null,
    editPrompt: '',
    zoom: 1,
    pan: { x: 0, y: 0 },
    sourceCutForNextEdit: null,
});

export const sanitizeState = (state: AppDataState): AppDataState => {
    const sanitized = JSON.parse(JSON.stringify(state)) as AppDataState;

    // Clean up global transient states
    sanitized.isLoading = false;
    sanitized.loadingMessage = '';
    sanitized.loadingMessageDetail = '';
    sanitized.isZipping = false;
    sanitized.zippingProgress = null;
    sanitized.isAutoGenerating = false;
    sanitized.isGeneratingSRT = false;
    sanitized.failedCutNumbers = [];

    // Clean up UI states that shouldn't persist across sessions
    sanitized.isAssetLibraryOpen = false;
    sanitized.isCutSplitterOpen = false;
    sanitized.backgroundReplacementTargetCutNumber = null;
    sanitized.backgroundReplacementSourceUrl = null;
    sanitized.guestSelectionTargetCutNumber = null;
    sanitized.cutToSplit = null;

    // Clean up character transient states
    if (sanitized.characterDescriptions) {
        Object.values(sanitized.characterDescriptions).forEach(char => {
            delete char.isEditingSheet;
            delete char.imageLoading;
            delete char.isRemovingBackground;
            delete char.isGeneratingAPose;
            delete char.isRegeneratingPrompt;
            delete char.isAutoGenerating;
            delete char.isRefiningAppearance;
            delete char.isGeneratingLocationOutfits;
        });
    }

    // Clean up cut transient states
    if (sanitized.generatedContent && sanitized.generatedContent.scenes) {
        sanitized.generatedContent.scenes.forEach(scene => {
            if (scene.cuts) {
                scene.cuts.forEach(cut => {
                    delete cut.imageLoading;
                    delete cut.isUpdatingIntent;
                    delete cut.isFormattingNarration;
                });
            }
        });
    }

    return sanitized;
};

// Derive the engine name from the selected nano model
export const getEngineFromModel = (model: NanoModel): 'nano' | 'nano-v3' => {
    return (model === 'nano-3pro' || model === 'nano-3.1') ? 'nano-v3' : 'nano';
};

// Create a GeneratedImage object with standard defaults
export const createGeneratedImage = (params: {
    imageUrl: string;
    sourceCutNumber: string;
    prompt: string;
    model: NanoModel;
}): GeneratedImage => ({
    id: window.crypto.randomUUID(),
    imageUrl: params.imageUrl,
    sourceCutNumber: params.sourceCutNumber,
    prompt: params.prompt,
    engine: getEngineFromModel(params.model),
    createdAt: new Date().toISOString(),
});
