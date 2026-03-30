import { TextEditingTarget, GeneratedImage } from './types';

// --- Types for UI State ---
export interface UIState {
    isDownloadDropdownOpen: boolean;
    isModelDropdownOpen: boolean;
    headerHeight: number;
    isEditorOpen: boolean;
    editingImageInfo: any | null;
    isImageViewerOpen: boolean;
    viewerImage: { url: string, alt: string, prompt?: string } | null;
    isTextEditorOpen: boolean;
    textEditingTarget: TextEditingTarget | null;
    isSlideshowOpen: boolean;
    isCostumeModalOpen: boolean;
    isBatchAudioModalOpen: boolean;
    isAudioSplitterOpen: boolean;
    isCutSelectionModalOpen: boolean;
    titleSuggestions: string[];
    isGeneratingTitles: boolean;
    isStyleModalOpen: boolean;
    isStyleSettingsOpen?: boolean;
    isEnrichedScriptVisible: boolean;
    isThirdCharacterStudioOpen: boolean;
    isCutAssignmentModalOpen: boolean;
    imageToAssign: GeneratedImage | null;
    isTargetCutSelectionModalOpen: boolean;
    targetCutSelectionStudioId: 'a' | 'b' | null;
    youtubeUrl: string;
    confetti: React.ReactElement[];
    isStoryboardReviewModalOpen: boolean;
    isSceneAnalysisReviewModalOpen: boolean;
    isCutPreviewModalOpen: boolean;
    analysisStage: 'character' | 'enrichment' | 'blueprint' | 'spatial' | 'storyboard' | 'idle';
    analysisProgress: number;
}

export const initialUIState: UIState = {
    isDownloadDropdownOpen: false,
    isModelDropdownOpen: false,
    headerHeight: 0,
    isEditorOpen: false,
    editingImageInfo: null,
    isImageViewerOpen: false,
    viewerImage: null,
    isTextEditorOpen: false,
    textEditingTarget: null,
    isSlideshowOpen: false,
    isCostumeModalOpen: false,
    isBatchAudioModalOpen: false,
    isAudioSplitterOpen: false,
    isCutSelectionModalOpen: false,
    titleSuggestions: [],
    isGeneratingTitles: false,
    isStyleModalOpen: false,
    isStyleSettingsOpen: false,
    isEnrichedScriptVisible: false,
    isThirdCharacterStudioOpen: false,
    isCutAssignmentModalOpen: false,
    imageToAssign: null,
    isTargetCutSelectionModalOpen: false,
    targetCutSelectionStudioId: null,
    youtubeUrl: '',
    confetti: [],
    isStoryboardReviewModalOpen: false,
    isSceneAnalysisReviewModalOpen: false,
    isCutPreviewModalOpen: false,
    analysisStage: 'idle',
    analysisProgress: 0,
};
