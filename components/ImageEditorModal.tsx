
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CharacterDescription, EditImageFunction } from '../types';
import { XIcon, SpinnerIcon, PencilIcon, UndoIcon, CheckIcon, PlusIcon, TrashIcon, PhotoIcon, UploadIcon, ArrowUpIcon, ArrowDownIcon, ArrowLeftIcon, ChevronRightIcon, SparklesIcon, ArrowsUpDownLeftRightIcon } from './icons';

// Types from App.tsx
type EditingImageInfo = {
  type: 'cut' | 'character' | 'background';
  id: string;
  url: string;
  prompt: string;
  sceneNumber?: number;
  characters?: string[];
};

// NEW: Type for outpainting function
export type OutpaintImageFunction = (
    baseImageUrl: string,
    direction: 'up' | 'down' | 'left' | 'right',
    originalPrompt?: string
) => Promise<{ imageUrl: string, textResponse: string, tokenCount: number }>;

export type FillImageFunction = (
    baseImageUrl: string,
    originalPrompt?: string
) => Promise<{ imageUrl: string, tokenCount: number }>;


// Props for the modal
interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newImageUrl: string) => void; // Add as new version
  targetImage: EditingImageInfo | null;
  allCharacterDescriptions: { [key: string]: CharacterDescription };
  masterStyleSourceImageUrl: string | null;
  editImageFunction: EditImageFunction;
  outpaintImageFunction: OutpaintImageFunction;
  fillImageFunction: FillImageFunction;
}

// Tool section component
const ToolSection: React.FC<{ title: React.ReactNode, children: React.ReactNode }> = ({ title, children }) => (
    <div className="p-4 border border-stone-700 rounded-lg bg-stone-800/60">
        <h3 className="font-semibold mb-3 text-stone-200 flex items-center gap-2">{title}</h3>
        <div className="space-y-3">
            {children}
        </div>
    </div>
);

// Helper function to get the cropped image data URL from a canvas
const getCroppedImg = (
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number; }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    // CORS FIX: Append timestamp to bypass cache if it's an external URL
    const isLocal = imageSrc.startsWith('data:') || imageSrc.startsWith('blob:');
    const safeUrl = isLocal ? imageSrc : `${imageSrc}${imageSrc.includes('?') ? '&' : '?'}t=${Date.now()}`;
    image.src = safeUrl;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }

      // Set canvas size to the crop size
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      // Draw the cropped portion of the image onto the canvas
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = error => reject(error);
  });
};


