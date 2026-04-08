// components/AppInputScreen.tsx — 첫 화면: 단일 컬럼 레이아웃 (Phase 10+ UI v2)
// Design: aienhancer-inspired — single orange accent, 3-level dark, centered flow
// ★ MSF 대본 모드 탭 추가 + 드래그앤드롭 분리 + 자동 셋업

import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import { SparklesIcon, SpinnerIcon, RefreshIcon, PlayIcon, ChevronRightIcon, ScissorsIcon, DocumentArrowUpIcon } from './icons';

const GENRE_PRESETS = ['연애썰', '직장썰', '가족썰', '군대썰', '학교썰', '복수썰', '공포썰', '감동썰', '사이다썰'];
const TONE_PRESETS = ['코믹', '자조유머', '따뜻', '냉소', '긴장감', '감동', '사이다', '어둠', '열혈', '밝음'];

// 문서 파일 확장자 (대본 드래그앤드롭용)
const DOCUMENT_EXTENSIONS = ['.txt', '.md', '.rtf', '.doc', '.docx'];
const isDocumentFile = (file: File) =>
    file.type.startsWith('text/') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/msword' ||
    file.type === 'text/markdown' ||
    DOCUMENT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));

const isProjectFile = (file: File) =>
    file.name.endsWith('.wvs_project') || file.name.endsWith('.json');

interface AppInputScreenProps { onImportClick: () => void; }

