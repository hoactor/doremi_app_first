/**
 * DalleGeneratorModal — DALL-E 3 원본 이미지 생성기
 *
 * 플로우: 사용자 입력(한국어) → Claude enhance → DALL-E 3 호출 → 프리뷰
 *         → (선택) 추가 요청으로 refine → 에셋 카탈로그 저장
 *
 * 진입: 사이드바 "원본 생성" 버튼 + 에셋 카탈로그 헤더 "+ 새 에셋"
 */

import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { XIcon, SparklesIcon, SpinnerIcon, RefreshIcon } from './icons';
import { generateImageWithDalle, DalleError, type DalleAssetType, type DalleGenerateResult } from '../services/openaiService';
import { enhancePromptForDalle, suggestAssetName } from '../services/ai/dallePromptEnhance';
import { saveAsset, IS_TAURI } from '../services/tauriAdapter';
import type { ArtStyle, ImageRatio } from '../types';

interface DalleGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialAssetType?: DalleAssetType;
    onAssetSaved?: (assetId: string) => void;
    /** missing-key 에러 시 API 키 설정 모달 여는 콜백 */
    onOpenApiKeySettings?: () => void;
}

const TYPE_LABELS: Record<DalleAssetType, string> = {
    character: '캐릭터',
    background: '배경',
    outfit: '의상',
    prop: '소품',
};

const TYPE_HINTS: Record<DalleAssetType, string> = {
    character: '예: "20대 여성, 긴 갈색 웨이브 머리, 카페에서 커피 마시며 웃고 있는"\n상황(공원/카페/거리 등)까지 넣으면 더 자연스럽게 나옵니다. 기본 분위기는 밝고 웃는 톤.',
    background: '예: "오후 햇빛이 드는 작은 카페 인테리어, 원목 테이블, 따뜻한 색감"',
    outfit: '예: "네이비 체크 정장, 흰 셔츠, 무늬 없는 타이"',
    prop: '예: "빈티지 가죽 노트, 황동 버클, 갈색 낡은 표지"',
};

