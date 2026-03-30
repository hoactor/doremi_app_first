
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import { GeneratedImage, Notification, StudioSession } from '../types';
import { SparklesIcon, PencilIcon, UploadIcon, XIcon, UndoIcon, BookmarkSquareIcon, CheckIcon, SpinnerIcon, ArrowsUpDownLeftRightIcon, RefreshIcon, DocumentDuplicateIcon, BodyPoseIcon, HandPoseIcon, FaceSmileIcon, PaintBrushIcon, EraserIcon, TrashIcon, ArrowsRightLeftIcon, ZoomInIcon } from './icons';
import { MaskingCanvas, MaskingCanvasRef } from './MaskingCanvas';

interface ImageStudioProps {
  studioId: 'a' | 'b';
  title: string;
  session: StudioSession;
  isNextSlot: boolean;
  onEdit: (studioId: 'a' | 'b', image: GeneratedImage, prompt: string, refUrl: string | null, maskBase64?: string, sourceCutNumberOverride?: string) => Promise<void>;
  onCreate: (studioId: 'a' | 'b', image: GeneratedImage, prompt: string) => Promise<void>;
  onClear: (studioId: 'a' | 'b') => void;
  onRevert: (studioId: 'a' | 'b') => void;
  onUndo: (studioId: 'a' | 'b') => void;
  onCopyOriginalToCurrent: (studioId: 'a' | 'b') => void;
  onClearReference?: (studioId: 'a' | 'b') => void;
  onSaveToHistory: (studioId: 'a' | 'b') => void;
  onReferenceChange: (studioId: 'a' | 'b', url: string | null) => void;
  isLoading: boolean;
  onImageUpload: (studioId: 'a' | 'b', imageDataUrl: string) => void;
  onUpdateCurrentImageFromUpload: (studioId: 'a' | 'b', imageDataUrl: string) => void;
  onPromptChange: (studioId: 'a' | 'b', prompt: string) => void;
  onLoadImage: (studioId: 'a' | 'b', image: GeneratedImage) => void;
  onSetOriginalImage: (studioId: 'a' | 'b', image: GeneratedImage) => void;
  isActiveTarget: boolean;
  onSetActiveTarget: (studioId: 'a' | 'b') => void;
  onTransformChange: (studioId: 'a' | 'b', zoom: number, pan: { x: number; y: number; }) => void;
  onCommitTransform: (studioId: 'a' | 'b', newImageDataUrl: string) => void;
  fillImageFunction: (imageUrl: string, originalPrompt?: string, maskBase64?: string) => Promise<{ imageUrl: string, tokenCount: number }>;
  addNotification: (message: string, type: Notification['type']) => void;
  onGenerateMask: (imageUrl: string) => Promise<string | null>;
  onSelectTargetCut: (studioId: 'a' | 'b') => void;
  onOpenImageViewer: (url: string, alt: string, prompt?: string) => void;
}

const ImageDropZone: React.FC<{
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onClick: () => void;
    isDragging: boolean;
    setIsDragging: (isDragging: boolean) => void;
    imageUrl: string | null;
    title: string;
    subtitle: string;
    className?: string;
    children?: React.ReactNode;
    allowClickToEnlarge?: boolean; // New Prop
    onEnlarge?: () => void; // New Prop
}> = ({ onDrop, onClick, isDragging, setIsDragging, imageUrl, title, subtitle, className, children, allowClickToEnlarge, onEnlarge }) => {
    
    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Critical Fix: Check if we are actually leaving the drop zone container
        if (e.currentTarget.contains(e.relatedTarget as Node)) {
            return;
        }
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        onDrop(e);
    };

    return (
        <div
            className={`w-full bg-stone-800/50 rounded-lg flex items-center justify-center relative shadow-lg transition-all ${className}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} // Necessary to allow drop
            onDrop={handleDrop}
            onClick={(e) => {
                // Prioritize Enlarge if enabled and image exists
                if (imageUrl && allowClickToEnlarge && onEnlarge) {
                    e.stopPropagation();
                    onEnlarge();
                } else {
                    // Otherwise (no image OR not enlargeable), trigger upload/swap
                    onClick();
                }
            }}
            style={{ cursor: imageUrl && allowClickToEnlarge ? 'zoom-in' : 'pointer' }}
        >
            {imageUrl ? (
                <>
                    <img src={imageUrl} alt={title} className="max-w-full max-h-full object-contain rounded-md animate-fade-in"/>
                    {isDragging && (
                        <div className="absolute inset-0 bg-orange-900/50 border-2 border-dashed border-orange-500 rounded-lg flex flex-col items-center justify-center pointer-events-none">
                            <UploadIcon className="w-8 h-8 text-white mb-2" />
                            <p className="text-white font-semibold">이미지를 놓아 교체</p>
                        </div>
                    )}
                    {/* 
                        If click-to-enlarge is enabled, we need a separate button to allow changing the image.
                    */}
                    {allowClickToEnlarge && (
                        <div className="absolute top-2 right-2 z-10">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onClick(); }} 
                                className="p-1.5 bg-black/60 hover:bg-orange-600 text-white rounded-full transition-colors border border-white/20" 
                                title="이미지 교체 (업로드)"
                            >
                                <UploadIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center text-center p-4 rounded-lg ${isDragging ? 'border-2 border-dashed border-orange-500 bg-orange-900/50' : 'border-2 border-transparent'} transition-colors`}>
                    <div className="text-center text-stone-500 hover:text-stone-300" title={title}>
                        <UploadIcon className="w-8 h-8 mx-auto mb-2"/>
                        <p className="font-semibold">{title}</p>
                        <p className="text-xs">{subtitle}</p>
                    </div>
                </div>
            )}
            {children}
        </div>
    );
};

