// components/ContiCutEditor.tsx — conti_pause 상태에서 표시
// 콘티 컷(ContiCut[]) JSON을 Copy → 외부 AI 편집 → Paste → 검증 → Continue(Step 6)

import React, { useState, useMemo, useCallback } from 'react';
import type { ContiCut, CutType } from '../types';
import { ClipboardIcon, CheckIcon, PlayIcon, RefreshIcon } from './icons';

// ── 타입 아이콘/색상 매핑 ──
const CUT_TYPE_CONFIG: Record<CutType, { icon: string; label: string; color: string }> = {
    dialogue:   { icon: '💬', label: 'DIA', color: 'text-zinc-300' },
    reaction:   { icon: '😮', label: 'REA', color: 'text-teal-400' },
    insert:     { icon: '📷', label: 'INS', color: 'text-orange-400' },
    establish:  { icon: '🏞️', label: 'EST', color: 'text-blue-400' },
    transition: { icon: '🔄', label: 'TRN', color: 'text-purple-400' },
};

interface Props {
    cuts: ContiCut[];
    onContinue: () => void;
    onRestart: () => void;
    /** 개별 컷 수정 시 state 업데이트 */
    onUpdateCuts?: (cuts: ContiCut[]) => void;
    /** 현재 장소 레지스트리 (새 장소 감지용) */
    locationRegistry?: string[];
    /** 새 장소 의상/배경 재생성 콜백 */
    onRefreshLocations?: (newLocations: string[]) => Promise<boolean>;
}

// ── 검증 ──
interface ValidationResult {
    valid: boolean;
    cutCount: number;
    errors: string[];
    warnings: string[];
}

function validateContiCuts(raw: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(raw)) {
        if (raw && typeof raw === 'object' && Array.isArray((raw as any).cuts)) {
            raw = (raw as any).cuts;
        } else {
            return { valid: false, cutCount: 0, errors: ['JSON 배열이 아닙니다. [ ... ] 형태여야 합니다.'], warnings: [] };
        }
    }

    const arr = raw as any[];
    if (arr.length === 0) {
        return { valid: false, cutCount: 0, errors: ['빈 배열입니다. 최소 1개 컷이 필요합니다.'], warnings: [] };
    }

    const validTypes: CutType[] = ['dialogue', 'reaction', 'insert', 'establish', 'transition'];

    for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (!c || typeof c !== 'object') { errors.push(`#${i + 1}: 유효한 객체가 아닙니다`); continue; }
        if (!c.id) warnings.push(`#${i + 1}: id 필드가 없습니다`);
        if (!validTypes.includes(c.cutType)) warnings.push(`#${i + 1}: cutType "${c.cutType}" — dialogue로 처리됩니다`);
        if (!c.visualDescription && !c.narration) warnings.push(`#${i + 1}: visualDescription과 narration이 모두 비어있습니다`);
        if (!c.location) warnings.push(`#${i + 1}: location이 비어있습니다`);
    }

    return { valid: errors.length === 0, cutCount: arr.length, errors, warnings };
}

function normalizeContiCuts(raw: unknown): ContiCut[] {
    let arr = Array.isArray(raw) ? raw : (raw as any).cuts || [];
    const validTypes: CutType[] = ['dialogue', 'reaction', 'insert', 'establish', 'transition'];
    return arr.map((c: any, i: number) => ({
        id: c.id || `C${String(i + 1).padStart(3, '0')}`,
        cutType: (validTypes.includes(c.cutType) ? c.cutType : 'dialogue') as CutType,
        originLines: c.originLines || [],
        narration: String(c.narration || ''),
        characters: Array.isArray(c.characters) ? c.characters : [],
        location: String(c.location || ''),
        visualDescription: String(c.visualDescription || ''),
        emotionBeat: String(c.emotionBeat || ''),
        direction: c.direction || '',
        characterPose: c.characterPose || '',
        sfxNote: c.sfxNote || '',
        locationDetail: c.locationDetail || '',
    }));
}

