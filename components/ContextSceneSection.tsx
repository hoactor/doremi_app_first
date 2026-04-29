// components/ContextSceneSection.tsx — Phase A.6: outfitSession 안의 Context 씬 디자인 UI
// 분석 안 됨 / stale / 분석 완료 3가지 케이스.

import React, { useState } from 'react';
import type { ContextSceneDesign, OutfitSession, PlannedCut } from '../types';

interface ContextSceneSectionProps {
    sessionKey: string;
    session: OutfitSession;
    design: ContextSceneDesign | undefined;
    isAnalyzing: boolean;
    isGenerating: boolean;
    onAnalyzeOne: () => void;
    onGenerate: () => void;
    onUpdateCutCount: (count: number) => void;
    onUpdatePlannedCut: (cutIndex: number, data: Partial<PlannedCut>) => void;
}

export const ContextSceneSection: React.FC<ContextSceneSectionProps> = ({
    sessionKey: _sessionKey,
    session: _session,
    design,
    isAnalyzing,
    isGenerating,
    onAnalyzeOne,
    onGenerate,
    onUpdateCutCount,
    onUpdatePlannedCut: _onUpdatePlannedCut,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // 케이스 1: 분석 안 됨
    if (!design) {
        return (
            <div className="mt-2 p-2 rounded bg-violet-500/5 border border-violet-500/20">
                <button
                    onClick={onAnalyzeOne}
                    disabled={isAnalyzing}
                    className="w-full text-[10px] py-1.5 rounded bg-violet-700/40 hover:bg-violet-700/60 text-violet-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    {isAnalyzing ? '분석 중...' : '🎬 이 배치만 분석'}
                </button>
            </div>
        );
    }

    // 케이스 2: stale
    if (design.isStale) {
        return (
            <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-[10px] text-yellow-300 mb-1.5">
                    ⚠ outfitSession 변경됨 — 재분석 필요
                </p>
                <button
                    onClick={onAnalyzeOne}
                    disabled={isAnalyzing}
                    className="w-full text-[10px] py-1.5 rounded bg-yellow-700/40 hover:bg-yellow-700/60 text-yellow-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    {isAnalyzing ? '재분석 중...' : '🔄 재분석'}
                </button>
            </div>
        );
    }

    // 케이스 3: 분석 완료
    return (
        <div className="mt-2 rounded bg-violet-500/5 border border-violet-500/30 overflow-hidden">
            <button
                onClick={() => setIsExpanded(v => !v)}
                className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-violet-500/10 transition-colors"
            >
                <span className="text-[10px] font-semibold text-violet-200">
                    🎬 Context 씬 ({design.targetCutCount}컷)
                </span>
                <span className="text-[9px] text-violet-400">{isExpanded ? '▾' : '▸'}</span>
            </button>

            {isExpanded && (
                <div className="px-2 pb-2 space-y-2">
                    {/* 씬 내러티브 */}
                    <div>
                        <p className="text-[9px] text-violet-400/60 uppercase tracking-wider mb-0.5">Scene</p>
                        <p className="text-[10px] text-zinc-300 leading-relaxed line-clamp-3">
                            {design.sceneNarrative}
                        </p>
                    </div>

                    {/* 컷 수 슬라이더 */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-violet-400/60 uppercase tracking-wider">컷 수</span>
                            <span className="text-[10px] font-bold text-violet-200">{design.targetCutCount}</span>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={8}
                            value={design.targetCutCount}
                            onChange={(e) => onUpdateCutCount(parseInt(e.target.value, 10))}
                            disabled={isGenerating}
                            className="w-full accent-violet-500"
                        />
                        <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5">
                            <span>1</span>
                            <span>추천: {design.recommendedCutCount}</span>
                            <span>8</span>
                        </div>
                    </div>

                    {/* plannedCuts 미리보기 */}
                    <div>
                        <p className="text-[9px] text-violet-400/60 uppercase tracking-wider mb-1">컷 디자인</p>
                        <div className="space-y-1">
                            {design.plannedCuts.slice(0, design.targetCutCount).map(cut => (
                                <div key={cut.cutIndex} className="text-[10px] text-zinc-400 leading-tight">
                                    <span className={`font-semibold ${cut.role === 'anchor' ? 'text-cyan-300' : 'text-violet-300'}`}>
                                        {cut.role === 'anchor' ? '⚓' : `${cut.cutIndex}.`}
                                    </span>{' '}
                                    {cut.momentDescription}
                                    {cut.cameraNote && (
                                        <span className="text-zinc-600 italic"> · {cut.cameraNote}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex gap-1 pt-1 border-t border-violet-500/20">
                        <button
                            onClick={onAnalyzeOne}
                            disabled={isAnalyzing || isGenerating}
                            className="flex-1 text-[9px] py-1 rounded bg-violet-700/30 hover:bg-violet-700/50 text-violet-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="이 배치만 다시 분석"
                        >
                            🔄 재분석
                        </button>
                        <button
                            onClick={onGenerate}
                            disabled={isAnalyzing || isGenerating}
                            className="flex-[2] text-[10px] py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={`${design.targetCutCount}컷을 한 번에 생성`}
                        >
                            {isGenerating ? '생성 중...' : `🎬 씬 일괄 생성 (${design.targetCutCount}컷)`}
                        </button>
                    </div>

                    {/* 생성 결과 */}
                    {design.generationResult && (
                        <div className="pt-2 border-t border-violet-500/20">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[9px] text-violet-400/60 uppercase tracking-wider">생성 결과</span>
                                <span className="text-[8px] text-zinc-500">
                                    ${design.generationResult.estimatedCostUsd.toFixed(3)}
                                </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                                {design.generationResult.images.map(img => (
                                    <div key={img.cutIndex} className="relative aspect-[2/3] rounded overflow-hidden bg-zinc-800">
                                        <img src={img.imageUrl} alt={`Cut ${img.cutIndex}`} className="w-full h-full object-cover" loading="lazy" />
                                        <span className="absolute top-0.5 left-0.5 text-[8px] font-bold bg-black/60 text-white px-1 rounded">
                                            {img.cutIndex}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
