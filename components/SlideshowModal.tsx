
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GeneratedImage, Notification } from '../types';
import { XIcon, PlayIcon, PauseIcon, ArrowLeftIcon, ChevronRightIcon as ArrowRightIcon, SpeakerWaveIcon, SpinnerIcon, VideoCameraIcon, UndoIcon, RewindIcon, TrashIcon, UploadIcon, PlusIcon, ArrowTopRightOnSquareIcon } from './icons';
import { applySmartLineBreaks } from '../utils/textUtils';

interface SlideshowItem {
    image: GeneratedImage | null;
    narration: string;
    audioDataUrls?: string[];
    cutNumber: string;
}

interface SlideshowModalProps {
    isOpen: boolean;
    onClose: () => void;
    slideshowItems: SlideshowItem[];
    storyTitle: string | null;
    generateSpeech: (narration: string) => Promise<{ audioBase64: string; tokenCount: number; }>;
    addNotification: (message: string, type: Notification['type']) => void;
    handleAddUsage: (geminiTokens: number, dalleImages: number) => void;
    backgroundMusicUrl: string | null;
}

const LOGO_DATA_URL = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAoDSURBVHhe7Vvrb9vGFh+9/xV0gE1i5wE5cBMfJgESpGmaBsmQdE2SDEmXNE2CBEiCBMjADbxy3LhO8hY+4sZx3fG4yW9/Xf+kF25s0+I4juM4jq539/vD1KmfOnWqfHrvu5v/4vj3l/j+w/l+GPL63D1sP9s/V8f66eR6hA9hYhA2BmFjEDYGYWMQNgbhI00Mgn09/VnC4c5+Qvj45/8D4fMfhY+xMQgbg7AxCBtBfAzCxhgEYWPi/25i4uO68f7VvV/vP52E5+vV3+fnF72IjcH2Eja/j+FfW8QgbAzCxiBsDMLGEDaGsDEIG4OwMQgbQ9gYhA2BmFjEDYGYWMQNgbhYxE2BmAhEDYGYSN8TML69u/fH+r0w03e9u3b19q+/0j6u71sP9s/V8f66eR6hA9hYhA2BmFjEDYGYWMQNgbhI9MbhKeffvrrDz8chO+f9+Hh4ev9/f1t/6P4vM4D3M/6z28uB4eHh5vxeDzz27fM3//tXb1eP5vNdnV+fn6kEHYGYSNwA5+R/d/r8Xj27dvX/T8S+3NxcXHJkiULt2/fPnnyZOfOnf0dCAkbww3Anp6euru72+329fX1u3btWlZWVlNTk+Li4u3t7d7e3n5DCAkbw42D7e3t7e3t7e3tNzc3z549a+PGjUuXLp0xY8bExMTc3Nzc3Ny8vLxAQED4Y4SNYUYGdnZ2lpWVzZ8/f86cOfPlyxcWFhYuLi4nJ6eBgYHu7u7+/n4hEDaGWQg0m82lpSUbNmzYvXv3tKlTx48fP3z48IEDB0aPHj1w4MA9e/ZUVVUlJiYmJiZWVlZ6enpqamp6/mP8y8bGRmNjY/P5vF6vX6/Xh4eHu7q6urq6mpubW1paWltbKz7QEDYGYSNwhk5JSVleXh4bGzs7O/v4+KSkpFRUVGhoaJiZmYWFhYaGhgcPHgAAQNgYhI3AGeTzeU1NLS0tLS0tLXV1dX1/f8ePHa2pq/v3vf9+xY8e4cWN7e/tly5ZFRUU9ePCg1Wo9PT39/PxCQkL27ds3Njb6/P4hEDYGYWMQB2h9ff0JEyYUFBTs379/8uTJQ4cOHT9+fP58+XPnzh04cODcuXObN28+cuRIQUFBVFRUUlJSVlZWUFDwyJEjhw8fnpycvHjx4rKysoCAgNzc3KAg7AzCxiBsDMLGEIgFAqFQqFQKBQKhUKhUqlcLjcbDIbX6w0EAmFjEDYGYWMQNkZhpP5/ADG5u8qC8J9QAAAAAElFTSuQmCC`;

const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const decodePCMAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number
): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        // CORS FIX: Append timestamp to bypass cache if it's an external URL
        const isLocal = src.startsWith('data:') || src.startsWith('blob:');
        const safeSrc = isLocal ? src : `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`;
        img.src = safeSrc;

        img.onload = () => resolve(img);
        img.onerror = (err: Event | string) => reject(new Error(typeof err === 'string' ? err : `Failed to load image at ${src}`));
    });
};

const getSfxOffsetByName = (name: string): number => {
    if (!name) return 0;
    const lower = name.toLowerCase();
    const whooshKeywords = ['whoosh', 'swing', 'slide', '휘릭', '휙', '사락', 'page', '책', '넘기'];
    const popKeywords = ['pop', 'click', 'hit', '탁', '뽁', '찰칵', '뾱'];

    if (whooshKeywords.some(k => lower.includes(k))) return 0.1; // 약 3~4프레임 전 (30fps 기준)
    if (popKeywords.some(k => lower.includes(k))) return 0.04;  // 약 1.2프레임 전
    return 0;
};