// Main component
export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  targetImage,
  allCharacterDescriptions,
  masterStyleSourceImageUrl,
  editImageFunction,
  outpaintImageFunction,
  fillImageFunction,
}) => {
  const [imageSrc, setImageSrc] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  // Tool state
  const [editPrompt, setEditPrompt] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | undefined>(undefined);
  const [selectedCharacterKey, setSelectedCharacterKey] = useState<string | null>(null);


  // Pan and Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isTransformed = zoom !== 1 || pan.x !== 0 || pan.y !== 0;
  const isDirty = history.length > 1 || isTransformed;

  useEffect(() => {
    if (isOpen && targetImage) {
      setImageSrc(targetImage.url);
      setHistory([targetImage.url]);
      // Reset state on open
      setIsLoading(false);
      setEditPrompt('');
      handleClearReference();
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen, targetImage]);

  const updateImage = (newUrl: string) => {
    setImageSrc(newUrl);
    setHistory(prev => [...prev, newUrl]);
    // Reset view for new image
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleHistoryClick = (index: number) => {
    const newHistory = history.slice(0, index + 1);
    setHistory(newHistory);
    setImageSrc(newHistory[newHistory.length - 1]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  
  // Pan and Zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newZoom = Math.max(0.1, Math.min(5, zoom - e.deltaY * 0.001));
    setZoom(newZoom);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    e.preventDefault();
    let newX = e.clientX - startPan.x;
    let newY = e.clientY - startPan.y;
    setPan({ x: newX, y: newY });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanning(false);
  };
  
  const handleMouseLeave = (e: React.MouseEvent) => {
    if (isPanning) {
        setIsPanning(false);
    }
  };


  const handleClearReference = () => {
    setReferenceImageUrl(undefined);
    setSelectedCharacterKey(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleSelectCharacter = (key: string | null) => {
    setSelectedCharacterKey(key);
    // Clear any existing reference when a character is picked,
    // forcing the user to explicitly choose A-Pose or Background.
    setReferenceImageUrl(undefined);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
};
  
  const handleRunTextEdit = async () => {
    if (!targetImage) return;

    if (!editPrompt.trim()) {
        alert("프롬프트를 입력해주세요.");
        return;
    }

    setIsLoading(true);
    setLoadingMessage('AI가 이미지를 수정하고 있습니다...');

    try {
        const { imageUrl: newImageUrl } = await editImageFunction(
            imageSrc,
            editPrompt,
            targetImage.prompt,
            referenceImageUrl,
            undefined // No mask
        );
        updateImage(newImageUrl);
        setEditPrompt('');
    } catch (error) {
        alert(`이미지 수정 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handlePresetEdit = async (presetName: string, presetPrompt: string) => {
    if (!targetImage) return;

    setIsLoading(true);
    setLoadingMessage(`'${presetName}' 효과를 적용하고 있습니다...`);

    try {
        const { imageUrl: newImageUrl } = await editImageFunction(
            imageSrc,
            presetPrompt,
            targetImage.prompt
        );
        updateImage(newImageUrl);
    } catch (error) {
        alert(`'${presetName}' 적용 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSmartFill = async () => {
    if (!containerRef.current || !imageRef.current) return;
    
    setIsLoading(true);
    setLoadingMessage('AI가 빈 공간을 채우고 있습니다...');
    
    try {
        const container = containerRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');

        // Fill background with black
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the transformed image
        const image = new Image();
        image.crossOrigin = 'anonymous'; // Important for canvas security
        // CORS FIX: Append timestamp to bypass cache if it's an external URL
        const isLocal = imageSrc.startsWith('data:') || imageSrc.startsWith('blob:');
        const safeUrl = isLocal ? imageSrc : `${imageSrc}${imageSrc.includes('?') ? '&' : '?'}t=${Date.now()}`;
        image.src = safeUrl;
        
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });
        
        // Use the image's natural dimensions for source, and transformed dimensions for destination
        const dWidth = image.naturalWidth * zoom;
        const dHeight = image.naturalHeight * zoom;

        ctx.drawImage(image, pan.x, pan.y, dWidth, dHeight);

        const imageForAi = canvas.toDataURL('image/png');
        
        const { imageUrl: newImageUrl } = await fillImageFunction(imageForAi, targetImage.prompt);
        updateImage(newImageUrl);

    } catch (error) {
        alert(`AI 채우기 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleDirectionalOutpaint = async (direction: 'up' | 'down' | 'left' | 'right') => {
    if (!targetImage) return;
    setIsLoading(true);
    setLoadingMessage(`'${direction.toUpperCase()}' 방향으로 이미지 확장 중...`);
    try {
        const { imageUrl: newImageUrl } = await outpaintImageFunction(imageSrc, direction, targetImage.prompt);
        updateImage(newImageUrl);
    } catch (error) {
        alert(`아웃페인팅 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsLoading(false);
    }
  };

  const cropAndGetUrl = useCallback(async (): Promise<string> => {
    if (!containerRef.current || !imageRef.current) {
      throw new Error("Image or container ref not available");
    }

    const container = containerRef.current;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    // CORS FIX: Append timestamp to bypass cache
    const isLocal = imageSrc.startsWith('data:') || imageSrc.startsWith('blob:');
    const safeUrl = isLocal ? imageSrc : `${imageSrc}${imageSrc.includes('?') ? '&' : '?'}t=${Date.now()}`;
    image.src = safeUrl;

    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    
    const containerRect = container.getBoundingClientRect();
    const imageDisplayWidth = image.naturalWidth * zoom;
    const imageDisplayHeight = image.naturalHeight * zoom;

    // Calculate the crop area in the natural dimensions of the image
    const cropX = (-pan.x / imageDisplayWidth) * naturalWidth;
    const cropY = (-pan.y / imageDisplayHeight) * naturalHeight;
    const cropWidth = (containerRect.width / imageDisplayWidth) * naturalWidth;
    const cropHeight = (containerRect.height / imageDisplayHeight) * naturalHeight;

    return getCroppedImg(imageSrc, {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
    });
  }, [pan, zoom, imageSrc]);

  const handleSaveWrapper = useCallback(async (saveFn: (url: string) => void) => {
    if (isLoading) return;
    setIsLoading(true);
    setLoadingMessage('이미지 처리 중...');
    try {
        const urlToSave = isTransformed ? await cropAndGetUrl() : imageSrc;
        saveFn(urlToSave);
    } catch (error) {
        alert(`저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsLoading(false);
    }
  }, [isLoading, isTransformed, cropAndGetUrl, imageSrc]);

  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setReferenceImageUrl(url);
        setSelectedCharacterKey(null);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen || !targetImage) return null;

  const shotPresets = [
    { name: '인물 확대', prompt: 'Re-frame the shot to be much closer to the character(s), making them fill most of the screen to clearly show their facial expressions. Do not change their pose or the background.', color: 'bg-orange-500' },
    { name: '상반신 샷', prompt: 'Re-frame the shot to show the character(s) from the waist up. They should be large and prominent in the frame.', color: 'bg-amber-600' },
    { name: '가슴 위 샷', prompt: 'Re-frame the shot to show the character(s) from the chest up, filling the frame.', color: 'bg-amber-600' },
    { name: '전신 샷', prompt: 'Re-frame the shot to show the character\'s full body, from head to toe. Ensure they are still the main focus and not too small in the frame.', color: 'bg-orange-600' },
  ];

  const anglePresets = [
    { name: '하이 앵글', prompt: 'Redraw the scene from a high angle, looking down at the character.', color: 'bg-orange-600' },
    { name: '로우 앵글', prompt: 'Redraw the scene from a low angle, looking up at the character.', color: 'bg-red-600' },
    { name: '아이 레벨', prompt: 'Redraw the scene from an eye-level angle.', color: 'bg-stone-700' },
    { name: '사선 앵글', prompt: 'Redraw the scene using a Dutch angle (canted angle) for a dramatic effect.', color: 'bg-amber-600' },
  ];
  
  const getReferenceImageLabel = () => {
    if (!referenceImageUrl) return '';
    if (selectedCharacterKey && allCharacterDescriptions[selectedCharacterKey]) {
        if (referenceImageUrl === allCharacterDescriptions[selectedCharacterKey].aPoseImageUrl) {
            return `${allCharacterDescriptions[selectedCharacterKey].koreanName} (A-Pose)`;
        }
    }
    if (referenceImageUrl === masterStyleSourceImageUrl) {
        return '마스터 배경';
    }
    return '업로드된 파일';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 animate-fade-in">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
      <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-xl w-full max-w-screen-xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b border-stone-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">Nano Image Editor</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => handleSaveWrapper(url => { onSave(url); onClose(); })} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50">
              저장 & 닫기
            </button>
            <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700">
              <XIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-grow flex overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-[380px] p-4 overflow-y-auto space-y-4 bg-stone-800/50 border-r border-stone-700 flex-shrink-0">
            <ToolSection title={<><PencilIcon className="w-5 h-5 text-orange-400"/><span>텍스트로 편집</span></>}>
                <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    rows={4}
                    className="w-full p-2 text-sm bg-stone-900/50 rounded-md border border-stone-600 focus:ring-orange-500"
                    placeholder="예: '캐릭터에게 안경을 씌워줘'"
                />
                <label className="text-sm font-semibold text-stone-300">참조 이미지 (선택)</label>
                <div className="grid grid-cols-2 gap-2">
                    <select
                        value={selectedCharacterKey || ''}
                        onChange={(e) => handleSelectCharacter(e.target.value || null)}
                        className="w-full p-2.5 text-sm bg-stone-700 rounded-md border border-stone-600 appearance-none focus:ring-orange-500"
                    >
                        <option value="">참조 없음</option>
                        {Object.keys(allCharacterDescriptions).map(key => (
                           <option key={key} value={key}>{allCharacterDescriptions[key].koreanName}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 bg-stone-700 hover:bg-stone-600 rounded-md flex items-center justify-center"
                        title="파일에서 참조 이미지 업로드"
                    >
                        <UploadIcon className="w-5 h-5" />
                    </button>
                </div>
                
                {selectedCharacterKey && allCharacterDescriptions[selectedCharacterKey] && (
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setReferenceImageUrl(allCharacterDescriptions[selectedCharacterKey].aPoseImageUrl)}
                            disabled={!allCharacterDescriptions[selectedCharacterKey].aPoseImageUrl}
                            className={`p-2 text-xs font-semibold rounded-md transition-colors ${referenceImageUrl === allCharacterDescriptions[selectedCharacterKey].aPoseImageUrl ? 'bg-orange-600 text-white' : 'bg-stone-700 hover:bg-stone-600 text-stone-300 disabled:opacity-50'}`}
                        >
                            A-Pose 참조
                        </button>
                        <button
                            onClick={() => setReferenceImageUrl(masterStyleSourceImageUrl || undefined)}
                            disabled={!masterStyleSourceImageUrl}
                            className={`p-2 text-xs font-semibold rounded-md transition-colors ${referenceImageUrl === masterStyleSourceImageUrl ? 'bg-orange-600 text-white' : 'bg-stone-700 hover:bg-stone-600 text-stone-300 disabled:opacity-50'}`}
                        >
                            마스터 배경 참조
                        </button>
                    </div>
                )}

                {referenceImageUrl && (
                     <div className="relative w-full p-1 border border-dashed border-stone-600 rounded-md mt-2">
                        <img 
                            src={referenceImageUrl} 
                            alt="Reference Preview" 
                            className="w-full h-auto max-h-40 object-contain rounded" 
                        />
                        <div className="absolute top-1 left-1 bg-black/50 text-white text-xs px-2 py-1 rounded">
                            {getReferenceImageLabel()}
                        </div>
                        <button 
                            onClick={handleClearReference}
                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1" title="참조 이미지 제거"
                        >
                            <XIcon className="w-3 h-3" />
                        </button>
                    </div>
                )}
                
                 <button
                    onClick={handleRunTextEdit}
                    disabled={isLoading || !editPrompt.trim()}
                    className="w-full mt-2 flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
                >
                    적용
                </button>
            </ToolSection>

            <ToolSection title={<><SparklesIcon className="w-5 h-5 text-amber-400"/><span>AI 아웃페인팅</span></>}>
                 <div className="grid grid-cols-3 gap-2 mb-2">
                    <div />
                    <button 
                        onClick={() => handleDirectionalOutpaint('up')}
                        disabled={isLoading}
                        className="p-2 flex items-center justify-center bg-stone-700 hover:bg-stone-600 rounded-md text-white disabled:opacity-50"
                        title="위로 확장"
                    >
                        <ArrowUpIcon className="w-5 h-5" />
                    </button>
                    <div />
                    
                    <button 
                        onClick={() => handleDirectionalOutpaint('left')}
                        disabled={isLoading}
                        className="p-2 flex items-center justify-center bg-stone-700 hover:bg-stone-600 rounded-md text-white disabled:opacity-50"
                        title="왼쪽으로 확장"
                    >
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    
                    <button
                        onClick={handleSmartFill}
                        disabled={isLoading}
                        className="p-2 flex items-center justify-center bg-amber-600 hover:bg-amber-500 rounded-md text-white disabled:opacity-50"
                        title="빈 공간 채우기 (블랙 영역)"
                    >
                        <ArrowsUpDownLeftRightIcon className="w-5 h-5" />
                    </button>

                    <button 
                        onClick={() => handleDirectionalOutpaint('right')}
                        disabled={isLoading}
                        className="p-2 flex items-center justify-center bg-stone-700 hover:bg-stone-600 rounded-md text-white disabled:opacity-50"
                        title="오른쪽으로 확장"
                    >
                        <ChevronRightIcon className="w-5 h-5" />
                    </button>

                    <div />
                    <button 
                        onClick={() => handleDirectionalOutpaint('down')}
                        disabled={isLoading}
                        className="p-2 flex items-center justify-center bg-stone-700 hover:bg-stone-600 rounded-md text-white disabled:opacity-50"
                        title="아래로 확장"
                    >
                        <ArrowDownIcon className="w-5 h-5" />
                    </button>
                    <div />
                 </div>
                 <p className="text-[10px] text-stone-400 text-center">방향을 선택하여 이미지를 확장하거나<br/>가운데 버튼으로 검은 영역(줌아웃)을 채우세요.</p>
            </ToolSection>

            <ToolSection title="샷 변경">
                <div className="grid grid-cols-2 gap-2">
                    {shotPresets.map(preset => (
                        <button
                            key={preset.name}
                            onClick={() => handlePresetEdit(preset.name, preset.prompt)}
                            disabled={isLoading}
                            className={`px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 ${preset.color} hover:opacity-90`}
                        >
                            {preset.name}
                        </button>
                    ))}
                </div>
            </ToolSection>
            <ToolSection title="앵글 적용">
                <div className="grid grid-cols-2 gap-2">
                     {anglePresets.map(preset => (
                        <button
                            key={preset.name}
                            onClick={() => handlePresetEdit(preset.name, preset.prompt)}
                            disabled={isLoading}
                            className={`px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 ${preset.color} hover:opacity-90`}
                        >
                            {preset.name}
                        </button>
                    ))}
                </div>
            </ToolSection>
          </div>
          
          {/* Image Viewer */}
          <div className="flex-grow flex items-center justify-center p-4 bg-black/50 relative">
              {isLoading && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20">
                  <SpinnerIcon className="w-12 h-12 text-white" />
                  <p className="mt-3 text-white">{loadingMessage}</p>
              </div>
              )}
              <div
                  ref={containerRef}
                  className="w-full h-full bg-stone-900/50 overflow-hidden relative shadow-lg rounded-md"
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
              >
                  <img
                      ref={imageRef}
                      src={imageSrc}
                      alt="Image to edit"
                      className="absolute top-0 left-0"
                      style={{
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                          cursor: isPanning ? 'grabbing' : 'grab',
                          willChange: 'transform',
                          transformOrigin: 'top left',
                          outline: '2px dashed rgba(255, 255, 255, 0.5)',
                          outlineOffset: `-${2/zoom}px`,
                      }}
                      draggable={false}
                  />
              </div>
          </div>
          
          {/* Right Sidebar (History) */}
          <div className="w-[240px] p-4 overflow-y-auto space-y-3 bg-stone-800/50 border-l border-stone-700 flex-shrink-0">
            <h3 className="font-semibold text-stone-200 mb-2">작업 내역</h3>
            {history.map((url, index) => (
                <div key={index} className="relative flex-shrink-0 group">
                    <img
                        src={url}
                        alt={`History ${index}`}
                        onClick={() => handleHistoryClick(index)}
                        className={`w-full aspect-square object-cover rounded-md cursor-pointer border-2 transition-all ${imageSrc === url ? 'border-orange-500 scale-105' : 'border-stone-700 hover:border-stone-500'}`}
                    />
                    <span className="absolute bottom-1 right-1 text-xs font-bold text-white bg-black/50 px-1.5 py-0.5 rounded">{index + 1}</span>
                    {index > 0 && (
                        <button onClick={() => handleHistoryClick(index-1)} className="absolute top-1 right-1 p-1 bg-stone-800/70 rounded-full opacity-0 group-hover:opacity-100" title="이 버전으로 되돌리기">
                            <UndoIcon className="w-4 h-4 text-white"/>
                        </button>
                    )}
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