export const ContiCutEditor: React.FC<Props> = ({ cuts, onContinue, onRestart, onUpdateCuts, locationRegistry, onRefreshLocations }) => {
    const [copied, setCopied] = useState(false);
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [editedCuts, setEditedCuts] = useState<ContiCut[]>(cuts);
    const [hasEdited, setHasEdited] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshedLocations, setRefreshedLocations] = useState<Set<string>>(new Set());

    // ── 통계 ──
    const stats = useMemo(() => {
        const dia = editedCuts.filter(c => c.cutType === 'dialogue').length;
        const rea = editedCuts.filter(c => c.cutType === 'reaction').length;
        const ins = editedCuts.filter(c => c.cutType === 'insert').length;
        const est = editedCuts.filter(c => c.cutType === 'establish').length;
        const trn = editedCuts.filter(c => c.cutType === 'transition').length;
        return { total: editedCuts.length, dia, rea, ins, est, trn };
    }, [editedCuts]);

    // ── 새 장소 감지 ──
    const newLocations = useMemo(() => {
        if (!locationRegistry) return [];
        const registrySet = new Set(locationRegistry);
        const cutLocations = new Set(editedCuts.map(c => c.location).filter(Boolean));
        return [...cutLocations].filter(loc => !registrySet.has(loc) && !refreshedLocations.has(loc));
    }, [editedCuts, locationRegistry, refreshedLocations]);

    const handleRefreshNewLocations = useCallback(async () => {
        if (!onRefreshLocations || newLocations.length === 0) return;
        setIsRefreshing(true);
        try {
            const success = await onRefreshLocations(newLocations);
            if (success) {
                setRefreshedLocations(prev => {
                    const next = new Set(prev);
                    newLocations.forEach(loc => next.add(loc));
                    return next;
                });
            }
        } finally {
            setIsRefreshing(false);
        }
    }, [onRefreshLocations, newLocations]);

    // ── Copy ──
    const handleCopy = useCallback(async () => {
        const json = JSON.stringify(editedCuts, null, 2);
        try {
            await navigator.clipboard.writeText(json);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* fallback */ }
    }, [editedCuts]);

    // ── Paste 검증 ──
    const pasteValidation = useMemo((): ValidationResult | null => {
        if (!pasteText.trim()) return null;
        try {
            const parsed = JSON.parse(pasteText);
            return validateContiCuts(parsed);
        } catch (e) {
            return { valid: false, cutCount: 0, errors: [`JSON 파싱 에러: ${(e as Error).message}`], warnings: [] };
        }
    }, [pasteText]);

    const handleApplyPaste = useCallback(() => {
        try {
            const parsed = JSON.parse(pasteText);
            const normalized = normalizeContiCuts(parsed);
            setEditedCuts(normalized);
            setHasEdited(true);
            setShowPasteModal(false);
            setPasteText('');
            // state에도 반영
            onUpdateCuts?.(normalized);
        } catch { /* validation already handled */ }
    }, [pasteText, onUpdateCuts]);

    // ── Continue ──
    const handleContinue = useCallback(() => {
        // 편집된 컷을 state에 반영 후 Step 6 진행
        if (hasEdited) {
            onUpdateCuts?.(editedCuts);
        }
        onContinue();
    }, [editedCuts, hasEdited, onContinue, onUpdateCuts]);

    return (
        <div className="flex flex-col h-full max-w-6xl mx-auto w-full px-4 py-6 gap-5">
            {/* ── 헤더 ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-zinc-100">Conti Cut Editor</h2>
                    <p className="text-xs text-zinc-500 mt-1">
                        콘티 컷을 확인하고 편집하세요. 외부 AI에서 수정 후 붙여넣기도 가능합니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-600 font-mono">
                        {stats.total}컷 · {stats.dia}대사 · {stats.ins}인서트 · {stats.rea}리액션 · {stats.est}설정 · {stats.trn}전환
                    </span>
                    {hasEdited && <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">수정됨</span>}
                </div>
            </div>

            {/* ── 액션 바 ── */}
            <div className="flex items-center gap-2">
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all duration-200
                        bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-600 hover:text-zinc-200"
                >
                    {copied ? <CheckIcon className="w-3.5 h-3.5 text-teal-400" /> : <ClipboardIcon className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy JSON'}
                </button>

                <button
                    onClick={() => { setShowPasteModal(true); setPasteText(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all duration-200
                        bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-600 hover:text-zinc-200"
                >
                    📥 Paste Modified
                </button>

                <div className="flex-1" />

                <button
                    onClick={onRestart}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all duration-200
                        bg-zinc-800/40 border-zinc-700/40 text-zinc-500 hover:bg-zinc-800 hover:border-zinc-600 hover:text-zinc-300"
                    title="처음부터 다시 시작"
                >
                    <RefreshIcon className="w-3.5 h-3.5" /> Restart
                </button>

                <button
                    onClick={handleContinue}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all duration-200
                        bg-orange-600 text-white hover:bg-orange-500 shadow-lg shadow-orange-600/15"
                >
                    <PlayIcon className="w-4 h-4" /> Continue → Step 6
                </button>
            </div>

            {/* ── 새 장소 감지 배너 ── */}
            {newLocations.length > 0 && onRefreshLocations && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
                    <span className="text-amber-400 text-xs">
                        📍 새 장소 {newLocations.length}개 감지: <strong>{newLocations.join(', ')}</strong>
                        <span className="text-zinc-500 ml-1">— 의상·배경 미등록</span>
                    </span>
                    <div className="flex-1" />
                    <button
                        onClick={handleRefreshNewLocations}
                        disabled={isRefreshing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all duration-200
                            bg-amber-600 text-white hover:bg-amber-500 shadow-lg shadow-amber-600/15
                            disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isRefreshing ? (
                            <><span className="animate-spin">⏳</span> 생성 중...</>
                        ) : (
                            <>🔄 의상·배경 생성</>
                        )}
                    </button>
                </div>
            )}

            {/* ── 컷 테이블 ── */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-[#2a2a2e] bg-[#0a0a0c]">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#111113] border-b border-[#2a2a2e] z-10">
                        <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-16">ID</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-14">Type</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-24">Location</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-24">Characters</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em]">Narration</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-32">Direction</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em]">Visual</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-20">Emotion</th>
                        </tr>
                    </thead>
                    <tbody>
                        {editedCuts.map((c) => {
                            const cfg = CUT_TYPE_CONFIG[c.cutType] || CUT_TYPE_CONFIG.dialogue;
                            return (
                                <tr key={c.id} className="border-b border-[#1e1e21] hover:bg-zinc-800/30 transition-colors">
                                    <td className="px-3 py-2 text-zinc-500 font-mono font-bold">{c.id}</td>
                                    <td className="px-2 py-2">
                                        <span className={`inline-flex items-center gap-1 ${cfg.color}`}>
                                            <span>{cfg.icon}</span>
                                            <span className="font-mono text-[10px]">{cfg.label}</span>
                                        </span>
                                    </td>
                                    <td className="px-2 py-2 text-zinc-400 text-[11px]">{c.location}</td>
                                    <td className="px-2 py-2 text-zinc-400 text-[11px]">{c.characters.join(', ')}</td>
                                    <td className="px-2 py-2 text-zinc-200 text-[11px]">{c.narration || <span className="text-zinc-600 italic">무음</span>}</td>
                                    <td className="px-2 py-2 text-emerald-400/70 text-[11px]">{c.direction || <span className="text-zinc-700">—</span>}</td>
                                    <td className="px-2 py-2 text-zinc-500 text-[11px]">
                                        <span className="line-clamp-2 hover:line-clamp-none cursor-pointer transition-all" title={c.visualDescription}>{c.visualDescription}</span>
                                    </td>
                                    <td className="px-2 py-2 text-zinc-400 text-[11px]">{c.emotionBeat}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── 안내 ── */}
            <div className="text-[10px] text-zinc-600 text-center">
                💡 Copy JSON → Claude/ChatGPT에 붙여넣기 → "컷을 수정/추가/삭제해줘" → 결과 복사 → Paste Modified
            </div>

            {/* ── Paste 모달 ── */}
            {showPasteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#111113] border border-[#2a2a2e] rounded-2xl p-6 w-full max-w-2xl mx-4 shadow-2xl">
                        <h3 className="text-sm font-bold text-zinc-200 mb-3">수정된 콘티 컷 붙여넣기</h3>
                        <textarea
                            value={pasteText}
                            onChange={e => setPasteText(e.target.value)}
                            placeholder='여기에 수정된 ContiCut[] JSON을 붙여넣으세요 (⌘+V)...'
                            className="w-full h-64 bg-[#0a0a0c] border border-[#333338] rounded-xl p-3 text-xs text-zinc-300 font-mono resize-none
                                placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all"
                            autoFocus
                        />

                        {/* 검증 결과 */}
                        {pasteValidation && (
                            <div className="mt-3 space-y-1">
                                {pasteValidation.valid ? (
                                    <p className="text-xs text-teal-400 flex items-center gap-1">
                                        <CheckIcon className="w-3.5 h-3.5" /> JSON 유효 · {pasteValidation.cutCount}개 컷 감지
                                    </p>
                                ) : (
                                    pasteValidation.errors.map((e, i) => (
                                        <p key={i} className="text-xs text-red-400">❌ {e}</p>
                                    ))
                                )}
                                {pasteValidation.warnings.map((w, i) => (
                                    <p key={i} className="text-xs text-orange-400/70">⚠️ {w}</p>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setShowPasteModal(false)}
                                className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-700/40 text-zinc-400 hover:bg-zinc-800 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApplyPaste}
                                disabled={!pasteValidation?.valid}
                                className="px-4 py-2 text-xs font-bold rounded-xl transition-all duration-200
                                    bg-orange-600 text-white hover:bg-orange-500 shadow-lg shadow-orange-600/15
                                    disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                Apply & Replace
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
