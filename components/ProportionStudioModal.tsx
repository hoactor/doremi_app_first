
import React, { useState, useMemo } from 'react';
import { CharacterDescription, ArtStyle, ImageEngine } from '../types';
import { buildProportionStylePrompt } from '../appStyleEngine';
import { editImageWithRetry } from '../appImageEngine';
import { adjustPoseWithFlux, getFluxImageSize } from '../services/falService';
import { getFluxStyleKeywords } from '../appFluxPromptEngine';
import { IS_TAURI, saveAsset } from '../services/tauriAdapter';
import { XIcon, SpinnerIcon, CheckIcon, RefreshIcon, BookmarkSquareIcon } from './icons';

// ─── 모델: 3 Pro 고정 (비율 조정은 정밀도 우선) ─────────────────────
const PROPORTION_MODEL = 'gemini-3-pro-image-preview';

// ─── Props ────────────────────────────────────────────────────────────
interface ProportionStudioModalProps {
    isOpen: boolean;
    onClose: () => void;
    characterDescriptions: { [key: string]: CharacterDescription };
    artStyle: ArtStyle;
    customArtStyle: string;
    selectedNanoModel: string;
    onUpdateCharacterDescription: (key: string, data: Partial<CharacterDescription>) => void;
}

// ─── 모든 화풍 동일: 1.5 ~ 9 ─────────────────────────────────────────
function getSliderRange(): { min: number; max: number } {
    return { min: 1.5, max: 9 };
}

function getDefaultRatio(artStyle: ArtStyle): number {
    switch (artStyle) {
        case 'moe':
        case 'dalle-chibi':
            return 2.5;
        case 'normal':
            return 6;
        case 'kyoto':
        case 'vibrant':
            return 7;
        case 'custom':
        default:
            return 5;
    }
}

// ─── 비율별 가이드 ──────────────────────────────────────────────────
function getRatioGuide(ratio: number): string {
    if (ratio <= 2) return '- Super-deformed: head same size as body, very stubby round limbs, mitten hands';
    if (ratio <= 3) return '- Chibi: head is ~1/3 of total height, short round limbs, simplified hands';
    if (ratio <= 4) return '- Semi-chibi: head is ~1/4 of total height, slightly elongated torso';
    if (ratio <= 5) return '- Stylized: head is 1/5 of total height, medium-length limbs';
    if (ratio <= 6) return '- Standard anime: head is 1/6 of total height, proportional limbs';
    if (ratio <= 7) return '- Tall anime/manhwa: head is 1/7, long legs, slender build';
    if (ratio <= 8) return '- Fashion/idol: head is 1/8, very long legs, model proportions';
    return '- Ultra-tall fashion: head is 1/9+, extremely elongated, fashion illustration';
}

function getRatioLabel(ratio: number): string {
    if (ratio <= 2) return 'SD';
    if (ratio <= 3) return '치비';
    if (ratio <= 4) return '세미치비';
    if (ratio <= 5) return '스타일화';
    if (ratio <= 6) return '일반 애니';
    if (ratio <= 7) return '순정/웹툰';
    if (ratio <= 8) return '패션/아이돌';
    return '하이패션';
}

function getProportionStyleHint(artStyle: ArtStyle, ratio: number): string {
    if ((artStyle === 'moe' || artStyle === 'dalle-chibi') && ratio > 4) {
        return 'STYLE NOTE: Keep the chibi ART STYLE (soft colors, thick outlines, cute rendering) but apply realistic body proportions. The drawing style remains chibi; only the body length changes.';
    }
    if ((artStyle === 'kyoto' || artStyle === 'vibrant') && ratio < 5) {
        return 'STYLE NOTE: Keep the detailed cinematic ART STYLE (complex eyes, detailed hair, dramatic lighting) but apply compact chibi body proportions. The rendering quality stays high; only proportions become compact.';
    }
    return '';
}

// ─── 프리셋 ──────────────────────────────────────────────────────────
interface RatioPreset { label: string; value: number; }

function getPresets(artStyle: ArtStyle): RatioPreset[] {
    const { min, max } = getSliderRange();
    const all: RatioPreset[] = [
        { label: 'SD 2등신', value: 2 },
        { label: '치비 3등신', value: 3 },
        { label: '세미 4등신', value: 4 },
        { label: '웹툰 6등신', value: 6 },
        { label: '순정 7등신', value: 7 },
        { label: '리얼 8등신', value: 8 },
        { label: '하이 9등신', value: 9 },
    ];
    return all.filter(p => p.value >= min && p.value <= max);
}

