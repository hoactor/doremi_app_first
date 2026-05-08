// components/UnifiedImageStudio.tsx — Phase A.7: 통합 이미지 스튜디오 독립 윈도우
// AppContext 미사용. Tauri IPC 직접. Gemini/Flux/OpenAI 3엔진 + 생성/편집 2모드.
//
// 메인 앱 ↔ 스튜디오 IPC 이벤트:
// - main → studio: 'image-studio-init' (초기 컨텍스트)
// - studio → main: 'image-studio-asset-saved' (카탈로그 갱신용)
// - studio → main: 'image-studio-apply-to-cut' (컷에 이미지 추가)
// - studio → main: 'image-studio-window-closed' (UI 정리)

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { listen, emit, saveAsset } from '../services/tauriAdapter';
import type { ImageStudioInitPayload } from '../services/tauriAdapter';
import {
    studioGenerate, studioEdit, engineDisplayName, engineSupportsEdit,
} from '../services/imageStudioEngines';
import type { StudioEngine } from '../services/imageStudioEngines';
import { loadStyleRegistry, FALLBACK_STYLE_ID, invalidateStyleCache } from '../services/openaiStyleRegistry';
import { OpenAIStyleManagerModal } from './OpenAIStyleManagerModal';
import type { ImageRatio, OpenAIImageQuality, OpenAIStylePreset } from '../types';
import type { DalleAssetType } from '../services/openaiService';

interface HistoryItem {
    id: string;
    imageUrl: string;
    engine: StudioEngine;
    mode: 'create' | 'edit';
    prompt: string;
    createdAt: string;
}

const ENGINES: { value: StudioEngine; label: string; color: string }[] = [
    { value: 'gemini',         label: 'Gemini',     color: 'border-orange-500/60 text-orange-400' },
    { value: 'flux',           label: 'Flux',       color: 'border-teal-500/60 text-teal-400' },
    { value: 'openai-gpt2',    label: 'gpt-image-2', color: 'border-violet-500/60 text-violet-400' },
    { value: 'openai-dalle3',  label: 'DALL-E 3',   color: 'border-amber-500/60 text-amber-400' },
];

const ASSET_TYPES: { value: DalleAssetType; label: string }[] = [
    { value: 'character',  label: '👤 캐릭터' },
    { value: 'background', label: '🏞️ 배경' },
    { value: 'outfit',     label: '👕 의상' },
    { value: 'prop',       label: '📦 소품' },
];