export const DalleGeneratorModal: React.FC<DalleGeneratorModalProps> = ({
    isOpen, onClose, initialAssetType = 'character', onAssetSaved, onOpenApiKeySettings,
}) => {
    const modificationInputRef = React.useRef<HTMLInputElement>(null);
    const { state, actions } = useAppContext();

    // ── 사용자 입력 ──
    const [assetType, setAssetType] = useState<DalleAssetType>(initialAssetType);
    const [userInput, setUserInput] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [ratio, setRatio] = useState<ImageRatio>('1:1');
    const [style, setStyle] = useState<'vivid' | 'natural'>('vivid');
    const [overrideArtStyle, setOverrideArtStyle] = useState<ArtStyle | ''>('');

    // ── 생성 상태 ──
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState<string>('');   // Claude 생성 프롬프트
    const [result, setResult] = useState<DalleGenerateResult | null>(null);
    const [error, setError] = useState<{ message: string; kind?: string } | null>(null);

    // ── refine ──
    const [modification, setModification] = useState('');

    // ── 저장 상태 ──
    const [assetName, setAssetName] = useState('');
    const [isNameSuggesting, setIsNameSuggesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // 모달 열릴 때 초기값 세팅
    useEffect(() => {
        if (isOpen) {
            setAssetType(initialAssetType);
            setUserInput('');
            setCurrentPrompt('');
            setResult(null);
            setError(null);
            setModification('');
            setAssetName('');
            setRatio(state.imageRatio || '1:1');
            setStyle('vivid');
            setOverrideArtStyle('');
        }
    }, [isOpen, initialAssetType, state.imageRatio]);

    const effectiveArtStyle: ArtStyle = overrideArtStyle || state.artStyle || 'dalle-chibi';

    // ═══ 생성 메인 플로우 ═══
    const runGenerate = async (mode: 'new' | 'refine' | 'regenerate') => {
        setError(null);
        setIsEnhancing(true);

        try {
            let promptToUse = currentPrompt;

            if (mode === 'new') {
                if (!userInput.trim()) {
                    setError({ message: '무엇을 그릴지 설명을 입력해주세요.' });
                    setIsEnhancing(false);
                    return;
                }
                const enhanced = await enhancePromptForDalle({
                    userInput,
                    assetType,
                    artStyle: effectiveArtStyle,
                    customArtStyle: state.customArtStyle,
                });
                promptToUse = enhanced.prompt;
                actions.handleAddUsage?.(enhanced.tokenCount, 'claude');
                setCurrentPrompt(promptToUse);
            } else if (mode === 'refine') {
                if (!modification.trim()) {
                    setError({ message: '어떻게 바꿀지 추가 요청을 입력해주세요.' });
                    setIsEnhancing(false);
                    return;
                }
                if (!currentPrompt) {
                    setError({ message: '먼저 원본을 한 번 생성해주세요.' });
                    setIsEnhancing(false);
                    return;
                }
                const refined = await enhancePromptForDalle({
                    userInput,
                    assetType,
                    artStyle: effectiveArtStyle,
                    customArtStyle: state.customArtStyle,
                    refineFrom: { previousPrompt: currentPrompt, modification },
                });
                promptToUse = refined.prompt;
                actions.handleAddUsage?.(refined.tokenCount, 'claude');
                setCurrentPrompt(promptToUse);
            }
            // mode === 'regenerate': 같은 currentPrompt 그대로 재호출

            setIsEnhancing(false);
            setIsGenerating(true);

            const dalleRes = await generateImageWithDalle({
                prompt: promptToUse,
                assetType,
                ratio,
                style,
                quality: 'hd',
            });
            setResult(dalleRes);

            if (mode === 'refine') setModification('');
        } catch (err) {
            if (err instanceof DalleError) {
                setError({ message: err.message, kind: err.kind });
                // 정책 위반 시 추가 요청 입력창 자동 포커스 (결과가 있을 때만 refine 가능)
                if (err.kind === 'content-policy' && result) {
                    setTimeout(() => modificationInputRef.current?.focus(), 50);
                }
            } else {
                setError({ message: err instanceof Error ? err.message : String(err) });
            }
        } finally {
            setIsEnhancing(false);
            setIsGenerating(false);
        }
    };

    // ═══ 이름 자동 제안 ═══
    const handleSuggestName = async () => {
        if (!currentPrompt) return;
        setIsNameSuggesting(true);
        try {
            const name = await suggestAssetName(assetType, currentPrompt);
            setAssetName(name);
        } catch (err) {
            console.warn('이름 제안 실패:', err);
        } finally {
            setIsNameSuggesting(false);
        }
    };

    // 결과가 나올 때마다 이름 자동 제안 (비어있을 때만)
    useEffect(() => {
        if (!isOpen) return;
        if (result && !assetName && currentPrompt) {
            handleSuggestName();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, isOpen]);

    // ═══ 에셋 저장 ═══
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
                    artStyle: effectiveArtStyle,
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

    const isBusy = isEnhancing || isGenerating;

    // 모든 hook이 안정적으로 호출된 후 early return — 'Rendered more hooks' 오류 방지
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-zinc-900 rounded-2xl shadow-2xl w-[640px] max-h-[90vh] overflow-y-auto border border-zinc-700">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <h2 className="text-sm font-black text-zinc-100 flex items-center gap-2">
                        <SparklesIcon className="w-4 h-4 text-orange-400" />
                        DALL-E 원본 생성
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

                    {/* ── 설명 입력 ── */}
                    <div>
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em] mb-2 block">
                            설명 (한국어 OK)
                        </label>
                        <textarea
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder={TYPE_HINTS[assetType]}
                            rows={3}
                            disabled={isBusy}
                            className="w-full px-3 py-2 bg-[#0a0a0c] border border-[#2a2a2e] rounded-lg text-[12px] text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-orange-500/50"
                        />
                    </div>

                    {/* ── 고급 설정 (접을 수 있음) ── */}
                    <div>
                        <button
                            onClick={() => setShowAdvanced(v => !v)}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold"
                        >
                            ▸ 고급 설정 {showAdvanced ? '닫기' : '열기'}
                        </button>
                        {showAdvanced && (
                            <div className="mt-3 p-3 bg-[#0a0a0c] rounded-lg border border-[#2a2a2e] space-y-3">
                                {/* 비율 (배경만 의미 있음) */}
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
                                {/* 스타일 */}
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
                                {/* 화풍 오버라이드 */}
                                <div>
                                    <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-1">
                                        화풍 (기본: 현재 프로젝트 '{state.artStyle || 'dalle-chibi'}')
                                    </label>
                                    <select
                                        value={overrideArtStyle}
                                        onChange={(e) => setOverrideArtStyle(e.target.value as ArtStyle | '')}
                                        disabled={isBusy}
                                        className="w-full px-2 py-1 text-[10px] bg-transparent border border-[#2a2a2e] rounded text-zinc-300"
                                    >
                                        <option value="">프로젝트 기본 사용</option>
                                        <option value="dalle-chibi">dalle-chibi (프리미엄 치비 · 추천)</option>
                                        <option value="moe">moe (귀요미 치비)</option>
                                        <option value="vibrant">vibrant (도파민)</option>
                                        <option value="kyoto">kyoto (감성)</option>
                                        <option value="normal">normal (정통 웹툰)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── 생성 버튼 ── */}
                    <button
                        onClick={() => runGenerate('new')}
                        disabled={isBusy || !userInput.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-xl shadow-lg shadow-orange-600/15 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                    >
                        {isEnhancing ? <><SpinnerIcon className="w-4 h-4" /> Claude로 프롬프트 다듬는 중...</>
                            : isGenerating ? <><SpinnerIcon className="w-4 h-4" /> DALL-E로 이미지 생성 중... (약 10~20초)</>
                            : <><SparklesIcon className="w-4 h-4" /> 생성</>}
                    </button>

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
                                {error.kind === 'content-policy' && result && (
                                    <div className="text-[10px] text-amber-300/60 mt-1">
                                        아래 "추가 요청"에서 민감한 표현을 순화해 재시도하거나, 설명 자체를 바꿔 새로 생성하세요.
                                    </div>
                                )}
                                {error.kind === 'missing-key' && (
                                    <div className="mt-2">
                                        {onOpenApiKeySettings ? (
                                            <button
                                                onClick={onOpenApiKeySettings}
                                                className="px-2 py-1 text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 rounded"
                                            >
                                                API 키 설정 열기
                                            </button>
                                        ) : (
                                            <div className="text-[10px] text-red-300/60">사이드바의 "API 키" 버튼에서 등록 가능합니다.</div>
                                        )}
                                    </div>
                                )}
                                {error.kind === 'rate-limit' && (
                                    <div className="text-[10px] text-red-300/60 mt-1">
                                        OpenAI 대시보드의 사용량 탭에서 rate limit을 확인할 수 있습니다.
                                    </div>
                                )}
                                {error.kind === 'network' && (
                                    <div className="text-[10px] text-red-300/60 mt-1">
                                        방화벽/프록시/VPN 설정도 함께 확인해주세요.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── 결과 프리뷰 ── */}
                    {result && (
                        <div className="pt-4 border-t border-zinc-800 space-y-3">
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-[240px]">
                                    <img
                                        src={result.imageUrl}
                                        alt="DALL-E 결과"
                                        className="w-full rounded-lg border border-zinc-700"
                                    />
                                    <p className="text-[9px] text-zinc-600 mt-1 text-center">
                                        {result.size} · {result.quality} · {result.style}
                                    </p>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div>
                                        <label className="text-[9px] font-bold text-zinc-500 uppercase">DALL-E가 쓴 프롬프트</label>
                                        <div className="mt-1 p-2 bg-[#0a0a0c] rounded border border-[#2a2a2e] text-[10px] text-zinc-400 max-h-[120px] overflow-y-auto">
                                            {result.revisedPrompt}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => runGenerate('regenerate')}
                                            disabled={isBusy}
                                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-semibold text-zinc-300 bg-[#111114] hover:bg-[#1a1a1e] border border-[#2a2a2e] rounded-md disabled:opacity-40"
                                        >
                                            <RefreshIcon className="w-3 h-3" /> 다시 생성
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ── refine ── */}
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em] mb-1 block">
                                    추가 요청 (수정 사항)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        ref={modificationInputRef}
                                        type="text"
                                        value={modification}
                                        onChange={(e) => setModification(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !isBusy && modification.trim()) runGenerate('refine'); }}
                                        placeholder='예: "머리를 더 짧게, 안경 추가"'
                                        disabled={isBusy}
                                        className="flex-1 px-3 py-2 bg-[#0a0a0c] border border-[#2a2a2e] rounded-lg text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
                                    />
                                    <button
                                        onClick={() => runGenerate('refine')}
                                        disabled={isBusy || !modification.trim()}
                                        className="px-3 py-2 text-[11px] font-bold text-white bg-orange-600/70 hover:bg-orange-500 rounded-lg disabled:opacity-30"
                                    >
                                        수정 반영
                                    </button>
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
                                        placeholder={isNameSuggesting ? '이름 제안 중...' : `예: ${TYPE_LABELS[assetType]} 시안 A`}
                                        disabled={isBusy || isSaving}
                                        className="flex-1 px-3 py-2 bg-[#0a0a0c] border border-[#2a2a2e] rounded-lg text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
                                    />
                                    <button
                                        onClick={handleSuggestName}
                                        disabled={isBusy || isSaving || isNameSuggesting || !currentPrompt}
                                        className="px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 border border-[#2a2a2e] rounded"
                                        title="Claude로 이름 다시 제안"
                                    >
                                        {isNameSuggesting ? <SpinnerIcon className="w-3 h-3" /> : '🎲'}
                                    </button>
                                </div>
                                <button
                                    onClick={handleSaveAsset}
                                    disabled={isBusy || isSaving || !assetName.trim() || !IS_TAURI}
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
                    )}
                </div>
            </div>
        </div>
    );
};
