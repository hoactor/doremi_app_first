
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Cut, Scene, GeneratedImage, ArtStyle } from '../types';
import { SparklesIcon, CheckIcon, SpeakerWaveIcon, TrashIcon, VideoCameraIcon, PhotoIcon, ChevronDownIcon, XIcon, PencilIcon, ScissorsIcon, UploadIcon, SpinnerIcon, RefreshIcon, UserIcon, PlusIcon, PaintBrushIcon } from './icons';
import { useAppContext } from '../AppContext';

interface CutCardProps {
  cut: Cut;
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
      <label className={`text-xs font-semibold ${labelClassName || 'text-stone-400'}`}>{label}</label>
      <div className="relative mt-1">
        <textarea
            value={localValue}
            onChange={handleChange}
            rows={label === '장면 설명' || label === '최종 이미지 프롬프트' ? 4 : 2}
            className={`w-full p-3 pr-10 text-sm rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-orange-500 bg-stone-900/50 border ${hasChanged ? 'border-orange-500 ring-1 ring-orange-500/50' : 'border-stone-700'}`}
        />
        <button 
            onClick={handleUpdate} 
            className={`absolute bottom-2 right-2 p-1.5 rounded-md transition-all duration-200 group ${hasChanged ? 'bg-orange-600 text-white hover:bg-orange-500 hover:scale-110 shadow-lg' : 'text-stone-400 hover:text-white bg-stone-700/50 hover:bg-stone-600'}`} 
            title={hasChanged ? "변경 사항을 반영하여 장면 다시 쓰기" : "내용 동기화/재생성"}
        >
          {hasChanged ? <CheckIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

const CutCard: React.FC<CutCardProps> = ({ cut }) => {
    const { state, actions } = useAppContext();
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

    // Guest Character Handlers
    const handleGuestNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        actions.handleUpdateCut(cut.cutNumber, { guestCharacterName: e.target.value });
    };

    const handleRemoveGuest = () => {
        actions.handleUpdateCut(cut.cutNumber, { guestCharacterUrl: null, guestCharacterName: null });
    };

    // Art Style Override Handler
    const handleArtStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value === 'default' ? undefined : e.target.value as ArtStyle;
        actions.handleUpdateCutArtStyle(cut.cutNumber, value);
    };

