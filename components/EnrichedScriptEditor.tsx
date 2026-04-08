// components/EnrichedScriptEditor.tsx — ★ Phase 12: 구조화 연출 대본 편집기
// enriched_pause 상태에서 표시. Copy → 외부 AI에서 편집 → Paste → 검증 → Continue

import React, { useState, useMemo, useCallback } from 'react';
import type { EnrichedBeat } from '../types';
import { ClipboardIcon, CheckIcon, PlayIcon, RefreshIcon } from './icons';

// ── 타입 아이콘/색상 매핑 ──
const TYPE_CONFIG: Record<EnrichedBeat['type'], { icon: string; label: string; color: string }> = {
    narration: { icon: '🎬', label: 'NAR', color: 'text-zinc-300' },
    insert:    { icon: '📷', label: 'INS', color: 'text-orange-400' },
    reaction:  { icon: '😮', label: 'REA', color: 'text-teal-400' },
};

interface Props {
    beats: EnrichedBeat[];
    onContinue: (editedBeats: EnrichedBeat[]) => void;
    onRestart: () => void;
    /** 현재 장소 레지스트리 */
    locationRegistry?: string[];
    /** 새 장소 의상/배경 재생성 콜백 */
    onRefreshLocations?: (newLocations: string[]) => Promise<boolean>;
}

// ── 검증 ──
interface ValidationResult {
    valid: boolean;
    beatCount: number;
    errors: string[];
    warnings: string[];
}

function validateBeats(raw: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(raw)) {
        // { beats: [...] } 형태도 허용
        if (raw && typeof raw === 'object' && Array.isArray((raw as any).beats)) {
            raw = (raw as any).beats;
        } else {
            return { valid: false, beatCount: 0, errors: ['JSON 배열이 아닙니다. [ ... ] 형태여야 합니다.'], warnings: [] };
        }
    }

    const arr = raw as any[];
    if (arr.length === 0) {
        return { valid: false, beatCount: 0, errors: ['빈 배열입니다. 최소 1개 항목이 필요합니다.'], warnings: [] };
    }

    for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b || typeof b !== 'object') { errors.push(`#${i + 1}: 유효한 객체가 아닙니다`); continue; }
        if (!b.text && b.type !== 'insert' && b.type !== 'reaction') warnings.push(`#${i + 1}: text 필드가 비어있습니다`);
        if (!['narration', 'insert', 'reaction'].includes(b.type)) warnings.push(`#${i + 1}: type이 "${b.type}" — narration으로 처리됩니다`);
        if (!b.beat) warnings.push(`#${i + 1}: beat 필드가 비어있습니다`);
        if (!b.emotion) warnings.push(`#${i + 1}: emotion 필드가 비어있습니다`);
    }

    return { valid: errors.length === 0, beatCount: arr.length, errors, warnings };
}

function normalizeBeats(raw: unknown): EnrichedBeat[] {
    let arr = Array.isArray(raw) ? raw : (raw as any).beats || [];
    return arr.map((b: any, i: number) => ({
        id: b.id ?? (i + 1),
        type: (['narration', 'insert', 'reaction'].includes(b.type) ? b.type : 'narration') as EnrichedBeat['type'],
        text: String(b.text || ''),
        beat: String(b.beat || ''),
        emotion: String(b.emotion || ''),
        direction: String(b.direction || ''),
    }));
}

