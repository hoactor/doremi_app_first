
import React, { useState, useEffect, useCallback } from 'react';
import { LoRAEntry } from '../types';
import { IS_TAURI, saveLoraRegistry, loadLoraRegistry } from '../services/tauriAdapter';
import { XIcon, PlusIcon, TrashIcon, PencilIcon, CheckIcon, SparklesIcon } from './icons';

// ─── Props ────────────────────────────────────────────────────────
interface LoraRegistryModalProps {
    isOpen: boolean;
    onClose: () => void;
    filterType?: 'character' | 'style' | null;  // null = 전체
    onSelect?: (entry: LoRAEntry) => void;       // 선택 모드
}

// ─── ID 생성 ──────────────────────────────────────────────────────
function generateId(): string {
    return 'lora_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// ─── 빈 항목 ─────────────────────────────────────────────────────
function createEmptyEntry(type: 'character' | 'style'): Omit<LoRAEntry, 'id' | 'createdAt'> {
    return { name: '', url: '', triggerWord: '', scale: 0.9, type, baseAppearance: '' };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const LoraRegistryModal: React.FC<LoraRegistryModalProps> = ({
    isOpen, onClose, filterType, onSelect,
}) => {
    const [entries, setEntries] = useState<LoRAEntry[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Omit<LoRAEntry, 'id' | 'createdAt'>>(() => createEmptyEntry('character'));
    const [isAdding, setIsAdding] = useState(false);

    // ── 로드 ──
    const loadEntries = useCallback(async () => {
        if (!IS_TAURI) return;
        try {
            const loaded = await loadLoraRegistry();
            setEntries(loaded);
        } catch (e) {
            console.error('LoRA 레지스트리 로드 실패:', e);
        }
    }, []);

    useEffect(() => { if (isOpen) loadEntries(); }, [isOpen, loadEntries]);

    // ── 저장 ──
    const persist = useCallback(async (updated: LoRAEntry[]) => {
        setEntries(updated);
        if (IS_TAURI) {
            try { await saveLoraRegistry(updated); } catch (e) { console.error('LoRA 저장 실패:', e); }
        }
    }, []);

    // ── 필터 ──
    const filtered = filterType
        ? entries.filter(e => e.type === filterType)
        : entries;

    // ── 추가 시작 ──
    const handleStartAdd = () => {
        setDraft(createEmptyEntry(filterType || 'character'));
        setIsAdding(true);
        setEditingId(null);
    };

    // ── 추가 확정 ──
    const handleConfirmAdd = async () => {
        if (!draft.name.trim() || !draft.url.trim()) return;
        const newEntry: LoRAEntry = {
            ...draft,
            id: generateId(),
            createdAt: new Date().toISOString(),
        };
        await persist([...entries, newEntry]);
        setIsAdding(false);
    };

    // ── 편집 시작 ──
    const handleStartEdit = (entry: LoRAEntry) => {
        setEditingId(entry.id);
        setDraft({ name: entry.name, url: entry.url, triggerWord: entry.triggerWord, scale: entry.scale, type: entry.type, baseAppearance: entry.baseAppearance || '' });
        setIsAdding(false);
    };

    // ── 편집 확정 ──
    const handleConfirmEdit = async () => {
        if (!editingId || !draft.name.trim() || !draft.url.trim()) return;
        const updated = entries.map(e => e.id === editingId ? { ...e, ...draft } : e);
        await persist(updated);
        setEditingId(null);
    };

    // ── 삭제 ──
    const handleDelete = async (id: string) => {
        const updated = entries.filter(e => e.id !== id);
        await persist(updated);
        if (editingId === id) setEditingId(null);
    };

    // ── 취소 ──
    const handleCancel = () => {
        setEditingId(null);
        setIsAdding(false);
    };

    if (!isOpen) return null;

    // ── 편집 폼 (추가/수정 공용) ──
    const renderForm = (onConfirm: () => void) => (
        <div className="bg-zinc-800/80 border border-teal-500/30 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">이름</label>
                    <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                        placeholder="김주임 LoRA"
                        className="w-full mt-1 px-3 py-2 text-xs bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-200" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">트리거워드</label>
                    <input value={draft.triggerWord} onChange={e => setDraft(d => ({ ...d, triggerWord: e.target.value }))}
                        placeholder="dss_boy"
                        className="w-full mt-1 px-3 py-2 text-xs bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-200 font-mono" />
                </div>
            </div>
            <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase">URL (.safetensors)</label>
                <input value={draft.url} onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                    placeholder="https://v3b.fal.media/files/..."
                    className="w-full mt-1 px-3 py-2 text-xs bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-200 font-mono" />
            </div>
            {/* baseAppearance — 캐릭터 LoRA 전용 */}
            {draft.type === 'character' && (
                <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">외형 묘사 <span className="text-amber-400">(baseAppearance)</span></label>
                    <input value={draft.baseAppearance || ''} onChange={e => setDraft(d => ({ ...d, baseAppearance: e.target.value }))}
                        placeholder="light brown wavy long hair, large golden eyes..."
                        className="w-full mt-1 px-3 py-2 text-xs bg-zinc-900 border border-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 text-zinc-200" />
                </div>
            )}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Scale: {draft.scale.toFixed(2)}</label>
                    <input type="range" min={0} max={100} step={5} value={draft.scale * 100}
                        onChange={e => setDraft(d => ({ ...d, scale: Number(e.target.value) / 100 }))}
                        className="w-full h-1.5 rounded-full appearance-none bg-zinc-700 accent-teal-500 cursor-pointer mt-1" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">유형</label>
                    <div className="flex gap-1 mt-1">
                        {(['character', 'style'] as const).map(t => (
                            <button key={t} onClick={() => setDraft(d => ({ ...d, type: t }))}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                                    draft.type === t
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600'
                                }`}
                            >{t === 'character' ? '캐릭터' : '화풍'}</button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex gap-2 justify-end">
                <button onClick={handleCancel} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">취소</button>
                <button onClick={onConfirm}
                    disabled={!draft.name.trim() || !draft.url.trim()}
                    className="px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    <CheckIcon className="w-3 h-3 inline mr-1" />확인
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-700/50 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-fade-in-scale">

                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-teal-400" />
                        LoRA 레지스트리
                        <span className="text-xs font-normal text-zinc-500 ml-1">
                            {entries.length}개 등록
                        </span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <button onClick={handleStartAdd}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-all">
                            <PlusIcon className="w-3.5 h-3.5" /> 새 LoRA
                        </button>
                        <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors">
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* 바디 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {/* 추가 폼 */}
                    {isAdding && renderForm(handleConfirmAdd)}

                    {/* 목록 */}
                    {filtered.length === 0 && !isAdding && (
                        <div className="text-center text-zinc-500 py-12 text-sm">
                            등록된 LoRA가 없습니다. "새 LoRA"로 추가하세요.
                        </div>
                    )}

                    {filtered.map(entry => (
                        <div key={entry.id}>
                            {editingId === entry.id ? (
                                renderForm(handleConfirmEdit)
                            ) : (
                                <div className={`bg-zinc-800/50 border rounded-xl p-4 flex items-center gap-4 transition-all ${
                                    onSelect ? 'cursor-pointer hover:border-teal-500/50 hover:bg-zinc-800' : ''
                                } border-zinc-700/50`}
                                    onClick={() => onSelect?.(entry)}
                                >
                                    {/* 타입 뱃지 */}
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                        entry.type === 'character'
                                            ? 'bg-blue-900/40 text-blue-400 border border-blue-700/50'
                                            : 'bg-purple-900/40 text-purple-400 border border-purple-700/50'
                                    }`}>
                                        {entry.type === 'character' ? '👤' : '🎨'}
                                    </div>

                                    {/* 정보 */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white">{entry.name}</span>
                                            <code className="text-[10px] font-mono text-teal-400 bg-teal-900/30 px-1.5 py-0.5 rounded">
                                                {entry.triggerWord}
                                            </code>
                                            <span className="text-[10px] text-zinc-500">scale {entry.scale}</span>
                                        </div>
                                        {entry.baseAppearance && (
                                            <p className="text-[10px] text-amber-400/70 truncate mt-0.5">👁 {entry.baseAppearance}</p>
                                        )}
                                        <p className="text-[10px] text-zinc-500 truncate mt-0.5 font-mono">{entry.url}</p>
                                    </div>

                                    {/* 액션 */}
                                    <div className="flex gap-1 shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); handleStartEdit(entry); }}
                                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
                                            <PencilIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                                            className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-900/30 transition-colors">
                                            <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* 푸터 */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 text-xs text-zinc-500">
                    <span>fal.ai에서 학습된 LoRA URL을 등록하면 Flux LoRA 모델 사용 시 자동 적용됩니다.</span>
                    <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};
