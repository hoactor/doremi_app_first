
import React, { useState, useEffect, useCallback } from 'react';
import {
    PlusIcon, BookmarkSquareIcon, FolderOpenIcon, DocumentArrowDownIcon, DocumentArrowUpIcon,
    UserIcon, ClipboardIcon, PhotoIcon, CheckIcon, SparklesIcon, StopIcon, RefreshIcon,
    ScissorsIcon, MicrophoneIcon, DownloadIcon, XIcon, ChevronDownIcon, PlayIcon,
    PaintBrushIcon, CogIcon, ArrowsRightLeftIcon, ArrowTopRightOnSquareIcon, SpinnerIcon
} from './icons';
import { IS_TAURI, openAssetCatalog, resetWindowSize, loadLoraRegistry } from '../services/tauriAdapter';
import { LoraRegistryModal } from './LoraRegistryModal';
import type { LoRAEntry } from '../types';

const STYLE_NAMES: Record<string, string> = {
    'normal': '정통 썰툰',
    'vibrant': '도파민',
    'kyoto': '시네마 감성',
    'moe': '극강 귀요미',
    'dalle-chibi': '프리미엄',
    'custom': '커스텀 스타일'
};

interface SidebarProps {
    // 상태
    appState: string;
    artStyle: string;
    isLoading: boolean;
    isZipping: boolean;
    isAutoGenerating: boolean;
    isGeneratingSRT: boolean;
    isDownloadDropdownOpen: boolean;
    selectedImageEngine: string;
    selectedNanoModel: string;
    selectedFluxModel: string;
    zippingProgress: any;
    saveStatus: 'idle' | 'saving' | 'saved';
    falUsage: { totalImages: number; totalCost: number } | null;
    claudeTokenCount: number;
    geminiTokenCount: number;
    sceneAndCutCounts: { sceneCount: number; cutCount: number } | null;
    hasSlideshowData: boolean;
    failedCutNumbers: string[];
    isAssetWindowOpen: boolean;
    styleLoraId?: string;
    styleLoraScaleOverride?: number;
    // refs
    downloadDropdownRef: React.RefObject<HTMLDivElement | null>;
    importProjectFileRef: React.RefObject<HTMLInputElement | null>;
    // 핸들러
    dispatch: React.Dispatch<any>;
    actions: any;
    handleSaveWithStatus: () => void;
    // 로컬 상태 setter
    setIsResetConfirmOpen: (v: boolean) => void;
    setIsCutDetailOpen: (v: boolean) => void;
    setIsApiKeySettingsOpen: (v: boolean) => void;
    setIsAssetCatalogOpen: (v: boolean) => void;
    setIsAssetWindowOpen: (v: boolean) => void;
    setIsProjectListOpen: (v: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    appState, artStyle, isLoading, isZipping, isAutoGenerating, isGeneratingSRT,
    isDownloadDropdownOpen, selectedImageEngine, selectedNanoModel,
    selectedFluxModel, zippingProgress, saveStatus, falUsage, claudeTokenCount,
    geminiTokenCount, sceneAndCutCounts, hasSlideshowData, failedCutNumbers,
    isAssetWindowOpen, styleLoraId, styleLoraScaleOverride,
    downloadDropdownRef, importProjectFileRef, dispatch, actions,
    handleSaveWithStatus, setIsResetConfirmOpen, setIsCutDetailOpen,
    setIsApiKeySettingsOpen, setIsAssetCatalogOpen, setIsAssetWindowOpen, setIsProjectListOpen
}) => {
    // ── LoRA 상태 ──
    const [loraEntries, setLoraEntries] = useState<LoRAEntry[]>([]);
    const [isLoraRegistryOpen, setIsLoraRegistryOpen] = useState(false);

    const refreshLoras = useCallback(() => {
        if (IS_TAURI) loadLoraRegistry().then(setLoraEntries).catch(() => {});
    }, []);

    useEffect(() => { refreshLoras(); }, [refreshLoras]);

    const linkedStyleLora = loraEntries.find(e => e.id === styleLoraId);

    return (<>
            <aside className="w-64 flex-shrink-0 bg-[#111113] border-r border-orange-600/40 flex flex-col z-20">
                <div className="h-14 flex items-center px-4 border-b border-[#1e1e21]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm shadow-orange-500/20 flex-shrink-0">
                            <span className="text-[13px] font-black text-black" style={{ letterSpacing: '-0.05em' }}>DSS</span>
                        </div>
                        <span className="text-[13px] font-bold text-zinc-300 tracking-tight">DoReMiSsul<span className="text-orange-400">.Studio</span></span>
                    </div>
                </div>
                {appState !== 'initial' && (
                    <div className="px-4 py-2 border-b border-[#1e1e21]">
                        <button
                            onClick={() => setIsResetConfirmOpen(true)}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200"
                            title="새 프로젝트"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            <span>New Project</span>
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 space-y-8">
                    <div className="space-y-2">
                        <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-3">Project</h3>
                        {/* 프로젝트 저장+목록 (Tauri만) */}
                        {IS_TAURI && (
                            <div className="grid grid-cols-2 gap-1.5">
                                <button onClick={handleSaveWithStatus} disabled={saveStatus === 'saving'} title="Save Project" className={`relative flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-xl border transition-all group ${saveStatus === 'saved' ? 'bg-teal-900/20 border-teal-500/30 text-teal-400' : saveStatus === 'saving' ? 'bg-orange-900/20 border-orange-500/30 text-orange-400' : 'bg-zinc-800/40 hover:bg-zinc-800 border-zinc-700/40 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200'}`}>
                                    <div className={`p-1 rounded-lg border transition-colors ${saveStatus === 'saved' ? 'bg-teal-900/30 border-teal-500/30' : saveStatus === 'saving' ? 'bg-orange-900/30 border-orange-500/30' : 'bg-zinc-800/80 border-zinc-700/60 group-hover:bg-zinc-700'}`}>
                                        {saveStatus === 'saving' ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-orange-400" /> : saveStatus === 'saved' ? <CheckIcon className="w-3.5 h-3.5 text-teal-400" /> : <BookmarkSquareIcon className="w-3.5 h-3.5 text-orange-500/70 group-hover:text-orange-400 transition-colors" />}
                                    </div>
                                    <span>{saveStatus === 'saving' ? 'Saving' : saveStatus === 'saved' ? 'Saved' : 'Save'}</span>
                                </button>
                                <button onClick={() => setIsProjectListOpen(true)} title="Open Project" className="flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                    <div className="p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                        <FolderOpenIcon className="w-3.5 h-3.5 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                    </div>
                                    <span>Projects</span>
                                </button>
                            </div>
                        )}
                        {/* Export + Import */}
                        <div className="grid grid-cols-2 gap-1.5">
                            <button onClick={actions.handleExportProject} title="Export Project" className="flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                <div className="p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                    <DocumentArrowDownIcon className="w-3.5 h-3.5 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                </div>
                                <span>Export</span>
                            </button>
                            <button onClick={() => importProjectFileRef.current?.click()} title="Import Project" className="flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                <div className="p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                    <DocumentArrowUpIcon className="w-3.5 h-3.5 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                </div>
                                <span>Import</span>
                            </button>
                        </div>
                    </div>

                    {appState === 'storyboardGenerated' && (
                        <>
                            <div className="space-y-2">
                                <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-3">Tools</h3>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button onClick={() => actions.setUIState({ isCostumeModalOpen: true })} title="캐릭터/의상 수정" className="flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                        <div className="p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                            <UserIcon className="w-3.5 h-3.5 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                        </div>
                                        <span>Characters</span>
                                    </button>
                                    <button onClick={actions.handleOpenReviewModalForEdit} title="스토리보드 재검수" className="flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                        <div className="p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                            <ClipboardIcon className="w-3.5 h-3.5 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                        </div>
                                        <span>Storyboard</span>
                                    </button>
                                </div>
                                <button onClick={() => setIsCutDetailOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                    <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                        <PhotoIcon className="w-4 h-4 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                    </div>
                                    <span>Overview</span>
                                </button>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button onClick={() => actions.setUIState({ isCutSelectionModalOpen: true })} title="선택 컷 자동 생성" className="flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                        <div className="p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                            <CheckIcon className="w-3.5 h-3.5 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                        </div>
                                        <span>Cut Select</span>
                                    </button>
                                    <button onClick={actions.handleToggleAutoGeneration} title={isAutoGenerating ? 'Stop' : 'Generate All'} className={`flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-xl transition-all group border ${isAutoGenerating ? 'bg-red-900/20 hover:bg-red-900/30 border-red-900/50 text-red-300' : 'bg-transparent hover:bg-orange-500/10 border-orange-500/50 hover:border-orange-400 text-orange-400'}`}>
                                        <div className={`p-1 rounded-lg border transition-colors ${isAutoGenerating ? 'bg-red-900/40 border-red-800/50' : 'bg-zinc-800/80 border-zinc-700/60 group-hover:bg-zinc-700'}`}>
                                            {isAutoGenerating ? <StopIcon className="w-3.5 h-3.5 text-red-400" /> : <SparklesIcon className="w-3.5 h-3.5 text-orange-500/70 group-hover:text-orange-400 transition-colors" />}
                                        </div>
                                        <span>{isAutoGenerating ? 'Stop' : 'All'}</span>
                                    </button>
                                </div>
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
                                <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-3">Audio</h3>
                                <button onClick={actions.handleOpenAudioSplitter} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                    <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                        <ScissorsIcon className="w-4 h-4 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                    </div>
                                    <span>Audio Split</span>
                                </button>
                                <button onClick={() => actions.setUIState({ isBatchAudioModalOpen: true })} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 group">
                                    <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                        <MicrophoneIcon className="w-4 h-4 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                    </div>
                                    <span>Batch TTS</span>
                                </button>
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-3">Export & Render</h3>
                                <div className="relative" ref={downloadDropdownRef}>
                                    <button onClick={() => isZipping ? actions.handleCancelZipping() : actions.setUIState({ isDownloadDropdownOpen: !isDownloadDropdownOpen })} className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-xl border transition-all group ${isZipping ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/50' : 'bg-zinc-800/40 hover:bg-zinc-800 border-zinc-700/40 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-lg border transition-colors ${isZipping ? 'bg-emerald-800/50 border-emerald-700/50' : 'bg-zinc-800/80 border-zinc-700/60 group-hover:bg-zinc-700'}`}>
                                                {isZipping ? <SpinnerIcon className="w-4 h-4 text-emerald-400" /> : <DownloadIcon className="w-4 h-4 text-orange-500/70 group-hover:text-orange-400 transition-colors" />}
                                            </div>
                                            <div className="flex flex-col items-start">
                                                <span>{isZipping ? (zippingProgress?.isCancelling ? 'Cancelling...' : 'Zipping...') : 'Download'}</span>
                                                {isZipping && zippingProgress && zippingProgress.total > 0 && (
                                                    <span className="text-[10px] text-emerald-400/80">{zippingProgress.current} / {zippingProgress.total}</span>
                                                )}
                                            </div>
                                        </div>
                                        {isZipping ? (
                                            <div className="p-1 hover:bg-emerald-800/50 rounded-md transition-colors" title="다운로드 취소">
                                                <XIcon className="w-4 h-4 text-emerald-400" />
                                            </div>
                                        ) : (
                                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${isDownloadDropdownOpen ? 'rotate-180' : ''}`} />
                                        )}
                                    </button>
                                    {isDownloadDropdownOpen && !isZipping && (
                                        <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-20 overflow-hidden py-1">
                                            <button onClick={() => { actions.handleDownloadAllImagesZip(); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700/70 hover:text-white transition-colors">전체 이미지 다운로드</button>
                                            <button onClick={() => { actions.handleDownloadSelectedImagesZip(); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700/70 hover:text-white transition-colors">선택 이미지 다운로드</button>
                                            <div className="border-t border-zinc-700/50 my-1"></div>
                                            <button onClick={() => { actions.handleDownloadFilteredImagesZip('hq'); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700/70 hover:text-white transition-colors">HQ만 다운로드</button>
                                            <button onClick={() => { actions.handleDownloadFilteredImagesZip('normal'); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700/70 hover:text-white transition-colors">일반만 다운로드</button>
                                            <button onClick={() => { actions.handleDownloadFilteredImagesZip('rough'); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700/70 hover:text-white transition-colors">러프만 다운로드</button>
                                            <div className="border-t border-zinc-700/50 my-1"></div>
                                            <button onClick={() => { actions.handleDownloadSRT(); actions.setUIState({ isDownloadDropdownOpen: false }); }} className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700/70 hover:text-white transition-colors">AI 자막 (SRT) 다운로드</button>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => actions.setUIState({ isSlideshowOpen: true })} disabled={!hasSlideshowData} className="w-full flex items-center gap-3 px-3 py-2.5 mt-2 text-sm font-medium rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/40 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group">
                                    <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 group-hover:bg-zinc-700 transition-colors">
                                        <PlayIcon className="w-4 h-4 text-orange-500/70 group-hover:text-orange-400 transition-colors" />
                                    </div>
                                    <span>Slideshow</span>
                                </button>
                            </div>

                        </>
                    )}
                </div>

                {/* ★ Engine + Model + Energy/LoRA + 화풍 (하단 고정) */}
                {appState !== 'initial' && (
                <div className="flex-shrink-0 px-4 py-3 border-t border-b border-zinc-700/40 space-y-2">
                    {/* Engine 토글 */}
                    <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-2">Engine</h3>
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                        {([['gemini','Gemini'],['flux','Flux']] as const).map(([val,label]) => (
                            <button key={val} onClick={() => dispatch({ type: 'SET_IMAGE_ENGINE', payload: val as any })}
                                className={`py-2 text-xs font-bold rounded-xl border transition-all text-center ${
                                    selectedImageEngine === val
                                        ? val === 'gemini'
                                            ? 'bg-transparent border-orange-500/60 text-orange-400'
                                            : 'bg-transparent border-teal-500/60 text-teal-400'
                                        : 'bg-transparent border-zinc-700/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                                }`}
                            >{label}</button>
                        ))}
                    </div>

                    <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-3">Model</h3>
                                {/* 엔진별 모델 선택 */}
                                {selectedImageEngine === 'gemini' ? (
                                <div className="grid grid-cols-3 gap-1.5">
                                    {([['nano-2.5','N-2.5'],['nano-3.1','N-3.1'],['nano-3pro','N-3Pro']] as const).map(([val,label]) => (
                                        <button key={val} onClick={() => dispatch({ type: 'SET_NANO_MODEL', payload: val as any })}
                                            className={`py-2 text-xs font-bold rounded-xl border transition-all text-center ${selectedNanoModel === val ? 'bg-transparent border-orange-500/60 text-orange-400' : 'bg-transparent border-zinc-700/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}
                                        >{label}</button>
                                    ))}
                                </div>
                                ) : (
                                <>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {([['flux-pro','Pro'],['flux-flex','Flex'],['flux-lora','LoRA']] as const).map(([val,label]) => (
                                        <button key={val} onClick={() => dispatch({ type: 'SET_FLUX_MODEL', payload: val as any })}
                                            className={`py-2 text-xs font-bold rounded-xl border transition-all text-center ${
                                                selectedFluxModel === val
                                                    ? 'bg-transparent border-teal-500/60 text-teal-400'
                                                    : 'bg-transparent border-zinc-700/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                                            }`}
                                        >{label}</button>
                                    ))}
                                </div>
                                <p className="text-[9px] text-zinc-600 text-center">Pro $0.03 · Flex $0.06 · LoRA $0.075</p>

                                </>
                                )}

                                {/* ★ Flux: LoRA Scale 슬라이더 */}
                                {selectedImageEngine === 'flux' && (
                                    <div className="flex items-center gap-2 px-1 py-1">
                                        <span className="text-[10px] font-mono text-zinc-500 whitespace-nowrap">🎯 LoRA</span>
                                        <input
                                            type="range" min="0" max="2" step="0.05"
                                            value={styleLoraScaleOverride ?? 0.9}
                                            onChange={e => dispatch({ type: 'SET_STYLE_LORA', payload: { id: styleLoraId, scaleOverride: Number(e.target.value) } })}
                                            className="flex-1 h-1.5 accent-teal-500 cursor-pointer"
                                        />
                                        <span className="text-[10px] font-mono text-teal-400 w-7 text-right">{(styleLoraScaleOverride ?? 0.9).toFixed(2)}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-1.5">
                                    <div className="relative">
                                        <select
                                            value={artStyle}
                                            onChange={e => dispatch({ type: 'SET_ART_STYLE', payload: e.target.value })}
                                            className={`w-full h-full px-2 py-2.5 text-xs font-medium bg-zinc-800/40 hover:bg-zinc-800 border ${
                                                selectedImageEngine === 'flux'
                                                    ? 'border-teal-700/40 hover:border-teal-600 text-teal-400 focus:ring-teal-500'
                                                    : 'border-orange-700/40 hover:border-orange-600 text-orange-400 focus:ring-orange-500'
                                            } rounded-xl focus:outline-none focus:ring-1 appearance-none cursor-pointer truncate pr-6`}
                                        >
                                            {Object.entries(STYLE_NAMES).map(([val, label]) => (
                                                <option key={val} value={val}>{label}</option>
                                            ))}
                                        </select>
                                        <ChevronDownIcon className={`absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 ${
                                            selectedImageEngine === 'flux' ? 'text-teal-500' : 'text-orange-500'
                                        } pointer-events-none`} />
                                    </div>
                                    {selectedImageEngine === 'flux' ? (
                                        <div className="relative">
                                            <select
                                                value={styleLoraId || ''}
                                                onChange={e => dispatch({ type: 'SET_STYLE_LORA', payload: { id: e.target.value || undefined, scaleOverride: undefined } })}
                                                className="w-full h-full px-2 py-2.5 text-xs font-medium bg-zinc-800/40 hover:bg-zinc-800 border border-teal-700/40 hover:border-teal-600 rounded-xl text-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-500 appearance-none cursor-pointer truncate pr-6"
                                            >
                                                <option value="">LoRA 없음</option>
                                                {loraEntries.filter(e => e.type === 'style').map(e => (
                                                    <option key={e.id} value={e.id}>{e.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-teal-500 pointer-events-none" />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center px-2 py-2.5 text-[10px] font-medium rounded-xl bg-zinc-800/20 border border-zinc-800/40 text-zinc-600">
                                            LoRA —
                                        </div>
                                    )}
                                </div>
                </div>
                )}

                <div className="p-4 border-t border-[#1e1e21] bg-[#0c0c0e]">
                    {IS_TAURI && (
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                            <button
                                onClick={() => setIsApiKeySettingsOpen(true)}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200"
                            >
                                <CogIcon className="w-3.5 h-3.5" />
                                <span>API Keys</span>
                            </button>
                            <button
                                onClick={() => resetWindowSize()}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200"
                                title="창 크기 초기화 (1728×1200)"
                            >
                                <ArrowsRightLeftIcon className="w-3.5 h-3.5" />
                                <span>Reset</span>
                            </button>
                        </div>
                    )}
                    {IS_TAURI && (
                        <div className="flex gap-1 mb-3">
                            <button
                                onClick={() => setIsAssetCatalogOpen(true)}
                                className="flex-1 flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200"
                            >
                                <BookmarkSquareIcon className="w-3.5 h-3.5" />
                                <span>Assets</span>
                            </button>
                            <button
                                onClick={() => { openAssetCatalog(); setIsAssetWindowOpen(true); }}
                                className="relative flex items-center px-2 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-all text-zinc-400 hover:text-zinc-200"
                                title="에셋 카탈로그 (새 창)"
                            >
                                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                                {isAssetWindowOpen && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-zinc-800" />}
                            </button>
                        </div>
                    )}
                    <div className="flex flex-col gap-1 text-[10px] font-mono text-zinc-500">
                        <div className="flex justify-between">
                            <span>Claude</span>
                            <span className="text-orange-400/70">{claudeTokenCount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Gemini</span>
                            <span className="text-orange-400/70">{geminiTokenCount.toLocaleString()}</span>
                        </div>
                        {(selectedImageEngine === 'flux' && falUsage && falUsage.totalImages > 0) && (
                            <div className="flex justify-between">
                                <span>Flux</span>
                                <span className="text-teal-400/70">{falUsage.totalImages}장 · ~${falUsage.totalCost.toFixed(2)}</span>
                            </div>
                        )}
                        {sceneAndCutCounts && (
                            <div className="flex justify-between">
                                <span>Scenes / Cuts</span>
                                <span className="text-zinc-400">{sceneAndCutCounts.sceneCount} / {sceneAndCutCounts.cutCount}</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* LoRA 레지스트리 모달 */}
            <LoraRegistryModal
                isOpen={isLoraRegistryOpen}
                onClose={() => { setIsLoraRegistryOpen(false); refreshLoras(); }}
                onSelect={(entry) => {
                    if (entry.type === 'style') {
                        dispatch({ type: 'SET_STYLE_LORA', payload: { id: entry.id, scaleOverride: undefined } });
                    }
                    setIsLoraRegistryOpen(false);
                    refreshLoras();
                }}
            />
    </>);
};
