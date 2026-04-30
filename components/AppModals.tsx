// components/AppModals.tsx — App.tsx의 모달 트리 추출
// 2순위 정리: App.tsx 715줄 중 모달 렌더링 ~370줄 분리.
// useAppContext로 대부분 가져오고, App.tsx local state만 props로.

import React from 'react';
import { useAppContext } from '../AppContext';
import { generateSpeech } from '../services/geminiService';
import type { DalleAssetType } from '../services/openaiService';
import { IS_TAURI } from '../services/tauriAdapter';

import { ApiKeySettings } from './ApiKeySettings';
import { DalleGeneratorModal } from './DalleGeneratorModal';
import { AssetLibraryModal } from './AssetLibraryModal';
import { AssetCatalogModal } from './AssetCatalogModal';
import { ProjectListModal } from './ProjectListModal';
import { StyleSelectionModal } from './StyleSelectionModal';
import { CutPreviewModal } from './CutPreviewModal';
import { CutSelectionModal } from './CutSelectionModal';
import { ThirdCharacterStudioModal } from './ThirdCharacterStudioModal';
import { CutSplitterModal } from './CutSplitterModal';
import { CharacterStudio } from './CharacterStudio';
import { ProportionStudioModal } from './ProportionStudioModal';
import { SceneAnalysisReviewModal } from './SceneAnalysisReviewModal';
import { StoryboardReviewModal } from './StoryboardReviewModal';
import { BatchAudioModal } from './BatchAudioModal';
import { CutAssignmentModal } from './CutAssignmentModal';
import { ImageViewerModal } from './ImageViewerModal';
import { ImageEditorModal } from './ImageEditorModal';
import { TextEditorModal } from './TextEditorModal';
import { SlideshowModal } from './SlideshowModal';
import { CutCard } from './SceneCard';
import { XIcon } from './icons';

interface AppModalsProps {
    // App.tsx local state (AppContext 외)
    isResetConfirmOpen: boolean;
    setIsResetConfirmOpen: (v: boolean) => void;
    isApiKeySettingsOpen: boolean;
    setIsApiKeySettingsOpen: (v: boolean) => void;
    isAssetCatalogOpen: boolean;
    setIsAssetCatalogOpen: (v: boolean) => void;
    isProjectListOpen: boolean;
    setIsProjectListOpen: (v: boolean) => void;
    isCutDetailOpen: boolean;
    setIsCutDetailOpen: (v: boolean) => void;
    isDalleGeneratorOpen: boolean;
    setIsDalleGeneratorOpen: (v: boolean) => void;
    dalleInitialType: DalleAssetType;
    setDalleInitialType: (t: DalleAssetType) => void;
    // 슬라이드쇼 props (App.tsx의 derived data)
    slideshowData: any[];
    backgroundMusicUrl: string | null;
}

