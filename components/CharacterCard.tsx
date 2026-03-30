
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import { CharacterDescription } from '../types';
import { XIcon, UploadIcon, SpinnerIcon, TrashIcon, SparklesIcon, PhotoIcon, UndoIcon, CheckIcon, ChevronRightIcon, UsersIcon, RefreshIcon, ScissorsIcon, ArrowLeftIcon, ArrowRightIcon, ClipboardIcon, DocumentDuplicateIcon } from './icons';

// --- PROPS ---
interface CharacterSheetStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterDescriptions: { [key: string]: CharacterDescription };
  onUpdateCharacterDescription: (key: string, data: Partial<CharacterDescription>) => void;
  
  // New step handlers
  onUploadSourceImage: (characterKey: string, file: File) => void;
  onUploadUpscaledImage: (characterKey: string, file: File) => void; // NEW: Added prop
  onUpscaleImage: (characterKey: string) => Promise<void>;
  onInjectPersonality: (characterKey: string) => Promise<void>;
  handleEditSignaturePose: (characterKey: string, prompt: string) => Promise<void>;
  handleUndoSignaturePoseEdit: (characterKey: string) => void;
  handleEditMannequin: (characterKey: string, prompt: string) => Promise<void>;
  handleUndoMannequin: (characterKey: string) => void;

  // Outfit design handlers (from old modal)
  onGenerateLocationOutfits: (characterKey: string) => Promise<void>;
  onGenerateOutfitImage: (characterKey: string, location: string, outfitDescription: string) => Promise<void>;
  onTryOnOutfit: (characterKey: string, outfitDescription: string, outfitEnglishDescription: string) => Promise<void>;
  onModifyOutfitDescription: (characterKey: string, location: string, request: string) => Promise<void>;
  
  onConfirm: () => void;
  onOpenImageViewer: (url: string, alt: string) => void;
}

type StudioStep = 'uploadAndUpscale' | 'createSignaturePose' | 'designOutfits';

const StepIndicator: React.FC<{ currentStep: StudioStep, step: StudioStep, title: string, description: string }> = ({ currentStep, step, title, description }) => {
    const isCompleted = 
        (step === 'uploadAndUpscale' && (currentStep === 'createSignaturePose' || currentStep === 'designOutfits')) ||
        (step === 'createSignaturePose' && currentStep === 'designOutfits');
    const isActive = currentStep === step;

    return (
        <div className={`p-4 rounded-lg transition-all duration-300 ${isActive ? 'bg-orange-900/50 border border-orange-700' : isCompleted ? 'bg-stone-800/50' : 'bg-stone-800/50 opacity-50'}`}>
            <h3 className={`font-bold flex items-center gap-2 ${isActive ? 'text-orange-400' : isCompleted ? 'text-green-400' : 'text-stone-400'}`}>
                {isCompleted ? <CheckIcon className="w-5 h-5"/> : <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-orange-500' : 'bg-stone-600'}`}>{step === 'uploadAndUpscale' ? 1 : step === 'createSignaturePose' ? 2 : 3}</div>}
                {title}
            </h3>
            {isActive && <p className="text-sm text-stone-400 mt-1 ml-7">{description}</p>}
        </div>
    );
};

const ImageUploadCard: React.FC<{
    char: CharacterDescription;
    onImageUpload: (file: File) => void;
}> = ({ char, onImageUpload }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onImageUpload(file);
    };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) onImageUpload(file);
    };

    return (
        <div 
            className="w-full h-72 bg-stone-800 rounded-lg border-2 border-dashed border-stone-600 flex flex-col items-center justify-center text-center p-2 relative cursor-pointer hover:border-orange-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={handleDrop}
        >
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            {char.imageLoading ? <SpinnerIcon className="w-10 h-10 text-orange-400" /> :
             char.sourceImageUrl ? (
                 <>
                    <img src={char.sourceImageUrl} alt="Source" className="w-full h-full object-contain rounded-md" />
                    {char.isAnalyzingHair && (
                        <div className="absolute inset-0 bg-black/60 rounded-md flex flex-col items-center justify-center">
                            <SpinnerIcon className="w-8 h-8 text-orange-400" />
                            <p className="text-xs text-orange-300 mt-2 font-bold animate-pulse">비주얼 DNA 분석 중...</p>
                        </div>
                    )}
                 </>
             ) :
             (<>
                <UploadIcon className="w-10 h-10 text-stone-500 mb-2" />
                <p className="font-semibold text-stone-400 text-sm">{char.koreanName} 원본 이미지</p>
                <p className="text-xs text-stone-500">클릭 또는 드래그 & 드롭</p>
             </>)}
        </div>
    );
};

