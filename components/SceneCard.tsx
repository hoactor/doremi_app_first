
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Cut, Scene, GeneratedImage, ArtStyle } from '../types';
import { SparklesIcon, CheckIcon, SpeakerWaveIcon, TrashIcon, PhotoIcon, ChevronDownIcon, XIcon, PencilIcon, ScissorsIcon, UploadIcon, SpinnerIcon, RefreshIcon, UserIcon, PlusIcon, BookmarkSquareIcon, DownloadIcon, UndoIcon, ZoomInIcon } from './icons';
import { useAppContext } from '../AppContext';
import { IS_TAURI, saveAsset, resolveImageUrl } from '../services/tauriAdapter';
import { AssetTagPopup, AssetCatalogModal } from './AssetCatalogModal';
import { buildArtStylePrompt } from '../appStyleEngine';
import { createGeneratedImage } from '../appUtils';
import type { AssetCatalogEntry } from '../services/tauriAdapter';

interface CutCardProps {
  cut: Cut;
  scene?: Scene;
}

interface SceneContainerProps {
  scene: Scene;
}

const InfoField: React.FC<{ 
    label: string; 
    value: string; 
    onUpdate: (newValue: string) => void;
    className?: string;
    labelClassName?: string;
}> = ({ label, value, onUpdate, className, labelClassName }) => {
  const [localValue, setLocalValue] = useState(value);
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
      setLocalValue(value);
      setHasChanged(false);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalValue(e.target.value);
      setHasChanged(e.target.value !== value);
  };

  const handleUpdate = () => {
    onUpdate(localValue);
    setHasChanged(false); // Assume successful initiation
  };

  return (
    <div className={className}>
      <label className={`text-xs font-semibold ${labelClassName || 'text-zinc-400'}`}>{label}</label>
      <div className="relative mt-1">
        <textarea
            value={localValue}
            onChange={handleChange}
            rows={label === '장면 설명' || label === '최종 이미지 프롬프트' ? 4 : 2}
            className={`w-full p-3 pr-10 text-sm rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-zinc-900/50 border ${hasChanged ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-zinc-700'}`}
        />
        <button 
            onClick={handleUpdate} 
            className={`absolute bottom-2 right-2 p-1.5 rounded-md transition-all duration-200 group ${hasChanged ? 'bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-110 shadow-lg' : 'text-zinc-400 hover:text-white bg-zinc-700/50 hover:bg-zinc-600'}`} 
            title={hasChanged ? "변경 사항을 반영하여 장면 다시 쓰기" : "내용 동기화/재생성"}
        >
          {hasChanged ? <CheckIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

export const CutCard: React.FC<CutCardProps> = ({ cut, scene }) => {
    const { state, actions, dispatch } = useAppContext();
    const { generatedImageHistory } = state;
    
    // Compute derived state
    const availableImages = generatedImageHistory.filter(img => img.sourceCutNumber === cut.cutNumber);
    // Sort images: latest first
    availableImages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const audioInputRef = useRef<HTMLInputElement>(null);
    const [isDraggingOverAudio, setIsDraggingOverAudio] = useState(false);
    const audioDragCounter = useRef(0);
    const [isDraggingOverImage, setIsDraggingOverImage] = useState(false);
    const imageDragCounter = useRef(0);
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
    const imageUploadInputRef = useRef<HTMLInputElement>(null);
    const [isEditingIntent, setIsEditingIntent] = useState(false);
    const [editedIntent, setEditedIntent] = useState(cut.directorialIntent || '');
    const [showAssetTagPopup, setShowAssetTagPopup] = useState(false);
    const [showFullPromptModal, setShowFullPromptModal] = useState(false);
    const [fluxPromptCache, setFluxPromptCache] = useState('');
    const [isFluxPromptLoading, setIsFluxPromptLoading] = useState(false);
    const [refineInput, setRefineInput] = useState('');

    // FIX: Use the Gemini API for smart narration line breaks via an action
    const [editedNarration, setEditedNarration] = useState(cut.narration);

    const handleDragStart = (e: React.DragEvent, image: GeneratedImage) => {
        e.dataTransfer.setData('application/x-studio-image-source', JSON.stringify({ image }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    useEffect(() => {
        // Sync local state when the prop changes from an external source (e.g., AI update)
        setEditedNarration(cut.narration);
    }, [cut.narration]);

    const handleNarrationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditedNarration(e.target.value);
    };

    const handleNarrationBlur = () => {
        // On blur, call the centralized action handler in AppContext
        if (editedNarration !== cut.narration) {
            actions.handleUpdateAndFormatNarration(cut.cutNumber, editedNarration);
        }
    };


    const canSplitCut = (cut.narration || '').trim().length > 0 && cut.audioDataUrls?.length === 1;

    const handleCharacterToggle = (name: string) => {
        const currentChars = cut.characters || [];
        const newSelection = currentChars.includes(name)
            ? currentChars.filter(n => n !== name)
            : [...currentChars, name];
        actions.handleUpdateCutCharacters(cut.cutNumber, newSelection.sort());
    };

    const handleAudioAttachClick = () => {
        audioInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            actions.handleAttachAudioToCut(cut.cutNumber, file);
        }
    };
    
    const handleAudioDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        audioDragCounter.current++;
        const hasAudioFile = e.dataTransfer.items && (Array.from(e.dataTransfer.items) as any[]).some(item => item.kind === 'file' && item.type.startsWith('audio/'));
        if (hasAudioFile) setIsDraggingOverAudio(true);
    };

    const handleAudioDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };

    const handleAudioDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        audioDragCounter.current--;
        if (audioDragCounter.current === 0) setIsDraggingOverAudio(false);
    };

    const handleAudioDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        setIsDraggingOverAudio(false);
        audioDragCounter.current = 0;
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const audioFile = (Array.from(files) as File[]).find(file => file.type.startsWith('audio/'));
            if (audioFile) actions.handleAttachAudioToCut(cut.cutNumber, audioFile);
        }
    };

    const handleImageDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        imageDragCounter.current++;
        if (e.dataTransfer.types.includes('application/x-studio-image-source') || e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('Files')) {
            setIsDraggingOverImage(true);
        }
    };

    const handleImageDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };

    const handleImageDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        imageDragCounter.current--;
        if (imageDragCounter.current === 0) setIsDraggingOverImage(false);
    };
    
    const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        setIsDraggingOverImage(false);
        imageDragCounter.current = 0;
        const data = e.dataTransfer.getData('application/x-studio-image-source') || e.dataTransfer.getData('text/plain');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (parsed && parsed.image) {
                    if (parsed.image.sourceCutNumber !== cut.cutNumber) {
                        // It's from another cut. Clone it to this cut.
                        actions.handleAssignImageToCut(cut.cutNumber, parsed.image);
                    } else {
                        // Same cut, just select.
                        actions.handleSelectImageForCut(cut.cutNumber, parsed.image.id);
                    }
                    return;
                }
            } catch (error) { console.error("Failed to parse dropped image data", error); }
        }
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            actions.handleUploadImageForCut(cut.cutNumber, file);
        }
    };
    
    const selectedImage = availableImages.find(img => img.id === cut.selectedImageId);

    const handleFieldUpdate = (field: keyof Cut, newValue: string) => {
        actions.handleUpdateCutFieldAndRegenerate(cut.cutNumber, field, newValue);
    };

    // ─── 참조 이미지 로컬 state ───
    const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
    const refFileRef = useRef<HTMLInputElement>(null);
    const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
    const [isRefDragging, setIsRefDragging] = useState(false);
    const [undoStack, setUndoStack] = useState<string[]>([]);
    const [isAudioExpanded, setIsAudioExpanded] = useState(false);
    const narrationRef = useRef<HTMLTextAreaElement>(null);

    // ─── Undo ───
    const handleUndo = () => {
        if (undoStack.length <= 1) return;
        const newStack = undoStack.slice(0, -1);
        setUndoStack(newStack);
        actions.handleSelectImageForCut(cut.cutNumber, newStack[newStack.length - 1]);
    };

    // ─── HQ Upscale ───
    const handleUpscale = async (scale: 2 | 4 = 2) => {
        if (!selectedImage) return;
        try {
            const { upscaleImageWithESRGAN } = await import('../services/falService');
            const upscaledUrl = await upscaleImageWithESRGAN(selectedImage.imageUrl, scale);
            const newImg = createGeneratedImage({ imageUrl: upscaledUrl, sourceCutNumber: cut.cutNumber, prompt: 'HQ Upscale', model: state.selectedNanoModel });
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: cut.cutNumber } });
            actions.handleSelectImageForCut(cut.cutNumber, newImg.id);
            actions.addNotification(`${scale}x 업스케일 완료`, 'success');
        } catch (err: any) {
            actions.addNotification(`업스케일 실패: ${err.message || err}`, 'error');
        }
    };

    // ─── Edit Image (인라인) ───
    const handleEditImage = async () => {
        if (!selectedImage || !refineInput.trim()) return;
        try {
            await actions.handleEditForCut(cut.cutNumber, selectedImage, refineInput, referenceImageUrls);
            setRefineInput('');
        } catch (err) { console.error('Edit failed:', err); }
    };

    // ─── 참조 이미지 핸들러 ───
    const handleRefFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && referenceImageUrls.length < 5) {
            const reader = new FileReader();
            reader.onload = (ev) => { setReferenceImageUrls(prev => [...prev, ev.target?.result as string]); };
            reader.readAsDataURL(file);
        }
    };

    const handleRefDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsRefDragging(false);
        const data = e.dataTransfer.getData('application/x-studio-image-source');
        if (data && referenceImageUrls.length < 5) {
            try { const { image } = JSON.parse(data); if (image?.imageUrl) setReferenceImageUrls(prev => [...prev, image.imageUrl]); } catch {}
        }
    };

    // ─── Edit 결과 자동 반영 ───
    useEffect(() => {
        if (availableImages.length > 0 && !cut.imageLoading) {
            const latestImage = availableImages[0];
            if (latestImage.id !== cut.selectedImageId) {
                actions.handleSelectImageForCut(cut.cutNumber, latestImage.id);
                setUndoStack(prev => [...prev, latestImage.id]);
            }
        }
    }, [availableImages.length]);

    // ─── 나레이션 auto-resize ───
    useEffect(() => {
        const el = narrationRef.current;
        if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    }, [editedNarration]);

    return (
        <>
        <div id={`cut-${cut.cutNumber}`} className="relative bg-zinc-900/80 rounded-xl shadow-lg border p-4 flex flex-col gap-3 border-zinc-800 transition-all duration-300 hover:border-orange-500/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-0.5 group/card">
            {cut.isUpdatingIntent && (
                <div className="absolute inset-0 bg-zinc-900/80 flex flex-col items-center justify-center z-20 rounded-xl backdrop-blur-sm">
                    <SpinnerIcon className="w-8 h-8 text-orange-400" />
                    <p className="mt-2 text-sm font-mono text-zinc-300">Applying Intent...</p>
                </div>
            )}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${selectedImage ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-700'}`} title={selectedImage ? "이미지 있음" : "이미지 없음"} />
                        <h4 className="font-mono font-bold text-lg text-orange-400 tracking-tight">CUT {cut.cutNumber}</h4>
                        {cut.useIntenseEmotion && <span className="text-[8px] font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded-full">🔥</span>}
                        <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-1">
                            <button onClick={() => actions.handleAutoGenerateImageForCut(cut)} className="p-1.5 text-purple-400 hover:text-white bg-purple-900/30 hover:bg-purple-600 rounded-md transition-all duration-200" title="컷 자동 생성 (AI)">
                                <SparklesIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => actions.handleOpenCutSplitter(cut)} disabled={!canSplitCut} className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed" title={canSplitCut ? "컷 분할 편집기 (오디오, 텍스트)" : "컷을 분할하려면 나레이션과 단일 오디오 파일이 필요합니다."}>
                                <ScissorsIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 py-1 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/50">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            <UserIcon className="w-3 h-3"/> Cast
                        </span>
                        {/* Dynamic Character Toggles */}
                        <div className="flex flex-wrap gap-2">
                            {Object.values(state.characterDescriptions).map((char, index) => {
                                const colors = ['text-blue-400', 'text-pink-400', 'text-emerald-400', 'text-amber-400', 'text-purple-400'];
                                const bgColors = ['bg-blue-500/10', 'bg-pink-500/10', 'bg-emerald-500/10', 'bg-amber-500/10', 'bg-purple-500/10'];
                                const borderColors = ['border-blue-500/20', 'border-pink-500/20', 'border-emerald-500/20', 'border-amber-500/20', 'border-purple-500/20'];
                                const colorIndex = index % colors.length;
                                const cutChars = cut.characters || [];
                                const isSelected = cutChars.includes(char.koreanName) || (char.canonicalName ? cutChars.includes(char.canonicalName) : false);
                                
                                return (
                                    <label key={char.koreanName} className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-md border text-xs font-medium transition-all ${isSelected ? `${bgColors[colorIndex]} ${borderColors[colorIndex]} ${colors[colorIndex]}` : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'}`}>
                                        <input 
                                            type="checkbox" 
                                            checked={isSelected} 
                                            onChange={() => handleCharacterToggle(char.koreanName)} 
                                            className="sr-only" 
                                        />
                                        <span>{char.koreanName}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    

                </div>

                {/* ─── Audio (접힘식) ─── */}
                <div className="relative" onDragEnter={handleAudioDragEnter} onDragLeave={handleAudioDragLeave} onDragOver={handleAudioDragOver} onDrop={handleAudioDrop}>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            <SpeakerWaveIcon className="w-3 h-3" /> Audio {(cut.audioDataUrls || []).length > 0 && `(${(cut.audioDataUrls || []).length})`}
                        </span>
                        {(cut.audioDataUrls || []).length > 1 && (
                            <button onClick={() => setIsAudioExpanded(prev => !prev)} className="text-[9px] text-indigo-400 hover:text-indigo-300">
                                {isAudioExpanded ? '접기' : `+${(cut.audioDataUrls || []).length - 1} more`}
                            </button>
                        )}
                        <button onClick={handleAudioAttachClick} className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 ml-auto">
                            <PlusIcon className="w-3 h-3" /> Add
                        </button>
                        <input type="file" ref={audioInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" />
                    </div>
                    {(cut.audioDataUrls || []).length > 0 && (
                        <div className="mt-1 space-y-1">
                            {(isAudioExpanded ? (cut.audioDataUrls || []) : (cut.audioDataUrls || []).slice(0, 1)).map((url, index) => (
                                <div key={`audio-${cut.cutNumber}-${index}`} className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-md border border-zinc-800/50">
                                    <audio controls src={url} className="w-full h-6 rounded"></audio>
                                    <button onClick={() => actions.handleRemoveAudioFromCut(cut.cutNumber, index)} className="p-1 text-zinc-500 hover:text-red-400 rounded flex-shrink-0"><TrashIcon className="w-3 h-3" /></button>
                                </div>
                            ))}
                        </div>
                    )}
                    {isDraggingOverAudio && (
                        <div className="absolute inset-0 bg-indigo-500/20 border-2 border-dashed border-indigo-400 rounded-lg flex items-center justify-center pointer-events-none z-10 backdrop-blur-sm">
                            <SpeakerWaveIcon className="w-6 h-6 text-indigo-300" />
                        </div>
                    )}
                </div>

                <div className="relative mt-2">
                    <textarea
                        ref={narrationRef}
                        value={editedNarration}
                        onChange={handleNarrationChange}
                        onBlur={handleNarrationBlur}
                        style={{ minHeight: '60px' }}
                        className="w-full text-base font-medium text-zinc-100 bg-zinc-950 p-3 rounded-lg border border-zinc-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none overflow-hidden whitespace-pre-wrap leading-relaxed shadow-inner"
                        placeholder="나레이션 입력..."
                    />
                    {cut.isFormattingNarration && (
                        <div className="absolute inset-0 bg-zinc-950/50 flex items-center justify-center rounded-lg pointer-events-none backdrop-blur-sm">
                            <SpinnerIcon className="w-5 h-5 text-indigo-400" />
                        </div>
                    )}
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch gap-4">
                <div className="w-full sm:w-40 flex-shrink-0">
                    <input type="file" ref={imageUploadInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) actions.handleUploadImageForCut(cut.cutNumber, file); }} accept="image/*" className="hidden" />
                    <div className="mt-1 w-full aspect-square bg-zinc-950 rounded-lg flex items-center justify-center relative group border border-zinc-800 overflow-hidden" onDragEnter={handleImageDragEnter} onDragLeave={handleImageDragLeave} onDragOver={handleImageDragOver} onDrop={handleImageDrop}>
                       {selectedImage?.imageUrl ? (
                            <>
                                <img 
                                    src={selectedImage.imageUrl || undefined}
                                    alt={`Selected for ${cut.cutNumber}`}
                                    className="w-full h-full object-cover cursor-grab" 
                                    onClick={() => actions.handleOpenImageViewer(selectedImage.imageUrl, `Selected image for ${cut.cutNumber}`)}
                                    onDoubleClick={(e) => { e.stopPropagation(); actions.setUIState({ enlargedCutNumber: cut.cutNumber }); }}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, selectedImage)}
                                />
                                <button onClick={() => actions.handleSelectImageForCut(cut.cutNumber, null)} className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm" title="대표 이미지 선택 해제"><XIcon className="w-3 h-3" /></button>
                                {IS_TAURI && <button onClick={(e) => { e.stopPropagation(); setShowAssetTagPopup(true); }} className="absolute top-1 left-1 p-1 bg-amber-600/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm" title="에셋으로 저장"><BookmarkSquareIcon className="w-3 h-3" /></button>}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-4 pb-1.5 px-1.5 flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); fetch(selectedImage.imageUrl).then(r => r.blob()).then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `cut_${cut.cutNumber}.png`; a.click(); URL.revokeObjectURL(a.href); }).catch(() => { const a = document.createElement('a'); a.href = selectedImage.imageUrl; a.download = `cut_${cut.cutNumber}.png`; a.click(); }); }} className="p-1.5 bg-purple-600/90 text-white rounded-md hover:bg-purple-500 backdrop-blur-sm" title="다운로드"><DownloadIcon className="w-3 h-3" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleUndo(); }} disabled={undoStack.length <= 1} className="p-1.5 bg-zinc-600/90 text-white rounded-md hover:bg-zinc-500 backdrop-blur-sm disabled:opacity-30" title="Undo"><UndoIcon className="w-3 h-3" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleUpscale(e.shiftKey ? 4 : 2); }} className="p-1.5 bg-orange-600/90 text-white rounded-md hover:bg-orange-500 backdrop-blur-sm" title="HQ Upscale (Shift=4x)"><ZoomInIcon className="w-3 h-3" /></button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors" onClick={() => imageUploadInputRef.current?.click()}>
                                <PhotoIcon className="w-8 h-8 mx-auto mb-1 opacity-50"/>
                                <p className="text-[10px] font-mono uppercase tracking-wider">Drop Image</p>
                            </div>
                        )}
                        {isDraggingOverImage && (
                            <div className="absolute inset-0 bg-indigo-500/20 border-2 border-dashed border-indigo-400 flex flex-col items-center justify-center pointer-events-none z-10 backdrop-blur-sm">
                                <UploadIcon className="w-6 h-6 text-indigo-300 mb-1" />
                            </div>
                        )}
                        {cut.imageLoading && (
                            <div className="absolute inset-0 bg-zinc-950/60 flex items-center justify-center z-10 rounded-lg backdrop-blur-sm">
                                <SpinnerIcon className="w-8 h-8 text-orange-400" />
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── 참조 이미지 슬롯 ─── */}
                <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">References ({referenceImageUrls.length}/5)</span>
                    <div className={`grid grid-cols-3 gap-1.5 mt-1 p-1.5 rounded-lg transition-all ${isRefDragging ? 'bg-orange-900/20 ring-2 ring-orange-500/50' : ''}`}
                        onDrop={handleRefDrop}
                        onDragOver={(e) => { e.preventDefault(); setIsRefDragging(true); }}
                        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsRefDragging(false); }}
                        onDragEnter={(e) => { e.preventDefault(); setIsRefDragging(true); }}
                    >
                        {Array.from({ length: Math.max(3, referenceImageUrls.length + 1) }).slice(0, 5).map((_, idx) => {
                            const refUrl = referenceImageUrls[idx];
                            if (refUrl) {
                                return (
                                    <div key={idx} className="relative aspect-square rounded-md overflow-hidden border border-zinc-600 group">
                                        <img src={refUrl} alt={`참조${idx + 1}`} className="w-full h-full object-cover" onClick={() => actions.handleOpenImageViewer(refUrl, `참조 ${idx + 1}`)} />
                                        <button onClick={() => setReferenceImageUrls(prev => prev.filter((_, i) => i !== idx))} className="absolute top-0.5 right-0.5 p-0.5 bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"><XIcon className="w-2.5 h-2.5" /></button>
                                    </div>
                                );
                            }
                            return (
                                <div key={idx} onClick={() => refFileRef.current?.click()} className="aspect-square rounded-md border-2 border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-800/30 flex items-center justify-center cursor-pointer transition-all">
                                    <span className="text-zinc-600 text-sm">+</span>
                                </div>
                            );
                        })}
                        {IS_TAURI && referenceImageUrls.length < 5 && (
                            <button onClick={() => setIsAssetPickerOpen(true)} className="aspect-square rounded-md border border-dashed border-orange-700/50 flex flex-col items-center justify-center text-orange-600 hover:text-orange-400 hover:border-orange-500/50 transition-colors cursor-pointer">
                                <BookmarkSquareIcon className="w-3.5 h-3.5" />
                                <span className="text-[6px] mt-0.5">에셋</span>
                            </button>
                        )}
                    </div>
                    <input type="file" ref={refFileRef} className="hidden" accept="image/*" onChange={handleRefFileChange} />
                    {/* ─── 선택 이미지 모델/화풍 표시 (이미지 하단 정렬) ─── */}
                    {selectedImage && (
                        <div className="mt-auto pt-1.5 flex flex-wrap gap-1.5 items-end">
                            {selectedImage.model && (() => {
                                const m = selectedImage.model;
                                const colorMap: Record<string, string> = {
                                    'nano-3pro': 'bg-red-900/50 text-red-400 border-red-600/50',
                                    'nano-3.1': 'bg-amber-900/50 text-amber-400 border-amber-600/50',
                                    'flux-lora': 'bg-emerald-900/50 text-emerald-400 border-emerald-600/50',
                                    'flux-2-flex': 'bg-cyan-900/50 text-cyan-400 border-cyan-600/50',
                                    'flux-flex': 'bg-cyan-900/50 text-cyan-400 border-cyan-600/50',
                                    'flux-pro': 'bg-purple-900/50 text-purple-400 border-purple-600/50',
                                    'flux-2-pro': 'bg-purple-900/50 text-purple-400 border-purple-600/50',
                                };
                                const cls = colorMap[m] || 'bg-zinc-800 text-zinc-400 border-zinc-700';
                                return <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wide border ${cls}`}>{m}</span>;
                            })()}
                            {(selectedImage.artStyleLabel || state.artStyle) && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wide bg-amber-950/60 text-amber-300 border border-amber-700/40">
                                    {selectedImage.artStyleLabel || (() => {
                                        const names: Record<string, string> = { 'normal':'정통 썰툰','vibrant':'도파민','kyoto':'시네마 감성','moe':'극강 귀요미','dalle-chibi':'프리미엄','custom':'커스텀' };
                                        return names[state.artStyle] || state.artStyle;
                                    })()}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ─── 러프/일반/확정 + 수정 요청 ─── */}
            <div className="mt-2 pt-3 border-t border-zinc-800/50 space-y-2">
                <div className="flex gap-1.5">
                    <button onClick={() => actions.handleGenerateForCut(cut.cutNumber, 'rough')} disabled={cut.imageLoading} className="flex-1 px-2 py-1.5 bg-transparent hover:bg-orange-500/10 disabled:opacity-50 text-orange-400 text-[10px] font-bold rounded-md flex items-center justify-center gap-1 transition-colors border border-orange-500/50"><RefreshIcon className="w-3 h-3" /> 러프</button>
                    <button onClick={() => actions.handleGenerateForCut(cut.cutNumber, 'normal')} disabled={cut.imageLoading} className="flex-1 px-2 py-1.5 bg-orange-950/60 hover:bg-orange-900/60 disabled:opacity-50 text-orange-500/80 text-[10px] font-bold rounded-md flex items-center justify-center gap-1 transition-colors border border-orange-800/40"><SparklesIcon className="w-3 h-3" /> 일반</button>
                    <button onClick={() => actions.handleToggleIntenseEmotion(cut.cutNumber)} disabled={cut.isIntensifying} className={`flex-1 px-2 py-1.5 text-[10px] font-bold rounded-md flex items-center justify-center gap-1 transition-colors ${cut.isIntensifying ? 'bg-rose-900/50 text-rose-300 border border-rose-700/40 animate-pulse' : cut.useIntenseEmotion ? 'bg-rose-600 text-white' : 'bg-orange-800/50 hover:bg-rose-700/50 text-orange-300 border border-orange-600/40'}`}>{cut.isIntensifying ? '⏳ 생성중' : cut.useIntenseEmotion ? '🔥 강화됨' : '🔥 강화'}</button>
                </div>
                <div className="flex gap-1.5">
                    <input type="text" value={refineInput} onChange={e => setRefineInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && refineInput.trim()) { e.preventDefault(); handleEditImage(); }
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && refineInput.trim()) { e.preventDefault(); actions.handleRefinePrompt(cut.cutNumber, refineInput); setRefineInput(''); }
                        }}
                        placeholder="Enter=편집 / ⌘Enter=프롬프트수정" className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-[10px] text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none" />
                    <button onClick={() => { if (refineInput.trim()) { actions.handleRefinePrompt(cut.cutNumber, refineInput); setRefineInput(''); } }} disabled={!refineInput.trim() || cut.imageLoading}
                        className="px-2 py-1.5 bg-transparent hover:bg-orange-500/10 disabled:bg-zinc-700 text-orange-400 text-[10px] font-bold rounded-md border border-orange-500/50 flex items-center gap-0.5 transition-colors">Refine</button>
                    <button onClick={handleEditImage} disabled={!refineInput.trim() || !selectedImage || cut.imageLoading}
                        className="px-2 py-1.5 bg-teal-900/30 hover:bg-teal-800/40 disabled:bg-zinc-700 text-teal-400 text-[10px] font-bold rounded-md border border-teal-600/40 flex items-center gap-0.5 transition-colors">Edit</button>
                </div>
            </div>

            {availableImages.length > 1 && (
                 <div className="mt-1 pt-3 border-t border-zinc-800/50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Versions ({availableImages.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {availableImages.map(image => {
                            const tag = image.tag || (image.engine === 'imagen-rough' ? 'rough' : 'hq');
                            const modelShort = image.model ? image.model.replace('nano-', '') : '';
                            const badgeLabel = tag === 'rough' ? '러프' : tag === 'normal' ? '일반' : 'HQ';
                            const badgeText = modelShort ? `${badgeLabel}/${modelShort}` : badgeLabel;
                            const badgeCls = tag === 'rough' ? 'bg-zinc-600 text-zinc-300' : tag === 'normal' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white';
                            return (
                            <div key={image.id} className="relative">
                                <button 
                                    onClick={() => actions.handleSelectImageForCut(cut.cutNumber, image.id)} 
                                    className={`w-10 h-10 rounded-md overflow-hidden border transition-all duration-200 ${cut.selectedImageId === image.id ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-zinc-800 hover:border-zinc-600 opacity-60 hover:opacity-100'}`}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, image)}
                                >
                                    {image.imageUrl ? <img src={image.imageUrl} alt={`Version for ${cut.cutNumber}`} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-zinc-800" />}
                                </button>
                                <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[5px] font-bold px-1 rounded whitespace-nowrap ${badgeCls}`}>{badgeText}</span>
                            </div>
                            );
                        })}
                    </div>
                </div>
            )}
            
            <div className="mt-2">
                <div className="border-t border-zinc-800/50 pt-3 cursor-pointer group/details hover:bg-zinc-800/30 rounded-lg px-2 py-2 -mx-2 transition-colors" onClick={() => setIsDetailsExpanded(prev => !prev)}>
                    <div className="flex justify-between items-center">
                        <h5 className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest group-hover/details:text-indigo-400 transition-colors flex items-center gap-1.5">
                            <SparklesIcon className="w-3.5 h-3.5" /> Prompt Details
                        </h5>
                        <ChevronDownIcon className={`w-5 h-5 text-zinc-400 group-hover/details:text-indigo-400 transition-transform duration-300 ${isDetailsExpanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>

                <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isDetailsExpanded ? 'max-h-[2000px] pt-3' : 'max-h-0 pt-0'}`}>
                    <div className="flex flex-col gap-3">
                        <div className="relative">
                            <InfoField 
                                label="Image Prompt" 
                                value={cut.imagePrompt || ''} 
                                onUpdate={(val) => handleFieldUpdate('imagePrompt', val)}
                                className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-lg"
                                labelClassName="text-indigo-400 font-mono uppercase tracking-widest text-[10px]"
                            />
                            <button
                                onClick={() => setShowFullPromptModal(true)}
                                className="absolute top-2 right-2 px-2 py-1 text-[9px] font-mono bg-zinc-800 hover:bg-indigo-600 text-zinc-400 hover:text-white rounded border border-zinc-700 hover:border-indigo-500 transition-all"
                                title={`${state.selectedImageEngine === 'flux' ? 'Flux' : 'Gemini'} 최종 프롬프트 보기`}
                            >
                                🔍 FULL
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <InfoField label="Scene Description" value={cut.sceneDescription} onUpdate={(val) => handleFieldUpdate('sceneDescription', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-zinc-500" />
                            <InfoField label="Emotion & Expression" value={cut.characterEmotionAndExpression} onUpdate={(val) => handleFieldUpdate('characterEmotionAndExpression', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-zinc-500" />
                            <InfoField label="Pose" value={cut.characterPose} onUpdate={(val) => handleFieldUpdate('characterPose', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-zinc-500" />
                            <InfoField label="Outfit" value={cut.characterOutfit} onUpdate={(val) => handleFieldUpdate('characterOutfit', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-zinc-500" />
                            {cut.characterIdentityDNA && <InfoField label="Body DNA" value={cut.characterIdentityDNA} onUpdate={(val) => handleFieldUpdate('characterIdentityDNA', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-amber-600" />}
                            <InfoField label="Location" value={cut.locationDescription} onUpdate={(val) => handleFieldUpdate('locationDescription', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-zinc-500" />
                            <InfoField label="Notes" value={cut.otherNotes} onUpdate={(val) => handleFieldUpdate('otherNotes', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-zinc-500" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* 최종 프롬프트 확인 모달 */}
        {showFullPromptModal && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowFullPromptModal(false)}>
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
                        <h3 className="text-sm font-mono text-indigo-400 uppercase tracking-wider">🔍 Full Prompt — Cut {cut.cutNumber}</h3>
                        <button onClick={() => setShowFullPromptModal(false)} className="p-1 hover:bg-zinc-800 rounded transition-colors">
                            <XIcon className="w-5 h-5 text-zinc-400" />
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-1 p-5 space-y-4">
                        {state.selectedImageEngine === 'flux' ? (
                            /* ═══ Flux 프롬프트 ═══ */
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-mono text-teal-400 uppercase tracking-widest">Flux Prompt {/[가-힣]/.test(cut.sceneDescription || '') ? '(이미지대본 직통)' : '(buildFluxPromptSmart)'}</span>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            disabled={isFluxPromptLoading}
                                            onClick={async () => {
                                                setIsFluxPromptLoading(true);
                                                try {
                                                    const { buildFluxPromptSmart, translateImageScriptToFlux } = await import('../appFluxPromptEngine');
                                                    const pCtx: any = {
                                                        characterDescriptions: state.characterDescriptions || {},
                                                        locationVisualDNA: state.locationVisualDNA || {},
                                                        cinematographyPlan: state.cinematographyPlan,
                                                        artStyle: state.artStyle || 'normal',
                                                        imageRatio: state.imageRatio || '9:16',
                                                        styleLoraId: state.styleLoraId,
                                                        fluxModel: state.selectedFluxModel,
                                                    };

                                                    // 이미지대본 직통 번역 경로
                                                    let result = '';
                                                    const sceneDesc = cut.sceneDescription || '';
                                                    const hasKorean = /[가-힣]/.test(sceneDesc);
                                                    if (hasKorean && sceneDesc.length > 10) {
                                                        const charDescs = state.characterDescriptions || {};
                                                        const charList = cut.characters.map((name: string) => {
                                                            const key = Object.keys(charDescs).find(k => { const cd = charDescs[k]; return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name; });
                                                            const char = key ? charDescs[key] : null;
                                                            const loraEntry = (pCtx.fluxModel === 'flux-lora' && char?.loraId)
                                                                ? (pCtx.loraRegistry || []).find((e: any) => e.id === char.loraId) : null;
                                                            return { koreanName: name, triggerWord: loraEntry?.triggerWord, appearance: char?.baseAppearance };
                                                        });
                                                        result = await translateImageScriptToFlux(sceneDesc, charList, pCtx.artStyle, {
                                                            styleLoraId: pCtx.styleLoraId, loraRegistry: pCtx.loraRegistry, fluxModel: pCtx.fluxModel,
                                                        });
                                                    }
                                                    // 폴백
                                                    if (!result) {
                                                        result = await buildFluxPromptSmart(cut, pCtx);
                                                    }
                                                    setFluxPromptCache(result);
                                                } catch (err: any) {
                                                    setFluxPromptCache(`에러: ${err.message || err}`);
                                                }
                                                setIsFluxPromptLoading(false);
                                            }}
                                            className="px-2 py-0.5 text-[9px] font-mono bg-teal-900/50 hover:bg-teal-600 text-teal-400 hover:text-white rounded border border-teal-700/50 transition-all disabled:opacity-50"
                                        >{isFluxPromptLoading ? '⏳ 생성중...' : '⚡ Flux 프롬프트 생성'}</button>
                                        {fluxPromptCache && (
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(fluxPromptCache); actions.addNotification('Flux Prompt 복사됨', 'success'); }}
                                                className="px-2 py-0.5 text-[9px] font-mono bg-zinc-800 hover:bg-teal-600 text-zinc-400 hover:text-white rounded border border-zinc-700 transition-all"
                                            >📋 Copy</button>
                                        )}
                                    </div>
                                </div>
                                {fluxPromptCache ? (
                                    <pre className="text-[11px] text-zinc-300 bg-zinc-950 border border-teal-800/30 rounded-lg p-4 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[50vh] overflow-y-auto">{fluxPromptCache}</pre>
                                ) : (
                                    <div className="text-[10px] text-zinc-500 font-mono bg-zinc-950 border border-zinc-800 rounded-lg p-4 leading-relaxed">
                                        「⚡ Flux 프롬프트 생성」을 클릭하면 Claude가 Gemini 프롬프트를 Flux 형식으로 변환합니다.
                                    </div>
                                )}
                                {/* Gemini 원본 (참고용, 접기) */}
                                <details className="mt-3">
                                    <summary className="text-[10px] font-mono text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors">📄 Gemini 원본 프롬프트 (참고용)</summary>
                                    <pre className="mt-2 text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-lg p-3 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[30vh] overflow-y-auto">{cut.imagePrompt || '(없음)'}</pre>
                                </details>
                            </div>
                        ) : (
                            /* ═══ Gemini 프롬프트 (기존) ═══ */
                            <>
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest">Scene Prompt (buildFinalPrompt)</span>
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(cut.imagePrompt || ''); actions.addNotification('Scene Prompt 복사됨', 'success'); }}
                                            className="px-2 py-0.5 text-[9px] font-mono bg-zinc-800 hover:bg-amber-600 text-zinc-400 hover:text-white rounded border border-zinc-700 transition-all"
                                        >📋 Copy</button>
                                    </div>
                                    <pre className="text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-4 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[40vh] overflow-y-auto">{cut.imagePrompt || '(없음)'}</pre>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-mono text-teal-400 uppercase tracking-widest">Art Style Prompt</span>
                                        <button
                                            onClick={() => {
                                                const activeStyle = cut.artStyleOverride || state.artStyle;
                                                const artPrompt = buildArtStylePrompt(activeStyle, state.customArtStyle || '');
                                                navigator.clipboard.writeText(artPrompt);
                                                actions.addNotification('Art Style Prompt 복사됨', 'success');
                                            }}
                                            className="px-2 py-0.5 text-[9px] font-mono bg-zinc-800 hover:bg-teal-600 text-zinc-400 hover:text-white rounded border border-zinc-700 transition-all"
                                        >📋 Copy</button>
                                    </div>
                                    <pre className="text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-4 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[30vh] overflow-y-auto">{(() => {
                                        const activeStyle = cut.artStyleOverride || state.artStyle;
                                        return buildArtStylePrompt(activeStyle, state.customArtStyle || '');
                                    })()}</pre>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-mono text-rose-400 uppercase tracking-widest">Combined → Gemini (Scene + Style)</span>
                                        <button
                                            onClick={() => {
                                                const activeStyle = cut.artStyleOverride || state.artStyle;
                                                const artPrompt = buildArtStylePrompt(activeStyle, state.customArtStyle || '');
                                                const combined = `${cut.imagePrompt || ''}\n\n---ART STYLE---\n${artPrompt}`;
                                                navigator.clipboard.writeText(combined);
                                                actions.addNotification('Combined Prompt 복사됨', 'success');
                                            }}
                                            className="px-2 py-0.5 text-[9px] font-mono bg-zinc-800 hover:bg-rose-600 text-zinc-400 hover:text-white rounded border border-zinc-700 transition-all"
                                        >📋 Copy All</button>
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-mono bg-zinc-950 border border-rose-500/20 rounded-lg p-4 leading-relaxed max-h-[20vh] overflow-y-auto">
                                        이 두 프롬프트가 Gemini API에 전달됩니다. Scene Prompt는 editPrompt/prompt로, Art Style은 artStylePrompt로 분리 전송.
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* 에셋 태그 선택 팝업 */}
        {showAssetTagPopup && selectedImage && (
            <AssetTagPopup
                defaultName={cut.location || `컷${cut.cutNumber}`}
                onCancel={() => setShowAssetTagPopup(false)}
                onSave={async (type, name, extraTypes) => {
                    try {
                        await saveAsset(type, `${name}.png`, selectedImage.imageUrl, {
                            name,
                            tags: { character: type === 'character' ? name : null, artStyle: state.artStyle, location: cut.location || null, description: cut.locationDescription || '', extraTypes: extraTypes?.join(',') || null },
                            prompt: cut.imagePrompt || '',
                        } as any);
                        const typeLabel = [type, ...(extraTypes || [])].map(t => t === 'character' ? '인물' : t === 'outfit' ? '의상' : '배경').join('+');
                        actions.addNotification(`"${name}" ${typeLabel} 에셋 저장!`, 'success');
                    } catch (err: any) { actions.addNotification(`에셋 저장 실패: ${err.message || err}`, 'error'); }
                    setShowAssetTagPopup(false);
                }}
            />
        )}
        {isAssetPickerOpen && (
            <AssetCatalogModal
                isOpen={isAssetPickerOpen}
                onClose={() => setIsAssetPickerOpen(false)}
                currentArtStyle={state.artStyle}
                onSelectCharacter={async (asset: AssetCatalogEntry) => {
                    try { const url = await resolveImageUrl(asset.imagePath); setReferenceImageUrls(prev => [...prev, url]); } catch { actions.addNotification('에셋 이미지를 불러올 수 없습니다.', 'error'); }
                }}
                onSelectBackground={async (asset: AssetCatalogEntry) => {
                    try { const url = await resolveImageUrl(asset.imagePath); setReferenceImageUrls(prev => [...prev, url]); } catch { actions.addNotification('에셋 이미지를 불러올 수 없습니다.', 'error'); }
                }}
            />
        )}
        </>
    );
};

export const SceneContainer: React.FC<SceneContainerProps> = ({ scene }) => {
    return (
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-zinc-100 tracking-tight">
                    <span className="text-indigo-500 mr-2 font-mono">SCENE {scene.sceneNumber}</span>
                    {scene.title}
                </h3>
            </div>
            <div className="space-y-6">
                {(scene.cuts || []).filter(Boolean).map((cut) => (
                    <CutCard key={cut.cutNumber} cut={cut} scene={scene} />
                ))}
            </div>
        </div>
    );
};