// Props for the popover
export const ImageStudio: React.FC<ImageStudioProps> = (props) => {
    const { studioId, title, session, isNextSlot, onEdit, onCreate, onClear, onRevert, onUndo, onCopyOriginalToCurrent, onSaveToHistory, onReferenceChange, isLoading, onImageUpload, onUpdateCurrentImageFromUpload, onPromptChange, onLoadImage, onSetOriginalImage, isActiveTarget, onSetActiveTarget, onTransformChange, onCommitTransform, fillImageFunction, addNotification, onGenerateMask, onSelectTargetCut, onOpenImageViewer } = props;
    const { state } = useAppContext();
    
    const [isRefDragging, setIsRefDragging] = useState(false);
    const [isMainDragging, setIsMainDragging] = useState(false);
    const [isMainContainerDragging, setIsMainContainerDragging] = useState(false);
    const refFileRef = useRef<HTMLInputElement>(null);
    const mainFileRef = useRef<HTMLInputElement>(null);
    const [isLocalLoading, setIsLocalLoading] = useState(false);
    const [localLoadingMessage, setLocalLoadingMessage] = useState('');
    const [isResetDropTarget, setIsResetDropTarget] = useState(false);
    const [isMaskingMode, setIsMaskingMode] = useState(false);
    const maskingCanvasRef = useRef<MaskingCanvasRef>(null);
    const [isGeneratingMask, setIsGeneratingMask] = useState(false);
    const abortRef = useRef(false);

    const handleStopLoading = () => {
        abortRef.current = true;
        setIsLocalLoading(false);
        setIsGeneratingMask(false);
        addNotification('작업이 중지되었습니다.', 'info');
    };

    const [maskBrushSize, setMaskBrushSize] = useState(40);
    const [maskMode, setMaskMode] = useState<'brush' | 'eraser'>('brush');

    const { originalImage, currentImage, referenceImageUrl, editPrompt, zoom, pan } = session;
    
    const imageRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const isPanningRef = useRef(false);
    const panStartOffsetRef = useRef({ x: 0, y: 0 });
    const mouseDownClientRef = useRef({ x: 0, y: 0 });

    const isTransformed = currentImage && (zoom !== 1 || pan.x !== 0 || pan.y !== 0);
    const hasBeenEdited = currentImage && originalImage && currentImage.id !== originalImage.id;
    
    // Helper to immediately apply changes and run the edit
    const handleApplyEffect = async (newPrompt: string) => {
        // 1. Update text UI immediately
        onPromptChange(studioId, newPrompt);

        // 2. Trigger AI generation immediately
        if (currentImage) {
            let maskBase64: string | undefined;
            if (isMaskingMode && maskingCanvasRef.current) {
                maskBase64 = maskingCanvasRef.current.getMaskAsBase64();
            }
            try {
                // Pass session.sourceCutForNextEdit as the override
                await onEdit(studioId, currentImage, newPrompt, referenceImageUrl, maskBase64, session.sourceCutForNextEdit || undefined);
                
                // Clear mask after successful edit if in masking mode
                if (isMaskingMode && maskingCanvasRef.current) {
                    maskingCanvasRef.current.clearMask();
                }
            } catch (e) {
                console.error("Effect application failed", e);
            }
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (!currentImage) return;
        e.preventDefault();
        const newZoom = Math.max(0.5, Math.min(3, zoom - e.deltaY * 0.001));
        onTransformChange(studioId, newZoom, pan);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!currentImage || e.button !== 0 || isMaskingMode) return;
        e.preventDefault();
        isPanningRef.current = true;
        panStartOffsetRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        mouseDownClientRef.current = { x: e.clientX, y: e.clientY };
        onSetActiveTarget(studioId); // Ensure studio is active on interaction
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanningRef.current || isMaskingMode) return;
        e.preventDefault();

        const container = containerRef.current;
        const image = imageRef.current;
        if (!container || !image) return;

        let newX = e.clientX - panStartOffsetRef.current.x;
        let newY = e.clientY - panStartOffsetRef.current.y;

        onTransformChange(studioId, zoom, { x: newX, y: newY });
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        isPanningRef.current = false;
        // Click-to-view logic removed to avoid conflict with panning/masking
    };

    const handleAiMask = async () => {
        if (!currentImage) return;
        abortRef.current = false;
        setIsGeneratingMask(true);
        try {
            const maskUrl = await onGenerateMask(currentImage.imageUrl);
            if (abortRef.current) return;
            if (maskUrl && maskingCanvasRef.current) {
                maskingCanvasRef.current.loadMaskFromUrl(maskUrl);
                setIsMaskingMode(true);
            }
        } catch (error) {
            console.error("AI Mask generation failed", error);
            addNotification("AI 마스크 생성에 실패했습니다.", "error");
        } finally {
            setIsGeneratingMask(false);
        }
    };

    const handleDragHandleStart = (e: React.DragEvent<HTMLDivElement>) => {
        e.stopPropagation();
        onSetActiveTarget(studioId);
        if (currentImage) {
            e.dataTransfer.setData('application/x-studio-image-source', JSON.stringify({ image: currentImage }));
            
            const dragImage = document.createElement('img');
            dragImage.src = currentImage.imageUrl;
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-10000px';
            dragImage.style.width = '100px';
            dragImage.style.height = '100px';
            dragImage.style.objectFit = 'cover';
            dragImage.style.borderRadius = '8px';
            dragImage.style.border = '2px solid white';
            dragImage.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
            
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 50, 50);

            setTimeout(() => {
                document.body.removeChild(dragImage);
            }, 0);
        }
    };

    const handleOriginalImageDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (originalImage) {
            e.dataTransfer.setData('application/x-studio-original-image-reset', studioId);
            e.dataTransfer.setData('application/x-studio-image-source', JSON.stringify({ image: originalImage }));
            e.dataTransfer.effectAllowed = 'copy';
    
            const dragImage = document.createElement('img');
            dragImage.src = originalImage.imageUrl;
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-10000px';
            dragImage.style.width = '100px';
            dragImage.style.height = '100px';
            dragImage.style.objectFit = 'cover';
            dragImage.style.borderRadius = '8px';
            dragImage.style.border = '2px solid white';
            dragImage.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
            
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 50, 50);
    
            setTimeout(() => {
                document.body.removeChild(dragImage);
            }, 0);
        } else {
            e.preventDefault();
        }
    };

    const handleReferenceImageDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (referenceImageUrl) {
            e.stopPropagation();
            const tempImage: GeneratedImage = {
                id: `ref-${studioId}-${Date.now()}`,
                imageUrl: referenceImageUrl,
                sourceCutNumber: 'reference-image',
                prompt: 'Reference Image',
                engine: (state.selectedNanoModel === 'nano-3pro' || state.selectedNanoModel === 'nano-3.1') ? 'nano-v3' : 'nano',
                createdAt: new Date().toISOString(),
            };
            e.dataTransfer.setData('application/x-studio-image-source', JSON.stringify({ image: tempImage }));
            e.dataTransfer.effectAllowed = 'copy';

            const dragImage = document.createElement('img');
            dragImage.src = referenceImageUrl;
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-10000px';
            dragImage.style.width = '100px';
            dragImage.style.height = '100px';
            dragImage.style.objectFit = 'cover';
            dragImage.style.borderRadius = '8px';
            dragImage.style.border = '2px solid white';
            dragImage.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
            
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 50, 50);

            setTimeout(() => {
                document.body.removeChild(dragImage);
            }, 0);
        } else {
            e.preventDefault();
        }
    };

    const handleCommitTransform = async () => {
        if (!currentImage || !containerRef.current || !imageRef.current) return;

        abortRef.current = false;
        setIsLocalLoading(true);
        setLocalLoadingMessage(zoom < 1 ? 'AI가 빈 공간을 채우고 있습니다...' : '이미지를 자르는 중...');

        try {
            const container = containerRef.current;
            // Create a temporary image object to ensure we have the natural dimensions and data loaded
            const image = new Image();
            image.crossOrigin = 'anonymous';
            // CORS FIX: Append timestamp to bypass cache if it's an external URL
            const isLocal = currentImage.imageUrl.startsWith('data:') || currentImage.imageUrl.startsWith('blob:');
            const safeUrl = isLocal ? currentImage.imageUrl : `${currentImage.imageUrl}${currentImage.imageUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
            image.src = safeUrl;

            await new Promise<void>((resolve, reject) => { 
                image.onload = () => resolve(); 
                image.onerror = reject; 
            });

            const containerRect = container.getBoundingClientRect();
            // We use a fixed high resolution for consistent AI processing (e.g., 1024x1024)
            // matching the typical aspect ratio of the container (which is square in the UI)
            const outputWidth = 1024;
            const outputHeight = 1024; 
            
            const canvas = document.createElement('canvas');
            canvas.width = outputWidth;
            canvas.height = outputHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context unavailable');

            // Fill background with black (critical for outpainting/filling)
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, outputWidth, outputHeight);

            // Calculations for drawing the image onto the canvas to match visual transform
            // The visual image is 'object-contain' within the transformed wrapper.
            // But we can simplify by calculating the drawing coordinates based on the ratio.
            
            const naturalRatio = image.naturalWidth / image.naturalHeight;
            let drawW, drawH, drawX, drawY;
            
            // Calculate dimensions to fit within the 1024x1024 canvas (like object-contain)
            if (naturalRatio > 1) { // Wide image
                drawW = outputWidth;
                drawH = outputWidth / naturalRatio;
                drawX = 0;
                drawY = (outputHeight - drawH) / 2;
            } else { // Tall or Square image
                drawH = outputHeight;
                drawW = outputHeight * naturalRatio;
                drawY = 0;
                drawX = (outputWidth - drawW) / 2;
            }
            
            // The canvas context needs to be transformed exactly like the visual container.
            // Visual Transform: translate(pan.x, pan.y) scale(zoom)
            // But pan values are in screen pixels relative to the container size.
            // We need to scale these pan values to the canvas size (1024 vs containerRect.width).
            
            const scaleFactorX = outputWidth / containerRect.width;
            const scaleFactorY = outputHeight / containerRect.height;

            ctx.save();
            // Apply transform: move to center, scale, move back, apply pan
            // Actually, the CSS transform is applied to the wrapper div.
            // CSS: transform: translate(pan.x, pan.y) scale(zoom) origin 0 0 (top left)
            
            ctx.translate(pan.x * scaleFactorX, pan.y * scaleFactorY);
            ctx.scale(zoom, zoom);
            
            ctx.drawImage(image, drawX, drawY, drawW, drawH);
            ctx.restore();
            
            const finalImageUrl = canvas.toDataURL('image/png');
            
            if (zoom < 1) {
                // Create a mask for the empty areas (white = fill, black = preserve)
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = 1024;
                maskCanvas.height = 1024;
                const maskCtx = maskCanvas.getContext('2d');
                if (maskCtx) {
                    maskCtx.fillStyle = 'white'; // Area to fill
                    maskCtx.fillRect(0, 0, 1024, 1024);
                    maskCtx.save();
                    maskCtx.translate(pan.x * scaleFactorX, pan.y * scaleFactorY);
                    maskCtx.scale(zoom, zoom);
                    maskCtx.fillStyle = 'black'; // Area to preserve
                    const overlap = 12; // pixels of overlap to give AI context for blending
                    maskCtx.fillRect(drawX + overlap, drawY + overlap, drawW - overlap * 2, drawH - overlap * 2);
                    maskCtx.restore();
                }
                const maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1];

                // Outpainting / Filling - Pass the original prompt and mask for context
                const { imageUrl: filledUrl } = await fillImageFunction(finalImageUrl, currentImage.prompt, maskBase64);
                if (abortRef.current) return;
                onCommitTransform(studioId, filledUrl);
            } else {
                // Cropping (just saving the current view)
                onCommitTransform(studioId, finalImageUrl);
            }

        } catch (error) {
            console.error(error);
            addNotification(`이미지 변환 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsLocalLoading(false);
        }
    };

    const handleEdit = useCallback(async () => {
        if (currentImage) {
            if (isMaskingMode && maskingCanvasRef.current) {
                const maskBase64 = maskingCanvasRef.current.getMaskAsBase64();
                try {
                    // Pass session.sourceCutForNextEdit as the override
                    await onEdit(studioId, currentImage, editPrompt, referenceImageUrl, maskBase64, session.sourceCutForNextEdit || undefined);
                    setIsMaskingMode(false);
                    maskingCanvasRef.current?.clearMask();
                } catch (error) {
                    console.info("Masked edit failed, leaving UI state intact for retry.", error);
                }
            } else {
                try {
                    // Pass session.sourceCutForNextEdit as the override
                    await onEdit(studioId, currentImage, editPrompt, referenceImageUrl, undefined, session.sourceCutForNextEdit || undefined);
                } catch (error) {
                    console.info("Edit failed.", error);
                }
            }
        }
    }, [currentImage, isMaskingMode, onEdit, studioId, editPrompt, referenceImageUrl, session.sourceCutForNextEdit]);

    const handleCreate = useCallback(async () => {
        if (originalImage) {
            try {
                await onCreate(studioId, originalImage, editPrompt);
            } catch (error) {
                console.info("Create function failed, but error was handled by parent.", error);
            }
        }
    }, [studioId, originalImage, editPrompt, onCreate]);

    const handleUpscale = useCallback(() => {
        if (!currentImage) return;
        setIsLocalLoading(true);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, 1024, 1024);
                const dataUrl = canvas.toDataURL('image/png');
                onUpdateCurrentImageFromUpload(studioId, dataUrl);
                addNotification('이미지가 1024x1024로 변환되었습니다.', 'success');
            }
            setIsLocalLoading(false);
        };
        img.onerror = () => {
            addNotification('이미지 변환 중 오류가 발생했습니다.', 'error');
            setIsLocalLoading(false);
        };
        img.src = currentImage.imageUrl;
    }, [currentImage, studioId, onUpdateCurrentImageFromUpload, addNotification]);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, inputType: 'main' | 'reference') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const url = event.target?.result as string;
                if (inputType === 'main') {
                    onImageUpload(studioId, url);
                } else {
                    onReferenceChange(studioId, url);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, inputType: 'main' | 'reference' | 'set-original') => {
        e.preventDefault();
        e.stopPropagation();
        if (inputType === 'main' || inputType === 'set-original') setIsMainDragging(false);
        else if (inputType === 'reference') setIsRefDragging(false);
    
        const internalDragData = e.dataTransfer.getData('application/x-studio-image-source');
        if (internalDragData) {
            try {
                const { image } = JSON.parse(internalDragData) as { image: GeneratedImage };
                if (inputType === 'set-original') {
                    onSetOriginalImage(studioId, image);
                } else if (inputType === 'main') {
                    onLoadImage(studioId, image);
                } else { // 'reference'
                    onReferenceChange(studioId, image.imageUrl);
                }
                return;
            } catch (error) {
                console.error("Failed to parse internal drag data:", error);
            }
        }
        
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                 const url = event.target?.result as string;
                if (inputType === 'set-original') { // Dropped on the "Original Image" box
                    onImageUpload(studioId, url);
                } else if (inputType === 'main') { // Dropped on the main "Current Image" canvas
                    onUpdateCurrentImageFromUpload(studioId, url);
                } else { // reference
                    onReferenceChange(studioId, url);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleMainDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResetDropTarget(false); 
        setIsMainContainerDragging(false);

        // Check for dragging the original image first
        if (e.dataTransfer.types.includes('application/x-studio-original-image-reset')) {
            const resetStudioId = e.dataTransfer.getData('application/x-studio-original-image-reset');
            if (resetStudioId === studioId) {
                onCopyOriginalToCurrent(studioId);
                return;
            }
        }
        
        // If it's not a drag from original, handle it as a general drop
        handleDrop(e, 'main');
    };

    const handleMainDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/x-studio-original-image-reset')) {
            e.dataTransfer.dropEffect = 'copy';
        } else {
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    const handleMainDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/x-studio-original-image-reset')) {
            setIsResetDropTarget(true);
        } else if (e.dataTransfer.types.includes('Files')) {
            setIsMainContainerDragging(true);
        }
    };

    const handleMainDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResetDropTarget(false);
        setIsMainContainerDragging(false);
    };

    return (
        <div 
            className="flex flex-col gap-2 flex-1 min-w-0 min-h-0 h-full p-3 rounded-xl transition-colors duration-300 cursor-pointer"
            onClick={() => onSetActiveTarget(studioId)}
        >
            <div className="flex justify-between items-center flex-shrink-0">
                <h3 className="text-lg font-bold text-stone-200 flex items-center gap-2">
                    {isActiveTarget && <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" title="활성 타겟"></div>}
                    {title}
                </h3>
                {originalImage && (
                     <button onClick={() => onClear(studioId)} className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-700 rounded-full" title="스튜디오 비우기">
                        <XIcon className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="flex gap-2">
                 <div draggable={!!originalImage} onDragStart={handleOriginalImageDragStart} className="flex-1 cursor-grab">
                    <ImageDropZone
                        onClick={() => mainFileRef.current?.click()}
                        onDrop={(e) => handleDrop(e, 'set-original')}
                        isDragging={isMainDragging}
                        setIsDragging={setIsMainDragging}
                        imageUrl={originalImage?.imageUrl ?? null}
                        title="원본 이미지"
                        subtitle="클릭 또는 드래그 & 드롭"
                        className={`flex-1 border-2 ${'border-stone-700'} aspect-square`}
                        allowClickToEnlarge={!!originalImage}
                        onEnlarge={() => originalImage && onOpenImageViewer(originalImage.imageUrl, `Original Image ${title}`, originalImage.prompt)}
                    >
                    </ImageDropZone>
                </div>
                 <div 
                    draggable={!!referenceImageUrl} 
                    onDragStart={handleReferenceImageDragStart}
                    className="flex-1 cursor-grab"
                >
                    <ImageDropZone
                        onClick={() => refFileRef.current?.click()}
                        onDrop={(e) => handleDrop(e, 'reference')}
                        isDragging={isRefDragging}
                        setIsDragging={setIsRefDragging}
                        imageUrl={referenceImageUrl}
                        title="첨부 이미지"
                        subtitle="클릭 또는 드래그 & 드롭"
                        className="flex-1 border-2 border-dashed border-stone-600 aspect-square"
                    >
                        {referenceImageUrl && (
                            <button onClick={(e) => { e.stopPropagation(); onReferenceChange(studioId, null); }} className="absolute top-2 right-2 p-1 bg-red-600 rounded-full text-white" title="첨부 이미지 제거"><XIcon className="w-4 h-4"/></button>
                        )}
                    </ImageDropZone>
                </div>
            </div>

            <div className="my-2 p-2 bg-stone-900/50 rounded-lg border border-stone-700 flex flex-wrap items-center gap-2">
                <button
                    onClick={() => setIsMaskingMode(prev => !prev)}
                    disabled={!currentImage}
                    className={`p-2 rounded-full transition-colors disabled:opacity-50 flex-shrink-0 ${isMaskingMode ? 'bg-orange-600 text-white' : 'bg-stone-700 text-stone-300 hover:bg-stone-600'}`}
                    title="마스크 편집 모드"
                >
                    <PaintBrushIcon className="w-5 h-5"/>
                </button>
                {isMaskingMode && (
                    <>
                        <button 
                            onClick={() => setMaskMode('brush')}
                            className={`p-2 rounded-md transition-colors flex-shrink-0 ${maskMode === 'brush' ? 'bg-stone-600 text-white' : 'hover:bg-stone-700 text-stone-300'}`}
                            title="브러시"
                        >
                            <PaintBrushIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setMaskMode('eraser')}
                            className={`p-2 rounded-md transition-colors flex-shrink-0 ${maskMode === 'eraser' ? 'bg-stone-600 text-white' : 'hover:bg-stone-700 text-stone-300'}`}
                            title="지우개"
                        >
                            <EraserIcon className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2 flex-grow min-w-[60px]">
                            <input
                                type="range"
                                min="5"
                                max="100"
                                value={maskBrushSize}
                                onChange={(e) => setMaskBrushSize(Number(e.target.value))}
                                className="w-full min-w-0"
                            />
                            <span className="text-xs text-white w-6 text-center flex-shrink-0">{maskBrushSize}</span>
                        </div>
                        <button
                            onClick={() => maskingCanvasRef.current?.invertMask()}
                            className="p-2 rounded-md text-stone-400 hover:text-white hover:bg-stone-700 flex-shrink-0"
                            title="마스크 반전"
                        >
                            <ArrowsRightLeftIcon className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={() => maskingCanvasRef.current?.clearMask()}
                            className="p-2 rounded-md hover:bg-stone-700 text-stone-300 flex-shrink-0"
                            title="전체 지우기"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleAiMask}
                            disabled={!currentImage || isGeneratingMask}
                            className="p-2 rounded-full transition-colors bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 flex-shrink-0"
                            title="AI로 인물 자동 선택"
                        >
                            <SparklesIcon className="w-5 h-5"/>
                        </button>
                    </>
                )}
            </div>

            <div className={`relative w-full aspect-square transition-shadow duration-300 rounded-xl ${isActiveTarget ? 'shadow-[0_0_25px_rgba(251,191,36,0.7)]' : ''}`}>
                <div
                    id={`studio-image-container-${studioId}`}
                    ref={containerRef}
                    className={`w-full h-full checkerboard-bg rounded-lg border-2 flex items-center justify-center relative shadow-inner overflow-hidden transition-colors duration-300 ${isActiveTarget ? 'border-amber-400' : 'border-stone-700'}`}
                    style={{ cursor: isMaskingMode ? 'default' : (isPanningRef.current ? 'grabbing' : 'grab') }}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onDrop={handleMainDrop}
                    onDragOver={handleMainDragOver}
                    onDragEnter={handleMainDragEnter}
                    onDragLeave={handleMainDragLeave}
                >
                    {(isLocalLoading || isGeneratingMask) && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20">
                            <SpinnerIcon className="w-10 h-10 text-white"/>
                            <p className="mt-2 text-white text-sm">{isGeneratingMask ? 'AI 마스크 생성 중...' : localLoadingMessage}</p>
                            <button 
                                onClick={handleStopLoading}
                                className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors shadow-md"
                            >
                                중지
                            </button>
                        </div>
                    )}
                    {currentImage ? (
                        <>
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                    willChange: 'transform',
                                    transformOrigin: 'top left',
                                }}
                            >
                                <img
                                    ref={imageRef}
                                    src={currentImage.imageUrl}
                                    alt="수정 이미지"
                                    className="w-full h-full object-contain animate-fade-in"
                                    draggable={false}
                                />
                            </div>
                             {isMaskingMode && currentImage && (
                                <MaskingCanvas 
                                    ref={maskingCanvasRef} 
                                    imageUrl={currentImage.imageUrl}
                                    brushSize={maskBrushSize}
                                    mode={maskMode}
                                />
                            )}
                            <div
                                draggable={true}
                                onDragStart={handleDragHandleStart}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="absolute top-2 left-2 z-10 p-2 bg-black/50 text-white rounded-full cursor-move transition-opacity opacity-50 hover:opacity-100"
                                title="이 이미지를 드래그하여 다른 곳으로 이동"
                            >
                                <ArrowsUpDownLeftRightIcon className="w-5 h-5" />
                            </div>
                        </>
                    ) : (
                        <div className="text-stone-500 text-sm p-4 text-center">여기에 이미지를 드롭하거나, 원본 이미지를 업로드하면 표시됩니다.</div>
                    )}
                    {isMainContainerDragging && !isResetDropTarget && (
                        <div className="absolute inset-0 bg-orange-900/70 border-4 border-dashed border-orange-500 rounded-lg flex flex-col items-center justify-center pointer-events-none z-30 animate-fade-in">
                            <UploadIcon className="w-12 h-12 text-white mb-2" />
                            <p className="text-white font-bold text-lg">이미지를 놓아 수정 시작</p>
                        </div>
                    )}
                    {isTransformed && !isLocalLoading && (
                        <button 
                            onClick={handleCommitTransform}
                            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 hover:bg-green-500 text-white shadow-lg transition-all hover:scale-105"
                        >
                            <CheckIcon className="w-5 h-5"/>
                            현재 뷰로 확정
                        </button>
                    )}
                    {isResetDropTarget && (
                        <div className="absolute inset-0 bg-orange-900/70 border-4 border-dashed border-orange-500 rounded-lg flex flex-col items-center justify-center pointer-events-none z-30 animate-fade-in">
                            <UndoIcon className="w-12 h-12 text-white mb-2" />
                            <p className="text-white font-bold text-lg">원본 이미지로 되돌리기</p>
                        </div>
                    )}
                    {/* New Viewer Button at Bottom Left */}
                    {currentImage && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenImageViewer(currentImage.imageUrl, title, currentImage.prompt);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="absolute bottom-4 left-4 z-20 p-2 bg-black/60 text-white rounded-full hover:bg-orange-600 transition-colors shadow-lg border border-white/20"
                            title="크게 보기"
                        >
                            <ZoomInIcon className="w-6 h-6" />
                        </button>
                    )}
                </div>
            </div>
            
            <div className={`flex flex-col gap-2 p-3 bg-stone-900/50 rounded-lg border min-h-0 transition-all duration-300 ${isActiveTarget ? 'border-amber-400/50' : 'border-stone-700'}`}>
                <div className="flex flex-col gap-3 flex-shrink-0">
                    <h4 className="text-sm font-semibold text-stone-300 flex items-center gap-2 whitespace-nowrap"><PencilIcon className="w-4 h-4 text-orange-400"/>텍스트로 편집 (Nano)</h4>
                    <div className="flex items-center justify-center gap-2 w-full">
                        <button
                            onClick={() => onCopyOriginalToCurrent(studioId)}
                            disabled={!originalImage || isLoading}
                            className="p-2 text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                            title="원본 이미지를 편집창으로 복사"
                        >
                            <DocumentDuplicateIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onRevert(studioId)}
                            disabled={!currentImage || !hasBeenEdited || isLoading}
                            className="p-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                            title="최초로 되돌리기"
                        >
                            <RefreshIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onSaveToHistory(studioId)}
                            disabled={!currentImage || isLoading}
                            className="p-2 text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                            title="히스토리에 저장"
                        >
                            <BookmarkSquareIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onUndo(studioId)}
                            disabled={(session.history?.length ?? 0) <= 1 || isLoading}
                            className="p-2 text-white bg-stone-600 hover:bg-stone-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                            title="이전 수정으로 되돌리기"
                        >
                            <UndoIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleUpscale}
                            disabled={!currentImage || isLoading}
                            className="p-2 text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                            title="1024x1024로 업스케일"
                        >
                            <ArrowsUpDownLeftRightIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                {session.sourceCutForNextEdit ? (
                    <button
                        onClick={() => onSelectTargetCut(studioId)}
                        className="text-xs text-amber-300 bg-amber-900/50 px-2 py-1 rounded-md hover:bg-amber-800/50 transition-colors w-full text-left flex justify-between items-center"
                        title="타겟 컷 변경"
                    >
                        <span><span className="font-semibold">현재 타겟:</span> 컷 #{session.sourceCutForNextEdit}</span>
                        <PencilIcon className="w-3 h-3 inline-block ml-1" />
                    </button>
                ) : (
                    <button
                        onClick={() => onSelectTargetCut(studioId)}
                        className="text-xs text-stone-400 bg-stone-800/50 px-2 py-1 rounded-md hover:bg-stone-700/50 transition-colors w-full text-left flex justify-between items-center"
                        title="타겟 컷 설정"
                    >
                        <span>타겟 컷 없음 (클릭하여 설정)</span>
                        <PencilIcon className="w-3 h-3 inline-block ml-1" />
                    </button>
                )}
                <div className="flex flex-col flex-grow bg-stone-800 rounded-md border border-stone-600 focus-within:ring-2 focus-within:ring-orange-500 focus-within:border-orange-500 overflow-hidden">
                    <textarea
                        value={editPrompt}
                        onChange={(e) => onPromptChange(studioId, e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                if (isLoading) return;

                                if (e.shiftKey) {
                                    // 생성: Cmd/Ctrl + Shift + Enter
                                    if (originalImage && (editPrompt || '').trim()) {
                                        handleCreate();
                                    }
                                } else {
                                    // 수정: Cmd/Ctrl + Enter
                                    if (currentImage && (editPrompt || '').trim()) {
                                        handleEdit();
                                    }
                                }
                            }
                        }}
                        rows={3}
                        className="w-full p-2 text-sm bg-transparent border-none focus:ring-0 resize-none"
                        placeholder="수정: [Cmd/Ctrl]+Enter | 생성: [Cmd/Ctrl]+Shift+Enter"
                        disabled={!originalImage && !currentImage}
                    />
                    
                    <div className="flex gap-2 p-2 bg-stone-800/80 border-t border-stone-700 mt-auto">
                        <button
                            onClick={handleEdit}
                            disabled={!currentImage || !(editPrompt || '').trim() || isLoading}
                            title={!currentImage ? "수정할 이미지가 없습니다." : (!(editPrompt || '').trim() ? "프롬프트를 입력하세요." : "현재 이미지를 수정합니다.")}
                            className="flex-1 flex items-center justify-center py-1.5 text-xs font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <SparklesIcon className="w-4 h-4 mr-1.5" />
                            수정
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={!originalImage || !(editPrompt || '').trim() || isLoading}
                            title={!originalImage ? "원본 이미지가 없습니다." : (!(editPrompt || '').trim() ? "프롬프트를 입력하세요." : "원본 캐릭터를 기반으로 새 이미지를 생성합니다.")}
                            className="flex-1 flex items-center justify-center py-1.5 text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <PencilIcon className="w-4 h-4 mr-1.5" />
                            생성
                        </button>
                    </div>
                </div>
            </div>
            <input type="file" ref={refFileRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'reference')} />
            <input type="file" ref={mainFileRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'main')} />
        </div>
    );
};