export const AppInputScreen: React.FC<AppInputScreenProps> = ({ onImportClick }) => {
    const { state, dispatch, actions } = useAppContext();
    const { userInputScript, logline, pipelineCheckpoint, storyTitle, speakerGender, imageRatio, contentFormat, aiModelTier, titleSuggestions, isGeneratingTitles, scriptInputMode } = state;

    const activeTab = scriptInputMode || 'narration';

    const [localScript, setLocalScript] = useState(userInputScript);
    const [isDragOverScript, setIsDragOverScript] = useState(false);
    const [isDragOverSetup, setIsDragOverSetup] = useState(false);
    const [llGenre, setLlGenre] = useState('');
    const [llTones, setLlTones] = useState<string[]>([]);
    const [llConflict, setLlConflict] = useState('');
    const [llTwist, setLlTwist] = useState('');
    const [llInited, setLlInited] = useState(false);

    useEffect(() => {
        if (llInited || !logline) return;
        const parts = logline.split(' / ').map(s => s.trim());
        if (parts.length >= 1) setLlGenre(parts[0]);
        if (parts.length >= 2) setLlTones(parts[1].split('+').map(s => s.trim()).filter(Boolean));
        if (parts.length >= 3) setLlConflict(parts[2]);
        if (parts.length >= 4) setLlTwist(parts[3]);
        setLlInited(true);
    }, [logline, llInited]);

    useEffect(() => {
        const parts = [llGenre, llTones.join('+'), llConflict, llTwist].filter(Boolean);
        dispatch({ type: 'SET_LOGLINE', payload: parts.length ? parts.join(' / ') : '' });
    }, [llGenre, llTones, llConflict, llTwist]);

    useEffect(() => { setLocalScript(userInputScript); }, [userInputScript]);

    const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => setLocalScript(e.target.value);
    const handleScriptBlur = () => { if (localScript !== userInputScript) dispatch({ type: 'SET_USER_INPUT_SCRIPT', payload: localScript }); };

    // ═══ 대본 영역 드래그앤드롭 — 문서 파일만 ═══
    const handleScriptDragOver = (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setIsDragOverScript(true); } };
    const handleScriptDragLeave = (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOverScript(false); } };

    const readFileAsText = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) {
                setLocalScript(ev.target.result as string);
                dispatch({ type: 'SET_USER_INPUT_SCRIPT', payload: ev.target.result as string });
            }
        };
        reader.readAsText(file);
    }, [dispatch]);

    const handleScriptDrop = (e: React.DragEvent) => {
        setIsDragOverScript(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault(); e.stopPropagation();
            const file = e.dataTransfer.files[0];
            if (isDocumentFile(file)) {
                readFileAsText(file);
            } else if (isProjectFile(file)) {
                actions.addNotification('프로젝트 파일은 위의 Story Setup 영역에 드래그하세요.', 'warning');
            } else {
                actions.addNotification('지원하지 않는 파일 형식입니다. (.txt, .md, .doc, .docx 지원)', 'error');
            }
        }
    };

    // ═══ Setup 영역 드래그앤드롭 — 프로젝트 파일 ═══
    const handleSetupDragOver = (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setIsDragOverSetup(true); } };
    const handleSetupDragLeave = (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOverSetup(false); } };
    const handleSetupDrop = (e: React.DragEvent) => {
        setIsDragOverSetup(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault(); e.stopPropagation();
            const file = e.dataTransfer.files[0];
            if (isProjectFile(file)) {
                actions.handleUploadProjectFile(file);
            } else if (isDocumentFile(file)) {
                actions.addNotification('대본 파일은 아래 Script 영역에 드래그하세요.', 'warning');
            } else {
                actions.addNotification('프로젝트 파일(.wvs_project, .json)만 드래그할 수 있습니다.', 'error');
            }
        }
    };

    // ═══ 탭 전환 ═══
    const handleTabSwitch = (tab: 'narration' | 'msf' | 'uss') => {
        dispatch({ type: 'SET_SCRIPT_INPUT_MODE', payload: tab });
    };

    // ═══ 자동 셋업 — handleAutoSetup 호출 후 로컬 state도 동기화 ═══
    const handleAutoSetupWithSync = async () => {
        await actions.handleAutoSetup();
        // logline이 dispatch로 업데이트되면 useEffect에서 ll* 상태들이 동기화됨
        // 하지만 llInited가 이미 true이면 동기화 안됨 → 강제 재초기화
        setLlInited(false);
    };

    const lineCount = localScript.split('\n').filter(l => l.trim()).length;
    const hasScript = localScript.trim().length > 0;
    const hasNoSetup = !storyTitle && !llGenre && llTones.length === 0 && !llConflict && !llTwist;

    // --- Shared input/card classes ---
    const cardCls = 'bg-[#0a0a0c] border border-[#2a2a2e] rounded-2xl';
    const inputCls = 'bg-[#1a1a1e] rounded-xl border border-[#333338] text-sm text-zinc-200 placeholder:text-zinc-600 hover:border-orange-500/50 hover:bg-orange-950/20 focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 focus:bg-orange-950/20 transition-all duration-200';
    const labelCls = 'block text-[11px] font-semibold text-zinc-400 mb-1.5 tracking-wide';

    return (
        <div className="max-w-4xl mx-auto py-12 lg:py-16 animate-fade-in w-full px-6">
            {/* ═══ Hero Row ═══ */}
            <div className="flex items-end justify-between mb-8">
                <div>
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
                            <SparklesIcon className="w-3.5 h-3.5 text-orange-400" />
                        </div>
                        <span className="text-[11px] font-bold text-orange-400/80 uppercase tracking-[0.2em]">Story Studio</span>
                    </div>
                    <h2 className="text-3xl font-extrabold tracking-tight text-white mb-1">New Project</h2>
                    <p className="text-sm text-zinc-500">대본을 입력하면 AI가 연출 · 이미지 · 영상까지 자동으로 만들어 드립니다.</p>
                </div>
                <button onClick={onImportClick} className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-zinc-400 bg-[#0a0a0c] hover:bg-[#111114] rounded-xl border border-[#2a2a2e] hover:border-zinc-600 transition-all flex-shrink-0">
                    <DocumentArrowUpIcon className="w-4 h-4 text-zinc-500" />Load Project
                </button>
            </div>

            {/* ═══ Pipeline Resume ═══ */}
            {pipelineCheckpoint !== 'idle' && pipelineCheckpoint !== 'complete' && (
                <div className="mb-6 bg-orange-500/[0.06] border border-orange-500/20 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/15 flex-shrink-0"><RefreshIcon className="w-5 h-5 text-orange-400" /></div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-orange-200 mb-0.5">이전 작업이 남아있습니다</p>
                        <p className="text-[11px] text-orange-400/50">
                            {pipelineCheckpoint === 'enriched_pause' && '연출 대본 생성 완료 → 편집 후 콘티 분할'}
                            {pipelineCheckpoint === 'conti_pause' && '콘티+촬영 설계 완료 → 컷 확인 후 스토리보드 변환'}
                            {pipelineCheckpoint === 'analysis_done' && '대본 분석 완료 → 씬 분석 리뷰부터'}
                            {pipelineCheckpoint === 'scene_confirmed' && '씬 분석 확인 완료 → 캐릭터/의상 스튜디오부터'}
                            {pipelineCheckpoint === 'costume_done' && '의상 설정 완료 → 스토리보드 리뷰부터'}
                        </p>
                    </div>
                    <button onClick={actions.handleResumePipeline} className="px-4 py-2 text-xs font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-500 transition-colors flex items-center gap-1.5"><PlayIcon className="w-3.5 h-3.5" />Resume</button>
                    <button onClick={actions.handleResetPipeline} className="px-3 py-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Reset</button>
                </div>
            )}

            {/* ═══ Project Settings — compact inline bar ═══ */}
            <div className={`${cardCls} p-4 mb-4`}>
                <div className="flex flex-wrap items-end gap-4">
                    {/* Title (takes remaining space) */}
                    <div className="flex-1 min-w-[200px]">
                        <label className={labelCls}>Title</label>
                        <div className="flex gap-1.5">
                            <input type="text" value={storyTitle || ''} onChange={(e) => dispatch({ type: 'SET_STORY_TITLE', payload: e.target.value })} placeholder="프로젝트 제목" className={`flex-1 px-3 py-2 ${inputCls}`} />
                            <button onClick={actions.handleGenerateTitles} disabled={isGeneratingTitles || !hasScript} className="flex-shrink-0 px-2.5 py-2 rounded-xl bg-[#1a1a1e] hover:bg-[#222226] text-orange-400/60 hover:text-orange-400 border border-[#2a2a2e] hover:border-orange-500/50 hover:bg-orange-950/20 disabled:opacity-30 transition-all duration-200" title="AI 제목 추천">
                                {isGeneratingTitles ? <SpinnerIcon className="w-3.5 h-3.5" /> : <SparklesIcon className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                        {titleSuggestions.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {titleSuggestions.map((t, i) => (
                                    <button key={i} onClick={() => dispatch({ type: 'SET_STORY_TITLE', payload: t })} className="px-2 py-0.5 text-[10px] rounded-md bg-orange-500/[0.06] hover:bg-orange-500/15 text-orange-300/60 hover:text-orange-300 border border-orange-500/10 transition-all">{t}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Format */}
                    <div>
                        <label className={labelCls}>Format</label>
                        <div className="flex gap-1 p-0.5 bg-[#1a1a1e] rounded-xl border border-[#333338] hover:border-orange-500/50 hover:bg-orange-950/20 transition-all duration-200">
                            {([
                                { value: 'ssul-shorts', label: '썰쇼츠' },
                                { value: 'webtoon', label: '웹툰' },
                                { value: 'anime', label: '애니' },
                            ] as const).map(f => (
                                <button key={f.value}
                                    onClick={() => dispatch({type: 'SET_CONTENT_FORMAT', payload: f.value})}
                                    className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                                        contentFormat === f.value
                                            ? 'bg-zinc-700 text-white shadow-sm'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Speaker */}
                    <div>
                        <label className={labelCls}>Speaker</label>
                        <div className="flex gap-1 p-0.5 bg-[#1a1a1e] rounded-xl border border-[#333338] hover:border-orange-500/50 hover:bg-orange-950/20 transition-all duration-200">
                            {(['male','female'] as const).map(g => (
                                <button key={g} onClick={() => dispatch({type: 'SET_SPEAKER_GENDER', payload: g})}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${speakerGender === g ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                    {g === 'male' ? 'M' : 'F'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* AI Model */}
                    <div>
                        <label className={labelCls}>AI</label>
                        <div className="flex gap-1 p-0.5 bg-[#1a1a1e] rounded-xl border border-[#333338] hover:border-orange-500/50 hover:bg-orange-950/20 transition-all duration-200">
                            {([
                                { value: 'opus', label: 'Opus' },
                                { value: 'sonnet', label: 'Sonnet' },
                            ] as const).map(m => (
                                <button key={m.value}
                                    onClick={() => dispatch({type: 'SET_AI_MODEL_TIER', payload: m.value})}
                                    className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                                        aiModelTier === m.value
                                            ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/20'
                                            : 'text-zinc-500 hover:text-zinc-300'
                                    }`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Ratio */}
                    <div>
                        <label className={labelCls}>Ratio</label>
                        <div className="flex gap-1 p-0.5 bg-[#1a1a1e] rounded-xl border border-[#333338] hover:border-orange-500/50 hover:bg-orange-950/20 transition-all duration-200">
                            {(['1:1','16:9','9:16'] as const).map(r => (
                                <button key={r} onClick={() => dispatch({type: 'SET_IMAGE_RATIO', payload: r})}
                                    className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${imageRatio === r ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>{r}</button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Story Setup — compact + 프로젝트 파일 드래그앤드롭 존 ═══ */}
            <div className={`${cardCls} p-4 mb-4 transition-all relative ${isDragOverSetup ? 'border-orange-500/60 ring-2 ring-orange-500/15' : ''}`}
                onDragOver={handleSetupDragOver} onDragLeave={handleSetupDragLeave} onDrop={handleSetupDrop}>
                {isDragOverSetup && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-orange-950/60 rounded-2xl pointer-events-none backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                            <DocumentArrowUpIcon className="w-8 h-8 text-orange-400/80" />
                            <p className="text-orange-300 text-sm font-bold">프로젝트 파일 불러오기</p>
                            <p className="text-orange-400/50 text-xs">.wvs_project / .json</p>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em]">Story Setup</span>
                    <span className="text-[10px] text-zinc-700">optional</span>
                    <div className="flex-1" />
                    {/* 자동 셋업 버튼 — 대본이 있고 셋업이 비어있을 때 눈에 띄게 */}
                    <button
                        onClick={handleAutoSetupWithSync}
                        disabled={isGeneratingTitles || !hasScript}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                            hasScript && hasNoSetup
                                ? 'bg-orange-500/15 text-orange-300 border border-orange-500/40 hover:bg-orange-500/25 animate-pulse'
                                : 'bg-[#1a1a1e] text-zinc-500 border border-[#2a2a2e] hover:text-orange-300 hover:border-orange-500/40'
                        }`}
                        title="AI가 대본을 분석하여 제목, 장르, 톤, 갈등, 반전을 자동으로 채웁니다"
                    >
                        {isGeneratingTitles ? <SpinnerIcon className="w-3 h-3" /> : <SparklesIcon className="w-3 h-3" />}
                        Auto Setup
                    </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                        <label className={labelCls}>Genre</label>
                        <select value={llGenre} onChange={e => setLlGenre(e.target.value)} className={`w-full px-3 py-2 ${inputCls} appearance-none cursor-pointer`}>
                            <option value="">선택...</option>
                            {GENRE_PRESETS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                    <div className="lg:col-span-3">
                        <label className={labelCls}>Tone</label>
                        <div className="flex flex-wrap gap-1.5">
                            {TONE_PRESETS.map(t => (
                                <button key={t} onClick={() => setLlTones(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${llTones.includes(t)
                                        ? 'bg-orange-500/15 text-orange-300 border border-orange-500/40'
                                        : 'bg-[#1a1a1e] text-zinc-500 border border-[#2a2a2e] hover:text-zinc-300 hover:border-orange-500/40 hover:bg-orange-950/15'}`}>{t}</button>
                            ))}
                        </div>
                    </div>
                    <div className="col-span-2">
                        <label className={labelCls}>Conflict</label>
                        <textarea value={llConflict} onChange={e => setLlConflict(e.target.value)} placeholder="핵심 갈등 요소 — 캐릭터가 부딪히는 문제를 자유롭게 적어주세요"
                            rows={2} className={`w-full px-3 py-2 resize-none ${inputCls}`} />
                    </div>
                    <div className="col-span-2">
                        <label className={labelCls}>Twist</label>
                        <textarea value={llTwist} onChange={e => setLlTwist(e.target.value)} placeholder="엔딩 반전/펀치라인 — 시청자가 '와' 할 마지막 한 방"
                            rows={2} className={`w-full px-3 py-2 resize-none ${inputCls}`} />
                    </div>
                </div>
            </div>

            {/* ═══ Script — 탭 (이미지대본 / MSF 대본) + 드래그앤드롭 (문서 파일) ═══ */}
            <div className={`${cardCls} transition-all relative flex flex-col min-h-[380px] mb-5 ${isDragOverScript ? 'border-orange-500/60 ring-2 ring-orange-500/15' : ''}`}
                onDragOver={handleScriptDragOver} onDragLeave={handleScriptDragLeave} onDrop={handleScriptDrop}>
                {isDragOverScript && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-orange-950/60 rounded-2xl pointer-events-none backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                            <DocumentArrowUpIcon className="w-8 h-8 text-orange-400/80" />
                            <p className="text-orange-300 text-sm font-bold">대본 파일을 놓으세요</p>
                            <p className="text-orange-400/50 text-xs">.txt, .md, .doc, .docx</p>
                        </div>
                    </div>
                )}
                {/* ── 탭 헤더 ── */}
                <div className="flex items-center gap-0 px-3 pt-3 pb-0 flex-shrink-0">
                    <button
                        onClick={() => handleTabSwitch('narration')}
                        className={`px-4 py-2 rounded-t-lg text-[11px] font-bold transition-all border-b-2 ${
                            activeTab === 'narration'
                                ? 'text-orange-300 border-orange-500 bg-orange-500/[0.06]'
                                : 'text-zinc-600 border-transparent hover:text-zinc-400 hover:bg-[#111114]'
                        }`}
                    >
                        이미지대본
                    </button>
                    <button
                        onClick={() => handleTabSwitch('msf')}
                        className={`px-4 py-2 rounded-t-lg text-[11px] font-bold transition-all border-b-2 ${
                            activeTab === 'msf'
                                ? 'text-orange-300 border-orange-500 bg-orange-500/[0.06]'
                                : 'text-zinc-600 border-transparent hover:text-zinc-400 hover:bg-[#111114]'
                        }`}
                    >
                        MSF 대본
                    </button>
                    <button
                        onClick={() => handleTabSwitch('uss')}
                        className={`px-4 py-2 rounded-t-lg text-[11px] font-bold transition-all border-b-2 ${
                            activeTab === 'uss'
                                ? 'text-emerald-300 border-emerald-500 bg-emerald-500/[0.06]'
                                : 'text-zinc-600 border-transparent hover:text-zinc-400 hover:bg-[#111114]'
                        }`}
                    >
                        USS
                    </button>
                    <div className="flex-1" />
                    <div className="flex items-center gap-2 pr-2 pb-1">
                        <div className="w-px h-3 bg-zinc-800" />
                        <span className="text-[11px] text-zinc-600 font-medium tabular-nums">{lineCount} lines</span>
                    </div>
                </div>
                <div className="h-px bg-[#2a2a2e] mx-3" />
                {/* ── 탭에 따른 textarea ── */}
                <textarea value={localScript} onChange={handleScriptChange} onBlur={handleScriptBlur}
                    placeholder={activeTab === 'msf'
                        ? 'INT./EXT. 장소 — 시간 형식의 시나리오 대본을 붙여넣으세요.\n\n예시:\nINT. 사무실 — 낮\n\n김주임이 데스크탑에서 이력서를 작성하고 있다.\n\n            김주임 (V.O.)\n    이력서 한 번 열었을 뿐인데,\n    여대리가 상냥해졌어.'
                        : activeTab === 'uss'
                        ? '나레이션 대본을 붙여넣으세요.\n\n예시:\n그렇게 사귀고 나서 한 달쯤 됐을 때,\n여자친구가 갑자기 동거하자고 했어.\n처음엔 설렜는데... 현실은 좀 달랐다.\n\nUSS 모드: Claude 구조분석(1회) + 배치 컷변환(N회) → 촬영설계 → 스토리보드\n일시정지 없이 끝까지 자동 진행됩니다.'
                        : '이미지대본을 붙여넣으세요.\n\n예시:\n[장소: 아파트 거실 (저녁)]\n컷 1 (등장인물: 여주, 연출의도: 훅, 이미지프롬프트: 화장실 문 앞에서 돌아보며 손 흔드는 여주, 미디엄샷) "나 먼저 씻는다~"\n컷 2 (등장인물: 남주, 연출의도: 리액션, 이미지프롬프트: 남주 멍한 표정 클로즈업) 멍하니 바라봤다.\n\n각 컷: 컷 N (등장인물: ..., 연출의도: ..., 이미지프롬프트: ...) 대사/나레이션'
                    }
                    className="flex-1 px-5 py-3 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-700 resize-none focus:outline-none leading-relaxed font-mono" />
                {/* ── MSF 모드 힌트 배지 ── */}
                {activeTab === 'msf' && !hasScript && (
                    <div className="px-5 pb-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/15">
                            <span className="text-[10px] text-blue-400/60">💡</span>
                            <span className="text-[10px] text-blue-400/60">MSF 모드는 AI 1회 호출로 빠르게 스토리보드를 생성합니다. 불완전한 대본도 OK.</span>
                        </div>
                    </div>
                )}
                {activeTab === 'uss' && !hasScript && (
                    <div className="px-5 pb-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15">
                            <span className="text-[10px] text-emerald-400/60">⚡</span>
                            <span className="text-[10px] text-emerald-400/60">USS 모드: 구조분석(1회) + 배치 컷변환(N회) → 촬영설계 → 스토리보드. 일시정지 없이 자동 진행.</span>
                        </div>
                    </div>
                )}
                {activeTab === 'uss' && (
                    <div className="px-5 pb-2">
                        <textarea
                            value={state.storyBrief || ''}
                            onChange={(e) => dispatch({ type: 'SET_STORY_BRIEF', payload: e.target.value })}
                            placeholder="작품해설서 (선택) — 캐릭터 관계, 작품 톤, 타겟 독자, 참고 작품 등"
                            rows={3}
                            className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-700/40 rounded-lg text-[12px] text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-emerald-600/40 leading-relaxed"
                        />
                    </div>
                )}
            </div>

            {/* ═══ Actions ═══ */}
            <div className="flex justify-end gap-3">
                {activeTab === 'narration' && (
                    <button onClick={() => actions.setUIState({ isCutPreviewModalOpen: true })} disabled={!hasScript}
                        className="group flex items-center gap-2 px-5 py-3 text-sm font-semibold text-zinc-400 bg-[#0a0a0c] hover:bg-[#111114] rounded-xl border border-[#2a2a2e] hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        <ScissorsIcon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />Cut Preview
                    </button>
                )}
                <button onClick={() => actions.setUIState({ isStyleModalOpen: true })} disabled={!hasScript}
                    className="group flex items-center gap-2.5 px-7 py-3 text-sm font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-500 shadow-lg shadow-orange-600/15 hover:shadow-orange-500/25 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] transition-all">
                    <SparklesIcon className="w-4 h-4" />Start Studio
                    <ChevronRightIcon className="w-4 h-4 opacity-40 group-hover:opacity-80 transition-opacity" />
                </button>
            </div>
        </div>
    );
};
