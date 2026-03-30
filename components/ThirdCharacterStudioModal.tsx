
import React, { useState, useRef, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import { GeneratedImage } from '../types';
import { XIcon, SparklesIcon, UploadIcon, UsersIcon, SpinnerIcon } from './icons';

interface ThirdCharacterStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  generatedImageHistory: GeneratedImage[];
  onConfirm: (baseImage: GeneratedImage, referenceImage: GeneratedImage, characterToReplace: string) => Promise<void>;
}

const ImageDropZone: React.FC<{
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onClick?: () => void;
    isDragging: boolean;
    setIsDragging: (isDragging: boolean) => void;
    image: GeneratedImage | null;
    title: string;
    subtitle: string;
    children?: React.ReactNode;
}> = ({ onDrop, onClick, isDragging, setIsDragging, image, title, subtitle, children }) => (
    <div
        className={`w-full h-full bg-stone-900/50 rounded-lg flex items-center justify-center relative shadow-inner transition-all border-2 border-dashed ${isDragging ? 'border-orange-500 bg-orange-900/50' : 'border-stone-700'}`}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDrop}
    >
        {image ? (
            <img src={image.imageUrl} alt={title} className="max-w-full max-h-full object-contain rounded-md" />
        ) : (
            <div className="text-center text-stone-500" onClick={onClick}>
                <UploadIcon className="w-10 h-10 mx-auto mb-2" />
                <p className="font-semibold">{title}</p>
                <p className="text-xs">{subtitle}</p>
            </div>
        )}
        {children}
    </div>
);