    return (
        <div id={`cut-${cut.cutNumber}`} className="relative bg-stone-900/80 rounded-xl shadow-lg border p-4 flex flex-col gap-3 border-stone-800 transition-all duration-300 hover:border-orange-500/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-0.5 group/card">
            {cut.isUpdatingIntent && (
                <div className="absolute inset-0 bg-stone-900/80 flex flex-col items-center justify-center z-20 rounded-xl backdrop-blur-sm">
                    <SpinnerIcon className="w-8 h-8 text-orange-400" />
                    <p className="mt-2 text-sm font-mono text-stone-300">Applying Intent...</p>
                </div>
            )}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${selectedImage ? 'bg-amber-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-stone-700'}`} title={selectedImage ? "이미지 있음" : "이미지 없음"} />
                        <h4 className="font-mono font-bold text-lg text-orange-400 tracking-tight">CUT {cut.cutNumber}</h4>
                        <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-1">
                            <button onClick={() => actions.handlePrepareStudioForCut(cut.cutNumber, cut.sceneDescription)} className="p-1.5 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-md transition-all duration-200" title="이 컷을 스튜디오에서 작업">
                                <VideoCameraIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => actions.handleAutoGenerateImageForCut(cut)} className="p-1.5 text-amber-400 hover:text-white bg-amber-900/30 hover:bg-amber-600 rounded-md transition-all duration-200" title="컷 자동 생성 (AI)">
                                <SparklesIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => actions.handleOpenCutSplitter(cut)} disabled={!canSplitCut} className="p-1.5 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-md transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed" title={canSplitCut ? "컷 분할 편집기 (오디오, 텍스트)" : "컷을 분할하려면 나레이션과 단일 오디오 파일이 필요합니다."}>
                                <ScissorsIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 py-1 bg-stone-950/50 p-2 rounded-lg border border-stone-800/50">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest flex items-center gap-1">
                            <UserIcon className="w-3 h-3"/> Cast
                        </span>
                        {/* Dynamic Character Toggles */}
                        <div className="flex flex-wrap gap-2">
                            {Object.values(state.characterDescriptions).map((char, index) => {
                                const colors = ['text-orange-400', 'text-amber-400', 'text-amber-400', 'text-amber-400', 'text-amber-400'];
                                const bgColors = ['bg-orange-500/10', 'bg-amber-500/10', 'bg-amber-500/10', 'bg-amber-500/10', 'bg-amber-500/10'];
                                const borderColors = ['border-orange-500/20', 'border-amber-500/20', 'border-amber-500/20', 'border-amber-500/20', 'border-amber-500/20'];
                                const colorIndex = index % colors.length;
                                const isSelected = (cut.characters || []).includes(char.koreanName);
                                
                                return (
                                    <label key={char.koreanName} className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-md border text-xs font-medium transition-all ${isSelected ? `${bgColors[colorIndex]} ${borderColors[colorIndex]} ${colors[colorIndex]}` : 'bg-stone-900 border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>
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
                    
                    <div className="h-4 w-px bg-stone-800 mx-1 hidden sm:block"></div>

                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest flex items-center gap-1">
                            <PaintBrushIcon className="w-3 h-3"/> Style
                        </span>
                        <select 
                            value={cut.artStyleOverride || 'default'} 
                            onChange={handleArtStyleChange}
                            className={`text-xs rounded border border-stone-800 py-1 pl-2 pr-6 cursor-pointer focus:ring-1 focus:ring-orange-500 transition-colors ${cut.artStyleOverride ? 'bg-orange-900/30 text-orange-300 font-medium border-orange-500/30' : 'bg-stone-900 text-stone-400 hover:bg-stone-800'}`}
                        >
                            <option value="default">Default</option>
                            <option value="normal">정통 썰툰</option>
                            <option value="vibrant">도파민 로맨스</option>
                            <option value="kyoto">감성 작화 (KyoAni)</option>
                            <option value="moe">SD/개그 (Shorts)</option>
                            <option value="dalle-chibi">프리미엄 치비</option>
                        </select>
                    </div>
                </div>

                <div className="relative mt-3">
                    <textarea 
                        value={editedNarration}
                        onChange={handleNarrationChange}
                        onBlur={handleNarrationBlur}
                        rows={3}
                        className="w-full text-base font-medium text-stone-100 bg-stone-950 p-3 rounded-lg border border-stone-800 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-all resize-y whitespace-pre-wrap leading-relaxed shadow-inner"
                        placeholder="나레이션 입력..."
                    />
                    {cut.isFormattingNarration && (
                        <div className="absolute inset-0 bg-stone-950/50 flex items-center justify-center rounded-lg pointer-events-none backdrop-blur-sm">
                            <SpinnerIcon className="w-5 h-5 text-orange-400" />
                        </div>
                    )}
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="w-full sm:w-40 flex-shrink-0">
                    <input type="file" ref={imageUploadInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) actions.handleUploadImageForCut(cut.cutNumber, file); }} accept="image/*" className="hidden" />
                    <div className="mt-1 w-full aspect-square bg-stone-950 rounded-lg flex items-center justify-center relative group border border-stone-800 overflow-hidden" onDragEnter={handleImageDragEnter} onDragLeave={handleImageDragLeave} onDragOver={handleImageDragOver} onDrop={handleImageDrop}>
                       {selectedImage ? (
                            <>
                                <img 
                                    src={selectedImage.imageUrl} 
                                    alt={`Selected for ${cut.cutNumber}`} 
                                    className="w-full h-full object-cover cursor-grab" 
                                    onClick={() => actions.handleOpenImageViewer(selectedImage.imageUrl, `Selected image for ${cut.cutNumber}`)}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, selectedImage)}
                                />
                                <button onClick={() => actions.handleSelectImageForCut(cut.cutNumber, null)} className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm" title="대표 이미지 선택 해제"><XIcon className="w-3 h-3" /></button>
                            </>
                        ) : (
                            <div className="text-center text-stone-600 cursor-pointer hover:text-stone-400 transition-colors" onClick={() => imageUploadInputRef.current?.click()}>
                                <PhotoIcon className="w-8 h-8 mx-auto mb-1 opacity-50"/>
                                <p className="text-[10px] font-mono uppercase tracking-wider">Drop Image</p>
                            </div>
                        )}
                        {isDraggingOverImage && (
                            <div className="absolute inset-0 bg-orange-500/20 border-2 border-dashed border-orange-400 flex flex-col items-center justify-center pointer-events-none z-10 backdrop-blur-sm">
                                <UploadIcon className="w-6 h-6 text-orange-300 mb-1" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col gap-3 w-full">
                    {/* Audio Box */}
                    <div className="relative w-full flex flex-col gap-1" onDragEnter={handleAudioDragEnter} onDragLeave={handleAudioDragLeave} onDragOver={handleAudioDragOver} onDrop={handleAudioDrop}>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest">Audio</span>
                            <button onClick={handleAudioAttachClick} className="text-[10px] font-mono text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors">
                                <PlusIcon className="w-3 h-3" /> Add
                            </button>
                            <input type="file" ref={audioInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" />
                        </div>
                        <div className="bg-stone-950 rounded-lg p-2 border border-stone-800 min-h-[40px] flex flex-col justify-center">
                            {(!cut.audioDataUrls || cut.audioDataUrls.length === 0) ? (
                                <div className="text-center text-[10px] font-mono text-stone-600">No audio attached</div>
                            ) : (
                                <div className="space-y-1.5">
                                    {(cut.audioDataUrls || []).map((url, index) => (
                                        <div key={`audio-${cut.cutNumber}-${index}`} className="flex items-center gap-2 bg-stone-900 p-1 rounded-md border border-stone-800/50">
                                            <audio controls src={url} className="w-full h-6 rounded"></audio>
                                            <button onClick={() => actions.handleRemoveAudioFromCut(cut.cutNumber, index)} className="p-1 text-stone-500 hover:text-red-400 hover:bg-stone-800 rounded transition-colors flex-shrink-0" title="음성 제거"><TrashIcon className="w-3 h-3" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {isDraggingOverAudio && (
                            <div className="absolute inset-0 bg-orange-500/20 border-2 border-dashed border-orange-400 rounded-lg flex flex-col items-center justify-center pointer-events-none z-10 backdrop-blur-sm">
                                <SpeakerWaveIcon className="w-6 h-6 text-orange-300" />
                            </div>
                        )}
                    </div>

                    {/* Guest UI */}
                    <div className="w-full">
                        <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest mb-1 block">Guest</span>
                        {cut.guestCharacterUrl ? (
                            <div className="flex items-center gap-2 bg-stone-950 p-1.5 rounded-lg border border-stone-800">
                                <img src={cut.guestCharacterUrl} alt="Guest" className="w-6 h-6 rounded-md object-cover border border-stone-700"/>
                                <input 
                                    type="text" 
                                    value={cut.guestCharacterName || ''} 
                                    onChange={handleGuestNameChange}
                                    className="bg-transparent border-none text-xs text-stone-300 focus:ring-0 w-full p-0 placeholder-stone-600 font-medium"
                                    placeholder="Guest Name"
                                />
                                <button onClick={handleRemoveGuest} className="text-stone-500 hover:text-red-400 p-1 hover:bg-stone-900 rounded transition-colors"><XIcon className="w-3 h-3" /></button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => actions.handleOpenGuestSelection(cut.cutNumber)}
                                className="w-full py-1.5 border border-dashed border-stone-700 rounded-lg text-[10px] font-mono text-stone-500 hover:border-orange-500/50 hover:text-orange-400 flex items-center justify-center gap-1 transition-colors hover:bg-orange-500/5"
                            >
                                <PlusIcon className="w-3 h-3" />
                                <span>Add Guest</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {availableImages.length > 1 && (
                 <div className="mt-1 pt-3 border-t border-stone-800/50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest">Versions ({availableImages.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {availableImages.map(image => (
                            <button 
                                key={image.id} 
                                onClick={() => actions.handleSelectImageForCut(cut.cutNumber, image.id)} 
                                className={`w-10 h-10 rounded-md overflow-hidden border transition-all duration-200 ${cut.selectedImageId === image.id ? 'border-orange-500 ring-1 ring-orange-500/50' : 'border-stone-800 hover:border-stone-600 opacity-60 hover:opacity-100'}`}
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, image)}
                            >
                                <img src={image.imageUrl} alt={`Version for ${cut.cutNumber}`} className="w-full h-full object-cover"/>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="mt-2">
                <div className="border-t border-stone-800/50 pt-3 cursor-pointer group/details" onClick={() => setIsDetailsExpanded(prev => !prev)}>
                    <div className="flex justify-between items-center">
                        <h5 className="text-[10px] font-mono text-stone-500 uppercase tracking-widest group-hover/details:text-orange-400 transition-colors flex items-center gap-1">
                            <SparklesIcon className="w-3 h-3" /> Prompt Details
                        </h5>
                        <ChevronDownIcon className={`w-4 h-4 text-stone-600 transition-transform duration-300 ${isDetailsExpanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>

                <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isDetailsExpanded ? 'max-h-[2000px] pt-3' : 'max-h-0 pt-0'}`}>
                    <div className="flex flex-col gap-3">
                        <InfoField 
                            label="Image Prompt" 
                            value={cut.imagePrompt || ''} 
                            onUpdate={(val) => handleFieldUpdate('imagePrompt', val)}
                            className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg"
                            labelClassName="text-orange-400 font-mono uppercase tracking-widest text-[10px]"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <InfoField label="Scene Description" value={cut.sceneDescription} onUpdate={(val) => handleFieldUpdate('sceneDescription', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-stone-500" />
                            <InfoField label="Emotion & Expression" value={cut.characterEmotionAndExpression} onUpdate={(val) => handleFieldUpdate('characterEmotionAndExpression', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-stone-500" />
                            <InfoField label="Pose" value={cut.characterPose} onUpdate={(val) => handleFieldUpdate('characterPose', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-stone-500" />
                            <InfoField label="Outfit" value={cut.characterOutfit} onUpdate={(val) => handleFieldUpdate('characterOutfit', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-stone-500" />
                            <InfoField label="Location" value={cut.locationDescription} onUpdate={(val) => handleFieldUpdate('locationDescription', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-stone-500" />
                            <InfoField label="Notes" value={cut.otherNotes} onUpdate={(val) => handleFieldUpdate('otherNotes', val)} labelClassName="font-mono uppercase tracking-widest text-[10px] text-stone-500" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SceneContainer: React.FC<SceneContainerProps> = ({ scene }) => {
    return (
        <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-stone-100 tracking-tight">
                    <span className="text-orange-500 mr-2 font-mono">SCENE {scene.sceneNumber}</span>
                    {scene.title}
                </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(scene.cuts || []).filter(Boolean).map((cut) => (
                    <CutCard key={cut.cutNumber} cut={cut} />
                ))}
            </div>
        </div>
    );
};
