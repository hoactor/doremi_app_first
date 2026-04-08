
import React, { useRef, useState, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
// RoughPreviewBoard, RoughPreviewModal — 삭제됨 (Phase 8+ 정리)
import { ImageEditorModal } from './components/ImageEditorModal';
import { ImageViewerModal } from './components/ImageViewerModal';
import { TextEditorModal } from './components/TextEditorModal';
import { CharacterClosetModal } from './components/CharacterClosetModal';
import { AssetLibraryModal } from './components/AssetLibraryModal';
import { AssetCatalogModal } from './components/AssetCatalogModal';
import { ProjectListModal } from './components/ProjectListModal';
import { SlideshowModal } from './components/SlideshowModal';
import { CharacterStudio } from './components/CharacterStudio';
import { BatchAudioModal } from './components/BatchAudioModal';
import { CutSplitterModal } from './components/CutSplitterModal';
import { CutSelectionModal } from './components/CutSelectionModal';
import { StyleSelectionModal } from './components/StyleSelectionModal';
import { ThirdCharacterStudioModal } from './components/ThirdCharacterStudioModal';
import { CutAssignmentModal } from './components/CutAssignmentModal';
import { ProportionStudioModal } from './components/ProportionStudioModal';
import { CutCard } from './components/SceneCard';
import { EnlargedCutModal } from './components/EnlargedCutModal';
import { AppInputScreen } from './components/AppInputScreen';
import { EnrichedScriptEditor } from './components/EnrichedScriptEditor';
import { ContiCutEditor } from './components/ContiCutEditor';
import { Sidebar } from './components/Sidebar';
import { ClipboardIcon, CheckIcon, SparklesIcon, XIcon, SpinnerIcon, DownloadIcon, TrashIcon, DocumentDuplicateIcon, PencilIcon, PauseIcon, PlayIcon, StopIcon, ArrowLeftIcon, ChevronRightIcon, UserIcon, RefreshIcon, ThumbUpIcon, BookmarkSquareIcon, PhotoIcon, PaintBrushIcon, UploadIcon, PlusIcon, ChevronDownIcon, UsersIcon, ChatBubblePlusIcon, UserCircleIcon, HandRaisedIcon, FilmIcon, SpeakerWaveIcon, MicrophoneIcon, DocumentArrowDownIcon, DocumentArrowUpIcon, ScissorsIcon, ArrowTopRightOnSquareIcon, CogIcon, FolderOpenIcon, EyeIcon, ArrowsRightLeftIcon } from './components/icons';
import { useAppContext } from './AppContext';
import { generateSpeech } from './services/geminiService';
import { Notification } from './types';
import { StoryboardReviewModal } from './components/StoryboardReviewModal';
import { SceneAnalysisReviewModal } from './components/SceneAnalysisReviewModal';
import { CutPreviewModal } from './components/CutPreviewModal';
import { ApiKeySettings } from './components/ApiKeySettings';
import { IS_TAURI, openAssetCatalog, listen, resetWindowSize } from './services/tauriAdapter';

const NotificationToast: React.FC<{ notification: Notification, onDismiss: (id: number) => void }> = ({ notification, onDismiss }) => {
    const colors: Record<string, string> = { error: 'bg-red-500', success: 'bg-green-500', info: 'bg-blue-500', warning: 'bg-orange-500' };
    const bgColor = colors[notification.type] || 'bg-zinc-600';
    return (
        <div className={`flex items-center w-full max-w-sm p-4 text-white ${bgColor} rounded-lg shadow-lg transform transition-all duration-300 animate-fade-in-scale`} role="alert">
            <div className="flex-grow">
                <div className="text-sm font-medium">{notification.message}</div>
                {notification.action && (
                    <button onClick={() => { notification.action!.callback(); onDismiss(notification.id); }}
                        className="mt-2 px-3 py-1 text-xs font-bold bg-white/20 hover:bg-white/30 rounded-md transition-colors">
                        {notification.action.label}
                    </button>
                )}
            </div>
            <button onClick={() => onDismiss(notification.id)} className="ml-4 -mr-2 p-1.5 text-white rounded-lg hover:bg-white/20 focus:ring-2 focus:ring-white"><span className="sr-only">Dismiss</span><XIcon className="w-4 h-4" /></button>
        </div>
    );
}

/** React 에러 바운더리 — 렌더링 크래시 시 블랙 화면 대신 에러 표시 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
    constructor(props: any) { super(props); this.state = { hasError: false, error: '' }; }
    static getDerivedStateFromError(error: any) { return { hasError: true, error: String(error?.message || error) }; }
    componentDidCatch(error: any, info: any) { console.error('🔴 React render crash:', error, info?.componentStack); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-8">
                    <div className="max-w-lg bg-zinc-900 border border-red-500/50 rounded-xl p-6 text-center">
                        <h2 className="text-xl font-bold text-red-400 mb-3">렌더링 오류 발생</h2>
                        <p className="text-sm text-zinc-400 mb-4 font-mono break-all">{this.state.error}</p>
                        <button onClick={() => { this.setState({ hasError: false, error: '' }); }} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500">다시 시도</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const STAGE_LABELS: Record<string, string> = {
    character: '캐릭터 아이덴티티 및 의상 분석 중...',
    enrichment: '대본 행간 분석 및 연출 강화 중...',
    blueprint: '시네마틱 블루프린트(촬영 계획) 설계 중...',
    spatial: '장소별 공간 DNA 추출 및 일관성 확보 중...',
    storyboard: '상세 스토리보드 생성 및 검토 준비 중...',
    idle: ''
};

export const App: React.FC = () => {
    const { state, dispatch, actions } = useAppContext();
    const { appState, generatedContent, isLoading, loadingMessage, loadingMessageDetail, notifications, geminiTokenCount, claudeTokenCount, falUsage, userInputScript, enrichedScript, storyTitle, speakerGender, generatedImageHistory, isAutoGenerating, isGeneratingSRT, backgroundMusicUrl, backgroundMusicName, failedCutNumbers, isZipping, zippingProgress, confetti, isDownloadDropdownOpen, isModelDropdownOpen, isStyleModalOpen, isCutSelectionModalOpen, isThirdCharacterStudioOpen, isCutSplitterOpen, cutToSplit, isCostumeModalOpen, characterDescriptions, isBatchAudioModalOpen, isCutAssignmentModalOpen, isImageViewerOpen, viewerImage, isEditorOpen, editingImageInfo, isTextEditorOpen, textEditingTarget, isSlideshowOpen, titleSuggestions, isGeneratingTitles, isEnrichedScriptVisible, headerHeight, editableStoryboard, isStoryboardReviewModalOpen, isSceneAnalysisReviewModalOpen, isCutPreviewModalOpen, isRoughPreviewModalOpen, analysisStage, analysisProgress, artStyle, imageRatio, pipelineCheckpoint, enlargedCutNumber, logline, enrichedBeats, lastAutoSaved, isProportionStudioOpen } = state;

    const headerRef = useRef<HTMLElement>(null);
    const downloadDropdownRef = useRef<HTMLDivElement>(null);
    const importProjectFileRef = useRef<HTMLInputElement>(null);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isApiKeySettingsOpen, setIsApiKeySettingsOpen] = useState(false);
    const [isAssetCatalogOpen, setIsAssetCatalogOpen] = useState(false);
    const [isAssetWindowOpen, setIsAssetWindowOpen] = useState(false);
    const [isProjectListOpen, setIsProjectListOpen] = useState(false);
    const [isCutDetailOpen, setIsCutDetailOpen] = useState(false);
    const [isBgMusicDragging, setIsBgMusicDragging] = useState(false);
    const [batchInput, setBatchInput] = useState('');
    const [collapsedScenes, setCollapsedScenes] = useState<Set<number>>(new Set());
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Phase 10 C-3: 에셋 독립 창 닫힘 감지
    useEffect(() => {
        if (!IS_TAURI) return;
        let unlisten: (() => void) | null = null;
        listen('asset-window-closed', () => {
            setIsAssetWindowOpen(false);
        }).then(fn => { unlisten = fn; });
        return () => { if (unlisten) unlisten(); };
    }, []);

    useLayoutEffect(() => {
        const updateHeaderHeight = () => { if (headerRef.current) actions.setUIState({ headerHeight: headerRef.current.offsetHeight }); };
        updateHeaderHeight();
        window.addEventListener('resize', updateHeaderHeight);
        return () => window.removeEventListener('resize', updateHeaderHeight);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { 
            if (downloadDropdownRef.current && !downloadDropdownRef.current.contains(event.target as Node)) actions.setUIState({ isDownloadDropdownOpen: false }); 
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const sceneAndCutCounts = useMemo(() => {
        if (appState === 'storyboardGenerated' && generatedContent) {
            const scenes = (generatedContent.scenes || []).filter(Boolean);
            const totalCuts = scenes.reduce((acc, scene) => acc + (scene.cuts?.length || 0), 0);
            return { sceneCount: scenes.length, cutCount: totalCuts };
        }
        return null;
    }, [appState, generatedContent]);

    const slideshowData = useMemo(() => {
        if (!generatedContent) return [];
        const items = [];
        const imageMap = new Map(generatedImageHistory.map(img => [img.id, img]));
        for (const scene of (generatedContent.scenes || []).filter(Boolean)) {
            for (const cut of (scene.cuts || []).filter(Boolean)) {
                const image = cut.selectedImageId ? imageMap.get(cut.selectedImageId) : null;
                items.push({ image: image || null, narration: cut.narration || '', audioDataUrls: cut.audioDataUrls, cutNumber: cut.cutNumber });
            }
        }
        return items;
    }, [generatedContent, generatedImageHistory]);

    // ── 메인 보드 헬퍼 ──
    const allCuts = useMemo(() => generatedContent?.scenes.flatMap(s => s.cuts) || [], [generatedContent]);
    const intenseCount = useMemo(() => allCuts.filter(c => c.useIntenseEmotion).length, [allCuts]);
    const toggleScene = useCallback((n: number) => setCollapsedScenes(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; }), []);


    // ★ Save 버튼 상태 표시: idle → saving → saved → idle
    const handleSaveWithStatus = useCallback(async () => {
        setSaveStatus('saving');
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        await actions.handleSaveProjectNow();
        setSaveStatus('saved');
        saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }, [actions]);

    // ★ 자동 저장 완료 감지: lastAutoSaved 변경 시 "Saved" 2초 표시
    useEffect(() => {
        if (lastAutoSaved > 0 && saveStatus === 'idle') {
            setSaveStatus('saved');
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
        }
    }, [lastAutoSaved]);

    // ★ 글로벌 키보드 단축키
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;
            if (!isMod) return;
            // Cmd+S: 프로젝트 저장
            if (e.key === 's' && !e.shiftKey) {
                e.preventDefault();
                handleSaveWithStatus();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleSaveWithStatus]);

    const handleDownloadSingleImage = useCallback(async (url: string, filename: string) => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch { /* fallback */ const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); }
    }, []);

    // ── 엔진/모델별 테두리 + 뱃지 ──
    const engine = state.selectedImageEngine || 'gemini';
    const { borderStyle, badgeLabel, badgeColor } = (() => {
        if (engine === 'flux') {
            const fm = state.selectedFluxModel || 'flux-pro';
            if (fm === 'flux-lora') return {
                borderStyle: 'border-[6px] border-emerald-500 shadow-[inset_0_0_50px_rgba(16,185,129,0.5)]',
                badgeLabel: 'FLUX LORA', badgeColor: 'bg-emerald-600 text-white',
            };
            if (fm === 'flux-2-flex' || fm === 'flux-flex') return {
                borderStyle: 'border-[6px] border-cyan-500 shadow-[inset_0_0_50px_rgba(6,182,212,0.5)]',
                badgeLabel: 'FLUX FLEX', badgeColor: 'bg-cyan-600 text-white',
            };
            return {
                borderStyle: 'border-[6px] border-purple-500 shadow-[inset_0_0_50px_rgba(168,85,247,0.5)]',
                badgeLabel: 'FLUX PRO', badgeColor: 'bg-purple-600 text-white',
            };
        }
        // Gemini
        if (state.selectedNanoModel === 'nano-3pro') return {
            borderStyle: 'border-[6px] border-red-500 shadow-[inset_0_0_50px_rgba(239,68,68,0.5)]',
            badgeLabel: 'GEMINI 3PRO', badgeColor: 'bg-red-600 text-white',
        };
        if (state.selectedNanoModel === 'nano-3.1') return {
            borderStyle: 'border-[6px] border-amber-500 shadow-[inset_0_0_50px_rgba(245,158,11,0.5)]',
            badgeLabel: 'GEMINI 3.1', badgeColor: 'bg-amber-600 text-white',
        };
        return { borderStyle: '', badgeLabel: '', badgeColor: '' };
    })();

    return (
        <div className={`flex h-screen bg-zinc-950 text-zinc-300 font-sans overflow-hidden transition-all duration-300 ${borderStyle}`}>
             <input type="file" ref={importProjectFileRef} onChange={actions.handleImportFile} accept=".wvs_project,application/json" className="hidden" />
            <div className="fixed inset-0 pointer-events-none z-[100]">{confetti}</div>
            <div className="fixed bottom-4 left-4 z-50 space-y-2">{notifications.map(n => <NotificationToast key={n.id} notification={n} onDismiss={(id) => dispatch({ type: 'REMOVE_NOTIFICATION', payload: id })} />)}</div>
            {badgeLabel && (
                <div className={`fixed top-2 left-1/2 -translate-x-1/2 z-[200] px-3 py-1 rounded-full text-[10px] font-black tracking-widest shadow-lg ${badgeColor}`}>
                    {badgeLabel}
                </div>
            )}
            
            <Sidebar
                appState={appState}
                artStyle={artStyle}
                isLoading={isLoading}
                isZipping={isZipping}
                isAutoGenerating={isAutoGenerating}
                isGeneratingSRT={isGeneratingSRT}
                isDownloadDropdownOpen={isDownloadDropdownOpen}
                selectedImageEngine={state.selectedImageEngine || 'gemini'}
                selectedNanoModel={state.selectedNanoModel}
                selectedFluxModel={state.selectedFluxModel || 'flux-pro'}
                zippingProgress={zippingProgress}
                saveStatus={saveStatus}
                falUsage={falUsage}
                claudeTokenCount={claudeTokenCount}
                geminiTokenCount={geminiTokenCount}
                sceneAndCutCounts={sceneAndCutCounts}
                hasSlideshowData={slideshowData.length > 0}
                failedCutNumbers={failedCutNumbers}
                isAssetWindowOpen={isAssetWindowOpen}
                styleLoraId={state.styleLoraId}
                styleLoraScaleOverride={state.styleLoraScaleOverride}
                downloadDropdownRef={downloadDropdownRef}
                importProjectFileRef={importProjectFileRef}
                dispatch={dispatch}
                actions={actions}
                handleSaveWithStatus={handleSaveWithStatus}
                setIsResetConfirmOpen={setIsResetConfirmOpen}
                setIsCutDetailOpen={setIsCutDetailOpen}
                setIsApiKeySettingsOpen={setIsApiKeySettingsOpen}
                setIsAssetCatalogOpen={setIsAssetCatalogOpen}
                setIsAssetWindowOpen={setIsAssetWindowOpen}
                setIsProjectListOpen={setIsProjectListOpen}
            />

            <ApiKeySettings isOpen={isApiKeySettingsOpen} onClose={() => setIsApiKeySettingsOpen(false)} />

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

            <main className="flex-1 flex flex-col relative overflow-y-auto bg-zinc-950 p-6">
                {/* ★ 새 프로젝트 버튼 — 항상 표시 (우상단 고정) */}
                <button
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="fixed top-3 right-4 z-[150] px-3 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-white bg-zinc-900/80 hover:bg-red-600/80 border border-zinc-700 hover:border-red-500 rounded-lg backdrop-blur-sm transition-all"
                    title="새 프로젝트 시작"
                >
                    ✦ New
                </button>

                {isLoading && (
                    <div className="absolute inset-0 bg-black/80 z-[99] flex flex-col items-center justify-center backdrop-blur-sm pt-16">
                        <div className="w-full max-w-md p-8 bg-zinc-900/90 rounded-3xl border border-zinc-700 shadow-2xl flex flex-col items-center">
                            <SpinnerIcon className="w-16 h-16 text-orange-500 mb-6" />
                            
                            <h3 className="text-xl font-bold text-white mb-2">{analysisStage !== 'idle' ? STAGE_LABELS[analysisStage] : loadingMessage}</h3>
                            
                            {/* [작업2] 전체 러프/일반 진행률 표시 — loadingMessage에서 (X/Y) 파싱 */}
                            {analysisStage === 'idle' && (() => {
                                const progressMatch = (loadingMessage || '').match(/\((\d+)\/(\d+)\)/);
                                if (!progressMatch) return null;
                                const current = parseInt(progressMatch[1]);
                                const total = parseInt(progressMatch[2]);
                                const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                                return (
                                    <div className="w-full mt-4 space-y-2">
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Generation Progress</span>
                                            <span className="text-lg font-mono font-bold text-white">{current} / {total}</span>
                                        </div>
                                        <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700 p-0.5">
                                            <div
                                                className="h-full bg-orange-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(249,115,22,0.4)]"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <p className="text-center text-[10px] text-zinc-500 mt-1">{pct}% 완료</p>
                                    </div>
                                );
                            })()}

                            {analysisStage !== 'idle' && (
                                <div className="w-full mt-4 space-y-2">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Analysis Progress</span>
                                        <span className="text-lg font-mono font-bold text-white">{analysisProgress}%</span>
                                    </div>
                                    <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700 p-0.5">
                                        <div 
                                            className="h-full bg-orange-500 rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(249,115,22,0.4)]"
                                            style={{ width: `${analysisProgress}%` }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-5 gap-1 mt-3">
                                        {[0, 1, 2, 3, 4].map(i => {
                                            const stages = ['character', 'enrichment', 'blueprint', 'spatial', 'storyboard'];
                                            const currentIdx = stages.indexOf(analysisStage);
                                            const isCompleted = currentIdx > i;
                                            const isActive = currentIdx === i;
                                            return (
                                                <div key={i} className={`h-1 rounded-full ${isCompleted ? 'bg-orange-500' : isActive ? 'bg-orange-400 animate-pulse' : 'bg-zinc-800'}`} />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            
                            {loadingMessageDetail && (
                                <p className="mt-6 text-sm text-zinc-400 text-center italic bg-zinc-950/50 p-3 rounded-xl border border-zinc-800 w-full">
                                    {loadingMessageDetail}
                                </p>
                            )}
                            
                            {isAutoGenerating && (
                                <button 
                                    onClick={() => actions.handleToggleAutoGeneration()}
                                    className="mt-8 px-6 py-2 rounded-full bg-red-600/20 text-red-400 border border-red-600/30 text-xs font-bold hover:bg-red-600 hover:text-white transition-all active:scale-95"
                                >
                                    생성 중단하기
                                </button>
                            )}
                            
                            {isGeneratingSRT && (
                                <button 
                                    onClick={() => actions.handleCancelSRTGeneration()}
                                    className="mt-8 px-6 py-2 rounded-full bg-red-600/20 text-red-400 border border-red-600/30 text-xs font-bold hover:bg-red-600 hover:text-white transition-all active:scale-95"
                                >
                                    생성 중단하기
                                </button>
                            )}
                            
                            {/* Generic cancel button for any other loading state that doesn't have a specific cancel button */}
                            {!isAutoGenerating && !isGeneratingSRT && (
                                <button 
                                    onClick={() => actions.handleCancelGenerateAll()}
                                    className="mt-8 px-6 py-2 rounded-full bg-zinc-600/20 text-zinc-400 border border-zinc-600/30 text-xs font-bold hover:bg-zinc-600 hover:text-white transition-all active:scale-95"
                                >
                                    중단하기
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {appState === 'initial' && pipelineCheckpoint !== 'enriched_pause' && pipelineCheckpoint !== 'conti_pause' && <AppInputScreen onImportClick={() => importProjectFileRef.current?.click()} />}

                {/* ★ Phase 12: enriched_pause — 연출 대본 편집 화면 */}
                {pipelineCheckpoint === 'enriched_pause' && enrichedBeats && (
                    <EnrichedScriptEditor
                        beats={enrichedBeats}
                        onContinue={(editedBeats) => actions.handleResumeFromEnrichedPause(editedBeats)}
                        onRestart={() => { dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'idle' }); dispatch({ type: 'SET_ENRICHED_BEATS', payload: null }); }}
                        locationRegistry={state.locationRegistry || []}
                        onRefreshLocations={actions.handleRefreshLocations}
                    />
                )}

                {/* ★ conti_pause — 콘티 컷 편집 화면 */}
                {pipelineCheckpoint === 'conti_pause' && state.contiCuts && (
                    <ContiCutEditor
                        cuts={state.contiCuts}
                        onContinue={() => actions.handleResumePipeline()}
                        onRestart={() => { dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'idle' }); dispatch({ type: 'SET_CONTI_CUTS', payload: null }); }}
                        onUpdateCuts={(cuts) => dispatch({ type: 'SET_CONTI_CUTS', payload: cuts })}
                        locationRegistry={state.locationRegistry || []}
                        onRefreshLocations={actions.handleRefreshLocations}
                    />
                )}

                {appState === 'storyboardGenerated' && generatedContent && (
                    <div className="flex flex-col gap-4 h-full">
                        {enrichedScript && (
                            <div className="bg-zinc-900/50 border border-zinc-700 rounded-2xl p-4 shadow-lg">
                                <div className="flex justify-between items-center cursor-pointer group" onClick={() => actions.setUIState({ isEnrichedScriptVisible: !isEnrichedScriptVisible })}>
                                    <h3 className="text-sm font-bold text-orange-400 group-hover:text-orange-300">AI 감독 연출 강화 대본</h3>
                                    <ChevronDownIcon className={"w-5 h-5 text-zinc-400 transition-transform duration-300 " + (isEnrichedScriptVisible ? 'rotate-180' : '')} />
                                </div>
                                <div className={"transition-all duration-500 ease-in-out " + (isEnrichedScriptVisible ? 'max-h-[300px] overflow-y-auto pt-3' : 'max-h-0 overflow-hidden pt-0')}>
                                    <div className="prose prose-sm prose-invert bg-zinc-800 p-3 rounded-md whitespace-pre-wrap text-zinc-300 text-xs">{enrichedScript}</div>
                                </div>
                            </div>
                        )}
                        <div className="flex-1 min-h-0 flex gap-4">
                            {/* ═══ 왼쪽: SceneCard 그리드 ═══ */}
                            <div className="flex-1 flex flex-col min-w-0 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                                {/* 상단 바 */}
                                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 flex-shrink-0">
                                    <span className="text-xs font-bold text-zinc-400">{allCuts.length}컷 · 🔥 {intenseCount}</span>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => actions.handleGenerateAll('rough')} disabled={isLoading} className="px-3.5 py-1.5 bg-transparent hover:bg-orange-500/10 disabled:opacity-50 text-orange-400 text-xs font-bold rounded-lg border border-orange-500/50 hover:border-orange-400 transition-all">전체 러프</button>
                                        <button onClick={() => actions.handleGenerateAll('normal')} disabled={isLoading} className="px-3.5 py-1.5 bg-transparent hover:bg-orange-500/10 disabled:opacity-50 text-orange-400 text-xs font-bold rounded-lg border border-orange-500/50 hover:border-orange-400 transition-all">전체 일반</button>
                                        <button onClick={() => actions.handleToggleAllIntenseEmotion()} className={`px-3.5 py-1.5 text-xs font-bold rounded-lg border transition-all ${intenseCount === allCuts.length && allCuts.length > 0 ? 'bg-rose-600 text-white border-rose-500' : 'bg-transparent hover:bg-rose-500/10 text-rose-400 border-rose-500/50 hover:border-rose-400'}`}>🔥 전체 강화</button>
                                    </div>
                                </div>
                                {/* 씬별 SceneCard 그리드 */}
                                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                                    {(generatedContent?.scenes || []).map(scene => {
                                        const collapsed = collapsedScenes.has(scene.sceneNumber);
                                        return (
                                            <div key={scene.sceneNumber}>
                                                <button onClick={() => toggleScene(scene.sceneNumber)} className="flex items-center gap-1.5 mb-2 group w-full text-left">
                                                    {collapsed ? <ChevronRightIcon className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDownIcon className="w-3.5 h-3.5 text-zinc-600" />}
                                                    <span className="text-[11px] font-bold text-zinc-400 group-hover:text-zinc-200 truncate">S{scene.sceneNumber}: {scene.title}</span>
                                                    <span className="text-[9px] text-zinc-600 flex-shrink-0">{scene.cuts.length}</span>
                                                </button>
                                                {!collapsed && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                                        {scene.cuts.map(cut => (
                                                            <CutCard key={cut.cutNumber} cut={cut} />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* 하단 일괄 수정 바 */}
                                <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 flex-shrink-0">
                                    <input type="text" value={batchInput} onChange={e => setBatchInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && batchInput.trim()) { actions.handleBatchRefine(batchInput); setBatchInput(''); } }}
                                        placeholder="일괄 수정 (⌘+Enter)" className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[10px] text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none" />
                                    <button onClick={() => { if (batchInput.trim()) { actions.handleBatchRefine(batchInput); setBatchInput(''); } }} disabled={!batchInput.trim() || isLoading}
                                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 text-white text-[10px] font-bold rounded flex items-center gap-1"><SparklesIcon className="w-3 h-3" /> 적용</button>
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </main>

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
                                        tags: { category: [state.guestSelectionTargetCutNumber ? '인물' : '배경'] }, // Default to background if importing manually in library
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
                    currentArtStyle={state.artStyle}
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

            {isStyleModalOpen && (<StyleSelectionModal isOpen={isStyleModalOpen} onClose={() => actions.setUIState({ isStyleModalOpen: false })} onConfirm={(style, customText) => { actions.setUIState({ isStyleModalOpen: false }); if (appState === 'storyboardGenerated') { actions.handleSwapArtStyle(style, customText); } else { dispatch({ type: 'SET_ART_STYLE', payload: style }); dispatch({ type: 'SET_CUSTOM_ART_STYLE', payload: customText }); actions.handleStartStudio({ artStyle: style, customArtStyle: customText }); } }} />)}
            {isCutPreviewModalOpen && (
                <CutPreviewModal
                    isOpen={isCutPreviewModalOpen}
                    onClose={() => actions.setUIState({ isCutPreviewModalOpen: false })}
                    onConfirm={() => actions.setUIState({ isStyleModalOpen: true })}
                    script={userInputScript}
                />
            )}
            {isCutSelectionModalOpen && generatedContent && (<CutSelectionModal isOpen={isCutSelectionModalOpen} onClose={() => actions.setUIState({ isCutSelectionModalOpen: false })} scenes={generatedContent.scenes} onConfirm={(selectedCuts) => { actions.setUIState({ isCutSelectionModalOpen: false }); actions.handleRunSelectiveGeneration(selectedCuts); }} />)}
            {isThirdCharacterStudioOpen && (<ThirdCharacterStudioModal isOpen={isThirdCharacterStudioOpen} onClose={() => actions.setUIState({ isThirdCharacterStudioOpen: false })} generatedImageHistory={generatedImageHistory} onConfirm={actions.handleThirdCharacterEdit} />)}
            {isCutSplitterOpen && cutToSplit && (<CutSplitterModal isOpen={isCutSplitterOpen} onClose={() => dispatch({ type: 'CLOSE_CUT_SPLITTER' })} cut={cutToSplit} onConfirm={actions.handleConfirmCutSplit} />)}
            {isCostumeModalOpen && (<CharacterStudio
                isOpen={isCostumeModalOpen}
                onClose={() => actions.setUIState({ isCostumeModalOpen: false })}
                characterDescriptions={characterDescriptions}
                onUpdateCharacterDescription={(key, data) => dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data } })}
                onGenerateLocationOutfits={actions.handleGenerateLocationOutfits}
                onGenerateOutfitImage={actions.handleGenerateOutfitImage}
                onConfirm={appState === 'storyboardGenerated' ? actions.handleApplyCharacterChangesToAllCuts : actions.handleGenerateStoryboardWithCustomCostumes}
            />)}
            {isProportionStudioOpen && (<ProportionStudioModal
                isOpen={isProportionStudioOpen}
                onClose={() => actions.setUIState({ isProportionStudioOpen: false })}
                characterDescriptions={characterDescriptions}
                artStyle={artStyle}
                customArtStyle={state.customArtStyle || ''}
                selectedNanoModel={state.selectedNanoModel}
                onUpdateCharacterDescription={(key, data) => dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data } })}
            />)}
            {isSceneAnalysisReviewModalOpen && editableStoryboard && (
                <SceneAnalysisReviewModal
                    isOpen={isSceneAnalysisReviewModalOpen}
                    onClose={() => {}} // Disallow closing without choice
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
             {isBatchAudioModalOpen && generatedContent && (<BatchAudioModal isOpen={isBatchAudioModalOpen} onClose={() => actions.setUIState({ isBatchAudioModalOpen: false })} scenes={generatedContent.scenes} onAttachAudio={actions.handleAttachAudioToCut} onRemoveAudio={actions.handleRemoveAudioFromCut} onUpdateCut={actions.handleUpdateCut} generateSpeech={generateSpeech} addNotification={actions.addNotification} handleAddUsage={actions.handleAddUsage} />)}
            {isCutAssignmentModalOpen && (<CutAssignmentModal isOpen={isCutAssignmentModalOpen} onClose={() => actions.setUIState({ isCutAssignmentModalOpen: false, imageToAssign: null })} scenes={generatedContent?.scenes || []} onConfirm={actions.handleConfirmCutAssignment} title="컷 할당" description="새로 생성된 이미지를 할당할 컷을 선택해주세요." />)}
            {isImageViewerOpen && viewerImage && (<ImageViewerModal isOpen={isImageViewerOpen} onClose={() => actions.setUIState({ isImageViewerOpen: false })} imageUrl={viewerImage.url} altText={viewerImage.alt} prompt={viewerImage.prompt} />)}
            {isEditorOpen && editingImageInfo && (<ImageEditorModal isOpen={isEditorOpen} onClose={() => actions.setUIState({ isEditorOpen: false })} onSave={(newUrl) => { const originalImage = generatedImageHistory.find(img => img.imageUrl === editingImageInfo.url); if (originalImage) { actions.handleSaveFromEditor(newUrl, originalImage); } else { actions.addNotification('원본 이미지를 찾을 수 없어 저장에 실패했습니다.', 'error'); } }} targetImage={editingImageInfo} allCharacterDescriptions={characterDescriptions} masterStyleSourceImageUrl={null} editImageFunction={actions.handleEditImageWithNanoWithRetry} outpaintImageFunction={actions.handleOutpaintImageWithNanoWithRetry} fillImageFunction={actions.handleFillImageWithNanoWithRetry} />)}
            {isTextEditorOpen && textEditingTarget && (<TextEditorModal isOpen={isTextEditorOpen} onClose={() => actions.setUIState({ isTextEditorOpen: false })} target={textEditingTarget} onRender={actions.handleTextRender} />)}
            {isSlideshowOpen && (<SlideshowModal isOpen={isSlideshowOpen} onClose={() => actions.setUIState({ isSlideshowOpen: false })} slideshowItems={slideshowData} storyTitle={storyTitle} generateSpeech={generateSpeech} addNotification={actions.addNotification} handleAddUsage={actions.handleAddUsage} backgroundMusicUrl={backgroundMusicUrl} />)}

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

            <EnlargedCutModal />
        </div>
    );
};
