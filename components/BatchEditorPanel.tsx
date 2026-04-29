// components/BatchEditorPanel.tsx — Phase A: 배치 구조(outfitSessions) 시각화 + 편집
// props 패턴 — useAppContext 직접 호출 금지 (CLAUDE.md 일관성)

import React, { useState, useMemo } from 'react';
import type { ScenarioAnalysis, CharacterDescription, AppAction, SceneLayer, OutfitSession, ToneModifier, Cut, ImageEngine, ImageEngineMode, ContextSceneDesign, AppDataState, PlannedCut } from '../types';
import { DEFAULT_SCENE_LAYER_ID } from '../types/pipeline';
import { deriveOutfitSessionsFromCuts, buildSessionKey } from '../appUtils';
import { ContextSceneSection } from './ContextSceneSection';

interface BatchEditorPanelProps {
    isCollapsed: boolean;
    onToggle: () => void;
    scenarioAnalysis: ScenarioAnalysis | null;
    characterDescriptions: { [key: string]: CharacterDescription };
    dispatch: React.Dispatch<AppAction>;
    /** Phase B v3 Stage 2: stale 카운트 계산 + 일괄 재생성용. 없으면 stale 기능 비활성. */
    cuts?: Cut[];
    /** Phase B v3 Stage 2: Context + OpenAI 모드일 때만 stale UI + 배치 생성 버튼 노출. */
    showStaleUI?: boolean;
    /** Phase B v3 Stage 2: 배치의 컷 일괄 생성/재생성. */
    onGenerateCuts?: (cutNumbers: string[]) => void;
    // ── Phase A.6 신규 ──
    imageEngineMode?: ImageEngineMode;
    selectedImageEngine?: ImageEngine;
    contextSceneDesigns?: ContextSceneDesign[];
    contextAnalysisStatus?: AppDataState['contextAnalysisStatus'];
    contextGenerationStatus?: AppDataState['contextGenerationStatus'];
    onAnalyzeAllScenes?: () => void;
    onAnalyzeOneScene?: (sessionKey: string) => void;
    onGenerateScene?: (sessionKey: string) => void;
}

const TONE_MODIFIER_OPTIONS: { value: ToneModifier; label: string }[] = [
    { value: 'none', label: '톤 변경 없음' },
    { value: 'sepia', label: '세피아' },
    { value: 'desaturated', label: '채도 낮춤' },
    { value: 'cool-blue', label: '차가운 블루' },
    { value: 'soft-focus', label: '소프트 포커스' },
    { value: 'warm-vintage', label: '따뜻한 빈티지' },
    { value: 'dream-blur', label: '꿈/몽환' },
    { value: 'sketchy', label: '스케치' },
    { value: 'custom', label: '자유 입력' },
];

const toneModifierLabel = (t?: ToneModifier) =>
    TONE_MODIFIER_OPTIONS.find(o => o.value === t)?.label ?? '톤 변경 없음';