// Helper to find supported MIME type for MediaRecorder (Safari/iOS compatibility)
const getSupportedMimeType = () => {
    const types = [
        'video/webm; codecs=vp9',
        'video/webm; codecs=vp8',
        'video/webm',
        'video/mp4'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return ''; // Browser default
};

interface VideoSegment {
    image: HTMLImageElement | null;
    narrationToDraw: string;
    narrationForLayout: string;
    audioSlice: AudioBuffer;
    duration: number;
    zoomTimeOffset: number;
    cutIndex: number; 
}

const ZOOM_RATE_PER_SECOND = 0.03; // 초당 0.03 (3% 확대)

export const SlideshowModal: React.FC<SlideshowModalProps> = ({
    isOpen, onClose, slideshowItems, storyTitle, generateSpeech, addNotification, handleAddUsage, backgroundMusicUrl,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sortBy, setSortBy] = useState<'creation' | 'cutNumber'>('cutNumber');
    const [isClosing, setIsClosing] = useState(false);
    const [isExternal, setIsExternal] = useState(false);
    const externalWindowRef = useRef<Window | null>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

    const [isPreparingAudio, setIsPreparingAudio] = useState(false);
    const [preparingMessage, setPreparingMessage] = useState('');
    const audioCacheRef = useRef<Map<string, AudioBuffer | 'failed' | 'empty'>>(new Map());
    const audioContextRef = useRef<AudioContext | null>(null);
    const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    
    const bgmAudioBufferRef = useRef<AudioBuffer | null>(null);
    const bgmSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const bgmGainNodeRef = useRef<GainNode | null>(null);
    const bgmOffsetRef = useRef(0);
    const bgmStartTimeRef = useRef(0);

    const [sfxEnabled, setSfxEnabled] = useState(true);
    const internalSfxBuffersRef = useRef<AudioBuffer[]>([]);
    const [customSfx1, setCustomSfx1] = useState<AudioBuffer | null>(null);
    const [customSfx2, setCustomSfx2] = useState<AudioBuffer | null>(null);
    const [customRandomSfxPool, setCustomRandomSfxPool] = useState<AudioBuffer[]>([]);
    const [customSfxFileNames, setCustomSfxFileNames] = useState<{fixed1?: string, fixed2?: string, random: string[]}>({ random: [] });

    const [isDraggingSfx1, setIsDraggingSfx1] = useState(false);
    const [isDraggingSfx2, setIsDraggingSfx2] = useState(false);
    const [isDraggingRandom, setIsDraggingRandom] = useState(false);

    const timeoutRef = useRef<{ lineTimeouts: number[]; slideTimeout: number | null; } | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [exportMessage, setExportMessage] = useState('');
    const [visibleNarration, setVisibleNarration] = useState('');
    const animationFrameIdRef = useRef<number | null>(null);

    const lastImageIdRef = useRef<string | null>(null);
    const currentZoomScaleRef = useRef<number>(1.0);
    const lastFrameTimeRef = useRef<number>(0);

    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const logoImageRef = useRef<HTMLImageElement | null>(null);
    const [currentImageElement, setCurrentImageElement] = useState<HTMLImageElement | null>(null);

    const createSynthesizedBuffers = useCallback(async (ctx: AudioContext) => {
        const generate = async (type: 'whoosh1' | 'whoosh2' | 'pop' | 'chime' | 'tink'): Promise<AudioBuffer> => {
            const duration = type === 'pop' || type === 'tink' ? 0.15 : 0.4;
            const offlineCtx = new OfflineAudioContext(1, ctx.sampleRate * duration, ctx.sampleRate);
            const osc = offlineCtx.createOscillator();
            const gain = offlineCtx.createGain();
            const filter = offlineCtx.createBiquadFilter();

            gain.gain.setValueAtTime(0, 0);
            gain.gain.linearRampToValueAtTime(0.5, 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, duration);

            if (type === 'whoosh1') {
                const noise = offlineCtx.createBufferSource();
                const bufferSize = ctx.sampleRate * duration;
                const buffer = offlineCtx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for(let i=0; i<bufferSize; i++) data[i] = Math.random() * 2 - 1;
                noise.buffer = buffer;
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(800, 0);
                filter.frequency.exponentialRampToValueAtTime(6000, duration);
                noise.connect(filter).connect(gain).connect(offlineCtx.destination);
                noise.start(0);
            } else if (type === 'whoosh2') {
                const noise = offlineCtx.createBufferSource();
                const buffer = offlineCtx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for(let i=0; i<data.length; i++) data[i] = Math.random() * 2 - 1;
                noise.buffer = buffer;
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(2000, 0);
                filter.frequency.exponentialRampToValueAtTime(400, duration);
                noise.connect(filter).connect(gain).connect(offlineCtx.destination);
                noise.start(0);
            } else if (type === 'pop') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, 0);
                osc.frequency.exponentialRampToValueAtTime(200, 0.1);
                osc.connect(gain).connect(offlineCtx.destination);
                osc.start(0);
            } else if (type === 'chime') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(1200, 0);
                osc.connect(gain).connect(offlineCtx.destination);
                osc.start(0);
            } else { // tink
                osc.type = 'sine';
                osc.frequency.setValueAtTime(3000, 0);
                osc.connect(gain).connect(offlineCtx.destination);
                osc.start(0);
            }

            return await offlineCtx.startRendering();
        };

        const buffers = await Promise.all([
            generate('whoosh1'), generate('whoosh2'), generate('pop'), generate('chime'), generate('tink')
        ]);
        internalSfxBuffersRef.current = buffers;
    }, []);

    const getSfxForIndex = useCallback((index: number): { buffer: AudioBuffer, name: string } | null => {
        if (!sfxEnabled) return null;
        const cycleIndex = index % 3;
        if (cycleIndex === 0) return { buffer: customSfx1 || internalSfxBuffersRef.current[0], name: customSfxFileNames.fixed1 || 'whoosh1' };
        if (cycleIndex === 1) return { buffer: customSfx2 || internalSfxBuffersRef.current[1], name: customSfxFileNames.fixed2 || 'whoosh2' };
        if (customRandomSfxPool.length > 0) {
            const rIdx = Math.floor(Math.random() * customRandomSfxPool.length);
            return { buffer: customRandomSfxPool[rIdx], name: customSfxFileNames.random[rIdx] || 'random' };
        }
        const fallbacks = internalSfxBuffersRef.current.slice(2);
        if (fallbacks.length === 0) return null;
        return { buffer: fallbacks[Math.floor(Math.random() * fallbacks.length)], name: 'pop' };
    }, [sfxEnabled, customSfx1, customSfx2, customRandomSfxPool, customSfxFileNames]);

    const playSfx = useCallback((buffer: AudioBuffer) => {
        if (!audioContextRef.current || !sfxEnabled) return;
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        const gain = audioContextRef.current.createGain();
        gain.gain.value = 0.30; 
        source.connect(gain).connect(audioContextRef.current.destination);
        source.start(0);
    }, [sfxEnabled]);

    const handleSfxUpload = async (files: FileList | ArrayLike<File> | null, type: 'fixed1' | 'fixed2' | 'random') => {
        if (!files || !audioContextRef.current) return;
        const ctx = audioContextRef.current;
        for (const file of Array.from(files)) {
            if (!file.type.startsWith('audio/')) { addNotification(`오디오 파일만 지원됩니다: ${file.name}`, 'error'); continue; }
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                if (type === 'fixed1') { setCustomSfx1(audioBuffer); setCustomSfxFileNames(prev => ({ ...prev, fixed1: file.name })); }
                else if (type === 'fixed2') { setCustomSfx2(audioBuffer); setCustomSfxFileNames(prev => ({ ...prev, fixed2: file.name })); }
                else { setCustomRandomSfxPool(prev => [...prev, audioBuffer]); setCustomSfxFileNames(prev => ({ ...prev, random: [...prev.random, file.name] })); }
            } catch (e) { addNotification(`SFX 파일 로딩 실패: ${file.name}`, 'error'); }
        }
    };

    const handleSfxDrop = (e: React.DragEvent<HTMLDivElement>, type: 'fixed1' | 'fixed2' | 'random') => {
        e.preventDefault(); e.stopPropagation();
        if (type === 'fixed1') setIsDraggingSfx1(false);
        else if (type === 'fixed2') setIsDraggingSfx2(false);
        else setIsDraggingRandom(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleSfxUpload(e.dataTransfer.files, type);
    };

    const handleSfxDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
    const handleSfxDragEnter = (e: React.DragEvent<HTMLDivElement>, type: 'fixed1' | 'fixed2' | 'random') => {
        e.preventDefault(); e.stopPropagation();
        if (type === 'fixed1') setIsDraggingSfx1(true); else if (type === 'fixed2') setIsDraggingSfx2(true); else setIsDraggingRandom(true);
    };
    const handleSfxDragLeave = (e: React.DragEvent<HTMLDivElement>, type: 'fixed1' | 'fixed2' | 'random') => {
        e.preventDefault(); e.stopPropagation();
        if (type === 'fixed1') setIsDraggingSfx1(false); else if (type === 'fixed2') setIsDraggingSfx2(false); else setIsDraggingRandom(false);
    };

    const removeCustomSfx = (type: 'fixed1' | 'fixed2' | 'random', index?: number) => {
        if (type === 'fixed1') { setCustomSfx1(null); setCustomSfxFileNames(prev => ({ ...prev, fixed1: undefined })); }
        else if (type === 'fixed2') { setCustomSfx2(null); setCustomSfxFileNames(prev => ({ ...prev, fixed2: undefined })); }
        else if (typeof index === 'number') { setCustomRandomSfxPool(prev => prev.filter((_, i) => i !== index)); setCustomSfxFileNames(prev => ({ ...prev, random: prev.random.filter((_, i) => i !== index) })); }
    };

    const measureAndWrapText = useCallback((ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, shouldDraw: boolean): number => {
        if (!text) return 0;
        const allLines = text.split('\n');
        let currentY = y;
        for (const singleLine of allLines) {
            if (singleLine.trim() === '') { currentY += lineHeight * 0.5; continue; }
            const words = singleLine.split(' ');
            let line = '';
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && n > 0) {
                    if (shouldDraw) ctx.fillText(line.trim(), x, currentY);
                    line = words[n] + ' '; currentY += lineHeight;
                } else line = testLine;
            }
            if (shouldDraw) ctx.fillText(line.trim(), x, currentY);
            currentY += lineHeight;
        }
        return currentY - y;
    }, []);
    
    const drawFrame = useCallback((ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, logoImg: HTMLImageElement, narration: string, narrationForLayout: string, title: string, scale: number = 1) => {
        const canvas = ctx.canvas;
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        const headerHeight = 254; ctx.fillStyle = '#FDEFC8'; ctx.fillRect(0, 0, canvasWidth, headerHeight);
        ctx.fillStyle = 'black'; ctx.font = 'bold 58px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('썰 타는중~', canvasWidth / 2, headerHeight - 64);
        ctx.drawImage(logoImg, canvasWidth - 140, (headerHeight - 80) / 2, 80, 80);
        ctx.fillStyle = '#475569'; ctx.fillRect(0, headerHeight, canvasWidth, 1);
        
        const contentPadding = 48; let currentY = headerHeight + contentPadding;
        ctx.fillStyle = '#1F2937'; ctx.font = '900 53px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const titleHeight = measureAndWrapText(ctx, title, contentPadding, currentY, canvasWidth - contentPadding * 2, 64, true);
        currentY += titleHeight + 16;
        ctx.fillStyle = '#A1A1AA'; ctx.font = '33px sans-serif';
        const stats = `${String.fromCharCode(94, 94)} | 13:35 | 조회 15,488,575`; ctx.fillText(stats, contentPadding, currentY);
        currentY += 33 + 16; ctx.fillStyle = '#475569'; ctx.fillRect(0, currentY, canvasWidth, 1);
        
        const contentStartTop = currentY + 80;
        const lineHeight = 80;

        ctx.font = `bold 56px sans-serif`;
        const textBlockHeight = measureAndWrapText(ctx, narrationForLayout, canvasWidth / 2, 0, canvasWidth - contentPadding * 2, lineHeight, false);
        const contentDrawY = contentStartTop;

        ctx.fillStyle = '#374151'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        measureAndWrapText(ctx, narration, canvasWidth / 2, contentDrawY, canvasWidth - contentPadding * 2, lineHeight, true);
        
        if (img) {
            const spacing = 60;
            const imagePadding = 94;
            const boxWidth = canvasWidth - imagePadding * 2;
            const boxHeight = boxWidth;
            const imageY = contentDrawY + textBlockHeight + spacing;
            const boxX = imagePadding; const boxY = imageY;
            const imgAspectRatio = img.naturalWidth / img.naturalHeight; const boxAspectRatio = boxWidth / boxHeight;
            let finalDrawWidth, finalDrawHeight;
            if (imgAspectRatio > boxAspectRatio) { finalDrawHeight = boxHeight; finalDrawWidth = boxHeight * imgAspectRatio; } else { finalDrawWidth = boxWidth; finalDrawHeight = boxWidth / imgAspectRatio; }
            const finalX = boxX + (boxWidth - finalDrawWidth) / 2; const finalY = boxY + (boxHeight - finalDrawHeight) / 2;
            const scaledWidth = finalDrawWidth * scale; const scaledHeight = finalDrawHeight * scale;
            const scaledX = finalX - (scaledWidth - finalDrawWidth) / 2; const scaledY = finalY - (scaledHeight - finalDrawHeight) / 2;
            
            ctx.save();
            ctx.beginPath();
            const radius = 24;
            ctx.moveTo(boxX + radius, boxY);
            ctx.lineTo(boxX + boxWidth - radius, boxY);
            ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
            ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
            ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
            ctx.lineTo(boxX + radius, boxY + boxHeight);
            ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
            ctx.lineTo(boxX, boxY + radius);
            ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, scaledX, scaledY, scaledWidth, scaledHeight);
            ctx.restore();
        }
    }, [measureAndWrapText]);

    const sortedItems = React.useMemo(() => {
        if (sortBy === 'creation') {
            const items = [...slideshowItems];
            return items.sort((a, b) => {
                const aHasImage = !!a.image; const bHasImage = !!b.image;
                if (aHasImage && !bHasImage) return -1; if (!aHasImage && bHasImage) return 1;
                if (aHasImage && bHasImage) return new Date(a.image!.createdAt).getTime() - new Date(b.image!.createdAt).getTime();
                return 0;
            });
        }
        return slideshowItems;
    }, [slideshowItems, sortBy]);

    const stopBgm = useCallback(() => {
        if (bgmSourceNodeRef.current) { try { bgmSourceNodeRef.current.stop(); } catch (e) { } bgmSourceNodeRef.current.disconnect(); bgmSourceNodeRef.current = null; }
        if (bgmGainNodeRef.current) { bgmGainNodeRef.current.disconnect(); bgmGainNodeRef.current = null; }
    }, []);

    const cleanupTimersAndAudio = useCallback(() => {
        if (currentAudioSourceRef.current) { currentAudioSourceRef.current.onended = null; try { currentAudioSourceRef.current.stop(); } catch (e) { } currentAudioSourceRef.current = null; }
        if (timeoutRef.current) { timeoutRef.current.lineTimeouts.forEach(clearTimeout); if (timeoutRef.current.slideTimeout) clearTimeout(timeoutRef.current.slideTimeout); timeoutRef.current = null; }
        if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
    }, []);

    const handleClose = useCallback(() => {
        cleanupTimersAndAudio(); stopBgm(); bgmOffsetRef.current = 0; setIsPlaying(false); currentZoomScaleRef.current = 1.0; lastImageIdRef.current = null; setIsClosing(true);
        if (externalWindowRef.current) {
            externalWindowRef.current.close();
            externalWindowRef.current = null;
        }
        // CLEANUP: Close AudioContext to release hardware resources
        if (audioContextRef.current) {
            audioContextRef.current.close().then(() => {
                audioContextRef.current = null;
            }).catch(e => console.error("Error closing AudioContext:", e));
        }
        
        setTimeout(() => { onClose(); setIsClosing(false); setIsExternal(false); }, 300);
    }, [onClose, cleanupTimersAndAudio, stopBgm]);
    
    const goToNext = useCallback(() => {
        cleanupTimersAndAudio();
        if (sortedItems.length > 0) setCurrentIndex(prev => Math.min(prev + 1, sortedItems.length - 1));
    }, [sortedItems, cleanupTimersAndAudio]);

    const goToPrev = useCallback(() => {
        cleanupTimersAndAudio();
        if (sortedItems.length > 0) setCurrentIndex(prev => Math.max(0, prev - 1));
    }, [sortedItems.length, cleanupTimersAndAudio]);

    const handleUseAttachedAudio = useCallback(async () => {
        // Ensure AudioContext is initialized if missing
        if (!audioContextRef.current) {
             try { audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }); } catch (e) { console.error(e); }
        }
        if (!audioContextRef.current) return;

        setIsPreparingAudio(true);
        const attachedAudioItems = sortedItems.filter(item => item.audioDataUrls && item.audioDataUrls.length > 0);
        if (attachedAudioItems.length === 0) { setIsPreparingAudio(false); return; }
        let totalFiles = attachedAudioItems.reduce((acc, item) => acc + (item.audioDataUrls?.length || 0), 0);
        let processedFiles = 0;
        for (const item of attachedAudioItems) {
            for (let i = 0; i < (item.audioDataUrls?.length || 0); i++) {
                processedFiles++; const url = item.audioDataUrls![i]; const cacheKey = `${item.cutNumber}-${i}`;
                if (audioCacheRef.current.has(cacheKey)) continue;
                setPreparingMessage(`첨부 오디오 로딩 중... (${processedFiles}/${totalFiles})`);
                try {
                    const response = await fetch(url); const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer); audioCacheRef.current.set(cacheKey, audioBuffer);
                } catch (error) {
                    console.error(`Failed to load attached audio for cut ${item.cutNumber}:`, error);
                    audioCacheRef.current.set(cacheKey, 'failed'); addNotification(`컷 #${item.cutNumber}의 첨부 오디오 로딩 실패`, 'error');
                }
            }
        }
        setIsPreparingAudio(false); setPreparingMessage(''); addNotification("첨부된 오디오를 모두 불러왔습니다.", "success");
    }, [addNotification, sortedItems]);

    useEffect(() => {
        if (isOpen) {
            if (!audioContextRef.current) {
                try { audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }); } catch (e) {
                    console.error("Web Audio API not supported", e); addNotification("이 브라우저에서는 오디오 재생이 지원되지 않습니다.", "error");
                }
            }
            if (audioContextRef.current) {
                createSynthesizedBuffers(audioContextRef.current);
                loadImage(LOGO_DATA_URL).then(img => logoImageRef.current = img);
            }
            if (backgroundMusicUrl && audioContextRef.current) {
                fetch(backgroundMusicUrl).then(res => res.arrayBuffer()).then(arrayBuffer => audioContextRef.current!.decodeAudioData(arrayBuffer)).then(audioBuffer => {
                    bgmAudioBufferRef.current = audioBuffer; bgmOffsetRef.current = 0;
                }).catch(err => { console.error("Failed to load background music:", err); addNotification("배경음악 로딩 실패.", "error"); });
            } else { bgmAudioBufferRef.current = null; bgmOffsetRef.current = 0; }
            handleUseAttachedAudio();
        } else { 
            // Cleanup on unexpected unmount
            audioCacheRef.current.clear(); 
            bgmAudioBufferRef.current = null; 
            bgmOffsetRef.current = 0; 
            logoImageRef.current = null;
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(e => console.error(e));
                audioContextRef.current = null;
            }
        }
    }, [isOpen, backgroundMusicUrl, addNotification, handleUseAttachedAudio, createSynthesizedBuffers]);

    const playSequenceForCut = useCallback((item: SlideshowItem, onSequenceEnd: () => void) => {
        if (!audioContextRef.current) { onSequenceEnd(); return; }
        const attachedUrls = item.audioDataUrls || [];
        const playTrack = (trackIndex: number) => {
            let buffer: AudioBuffer | 'failed' | 'empty' | undefined; let isAttached = false;
            if (attachedUrls.length > 0) { buffer = audioCacheRef.current.get(`${item.cutNumber}-${trackIndex}`); isAttached = true; }
            else { if (trackIndex === 0) buffer = audioCacheRef.current.get(item.cutNumber); }
            if (buffer instanceof AudioBuffer) {
                if (audioContextRef.current!.state === 'suspended') audioContextRef.current!.resume();
                const source = audioContextRef.current!.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = isAttached ? 1.0 : 1.3;
                
                const narrationGain = audioContextRef.current!.createGain();
                narrationGain.gain.value = 0.95;
                source.connect(narrationGain).connect(audioContextRef.current!.destination);

                source.onended = () => {
                    currentAudioSourceRef.current = null;
                    const hasMoreAttached = isAttached && trackIndex < attachedUrls.length - 1;
                    if (hasMoreAttached) playTrack(trackIndex + 1); else onSequenceEnd();
                };
                source.start(0); currentAudioSourceRef.current = source;
            } else onSequenceEnd();
        };
        playTrack(0);
    }, []);

    const togglePlayPause = useCallback((isEnd = false) => {
        const nextIsPlaying = !isPlaying; setIsPlaying(nextIsPlaying);
        if (nextIsPlaying) {
            if (bgmAudioBufferRef.current && !bgmSourceNodeRef.current && audioContextRef.current) {
                const source = audioContextRef.current.createBufferSource(); source.buffer = bgmAudioBufferRef.current; source.loop = true;
                const gainNode = audioContextRef.current.createGain(); gainNode.gain.value = 0; bgmGainNodeRef.current = gainNode;
                source.connect(gainNode).connect(audioContextRef.current.destination);
                const offset = bgmOffsetRef.current % bgmAudioBufferRef.current.duration; source.start(0, offset);
                bgmStartTimeRef.current = audioContextRef.current.currentTime; bgmSourceNodeRef.current = source;
                gainNode.gain.linearRampToValueAtTime(0.21, audioContextRef.current.currentTime + 0.5); 
            }
        } else {
            cleanupTimersAndAudio();
            if (bgmSourceNodeRef.current && audioContextRef.current) { const elapsed = audioContextRef.current.currentTime - bgmStartTimeRef.current; bgmOffsetRef.current += elapsed; }
            if (bgmGainNodeRef.current && audioContextRef.current) bgmGainNodeRef.current.gain.linearRampToValueAtTime(0, audioContextRef.current.currentTime + 0.1);
            setTimeout(() => stopBgm(), 100); if (isEnd) bgmOffsetRef.current = 0;
        }
    }, [isPlaying, cleanupTimersAndAudio, stopBgm]);

    const currentItem = sortedItems[currentIndex];

    const handleExportToVideo = async (options: { includeBgm: boolean, includeSfx: boolean } = { includeBgm: true, includeSfx: true }) => {
        const itemsToExport = sortedItems.filter(item => item.narration && item.narration.trim() !== "");
        if (itemsToExport.length === 0 || !audioContextRef.current) { addNotification("내보낼 항목이 없습니다.", "info"); return; }
        setIsExporting(true); setExportMessage('오디오 트랙 준비 중...');
        const audioCtx = audioContextRef.current; if (audioCtx.state === 'suspended') await audioCtx.resume();
        try {
            const loadedImages: (HTMLImageElement | null)[] = await Promise.all([loadImage(LOGO_DATA_URL), ...itemsToExport.map(item => item.image ? loadImage(item.image.imageUrl) : Promise.resolve(null))]);
            const [logoImage, ...imageElements] = loadedImages as [HTMLImageElement, ...(HTMLImageElement | null)[]];
            const allSegments: VideoSegment[] = [];
            for (let i = 0; i < itemsToExport.length; i++) {
                const item = itemsToExport[i]; const image = imageElements[i];
                const formattedNarration = applySmartLineBreaks(item.narration || '');
                const allLinesForChunking = formattedNarration.split('\n'); const displayChunks: string[] = []; let currentChunkPrefix = '';
                for (const line of allLinesForChunking) { if (line.trim() !== '') { displayChunks.push(currentChunkPrefix + line); currentChunkPrefix = ''; } else currentChunkPrefix += '\n'; }
                const meaningChunks = formattedNarration.split(/\n\s*\n/); const chunkBoundaries: string[] = []; let tempNarrationForBoundary = '';
                for (const chunk of meaningChunks) { tempNarrationForBoundary += (tempNarrationForBoundary ? '\n\n' : '') + chunk; chunkBoundaries.push(tempNarrationForBoundary); }
                let fullAudioBuffer: AudioBuffer | null = null; const attachedUrls = item.audioDataUrls || [];
                if (attachedUrls.length > 0) {
                    const buffers = attachedUrls.map((_, j) => audioCacheRef.current.get(`${item.cutNumber}-${j}`)).filter(b => b instanceof AudioBuffer) as AudioBuffer[];
                    if(buffers.length > 0) {
                        const totalLength = buffers.reduce((sum, b) => sum + b.length, 0); const concatenated = audioCtx.createBuffer(1, totalLength, audioCtx.sampleRate);
                        const channel = concatenated.getChannelData(0); let offset = 0;
                        buffers.forEach(b => { const sourceData = b.getChannelData(0); if (offset + sourceData.length <= channel.length) channel.set(sourceData, offset); offset += b.length; });
                        fullAudioBuffer = concatenated;
                    }
                } else { const ttsBuffer = audioCacheRef.current.get(item.cutNumber); if (ttsBuffer instanceof AudioBuffer) fullAudioBuffer = ttsBuffer; }
                if (displayChunks.length === 0 || (displayChunks.length === 1 && displayChunks[0].trim() === '')) {
                    const lines = formattedNarration.split('\n').filter(line => line.trim()); const duration = fullAudioBuffer ? fullAudioBuffer.duration : Math.max(2.0, lines.length * 1.0);
                    let audioSlice = fullAudioBuffer || audioCtx.createBuffer(1, Math.round(audioCtx.sampleRate * duration), audioCtx.sampleRate);
                    allSegments.push({ image, narrationToDraw: formattedNarration, narrationForLayout: formattedNarration, audioSlice, duration: audioSlice.duration, zoomTimeOffset: 0, cutIndex: i });
                } else {
                    const totalSampleCount = fullAudioBuffer ? fullAudioBuffer.length : Math.round(Math.max(2.0, displayChunks.length * 1.0) * audioCtx.sampleRate);
                    const totalTextLength = displayChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                    let cumulativeNarration = '', currentSampleOffset = 0, currentImageElapsedTime = 0;
                    for (let j = 0; j < displayChunks.length; j++) {
                        cumulativeNarration = displayChunks.slice(0, j + 1).join('\n'); let narrationForLayout = chunkBoundaries.length > 0 ? chunkBoundaries[chunkBoundaries.length - 1] : formattedNarration;
                        for (const boundary of chunkBoundaries) if (cumulativeNarration.length < boundary.length + 2) { narrationForLayout = boundary; break; }
                        const weight = totalTextLength > 0 ? displayChunks[j].length / totalTextLength : 1 / displayChunks.length;
                        let samplesForLine = j === displayChunks.length - 1 ? totalSampleCount - currentSampleOffset : Math.floor(totalSampleCount * weight);
                        samplesForLine = Math.max(1, samplesForLine); const durationForLine = samplesForLine / audioCtx.sampleRate;
                        let audioSlice = audioCtx.createBuffer(1, samplesForLine, audioCtx.sampleRate);
                        if (fullAudioBuffer && currentSampleOffset < fullAudioBuffer.length) {
                            const endSample = Math.min(currentSampleOffset + samplesForLine, fullAudioBuffer.length); const actualLength = endSample - currentSampleOffset;
                            if (actualLength > 0) audioSlice.getChannelData(0).set(fullAudioBuffer.getChannelData(0).subarray(currentSampleOffset, endSample));
                        }
                        allSegments.push({ image, narrationToDraw: cumulativeNarration, narrationForLayout, audioSlice, duration: audioSlice.duration, zoomTimeOffset: currentImageElapsedTime, cutIndex: i });
                        currentSampleOffset += samplesForLine; currentImageElapsedTime += durationForLine;
                    }
                }
            }
            if (allSegments.length > 0) allSegments[allSegments.length - 1].duration += 1.0;
            const totalDuration = allSegments.reduce((sum, seg) => sum + seg.duration, 0); const totalLength = Math.ceil(totalDuration * audioCtx.sampleRate);
            setExportMessage('오디오 믹싱 및 마스터링 중...');
            const offlineCtx = new OfflineAudioContext(1, totalLength, audioCtx.sampleRate);
            
            const narrationConcatenated = audioCtx.createBuffer(1, totalLength, audioCtx.sampleRate); const narrOut = narrationConcatenated.getChannelData(0); let offset = 0;
            for (const segment of allSegments) { if (offset + segment.audioSlice.length <= narrOut.length) narrOut.set(segment.audioSlice.getChannelData(0), offset); offset += segment.audioSlice.length; }
            const narrationSource = offlineCtx.createBufferSource(); narrationSource.buffer = narrationConcatenated;
            const narrationGain = offlineCtx.createGain();
            narrationGain.gain.value = 0.95;
            narrationSource.connect(narrationGain).connect(offlineCtx.destination);
            narrationSource.start(0);

            if (options.includeBgm && bgmAudioBufferRef.current) {
                const bgmSource = offlineCtx.createBufferSource(); bgmSource.buffer = bgmAudioBufferRef.current; bgmSource.loop = true;
                const bgmGain = offlineCtx.createGain(); bgmGain.gain.value = 0.21; bgmSource.connect(bgmGain).connect(offlineCtx.destination);
                bgmSource.start(0);
            }

            if (options.includeSfx) {
                let cumulativeMixingTime = 0; let lastMixedCutIndex = -1;
                for (const segment of allSegments) {
                    if (segment.cutIndex > lastMixedCutIndex) {
                        const sfxData = getSfxForIndex(segment.cutIndex);
                        if (sfxData) {
                            const sfxOffset = getSfxOffsetByName(sfxData.name);
                            const sfxSource = offlineCtx.createBufferSource(); sfxSource.buffer = sfxData.buffer;
                            const sfxGain = offlineCtx.createGain(); sfxGain.gain.value = 0.30; sfxSource.connect(sfxGain).connect(offlineCtx.destination);
                            sfxSource.start(Math.max(0, cumulativeMixingTime - sfxOffset));
                        }
                        lastMixedCutIndex = segment.cutIndex;
                    }
                    cumulativeMixingTime += segment.duration;
                }
            }

            const finalAudioBuffer = await offlineCtx.startRendering();
            const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
            const canvasCtx = canvas.getContext('2d', { alpha: false }); if (!canvasCtx) throw new Error("Canvas init failed");
            const videoStream = canvas.captureStream(30); 
            
            const realTimeAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioDestination = realTimeAudioCtx.createMediaStreamDestination();
            const audioSource = realTimeAudioCtx.createBufferSource(); audioSource.buffer = finalAudioBuffer; audioSource.connect(audioDestination);
            
            const combinedStream = new MediaStream([...videoStream.getTracks(), ...audioDestination.stream.getTracks()]);
            const recordedChunks: Blob[] = [];
            
            // DYNAMIC MIME TYPE DETECTION FOR SAFARI
            const mimeType = getSupportedMimeType();
            const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: 10000000 };
            if (mimeType) {
                recorderOptions.mimeType = mimeType;
            } else {
                console.warn("No specific MIME type supported, using browser default.");
            }

            const recorder = new MediaRecorder(combinedStream, recorderOptions);
            recorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunks.push(event.data); };
            recorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: mimeType || 'video/webm' }); 
                if (blob.size === 0) { 
                    addNotification("내보내기 실패", "error"); 
                    setIsExporting(false); 
                    realTimeAudioCtx.close(); 
                    return; 
                }
                const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.style.display = 'none'; document.body.appendChild(a); a.href = url;
                const modeSuffix = (!options.includeBgm && !options.includeSfx) ? '_narration_only' : '';
                const safeTitle = (storyTitle || 'storyboard').replace(/[\\/\\?%*:|"<>]/g, '_'); 
                
                // Determine file extension
                let extension = 'webm';
                if (mimeType.includes('mp4')) extension = 'mp4';
                
                a.download = `${safeTitle}${modeSuffix}.${extension}`; a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100); 
                setIsExporting(false);
                realTimeAudioCtx.close();
            };

            recorder.start(); 
            audioSource.start(0);
            const exportStartTime = realTimeAudioCtx.currentTime;

            const renderLoop = () => {
                const currentTime = realTimeAudioCtx.currentTime - exportStartTime;
                if (currentTime >= totalDuration) { recorder.stop(); return; }

                let currentSegmentIndex = 0; let timeIntoSegments = 0;
                while (currentSegmentIndex < allSegments.length - 1 && timeIntoSegments + allSegments[currentSegmentIndex].duration < currentTime) { timeIntoSegments += allSegments[currentSegmentIndex].duration; currentSegmentIndex++; }
                const currentSegment = allSegments[currentSegmentIndex];
                const timeWithinSegment = currentTime - timeIntoSegments;
                const scale = 1.0 + ZOOM_RATE_PER_SECOND * (timeWithinSegment + currentSegment.zoomTimeOffset);
                
                if (currentSegment) drawFrame(canvasCtx, currentSegment.image, logoImage, currentSegment.narrationToDraw, currentSegment.narrationForLayout, storyTitle || '', scale);
                setExportMessage(`영상 생성 중... (${Math.round(currentTime)}s / ${Math.round(totalDuration)}s)`);
                requestAnimationFrame(renderLoop);
            };
            requestAnimationFrame(renderLoop);

        } catch(error) { console.error(error); addNotification(`영상 내보내기 실패`, "error"); setIsExporting(false); }
    };
    
    const handleExportCutsToVideos = async () => {
        const itemsToExport = sortedItems.filter(item => item.narration && item.narration.trim() !== "");
        if (itemsToExport.length === 0 || !audioContextRef.current) { addNotification("내보낼 항목이 없습니다.", "info"); return; }
        setIsExporting(true); setExportMessage('컷별 영상 내보내기 준비 중...');
        const audioCtx = audioContextRef.current; if (audioCtx.state === 'suspended') await audioCtx.resume();
        const logoImage = await loadImage(LOGO_DATA_URL);
        const exportSingleCut = async (item: SlideshowItem, index: number) => {
            return new Promise<void>(async (resolve, reject) => {
                try {
                    const image = item.image ? await loadImage(item.image.imageUrl) : null;
                    let fullAudioBuffer: AudioBuffer | null = null; const attachedUrls = item.audioDataUrls || [];
                    if (attachedUrls.length > 0) {
                        const buffers = (await Promise.all(attachedUrls.map(async (_, j) => audioCacheRef.current.get(`${item.cutNumber}-${j}`)))).filter(b => b instanceof AudioBuffer) as AudioBuffer[];
                        if(buffers.length > 0) {
                            const totalLength = buffers.reduce((sum, b) => sum + b.length, 0); const concatenated = audioCtx.createBuffer(1, totalLength, audioCtx.sampleRate);
                            const channel = concatenated.getChannelData(0); let offset = 0; buffers.forEach(b => { channel.set(b.getChannelData(0), offset); offset += b.length; });
                            fullAudioBuffer = concatenated;
                        }
                    } else { const ttsBuffer = audioCacheRef.current.get(item.cutNumber); if (ttsBuffer instanceof AudioBuffer) fullAudioBuffer = ttsBuffer; }
                    
                    const formattedNarration = applySmartLineBreaks(item.narration || ''); const allLinesForChunking = formattedNarration.split('\n');
                    const displayChunks: string[] = []; let currentChunkPrefix = '';
                    for (const line of allLinesForChunking) { if (line.trim() !== '') { displayChunks.push(currentChunkPrefix + line); currentChunkPrefix = ''; } else currentChunkPrefix += '\n'; }
                    const duration = fullAudioBuffer ? fullAudioBuffer.duration : Math.max(2.0, displayChunks.length * 1.0);
                    
                    const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * audioCtx.sampleRate), audioCtx.sampleRate);
                    if (fullAudioBuffer) {
                        const narrSource = offlineCtx.createBufferSource();
                        narrSource.buffer = fullAudioBuffer;
                        const narrGain = offlineCtx.createGain();
                        narrGain.gain.value = 0.95;
                        narrSource.connect(narrGain).connect(offlineCtx.destination);
                        narrSource.start(0);
                    }
                    
                    const sfxData = getSfxForIndex(index);
                    if (sfxData) {
                        const sfxOffset = getSfxOffsetByName(sfxData.name);
                        const sfxSource = offlineCtx.createBufferSource(); sfxSource.buffer = sfxData.buffer;
                        const sfxGain = offlineCtx.createGain(); sfxGain.gain.value = 0.30; sfxSource.connect(sfxGain).connect(offlineCtx.destination);
                        sfxSource.start(Math.max(0, 0 - sfxOffset)); 
                    }
                    const finalBuffer = await offlineCtx.startRendering();
                    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
                    const canvasCtx = canvas.getContext('2d', { alpha: false }); if (!canvasCtx) throw new Error("Canvas init failed");
                    const videoStream = canvas.captureStream(30);
                    
                    const realTimeAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const audioDestination = realTimeAudioCtx.createMediaStreamDestination();
                    const audioSource = realTimeAudioCtx.createBufferSource(); audioSource.buffer = finalBuffer; audioSource.connect(audioDestination);
                    const combinedStream = new MediaStream([...videoStream.getTracks(), ...audioDestination.stream.getTracks()]);
                    const recordedChunks: Blob[] = [];
                    
                    // DYNAMIC MIME TYPE DETECTION FOR SAFARI
                    const mimeType = getSupportedMimeType();
                    const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: 8000000 };
                    if (mimeType) {
                        recorderOptions.mimeType = mimeType;
                    }

                    const recorder = new MediaRecorder(combinedStream, recorderOptions);
                    recorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunks.push(event.data); };
                    recorder.onstop = () => {
                        const blob = new Blob(recordedChunks, { type: mimeType || 'video/webm' }); 
                        if (blob.size === 0) { 
                            realTimeAudioCtx.close(); 
                            resolve(); 
                            return; 
                        }
                        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.style.display = 'none'; document.body.appendChild(a); a.href = url;
                        let extension = 'webm';
                        if (mimeType.includes('mp4')) extension = 'mp4';
                        const [scenePart, cutPart] = item.cutNumber.split('-'); 
                        a.download = `cut_${scenePart}-${cutPart?.padStart(2, '0') || item.cutNumber}.${extension}`; 
                        a.click();
                        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100); 
                        realTimeAudioCtx.close();
                        resolve();
                    };
                    recorder.start(); audioSource.start(0);
                    const startT = realTimeAudioCtx.currentTime;
                    const loop = () => {
                        const cur = realTimeAudioCtx.currentTime - startT;
                        if (cur >= duration) { recorder.stop(); return; }
                        const scale = 1.0 + ZOOM_RATE_PER_SECOND * cur;
                        let narrationToDraw = ''; if (displayChunks.length > 0) {
                            const totalTextLength = displayChunks.reduce((acc, c) => acc + c.length, 0); let accumulatedTime = 0, chunksToShow = 0;
                            for (let k = 0; k < displayChunks.length; k++) {
                                const weight = totalTextLength > 0 ? displayChunks[k].length / totalTextLength : 1 / displayChunks.length;
                                accumulatedTime += duration * weight; if (cur <= accumulatedTime) { chunksToShow = k + 1; break; }
                                if (k === displayChunks.length - 1) chunksToShow = displayChunks.length;
                            }
                            narrationToDraw = displayChunks.slice(0, chunksToShow).join('\n');
                        }
                        drawFrame(canvasCtx, image, logoImage, narrationToDraw, formattedNarration, storyTitle || '', scale);
                        requestAnimationFrame(loop);
                    };
                    requestAnimationFrame(loop);
                } catch(e) { reject(e); }
            });
        };
        try {
            for (let i = 0; i < itemsToExport.length; i++) { 
                setExportMessage(`컷 #${itemsToExport[i].cutNumber} 렌더링 중... (${i + 1}/${itemsToExport.length})`); 
                await exportSingleCut(itemsToExport[i], i); 
            }
            addNotification("컷별 영상 내보내기 완료", "success");
        } catch (error) { addNotification(`컷별 영상 내보내기 실패`, "error"); } finally { setIsExporting(false); }
    };
    
    const goToNextWithAudio = useCallback(() => { setIsPlaying(false); goToNext(); }, [goToNext]);
    const goToPrevWithAudio = useCallback(() => { setIsPlaying(false); goToPrev(); }, [goToPrev]);
    const handleGoToStart = useCallback(() => { cleanupTimersAndAudio(); setIsPlaying(false); stopBgm(); bgmOffsetRef.current = 0; currentZoomScaleRef.current = 1.0; lastImageIdRef.current = null; setCurrentIndex(0); }, [cleanupTimersAndAudio, stopBgm]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); togglePlayPause(); } if (e.key === 'ArrowRight') goToNextWithAudio(); if (e.key === 'ArrowLeft') goToPrevWithAudio(); };
        window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, goToNextWithAudio, goToPrevWithAudio, togglePlayPause]);

    const drawCurrentFrame = useCallback((scale: number) => {
        const canvas = previewCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        const logo = logoImageRef.current;
        if (!canvas || !ctx || !logo || !currentItem) return;

        drawFrame(ctx, currentImageElement, logo, visibleNarration, currentItem.narration || '', storyTitle || '', scale);
    }, [currentItem, currentImageElement, visibleNarration, storyTitle, drawFrame]);

    useEffect(() => {
        if (!isOpen) return;
        const item = sortedItems[currentIndex];
        if (item?.image) {
            let isCancelled = false;
            setCurrentImageElement(null); 
            loadImage(item.image.imageUrl).then(img => {
                if (!isCancelled) setCurrentImageElement(img);
            });
            return () => { isCancelled = true; };
        } else {
            setCurrentImageElement(null);
        }
    }, [isOpen, currentIndex, sortedItems]);

    useEffect(() => {
        const currentImageId = currentItem?.image?.id;
        if (currentImageId && currentImageId !== lastImageIdRef.current) {
            currentZoomScaleRef.current = 1.0;
            lastImageIdRef.current = currentImageId;
        } else if (!currentImageId) {
            lastImageIdRef.current = null;
            currentZoomScaleRef.current = 1.0;
        }
    }, [currentIndex, currentItem]);

    useEffect(() => {
        if (isPlaying) {
            const animate = (time: number) => {
                if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = time;
                const deltaTime = (time - lastFrameTimeRef.current) / 1000;
                lastFrameTimeRef.current = time;
                if (deltaTime > 0 && deltaTime < 0.2) {
                    currentZoomScaleRef.current += ZOOM_RATE_PER_SECOND * deltaTime;
                }
                drawCurrentFrame(currentZoomScaleRef.current);
                animationFrameIdRef.current = requestAnimationFrame(animate);
            };
            animationFrameIdRef.current = requestAnimationFrame(animate);
        } else {
            drawCurrentFrame(currentZoomScaleRef.current); 
            lastFrameTimeRef.current = 0;
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
        }
        return () => {
            if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
            lastFrameTimeRef.current = 0;
        };
    }, [isPlaying, drawCurrentFrame]);
    
    useEffect(() => {
        if (!isPlaying) {
            drawCurrentFrame(currentZoomScaleRef.current);
        }
    }, [visibleNarration, isPlaying, drawCurrentFrame]);

    useEffect(() => {
        if (!isPlaying && currentItem) {
            setVisibleNarration(currentItem.narration || '');
        }
    }, [currentIndex, isPlaying, currentItem]);

    useEffect(() => {
        cleanupTimersAndAudio();
        if (isPlaying && !isPreparingAudio && sortedItems.length > 0) {
            const currentItem = sortedItems[currentIndex]; if (!currentItem) { setIsPlaying(false); return; }
            const sfxData = getSfxForIndex(currentIndex); if (sfxData) playSfx(sfxData.buffer);
            const advanceToNext = () => { if (currentIndex < sortedItems.length - 1) goToNext(); else togglePlayPause(true); };
            
            let totalAudioDuration = 0; const attachedUrls = currentItem.audioDataUrls || [];
            if (attachedUrls.length > 0) { for (let i = 0; i < attachedUrls.length; i++) { const buffer = audioCacheRef.current.get(`${currentItem.cutNumber}-${i}`); if (buffer instanceof AudioBuffer) totalAudioDuration += buffer.duration; } }
            else { const ttsBuffer = audioCacheRef.current.get(currentItem.cutNumber); if (ttsBuffer instanceof AudioBuffer) totalAudioDuration = ttsBuffer.duration / 1.3; }
            
            const silentDuration = Math.max(2.0, (currentItem.narration || '').split(' ').length * 0.4); 
            const totalDisplayDuration = totalAudioDuration > 0 ? totalAudioDuration : silentDuration;
            
            // --- 줄 단위 순차 자막 표시 로직 ---
            const fullNarration = currentItem.narration || '';
            const lines = fullNarration.split('\n').filter(l => l.trim() !== '');
            const totalChars = lines.join('').length;
            const lineTimeouts: number[] = [];
            
            if (lines.length > 0) {
                setVisibleNarration(''); // 초기화
                let cumulativeChars = 0;
                lines.forEach((line, idx) => {
                    // 전체 글자수 대비 현재 줄이 나타나야 할 시점 계산 (비율 적용)
                    const ratio = totalChars > 0 ? (cumulativeChars / totalChars) : 0;
                    const lineStartTime = ratio * totalDisplayDuration;
                    
                    const tid = window.setTimeout(() => {
                        const currentShownText = lines.slice(0, idx + 1).join('\n');
                        setVisibleNarration(currentShownText);
                    }, lineStartTime * 1000);
                    
                    lineTimeouts.push(tid);
                    cumulativeChars += line.length;
                });
            } else {
                setVisibleNarration(fullNarration);
            }
            
            if (totalAudioDuration > 0) { 
                playSequenceForCut(currentItem, advanceToNext); 
                timeoutRef.current = { lineTimeouts, slideTimeout: null }; 
            } else { 
                const slideTimeoutId = window.setTimeout(advanceToNext, totalDisplayDuration * 1000); 
                timeoutRef.current = { lineTimeouts, slideTimeout: slideTimeoutId }; 
            }
        }
    }, [isPlaying, currentIndex, isPreparingAudio, sortedItems, playSequenceForCut, goToNext, cleanupTimersAndAudio, togglePlayPause, getSfxForIndex, playSfx]);

    const handlePopOut = useCallback(() => {
        const width = 1200;
        const height = 900;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);
        
        const externalWindow = window.open(
            '',
            'SlideshowExternal',
            `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
        );

        if (externalWindow) {
            externalWindow.document.title = `${storyTitle || 'Slideshow'} - Webtoon Vision Studio`;
            const styles = document.querySelectorAll('link, style');
            styles.forEach(style => {
                externalWindow.document.head.appendChild(style.cloneNode(true));
            });
            externalWindow.document.body.className = "bg-stone-950 overflow-auto m-0 p-0";
            const container = externalWindow.document.createElement('div');
            container.id = 'external-slideshow-root';
            externalWindow.document.body.appendChild(container);
            setPortalContainer(container);
            externalWindowRef.current = externalWindow;
            setIsExternal(true);
            externalWindow.onbeforeunload = () => {
                setIsExternal(false);
                externalWindowRef.current = null;
                setPortalContainer(null);
            };
        }
    }, [storyTitle]);
    
    if (!isOpen && !isClosing) return null;

    const renderContent = () => (
        <div className={`flex flex-col md:flex-row items-center justify-center gap-8 p-4 sm:p-8 w-full h-full min-h-screen ${isExternal ? 'bg-stone-950' : ''}`} onClick={handleClose}>
             <div className="h-[85vh] aspect-[9/16] bg-white rounded-3xl shadow-2xl relative overflow-hidden flex flex-col flex-shrink-0" onClick={e => e.stopPropagation()}>
                {(isPreparingAudio || isExporting) && (
                    <div className="absolute inset-0 bg-black/80 rounded-3xl flex flex-col items-center justify-center z-30">
                        <SpinnerIcon className="w-12 h-12 text-orange-400" />
                        <p className="mt-4 text-white font-semibold">{isExporting ? exportMessage : preparingMessage}</p>
                    </div>
                )}
                <canvas ref={previewCanvasRef} width={1080} height={1920} className="w-full h-full object-contain" />
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-stone-300 z-20">
                    <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${((currentIndex + 1) / sortedItems.length) * 100}%` }}/>
                </div>
            </div>
            
            <div className="w-full max-w-md h-auto md:h-[85vh] bg-stone-900/50 border border-stone-700 rounded-3xl shadow-xl p-6 flex flex-col gap-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-white tracking-tighter">CONTROLS</h2>
                    <div className="flex items-center gap-2">
                        {!isExternal && (
                            <button 
                                onClick={handlePopOut}
                                className="p-2 text-stone-400 hover:text-white bg-stone-800 rounded-lg transition-colors border border-stone-700"
                                title="새 창으로 분리"
                            >
                                <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                            </button>
                        )}
                        <button 
                            onClick={handleClose}
                            className="p-2 text-stone-400 hover:text-white bg-stone-800 rounded-lg transition-colors border border-stone-700"
                            title="닫기"
                        >
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                 <div className="flex justify-center items-center gap-2">
                    <button onClick={handleGoToStart} className="p-3 text-white bg-black/20 rounded-full hover:bg-black/40"><RewindIcon className="w-5 h-5" /></button>
                    <button onClick={goToPrevWithAudio} className="p-3 text-white bg-black/20 rounded-full hover:bg-black/40"><ArrowLeftIcon className="w-5 h-5" /></button>
                    <button onClick={() => togglePlayPause()} className="p-4 bg-white text-stone-900 rounded-full hover:bg-stone-200 transform transition-all active:scale-95 shadow-xl">{isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8" />}</button>
                    <button onClick={goToNextWithAudio} className="p-3 text-white bg-black/20 rounded-full hover:bg-black/40"><ArrowRightIcon className="w-5 h-5" /></button>
                </div>
                
                <div className="bg-stone-800/80 p-4 rounded-2xl border border-stone-700 space-y-4 shadow-inner">
                    <div className="flex justify-between items-center"><h3 className="text-sm font-bold text-orange-400 flex items-center gap-2"><SpeakerWaveIcon className="w-4 h-4" /> 효과음 설정</h3><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={sfxEnabled} onChange={(e) => setSfxEnabled(e.target.checked)} className="sr-only peer" /><div className="w-9 h-5 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div></label></div>
                    <div className="space-y-3 opacity-90">
                        <div><p className="text-[10px] font-bold text-stone-400 mb-1">기본 효과음 1 (1, 4, 7...번째 컷)</p><div className={`flex items-center gap-2 bg-stone-900 p-2 rounded-md border transition-all ${isDraggingSfx1 ? 'border-orange-500 bg-orange-900/30 ring-2 ring-orange-500/50 scale-[1.02]' : 'border-stone-700'}`} onDragOver={handleSfxDragOver} onDragEnter={(e) => handleSfxDragEnter(e, 'fixed1')} onDragLeave={(e) => handleSfxDragLeave(e, 'fixed1')} onDrop={(e) => handleSfxDrop(e, 'fixed1')}>{customSfx1 ? (<div className="flex-grow flex items-center justify-between text-[11px] text-white overflow-hidden"><span className="truncate">{customSfxFileNames.fixed1}</span><button onClick={() => removeCustomSfx('fixed1')} className="text-stone-500 hover:text-red-400"><TrashIcon className="w-3 h-3" /></button></div>) : (<button onClick={() => document.getElementById('sfx-upload-1')?.click()} className="flex-grow flex items-center justify-center gap-1.5 py-1 text-[11px] text-stone-500 hover:text-orange-400 transition-colors"><PlusIcon className="w-3 h-3" /> {isDraggingSfx1 ? '여기에 놓으세요' : '파일 추가 (드롭 가능)'}</button>)}<input id="sfx-upload-1" type="file" accept="audio/*" className="hidden" onChange={(e) => handleSfxUpload(e.target.files, 'fixed1')} /></div></div>
                        <div><p className="text-[10px] font-bold text-stone-400 mb-1">기본 효과음 2 (2, 5, 8...번째 컷)</p><div className={`flex items-center gap-2 bg-stone-900 p-2 rounded-md border transition-all ${isDraggingSfx2 ? 'border-orange-500 bg-orange-900/30 ring-2 ring-orange-500/50 scale-[1.02]' : 'border-stone-700'}`} onDragOver={handleSfxDragOver} onDragEnter={(e) => handleSfxDragEnter(e, 'fixed2')} onDragLeave={(e) => handleSfxDragLeave(e, 'fixed2')} onDrop={(e) => handleSfxDrop(e, 'fixed2')}>{customSfx2 ? (<div className="flex-grow flex items-center justify-between text-[11px] text-white overflow-hidden"><span className="truncate">{customSfxFileNames.fixed2}</span><button onClick={() => removeCustomSfx('fixed2')} className="text-stone-500 hover:text-red-400"><TrashIcon className="w-3 h-3" /></button></div>) : (<button onClick={() => document.getElementById('sfx-upload-2')?.click()} className="flex-grow flex items-center justify-center gap-1.5 py-1 text-[11px] text-stone-500 hover:text-orange-400 transition-colors"><PlusIcon className="w-3 h-3" /> {isDraggingSfx2 ? '여기에 놓으세요' : '파일 추가 (드롭 가능)'}</button>)}<input id="sfx-upload-2" type="file" accept="audio/*" className="hidden" onChange={(e) => handleSfxUpload(e.target.files, 'fixed2')} /></div></div>
                        <div><p className="text-[10px] font-bold text-stone-400 mb-1">랜덤 보따리 (3, 6, 9...번째 컷)</p><div className={`bg-stone-900 rounded-md border transition-all ${isDraggingRandom ? 'border-orange-500 bg-orange-900/30 ring-2 ring-orange-500/50' : 'border-stone-700'} overflow-hidden`} onDragOver={handleSfxDragOver} onDragEnter={(e) => handleSfxDragEnter(e, 'random')} onDragLeave={(e) => handleSfxDragLeave(e, 'random')} onDrop={(e) => handleSfxDrop(e, 'random')}><div className="max-h-24 overflow-y-auto p-2 space-y-1">{customRandomSfxPool.length === 0 ? (<p className="text-center py-2 text-[10px] text-stone-600">{isDraggingRandom ? '파일을 놓으세요' : '등록된 랜덤 소리 없음'}</p>) : (customSfxFileNames.random.map((name, i) => (<div key={i} className="flex items-center justify-between text-[10px] text-stone-300 bg-stone-800 p-1.5 rounded"><span className="truncate flex-grow">{name}</span><button onClick={() => removeCustomSfx('random', i)} className="text-stone-600 hover:text-red-400 ml-2"><TrashIcon className="w-2.5 h-2.5" /></button></div>)))}</div><button onClick={() => document.getElementById('sfx-upload-random')?.click()} className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] bg-stone-700 text-white hover:bg-stone-600 transition-colors border-t border-stone-700"><UploadIcon className="w-3 h-3" /> {isDraggingRandom ? '여기에 드롭!' : '소리 추가 (여러 개 가능)'}</button><input id="sfx-upload-random" type="file" multiple accept="audio/*" className="hidden" onChange={(e) => handleSfxUpload(e.target.files, 'random')} /></div></div>
                    </div>
                </div>
                
                <div className="flex flex-col items-stretch gap-3 w-full">
                    <button onClick={() => handleExportToVideo({ includeBgm: false, includeSfx: false })} disabled={isPreparingAudio || isExporting} className="flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold rounded-xl transition-all bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 shadow-lg active:scale-95"><SpeakerWaveIcon className="w-4 h-4" /> 영상+나레이션 내보내기</button>
                    <button onClick={handleExportCutsToVideos} disabled={isPreparingAudio || isExporting} className="flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold rounded-xl transition-all bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 shadow-lg active:scale-95"><VideoCameraIcon className="w-4 h-4" /> 컷별 영상 내보내기</button>
                    <button onClick={() => handleExportToVideo({ includeBgm: true, includeSfx: true })} disabled={isPreparingAudio || isExporting} className="flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold rounded-xl transition-all bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 shadow-lg active:scale-95"><VideoCameraIcon className="w-4 h-4" /> 전체 영상 내보내기</button>
                </div>
            </div>
        </div>
    );

    if (isExternal && portalContainer) {
        return createPortal(renderContent(), portalContainer);
    }

    return (
        <div className={`fixed inset-0 bg-black/90 z-50 flex items-center justify-center transition-opacity duration-300 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`} role="dialog" aria-modal="true">
            {renderContent()}
        </div>
    );
};
