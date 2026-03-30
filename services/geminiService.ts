// services/geminiService.ts — Re-export Hub
// DO NOT add logic here. Modify the actual source files in ./ai/

// ─── Text Analysis & Generation ───────────────────────────────────────────────
export {
    analyzeHairStyle,
    analyzeCharacterVisualDNA,
    analyzeCharacters,
    enrichScriptWithDirections,
    generateEditableStoryboard,
    normalizeScriptCuts,
    generateCinematicBlueprint,
    generateTitleSuggestions,
    generateOutfitsForLocations,
    regenerateOutfitDescription,
    regenerateImagePrompts,
    regenerateSceneFromModification,
    extractFieldsFromSceneDescription,
    regenerateSingleCutDraft,
    verifyAndEnrichCutPrompt,
    regenerateCutFieldsForCharacterChange,
    regenerateCutFieldsForIntentChange,
    purifyImagePromptForSafety,
    formatTextWithSemanticBreaks,
    formatMultipleTextsWithSemanticBreaks,
    generateSpeech,
    generateFinalStoryboardFromEditable,
    generateLocationProps,
} from './ai/textAnalysis';

// ─── Image Generation & Manipulation ──────────────────────────────────────────
export {
    editImageWithNano,
    generateOutfitImage,
    generateCharacterMask,
    injectPersonalityAndCreateSignaturePose,
    upscaleImageWithNano,
    renderTextOnImage,
    replaceBackground,
    generateMultiCharacterImage,
    outpaintImageWithNano,
    fillImageWithNano,
    analyzeCostumeFromImage,
    analyzeCostumesFromTwoShotImage,
} from './ai/imageGeneration';