export const ThirdCharacterStudioModal: React.FC<ThirdCharacterStudioModalProps> = ({ isOpen, onClose, generatedImageHistory, onConfirm }) => {
    const { state } = useAppContext();
    const [baseImage, setBaseImage] = useState<GeneratedImage | null>(null);
    const [referenceImage, setReferenceImage] = useState<GeneratedImage | null>(null);
    const [characterToReplace, setCharacterToReplace] = useState('');
    
    const [isBaseDragging, setIsBaseDragging] = useState(false);
    const [isRefDragging, setIsRefDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const refFileInputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, type: 'base' | 'ref') => {
        e.preventDefault(); e.stopPropagation();
        
        const internalDragData = e.dataTransfer.getData('application/x-studio-image-source');
        if (internalDragData) {
            try {
                const { image } = JSON.parse(internalDragData) as { image: GeneratedImage };
                if (type === 'base') setBaseImage(image);
                else setReferenceImage(image);
            } catch (error) { console.error("Drop error:", error); }
        } else {
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const url = event.target?.result as string;
                    const newImage: GeneratedImage = {
                        id: window.crypto.randomUUID(),
                        imageUrl: url,
                        sourceCutNumber: 'user-upload',
                        prompt: `User uploaded: ${file.name}`,
                        engine: (state.selectedNanoModel === 'nano-3pro' || state.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano',
                        createdAt: new Date().toISOString(),
                    };
                    if (type === 'base') setBaseImage(newImage);
                    else setReferenceImage(newImage);
                };
                reader.readAsDataURL(file);
            }
        }
        
        if (type === 'base') setIsBaseDragging(false);
        else setIsRefDragging(false);
    };

    const handleRefFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const url = event.target?.result as string;
             const newImage: GeneratedImage = {
                id: window.crypto.randomUUID(),
                imageUrl: url,
                sourceCutNumber: 'user-upload',
                prompt: `User uploaded: ${file.name}`,
                engine: (state.selectedNanoModel === 'nano-3pro' || state.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano',
                createdAt: new Date().toISOString(),
            };
            setReferenceImage(newImage);
          };
          reader.readAsDataURL(file);
        }
      };

    const handleConfirmClick = async () => {
        if (!baseImage || !referenceImage || !characterToReplace.trim()) {
            alert("수정할 이미지, 제3인물 레퍼런스, 교체할 인물 이름을 모두 입력해주세요.");
            return;
        }
        setIsLoading(true);
        try {
            await onConfirm(baseImage, referenceImage, characterToReplace);
        } catch (e) {
            // Error is notified by the parent
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[90] flex items-center justify-center p-4 animate-fade-in">
            <input type="file" ref={refFileInputRef} className="hidden" accept="image/*" onChange={handleRefFileChange} />
            <div className="bg-stone-800 border border-stone-700 rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col">
                <header className="flex justify-between items-center p-4 border-b border-stone-700">
                    <h2 className="text-xl font-bold text-white flex items-center gap-3"><UsersIcon className="w-6 h-6 text-orange-400" />제3인물 수정 스튜디오</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700"><XIcon className="w-6 h-6" /></button>
                </header>
                
                <main className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-y-auto">
                    {/* Left Side: Workflow */}
                    <div className="flex flex-col gap-6">
                        {/* Step 1 */}
                        <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center">1</div>
                                <div className="w-px h-full bg-stone-700 mt-2"></div>
                            </div>
                            <div className="flex-grow">
                                <h3 className="font-bold text-lg text-white">컷 이미지 선택</h3>
                                <p className="text-sm text-stone-400 mb-2">수정할 이미지를 우측 생성 히스토리에서 드래그하여 아래 영역에 놓으세요.</p>
                                <div className="h-64">
                                    <ImageDropZone
                                        onDrop={(e) => handleDrop(e, 'base')}
                                        isDragging={isBaseDragging}
                                        setIsDragging={setIsBaseDragging}
                                        image={baseImage}
                                        title="수정할 이미지"
                                        subtitle="여기에 드래그 & 드롭"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex items-start gap-4">
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center">2</div>
                            </div>
                            <div className="flex-grow">
                                <h3 className="font-bold text-lg text-white">제3인물 레퍼런스 등록</h3>
                                <p className="text-sm text-stone-400 mb-2">제3인물의 기준 이미지를 등록하세요. (히스토리에서 드래그 또는 파일 업로드)</p>
                                <div className="h-64">
                                    <ImageDropZone
                                        onDrop={(e) => handleDrop(e, 'ref')}
                                        onClick={() => refFileInputRef.current?.click()}
                                        isDragging={isRefDragging}
                                        setIsDragging={setIsRefDragging}
                                        image={referenceImage}
                                        title="제3인물 기준 이미지"
                                        subtitle="클릭 또는 드래그 & 드롭"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: History Gallery */}
                    <div className="flex flex-col gap-4">
                        <h3 className="font-bold text-lg text-white">생성 히스토리</h3>
                        <div className="flex-grow bg-stone-900/50 p-3 rounded-lg border border-stone-700 overflow-y-auto">
                             <div className="grid grid-cols-3 gap-3">
                                {generatedImageHistory.map(image => (
                                    <div 
                                        key={image.id} 
                                        className="relative group aspect-square"
                                        draggable={true}
                                        onDragStart={(e) => e.dataTransfer.setData('application/x-studio-image-source', JSON.stringify({ image }))}
                                    >
                                        <img 
                                            src={image.imageUrl} 
                                            alt={`Cut ${image.sourceCutNumber}`} 
                                            className="w-full h-full object-cover rounded-md cursor-grab border-2 border-transparent"
                                        />
                                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md pointer-events-none">
                                            <p className="text-xs text-white text-center font-mono">#{image.sourceCutNumber}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </main>
                
                <footer className="p-4 bg-stone-900/50 border-t border-stone-700 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <label htmlFor="character-name-input" className="text-sm font-semibold text-stone-300">교체할 인물 이름:</label>
                        <input
                            id="character-name-input"
                            type="text"
                            value={characterToReplace}
                            onChange={(e) => setCharacterToReplace(e.target.value)}
                            placeholder="예: 도둑"
                            className="p-2 bg-stone-700 rounded-md border border-stone-600 text-sm text-white w-48"
                        />
                    </div>
                    <button
                        onClick={handleConfirmClick}
                        disabled={isLoading || !baseImage || !referenceImage || !characterToReplace.trim()}
                        className="flex items-center gap-2 px-6 py-3 font-bold text-white bg-green-600 hover:bg-green-500 rounded-lg disabled:opacity-50"
                    >
                        {isLoading ? <SpinnerIcon className="w-5 h-5"/> : <SparklesIcon className="w-5 h-5"/>}
                        {isLoading ? '교체 중...' : 'AI로 제3인물 교체'}
                    </button>
                </footer>
            </div>
        </div>
    );
};