const QUALITIES: { value: OpenAIImageQuality; label: string }[] = [
    { value: 'low',    label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high',   label: 'High' },
];

const RATIOS: { value: ImageRatio; label: string }[] = [
    { value: '1:1',  label: '1:1' },
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
];

export const UnifiedImageStudio: React.FC = () => {
    // ── 모드/엔진/옵션 ──
    const [mode, setMode] = useState<'create' | 'edit'>('create');
    const [engine, setEngine] = useState<StudioEngine>('openai-gpt2');
    const [assetType, setAssetType] = useState<DalleAssetType>('character');
    const [ratio, setRatio] = useState<ImageRatio>('1:1');
    const [openaiQuality, setOpenaiQuality] = useState<OpenAIImageQuality>('medium');
    const [seed, setSeed] = useState<string>('');

    // ── DALL-E 3 화풍 레지스트리 ──
    const STYLE_PREF_KEY = 'doremissul_dalle_style_id';
    const [dalleStyles, setDalleStyles] = useState<OpenAIStylePreset[]>([]);
    const [dalleStyleId, setDalleStyleId] = useState<string>(() => {
        try { return localStorage.getItem(STYLE_PREF_KEY) || FALLBACK_STYLE_ID; }
        catch { return FALLBACK_STYLE_ID; }
    });
    const [isStyleManagerOpen, setIsStyleManagerOpen] = useState(false);

    // ── 입력 ──
    const [prompt, setPrompt] = useState('');

    // ── 캔버스/레퍼런스/히스토리 ──
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [referenceImages, setReferenceImages] = useState<string[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    // ── 상태 ──
    const [isBusy, setIsBusy] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [assetName, setAssetName] = useState('');
    const [initContext, setInitContext] = useState<ImageStudioInitPayload | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── 메인 앱 → 스튜디오 IPC 수신 ──
    useEffect(() => {
        let unlistenInit: (() => void) | null = null;
        listen('image-studio-init', (payload: ImageStudioInitPayload) => {
            setInitContext(payload);
            if (payload.mode) setMode(payload.mode);
            if (payload.initialAssetType) setAssetType(payload.initialAssetType);
            if (payload.initialImageUrl) {
                setCurrentImage(payload.initialImageUrl);
                if (payload.mode === undefined) setMode('edit');
            }
        }).then(u => { unlistenInit = u; });

        const handleBeforeUnload = () => { emit('image-studio-window-closed').catch(() => {}); };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            unlistenInit?.();
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // ── 편집 모드인데 엔진이 DALL-E 3면 자동 fallback ──
    useEffect(() => {
        if (mode === 'edit' && !engineSupportsEdit(engine)) {
            setEngine('openai-gpt2');
        }
    }, [mode, engine]);

    // ── DALL-E 3 화풍 레지스트리 로드 (마운트 + 외부 변경 이벤트) ──
    const reloadStyles = useCallback(() => {
        invalidateStyleCache();
        loadStyleRegistry()
            .then(reg => {
                setDalleStyles(reg.styles);
                if (!reg.styles.some(s => s.id === dalleStyleId)) {
                    setDalleStyleId(reg.defaultStyleId);
                }
            })
            .catch(err => console.warn('[UnifiedImageStudio] 화풍 레지스트리 로드 실패', err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dalleStyleId]);

    useEffect(() => {
        reloadStyles();
        let unlisten: (() => void) | null = null;
        listen('openai-styles-updated', () => reloadStyles())
            .then(u => { unlisten = u; }).catch(() => {});
        return () => { unlisten?.(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 화풍 선택 변경 시 localStorage 저장 ──
    useEffect(() => {
        try { localStorage.setItem(STYLE_PREF_KEY, dalleStyleId); } catch {}
    }, [dalleStyleId]);

    const canSubmit = useMemo(() => {
        if (isBusy) return false;
        if (!prompt.trim()) return false;
        if (mode === 'edit' && !currentImage) return false;
        return true;
    }, [isBusy, prompt, mode, currentImage]);

    // ── 파일 업로드 핸들러 (base/reference) ──
    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleUploadBase = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = await fileToDataUrl(file);
        setCurrentImage(url);
        e.target.value = '';
    };

    const handleAddReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (referenceImages.length >= 5) {
            setErrorMessage('레퍼런스는 최대 5개입니다');
            return;
        }
        const url = await fileToDataUrl(file);
        setReferenceImages(prev => [...prev, url]);
        e.target.value = '';
    };

    const removeReference = (idx: number) => {
        setReferenceImages(prev => prev.filter((_, i) => i !== idx));
    };

    // ── 생성/편집 실행 ──
    const handleSubmit = async () => {
        if (!canSubmit) return;
        setIsBusy(true);
        setErrorMessage(null);
        setStatusMessage(`${engineDisplayName(engine)} ${mode === 'create' ? '생성' : '편집'} 중...`);
        try {
            const seedNum = seed.trim() ? parseInt(seed, 10) : undefined;
            const result = mode === 'create'
                ? await studioGenerate(engine, {
                    prompt: prompt.trim(),
                    ratio,
                    openaiQuality,
                    dalleAssetType: assetType,
                    dalleStyleId,
                    seed: Number.isFinite(seedNum) ? seedNum : undefined,
                    sourceLabel: 'studio',
                })
                : await studioEdit(engine, {
                    prompt: prompt.trim(),
                    ratio,
                    openaiQuality,
                    dalleAssetType: assetType,
                    seed: Number.isFinite(seedNum) ? seedNum : undefined,
                    sourceLabel: 'studio',
                    baseImage: currentImage!,
                    references: referenceImages,
                });

            const item: HistoryItem = {
                id: window.crypto.randomUUID(),
                imageUrl: result.imageUrl,
                engine,
                mode,
                prompt: prompt.trim(),
                createdAt: new Date().toISOString(),
            };
            setHistory(prev => [item, ...prev].slice(0, 30));
            setCurrentImage(result.imageUrl);
            const cost = result.metadata.estimatedCostUsd
                ? ` ($${result.metadata.estimatedCostUsd.toFixed(3)})`
                : '';
            setStatusMessage(`${mode === 'create' ? '생성' : '편집'} 완료${cost}`);
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (err: any) {
            const msg = String(err?.message ?? err ?? 'Unknown');
            setErrorMessage(msg.slice(0, 200));
            setStatusMessage(null);
        } finally {
            setIsBusy(false);
        }
    };

    // ── 카탈로그 저장 ──
    const handleSaveToCatalog = async () => {
        if (!currentImage) {
            setErrorMessage('저장할 이미지가 없습니다');
            return;
        }
        const safeName = (assetName.trim() || `${assetType}_${Date.now()}`)
            .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ-]/g, '_');
        const base64 = currentImage.startsWith('data:')
            ? currentImage.split(',')[1]
            : currentImage;
        if (!base64) {
            setErrorMessage('이미지 base64 추출 실패');
            return;
        }
        try {
            const assetId = await saveAsset(assetType, `${safeName}.png`, base64, {
                name: safeName,
                tags: { character: null, artStyle: null, location: null, description: prompt.trim() || null },
                prompt: prompt.trim() || null,
            });
            setStatusMessage(`카탈로그에 저장됨 (ID: ${assetId.slice(0, 8)})`);
            // 메인 앱에 알림 → 카탈로그 갱신
            emit('image-studio-asset-saved', { assetId }).catch(() => {});
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (err: any) {
            setErrorMessage(`저장 실패: ${String(err?.message ?? err).slice(0, 150)}`);
        }
    };

    // ── 컷에 적용 ──
    const handleApplyToCut = async () => {
        if (!currentImage || !initContext?.sourceCutNumber) return;
        try {
            await emit('image-studio-apply-to-cut', {
                cutNumber: initContext.sourceCutNumber,
                imageUrl: currentImage,
                prompt: prompt.trim(),
            });
            setStatusMessage(`컷 ${initContext.sourceCutNumber}에 적용됨`);
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (err: any) {
            setErrorMessage(`적용 실패: ${String(err?.message ?? err).slice(0, 100)}`);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
            {/* ── 헤더 ── */}
            <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex items-center gap-3">
                    <h1 className="text-lg font-bold text-orange-400">🎨 이미지 스튜디오</h1>
                    {initContext?.sourceCutNumber && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-700/40">
                            컷 #{initContext.sourceCutNumber}에서 진입
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                    {statusMessage && <span className="text-emerald-400">{statusMessage}</span>}
                    {errorMessage && (
                        <span className="text-rose-400 max-w-md truncate" title={errorMessage}>
                            ⚠ {errorMessage}
                        </span>
                    )}
                </div>
            </header>

            {/* ── 메인 3열 레이아웃 ── */}
            <div className="flex-1 grid grid-cols-[260px_1fr_280px] gap-0 overflow-hidden">

                {/* ── 좌: 모드 + 엔진 + 옵션 ── */}
                <aside className="bg-zinc-900/30 border-r border-zinc-800 p-3 overflow-y-auto space-y-3">
                    {/* Mode */}
                    <section>
                        <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">Mode</h3>
                        <div className="grid grid-cols-2 gap-1.5">
                            {(['create', 'edit'] as const).map(m => (
                                <button key={m} onClick={() => setMode(m)} disabled={isBusy}
                                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                        mode === m
                                            ? 'border-orange-500/60 text-orange-400'
                                            : 'border-zinc-700/50 text-zinc-500 hover:border-zinc-600'
                                    } ${isBusy ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                    {m === 'create' ? '✨ 생성' : '✂️ 편집'}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Engine */}
                    <section>
                        <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">Engine</h3>
                        <div className="grid grid-cols-2 gap-1.5">
                            {ENGINES.map(e => {
                                const disabled = mode === 'edit' && !engineSupportsEdit(e.value);
                                return (
                                    <button key={e.value}
                                        onClick={() => setEngine(e.value)}
                                        disabled={isBusy || disabled}
                                        title={disabled ? '편집 모드 미지원' : ''}
                                        className={`py-1.5 text-[11px] font-bold rounded-lg border transition-all ${
                                            engine === e.value ? e.color : 'border-zinc-700/50 text-zinc-500 hover:border-zinc-600'
                                        } ${(isBusy || disabled) ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                        {e.label}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Asset Type (DALL-E 3 / 카탈로그 저장 시 의미) */}
                    <section>
                        <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">에셋 타입</h3>
                        <div className="grid grid-cols-2 gap-1">
                            {ASSET_TYPES.map(a => (
                                <button key={a.value} onClick={() => setAssetType(a.value)} disabled={isBusy}
                                    className={`py-1 text-[11px] rounded border transition-all ${
                                        assetType === a.value
                                            ? 'border-orange-500/50 text-orange-300'
                                            : 'border-zinc-700/50 text-zinc-500 hover:border-zinc-600'
                                    } ${isBusy ? 'opacity-40' : ''}`}>
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Ratio */}
                    <section>
                        <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">비율</h3>
                        <div className="grid grid-cols-3 gap-1">
                            {RATIOS.map(r => (
                                <button key={r.value} onClick={() => setRatio(r.value)} disabled={isBusy}
                                    className={`py-1 text-[11px] rounded border ${
                                        ratio === r.value ? 'border-orange-500/50 text-orange-300' : 'border-zinc-700/50 text-zinc-500'
                                    } ${isBusy ? 'opacity-40' : ''}`}>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* OpenAI Quality */}
                    {(engine === 'openai-gpt2') && (
                        <section>
                            <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">Quality</h3>
                            <div className="grid grid-cols-3 gap-1">
                                {QUALITIES.map(q => (
                                    <button key={q.value} onClick={() => setOpenaiQuality(q.value)} disabled={isBusy}
                                        className={`py-1 text-[11px] rounded border ${
                                            openaiQuality === q.value ? 'border-violet-500/60 text-violet-300' : 'border-zinc-700/50 text-zinc-500'
                                        } ${isBusy ? 'opacity-40' : ''}`}>
                                        {q.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] text-zinc-600 mt-1">Low~$0.005·Med~$0.05·High~$0.21</p>
                        </section>
                    )}

                    {/* DALL-E 3 화풍 picker */}
                    {(engine === 'openai-dalle3') && (
                        <section>
                            <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">화풍</h3>
                            <div className="flex gap-1">
                                <select
                                    value={dalleStyleId}
                                    onChange={e => setDalleStyleId(e.target.value)}
                                    disabled={isBusy || dalleStyles.length === 0}
                                    className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-amber-500 disabled:opacity-40">
                                    {dalleStyles.length === 0 && <option value="">로딩 중...</option>}
                                    {dalleStyles.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.label}{s.isBuiltin ? ' 🔒' : ''}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => setIsStyleManagerOpen(true)}
                                    disabled={isBusy}
                                    title="화풍 추가/관리"
                                    className="px-2 py-1 text-xs font-bold rounded bg-zinc-800 hover:bg-amber-900/40 border border-zinc-700 hover:border-amber-600 text-amber-300 disabled:opacity-40"
                                >＋</button>
                            </div>
                            <p className="text-[9px] text-zinc-600 mt-1 line-clamp-2 break-all">
                                {dalleStyles.find(s => s.id === dalleStyleId)?.styleBlock?.slice(0, 80) || ''}…
                            </p>
                        </section>
                    )}

                    {/* Seed (Gemini/Flux) */}
                    {(engine === 'gemini' || engine === 'flux') && (
                        <section>
                            <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">Seed (옵션)</h3>
                            <input type="number" value={seed} onChange={e => setSeed(e.target.value)} disabled={isBusy}
                                placeholder="비워두면 랜덤"
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-orange-500" />
                        </section>
                    )}
                </aside>

                {/* ── 중: 캔버스 + 프롬프트 ── */}
                <main className="flex flex-col bg-zinc-950 overflow-hidden">
                    <div className="flex-1 flex items-center justify-center p-4 relative overflow-auto">
                        {currentImage ? (
                            <img src={currentImage} alt="현재 이미지" className="max-w-full max-h-full rounded-lg shadow-2xl" loading="lazy" />
                        ) : (
                            <div className="text-center text-zinc-600">
                                <p className="text-base mb-3">{mode === 'create' ? '아래에 프롬프트를 입력하고 생성하세요' : '편집할 이미지를 업로드하거나 컷에서 진입해주세요'}</p>
                                {mode === 'edit' && (
                                    <button onClick={() => fileInputRef.current?.click()}
                                        className="px-3 py-1.5 text-xs rounded bg-orange-700/40 hover:bg-orange-700/60 text-orange-200 border border-orange-700/40">
                                        📁 이미지 업로드
                                    </button>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadBase} className="hidden" />
                            </div>
                        )}
                        {isBusy && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                                <div className="text-orange-400 text-sm font-mono">처리 중...</div>
                            </div>
                        )}
                    </div>

                    {/* 프롬프트 입력 + 액션 */}
                    <div className="p-3 border-t border-zinc-800 bg-zinc-900/30 space-y-2">
                        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} disabled={isBusy}
                            placeholder={mode === 'create'
                                ? '예: 단발머리에 빨간 후드티 입은 20대 여성, 카페에서 노트북 보는 모습'
                                : '예: 표정을 슬픈 표정으로 변경, 배경을 노을로'}
                            rows={3}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500 resize-none" />
                        <div className="flex items-center gap-2">
                            <button onClick={handleSubmit} disabled={!canSubmit}
                                className="flex-1 py-2 text-sm font-bold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                {isBusy ? '처리 중...' : (mode === 'create' ? `✨ ${engineDisplayName(engine)}로 생성` : `✂️ ${engineDisplayName(engine)}로 편집`)}
                            </button>
                            {currentImage && (
                                <>
                                    <input type="text" value={assetName} onChange={e => setAssetName(e.target.value)}
                                        placeholder="에셋 이름 (옵션)"
                                        className="w-40 bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" />
                                    <button onClick={handleSaveToCatalog} disabled={isBusy}
                                        className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-700/50 hover:bg-emerald-700/70 text-emerald-100 transition-colors disabled:opacity-40"
                                        title="카탈로그에 저장">
                                        💾 카탈로그
                                    </button>
                                    {initContext?.sourceCutNumber && (
                                        <button onClick={handleApplyToCut} disabled={isBusy}
                                            className="px-3 py-2 text-xs font-bold rounded-lg bg-cyan-700/50 hover:bg-cyan-700/70 text-cyan-100 transition-colors disabled:opacity-40"
                                            title={`컷 ${initContext.sourceCutNumber}에 이 이미지 추가`}>
                                            📌 컷 #{initContext.sourceCutNumber}에 적용
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </main>

                {/* ── 우: 레퍼런스 + 히스토리 ── */}
                <aside className="bg-zinc-900/30 border-l border-zinc-800 p-3 overflow-y-auto space-y-3">
                    {/* References (편집 모드) */}
                    {mode === 'edit' && (
                        <section>
                            <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">레퍼런스 ({referenceImages.length}/5)</h3>
                            <div className="grid grid-cols-2 gap-1.5">
                                {referenceImages.map((url, idx) => (
                                    <div key={idx} className="relative aspect-square rounded overflow-hidden bg-zinc-800 group/ref">
                                        <img src={url} alt={`ref ${idx}`} className="w-full h-full object-cover" loading="lazy" />
                                        <button onClick={() => removeReference(idx)}
                                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-rose-700 text-white text-xs opacity-0 group-hover/ref:opacity-100 transition-opacity">
                                            ✕
                                        </button>
                                        <span className="absolute bottom-0.5 left-0.5 text-[8px] font-bold bg-black/60 text-white px-1 rounded">{idx + 1}</span>
                                    </div>
                                ))}
                                {referenceImages.length < 5 && (
                                    <label className="aspect-square rounded border-2 border-dashed border-zinc-700 hover:border-zinc-500 flex items-center justify-center cursor-pointer text-zinc-600 hover:text-zinc-400 text-2xl">
                                        +
                                        <input type="file" accept="image/*" onChange={handleAddReference} className="hidden" />
                                    </label>
                                )}
                            </div>
                            <p className="text-[9px] text-zinc-600 mt-1.5">이미지 + 텍스트 → 결과. 캐릭터 시트, 스타일 참조 등.</p>
                        </section>
                    )}

                    {/* 베이스 교체 (편집 모드) */}
                    {mode === 'edit' && currentImage && (
                        <section>
                            <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">베이스 이미지</h3>
                            <button onClick={() => fileInputRef.current?.click()}
                                className="w-full py-1.5 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700">
                                🔄 다른 이미지로 교체
                            </button>
                        </section>
                    )}

                    {/* History */}
                    <section>
                        <h3 className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em] mb-1.5">히스토리 ({history.length})</h3>
                        {history.length === 0 ? (
                            <p className="text-[10px] text-zinc-600 italic">아직 생성한 이미지가 없습니다</p>
                        ) : (
                            <div className="space-y-1.5">
                                {history.map(item => (
                                    <button key={item.id} onClick={() => setCurrentImage(item.imageUrl)}
                                        className="w-full flex gap-2 p-1 rounded bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-left">
                                        <img src={item.imageUrl} alt="" className="w-12 h-12 object-cover rounded flex-shrink-0" loading="lazy" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-semibold text-zinc-300 truncate">
                                                {engineDisplayName(item.engine)} · {item.mode === 'create' ? '생성' : '편집'}
                                            </p>
                                            <p className="text-[9px] text-zinc-500 truncate">{item.prompt}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                </aside>
            </div>

            {/* OpenAI 화풍 추가/관리 모달 */}
            <OpenAIStyleManagerModal
                isOpen={isStyleManagerOpen}
                onClose={() => { setIsStyleManagerOpen(false); reloadStyles(); }}
                onChanged={(changedId) => {
                    reloadStyles();
                    if (changedId) setDalleStyleId(changedId);
                }}
            />
        </div>
    );
};
