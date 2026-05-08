// components/OpenAIStyleManagerModal.tsx — OpenAI(DALL-E/gpt-image-2) 화풍 추가/관리 모달
// 단일 모달에 "추가 폼 + 리스트(편집/삭제/디폴트)" 통합. AppContext 미사용 (독립 윈도우 호환).

import React, { useEffect, useState, useCallback } from 'react';
import {
    loadStyleRegistry, addStyle, updateStyle, deleteStyle, setDefaultStyle, BUILTIN_ID_PREFIXES,
} from '../services/openaiStyleRegistry';
import { generateStyleBlockFromKorean, DalleError } from '../services/openaiService';
import { emit } from '../services/tauriAdapter';
import type { OpenAIStylePreset } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** 추가/저장 후 부모에 알림 (옵션). 변경된 styleId 반환. */
    onChanged?: (changedStyleId?: string) => void;
}

export const OpenAIStyleManagerModal: React.FC<Props> = ({ isOpen, onClose, onChanged }) => {
    const [styles, setStyles] = useState<OpenAIStylePreset[]>([]);
    const [defaultId, setDefaultId] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    // 추가 폼 상태
    const [newId, setNewId] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newKorean, setNewKorean] = useState('');
    const [newStyleBlock, setNewStyleBlock] = useState('');
    const [isConverting, setIsConverting] = useState(false);

    // 편집 모달 상태
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editStyleBlock, setEditStyleBlock] = useState('');

    const refresh = useCallback(async () => {
        try {
            const reg = await loadStyleRegistry();
            setStyles(reg.styles);
            setDefaultId(reg.defaultStyleId);
        } catch (e: any) {
            setErrorMsg(`레지스트리 로드 실패: ${e?.message || e}`);
        }
    }, []);

    useEffect(() => { if (isOpen) refresh(); }, [isOpen, refresh]);

    if (!isOpen) return null;

    const resetAddForm = () => {
        setNewId(''); setNewLabel(''); setNewKorean(''); setNewStyleBlock('');
        setIsConverting(false); setErrorMsg(null);
    };

    const handleConvert = async () => {
        if (!newKorean.trim()) { setErrorMsg('한글 묘사를 입력해주세요.'); return; }
        setIsConverting(true); setErrorMsg(null);
        try {
            const block = await generateStyleBlockFromKorean(newKorean.trim());
            setNewStyleBlock(block);
            setStatusMsg('AI 변환 완료. styleBlock을 직접 편집할 수 있습니다.');
            setTimeout(() => setStatusMsg(null), 3000);
        } catch (e: any) {
            const msg = e instanceof DalleError ? e.message : (e?.message || String(e));
            setErrorMsg(`AI 변환 실패: ${msg}`);
        } finally {
            setIsConverting(false);
        }
    };

    const handleAdd = async () => {
        const id = newId.trim();
        const label = newLabel.trim();
        const block = newStyleBlock.trim();

        if (!id) { setErrorMsg('ID를 입력해주세요. (예: my-watercolor)'); return; }
        if (!/^[a-z0-9-]+$/i.test(id)) { setErrorMsg('ID는 영문/숫자/하이픈만 허용됩니다.'); return; }
        if (BUILTIN_ID_PREFIXES.some(p => id.startsWith(p))) {
            setErrorMsg(`예약된 prefix는 사용할 수 없습니다: ${BUILTIN_ID_PREFIXES.join(', ')}`); return;
        }
        if (!label) { setErrorMsg('이름을 입력해주세요.'); return; }
        if (!block) { setErrorMsg('styleBlock이 비어있습니다. AI 변환을 누르거나 직접 입력해주세요.'); return; }

        setBusy(true); setErrorMsg(null);
        try {
            await addStyle({ id, label, styleBlock: block });
            await emit('openai-styles-updated', { kind: 'added', id }).catch(() => {});
            await refresh();
            resetAddForm();
            setStatusMsg(`'${label}' 추가 완료`);
            setTimeout(() => setStatusMsg(null), 3000);
            onChanged?.(id);
        } catch (e: any) {
            setErrorMsg(`추가 실패: ${e?.message || e}`);
        } finally {
            setBusy(false);
        }
    };

    const startEdit = (s: OpenAIStylePreset) => {
        setEditingId(s.id);
        setEditLabel(s.label);
        setEditStyleBlock(s.styleBlock);
    };

    const cancelEdit = () => {
        setEditingId(null); setEditLabel(''); setEditStyleBlock('');
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        setBusy(true); setErrorMsg(null);
        try {
            await updateStyle(editingId, { label: editLabel.trim(), styleBlock: editStyleBlock.trim() });
            await emit('openai-styles-updated', { kind: 'updated', id: editingId }).catch(() => {});
            await refresh();
            cancelEdit();
            setStatusMsg('편집 저장 완료');
            setTimeout(() => setStatusMsg(null), 3000);
            onChanged?.(editingId);
        } catch (e: any) {
            setErrorMsg(`저장 실패: ${e?.message || e}`);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (s: OpenAIStylePreset) => {
        if (s.isBuiltin) return;
        if (!confirm(`'${s.label}' 화풍을 삭제할까요?`)) return;
        setBusy(true); setErrorMsg(null);
        try {
            await deleteStyle(s.id);
            await emit('openai-styles-updated', { kind: 'deleted', id: s.id }).catch(() => {});
            await refresh();
            setStatusMsg(`'${s.label}' 삭제 완료`);
            setTimeout(() => setStatusMsg(null), 3000);
            onChanged?.(undefined);
        } catch (e: any) {
            setErrorMsg(`삭제 실패: ${e?.message || e}`);
        } finally {
            setBusy(false);
        }
    };

    const handleSetDefault = async (id: string) => {
        setBusy(true); setErrorMsg(null);
        try {
            await setDefaultStyle(id);
            await emit('openai-styles-updated', { kind: 'default-changed', id }).catch(() => {});
            await refresh();
            setStatusMsg('디폴트 화풍 변경 완료');
            setTimeout(() => setStatusMsg(null), 3000);
            onChanged?.(id);
        } catch (e: any) {
            setErrorMsg(`디폴트 변경 실패: ${e?.message || e}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-zinc-900 border border-violet-700/40 rounded-2xl w-[720px] max-h-[88vh] overflow-hidden flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}>
                {/* 헤더 */}
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-violet-300">OpenAI 화풍 관리</h2>
                        <p className="text-[11px] text-zinc-500 mt-0.5">DALL-E 3 / gpt-image-2 공용. 빌트인은 🔒 표시.</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none">×</button>
                </div>

                {/* 본문 */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* 상태 메시지 */}
                    {errorMsg && (
                        <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/40 text-red-300 text-xs">
                            {errorMsg}
                        </div>
                    )}
                    {statusMsg && (
                        <div className="px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 text-xs">
                            {statusMsg}
                        </div>
                    )}

                    {/* ── 추가 폼 ── */}
                    <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                        <h3 className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-[0.18em]">새 화풍 추가</h3>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] text-zinc-500 mb-1">ID (영문/숫자/하이픈)</label>
                                <input value={newId} onChange={e => setNewId(e.target.value)} disabled={busy}
                                    placeholder="예: my-watercolor"
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] text-zinc-500 mb-1">이름 (한글 OK)</label>
                                <input value={newLabel} onChange={e => setNewLabel(e.target.value)} disabled={busy}
                                    placeholder="예: 내 수채화풍"
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] text-zinc-500 mb-1">한글 묘사 (AI 변환 입력)</label>
                            <textarea value={newKorean} onChange={e => setNewKorean(e.target.value)} disabled={busy}
                                rows={2}
                                placeholder="예: 수채화풍, 부드럽고 따뜻한 파스텔 색감, 손맛 살린 라인"
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500 resize-none" />
                            <button onClick={handleConvert} disabled={busy || isConverting || !newKorean.trim()}
                                className="mt-2 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-violet-700/50 hover:bg-violet-700/70 text-violet-100 transition-colors disabled:opacity-40">
                                {isConverting ? '변환 중...' : '✨ AI로 styleBlock 변환'}
                            </button>
                        </div>

                        <div>
                            <label className="block text-[10px] text-zinc-500 mb-1">styleBlock (영문 키워드 — 직접 편집 가능)</label>
                            <textarea value={newStyleBlock} onChange={e => setNewStyleBlock(e.target.value)} disabled={busy}
                                rows={3}
                                placeholder="AI 변환 결과가 여기에 채워집니다. 직접 수정도 가능."
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono outline-none focus:border-violet-500 resize-none" />
                        </div>

                        <div className="flex gap-2">
                            <button onClick={handleAdd} disabled={busy || !newId.trim() || !newLabel.trim() || !newStyleBlock.trim()}
                                className="flex-1 py-2 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:bg-zinc-700 disabled:opacity-50">
                                💾 화풍 저장
                            </button>
                            <button onClick={resetAddForm} disabled={busy}
                                className="px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-40">
                                초기화
                            </button>
                        </div>
                    </section>

                    {/* ── 리스트 ── */}
                    <section className="space-y-2">
                        <h3 className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-[0.18em]">전체 화풍 ({styles.length})</h3>
                        {styles.length === 0 && <p className="text-xs text-zinc-500">로딩 중...</p>}
                        {styles.map(s => (
                            <div key={s.id} className={`rounded-lg border p-3 ${
                                editingId === s.id ? 'border-violet-600/60 bg-violet-950/20' : 'border-zinc-800 bg-zinc-950/30'
                            }`}>
                                {editingId === s.id ? (
                                    /* 편집 모드 */
                                    <div className="space-y-2">
                                        <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                                            placeholder="이름"
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-violet-500" />
                                        <textarea value={editStyleBlock} onChange={e => setEditStyleBlock(e.target.value)}
                                            rows={3}
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono outline-none focus:border-violet-500 resize-none" />
                                        <div className="flex gap-2">
                                            <button onClick={handleSaveEdit} disabled={busy}
                                                className="px-3 py-1 text-[11px] font-bold rounded bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40">
                                                저장
                                            </button>
                                            <button onClick={cancelEdit} disabled={busy}
                                                className="px-3 py-1 text-[11px] font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-40">
                                                취소
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* 표시 모드 */
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold text-zinc-200">{s.label}</span>
                                                {s.isBuiltin && <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">빌트인 🔒</span>}
                                                {defaultId === s.id && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300">디폴트</span>}
                                                <span className="text-[9px] text-zinc-600 font-mono">{s.id}</span>
                                            </div>
                                            <p className="text-[10px] text-zinc-500 font-mono leading-snug line-clamp-2 break-all">{s.styleBlock}</p>
                                        </div>
                                        <div className="flex flex-col gap-1 flex-shrink-0">
                                            {defaultId !== s.id && (
                                                <button onClick={() => handleSetDefault(s.id)} disabled={busy}
                                                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-violet-800 text-zinc-400 hover:text-violet-200 disabled:opacity-40">
                                                    디폴트로
                                                </button>
                                            )}
                                            {!s.isBuiltin && (<>
                                                <button onClick={() => startEdit(s)} disabled={busy}
                                                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-40">
                                                    편집
                                                </button>
                                                <button onClick={() => handleDelete(s)} disabled={busy}
                                                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-red-900/40 text-zinc-400 hover:text-red-300 disabled:opacity-40">
                                                    삭제
                                                </button>
                                            </>)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </section>
                </div>
            </div>
        </div>
    );
};
