/**
 * DalleGeneratorModal — DALL-E 3 원본 이미지 생성기 (OpenAI only, Claude 미사용)
 *
 * 플로우:
 *  1. 사용자가 "요청" 입력 → [프롬프트 생성/수정] 클릭
 *     → OpenAI Chat (gpt-4o) 호출 → DALL-E 프롬프트 textarea 채움
 *     (이미지는 만들지 않음)
 *  2. textarea 내용 직접 편집 가능
 *  3. [이미지 생성 (DALL-E)] 클릭 → DALL-E 3 호출 → 이미지 프리뷰
 *     같은 프롬프트로 여러 번 누를 수 있음 (variant 생성)
 *  4. 필요 시 "요청"에 수정 지시 → 다시 [프롬프트 생성/수정] → [이미지 생성]
 *  5. 에셋 이름 확정 → 저장
 *
 * 진입: 사이드바 "원본 생성" 버튼 + 에셋 카탈로그 헤더 "+ 새 에셋"
 */

import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { XIcon, SparklesIcon, SpinnerIcon, RefreshIcon } from './icons';
import {
    generateImageWithDalle, generateDallePromptViaOpenAI, suggestAssetNameViaOpenAI,
    DalleError,
    type DalleAssetType, type DalleGenerateResult,
} from '../services/openaiService';
import { saveAsset, IS_TAURI } from '../services/tauriAdapter';
import type { ImageRatio } from '../types';

interface DalleGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialAssetType?: DalleAssetType;
    onAssetSaved?: (assetId: string) => void;
    onOpenApiKeySettings?: () => void;
}

const TYPE_LABELS: Record<DalleAssetType, string> = {
    character: '캐릭터',
    background: '배경',
    outfit: '의상',
    prop: '소품',
};

const REQUEST_HINTS: Record<DalleAssetType, string> = {
    character: '예: "20대 여대생이 한강에서 조깅 중, 밝게 웃는"',
    background: '예: "오후 햇빛 드는 작은 카페 인테리어, 따뜻한 색감"',
    outfit: '예: "네이비 체크 정장, 흰 셔츠"',
    prop: '예: "빈티지 가죽 노트, 황동 버클"',
};

