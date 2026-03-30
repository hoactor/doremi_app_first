
import React, { useRef, useState, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
import { ApiKeySettings } from './components/ApiKeySettings';
import { SceneContainer } from './components/SceneCard';
import { ImageEditorModal } from './components/ImageEditorModal';
import { ImageViewerModal } from './components/ImageViewerModal';
import { TextEditorModal } from './components/TextEditorModal';
import { CharacterClosetModal } from './components/CharacterClosetModal';
import { AssetLibraryModal } from './components/AssetLibraryModal';
import { ImageStudio } from './components/ImageStudio';
import { SlideshowModal } from './components/SlideshowModal';
import { CostumeStudioModal } from './components/CharacterCard';
import { BatchAudioModal } from './components/BatchAudioModal';
import { CutSplitterModal } from './components/CutSplitterModal';
import { CutSelectionModal } from './components/CutSelectionModal';
import { StyleSelectionModal } from './components/StyleSelectionModal';
import { ThirdCharacterStudioModal } from './components/ThirdCharacterStudioModal';
import { CutAssignmentModal } from './components/CutAssignmentModal';
import { ClipboardIcon, CheckIcon, SparklesIcon, XIcon, SpinnerIcon, DownloadIcon, TrashIcon, DocumentDuplicateIcon, PencilIcon, PauseIcon, PlayIcon, StopIcon, ArrowLeftIcon, ChevronRightIcon, UserIcon, RefreshIcon, ThumbUpIcon, BookmarkSquareIcon, PhotoIcon, PaintBrushIcon, UploadIcon, PlusIcon, ChevronDownIcon, UsersIcon, ChatBubblePlusIcon, UserCircleIcon, HandRaisedIcon, FilmIcon, SpeakerWaveIcon, MicrophoneIcon, DocumentArrowDownIcon, DocumentArrowUpIcon, ScissorsIcon, ArrowTopRightOnSquareIcon } from './components/icons';
import { useAppContext } from './AppContext';
import { generateSpeech } from './services/geminiService';
import { Notification } from './types';
import { StoryboardReviewModal } from './components/StoryboardReviewModal';
import { SceneAnalysisReviewModal } from './components/SceneAnalysisReviewModal';
import { CutPreviewModal } from './components/CutPreviewModal';

const NotificationToast: React.FC<{ notification: Notification, onDismiss: (id: number) => void }> = ({ notification, onDismiss }) => {
    const colors = { error: 'bg-red-500', success: 'bg-green-500', info: 'bg-orange-500' };
    const bgColor = colors[notification.type] || 'bg-stone-600';
    return (
        <div className={`flex items-center w-full max-w-xs p-4 text-white ${bgColor} rounded-lg shadow-lg transform transition-all duration-300 animate-fade-in-scale`} role="alert">
            <div className="text-sm font-medium flex-grow">{notification.message}</div>
            <button onClick={() => onDismiss(notification.id)} className="ml-4 -mr-2 p-1.5 text-white rounded-lg hover:bg-white/20 focus:ring-2 focus:ring-white"><span className="sr-only">Dismiss</span><XIcon className="w-4 h-4" /></button>
        </div>
    );
}

const STAGE_LABELS: Record<string, string> = {
    character: '캐릭터 아이덴티티 및 의상 분석 중...',
    enrichment: '대본 행간 분석 및 연출 강화 중...',
    blueprint: '시네마틱 블루프린트(촬영 계획) 설계 중...',
    spatial: '장소별 공간 DNA 추출 및 일관성 확보 중...',
    storyboard: '상세 스토리보드 생성 및 검토 준비 중...',
    idle: ''
};

const STYLE_NAMES: Record<string, string> = {
    'normal': '정통 썰툰',
    'vibrant': '도파민 로맨스',
    'kyoto': '감성 작화',
    'moe': '극강 귀요미 SD',
    'dalle-chibi': '프리미엄 캐릭터',
    'custom': '커스텀 스타일'
};

export const App: React.FC = () => {
    const { state, dispatch, actions } = useAppContext();
    const { appState, generatedContent, isLoading, loadingMessage, loadingMessageDetail, notifications, geminiTokenCount, userInputScript, enrichedScript, storyTitle, speakerGender, generatedImageHistory, studioSessions, activeStudioTarget, isAutoGenerating, isGeneratingSRT, backgroundMusicUrl, backgroundMusicName, failedCutNumbers, isZipping, zippingProgress, confetti, isDownloadDropdownOpen, isModelDropdownOpen, isStyleModalOpen, isCutSelectionModalOpen, isThirdCharacterStudioOpen, isCutSplitterOpen, cutToSplit, isCostumeModalOpen, characterDescriptions, isBatchAudioModalOpen, isCutAssignmentModalOpen, isTargetCutSelectionModalOpen, isImageViewerOpen, viewerImage, isEditorOpen, editingImageInfo, isTextEditorOpen, textEditingTarget, isSlideshowOpen, titleSuggestions, isGeneratingTitles, isEnrichedScriptVisible, headerHeight, editableStoryboard, isStoryboardReviewModalOpen, isSceneAnalysisReviewModalOpen, isCutPreviewModalOpen, analysisStage, analysisProgress, artStyle } = state;

    const headerRef = useRef<HTMLElement>(null);
    const downloadDropdownRef = useRef<HTMLDivElement>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const importProjectFileRef = useRef<HTMLInputElement>(null);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isBgMusicDragging, setIsBgMusicDragging] = useState(false);
    const [isDragOverInput, setIsDragOverInput] = useState(false);
    const [rightPanelTab, setRightPanelTab] = useState<'studio' | 'history'>('studio');
    const [isApiKeySettingsOpen, setIsApiKeySettingsOpen] = useState(false);
    
    // --- Local State for Script Input Optimization ---
    const [localScript, setLocalScript] = useState(userInputScript);

    // Sync local state with context when context updates externally (e.g. file import)
    useEffect(() => {
        setLocalScript(userInputScript);
    }, [userInputScript]);

    useLayoutEffect(() => {
        const updateHeaderHeight = () => { if (headerRef.current) actions.setUIState({ headerHeight: headerRef.current.offsetHeight }); };
        updateHeaderHeight();
        window.addEventListener('resize', updateHeaderHeight);
        return () => window.removeEventListener('resize', updateHeaderHeight);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { 
            if (downloadDropdownRef.current && !downloadDropdownRef.current.contains(event.target as Node)) actions.setUIState({ isDownloadDropdownOpen: false }); 
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) actions.setUIState({ isModelDropdownOpen: false });
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

    const stickyColumnStyle = { top: '0px', height: 'calc(100vh - 3rem)' };
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

    const nanoStyle = state.selectedNanoModel === 'nano-3pro' 
        ? 'border-[6px] border-red-500 shadow-[inset_0_0_50px_rgba(239,68,68,0.5)]' 
        : state.selectedNanoModel === 'nano-3.1'
        ? 'border-[6px] border-amber-500 shadow-[inset_0_0_50px_rgba(245,158,11,0.5)]'
        : '';

    // Drag and Drop Handlers for Project File
    const handleInputDragOver = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOverInput(true);
        }
    };

    const handleInputDragLeave = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDragOverInput(false);
            }
        }
    };

    const handleInputDrop = (e: React.DragEvent) => {
        setIsDragOverInput(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.wvs_project') || file.name.endsWith('.json')) {
                actions.handleUploadProjectFile(file);
            } else if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (ev.target?.result) {
                        setLocalScript(ev.target.result as string);
                        dispatch({ type: 'SET_USER_INPUT_SCRIPT', payload: ev.target.result as string });
                    }
                };
                reader.readAsText(file);
            } else {
                actions.addNotification('지원하지 않는 파일 형식입니다. 텍스트 파일이나 프로젝트 파일을 드래그해주세요.', 'error');
            }
        }
        // If it's not a file, let the default behavior (like text dropping into textarea) happen
    };

    // Handle script change (update local state immediately, sync context on blur)
    const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalScript(e.target.value);
    };

    const handleScriptBlur = () => {
        if (localScript !== userInputScript) {
            dispatch({ type: 'SET_USER_INPUT_SCRIPT', payload: localScript });
        }
    };

    return (
        <div className={`flex h-screen bg-stone-950 text-stone-300 font-sans overflow-hidden transition-all duration-300 ${nanoStyle}`}>
             <input type="file" ref={importProjectFileRef} onChange={actions.handleImportFile} accept=".wvs_project,application/json" className="hidden" />
            <div className="fixed inset-0 pointer-events-none z-[100]">{confetti}</div>
            <div className="fixed bottom-4 left-4 z-50 space-y-2">{notifications.map(n => <NotificationToast key={n.id} notification={n} onDismiss={(id) => dispatch({ type: 'REMOVE_NOTIFICATION', payload: id })} />)}</div>
            
            <aside className="w-64 flex-shrink-0 bg-stone-900 border-r border-stone-800 flex flex-col z-20 shadow-2xl">
                <div className="h-14 flex items-center justify-between px-4 border-b border-stone-800">
                    <h1 className="text-lg font-bold text-orange-500 tracking-tight">DSS</h1>
                    {appState !== 'initial' && (
                        <button 
                            onClick={() => setIsResetConfirmOpen(true)} 
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-md bg-stone-800 hover:bg-stone-700 border border-stone-700 transition-colors text-stone-300 shadow-sm"
                            title="새 프로젝트"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            <span>새 프로젝트</span>
                        </button>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-8">
                    <div className="space-y-2">
                        <h3 className="text-[10px] font-bold text-orange-300 bg-orange-900/40 border border-orange-800/50 rounded-md px-2 py-1 uppercase tracking-widest mb-3 inline-block shadow-sm">Project</h3>
                        <button onClick={actions.handleExportProject} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-orange-900/20 hover:bg-orange-900/40 border border-orange-500/30 hover:border-orange-500/50 transition-all text-orange-300 hover:text-orange-200 group shadow-sm">
                            <div className="p-1.5 rounded-lg bg-orange-800/40 border border-orange-700/50 group-hover:bg-orange-800/60 transition-colors">
                                <DocumentArrowDownIcon className="w-4 h-4 text-orange-400" />
                            </div>
                            <span>프로젝트 내보내기</span>
                        </button>
                        {appState === 'initial' && (
                            <button onClick={() => importProjectFileRef.current?.click()} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-orange-900/20 hover:bg-orange-900/40 border border-orange-500/30 hover:border-orange-500/50 transition-all text-orange-300 hover:text-orange-200 group shadow-sm">
                                <div className="p-1.5 rounded-lg bg-orange-800/40 border border-orange-700/50 group-hover:bg-orange-800/60 transition-colors">
                                    <DocumentArrowUpIcon className="w-4 h-4 text-orange-400" />
                                </div>
                                <span>프로젝트 가져오기</span>
                            </button>
                        )}
                    </div>

                    {appState === 'storyboardGenerated' && (
                        <>
                            <div className="space-y-2">
                                <h3 className="text-[10px] font-bold text-amber-300 bg-amber-900/40 border border-amber-800/50 rounded-md px-2 py-1 uppercase tracking-widest mb-3 inline-block shadow-sm">Tools</h3>
                                <button onClick={() => actions.setUIState({ isCostumeModalOpen: true })} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-amber-900/20 hover:bg-amber-900/40 border border-amber-500/30 hover:border-amber-500/50 transition-all text-amber-300 hover:text-amber-200 group shadow-sm">
                                    <div className="p-1.5 rounded-lg bg-amber-800/40 border border-amber-700/50 group-hover:bg-amber-800/60 transition-colors">
                                        <UserIcon className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <span>캐릭터/의상 수정</span>
                                </button>
                                <button onClick={actions.handleOpenReviewModalForEdit} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-amber-900/20 hover:bg-amber-900/40 border border-amber-500/30 hover:border-amber-500/50 transition-all text-amber-300 hover:text-amber-200 group shadow-sm">
                                    <div className="p-1.5 rounded-lg bg-amber-800/40 border border-amber-700/50 group-hover:bg-amber-800/60 transition-colors">
                                        <ClipboardIcon className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <span>스토리보드 재검수</span>
                                </button>
                                <button onClick={() => actions.setUIState({ isCutSelectionModalOpen: true })} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-amber-900/20 hover:bg-amber-900/40 border border-amber-500/30 hover:border-amber-500/50 transition-all text-amber-300 hover:text-amber-200 group shadow-sm">
                                    <div className="p-1.5 rounded-lg bg-amber-800/40 border border-amber-700/50 group-hover:bg-amber-800/60 transition-colors">
                                        <CheckIcon className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <span>선택 컷 자동 생성</span>
                                </button>
                                <button onClick={actions.handleToggleAutoGeneration} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all group shadow-sm border ${isAutoGenerating ? 'bg-red-900/20 hover:bg-red-900/30 border-red-900/50 text-red-300' : 'bg-amber-900/20 hover:bg-amber-900/40 border-amber-500/30 hover:border-amber-500/50 text-amber-300 hover:text-amber-200'}`}>
                                    <div className={`p-1.5 rounded-lg border transition-colors ${isAutoGenerating ? 'bg-red-900/40 border-red-800/50 group-hover:bg-red-800/50' : 'bg-amber-800/40 border-amber-700/50 group-hover:bg-amber-800/60'}`}>
                                        {isAutoGenerating ? <StopIcon className="w-4 h-4 text-red-400" /> : <SparklesIcon className="w-4 h-4 text-amber-400" />}
                                    </div>
                                    <span>{isAutoGenerating ? '생성 중단' : '전체 컷 자동 생성'}</span>
                                </button>
                                {failedCutNumbers.length > 0 && !isAutoGenerating && (
                                    <button onClick={actions.handleRetryFailedCuts} disabled={isLoading} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-orange-900/10 hover:bg-orange-900/20 border border-orange-900/30 transition-all text-orange-300 group shadow-sm disabled:opacity-50">
                                        <div className="p-1.5 rounded-lg bg-orange-900/30 border border-orange-800/50 group-hover:bg-orange-800/40 transition-colors">
                                            <RefreshIcon className="w-4 h-4 text-orange-400" />
                                        </div>
                                        <span>실패 컷 재시도 ({failedCutNumbers.length})</span>
                                    </button>
                                )}
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-[10px] font-bold text-amber-300 bg-amber-900/40 border border-amber-800/50 rounded-md px-2 py-1 uppercase tracking-widest mb-3 inline-block shadow-sm">Audio</h3>
                                <button onClick={actions.handleOpenAudioSplitter} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-amber-900/20 hover:bg-amber-900/40 border border-amber-500/30 hover:border-amber-500/50 transition-all text-amber-300 hover:text-amber-200 group shadow-sm">
                                    <div className="p-1.5 rounded-lg bg-amber-800/40 border border-amber-700/50 group-hover:bg-amber-800/60 transition-colors">
                                        <ScissorsIcon className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <span>오디오 스플리터</span>
                                </button>
                                <button onClick={() => actions.setUIState({ isBatchAudioModalOpen: true })} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-amber-900/20 hover:bg-amber-900/40 border border-amber-500/30 hover:border-amber-500/50 transition-all text-amber-300 hover:text-amber-200 group shadow-sm">
                                    <div className="p-1.5 rounded-lg bg-amber-800/40 border border-amber-700/50 group-hover:bg-amber-800/60 transition-colors">
                                        <MicrophoneIcon className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <span>음성 일괄 추가</span>
                                </button>
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-[10px] font-bold text-amber-300 bg-amber-900/40 border border-amber-800/50 rounded-md px-2 py-1 uppercase tracking-widest mb-3 inline-block shadow-sm">Export & Render</h3>
                                <div className="relative" ref={downloadDropdownRef}>
                                    <button onClick={() => isZipping ? actions.handleCancelZipping() : actions.setUIState({ isDownloadDropdownOpen: !isDownloadDropdownOpen })} className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-xl border transition-all shadow-sm group ${isZipping ? 'bg-amber-900/30 border-amber-500/50 text-amber-300 hover:bg-amber-900/50' : 'bg-amber-900/20 hover:bg-amber-900/40 border-amber-500/30 hover:border-amber-500/50 text-amber-300 hover:text-amber-200'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-lg border transition-colors ${isZipping ? 'bg-amber-800/50 border-amber-700/50' : 'bg-amber-800/40 border-amber-700/50 group-hover:bg-amber-800/60'}`}>
                                                {isZipping ? <SpinnerIcon className="w-4 h-4 text-amber-400" /> : <DownloadIcon className="w-4 h-4 text-amber-400" />}
                                            </div>
                                            <div className="flex flex-col items-start">
                                                <span>{isZipping ? (zippingProgress?.isCancelling ? '취소 중...' : '다운로드 중...') : '다운로드'}</span>
                                                {isZipping && zippingProgress && zippingProgress.total > 0 && (
                                                    <span className="text-[10px] text-amber-400/80">{zippingProgress.current} / {zippingProgress.total}</span>
                                                )}
                                            </div>
                                        </div>
                                        {isZipping ? (
                                            <div className="p-1 hover:bg-amber-800/50 rounded-md transition-colors" title="다운로드 취소">
                                                <XIcon className="w-4 h-4 text-amber-400" />
                                            </div>
                                        ) : (
                                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${isDownloadDropdownOpen ? 'rotate-180' : ''}`} />
                                        )}
                                    </button>
                                    {isDownloadDropdownOpen && !isZipping && (
                                        <div className="absolute top-full left-0 mt-2 w-full bg-stone-800 border border-stone-700 rounded-xl shadow-2xl z-20 overflow-hidden py-1">
                                            <button onClick={() => { actions.handleDownloadAllImagesZip(); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-700 hover:text-white transition-colors">전체 이미지 다운로드</button>
                                            <button onClick={() => { actions.handleDownloadSelectedImagesZip(); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-700 hover:text-white transition-colors">선택 이미지 다운로드</button>
                                            <div className="border-t border-stone-700/50 my-1"></div>
                                            <button onClick={() => { actions.handleDownloadSRT(); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-700 hover:text-white transition-colors">AI 자막 (SRT) 다운로드</button>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => actions.setUIState({ isSlideshowOpen: true })} disabled={slideshowData.length === 0} className="w-full flex items-center gap-3 px-3 py-2.5 mt-2 text-sm font-medium rounded-xl bg-amber-900/20 hover:bg-amber-900/40 border border-amber-500/30 hover:border-amber-500/50 transition-all text-amber-300 hover:text-amber-200 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group">
                                    <div className="p-1.5 rounded-lg bg-amber-800/40 border border-amber-700/50 group-hover:bg-amber-800/60 transition-colors">
                                        <PlayIcon className="w-4 h-4 text-amber-400" />
                                    </div>
                                    <span>영상 렌더링</span>
                                </button>
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-[10px] font-bold text-orange-300 bg-orange-900/40 border border-orange-800/50 rounded-md px-2 py-1 uppercase tracking-widest mb-3 inline-block shadow-sm">Settings</h3>
                                <div className="relative" ref={modelDropdownRef}>
                                    <button 
                                        onClick={() => actions.setUIState({ isModelDropdownOpen: !isModelDropdownOpen })}
                                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-xl bg-orange-900/20 hover:bg-orange-900/40 border border-orange-500/30 hover:border-orange-500/50 transition-all text-orange-300 hover:text-orange-200 group shadow-sm"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 rounded-lg bg-orange-800/40 border border-orange-700/50 group-hover:bg-orange-800/60 transition-colors">
                                                <SparklesIcon className="w-4 h-4 text-orange-400" />
                                            </div>
                                            <span>{state.selectedNanoModel === 'nano-2.5' ? 'Nano 2.5' : state.selectedNanoModel === 'nano-3.1' ? 'Nano 3.1' : 'Nano 3 Pro'}</span>
                                        </div>
                                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isModelDropdownOpen && (
                                        <div className="absolute top-full left-0 mt-2 w-full bg-stone-800 border border-stone-700 rounded-xl shadow-2xl z-20 overflow-hidden py-1">
                                            <button onClick={() => { dispatch({ type: 'SET_NANO_MODEL', payload: 'nano-2.5' }); actions.setUIState({ isModelDropdownOpen: false }); }} className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-stone-700 ${state.selectedNanoModel === 'nano-2.5' ? 'text-orange-400 font-semibold' : 'text-stone-300 hover:text-white'}`}>Nano 2.5</button>
                                            <button onClick={() => { dispatch({ type: 'SET_NANO_MODEL', payload: 'nano-3.1' }); actions.setUIState({ isModelDropdownOpen: false }); }} className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-stone-700 ${state.selectedNanoModel === 'nano-3.1' ? 'text-orange-400 font-semibold' : 'text-stone-300 hover:text-white'}`}>Nano 3.1</button>
                                            <button onClick={() => { dispatch({ type: 'SET_NANO_MODEL', payload: 'nano-3pro' }); actions.setUIState({ isModelDropdownOpen: false }); }} className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-stone-700 ${state.selectedNanoModel === 'nano-3pro' ? 'text-orange-400 font-semibold' : 'text-stone-300 hover:text-white'}`}>Nano 3 Pro</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                <div className="p-4 border-t border-stone-800 bg-stone-950/50">
                    <div className="flex flex-col gap-1 text-[10px] font-mono text-stone-500">
                        <div className="flex justify-between">
                            <span>Tokens</span>
                            <span className="text-orange-400">{geminiTokenCount.toLocaleString()}</span>
                        </div>
                        {sceneAndCutCounts && (
                            <div className="flex justify-between">
                                <span>Scenes / Cuts</span>
                                <span className="text-stone-400">{sceneAndCutCounts.sceneCount} / {sceneAndCutCounts.cutCount}</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {isResetConfirmOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
                    <div className="bg-stone-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border border-stone-700">
                        <h3 className="text-lg font-bold text-white mb-2">새 프로젝트를 시작하시겠습니까?</h3>
                        <p className="text-sm text-stone-300 mb-6">
                            현재 작업 중인 모든 데이터가 삭제되고 초기화됩니다. 계속하시겠습니까?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => setIsResetConfirmOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-stone-300 bg-stone-700 hover:bg-stone-600 rounded-lg transition-colors"
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

            <main className="flex-1 flex flex-col relative overflow-y-auto bg-stone-950 p-6">
                {isLoading && (
                    <div className="absolute inset-0 bg-black/80 z-[99] flex flex-col items-center justify-center backdrop-blur-sm pt-16">
                        <div className="w-full max-w-md p-8 bg-stone-900/90 rounded-3xl border border-stone-700 shadow-2xl flex flex-col items-center">
                            <SpinnerIcon className="w-16 h-16 text-orange-500 mb-6" />
                            
                            <h3 className="text-xl font-bold text-white mb-2">{analysisStage !== 'idle' ? STAGE_LABELS[analysisStage] : loadingMessage}</h3>
                            
                            {analysisStage !== 'idle' && (
                                <div className="w-full mt-4 space-y-2">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Analysis Progress</span>
                                        <span className="text-lg font-mono font-bold text-white">{analysisProgress}%</span>
                                    </div>
                                    <div className="w-full h-3 bg-stone-800 rounded-full overflow-hidden border border-stone-700 p-0.5">
                                        <div 
                                            className="h-full bg-gradient-to-r from-orange-600 to-amber-500 rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(249,115,22,0.5)]"
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
                                                <div key={i} className={`h-1 rounded-full ${isCompleted ? 'bg-orange-500' : isActive ? 'bg-orange-400 animate-pulse' : 'bg-stone-800'}`} />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            
                            {loadingMessageDetail && (
                                <p className="mt-6 text-sm text-stone-400 text-center italic bg-stone-950/50 p-3 rounded-xl border border-stone-800 w-full">
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
                                    onClick={() => dispatch({ type: 'STOP_LOADING' })}
                                    className="mt-8 px-6 py-2 rounded-full bg-stone-600/20 text-stone-400 border border-stone-600/30 text-xs font-bold hover:bg-stone-600 hover:text-white transition-all active:scale-95"
                                >
                                    중단하기
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {appState === 'initial' && (
                     <div className="max-w-7xl mx-auto py-12 lg:py-20 animate-fade-in w-full">
                        <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 items-start">
                            {/* Left Panel: Input */}
                            <div className="flex flex-col gap-6 lg:col-span-7">
                                <div>
                                    <h2 className="text-5xl lg:text-6xl font-extrabold tracking-tight mb-4"><span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500">도레미썰 스튜디오</span></h2>
                                    <p className="text-lg text-stone-300">당신의 스토리가 생명을 얻는 곳. 대본을 입력하고 AI가 만들어내는 놀라운 비주얼을 경험하세요.</p>
                                </div>
                                <div 
                                    className={`bg-stone-900/80 p-6 rounded-2xl shadow-2xl border transition-all relative flex flex-col h-[600px] ${isDragOverInput ? 'border-orange-500 ring-4 ring-orange-500/20' : 'border-stone-700'}`}
                                    onDragOver={handleInputDragOver}
                                    onDragLeave={handleInputDragLeave}
                                    onDrop={handleInputDrop}
                                >
                                   {isDragOverInput && (
                                        <div className="absolute inset-0 bg-orange-500/10 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl pointer-events-none">
                                            <div className="bg-stone-800 p-4 rounded-xl shadow-xl flex items-center gap-3 animate-bounce border border-orange-500/30">
                                                <DocumentArrowUpIcon className="w-8 h-8 text-orange-500" />
                                                <span className="text-lg font-bold text-orange-400">프로젝트 파일 열기</span>
                                            </div>
                                        </div>
                                    )}
                                   <textarea 
                                        value={localScript} 
                                        onChange={handleScriptChange} 
                                        onBlur={handleScriptBlur}
                                        placeholder="여기에 대본이나 시나리오를 붙여넣으세요..." 
                                        className="w-full flex-1 p-6 bg-stone-950/50 rounded-xl border border-stone-800 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:shadow-[0_0_15px_rgba(249,115,22,0.5)] transition-all resize-none text-stone-300 text-lg leading-relaxed font-medium"
                                    />
                                    
                                    <div className="mt-6 flex flex-col sm:flex-row justify-end items-center gap-4">
                                        <button 
                                            onClick={() => actions.setUIState({ isCutPreviewModalOpen: true })} 
                                            disabled={!localScript.trim()}
                                            className="w-full sm:w-auto group flex items-center justify-center gap-2 px-6 py-4 text-base font-bold text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-xl transition-all duration-300 border border-stone-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ScissorsIcon className="w-5 h-5" />
                                            <span>컷 분할 확인</span>
                                        </button>
                                        <button 
                                            onClick={() => actions.setUIState({ isStyleModalOpen: true })} 
                                            disabled={!localScript.trim()}
                                            className="w-full sm:w-auto group flex items-center justify-center gap-3 px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 rounded-xl hover:from-orange-700 hover:to-amber-600 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                        >
                                            <span>스튜디오 시작하기</span>
                                            <ChevronRightIcon className="w-6 h-6 transition-transform duration-300 group-hover:translate-x-1" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Panel: Settings & Info */}
                            <div className="flex flex-col gap-6 lg:col-span-3">
                                <button onClick={() => importProjectFileRef.current?.click()} className="w-full group flex items-center justify-center gap-3 px-6 py-4 text-sm font-bold text-stone-300 bg-stone-800/80 hover:bg-stone-700 rounded-xl transition-all duration-300 border border-stone-700 hover:border-stone-500">
                                    <DocumentArrowUpIcon className="w-5 h-5 text-orange-400" />
                                    <span>기존 프로젝트 불러오기</span>
                                </button>

                                <button onClick={() => setIsApiKeySettingsOpen(true)} className="w-full group flex items-center justify-center gap-3 px-6 py-4 text-sm font-bold text-stone-300 bg-stone-800/80 hover:bg-stone-700 rounded-xl transition-all duration-300 border border-stone-700 hover:border-orange-500">
                                    <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
                                    <span>API 키 설정</span>
                                </button>

                                <div className="p-6 bg-stone-900/80 border border-stone-700 rounded-xl shadow-lg">
                                    <h3 className="text-xs font-mono text-stone-500 uppercase tracking-widest mb-4">Project Settings</h3>
                                    
                                    <div className="space-y-6">
                                        <div>
                                            <label htmlFor="storyTitleInput" className="block text-sm font-medium text-stone-300 mb-2">스토리 제목</label>
                                            <div className="flex gap-2">
                                                <input id="storyTitleInput" type="text" value={storyTitle || ''} onChange={(e) => dispatch({ type: 'SET_STORY_TITLE', payload: e.target.value })} placeholder="제목 입력" className="flex-1 p-2.5 bg-stone-950 rounded-lg border border-stone-700 focus:ring-1 focus:ring-orange-500 text-sm"/>
                                                <button onClick={actions.handleGenerateTitles} disabled={isGeneratingTitles} className="flex-shrink-0 flex items-center justify-center px-3 py-2.5 text-xs font-semibold rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors text-orange-400 border border-stone-700 disabled:opacity-50" title="AI 제목 추천">
                                                    {isGeneratingTitles ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {titleSuggestions.length > 0 && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {titleSuggestions.map((title, index) => (
                                                        <button key={index} onClick={() => dispatch({ type: 'SET_STORY_TITLE', payload: title })} className="text-left px-2.5 py-1.5 text-xs rounded-md bg-stone-800 hover:bg-stone-700 transition-colors text-stone-300 border border-stone-700">{title}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-stone-300 mb-2">주요 화자 (주인공 성별)</label>
                                            <div className="flex gap-2 p-1 bg-stone-950 rounded-lg border border-stone-800">
                                                <button onClick={() => dispatch({type: 'SET_SPEAKER_GENDER', payload: 'male'})} className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${speakerGender === 'male' ? 'bg-orange-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'}`}>남자</button>
                                                <button onClick={() => dispatch({type: 'SET_SPEAKER_GENDER', payload: 'female'})} className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${speakerGender === 'female' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'}`}>여자</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-stone-900/80 border border-orange-500/20 rounded-xl shadow-lg relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                                    <h3 className="text-xs font-mono text-orange-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <SparklesIcon className="w-4 h-4" /> 흥행 연출 공식
                                    </h3>
                                    <div className="space-y-5 relative z-10">
                                        <div>
                                            <h4 className="font-bold text-stone-200 text-sm mb-1 flex items-center gap-2">
                                                <UserCircleIcon className="w-4 h-4 text-orange-400" /> 주인공 (동질감)
                                            </h4>
                                            <p className="text-xs text-stone-400 leading-relaxed">시청자가 대입할 수 있는 훈훈한 인물. 과한 표정 대신 만화적 기호(땀방울 등)로 감정 표현.</p>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-stone-200 text-sm mb-1 flex items-center gap-2">
                                                <SparklesIcon className="w-4 h-4 text-amber-400" /> 상대역 (도파민)
                                            </h4>
                                            <p className="text-xs text-stone-400 leading-relaxed">시선을 사로잡는 빛나는 미모. 반짝이는 배경 효과와 화사한 보정으로 시각적 즐거움 극대화.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {appState === 'storyboardGenerated' && generatedContent && (
                    <div className="grid grid-cols-1 xl:grid-cols-10 gap-8">
                        <div className="xl:col-span-7 space-y-8">
                            <div className="overflow-y-auto" style={{maxHeight: stickyColumnStyle.height}}>
                                {enrichedScript && (
                                    <div className="bg-stone-900/50 border border-stone-700 rounded-2xl p-6 mb-8 shadow-lg">
                                        <div className="flex justify-between items-center cursor-pointer group" onClick={() => actions.setUIState({ isEnrichedScriptVisible: !isEnrichedScriptVisible })}>
                                            <h3 className="text-xl font-bold text-amber-400 group-hover:text-amber-300 transition-colors">AI 감독 연출 강화 대본</h3>
                                            <ChevronDownIcon className={`w-6 h-6 text-stone-400 transition-transform duration-300 ${isEnrichedScriptVisible ? 'rotate-180' : ''}`} />
                                        </div>
                                        <div className={`transition-all duration-500 ease-in-out ${isEnrichedScriptVisible ? 'max-h-[500px] overflow-y-auto pt-4' : 'max-h-0 overflow-hidden pt-0'}`}>
                                            <div className="prose prose-sm prose-invert bg-stone-800 p-4 rounded-md whitespace-pre-wrap text-stone-300 shadow-inner">
                                                {enrichedScript}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {(generatedContent.scenes || []).filter(Boolean).map(scene => (<SceneContainer key={scene.sceneNumber} scene={scene} />))}
                            </div>
                        </div>

                        <div className="xl:col-span-3 flex flex-col gap-2 sticky min-w-0" style={stickyColumnStyle}>
                            <div className="flex bg-stone-900/50 p-1 rounded-t-lg border-b border-stone-800">
                                <button 
                                    onClick={() => setRightPanelTab('studio')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${rightPanelTab === 'studio' ? 'bg-orange-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'}`}
                                >
                                    스튜디오
                                </button>
                                <button 
                                    onClick={() => setRightPanelTab('history')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${rightPanelTab === 'history' ? 'bg-orange-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'}`}
                                >
                                    히스토리 ({generatedImageHistory.length})
                                </button>
                            </div>

                            {rightPanelTab === 'studio' ? (
                                <div className="flex-grow overflow-y-auto flex flex-col">
                                    <ImageStudio studioId="a" title="Studio" session={studioSessions.a} isNextSlot={false} onEdit={actions.handleEditInStudio} onCreate={actions.handleCreateInStudio} onClear={actions.handleClearStudioSession} onRevert={actions.handleRevertInStudio} onUndo={actions.handleUndoInStudio} onCopyOriginalToCurrent={actions.handleCopyOriginalToCurrent} onSaveToHistory={actions.handleSaveStudioToHistory} onReferenceChange={actions.handleStudioReferenceChange} isLoading={isLoading} onImageUpload={actions.handleUserImageUpload} onUpdateCurrentImageFromUpload={actions.handleUpdateStudioImageFromUpload} onPromptChange={actions.handleStudioPromptChange} onLoadImage={actions.handleLoadImageIntoStudio} onSetOriginalImage={actions.handleSetOriginalImage} isActiveTarget={activeStudioTarget === 'a'} onSetActiveTarget={actions.handleSetActiveStudioTarget} onTransformChange={actions.handleStudioTransformChange} onCommitTransform={actions.handleCommitStudioTransform} fillImageFunction={actions.handleFillImageWithNanoWithRetry} addNotification={actions.addNotification} onGenerateMask={actions.handleGenerateMask} onSelectTargetCut={actions.handleOpenTargetCutSelector} onOpenImageViewer={actions.handleOpenImageViewer} />
                                </div>
                            ) : (
                                <div className="flex-grow flex flex-col gap-2 overflow-hidden">
                                    <div className="flex justify-between items-center px-2 py-1">
                                        <div className="flex-1"></div>
                                        {appState === 'storyboardGenerated' && (
                                            <button 
                                                onClick={() => actions.setUIState({ isStyleModalOpen: true })}
                                                className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-full transition-colors group"
                                                title="화풍 변경하기"
                                            >
                                                <PaintBrushIcon className="w-3.5 h-3.5 text-orange-400 group-hover:text-orange-300" />
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Style:</span>
                                                <span className="text-xs font-bold text-orange-300 group-hover:text-orange-200">{STYLE_NAMES[artStyle] || artStyle}</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <div 
                                            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsBgMusicDragging(true); }} 
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} 
                                            onDragLeave={(e) => { 
                                                e.preventDefault(); 
                                                e.stopPropagation(); 
                                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                    setIsBgMusicDragging(false); 
                                                }
                                            }} 
                                            onDrop={(e) => { 
                                                e.preventDefault(); 
                                                e.stopPropagation(); 
                                                setIsBgMusicDragging(false); 
                                                const file = e.dataTransfer.files?.[0]; 
                                                if (file && file.type.startsWith('audio/')) { 
                                                    const reader = new FileReader(); 
                                                    reader.onload = (ev) => dispatch({ type: 'SET_BACKGROUND_MUSIC', payload: { url: ev.target?.result as string, name: file.name } }); 
                                                    reader.readAsDataURL(file); 
                                                } else { 
                                                    actions.addNotification('오디오 파일만 드롭할 수 있습니다.', 'error'); 
                                                } 
                                            }} 
                                            className={`flex-1 p-2 rounded-lg border-2 border-dashed transition-colors ${isBgMusicDragging ? 'border-orange-500 bg-orange-900/30' : 'border-stone-800'}`}
                                        >
                                            {backgroundMusicUrl ? (<div className="flex items-center justify-between text-xs"><div className="text-stone-300 flex items-center gap-2 overflow-hidden min-w-0"><SpeakerWaveIcon className="w-4 h-4 flex-shrink-0 text-orange-400"/><div className="min-w-0"><p className="font-semibold">BGM:</p><p className="truncate" title={backgroundMusicName || ''}>{backgroundMusicName || 'Loaded'}</p></div></div><button onClick={() => dispatch({ type: 'SET_BACKGROUND_MUSIC', payload: { url: null, name: null } })} className="p-1 text-stone-400 hover:text-red-400 flex-shrink-0"><TrashIcon className="w-4 h-4" /></button></div>) : (<div className="text-center text-xs text-stone-500 py-2.5"><p>BGM</p><p>Drop</p></div>)}
                                        </div>
                                    </div>
                                    <div className="flex-grow bg-stone-950 p-3 rounded-lg border border-stone-800 overflow-y-auto">
                                        {generatedImageHistory.length === 0 ? (<p className="text-xs text-stone-500 text-center py-8">No images generated yet.</p>) : (
                                            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-3">
                                                {generatedImageHistory.map(image => {
                                                    let downloadFilename = `cut_${image.sourceCutNumber}_${image.id.substring(0,6)}.png`;
                                                    if (image.sourceCutNumber && image.sourceCutNumber.includes('-')) { const [scenePart, cutPart] = image.sourceCutNumber.split('-'); if (cutPart) { downloadFilename = `cut_${scenePart}-${cutPart.padStart(2, '0')}_${image.id.substring(0,6)}.png`; } }
                                                    return (
                                                        <div key={image.id} className="relative group aspect-square" draggable={true} onDragStart={(e) => { e.dataTransfer.setData('application/x-studio-image-source', JSON.stringify({ image })); e.dataTransfer.setData('text/plain', JSON.stringify({ image })); }}>
                                                            <img src={image.imageUrl} alt={`Cut ${image.sourceCutNumber}`} className="w-full h-full object-cover rounded-md cursor-pointer border-2 border-transparent group-hover:border-orange-500" onClick={() => actions.handleOpenImageViewer(image.imageUrl, `Image for cut ${image.sourceCutNumber}`, image.prompt)}/>
                                                             <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md" onClick={() => actions.handleOpenImageViewer(image.imageUrl, `Image for cut ${image.sourceCutNumber}`, image.prompt)}>
                                                                <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                    <button onClick={() => actions.handleSendImageToStudio(image)} className="p-2 bg-orange-600/80 text-white rounded-full hover:bg-orange-700" title="스튜디오로 보내기"><PencilIcon className="w-5 h-5"/></button>
                                                                     <a href={image.imageUrl} download={downloadFilename} className="p-2 bg-green-600/80 text-white rounded-full hover:bg-green-700" title="이미지 다운로드"><DownloadIcon className="w-5 h-5"/></a>
                                                                    <button onClick={() => actions.handleDeleteFromHistory(image.id)} className="p-2 bg-red-600/80 text-white rounded-full hover:bg-red-700" title="이미지 삭제"><TrashIcon className="w-5 h-5"/></button>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => actions.handleScrollToCut(image.sourceCutNumber)} className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-md font-mono hover:bg-orange-600 hover:scale-105 transition-all" title={`컷 #${image.sourceCutNumber}으로 이동`}>#{image.sourceCutNumber}</button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
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

            {isStyleModalOpen && (<StyleSelectionModal isOpen={isStyleModalOpen} onClose={() => actions.setUIState({ isStyleModalOpen: false })} onConfirm={(style, customText) => { dispatch({ type: 'SET_ART_STYLE', payload: style }); dispatch({ type: 'SET_CUSTOM_ART_STYLE', payload: customText }); actions.setUIState({ isStyleModalOpen: false }); actions.handleStartStudio({ artStyle: style, customArtStyle: customText }); }} />)}
            {isCutPreviewModalOpen && (
                <CutPreviewModal
                    isOpen={isCutPreviewModalOpen}
                    onClose={() => actions.setUIState({ isCutPreviewModalOpen: false })}
                    onConfirm={() => actions.setUIState({ isStyleModalOpen: true })}
                    script={localScript}
                />
            )}
            {isCutSelectionModalOpen && generatedContent && (<CutSelectionModal isOpen={isCutSelectionModalOpen} onClose={() => actions.setUIState({ isCutSelectionModalOpen: false })} scenes={generatedContent.scenes} onConfirm={(selectedCuts) => { actions.setUIState({ isCutSelectionModalOpen: false }); actions.handleRunSelectiveGeneration(selectedCuts); }} />)}
            {isThirdCharacterStudioOpen && (<ThirdCharacterStudioModal isOpen={isThirdCharacterStudioOpen} onClose={() => actions.setUIState({ isThirdCharacterStudioOpen: false })} generatedImageHistory={generatedImageHistory} onConfirm={actions.handleThirdCharacterEdit} />)}
            {isCutSplitterOpen && cutToSplit && (<CutSplitterModal isOpen={isCutSplitterOpen} onClose={() => dispatch({ type: 'CLOSE_CUT_SPLITTER' })} cut={cutToSplit} onConfirm={actions.handleConfirmCutSplit} />)}
            {isCostumeModalOpen && (<CostumeStudioModal 
                isOpen={isCostumeModalOpen} 
                onClose={() => actions.setUIState({ isCostumeModalOpen: false })} 
                characterDescriptions={characterDescriptions} 
                onUpdateCharacterDescription={(key, data) => dispatch({ type: 'UPDATE_CHARACTER_DESCRIPTION', payload: { key, data } })} 
                onUploadSourceImage={actions.handleUploadSourceImageForStudio} 
                onUploadUpscaledImage={actions.handleUploadUpscaledImageForStudio} // Pass the new handler
                onUpscaleImage={actions.handleUpscaleCharacterImage} 
                onInjectPersonality={actions.handleInjectPersonality} 
                handleEditSignaturePose={actions.handleEditSignaturePose}
                handleUndoSignaturePoseEdit={actions.handleUndoSignaturePoseEdit}
                handleEditMannequin={actions.handleEditMannequin}
                handleUndoMannequin={actions.handleUndoMannequin}
                onGenerateLocationOutfits={actions.handleGenerateLocationOutfits} 
                onGenerateOutfitImage={actions.handleGenerateOutfitImage} 
                onTryOnOutfit={actions.handleTryOnOutfit} 
                onModifyOutfitDescription={actions.handleModifyOutfitDescription} 
                onConfirm={appState === 'storyboardGenerated' ? actions.handleApplyCharacterChangesToAllCuts : actions.handleGenerateStoryboardWithCustomCostumes} 
                onOpenImageViewer={actions.handleOpenImageViewer} 
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
            {isTargetCutSelectionModalOpen && (<CutAssignmentModal isOpen={isTargetCutSelectionModalOpen} onClose={() => actions.setUIState({ isTargetCutSelectionModalOpen: false, targetCutSelectionStudioId: null })} scenes={generatedContent?.scenes || []} onConfirm={actions.handleConfirmTargetCutSelection} title="타겟 컷 선택" description={`스튜디오 ${state.targetCutSelectionStudioId?.toUpperCase()}에서 작업할 컷을 선택하세요.`} />)}
            {isImageViewerOpen && viewerImage && (<ImageViewerModal isOpen={isImageViewerOpen} onClose={() => actions.setUIState({ isImageViewerOpen: false })} imageUrl={viewerImage.url} altText={viewerImage.alt} prompt={viewerImage.prompt} />)}
            {isEditorOpen && editingImageInfo && (<ImageEditorModal isOpen={isEditorOpen} onClose={() => actions.setUIState({ isEditorOpen: false })} onSave={(newUrl) => { const originalImage = generatedImageHistory.find(img => img.imageUrl === editingImageInfo.url); if (originalImage) { actions.handleSaveFromEditor(newUrl, originalImage); } else { actions.addNotification('원본 이미지를 찾을 수 없어 저장에 실패했습니다.', 'error'); } }} targetImage={editingImageInfo} allCharacterDescriptions={characterDescriptions} masterStyleSourceImageUrl={null} editImageFunction={actions.handleEditImageWithNanoWithRetry} outpaintImageFunction={actions.handleOutpaintImageWithNanoWithRetry} fillImageFunction={actions.handleFillImageWithNanoWithRetry} />)}
            {isTextEditorOpen && textEditingTarget && (<TextEditorModal isOpen={isTextEditorOpen} onClose={() => actions.setUIState({ isTextEditorOpen: false })} target={textEditingTarget} onRender={actions.handleTextRender} />)}
            {isSlideshowOpen && (<SlideshowModal isOpen={isSlideshowOpen} onClose={() => actions.setUIState({ isSlideshowOpen: false })} slideshowItems={slideshowData} storyTitle={storyTitle} generateSpeech={generateSpeech} addNotification={actions.addNotification} handleAddUsage={actions.handleAddUsage} backgroundMusicUrl={backgroundMusicUrl} />)}
            <ApiKeySettings isOpen={isApiKeySettingsOpen} onClose={() => setIsApiKeySettingsOpen(false)} />
        </div>
    );
};