export const AppModals: React.FC<AppModalsProps> = ({
    isResetConfirmOpen, setIsResetConfirmOpen,
    isApiKeySettingsOpen, setIsApiKeySettingsOpen,
    isAssetCatalogOpen, setIsAssetCatalogOpen,
    isProjectListOpen, setIsProjectListOpen,
    isCutDetailOpen, setIsCutDetailOpen,
    isDalleGeneratorOpen, setIsDalleGeneratorOpen,
    dalleInitialType, setDalleInitialType: _setDalleInitialType,
    slideshowData, backgroundMusicUrl,
}) => {
    const { state, actions, dispatch } = useAppContext();
    const {
        appState, isLoading, generatedContent, generatedImageHistory,
        characterDescriptions, isStyleModalOpen, isCutSelectionModalOpen,
        isThirdCharacterStudioOpen, isCutSplitterOpen, cutToSplit,
        isCostumeModalOpen, isBatchAudioModalOpen, isCutAssignmentModalOpen,
        isImageViewerOpen, viewerImage, isEditorOpen, editingImageInfo,
        isTextEditorOpen, textEditingTarget, isSlideshowOpen,
        titleSuggestions: _titleSuggestions, // unused but in state
        isStoryboardReviewModalOpen, isSceneAnalysisReviewModalOpen,
        isCutPreviewModalOpen, isProportionStudioOpen,
        artStyle, editableStoryboard, userInputScript, storyTitle,
    } = state;

    return (
        <>
            <ApiKeySettings isOpen={isApiKeySettingsOpen} onClose={() => setIsApiKeySettingsOpen(false)} />

            <DalleGeneratorModal
                isOpen={isDalleGeneratorOpen}
                onClose={() => setIsDalleGeneratorOpen(false)}
                initialAssetType={dalleInitialType}
                onOpenApiKeySettings={() => {
                    setIsDalleGeneratorOpen(false);
                    setIsApiKeySettingsOpen(true);
                }}
                onAssetSaved={() => {
                    if (IS_TAURI) {
                        import('../services/tauriAdapter').then(m => m.emit?.('asset-catalog-updated', null).catch(() => {}));
                    }
                }}
            />

            {isResetConfirmOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
                    <div className="bg-zinc-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border border-zinc-700">
                        <h3 className="text-lg font-bold text-white mb-2">새 프로젝트를 시작하시겠습니까?</h3>
                        <p className="text-sm text-zinc-300 mb-6">
                            현재 작업 중인 모든 데이터가 삭제되고 초기화됩니다. 계속하시겠습니까?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsResetConfirmOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={() => {
                                    setIsResetConfirmOpen(false);
                                    actions.handleResetState();
                                }}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                            >
                                새 프로젝트 시작
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {state.isAssetLibraryOpen && (
                <AssetLibraryModal
                    isOpen={state.isAssetLibraryOpen}
                    onClose={() => dispatch({ type: 'CLOSE_ASSET_LIBRARY' })}
                    assets={state.assetLibrary}
                    onSelect={actions.handleSelectAsset}
                    onDelete={(id) => dispatch({ type: 'DELETE_ASSET_FROM_LIBRARY', payload: id })}
                    onImportFromFile={(file) => {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            if (e.target?.result) {
                                dispatch({
                                    type: 'ADD_ASSET_TO_LIBRARY',
                                    payload: {
                                        id: window.crypto.randomUUID(),
                                        imageDataUrl: e.target.result as string,
                                        prompt: 'Imported Asset',
                                        tags: { category: [state.guestSelectionTargetCutNumber ? '인물' : '배경'] },
                                        source: { type: 'background', name: 'User Import' },
                                        createdAt: new Date().toISOString()
                                    }
                                });
                            }
                        };
                        reader.readAsDataURL(file);
                    }}
                    mode={state.guestSelectionTargetCutNumber ? 'guest' : state.backgroundReplacementTargetCutNumber ? 'background' : 'normal'}
                />
            )}

            {isAssetCatalogOpen && (
                <AssetCatalogModal
                    isOpen={isAssetCatalogOpen}
                    onClose={() => setIsAssetCatalogOpen(false)}
                    currentArtStyle={artStyle}
                    onRequestDalleGenerator={(initialType) => {
                        _setDalleInitialType(initialType || 'character');
                        setIsDalleGeneratorOpen(true);
                    }}
                />
            )}

            {isProjectListOpen && (
                <ProjectListModal
                    isOpen={isProjectListOpen}
                    onClose={() => setIsProjectListOpen(false)}
                    onOpenProject={actions.handleOpenProject}
                    onDeleteProject={actions.handleDeleteProject}
                    onListProjects={actions.handleListProjects}
                    currentProjectId={state.currentProjectId}
                />
            )}

            {isStyleModalOpen && (
                <StyleSelectionModal
                    isOpen={isStyleModalOpen}
                    onClose={() => actions.setUIState({ isStyleModalOpen: false })}
                    onConfirm={(style, customText) => {
                        actions.setUIState({ isStyleModalOpen: false });
                        if (appState === 'storyboardGenerated') {
                            actions.handleSwapArtStyle(style, customText);
                        } else {
                            dispatch({ type: 'SET_ART_STYLE', payload: style });
                            dispatch({ type: 'SET_CUSTOM_ART_STYLE', payload: customText });
                            actions.handleStartStudio({ artStyle: style, customArtStyle: customText });
                        }
                    }}
                />
            )}

            {isCutPreviewModalOpen && (
                <CutPreviewModal
                    isOpen={isCutPreviewModalOpen}
                    onClose={() => actions.setUIState({ isCutPreviewModalOpen: false })}
                    onConfirm={() => actions.setUIState({ isStyleModalOpen: true })}
                    script={userInputScript}
                />
            )}

            {isCutSelectionModalOpen && generatedContent && (
                <CutSelectionModal
                    isOpen={isCutSelectionModalOpen}
                    onClose={() => actions.setUIState({ isCutSelectionModalOpen: false })}
                    scenes={generatedContent.scenes}
                    onConfirm={(selectedCuts) => {
                        actions.setUIState({ isCutSelectionModalOpen: false });
                        actions.handleRunSelectiveGeneration(selectedCuts);
                    }}
                />
            )}

            {isThirdCharacterStudioOpen && (
                <ThirdCharacterStudioModal
                    isOpen={isThirdCharacterStudioOpen}
                    onClose={() => actions.setUIState({ isThirdCharacterStudioOpen: false })}
                    generatedImageHistory={generatedImageHistory}
                    onConfirm={actions.handleThirdCharacterEdit}
                />
            )}

            {isCutSplitterOpen && cutToSplit && (
                <CutSplitterModal
                    isOpen={isCutSplitterOpen}
                    onClose={() => dispatch({ type: 'CLOSE_CUT_SPLITTER' })}
                    cut={cutToSplit}
                    onConfirm={actions.handleConfirmCutSplit}
                />
            )}

            {isCostumeModalOpen && (
                <CharacterStudio
                    isOpen={isCostumeModalOpen}
                    onClose={() => actions.setUIState({ isCostumeModalOpen: false })}
                    characterDescriptions={characterDescriptions}
                    onUpdateCharacterDescription={(key, data) => dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data } })}
                    onGenerateLocationOutfits={actions.handleGenerateLocationOutfits}
                    onGenerateOutfitImage={actions.handleGenerateOutfitImage}
                    onConfirm={appState === 'storyboardGenerated' ? actions.handleApplyCharacterChangesToAllCuts : actions.handleGenerateStoryboardWithCustomCostumes}
                />
            )}

            {isProportionStudioOpen && (
                <ProportionStudioModal
                    isOpen={isProportionStudioOpen}
                    onClose={() => actions.setUIState({ isProportionStudioOpen: false })}
                    characterDescriptions={characterDescriptions}
                    artStyle={artStyle}
                    customArtStyle={state.customArtStyle || ''}
                    selectedNanoModel={state.selectedNanoModel}
                    onUpdateCharacterDescription={(key, data) => dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data } })}
                />
            )}

            {isSceneAnalysisReviewModalOpen && editableStoryboard && (
                <SceneAnalysisReviewModal
                    isOpen={isSceneAnalysisReviewModalOpen}
                    onClose={() => {}}
                    scenes={editableStoryboard}
                    onConfirm={actions.handleConfirmSceneAnalysis}
                    onRegenerate={actions.handleRegenerateSceneAnalysis}
                    isLoading={isLoading}
                />
            )}

            {isStoryboardReviewModalOpen && editableStoryboard && (
                <StoryboardReviewModal
                    isOpen={isStoryboardReviewModalOpen}
                    onClose={() => actions.setUIState({ isStoryboardReviewModalOpen: false })}
                    draftScenes={editableStoryboard}
                    onConfirm={actions.handleConfirmDraftReview}
                />
            )}

            {isBatchAudioModalOpen && generatedContent && (
                <BatchAudioModal
                    isOpen={isBatchAudioModalOpen}
                    onClose={() => actions.setUIState({ isBatchAudioModalOpen: false })}
                    scenes={generatedContent.scenes}
                    onAttachAudio={actions.handleAttachAudioToCut}
                    onRemoveAudio={actions.handleRemoveAudioFromCut}
                    onUpdateCut={actions.handleUpdateCut}
                    generateSpeech={generateSpeech}
                    addNotification={actions.addNotification}
                    handleAddUsage={actions.handleAddUsage}
                />
            )}

            {isCutAssignmentModalOpen && (
                <CutAssignmentModal
                    isOpen={isCutAssignmentModalOpen}
                    onClose={() => actions.setUIState({ isCutAssignmentModalOpen: false, imageToAssign: null })}
                    scenes={generatedContent?.scenes || []}
                    onConfirm={actions.handleConfirmCutAssignment}
                    title="컷 할당"
                    description="새로 생성된 이미지를 할당할 컷을 선택해주세요."
                />
            )}

            {isImageViewerOpen && viewerImage && (
                <ImageViewerModal
                    isOpen={isImageViewerOpen}
                    onClose={() => actions.setUIState({ isImageViewerOpen: false })}
                    imageUrl={viewerImage.url}
                    altText={viewerImage.alt}
                    prompt={viewerImage.prompt}
                />
            )}

            {isEditorOpen && editingImageInfo && (
                <ImageEditorModal
                    isOpen={isEditorOpen}
                    onClose={() => actions.setUIState({ isEditorOpen: false })}
                    onSave={(newUrl) => {
                        const originalImage = generatedImageHistory.find(img => img.imageUrl === editingImageInfo.url);
                        if (originalImage) {
                            actions.handleSaveFromEditor(newUrl, originalImage);
                        } else {
                            actions.addNotification('원본 이미지를 찾을 수 없어 저장에 실패했습니다.', 'error');
                        }
                    }}
                    targetImage={editingImageInfo}
                    allCharacterDescriptions={characterDescriptions}
                    masterStyleSourceImageUrl={null}
                    editImageFunction={actions.handleEditImageWithNanoWithRetry}
                    outpaintImageFunction={actions.handleOutpaintImageWithNanoWithRetry}
                    fillImageFunction={actions.handleFillImageWithNanoWithRetry}
                />
            )}

            {isTextEditorOpen && textEditingTarget && (
                <TextEditorModal
                    isOpen={isTextEditorOpen}
                    onClose={() => actions.setUIState({ isTextEditorOpen: false })}
                    target={textEditingTarget}
                    onRender={actions.handleTextRender}
                />
            )}

            {isSlideshowOpen && (
                <SlideshowModal
                    isOpen={isSlideshowOpen}
                    onClose={() => actions.setUIState({ isSlideshowOpen: false })}
                    slideshowItems={slideshowData}
                    storyTitle={storyTitle}
                    generateSpeech={generateSpeech}
                    addNotification={actions.addNotification}
                    handleAddUsage={actions.handleAddUsage}
                    backgroundMusicUrl={backgroundMusicUrl}
                />
            )}

            {/* 전체 흐름 확인 모달 */}
            {isCutDetailOpen && generatedContent && (
                <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsCutDetailOpen(false)}>
                    <div className="bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl w-[98vw] max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-800 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-lg font-black text-white">🎬 전체 흐름 확인</span>
                                <span className="text-xs text-zinc-500">{generatedContent.scenes.flatMap(s => s.cuts).length}컷</span>
                            </div>
                            <button onClick={() => setIsCutDetailOpen(false)} className="p-1.5 hover:bg-zinc-800 rounded-lg"><XIcon className="w-5 h-5 text-zinc-400" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-1">
                                {generatedContent.scenes.flatMap(s => s.cuts).map(cut => (
                                    <div key={cut.cutNumber} className="border border-zinc-400 rounded-xl overflow-hidden" style={{ transform: 'scale(0.78)', transformOrigin: 'top left', marginBottom: '-22%', marginRight: '-22%' }}>
                                        <CutCard cut={cut} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