export const DalleGeneratorModal: React.FC<DalleGeneratorModalProps> = ({
    isOpen, onClose, initialAssetType = 'character', onAssetSaved, onOpenApiKeySettings,
}) => {
    const { state, actions } = useAppContext();
    const requestInputRef = React.useRef<HTMLInputElement>(null);

    // ── 입력 ──
    const [assetType, setAssetType] = useState<DalleAssetType>(initialAssetType);
    const [showAdvanced, setShowAdvanced] = useState(true);
    const [ratio, setRatio] = useState<ImageRatio>('1:1');
    const [style, setStyle] = useState<'vivid' | 'natural'>('vivid');
    const [quality, setQuality] = useState<'standard' | 'hd'>('standard');

    // ── 프롬프트 / 결과 ──
    const [currentPrompt, setCurrentPrompt] = useState<string>('');
    const [result, setResult] = useState<DalleGenerateResult | null>(null);
    const [error, setError] = useState<{ message: string; kind?: string } | null>(null);
    const [request, setRequest] = useState('');

    // ── 상태 플래그 ──
    const [isPromptBusy, setIsPromptBusy] = useState(false);   // OpenAI Chat 호출 중
    const [isGenerating, setIsGenerating] = useState(false);   // DALL-E 호출 중

    // ── 저장 ──
    const [assetName, setAssetName] = useState('');
    const [isNameSuggesting, setIsNameSuggesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // 모달 오픈 시 초기값
    useEffect(() => {
        if (isOpen) {
            setAssetType(initialAssetType);
            setCurrentPrompt('');
            setResult(null);
            setError(null);
            setRequest('');
            setAssetName('');
            setRatio(state.imageRatio || '1:1');
            setStyle('vivid');
            setQuality('standard');
        }
    }, [isOpen, initialAssetType, state.imageRatio]);

    // ═══ 1. 프롬프트 생성/수정 (OpenAI Chat only) ═══
    const handleGenerateOrRefinePrompt = async () => {
        if (!request.trim()) {
            setError({ message: '요청을 입력해주세요. (예: "20대 여대생이 한강에서 조깅")' });
            return;
        }
        setError(null);
        setIsPromptBusy(true);
        try {
            const { prompt } = await generateDallePromptViaOpenAI({
                request,
                assetType,
                currentPrompt,
            });
            setCurrentPrompt(prompt);
            setRequest('');
        } catch (err) {
            handleError(err);
        } finally {
            setIsPromptBusy(false);
        }
    };

    // ═══ 2. 이미지 생성 (DALL-E only) ═══
    const handleGenerateImage = async () => {
        if (!currentPrompt.trim()) {
            setError({ message: '먼저 프롬프트를 생성하거나 직접 입력해주세요.' });
            return;
        }
        setError(null);
        setIsGenerating(true);
        try {
            const dalleRes = await generateImageWithDalle({
                prompt: currentPrompt,
                assetType, ratio, style, quality,
            });
            setResult(dalleRes);
        } catch (err) {
            handleError(err);
        } finally {
            setIsGenerating(false);
        }
    };

    // ═══ 3. 에셋 이름 자동 제안 (OpenAI Chat) ═══
    const handleSuggestName = async () => {
        if (!currentPrompt) return;
        setIsNameSuggesting(true);
        try {
            const name = await suggestAssetNameViaOpenAI(assetType, currentPrompt);
            setAssetName(name);
        } catch (err) {
            console.warn('이름 제안 실패:', err);
        } finally {
            setIsNameSuggesting(false);
        }
    };

    // 결과가 나올 때 이름 자동 제안 (비어있을 때만)
    useEffect(() => {
        if (!isOpen) return;
        if (result && !assetName && currentPrompt) {
            handleSuggestName();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, isOpen]);

    // ═══ 4. 에셋 저장 ═══
    const handleSaveAsset = async () => {
        if (!result || !assetName.trim()) return;
        if (!IS_TAURI) {
            setError({ message: 'Tauri 환경에서만 에셋 저장이 가능합니다.' });
            return;
        }
        setIsSaving(true);
        try {
            const base64 = result.imageUrl.replace(/^data:image\/\w+;base64,/, '');
            const safeName = assetName.trim().replace(/[\\/\\?%*:|"<>]/g, '_');
            const fileName = `${safeName}.png`;
            const assetId = await saveAsset(assetType, fileName, base64, {
                name: safeName,
                tags: {
                    character: null,
                    artStyle: 'dalle-chibi',
                    location: null,
                    description: result.revisedPrompt,
                },
                prompt: currentPrompt,
            });
            actions.addNotification?.(`✨ "${safeName}" 에셋으로 저장되었습니다`, 'success');
            onAssetSaved?.(assetId);
            onClose();
        } catch (err) {
            setError({ message: `저장 실패: ${err instanceof Error ? err.message : String(err)}` });
        } finally {
            setIsSaving(false);
        }
    };

    // ═══ 공통 에러 핸들러 ═══
    const handleError = (err: unknown) => {
        if (err instanceof DalleError) {
            setError({ message: err.message, kind: err.kind });
            if (err.kind === 'content-policy') {
                setTimeout(() => requestInputRef.current?.focus(), 50);
            }
        } else {
            setError({ message: err instanceof Error ? err.message : String(err) });
        }
    };

    const isBusy = isPromptBusy || isGenerating;

    // ⌘+Enter (Mac) / Ctrl+Enter (Win) 단축키 감지 — 각 입력창의 기본 액션 트리거
    const isCmdEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && (e.metaKey || e.ctrlKey);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-zinc-900 rounded-2xl shadow-2xl w-[640px] max-h-[90vh] overflow-y-auto border border-zinc-700">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <h2 className="text-sm font-black text-zinc-100 flex items-center gap-2">
                        <SparklesIcon className="w-4 h-4 text-orange-400" />
                        DALL-E 원본 생성
                        <span className="text-[9px] font-normal text-zinc-500 ml-1">OpenAI only</span>
                    </h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" disabled={isBusy || isSaving}>
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* ── 타입 선택 ── */}
                    <div>
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em] mb-2 block">타입</label>
                        <div className="flex gap-2">
                            {(['character', 'background', 'outfit', 'prop'] as DalleAssetType[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setAssetType(t)}
                                    disabled={isBusy}
                                    className={`flex-1 px-3 py-2 text-[11px] font-bold rounded-lg border transition-all ${
                                        assetType === t
                                            ? 'bg-orange-500/15 border-orange-500/60 text-orange-300'
                                            : 'bg-[#0a0a0c] border-[#2a2a2e] text-zinc-400 hover:border-zinc-600'
                                    }`}
                                >
                                    {TYPE_LABELS[t]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── 요청 입력 (OpenAI Chat으로 프롬프트 생성/수정) ── */}
                    <div>
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em] mb-2 block">
                            요청 — GPT가 아래 프롬프트를 생성/수정 (이미지 생성은 따로)
                        </label>
                        <div className="flex gap-2">
                            <input
                                ref={requestInputRef}
                                type="text"
                                value={request}
                                onChange={(e) => setRequest(e.target.value)}
                                onKeyDown={(e) => { if (isCmdEnter(e) && !isBusy && request.trim()) { e.preventDefault(); handleGenerateOrRefinePrompt(); } }}
                                placeholder={currentPrompt ? '예: "머리를 더 짧게, 안경 추가"' : REQUEST_HINTS[assetType]}
                                disabled={isBusy}
                                className="flex-1 px-3 py-2 bg-[#0a0a0c] border border-[#2a2a2e] rounded-lg text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
                            />
                            <button
                                onClick={handleGenerateOrRefinePrompt}
                                disabled={isBusy || !request.trim()}
                                className="px-4 py-2 text-[11px] font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                {isPromptBusy
                                    ? <><SpinnerIcon className="w-3.5 h-3.5 inline" /> GPT 생성 중…</>
                                    : currentPrompt ? '프롬프트 수정' : '프롬프트 생성'}
                            </button>
                        </div>
                        <p className="text-[9px] text-zinc-600 mt-1">
                            {currentPrompt
                                ? '현재 프롬프트를 기반으로 수정됩니다. ⌘+Enter로 제출.'
                                : '한국어 OK. ⌘+Enter로 제출.'}
                        </p>
                    </div>

                    {/* ── 고급 설정 ── */}
                    <div>
                        <button
                            onClick={() => setShowAdvanced(v => !v)}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold"
                        >
                            ▸ 고급 설정 {showAdvanced ? '닫기' : '열기'}
                        </button>
                        {showAdvanced && (
                            <div className="mt-3 p-3 bg-[#0a0a0c] rounded-lg border border-[#2a2a2e] space-y-3">
                                <div>
                                    <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-1">비율</label>
                                    <div className="flex gap-1">
                                        {(['1:1', '16:9', '9:16'] as ImageRatio[]).map(r => (
                                            <button
                                                key={r}
                                                onClick={() => setRatio(r)}
                                                disabled={isBusy}
                                                className={`flex-1 px-2 py-1 text-[10px] rounded border ${
                                                    ratio === r
                                                        ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                                                        : 'bg-transparent border-[#2a2a2e] text-zinc-500'
                                                }`}
                                            >
                                                {r}
                                                {assetType !== 'background' && r !== '1:1' && <span className="ml-1 opacity-40">·무시</span>}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[9px] text-zinc-600 mt-1">캐릭터/의상/소품은 1:1 고정 (레퍼런스용)</p>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-1">스타일 (DALL-E)</label>
                                    <div className="flex gap-1">
                                        {(['vivid', 'natural'] as const).map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setStyle(s)}
                                                disabled={isBusy}
                                                className={`flex-1 px-2 py-1 text-[10px] rounded border ${
                                                    style === s
                                                        ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                                                        : 'bg-transparent border-[#2a2a2e] text-zinc-500'
                                                }`}
                                            >
                                                {s === 'vivid' ? 'Vivid (화려)' : 'Natural (자연)'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-1">품질 (DALL-E)</label>
                                    <div className="flex gap-1">
                                        {([
                                            { key: 'standard' as const, label: 'Standard', hint: '소프트 · $0.04' },
                                            { key: 'hd' as const,       label: 'HD',       hint: '샤프 · $0.08' },
                                        ]).map(q => (
                                            <button
                                                key={q.key}
                                                onClick={() => setQuality(q.key)}
                                                disabled={isBusy}
                                                className={`flex-1 px-2 py-1 text-[10px] rounded border flex flex-col items-center ${
                                                    quality === q.key
                                                        ? 'bg-orange-500/15 border-orange-500/50 text-orange-300'
                                                        : 'bg-transparent border-[#2a2a2e] text-zinc-500'
                                                }`}
                                            >
                                                <span className="font-semibold">{q.label}</span>
                                                <span className="text-[8px] opacity-60">{q.hint}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── 에러 ── */}
                    {error && (
                        <div className={`p-3 rounded-lg border text-[11px] flex items-start gap-2 ${
                            error.kind === 'content-policy'
                                ? 'bg-amber-950/30 border-amber-700/40 text-amber-200'
                                : 'bg-red-950/30 border-red-700/40 text-red-200'
                        }`}>
                            <span className="font-black">⚠️</span>
                            <div className="flex-1">
                                <div>{error.message}</div>
                                {error.kind === 'missing-key' && onOpenApiKeySettings && (
                                    <div className="mt-2">
                                        <button
                                            onClick={onOpenApiKeySettings}
                                            className="px-2 py-1 text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 rounded"
                                        >
                                            API 키 설정 열기
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── 결과 영역 ── */}
                    <div className="pt-4 border-t border-zinc-800 space-y-3">
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-[240px]">
                                {result ? (
                                    <>
                                        <img src={result.imageUrl} alt="DALL-E 결과" className="w-full rounded-lg border border-zinc-700" />
                                        <p className="text-[9px] text-zinc-600 mt-1 text-center">{result.size} · {result.quality} · {result.style}</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-full aspect-square rounded-lg border border-dashed border-[#2a2a2e] bg-[#0a0a0c] flex items-center justify-center">
                                            {isGenerating ? (
                                                <div className="flex flex-col items-center gap-2 text-zinc-600">
                                                    <SpinnerIcon className="w-6 h-6" />
                                                    <span className="text-[10px]">DALL-E 이미지 생성 중</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-zinc-700">
                                                    <SparklesIcon className="w-8 h-8" />
                                                    <span className="text-[10px]">이미지 생성 전</span>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[9px] text-zinc-700 mt-1 text-center">1024×1024 · {quality} · {style}</p>
                                    </>
                                )}
                            </div>
                            <div className="flex-1 space-y-2">
                                <div>
                                    <label className="text-[9px] font-bold text-zinc-500 uppercase">DALL-E 프롬프트 (편집 가능)</label>
                                    <textarea
                                        value={currentPrompt}
                                        onChange={(e) => setCurrentPrompt(e.target.value)}
                                        onKeyDown={(e) => { if (isCmdEnter(e) && !isBusy && currentPrompt.trim()) { e.preventDefault(); handleGenerateImage(); } }}
                                        placeholder="위 '요청' 입력 후 [프롬프트 생성]을 누르거나, 여기에 직접 프롬프트를 입력하세요. ⌘+Enter로 이미지 생성."
                                        disabled={isBusy}
                                        rows={7}
                                        spellCheck={false}
                                        className="mt-1 w-full p-2 bg-[#0a0a0c] rounded border border-[#2a2a2e] text-[10px] text-zinc-300 resize-y focus:outline-none focus:border-orange-500/50 font-mono leading-relaxed disabled:opacity-50"
                                    />
                                </div>
                                <button
                                    onClick={handleGenerateImage}
                                    disabled={isBusy || !currentPrompt.trim()}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-lg shadow-sky-600/15 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                                >
                                    {isGenerating
                                        ? <><SpinnerIcon className="w-3.5 h-3.5" /> DALL-E로 이미지 생성 중... (10~20초)</>
                                        : <><RefreshIcon className="w-3.5 h-3.5" /> 이미지 생성 (DALL-E)</>}
                                </button>
                                {result?.revisedPrompt && result.revisedPrompt !== currentPrompt && (
                                    <details className="text-[9px] text-zinc-600">
                                        <summary className="cursor-pointer hover:text-zinc-400">▸ DALL-E가 내부에서 재작성한 버전 (참고)</summary>
                                        <div className="mt-1 p-2 bg-[#0a0a0c] rounded border border-[#2a2a2e] text-[10px] text-zinc-500 max-h-[100px] overflow-y-auto">
                                            {result.revisedPrompt}
                                        </div>
                                    </details>
                                )}
                            </div>
                        </div>

                        {/* ── 저장 ── */}
                        <div className="pt-3 border-t border-zinc-800">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em] mb-1 block">
                                에셋 이름
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={assetName}
                                    onChange={(e) => setAssetName(e.target.value)}
                                    onKeyDown={(e) => { if (isCmdEnter(e) && !isBusy && !isSaving && result && assetName.trim() && IS_TAURI) { e.preventDefault(); handleSaveAsset(); } }}
                                    placeholder={isNameSuggesting ? '이름 제안 중...' : `예: ${TYPE_LABELS[assetType]} 시안 A (⌘+Enter로 저장)`}
                                    disabled={isBusy || isSaving || !result}
                                    className="flex-1 px-3 py-2 bg-[#0a0a0c] border border-[#2a2a2e] rounded-lg text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 disabled:opacity-50"
                                />
                                <button
                                    onClick={handleSuggestName}
                                    disabled={isBusy || isSaving || isNameSuggesting || !currentPrompt || !result}
                                    className="px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 border border-[#2a2a2e] rounded disabled:opacity-30"
                                    title="GPT로 이름 다시 제안"
                                >
                                    {isNameSuggesting ? <SpinnerIcon className="w-3 h-3" /> : '🎲'}
                                </button>
                            </div>
                            <button
                                onClick={handleSaveAsset}
                                disabled={isBusy || isSaving || !assetName.trim() || !IS_TAURI || !result}
                                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                            >
                                {isSaving ? <><SpinnerIcon className="w-4 h-4" /> 저장 중...</>
                                    : `"${TYPE_LABELS[assetType]}" 에셋으로 저장`}
                            </button>
                            {!IS_TAURI && (
                                <p className="text-[9px] text-zinc-600 mt-1 text-center">Tauri 데스크톱에서만 저장 가능합니다.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