export const BatchEditorPanel: React.FC<BatchEditorPanelProps> = ({
    isCollapsed, onToggle, scenarioAnalysis, dispatch,
    cuts, showStaleUI, onGenerateCuts,
    imageEngineMode, selectedImageEngine,
    contextSceneDesigns, contextAnalysisStatus, contextGenerationStatus,
    onAnalyzeAllScenes, onAnalyzeOneScene, onGenerateScene,
}) => {
    const [convertTarget, setConvertTarget] = useState<number | null>(null);
    const [splitTarget, setSplitTarget] = useState<number | null>(null);
    const [editTarget, setEditTarget] = useState<number | null>(null);

    // Phase A.6: Context 모드 메타
    const isContextMode = imageEngineMode === 'context' && selectedImageEngine === 'openai';
    const designsByKey = useMemo(() => {
        const map = new Map<string, ContextSceneDesign>();
        (contextSceneDesigns || []).forEach(d => map.set(d.sessionKey, d));
        return map;
    }, [contextSceneDesigns]);
    const isAnalyzing = !!contextAnalysisStatus?.isRunning;
    const isGenerating = !!contextGenerationStatus?.isRunning;

    // outfitSessions 없으면 cuts에서 자동 파생 (Phase 5 이전 프로젝트 호환)
    const effectiveSessions = useMemo<OutfitSession[]>(() => {
        const real = scenarioAnalysis?.outfitSessions;
        if (real && real.length > 0) return real;
        return deriveOutfitSessionsFromCuts(cuts || []);
    }, [scenarioAnalysis?.outfitSessions, cuts]);
    const isDerivedSessions = !(scenarioAnalysis?.outfitSessions?.length);

    const sortedSessions = useMemo(() => {
        if (effectiveSessions.length === 0) return [];
        // ★ 인덱스 보존을 위해 원본 인덱스를 페이로드로 같이 들고 다님
        return effectiveSessions
            .map((s, originalIndex) => ({ session: s, originalIndex }))
            .sort((a, b) => a.session.lineRange[0] - b.session.lineRange[0]);
    }, [effectiveSessions]);

    // Phase B v3 Stage 2: 배치별 컷 정보 (anchor 먼저, 그 뒤 후속 컷 순)
    const batchMeta = useMemo(() => {
        const map = new Map<number, {
            allCutNumbers: string[];      // anchor 먼저, 후속 컷 순
            staleCutNumbers: string[];    // staleByAnchor 컷만
            anchorCutNumber: string | null;
            totalCount: number;
        }>();
        if (!cuts || cuts.length === 0 || effectiveSessions.length === 0) return map;
        effectiveSessions.forEach((session, idx) => {
            const layerId = session.layerId || DEFAULT_SCENE_LAYER_ID;
            const matched = cuts.filter(
                c => c.location === session.location
                    && (c.sceneLayerId || DEFAULT_SCENE_LAYER_ID) === layerId,
            );
            const stale = matched.filter(c => c.staleByAnchor).map(c => c.cutNumber);
            const anchorOverride = session.anchorCutNumber
                && matched.find(c => c.cutNumber === session.anchorCutNumber);
            const anchor = anchorOverride ? anchorOverride.cutNumber : (matched[0]?.cutNumber ?? null);
            // anchor 먼저, 그 뒤 나머지 컷 (script 순서 유지)
            const ordered = anchor
                ? [anchor, ...matched.filter(c => c.cutNumber !== anchor).map(c => c.cutNumber)]
                : matched.map(c => c.cutNumber);
            map.set(idx, {
                allCutNumbers: ordered,
                staleCutNumbers: stale,
                anchorCutNumber: anchor,
                totalCount: matched.length,
            });
        });
        return map;
    }, [cuts, effectiveSessions]);

    // 컷도 없고 outfitSessions도 없으면 표시할 게 없음
    if (effectiveSessions.length === 0) {
        return null;
    }

    const layers = scenarioAnalysis?.sceneLayers || [];
    const layerById = (id: string) => layers.find(l => l.id === id);

    const findOriginalIndex = (idx: number) => idx; // outfitSessions index가 그대로 reducer payload

    return (
        <div className="mb-4">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between mb-2 text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] hover:text-zinc-300 transition-colors"
            >
                <span>배치 구조 ({effectiveSessions.length}){isDerivedSessions ? ' · 자동' : ''}</span>
                <span className="text-xs">{isCollapsed ? '▸' : '▾'}</span>
            </button>

            {/* Phase A.6: Context 모드 전체 분석 헤더 */}
            {!isCollapsed && isContextMode && (
                <div className="mb-3 p-2 rounded-lg bg-violet-500/10 border border-violet-500/30">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">
                            🎬 Context 씬 디자인
                        </span>
                        <span className="text-[9px] text-violet-400/60">
                            {(contextSceneDesigns || []).filter(d => !d.isStale).length} / {effectiveSessions.length} 분석됨
                        </span>
                    </div>
                    <button
                        onClick={onAnalyzeAllScenes}
                        disabled={isAnalyzing || effectiveSessions.length === 0}
                        className="w-full py-2 text-xs font-bold rounded-lg bg-violet-600/40 hover:bg-violet-600/60 text-violet-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        {isAnalyzing && contextAnalysisStatus?.target === 'all'
                            ? `분석 중... ${contextAnalysisStatus?.message ?? ''}`
                            : (contextSceneDesigns?.length ?? 0) > 0 ? '🔄 전체 재분석' : '🎬 전체 씬 분석 시작'}
                    </button>
                    <p className="text-[9px] text-violet-400/50 mt-1.5 leading-relaxed">
                        Claude가 각 배치를 영상 시퀀스로 디자인합니다. 결과 검수 후 배치별로 일괄 생성하세요.
                    </p>
                </div>
            )}

            {!isCollapsed && (
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                    {sortedSessions.map(({ session, originalIndex }, sortedIdx) => {
                        const layer = layerById(session.layerId);
                        const isMemory = !!layer?.isFlashback;
                        const isImagined = !!layer?.isImagined;
                        const tone = layer?.toneModifier;
                        const next = sortedSessions[sortedIdx + 1];
                        const canMergeNext = !!next
                            && next.session.location === session.location
                            && next.session.layerId === session.layerId
                            && session.lineRange[1] + 1 === next.session.lineRange[0];

                        const borderColor = isMemory
                            ? 'border-purple-500/40 bg-purple-500/5'
                            : isImagined
                                ? 'border-pink-500/40 bg-pink-500/5'
                                : 'border-zinc-700/40 bg-zinc-800/30';

                        return (
                            <div
                                key={`${session.location}-${session.layerId}-${session.lineRange[0]}`}
                                className={`rounded-lg border ${borderColor} px-2.5 py-2 ${(isMemory || isImagined) ? 'ml-3' : ''}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-zinc-200 truncate flex items-center gap-1.5">
                                            {showStaleUI && batchMeta.get(originalIndex)?.anchorCutNumber && (
                                                <span
                                                    className="text-[9px] font-bold bg-cyan-600/30 text-cyan-300 px-1 py-0.5 rounded"
                                                    title={`anchor 컷: ${batchMeta.get(originalIndex)?.anchorCutNumber}`}
                                                >⚓ {batchMeta.get(originalIndex)?.anchorCutNumber}</span>
                                            )}
                                            <span className="truncate">{session.userLabel || `${session.location} · ${layer?.label ?? session.layerId}`}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            <span className="text-[10px] text-zinc-500 font-mono">
                                                L{session.lineRange[0]}-{session.lineRange[1]}
                                            </span>
                                            {(isMemory || isImagined) && tone && tone !== 'none' && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-700/50 text-zinc-300">
                                                    {toneModifierLabel(tone)}
                                                </span>
                                            )}
                                            {isMemory && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                                                    회상
                                                </span>
                                            )}
                                            {isImagined && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300">
                                                    상상
                                                </span>
                                            )}
                                        </div>
                                        {session.userNote && (
                                            <div className="text-[10px] text-zinc-500 mt-1 italic line-clamp-2">
                                                {session.userNote}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {!isDerivedSessions && (
                                <div className="flex gap-1 mt-2">
                                    <button
                                        onClick={() => setSplitTarget(originalIndex)}
                                        className="flex-1 text-[10px] py-1 rounded bg-zinc-700/40 hover:bg-zinc-700 text-zinc-300 transition-colors"
                                        title="배치를 두 개로 분리"
                                    >
                                        ✂️ 분리
                                    </button>
                                    <button
                                        onClick={() => {
                                            const nextOriginalIdx = sortedSessions[sortedIdx + 1]?.originalIndex;
                                            if (nextOriginalIdx == null) return;
                                            // firstIndex는 두 배치 중 작은 인덱스. 정렬된 배치이므로 둘 중 작은 것을 firstIndex로.
                                            const firstIdx = Math.min(originalIndex, nextOriginalIdx);
                                            dispatch({ type: 'MERGE_OUTFIT_SESSIONS', payload: { firstIndex: firstIdx } });
                                        }}
                                        disabled={!canMergeNext}
                                        className="flex-1 text-[10px] py-1 rounded bg-zinc-700/40 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title={canMergeNext ? '다음 배치와 병합' : '인접한 동일 (location, layer) 배치만 병합 가능'}
                                    >
                                        🔗 병합
                                    </button>
                                    {!isMemory && !isImagined && (
                                        <button
                                            onClick={() => setConvertTarget(originalIndex)}
                                            className="flex-1 text-[10px] py-1 rounded bg-purple-700/30 hover:bg-purple-700/50 text-purple-200 transition-colors"
                                            title="이 배치를 회상으로 변환"
                                        >
                                            🌀 회상으로
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setEditTarget(originalIndex)}
                                        className="flex-1 text-[10px] py-1 rounded bg-zinc-700/40 hover:bg-zinc-700 text-zinc-300 transition-colors"
                                    >
                                        ✏️ 편집
                                    </button>
                                </div>
                                )}

                                {/* Phase B v3 Stage 2: 배치 전체 생성 + stale 컷 일괄 재생성 */}
                                {showStaleUI && onGenerateCuts && (() => {
                                    const meta = batchMeta.get(originalIndex);
                                    if (!meta || meta.totalCount === 0) return null;
                                    return (
                                        <div className="flex flex-col gap-1.5 mt-1.5">
                                            <button
                                                onClick={() => onGenerateCuts(meta.allCutNumbers)}
                                                className="w-full text-[10px] py-1.5 rounded bg-cyan-700/40 hover:bg-cyan-700/60 text-cyan-100 font-semibold transition-colors"
                                                title={`anchor부터 순서대로 ${meta.totalCount}개 컷을 생성합니다 (Context 모드 일관성 확보)`}
                                            >
                                                ⚓ 배치 전체 생성 ({meta.totalCount}컷)
                                            </button>
                                            {meta.staleCutNumbers.length > 0 && (
                                                <button
                                                    onClick={() => onGenerateCuts(meta.staleCutNumbers)}
                                                    className="w-full text-[10px] py-1 rounded bg-yellow-700/40 hover:bg-yellow-700/60 text-yellow-100 font-semibold transition-colors"
                                                    title={`anchor 변경으로 일관성이 흔들린 ${meta.staleCutNumbers.length}개 컷만 재생성합니다`}
                                                >
                                                    ⚠ stale {meta.staleCutNumbers.length}개 재생성
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Phase A.6: Context 모드 씬 디자인 섹션 */}
                                {isContextMode && !isDerivedSessions && (() => {
                                    const sKey = buildSessionKey(session);
                                    const design = designsByKey.get(sKey);
                                    const myAnalyzing = isAnalyzing && (contextAnalysisStatus?.target === 'all' || contextAnalysisStatus?.target === sKey);
                                    const myGenerating = isGenerating && contextGenerationStatus?.target === sKey;
                                    return (
                                        <ContextSceneSection
                                            sessionKey={sKey}
                                            session={session}
                                            design={design}
                                            isAnalyzing={myAnalyzing}
                                            isGenerating={myGenerating}
                                            onAnalyzeOne={() => onAnalyzeOneScene?.(sKey)}
                                            onGenerate={() => onGenerateScene?.(sKey)}
                                            onUpdateCutCount={(count: number) => dispatch({ type: 'SET_TARGET_CUT_COUNT', payload: { sessionKey: sKey, count } })}
                                            onUpdatePlannedCut={(cutIndex: number, data: Partial<PlannedCut>) => dispatch({ type: 'UPDATE_PLANNED_CUT', payload: { sessionKey: sKey, cutIndex, data } })}
                                        />
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
            )}

            {!isDerivedSessions && convertTarget != null && scenarioAnalysis?.outfitSessions?.[convertTarget] && (
                <ConvertToMemoryDialog
                    sessionIndex={convertTarget}
                    target={scenarioAnalysis.outfitSessions[convertTarget]}
                    onClose={() => setConvertTarget(null)}
                    dispatch={dispatch}
                />
            )}
            {!isDerivedSessions && splitTarget != null && scenarioAnalysis?.outfitSessions?.[splitTarget] && (
                <SplitDialog
                    sessionIndex={splitTarget}
                    target={scenarioAnalysis.outfitSessions[splitTarget]}
                    onClose={() => setSplitTarget(null)}
                    dispatch={dispatch}
                />
            )}
            {!isDerivedSessions && editTarget != null && scenarioAnalysis?.outfitSessions?.[editTarget] && (
                <EditDialog
                    sessionIndex={editTarget}
                    target={scenarioAnalysis.outfitSessions[editTarget]}
                    layer={layerById(scenarioAnalysis.outfitSessions[editTarget].layerId)}
                    onClose={() => setEditTarget(null)}
                    dispatch={dispatch}
                />
            )}
        </div>
    );
};

// ── 다이얼로그: 회상으로 변환 ──────────────────────────────────────
interface ConvertDialogProps {
    sessionIndex: number;
    target: OutfitSession;
    onClose: () => void;
    dispatch: React.Dispatch<AppAction>;
}

const ConvertToMemoryDialog: React.FC<ConvertDialogProps> = ({ sessionIndex, target, onClose, dispatch }) => {
    const [label, setLabel] = useState('');
    const [tone, setTone] = useState<ToneModifier>('warm-vintage');

    const handleApply = () => {
        const finalLabel = label.trim() || `회상 (${target.location})`;
        dispatch({ type: 'CONVERT_TO_MEMORY_BATCH', payload: { sessionIndex, layerLabel: finalLabel, toneModifier: tone } });
        onClose();
    };

    return (
        <DialogShell title="회상으로 변환" onClose={onClose}>
            <div className="space-y-3">
                <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">라벨</label>
                    <input
                        type="text"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="예: 10년 전 어린시절"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:border-purple-500 outline-none"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">시각 톤</label>
                    <select
                        value={tone}
                        onChange={e => setTone(e.target.value as ToneModifier)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none"
                    >
                        {TONE_MODIFIER_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <div className="text-[10px] text-zinc-500">
                    대상 배치: {target.location} · L{target.lineRange[0]}-{target.lineRange[1]}
                </div>
                <div className="flex gap-2 pt-2">
                    <button onClick={onClose} className="flex-1 py-2 text-xs rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300">취소</button>
                    <button onClick={handleApply} className="flex-1 py-2 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold">변환</button>
                </div>
            </div>
        </DialogShell>
    );
};

// ── 다이얼로그: 분리 ────────────────────────────────────────────────
interface SplitDialogProps {
    sessionIndex: number;
    target: OutfitSession;
    onClose: () => void;
    dispatch: React.Dispatch<AppAction>;
}

const SplitDialog: React.FC<SplitDialogProps> = ({ sessionIndex, target, onClose, dispatch }) => {
    const [splitAtLine, setSplitAtLine] = useState(target.lineRange[0] + 1);
    const validRange = splitAtLine > target.lineRange[0] && splitAtLine <= target.lineRange[1];

    const handleApply = () => {
        if (!validRange) return;
        dispatch({ type: 'SPLIT_OUTFIT_SESSION', payload: { index: sessionIndex, splitAtLine } });
        onClose();
    };

    return (
        <DialogShell title="배치 분리" onClose={onClose}>
            <div className="space-y-3">
                <div className="text-xs text-zinc-400">
                    배치 범위: <span className="font-mono">L{target.lineRange[0]}-{target.lineRange[1]}</span>
                </div>
                <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">분리 시작 줄</label>
                    <input
                        type="number"
                        value={splitAtLine}
                        onChange={e => setSplitAtLine(Number(e.target.value))}
                        min={target.lineRange[0] + 1}
                        max={target.lineRange[1]}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none"
                        autoFocus
                    />
                    <div className="text-[10px] text-zinc-500 mt-1">
                        결과: L{target.lineRange[0]}-{splitAtLine - 1} / L{splitAtLine}-{target.lineRange[1]}
                    </div>
                </div>
                <div className="flex gap-2 pt-2">
                    <button onClick={onClose} className="flex-1 py-2 text-xs rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300">취소</button>
                    <button
                        onClick={handleApply}
                        disabled={!validRange}
                        className="flex-1 py-2 text-xs rounded-lg bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:opacity-50 text-white font-semibold"
                    >
                        분리
                    </button>
                </div>
            </div>
        </DialogShell>
    );
};

// ── 다이얼로그: 편집 (라벨/노트/톤) ────────────────────────────────
interface EditDialogProps {
    sessionIndex: number;
    target: OutfitSession;
    layer?: SceneLayer;
    onClose: () => void;
    dispatch: React.Dispatch<AppAction>;
}

const EditDialog: React.FC<EditDialogProps> = ({ sessionIndex, target, layer, onClose, dispatch }) => {
    const [userLabel, setUserLabel] = useState(target.userLabel || '');
    const [userNote, setUserNote] = useState(target.userNote || '');
    const [tone, setTone] = useState<ToneModifier>(layer?.toneModifier || 'none');
    const [customTone, setCustomTone] = useState(layer?.customToneText || '');

    const handleApply = () => {
        dispatch({
            type: 'UPDATE_OUTFIT_SESSION',
            payload: {
                index: sessionIndex,
                data: { userLabel: userLabel.trim() || undefined, userNote: userNote.trim() || undefined },
            },
        });
        if (layer && (tone !== layer.toneModifier || customTone !== (layer.customToneText || ''))) {
            dispatch({
                type: 'UPDATE_SCENE_LAYER',
                payload: {
                    layerId: layer.id,
                    data: { toneModifier: tone, customToneText: tone === 'custom' ? customTone : undefined },
                },
            });
        }
        onClose();
    };

    return (
        <DialogShell title="배치 편집" onClose={onClose}>
            <div className="space-y-3">
                <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">라벨</label>
                    <input
                        type="text"
                        value={userLabel}
                        onChange={e => setUserLabel(e.target.value)}
                        placeholder={`${target.location} · ${layer?.label ?? target.layerId}`}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">메모</label>
                    <textarea
                        value={userNote}
                        onChange={e => setUserNote(e.target.value)}
                        rows={2}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none resize-none"
                    />
                </div>
                {layer && (
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">시각 톤 ({layer.label})</label>
                        <select
                            value={tone}
                            onChange={e => setTone(e.target.value as ToneModifier)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none"
                        >
                            {TONE_MODIFIER_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        {tone === 'custom' && (
                            <input
                                type="text"
                                value={customTone}
                                onChange={e => setCustomTone(e.target.value)}
                                placeholder="자유 톤 묘사 (예: 황혼빛 오렌지 톤)"
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none mt-1.5"
                            />
                        )}
                    </div>
                )}
                <div className="flex gap-2 pt-2">
                    <button onClick={onClose} className="flex-1 py-2 text-xs rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300">취소</button>
                    <button onClick={handleApply} className="flex-1 py-2 text-xs rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold">저장</button>
                </div>
            </div>
        </DialogShell>
    );
};

// ── 공용 다이얼로그 셸 ──────────────────────────────────────────────
const DialogShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-zinc-200">{title}</h3>
                <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            {children}
        </div>
    </div>
);
