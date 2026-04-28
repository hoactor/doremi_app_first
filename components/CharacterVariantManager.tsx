// components/CharacterVariantManager.tsx — Phase A: 캐릭터별 시점(sceneLayer) 외형 관리
// props 패턴 — useAppContext 직접 호출 금지

import React, { useState, useMemo } from 'react';
import type { CharacterDescription, CharacterVariant, SceneLayer, AppAction, ScenarioAnalysis } from '../types';
import { DEFAULT_SCENE_LAYER_ID } from '../types/pipeline';

interface CharacterVariantManagerProps {
    characterKey: string;
    character: CharacterDescription;
    scenarioAnalysis: ScenarioAnalysis | null;
    dispatch: React.Dispatch<AppAction>;
}

export const CharacterVariantManager: React.FC<CharacterVariantManagerProps> = ({
    characterKey, character, scenarioAnalysis, dispatch,
}) => {
    const [addOpen, setAddOpen] = useState(false);
    const [editTargetId, setEditTargetId] = useState<string | null>(null);

    // 회상/상상 레이어가 있을 때만 표시 (현재 외 레이어 1개 이상)
    const otherLayers = useMemo(() => {
        const layers = scenarioAnalysis?.sceneLayers || [];
        return layers.filter(l => l.id !== DEFAULT_SCENE_LAYER_ID);
    }, [scenarioAnalysis?.sceneLayers]);

    if (otherLayers.length === 0) {
        return null;
    }

    const variants = character.variants || [];
    const editTarget = editTargetId ? variants.find(v => v.variantId === editTargetId) : null;

    return (
        <div className="mt-3 pt-3 border-t border-zinc-800">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em]">
                    시점별 외형 ({variants.length})
                </h4>
                <button
                    onClick={() => setAddOpen(true)}
                    className="text-[10px] px-2 py-0.5 rounded bg-purple-700/30 hover:bg-purple-700/50 text-purple-200"
                >
                    + 추가
                </button>
            </div>

            {variants.length > 0 ? (
                <div className="space-y-1.5">
                    {variants.map(v => {
                        const layer = otherLayers.find(l => l.id === v.appliedToLayerId);
                        return (
                            <div key={v.variantId} className="flex items-start gap-2 bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-2">
                                {v.characterSheetUrl && (
                                    <img src={v.characterSheetUrl} alt={v.label} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-zinc-200 truncate">{v.label}</div>
                                    <div className="text-[10px] text-zinc-500">→ {layer?.label || v.appliedToLayerId}</div>
                                    {v.koreanBaseAppearance && (
                                        <div className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{v.koreanBaseAppearance}</div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={() => setEditTargetId(v.variantId)}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (confirm(`"${v.label}" 시점 외형을 삭제할까요?`)) {
                                                dispatch({ type: 'DELETE_CHARACTER_VARIANT', payload: { characterKey, variantId: v.variantId } });
                                            }
                                        }}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 hover:bg-red-800/60 text-red-300"
                                    >
                                        🗑
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-[10px] text-zinc-600 italic">
                    회상/상상 레이어용 시점 외형 없음
                </div>
            )}

            {addOpen && (
                <VariantDialog
                    title="시점 외형 추가"
                    layers={otherLayers}
                    onClose={() => setAddOpen(false)}
                    onApply={(data) => {
                        const variant: CharacterVariant = {
                            variantId: `var-${Date.now()}`,
                            label: data.label,
                            appliedToLayerId: data.appliedToLayerId,
                            baseAppearance: data.baseAppearance,
                            koreanBaseAppearance: data.koreanBaseAppearance,
                            characterSheetUrl: data.characterSheetUrl || undefined,
                        };
                        dispatch({ type: 'ADD_CHARACTER_VARIANT', payload: { characterKey, variant } });
                        setAddOpen(false);
                    }}
                />
            )}
            {editTarget && (
                <VariantDialog
                    title="시점 외형 수정"
                    layers={otherLayers}
                    initial={editTarget}
                    onClose={() => setEditTargetId(null)}
                    onApply={(data) => {
                        dispatch({
                            type: 'UPDATE_CHARACTER_VARIANT',
                            payload: { characterKey, variantId: editTarget.variantId, data },
                        });
                        setEditTargetId(null);
                    }}
                />
            )}
        </div>
    );
};

// ── 추가/수정 공용 다이얼로그 ──────────────────────────────────────
interface VariantFormData {
    label: string;
    appliedToLayerId: string;
    baseAppearance: string;
    koreanBaseAppearance: string;
    characterSheetUrl: string;
}

interface VariantDialogProps {
    title: string;
    layers: SceneLayer[];
    initial?: CharacterVariant;
    onClose: () => void;
    onApply: (data: VariantFormData) => void;
}

const VariantDialog: React.FC<VariantDialogProps> = ({ title, layers, initial, onClose, onApply }) => {
    const [label, setLabel] = useState(initial?.label || '');
    const [layerId, setLayerId] = useState(initial?.appliedToLayerId || layers[0]?.id || '');
    const [koAppearance, setKoAppearance] = useState(initial?.koreanBaseAppearance || '');
    const [enAppearance, setEnAppearance] = useState(initial?.baseAppearance || '');
    const [sheetUrl, setSheetUrl] = useState(initial?.characterSheetUrl || '');

    const canApply = label.trim() && layerId && (koAppearance.trim() || enAppearance.trim());

    const handleApply = () => {
        if (!canApply) return;
        onApply({
            label: label.trim(),
            appliedToLayerId: layerId,
            baseAppearance: enAppearance.trim(),
            koreanBaseAppearance: koAppearance.trim(),
            characterSheetUrl: sheetUrl.trim(),
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-full max-w-md"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-zinc-200">{title}</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">라벨</label>
                        <input
                            type="text"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            placeholder="예: 13살 (초등학교)"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">적용 레이어</label>
                        <select
                            value={layerId}
                            onChange={e => setLayerId(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none"
                        >
                            {layers.map(l => (
                                <option key={l.id} value={l.id}>{l.label} ({l.id})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">외형 (한글)</label>
                        <textarea
                            value={koAppearance}
                            onChange={e => setKoAppearance(e.target.value)}
                            rows={2}
                            placeholder="예: 단발머리에 동그란 안경, 키가 작은 초등학생 체형"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none resize-none"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">외형 (영문, 선택)</label>
                        <textarea
                            value={enAppearance}
                            onChange={e => setEnAppearance(e.target.value)}
                            rows={2}
                            placeholder="e.g., short bob hair, round glasses, petite elementary school build"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none resize-none"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">캐릭터 시트 URL (선택)</label>
                        <input
                            type="text"
                            value={sheetUrl}
                            onChange={e => setSheetUrl(e.target.value)}
                            placeholder="data:... 또는 https://..."
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 outline-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button onClick={onClose} className="flex-1 py-2 text-xs rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300">취소</button>
                        <button
                            onClick={handleApply}
                            disabled={!canApply}
                            className="flex-1 py-2 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:opacity-50 text-white font-semibold"
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
