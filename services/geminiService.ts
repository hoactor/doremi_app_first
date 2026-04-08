// services/geminiService.ts — Re-export Hub
// 기존 import 경로 하위 호환을 위한 re-export 파일.
// 실제 구현은 ai/ 폴더에 분리되어 있음.

// ─── AI 설정/유틸 ────────────────────────────────────────────────
export { clearGeminiKeyCache } from './ai/aiCore';

// ─── 텍스트 분석 ────────────────────────────────────────────────
export {
    analyzeHairStyle,
    analyzeCharacterVisualDNA,
    enrichScriptWithDirections,
    regenerateSingleCutDraft,
    analyzeCharacters,
    generateTitleSuggestions,
    generateOutfitsForLocations,
    regenerateOutfitDescription,
    regenerateImagePrompts,
    generateLocationProps,
    normalizeScriptCuts,
    // generateEditableStoryboard — [LEGACY] Phase 9에서 textAnalysis.legacy.ts로 분리
    regenerateSceneFromModification,
    extractFieldsFromSceneDescription,
    verifyAndEnrichCutPrompt,
    generateFinalStoryboardFromEditable,
    regenerateCutFieldsForCharacterChange,
    regenerateCutFieldsForIntentChange,
    purifyImagePromptForSafety,
    generateCinematicBlueprint,
    formatMultipleTextsWithSemanticBreaks,
    formatTextWithSemanticBreaks,
    analyzeScenario,
    analyzeCharacterBible,
    generateConti,
    designCinematography,
    convertContiToEditableStoryboard,
    refinePromptWithAI,
    refineAllPromptsWithAI,
    regenerateForNewLocations,
} from './ai/textAnalysis';

export type { CutFieldChanges } from './ai/textAnalysis';

// ─── MSF 대본 분석 ────────────────────────────────────────────────
export { parseMSFScript, generateTitleAndSetup, enrichContiCutsBatch, enrichContiCutsLegacy, intensifyCut } from './ai/msfAnalysis';

// ─── USS (Universal Script Schema) ────────────────────────────────
export { analyzeUSSStructure, convertAllNarrationToCuts, ussToAppData } from './ai/ussAnalysis';

// ─── 레거시 (참고/롤백용) ────────────────────────────────────────
export { generateEditableStoryboard } from './ai/textAnalysis.legacy';

// ─── 이미지 생성/편집 + TTS (11개) ──────────────────────────────
export {
    generateOutfitImage,
    editImageWithNano,
    generateCharacterMask,
    injectPersonalityAndCreateSignaturePose,
    upscaleImageWithNano,
    renderTextOnImage,
    replaceBackground,
    generateMultiCharacterImage,
    outpaintImageWithNano,
    fillImageWithNano,
    generateSpeech,
} from './ai/imageGeneration';
