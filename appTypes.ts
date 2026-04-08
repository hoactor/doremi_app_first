// appTypes.ts — React 의존 제로, 순수 타입/상수만
// contexts/ 하위 폴더 금지 — 루트 레벨 배치 필수

import type { Notification, TextEditingTarget, GeneratedImage } from './types';

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
    targetCutSelectionStudioId: 'a' | null;
    youtubeUrl: string;
    confetti: any[];
    isStoryboardReviewModalOpen: boolean;
    isSceneAnalysisReviewModalOpen: boolean;
    isCutPreviewModalOpen: boolean;
    isRoughPreviewModalOpen: boolean;
    analysisStage: 'character' | 'enrichment' | 'blueprint' | 'spatial' | 'storyboard' | 'idle';
    analysisProgress: number;
    enlargedCutNumber: string | null;
    studioLoadTrigger: number;  // ★ Studio 이미지 로드 시 Edit 탭 자동 전환 트리거
    lastAutoSaved: number;  // ★ 자동 저장 완료 시그널 (timestamp)
    isProportionStudioOpen: boolean;
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
    isRoughPreviewModalOpen: false,
    analysisStage: 'idle',
    analysisProgress: 0,
    enlargedCutNumber: null,
    studioLoadTrigger: 0,
    lastAutoSaved: 0,
    isProportionStudioOpen: false,
};