export const EnrichedScriptEditor: React.FC<Props> = ({ beats, onContinue, onRestart, locationRegistry, onRefreshLocations }) => {
    const [copied, setCopied] = useState(false);
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [editedBeats, setEditedBeats] = useState<EnrichedBeat[]>(beats);
    const [hasEdited, setHasEdited] = useState(false);
    const [showLocationPanel, setShowLocationPanel] = useState(false);
    const [newLocationInput, setNewLocationInput] = useState('');
    const [pendingLocations, setPendingLocations] = useState<string[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // ── 통계 ──
    const stats = useMemo(() => {
        const nar = editedBeats.filter(b => b.type === 'narration').length;
        const ins = editedBeats.filter(b => b.type === 'insert').length;
        const rea = editedBeats.filter(b => b.type === 'reaction').length;
        return { total: editedBeats.length, nar, ins, rea };
    }, [editedBeats]);

    // ── 장소 관리 ──
    const handleAddPendingLocation = useCallback(() => {
        const trimmed = newLocationInput.trim();
        if (!trimmed) return;
        const existing = new Set([...(locationRegistry || []), ...pendingLocations]);
        if (existing.has(trimmed)) return;
        setPendingLocations(prev => [...prev, trimmed]);
        setNewLocationInput('');
    }, [newLocationInput, locationRegistry, pendingLocations]);

    const handleRemovePendingLocation = useCallback((loc: string) => {
        setPendingLocations(prev => prev.filter(l => l !== loc));
    }, []);

    const handleRefreshNewLocations = useCallback(async () => {
        if (!onRefreshLocations || pendingLocations.length === 0) return;
        setIsRefreshing(true);
        try {
            const success = await onRefreshLocations(pendingLocations);
            if (success) {
                setPendingLocations([]);
                setShowLocationPanel(false);
            }
        } finally {
            setIsRefreshing(false);
        }
    }, [onRefreshLocations, pendingLocations]);

    // ── Copy ──
    const handleCopy = useCallback(async () => {
        const json = JSON.stringify(editedBeats, null, 2);
        try {
            await navigator.clipboard.writeText(json);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* fallback */ }
    }, [editedBeats]);

    // ── Paste 검증 ──
    const pasteValidation = useMemo((): ValidationResult | null => {
        if (!pasteText.trim()) return null;
        try {
            const parsed = JSON.parse(pasteText);
            return validateBeats(parsed);
        } catch (e) {
            return { valid: false, beatCount: 0, errors: [`JSON 파싱 에러: ${(e as Error).message}`], warnings: [] };
        }
    }, [pasteText]);

    const handleApplyPaste = useCallback(() => {
        try {
            const parsed = JSON.parse(pasteText);
            const normalized = normalizeBeats(parsed);
            setEditedBeats(normalized);
            setHasEdited(true);
            setShowPasteModal(false);
            setPasteText('');
        } catch { /* validation already handled */ }
    }, [pasteText]);

    // ── Continue ──
    const handleContinue = useCallback(() => {
        onContinue(editedBeats);
    }, [editedBeats, onContinue]);

    return (
        <div className="flex flex-col h-full max-w-5xl mx-auto w-full px-4 py-6 gap-5">
            {/* ── 헤더 ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-zinc-100">Enriched Script Editor</h2>
                    <p className="text-xs text-zinc-500 mt-1">
                        연출 대본을 확인하고 편집하세요. 외부 AI에서 수정 후 붙여넣기도 가능합니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-600 font-mono">
                        {stats.total}항목 · {stats.nar}대사 · {stats.ins}인서트 · {stats.rea}리액션
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

                {onRefreshLocations && (
                    <button
                        onClick={() => setShowLocationPanel(v => !v)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all duration-200
                            ${showLocationPanel
                                ? 'bg-amber-600/20 border-amber-500/40 text-amber-400'
                                : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-600 hover:text-zinc-200'}`}
                    >
                        📍 장소 관리{pendingLocations.length > 0 ? ` (${pendingLocations.length})` : ''}
                    </button>
                )}

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
                    <PlayIcon className="w-4 h-4" /> Continue → Step 4
                </button>
            </div>

            {/* ── 장소 관리 패널 ── */}
            {showLocationPanel && onRefreshLocations && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-400">📍 장소 레지스트리</span>
                        <span className="text-[10px] text-zinc-600">Step 4(콘티 분할) 전에 장소를 추가하면 의상·배경이 자동 생성됩니다</span>
                    </div>

                    {/* 기존 장소 */}
                    <div className="flex flex-wrap gap-1.5">
                        {(locationRegistry || []).map(loc => (
                            <span key={loc} className="px-2 py-0.5 text-[10px] rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/40">
                                {loc}
                            </span>
                        ))}
                        {pendingLocations.map(loc => (
                            <span key={loc} className="px-2 py-0.5 text-[10px] rounded-full bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                {loc}
                                <button onClick={() => handleRemovePendingLocation(loc)} className="text-amber-500 hover:text-amber-300">×</button>
                            </span>
                        ))}
                    </div>

                    {/* 새 장소 입력 */}
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newLocationInput}
                            onChange={e => setNewLocationInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPendingLocation(); } }}
                            placeholder="새 장소명 입력 (Enter로 추가)"
                            className="flex-1 px-3 py-1.5 text-xs bg-[#0a0a0c] border border-[#333338] rounded-lg text-zinc-300
                                placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                        />
                        <button
                            onClick={handleAddPendingLocation}
                            disabled={!newLocationInput.trim()}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200
                                disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            + 추가
                        </button>
                        {pendingLocations.length > 0 && (
                            <button
                                onClick={handleRefreshNewLocations}
                                disabled={isRefreshing}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all
                                    bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isRefreshing ? <><span className="animate-spin">⏳</span> 생성 중...</> : <>🔄 의상·배경 생성</>}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── 비트 테이블 ── */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-[#2a2a2e] bg-[#0a0a0c]">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#111113] border-b border-[#2a2a2e] z-10">
                        <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-10">#</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-14">Type</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-28">Beat</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em]">Text</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-24">Emotion</th>
                            <th className="px-2 py-2 text-left text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.15em] w-40">Direction</th>
                        </tr>
                    </thead>
                    <tbody>
                        {editedBeats.map((b, i) => {
                            const cfg = TYPE_CONFIG[b.type] || TYPE_CONFIG.narration;
                            return (
                                <tr key={b.id} className="border-b border-[#1e1e21] hover:bg-zinc-800/30 transition-colors">
                                    <td className="px-3 py-2 text-zinc-600 font-mono">{b.id}</td>
                                    <td className="px-2 py-2">
                                        <span className={`inline-flex items-center gap-1 ${cfg.color}`}>
                                            <span>{cfg.icon}</span>
                                            <span className="font-mono text-[10px]">{cfg.label}</span>
                                        </span>
                                    </td>
                                    <td className="px-2 py-2 text-zinc-400 font-medium">{b.beat}</td>
                                    <td className="px-2 py-2 text-zinc-200">{b.text}</td>
                                    <td className="px-2 py-2 text-zinc-400">{b.emotion}</td>
                                    <td className="px-2 py-2 text-zinc-500 truncate max-w-[160px]" title={b.direction}>{b.direction}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── 안내 ── */}
            <div className="text-[10px] text-zinc-600 text-center">
                💡 Copy JSON → Claude/ChatGPT 새 세션에 붙여넣기 → "구조를 유지하면서 내용만 수정해줘" → 결과 복사 → Paste Modified
            </div>

            {/* ── Paste 모달 ── */}
            {showPasteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#111113] border border-[#2a2a2e] rounded-2xl p-6 w-full max-w-2xl mx-4 shadow-2xl">
                        <h3 className="text-sm font-bold text-zinc-200 mb-3">수정된 연출 대본 붙여넣기</h3>
                        <textarea
                            value={pasteText}
                            onChange={e => setPasteText(e.target.value)}
                            placeholder='여기에 수정된 JSON을 붙여넣으세요 (⌘+V)...'
                            className="w-full h-64 bg-[#0a0a0c] border border-[#333338] rounded-xl p-3 text-xs text-zinc-300 font-mono resize-none
                                placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all"
                            autoFocus
                        />

                        {/* 검증 결과 */}
                        {pasteValidation && (
                            <div className="mt-3 space-y-1">
                                {pasteValidation.valid ? (
                                    <p className="text-xs text-teal-400 flex items-center gap-1">
                                        <CheckIcon className="w-3.5 h-3.5" /> JSON 유효 · {pasteValidation.beatCount}개 항목 감지
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