// Re-using the OutfitCard from the old component since its logic is self-contained
const OutfitCard: React.FC<{
    char: CharacterDescription;
    location: string;
    outfitDescription: string;
    onDescriptionChange: (newDesc: string) => void;
    onGeneratePreview: () => void;
    onTryOn: () => void;
    onModify: (request: string) => void;
    onOpenImageViewer: (url: string, alt: string) => void;
}> = ({ char, location, outfitDescription, onDescriptionChange, onGeneratePreview, onTryOn, onModify, onOpenImageViewer }) => {
    const [modifyRequest, setModifyRequest] = useState('');
    const preview = char.locationOutfitImages?.[location];
    const isModifying = char.isRequestingOutfitModification?.[location] ?? false;

    const handleModifyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!isModifying && modifyRequest.trim()) {
                onModify(modifyRequest);
            }
        }
    };

    return (
        <div className="p-3 bg-stone-800/50 rounded-lg border border-stone-700 flex gap-4">
            <div className="flex-grow">
                <div className="flex justify-between items-center mb-1">
                    <p className="font-bold text-orange-400 text-sm">{location}</p>
                </div>
                {char.outfitPresets && char.outfitPresets.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {char.outfitPresets.map((preset, idx) => (
                            <button
                                key={idx}
                                onClick={() => onDescriptionChange(preset.description)}
                                className="px-2 py-1 text-[10px] font-medium bg-orange-900/40 hover:bg-orange-800/60 text-orange-300 border border-orange-800/50 rounded-md transition-colors"
                                title={preset.description}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>
                )}
                <textarea
                    value={outfitDescription}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    rows={4}
                    className="w-full mt-1 p-2 bg-stone-900/50 rounded-md border border-stone-700 text-xs text-stone-300 focus:ring-1 focus:ring-orange-500 font-mono"
                    placeholder="English description only (This will be the actual prompt)"
                />
                <div className="mt-1.5 p-1.5 bg-stone-900/50 rounded-md border border-stone-700 flex items-center gap-2">
                    <input
                        type="text"
                        value={modifyRequest}
                        onChange={(e) => setModifyRequest(e.target.value)}
                        onKeyDown={handleModifyKeyDown}
                        placeholder="AI에게 의상 수정 요청 (예: Make it more casual)"
                        className="flex-grow bg-transparent text-[11px] focus:outline-none"
                    />
                    <button
                        onClick={() => { if (modifyRequest.trim()) onModify(modifyRequest); }}
                        disabled={isModifying || !modifyRequest}
                        className="px-2 py-1 text-[10px] font-semibold rounded-md bg-stone-600 hover:bg-stone-500 disabled:opacity-50"
                    >
                        {isModifying ? <SpinnerIcon className="w-3 h-3"/> : "요청"}
                    </button>
                </div>
            </div>
            <div className="flex-shrink-0 w-44 flex flex-col gap-2">
                <div className="w-full h-28 bg-stone-800 rounded-md flex items-center justify-center border border-stone-700 relative">
                    {preview?.imageLoading && <SpinnerIcon className="w-6 h-6 text-orange-400 absolute z-10" />}
                    
                    {preview?.imageUrl ? (
                        <div className="relative group w-full h-full">
                            <img 
                                src={preview.imageUrl} 
                                alt={`${location} 의상 미리보기`} 
                                className="w-full h-full object-cover rounded-md cursor-pointer"
                                onClick={() => onOpenImageViewer(preview.imageUrl!, `${location} 의상`)}
                            />
                             <div className={`absolute inset-0 bg-black/60 transition-opacity flex items-center justify-center rounded-md ${preview.imageLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <button
                                    onClick={onGeneratePreview}
                                    disabled={preview.imageLoading}
                                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md text-white transition-colors ${preview.imageLoading ? 'bg-orange-500 cursor-wait' : 'bg-orange-600 hover:bg-orange-700'}`}
                                >
                                    {preview.imageLoading ? <SpinnerIcon className="w-4 h-4"/> : <RefreshIcon className="w-4 h-4"/>}
                                    {preview.imageLoading ? '생성 중...' : '재생성'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        !preview?.imageLoading && (
                            <button onClick={onGeneratePreview} className="flex flex-col items-center text-stone-500 hover:text-orange-400">
                                <PhotoIcon className="w-5 h-5 mb-1"/>
                                <span className="text-[10px] font-semibold">미리보기 생성</span>
                            </button>
                        )
                    )}
                </div>
                <button onClick={onTryOn} disabled={char.isApplyingCostume || !char.characterSheetHistory || char.characterSheetHistory.length === 0} className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">
                    <SparklesIcon className="w-3.5 h-3.5" /> 입혀보기
                </button>
            </div>
        </div>
    );
};


export const CostumeStudioModal: React.FC<CharacterSheetStudioModalProps> = (props) => {
    const { state: { appState } } = useAppContext();
    const { isOpen, onClose, characterDescriptions, onConfirm, onUploadSourceImage, onUploadUpscaledImage, onUpscaleImage, onInjectPersonality, handleEditSignaturePose, handleUndoSignaturePoseEdit, handleEditMannequin, handleUndoMannequin, onGenerateLocationOutfits, onUpdateCharacterDescription, onGenerateOutfitImage, onTryOnOutfit, onModifyOutfitDescription, onOpenImageViewer } = props;
    const [studioStep, setStudioStep] = useState<StudioStep>('uploadAndUpscale');
    const [editPrompts, setEditPrompts] = useState<{ [key: string]: string }>({});
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyText, setCopyText] = useState('');
    
    const characterKeys = Object.keys(characterDescriptions);

    // Refs for manual upload inputs for upscaled images
    const upscaledInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

    useEffect(() => {
        if (isOpen) {
            // This logic determines the starting step ONLY when the modal opens.
            // It allows users to resume their work if they close and reopen the modal.
            
            const allHaveSheet = characterKeys.length > 0 && characterKeys.every(k => {
                const char = characterDescriptions[k];
                return char.characterSheetHistory && char.characterSheetHistory.length > 0;
            });

            const allHaveUpscaled = characterKeys.length > 0 && characterKeys.every(k => {
                const char = characterDescriptions[k];
                return char.upscaledImageUrl;
            });

            if (allHaveSheet) {
                // If user has completed step 2 before and is reopening the modal.
                setStudioStep('designOutfits');
            } else if (allHaveUpscaled) {
                // If user has completed step 1 before.
                setStudioStep('createSignaturePose');
            } else {
                // Default starting point for a new session or after script analysis.
                setStudioStep('uploadAndUpscale');
            }
        }
    }, [isOpen]);

    // New handler for Cmd/Ctrl + Enter shortcut in signature pose editing
    const handleSignaturePoseKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, key: string) => {
        const char = characterDescriptions[key];
        const prompt = editPrompts[key] || '';
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (studioStep === 'createSignaturePose') {
                if (!char.isEditingSheet && prompt.trim()) {
                    handleEditSignaturePose(key, prompt);
                }
            } else if (studioStep === 'designOutfits') {
                if (!char.isApplyingCostume && prompt.trim()) {
                    handleEditMannequin(key, prompt);
                }
            }
        }
    };

    // Handler for dropping files onto the upscaled slot
    const handleUpscaledDrop = (e: React.DragEvent<HTMLDivElement>, key: string) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            onUploadUpscaledImage(key, file);
        }
    };

    const handleGoBack = () => {
        if (studioStep === 'designOutfits') setStudioStep('createSignaturePose');
        else if (studioStep === 'createSignaturePose') setStudioStep('uploadAndUpscale');
    };

    const handleCopyOutfits = async () => {
        const outfitData = characterKeys.reduce((acc, key) => {
            const char = characterDescriptions[key];
            if (char.locations) {
                acc[char.koreanName] = char.locations;
            }
            return acc;
        }, {} as Record<string, any>);
        
        const textToCopy = JSON.stringify(outfitData, null, 2);

        try {
            await navigator.clipboard.writeText(textToCopy);
            alert('의상 데이터가 클립보드에 복사되었습니다. 다른 창에서 붙여넣기 하세요.');
        } catch (err) {
            console.warn('Failed to copy outfits automatically, showing manual copy modal', err);
            setCopyText(textToCopy);
            setShowCopyModal(true);
        }
    };

    const processPasteText = (text: string) => {
        try {
            const outfitData = JSON.parse(text);
            
            let updatedCount = 0;
            characterKeys.forEach(key => {
                const char = characterDescriptions[key];
                if (outfitData[char.koreanName]) {
                    const newPresets = Object.entries(outfitData[char.koreanName]).map(([name, description]) => ({
                        name,
                        description: description as string
                    }));
                    
                    // Merge with existing presets or replace
                    const existingPresets = char.outfitPresets || [];
                    const mergedPresets = [...existingPresets];
                    
                    newPresets.forEach(newPreset => {
                        const existingIndex = mergedPresets.findIndex(p => p.name === newPreset.name);
                        if (existingIndex >= 0) {
                            mergedPresets[existingIndex] = newPreset;
                        } else {
                            mergedPresets.push(newPreset);
                        }
                    });

                    onUpdateCharacterDescription(key, { 
                        outfitPresets: mergedPresets
                    });
                    updatedCount++;
                }
            });
            
            if (updatedCount > 0) {
                alert(`${updatedCount}명의 캐릭터 의상 데이터가 '옷장 프리셋'으로 성공적으로 붙여넣기 되었습니다. 각 장면의 입력칸 위에서 프리셋을 선택할 수 있습니다.`);
                setShowPasteModal(false);
            } else {
                alert('붙여넣은 데이터와 일치하는 캐릭터 이름이 없습니다.');
            }
        } catch (err) {
            console.error('Failed to paste outfits', err);
            alert('의상 데이터를 읽어오지 못했습니다. 올바른 형식인지 확인해주세요.');
        }
    };

    const handlePasteOutfits = async () => {
        try {
            const text = await navigator.clipboard.readText();
            processPasteText(text);
        } catch (err) {
            console.warn('Clipboard read failed, showing manual paste modal', err);
            setPasteText('');
            setShowPasteModal(true);
        }
    };

    if (!isOpen) return null;
    
    if (characterKeys.length === 0) return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"><div className="bg-stone-900 p-8 rounded-lg text-center"><p className="text-red-400">오류: 캐릭터 정보를 찾을 수 없습니다.</p><button onClick={onClose} className="mt-4 px-4 py-2 bg-orange-600 rounded-md">닫기</button></div></div>
    );

    const renderContent = () => {
        switch (studioStep) {
            case 'uploadAndUpscale':
                return (
                    <div className="flex-grow flex items-start justify-center gap-8 p-6 overflow-y-auto">
                        {characterKeys.map(key => {
                            const char = characterDescriptions[key];
                            
                            return (
                                <div key={key} className="flex-1 flex flex-col gap-4 items-center max-w-md">
                                    <h4 className="font-bold text-lg text-orange-400">{char.koreanName}</h4>
                                    <ImageUploadCard char={char} onImageUpload={(file) => onUploadSourceImage(key, file)} />
                                    
                                    {/* Visual DNA (Hairstyle) Input Section */}
                                    <div className="w-full bg-stone-800/80 p-3 rounded-lg border border-stone-700/50">
                                        <label className="flex items-center gap-2 text-xs font-bold text-orange-300 mb-1.5 uppercase tracking-wide">
                                            <ScissorsIcon className="w-3.5 h-3.5"/>
                                            헤어스타일 DNA (Hair Style)
                                        </label>
                                        <textarea 
                                            value={char.hairStyleDescription || ''}
                                            onChange={(e) => onUpdateCharacterDescription(key, { hairStyleDescription: e.target.value })}
                                            className="w-full p-2.5 bg-stone-900/80 rounded border border-stone-700 text-xs text-stone-200 focus:ring-1 focus:ring-orange-500 font-mono resize-none leading-relaxed"
                                            placeholder="AI 분석 결과가 여기에 표시됩니다. 원하는 스타일로 직접 수정하여 고정하세요. (예: Short black hair with side parting)"
                                            rows={2}
                                        />
                                        <p className="text-[10px] text-stone-500 mt-1.5 flex items-center gap-1">
                                            <CheckIcon className="w-3 h-3 text-green-500"/>
                                            이 설명은 모든 생성 과정에서 <b>절대적인 기준(Fixed)</b>으로 적용됩니다.
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => onUpscaleImage(key)}
                                        disabled={!char.sourceImageUrl || char.isUpscaling}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 transition-colors text-white disabled:opacity-50"
                                    >
                                        {char.isUpscaling ? <SpinnerIcon className="w-4 h-4"/> : <SparklesIcon className="w-4 h-4"/>}
                                        {char.isUpscaling ? '업스케일링 중...' : '이미지 업스케일링 (AI)'}
                                    </button>

                                    {/* Upscaled Image Drop Zone */}
                                    <div 
                                        className={`w-full h-72 bg-stone-800 rounded-lg border-2 flex flex-col items-center justify-center relative transition-colors ${char.upscaledImageUrl ? 'border-green-500/50' : 'border-stone-600 border-dashed cursor-pointer hover:border-orange-500'}`}
                                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onDrop={(e) => handleUpscaledDrop(e, key)}
                                        onClick={() => {
                                            // Allow clicking to upload manually if empty or if user wants to replace
                                            upscaledInputRefs.current[key]?.click();
                                        }}
                                        title="AI 업스케일링 결과가 여기에 표시됩니다. 또는 직접 고화질 이미지를 업로드할 수 있습니다."
                                    >
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            ref={(el) => { upscaledInputRefs.current[key] = el; }}
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) onUploadUpscaledImage(key, file);
                                            }} 
                                            className="hidden" 
                                        />
                                        
                                        {char.isUpscaling && <SpinnerIcon className="w-10 h-10 text-orange-400 absolute"/>}
                                        
                                        {char.upscaledImageUrl ? (
                                            <>
                                                <img src={char.upscaledImageUrl} alt="Upscaled" className="w-full h-full object-contain rounded-md" />
                                                {char.isAnalyzingHair && (
                                                    <div className="absolute inset-0 bg-black/60 rounded-md flex flex-col items-center justify-center">
                                                        <SpinnerIcon className="w-8 h-8 text-orange-400" />
                                                        <p className="text-xs text-orange-300 mt-2 font-bold animate-pulse">DNA 정밀 분석 중...</p>
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded-md pointer-events-none">
                                                    <UploadIcon className="w-8 h-8 text-white mb-2" />
                                                    <p className="text-white font-semibold text-sm">클릭하여 이미지 교체</p>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center p-4">
                                                <p className="text-stone-400 text-sm font-semibold mb-1">업스케일된 이미지</p>
                                                <p className="text-stone-500 text-xs">(또는 직접 업로드)</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            case 'createSignaturePose':
                 return (
                    <div className="flex-grow flex items-start justify-center gap-8 p-6 overflow-y-auto">
                        {characterKeys.map(key => {
                            const char = characterDescriptions[key];
                            const currentSheetUrl = char.characterSheetHistory?.[char.characterSheetHistory.length - 1];
                            return (
                                <div key={key} className="flex-1 flex flex-col gap-4 items-center">
                                    <h4 className="font-bold text-lg text-orange-400">{char.koreanName}</h4>
                                    <div className="w-full h-72 bg-stone-800 rounded-lg relative">
                                        {char.upscaledImageUrl && <img src={char.upscaledImageUrl} alt="Upscaled" className="w-full h-full object-contain rounded-md" />}
                                    </div>
                                    <button onClick={() => onInjectPersonality(key)} disabled={char.isInjectingPersonality || !char.upscaledImageUrl} className="w-full flex items-center justify-center gap-2 px-4 py-3 font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 transition-colors text-white disabled:opacity-50">
                                        {char.isInjectingPersonality ? <SpinnerIcon className="w-5 h-5"/> : <SparklesIcon className="w-5 h-5"/>}
                                        {char.isInjectingPersonality ? '생성 중...' : '시그니처 포즈 생성'}
                                    </button>
                                    <div className="w-full h-72 bg-stone-800 rounded-lg border-2 border-stone-600 flex items-center justify-center relative">
                                        {char.isInjectingPersonality && <SpinnerIcon className="w-10 h-10 text-orange-400 absolute"/>}
                                        {currentSheetUrl ? <img src={currentSheetUrl} alt="Signature Pose" className="w-full h-full object-contain rounded-md" /> : <p className="text-stone-500 text-sm">시그니처 포즈</p>}
                                    </div>
                                    {currentSheetUrl && (
                                        <div className="w-full space-y-2 p-3 bg-stone-900/50 rounded-lg border border-stone-700">
                                            <textarea
                                                value={editPrompts[key] || ''}
                                                onChange={(e) => setEditPrompts(prev => ({ ...prev, [key]: e.target.value }))}
                                                onKeyDown={(e) => handleSignaturePoseKeyDown(e, key)}
                                                rows={3}
                                                className="w-full p-2 text-sm bg-stone-800 rounded-md border border-stone-600 focus:ring-1 focus:ring-orange-500"
                                                placeholder="최종 수정을 위한 프롬프트 입력... (Cmd/Ctrl + Enter)"
                                                disabled={char.isEditingSheet}
                                            />
                                            <div className="flex gap-2">
                                                <button onClick={() => handleEditSignaturePose(key, editPrompts[key] || '')} disabled={char.isEditingSheet || !(editPrompts[key] || '').trim()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                                                    {char.isEditingSheet ? <SpinnerIcon className="w-4 h-4"/> : <SparklesIcon className="w-4 h-4"/>}
                                                    {char.isEditingSheet ? '수정 중...' : '수정'}
                                                </button>
                                                <button onClick={() => handleUndoSignaturePoseEdit(key)} disabled={char.isEditingSheet || (char.characterSheetHistory?.length ?? 0) <= 1} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md bg-stone-600 hover:bg-stone-700 text-white disabled:opacity-50">
                                                    <UndoIcon className="w-4 h-4"/>
                                                    되돌리기
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            case 'designOutfits':
                return (
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-y-auto h-full custom-scrollbar">
                         {characterKeys.map(key => {
                            const char = characterDescriptions[key];
                            const currentSheetUrl = char.characterSheetHistory?.[char.characterSheetHistory.length - 1];
                            const mannequinDisplayUrl = char.mannequinImageUrl || currentSheetUrl;
                            return (
                                <div key={key} className="flex-col flex">
                                    <div className="flex-shrink-0 bg-stone-800/50 p-4 rounded-xl border border-stone-700">
                                        <h3 className="text-lg font-bold text-center text-orange-400 mb-2">{char.koreanName}</h3>
                                        <div className="w-full h-72 bg-stone-800 rounded-lg relative">
                                            {(char.isApplyingCostume) && <div className="absolute inset-0 bg-stone-800/80 flex flex-col items-center justify-center z-10 rounded-lg"><SpinnerIcon className="w-10 h-10 text-orange-400" /><p className="mt-2 text-sm text-stone-300">의상 적용 중...</p></div>}
                                            {mannequinDisplayUrl && <img src={mannequinDisplayUrl} alt="Mannequin" className="w-full h-full object-contain rounded-md cursor-pointer" onClick={() => onOpenImageViewer(mannequinDisplayUrl, `${char.koreanName} 의상`)}/>}
                                        </div>
                                        
                                        {/* NEW: Step 3 Manual Edit Layout (Identical to Step 2) */}
                                        <div className="mt-3 space-y-2 p-3 bg-stone-900/50 rounded-lg border border-stone-700">
                                            <textarea
                                                value={editPrompts[key] || ''}
                                                onChange={(e) => setEditPrompts(prev => ({ ...prev, [key]: e.target.value }))}
                                                onKeyDown={(e) => handleSignaturePoseKeyDown(e, key)}
                                                rows={2}
                                                className="w-full p-2 text-sm bg-stone-800 rounded-md border border-stone-600 focus:ring-1 focus:ring-orange-500"
                                                placeholder="최종 캐릭터/의상 수정을 위한 프롬프트 입력..."
                                                disabled={char.isApplyingCostume}
                                            />
                                            <div className="flex gap-2">
                                                <button onClick={() => handleEditMannequin(key, editPrompts[key] || '')} disabled={char.isApplyingCostume || !(editPrompts[key] || '').trim()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                                                    {char.isApplyingCostume ? <SpinnerIcon className="w-4 h-4"/> : <SparklesIcon className="w-4 h-4"/>}
                                                    {char.isApplyingCostume ? '수정 중...' : '수정'}
                                                </button>
                                                <button onClick={() => handleUndoMannequin(key)} disabled={char.isApplyingCostume || !char.mannequinHistory || char.mannequinHistory.length === 0} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md bg-stone-600 hover:bg-stone-700 text-white disabled:opacity-50">
                                                    <UndoIcon className="w-4 h-4"/>
                                                    되돌리기
                                                </button>
                                            </div>
                                            {char.mannequinImageUrl && (
                                                <button onClick={() => onUpdateCharacterDescription(key, { mannequinImageUrl: null, mannequinHistory: [] })} className="w-full flex items-center justify-center gap-2 px-3 py-1 text-[10px] font-semibold text-stone-500 hover:text-stone-300 transition-colors">
                                                    <RefreshIcon className="w-3 h-3"/> 완전 초기화
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                     <div className="text-lg font-bold my-4 flex-shrink-0 text-white flex justify-between items-center">
                                         <span>{char.koreanName}의 장면별 의상</span>
                                         {key === characterKeys[0] && (
                                             <div className="flex gap-2">
                                                 <button onClick={handleCopyOutfits} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-md transition-colors border border-stone-700">
                                                     <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                                                     의상 복사
                                                 </button>
                                                 <button onClick={handlePasteOutfits} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-md transition-colors border border-stone-700">
                                                     <ClipboardIcon className="w-3.5 h-3.5" />
                                                     의상 붙여넣기
                                                 </button>
                                             </div>
                                         )}
                                     </div>
                                      <div className="space-y-4">
                                        {char.isGeneratingLocationOutfits ? <div className="flex flex-col items-center justify-center text-center p-4 rounded-lg bg-stone-900/50"><SpinnerIcon className="w-8 h-8 text-orange-400" /><p className="mt-2 text-sm text-stone-400">장면별 의상을 생성하고 있습니다...</p></div> : 
                                        Object.keys(char.locations || {}).length > 0 ? (
                                            Object.entries(char.locations).map(([location, outfitDesc]) => (
                                                <OutfitCard 
                                                    key={`${key}-${location}`} 
                                                    char={char} 
                                                    location={location} 
                                                    outfitDescription={outfitDesc} 
                                                    onDescriptionChange={(newDesc) => onUpdateCharacterDescription(key, { locations: {...char.locations, [location]: newDesc }, koreanLocations: {...char.koreanLocations, [location]: newDesc }})}
                                                    onGeneratePreview={() => onGenerateOutfitImage(key, location, outfitDesc)}
                                                    onTryOn={() => onTryOnOutfit(key, outfitDesc, outfitDesc)}
                                                    onModify={(request) => onModifyOutfitDescription(key, location, request)}
                                                    onOpenImageViewer={onOpenImageViewer}
                                                />
                                            ))
                                        ) : (
                                            <div className="flex items-center justify-center text-center rounded-lg bg-stone-800/50 py-12"><p className="text-stone-500">대본에서 장소별 의상을 찾지 못했습니다.</p></div>
                                        )}
                                      </div>
                                </div>
                            )
                         })}
                     </div>
                );
        }
    };

    const isStep1NextDisabled = characterKeys.length === 0 || characterKeys.some(k => !characterDescriptions[k].upscaledImageUrl);
    const isStep2NextDisabled = characterKeys.length === 0 || characterKeys.some(k => !characterDescriptions[k].characterSheetHistory || characterDescriptions[k].characterSheetHistory!.length === 0);
    const isConfirmDisabled = isStep2NextDisabled; // Same condition for the final step

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 sm:p-8 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-xl w-full max-w-[90rem] h-full max-h-[95vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-stone-700 flex-shrink-0">
                    <h2 className="text-xl font-bold">✨ 캐릭터 시트 스튜디오 ✨</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700"><XIcon className="w-6 h-6" /></button>
                </div>
                <div className="flex flex-grow overflow-hidden">
                    <div className="w-80 p-6 border-r border-stone-700 flex-shrink-0 flex flex-col gap-4">
                         <StepIndicator currentStep={studioStep} step="uploadAndUpscale" title="1단계: 원본 등록 & 업스케일" description="캐릭터 이미지를 등록하고 고화질로 변환합니다." />
                         <StepIndicator currentStep={studioStep} step="createSignaturePose" title="2단계: 시그니처 포즈 생성" description="업스케일된 이미지에 캐릭터의 성격을 반영하여 '시그니처 포즈'를 만듭니다." />
                         <StepIndicator currentStep={studioStep} step="designOutfits" title="3단계: 의상 디자인" description="완성된 시트를 기반으로 각 장면별 의상을 확인하고 수정합니다." />
                    </div>
                    <div className="flex-grow flex flex-col overflow-hidden">
                        {renderContent()}
                        <div className="p-4 bg-stone-800/50 border-t border-stone-700 flex-shrink-0 flex justify-between items-center">
                            {/* Navigation Section */}
                            <div className="flex gap-2">
                                {studioStep !== 'uploadAndUpscale' && (
                                    <button
                                        onClick={handleGoBack}
                                        className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
                                    >
                                        <ArrowLeftIcon className="w-5 h-5" />
                                        <span>이전 단계</span>
                                    </button>
                                )}
                                {studioStep === 'uploadAndUpscale' && !isStep1NextDisabled && (
                                    <button
                                        onClick={() => setStudioStep('createSignaturePose')}
                                        className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
                                    >
                                        <span>다음 단계</span>
                                        <ArrowRightIcon className="w-5 h-5" />
                                    </button>
                                )}
                                {studioStep === 'createSignaturePose' && !isStep2NextDisabled && (
                                    <button
                                        onClick={() => setStudioStep('designOutfits')}
                                        className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-stone-400 hover:text-white hover:bg-stone-700 rounded-lg transition-colors"
                                    >
                                        <span>다음 단계</span>
                                        <ArrowRightIcon className="w-5 h-5" />
                                    </button>
                                )}
                            </div>

                            {/* Next Button Section */}
                            <div className="flex gap-3">
                                {studioStep === 'uploadAndUpscale' && (
                                    <button
                                        onClick={() => setStudioStep('createSignaturePose')}
                                        disabled={isStep1NextDisabled}
                                        className="group inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 rounded-lg hover:from-orange-700 hover:to-amber-700 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span>다음 단계: 시그니처 포즈 생성</span>
                                        <ChevronRightIcon className="w-6 h-6 transition-transform duration-300 group-hover:translate-x-1" />
                                    </button>
                                )}
                                {studioStep === 'createSignaturePose' && (
                                    <button
                                        onClick={() => setStudioStep('designOutfits')}
                                        disabled={isStep2NextDisabled}
                                        className="group inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 rounded-lg hover:from-orange-700 hover:to-amber-700 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span>다음 단계: 의상 디자인</span>
                                        <ChevronRightIcon className="w-6 h-6 transition-transform duration-300 group-hover:translate-x-1" />
                                    </button>
                                )}
                                {studioStep === 'designOutfits' && (
                                    <button
                                        onClick={onConfirm}
                                        disabled={isConfirmDisabled}
                                        className="group inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-green-600 to-amber-600 rounded-lg hover:from-green-700 hover:to-amber-700 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-green-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span>{appState === 'storyboardGenerated' ? '변경사항 적용 및 전체 컷 재생성' : '설정 완료하고 스토리보드 생성 시작'}</span>
                                        <ChevronRightIcon className="w-6 h-6 transition-transform duration-300 group-hover:translate-x-1" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {showPasteModal && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-stone-100">의상 데이터 수동 붙여넣기</h3>
                        <p className="text-sm text-stone-400">
                            브라우저 권한 문제로 클립보드를 자동으로 읽어올 수 없습니다. 
                            복사한 의상 데이터를 아래 입력창에 직접 붙여넣어 주세요.
                        </p>
                        <textarea
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                            className="w-full h-48 bg-stone-800 border border-stone-700 rounded-lg p-3 text-sm text-stone-300 font-mono resize-none focus:outline-none focus:border-orange-500"
                            placeholder='{"캐릭터명": {"장소명": "의상 설명..."}}'
                        />
                        <div className="flex justify-end gap-3 mt-2">
                            <button 
                                onClick={() => setShowPasteModal(false)}
                                className="px-4 py-2 text-sm font-medium text-stone-400 hover:text-stone-200 transition-colors"
                            >
                                취소
                            </button>
                            <button 
                                onClick={() => processPasteText(pasteText)}
                                className="px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
                            >
                                적용하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCopyModal && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-stone-100">의상 데이터 수동 복사</h3>
                        <p className="text-sm text-stone-400">
                            브라우저 권한 문제로 클립보드에 자동으로 복사할 수 없습니다. 
                            아래 텍스트를 직접 선택하여 복사(Ctrl+C / Cmd+C)해 주세요.
                        </p>
                        <textarea
                            value={copyText}
                            readOnly
                            className="w-full h-48 bg-stone-800 border border-stone-700 rounded-lg p-3 text-sm text-stone-300 font-mono resize-none focus:outline-none focus:border-orange-500"
                            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                        />
                        <div className="flex justify-end mt-2">
                            <button 
                                onClick={() => setShowCopyModal(false)}
                                className="px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