// ─── 캐릭터별 상태 ──────────────────────────────────────────────────
interface CharState {
    ratio: number;
    previewUrl: string | null;
    isGenerating: boolean;
    markedForReplace: boolean;
    error: string | null;
    savedToAsset: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ProportionStudioModal: React.FC<ProportionStudioModalProps> = ({
    isOpen, onClose, characterDescriptions, artStyle, customArtStyle, selectedNanoModel,
    onUpdateCharacterDescription,
}) => {
    const charEntries = useMemo(() =>
        Object.entries(characterDescriptions).filter(([, c]) => c.sourceImageUrl),
        [characterDescriptions]
    );

    const defaultRatio = getDefaultRatio(artStyle);
    const { min: sliderMin, max: sliderMax } = getSliderRange();
    const presets = getPresets(artStyle);

    const [proportionEngine, setProportionEngine] = useState<'gemini' | 'flux'>('gemini');

    const [charStates, setCharStates] = useState<{ [key: string]: CharState }>(() => {
        const init: { [key: string]: CharState } = {};
        charEntries.forEach(([key]) => {
            init[key] = { ratio: defaultRatio, previewUrl: null, isGenerating: false, markedForReplace: false, error: null, savedToAsset: false };
        });
        return init;
    });

    if (!isOpen) return null;

    const getCurrentRef = (char: CharacterDescription): string | null => {
        return char.mannequinImageUrl
            || char.upscaledImageUrl
            || (char.characterSheetHistory && char.characterSheetHistory[char.characterSheetHistory.length - 1])
            || char.sourceImageUrl
            || null;
    };

    const updateChar = (key: string, patch: Partial<CharState>) => {
        setCharStates(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    };

    // ─── 재생성 ──────────────────────────────────────────────────────
    const handleRegenerate = async (key: string) => {
        const char = characterDescriptions[key];
        const refUrl = getCurrentRef(char);
        if (!refUrl) return;

        const st = charStates[key];
        updateChar(key, { isGenerating: true, error: null });

        const artPrompt = buildProportionStylePrompt(artStyle, customArtStyle);
        const ratioGuide = getRatioGuide(st.ratio);
        const styleHint = getProportionStyleHint(artStyle, st.ratio);

        const prompt = `[PROPORTION ADJUSTMENT — STRICT IDENTITY LOCK]

ABSOLUTE RULES (VIOLATING ANY = FAILURE):
1. FACE: Copy EXACTLY from reference — same eyes, nose, mouth, face shape, skin tone. Zero deviation.
2. HAIR: Copy EXACTLY — same style, color, length, bangs, parting. Do not redesign.
3. OUTFIT: Copy EXACTLY — same clothing design, colors, patterns, accessories. Do not change.
4. ART STYLE: Maintain IDENTICAL drawing technique — same line weight, coloring method, shading style.

SINGLE CHANGE ALLOWED:
- Adjust body length so that: total character height = head height × ${st.ratio}
- Head-to-body ratio: 1:${st.ratio} (${st.ratio}등신)
${ratioGuide}

COMPOSITION:
- Full-body standing pose, natural relaxed stance, slight 3/4 angle
- Both feet visible, touching the ground
- KEEP the original background style and atmosphere from the reference image
- Single character, vertically centered in frame

${styleHint}

${artPrompt}`;

        try {
            if (proportionEngine === 'flux') {
                // ★ Flux 경로: flux-2-pro + reference_image 얼굴 보존
                const fluxStyleKeywords = getFluxStyleKeywords(artStyle, customArtStyle);
                const hairDesc = char.hairStyleDescription || '';
                const faceDesc = char.facialFeatures || '';
                const outfitDesc = char.baseAppearance || '';
                const gender = char.gender === 'male' ? 'boy' : 'girl';
                const fluxPrompt = [
                    `anime chibi ${gender}`,
                    hairDesc,
                    faceDesc,
                    outfitDesc ? `wearing ${outfitDesc}` : '',
                    `${st.ratio}-head-tall body proportion`,
                    'full body standing pose, natural relaxed stance',
                    'both feet visible on ground, vertically centered',
                    fluxStyleKeywords,
                ].filter(Boolean).join(', ');
                const imageSize = getFluxImageSize('9:16');
                const result = await adjustPoseWithFlux(refUrl, fluxPrompt, {
                    referenceImageUrls: [refUrl],
                    strength: 0.55,           // 원본 더 보존
                    imageSize,
                });
                updateChar(key, { previewUrl: result.imageUrl, isGenerating: false });
            } else {
                // 기존 Gemini 경로 (수정 없음)
                const result = await editImageWithRetry(
                    refUrl,
                    prompt,
                    '',           // originalPrompt
                    artPrompt,    // artStylePrompt
                    PROPORTION_MODEL,
                    '9:16',       // 세로 (전신 표현 적합)
                    undefined,    // referenceImageUrls
                    undefined,    // maskBase64
                    undefined,    // masterStyleImageUrl
                    true,         // isCreativeGeneration
                );
                updateChar(key, { previewUrl: result.imageUrl, isGenerating: false });
            }
        } catch (err: any) {
            updateChar(key, { isGenerating: false, error: err.message || '생성 실패' });
        }
    };

    const toggleReplace = (key: string) => {
        const st = charStates[key];
        if (!st.previewUrl) return;
        updateChar(key, { markedForReplace: !st.markedForReplace });
    };

    const handleApplyAll = () => {
        Object.entries(charStates).forEach(([key, st]) => {
            if (st.markedForReplace && st.previewUrl) {
                const char = characterDescriptions[key];
                const history = [...(char.characterSheetHistory || []), st.previewUrl];
                // ★ mannequinImageUrl/mannequinHistory도 갱신해야
                //   참조 우선순위(mannequin > upscaled > sheetHistory > source)에서 실제 교체됨
                const update: Partial<CharacterDescription> = {
                    characterSheetHistory: history,
                    mannequinImageUrl: st.previewUrl,
                    mannequinHistory: [...(char.mannequinHistory || []), st.previewUrl],
                };
                onUpdateCharacterDescription(key, update);
            }
        });
        onClose();
    };

    // ─── 에셋 저장 ──────────────────────────────────────────────────
    const handleSaveToAsset = async (key: string) => {
        const st = charStates[key];
        if (!st.previewUrl || !IS_TAURI) return;
        const char = characterDescriptions[key];
        try {
            const name = `${char.koreanName || key}_비율${st.ratio}등신`;
            // data:image/png;base64,XXXX → base64 부분만 추출
            const base64 = st.previewUrl.includes(',') ? st.previewUrl.split(',')[1] : st.previewUrl;
            const filename = `${key}_proportion_${st.ratio}.png`;
            await saveAsset('character', filename, base64, {
                tags: {
                    character: char.koreanName || key,
                    artStyle: artStyle,
                    location: null,
                    description: `${st.ratio}등신 비율 조정`,
                },
            });
            updateChar(key, { savedToAsset: true });
        } catch (err: any) {
            console.error('에셋 저장 실패:', err);
        }
    };

    const hasAnyMarked = Object.values(charStates).some(s => s.markedForReplace);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-700/50 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-scale">

                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        📐 캐릭터 비율 스튜디오
                        <span className="text-xs font-normal text-zinc-500 ml-2">
                            {proportionEngine === 'gemini' ? 'Nano Banana Pro' : 'Flux + Pose'}
                        </span>
                    </h2>
                    <div className="flex items-center gap-3">
                        {/* ★ Engine 토글 */}
                        <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
                            <button
                                onClick={() => setProportionEngine('gemini')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    proportionEngine === 'gemini'
                                        ? 'bg-orange-600 text-white'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >Gemini</button>
                            <button
                                onClick={() => setProportionEngine('flux')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    proportionEngine === 'flux'
                                        ? 'bg-teal-600 text-white'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >Flux + Pose</button>
                        </div>
                        <button
                            onClick={handleApplyAll}
                            disabled={!hasAnyMarked}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            <CheckIcon className="w-4 h-4" />
                            전체 적용
                        </button>
                        <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors">
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* 바디 */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className={`grid gap-6 ${charEntries.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {charEntries.map(([key, char]) => {
                            const st = charStates[key] || { ratio: defaultRatio, previewUrl: null, isGenerating: false, markedForReplace: false, error: null };
                            const refUrl = getCurrentRef(char);

                            return (
                                <div key={key} className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${st.markedForReplace ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-700/50 bg-zinc-800/50'}`}>
                                    <div className="text-center">
                                        <span className="text-sm font-bold text-white">{char.koreanName || key}</span>
                                        <span className="text-xs text-zinc-500 ml-2">({char.gender === 'female' ? '여' : '남'})</span>
                                    </div>

                                    {/* 이미지 비교 */}
                                    <div className="flex gap-2">
                                        <div className="flex-1 flex flex-col items-center gap-1">
                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">현재</span>
                                            <div className="w-full aspect-[9/16] rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden">
                                                {refUrl ? (
                                                    <img src={refUrl} alt="현재" className="w-full h-full object-contain" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">없음</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-1 flex flex-col items-center gap-1">
                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">프리뷰</span>
                                            <div className="w-full aspect-[9/16] rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden relative">
                                                {st.isGenerating ? (
                                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                                        <SpinnerIcon className="w-6 h-6 text-orange-400 animate-spin" />
                                                        <span className="text-[10px] text-zinc-500">비율 조정 중...</span>
                                                    </div>
                                                ) : st.previewUrl ? (
                                                    <img src={st.previewUrl} alt="프리뷰" className="w-full h-full object-contain" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                                                        {st.error ? <span className="text-red-400 text-[10px] px-2 text-center">{st.error}</span> : '재생성 필요'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 프리셋 */}
                                    <div className="flex gap-1 flex-wrap">
                                        {presets.map(p => (
                                            <button
                                                key={p.value}
                                                onClick={() => updateChar(key, { ratio: p.value })}
                                                className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                                                    st.ratio === p.value
                                                        ? 'bg-orange-600 text-white'
                                                        : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200'
                                                }`}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* 슬라이더 */}
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-zinc-400">비율</span>
                                            <span className="text-xs font-mono font-bold text-orange-400">
                                                {st.ratio}등신
                                                <span className="text-zinc-500 font-normal ml-1">({getRatioLabel(st.ratio)})</span>
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={sliderMin * 10}
                                            max={sliderMax * 10}
                                            step={5}
                                            value={st.ratio * 10}
                                            onChange={e => updateChar(key, { ratio: Number(e.target.value) / 10 })}
                                            className="w-full h-1.5 rounded-full appearance-none bg-zinc-700 accent-orange-500 cursor-pointer"
                                        />
                                        <div className="flex justify-between text-[10px] text-zinc-600">
                                            <span>{sliderMin}등신</span>
                                            <span>{sliderMax}등신</span>
                                        </div>
                                    </div>

                                    {/* 버튼 */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleRegenerate(key)}
                                            disabled={st.isGenerating || !refUrl}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {st.isGenerating ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <RefreshIcon className="w-3.5 h-3.5" />}
                                            재생성
                                        </button>
                                        <button
                                            onClick={() => toggleReplace(key)}
                                            disabled={!st.previewUrl}
                                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                                st.markedForReplace
                                                    ? 'bg-orange-600 hover:bg-orange-500 text-white'
                                                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
                                            }`}
                                        >
                                            <CheckIcon className="w-3.5 h-3.5" />
                                            {st.markedForReplace ? '교체 예정' : '이걸로 교체'}
                                        </button>
                                    </div>
                                    {/* 에셋 저장 */}
                                    {IS_TAURI && st.previewUrl && (
                                        <button
                                            onClick={() => handleSaveToAsset(key)}
                                            disabled={st.savedToAsset}
                                            className={`w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-medium rounded-lg transition-colors ${
                                                st.savedToAsset
                                                    ? 'bg-emerald-900/40 text-emerald-400 cursor-default'
                                                    : 'bg-zinc-700/60 hover:bg-zinc-600 text-zinc-300'
                                            }`}
                                        >
                                            <BookmarkSquareIcon className="w-3 h-3" />
                                            {st.savedToAsset ? '에셋 저장됨' : '에셋에 저장'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {charEntries.length === 0 && (
                        <div className="text-center text-zinc-500 py-12">
                            레퍼런스 이미지가 등록된 캐릭터가 없습니다.
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 text-xs text-zinc-500">
                    <span>프리셋 또는 슬라이더로 비율 선택 → "재생성" → "이걸로 교체" 체크 → "전체 적용"</span>
                    <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};
