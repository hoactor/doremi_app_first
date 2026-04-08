// components/EnlargedCutModal.tsx — 더블클릭 확대 모달 (App.tsx에서 분리)

import React from 'react';
import { useAppContext } from '../AppContext';
import { CheckIcon, SparklesIcon, XIcon, RefreshIcon, TrashIcon, PencilIcon, PhotoIcon } from './icons';

export const EnlargedCutModal: React.FC = () => {
    const { state, actions } = useAppContext();
    const { enlargedCutNumber, generatedContent, generatedImageHistory } = state;

    if (!enlargedCutNumber) return null;

    const eCut = generatedContent?.scenes.flatMap(s => s.cuts).find(c => c.cutNumber === enlargedCutNumber);
    if (!eCut) return null;

    const eImages = (generatedImageHistory || []).filter(img => img.sourceCutNumber === enlargedCutNumber);
    eImages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const eSelected = eImages.find(img => img.id === eCut?.selectedImageId);
    const eDisplay = eSelected || eImages[0];

    return (
        <div className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => actions.setUIState({ enlargedCutNumber: null })}>
            <div className="bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl max-w-[720px] w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* 이미지 */}
                <div className="relative bg-zinc-950 rounded-t-2xl overflow-hidden">
                    <div className="aspect-video flex items-center justify-center">
                        {eDisplay ? <img src={eDisplay.imageUrl} alt="" className="w-full h-full object-contain cursor-pointer" onClick={() => actions.handleOpenImageViewer(eDisplay.imageUrl, `Cut ${enlargedCutNumber}`, eDisplay.prompt)} /> : <PhotoIcon className="w-16 h-16 text-zinc-700" />}
                    </div>
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span className="bg-black/70 text-white text-sm font-black px-2.5 py-1 rounded-lg">#{enlargedCutNumber}</span>
                        {eCut.useIntenseEmotion && <span className="text-[9px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full">🔥 강화</span>}
                    </div>
                    <button onClick={() => actions.setUIState({ enlargedCutNumber: null })} className="absolute top-3 right-3 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* 나레이션 + 캐릭터 */}
                    <div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{eCut.narration}</p>
                        <div className="flex gap-1.5 flex-wrap mt-2">
                            {(eCut.characters || []).map(c => <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{c}</span>)}
                        </div>
                    </div>

                    {/* 프롬프트 */}
                    <div className="bg-zinc-800/50 rounded-lg p-3 max-h-28 overflow-y-auto">
                        <p className="text-[11px] text-zinc-500 font-mono whitespace-pre-wrap">{eCut.imagePrompt || '(없음)'}</p>
                    </div>

                    {/* 버튼 */}
                    <div className="flex gap-2">
                        <button onClick={() => actions.handleGenerateForCut(enlargedCutNumber, 'rough')} disabled={eCut.imageLoading}
                            className="flex-1 px-3 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                            <RefreshIcon className="w-3.5 h-3.5" /> 러프
                        </button>
                        <button onClick={() => actions.handleGenerateForCut(enlargedCutNumber, 'normal')} disabled={eCut.imageLoading}
                            className="flex-1 px-3 py-2.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-orange-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                            <SparklesIcon className="w-3.5 h-3.5" /> 일반
                        </button>
                        <button onClick={() => actions.handleToggleIntenseEmotion(enlargedCutNumber)}
                            disabled={eCut.isIntensifying}
                            className={`flex-1 px-3 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${eCut.isIntensifying ? 'bg-rose-900/50 text-rose-300 border border-rose-700/40 animate-pulse' : eCut.useIntenseEmotion ? 'bg-rose-600 text-white' : 'bg-zinc-700 hover:bg-rose-600/30 text-zinc-300 border border-zinc-600'}`}>
                            {eCut.isIntensifying ? '⏳ 생성중' : eCut.useIntenseEmotion ? '🔥 강화됨' : '🔥 강화'}
                        </button>
                        <button onClick={() => { actions.handlePrepareStudioForCut(enlargedCutNumber, eCut.sceneDescription); actions.setUIState({ enlargedCutNumber: null }); }}
                            className="flex-1 px-3 py-2.5 bg-zinc-700 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                            <PencilIcon className="w-3.5 h-3.5" /> Studio
                        </button>
                    </div>

                    {/* 이미지 히스토리 */}
                    {eImages.length > 0 && (
                        <div>
                            <p className="text-[11px] font-bold text-zinc-500 mb-2">이미지 이력 ({eImages.length})</p>
                            <div className="grid grid-cols-4 gap-2">
                                {eImages.map(img => {
                                    const tag = img.tag || (img.engine === 'imagen-rough' ? 'rough' : 'hq');
                                    const modelShort = img.model ? img.model.replace('nano-', '') : '';
                                    const badgeLabel = tag === 'rough' ? '러프' : tag === 'normal' ? '일반' : 'HQ';
                                    const badgeText = modelShort ? `${badgeLabel}/${modelShort}` : badgeLabel;
                                    const badgeCls = tag === 'rough' ? 'bg-zinc-600' : tag === 'normal' ? 'bg-orange-600' : 'bg-emerald-600';
                                    return (
                                    <div key={img.id} className={`relative aspect-square rounded-lg overflow-hidden border cursor-pointer group ${img.id === eCut.selectedImageId ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-zinc-700'}`}
                                        onClick={() => actions.handleSelectImageForCut(enlargedCutNumber, img.id)}>
                                        <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                            <button onClick={(e) => { e.stopPropagation(); actions.handleDeleteFromHistory(img.id); }} className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-500"><TrashIcon className="w-3 h-3" /></button>
                                        </div>
                                        {img.id === eCut.selectedImageId && <span className="absolute top-1 right-1 text-[7px] bg-orange-600 text-white px-1 rounded font-bold">대표</span>}
                                        <span className={`absolute bottom-1 left-1 text-[7px] font-bold text-white px-1 rounded ${badgeCls}`}>{badgeText}</span>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
