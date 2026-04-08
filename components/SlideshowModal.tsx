
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Notification } from '../types';
import { XIcon, PlayIcon, PauseIcon, ArrowLeftIcon, ChevronRightIcon as ArrowRightIcon, SpeakerWaveIcon, SpinnerIcon, VideoCameraIcon, UndoIcon, RewindIcon, TrashIcon, UploadIcon, PlusIcon, ArrowTopRightOnSquareIcon } from './icons';
import { applySmartLineBreaks } from '../utils/textUtils';
import { SlideshowItem, ZOOM_RATE_PER_SECOND, LOGO_DATA_URL, loadImage, drawFrame } from './slideshowUtils';
import { handleExportToVideo as exportToVideo, handleExportCutsToVideos as exportCutsToVideos, ExportHelpers } from './slideshowExport';

interface SlideshowModalProps {
    isOpen: boolean;
    onClose: () => void;
    slideshowItems: SlideshowItem[];
    storyTitle: string | null;
    generateSpeech: (narration: string) => Promise<{ audioBase64: string; tokenCount: number; }>;
    addNotification: (message: string, type: Notification['type']) => void;
    handleAddUsage: (tokens: number, source: 'claude' | 'gemini') => void;
    backgroundMusicUrl: string | null;
}
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

    const exportHelpers: ExportHelpers = { sortedItems, audioContextRef, audioCacheRef, bgmAudioBufferRef, getSfxForIndex, addNotification, setIsExporting, setExportMessage, storyTitle };
    const handleExportToVideo = (options?: { includeBgm: boolean, includeSfx: boolean }) => exportToVideo(exportHelpers, options);
    const handleExportCutsToVideos = () => exportCutsToVideos(exportHelpers);
    
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
    }, [currentItem, currentImageElement, visibleNarration, storyTitle]);

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
            externalWindow.document.body.className = "bg-zinc-950 overflow-auto m-0 p-0";
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
        <div className={`flex flex-col md:flex-row items-center justify-center gap-8 p-4 sm:p-8 w-full h-full min-h-screen ${isExternal ? 'bg-zinc-950' : ''}`} onClick={handleClose}>
             <div className="h-[85vh] aspect-[9/16] bg-white rounded-3xl shadow-2xl relative overflow-hidden flex flex-col flex-shrink-0" onClick={e => e.stopPropagation()}>
                {(isPreparingAudio || isExporting) && (
                    <div className="absolute inset-0 bg-black/80 rounded-3xl flex flex-col items-center justify-center z-30">
                        <SpinnerIcon className="w-12 h-12 text-orange-400" />
                        <p className="mt-4 text-white font-semibold">{isExporting ? exportMessage : preparingMessage}</p>
                    </div>
                )}
                <canvas ref={previewCanvasRef} width={1080} height={1920} className="w-full h-full object-contain" />
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300 z-20">
                    <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${((currentIndex + 1) / sortedItems.length) * 100}%` }}/>
                </div>
            </div>
            
            <div className="w-full max-w-md h-auto md:h-[85vh] bg-zinc-900/50 border border-zinc-700 rounded-3xl shadow-xl p-6 flex flex-col gap-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-white tracking-tighter">CONTROLS</h2>
                    <div className="flex items-center gap-2">
                        {!isExternal && (
                            <button 
                                onClick={handlePopOut}
                                className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg transition-colors border border-zinc-700"
                                title="새 창으로 분리"
                            >
                                <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                            </button>
                        )}
                        <button 
                            onClick={handleClose}
                            className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg transition-colors border border-zinc-700"
                            title="닫기"
                        >
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                 <div className="flex justify-center items-center gap-2">
                    <button onClick={handleGoToStart} className="p-3 text-white bg-black/20 rounded-full hover:bg-black/40"><RewindIcon className="w-5 h-5" /></button>
                    <button onClick={goToPrevWithAudio} className="p-3 text-white bg-black/20 rounded-full hover:bg-black/40"><ArrowLeftIcon className="w-5 h-5" /></button>
                    <button onClick={() => togglePlayPause()} className="p-4 bg-white text-zinc-900 rounded-full hover:bg-zinc-200 transform transition-all active:scale-95 shadow-xl">{isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8" />}</button>
                    <button onClick={goToNextWithAudio} className="p-3 text-white bg-black/20 rounded-full hover:bg-black/40"><ArrowRightIcon className="w-5 h-5" /></button>
                </div>
                
                <div className="bg-zinc-800/80 p-4 rounded-2xl border border-zinc-700 space-y-4 shadow-inner">
                    <div className="flex justify-between items-center"><h3 className="text-sm font-bold text-orange-400 flex items-center gap-2"><SpeakerWaveIcon className="w-4 h-4" /> 효과음 설정</h3><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={sfxEnabled} onChange={(e) => setSfxEnabled(e.target.checked)} className="sr-only peer" /><div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div></label></div>
                    <div className="space-y-3 opacity-90">
                        <div><p className="text-[10px] font-bold text-zinc-400 mb-1">기본 효과음 1 (1, 4, 7...번째 컷)</p><div className={`flex items-center gap-2 bg-zinc-900 p-2 rounded-md border transition-all ${isDraggingSfx1 ? 'border-orange-500 bg-orange-900/30 ring-2 ring-orange-500/50 scale-[1.02]' : 'border-zinc-700'}`} onDragOver={handleSfxDragOver} onDragEnter={(e) => handleSfxDragEnter(e, 'fixed1')} onDragLeave={(e) => handleSfxDragLeave(e, 'fixed1')} onDrop={(e) => handleSfxDrop(e, 'fixed1')}>{customSfx1 ? (<div className="flex-grow flex items-center justify-between text-[11px] text-white overflow-hidden"><span className="truncate">{customSfxFileNames.fixed1}</span><button onClick={() => removeCustomSfx('fixed1')} className="text-zinc-500 hover:text-red-400"><TrashIcon className="w-3 h-3" /></button></div>) : (<button onClick={() => document.getElementById('sfx-upload-1')?.click()} className="flex-grow flex items-center justify-center gap-1.5 py-1 text-[11px] text-zinc-500 hover:text-orange-400 transition-colors"><PlusIcon className="w-3 h-3" /> {isDraggingSfx1 ? '여기에 놓으세요' : '파일 추가 (드롭 가능)'}</button>)}<input id="sfx-upload-1" type="file" accept="audio/*" className="hidden" onChange={(e) => handleSfxUpload(e.target.files, 'fixed1')} /></div></div>
                        <div><p className="text-[10px] font-bold text-zinc-400 mb-1">기본 효과음 2 (2, 5, 8...번째 컷)</p><div className={`flex items-center gap-2 bg-zinc-900 p-2 rounded-md border transition-all ${isDraggingSfx2 ? 'border-orange-500 bg-orange-900/30 ring-2 ring-orange-500/50 scale-[1.02]' : 'border-zinc-700'}`} onDragOver={handleSfxDragOver} onDragEnter={(e) => handleSfxDragEnter(e, 'fixed2')} onDragLeave={(e) => handleSfxDragLeave(e, 'fixed2')} onDrop={(e) => handleSfxDrop(e, 'fixed2')}>{customSfx2 ? (<div className="flex-grow flex items-center justify-between text-[11px] text-white overflow-hidden"><span className="truncate">{customSfxFileNames.fixed2}</span><button onClick={() => removeCustomSfx('fixed2')} className="text-zinc-500 hover:text-red-400"><TrashIcon className="w-3 h-3" /></button></div>) : (<button onClick={() => document.getElementById('sfx-upload-2')?.click()} className="flex-grow flex items-center justify-center gap-1.5 py-1 text-[11px] text-zinc-500 hover:text-orange-400 transition-colors"><PlusIcon className="w-3 h-3" /> {isDraggingSfx2 ? '여기에 놓으세요' : '파일 추가 (드롭 가능)'}</button>)}<input id="sfx-upload-2" type="file" accept="audio/*" className="hidden" onChange={(e) => handleSfxUpload(e.target.files, 'fixed2')} /></div></div>
                        <div><p className="text-[10px] font-bold text-zinc-400 mb-1">랜덤 보따리 (3, 6, 9...번째 컷)</p><div className={`bg-zinc-900 rounded-md border transition-all ${isDraggingRandom ? 'border-orange-500 bg-orange-900/30 ring-2 ring-orange-500/50' : 'border-zinc-700'} overflow-hidden`} onDragOver={handleSfxDragOver} onDragEnter={(e) => handleSfxDragEnter(e, 'random')} onDragLeave={(e) => handleSfxDragLeave(e, 'random')} onDrop={(e) => handleSfxDrop(e, 'random')}><div className="max-h-24 overflow-y-auto p-2 space-y-1">{customRandomSfxPool.length === 0 ? (<p className="text-center py-2 text-[10px] text-zinc-600">{isDraggingRandom ? '파일을 놓으세요' : '등록된 랜덤 소리 없음'}</p>) : (customSfxFileNames.random.map((name, i) => (<div key={i} className="flex items-center justify-between text-[10px] text-zinc-300 bg-zinc-800 p-1.5 rounded"><span className="truncate flex-grow">{name}</span><button onClick={() => removeCustomSfx('random', i)} className="text-zinc-600 hover:text-red-400 ml-2"><TrashIcon className="w-2.5 h-2.5" /></button></div>)))}</div><button onClick={() => document.getElementById('sfx-upload-random')?.click()} className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] bg-zinc-700 text-white hover:bg-zinc-600 transition-colors border-t border-zinc-700"><UploadIcon className="w-3 h-3" /> {isDraggingRandom ? '여기에 드롭!' : '소리 추가 (여러 개 가능)'}</button><input id="sfx-upload-random" type="file" multiple accept="audio/*" className="hidden" onChange={(e) => handleSfxUpload(e.target.files, 'random')} /></div></div>
                    </div>
                </div>
                
                <div className="flex flex-col items-stretch gap-3 w-full">
                    <button onClick={() => handleExportToVideo({ includeBgm: false, includeSfx: false })} disabled={isPreparingAudio || isExporting} className="flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold rounded-xl transition-all bg-transparent text-orange-400 border border-orange-500/50 hover:bg-orange-500/10 disabled:opacity-50 active:scale-95"><SpeakerWaveIcon className="w-4 h-4" /> 영상+나레이션 내보내기</button>
                    <button onClick={handleExportCutsToVideos} disabled={isPreparingAudio || isExporting} className="flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold rounded-xl transition-all bg-orange-950/60 text-orange-500/80 border border-orange-800/40 hover:bg-orange-900/60 disabled:opacity-50 active:scale-95"><VideoCameraIcon className="w-4 h-4" /> 컷별 영상 내보내기</button>
                    <button onClick={() => handleExportToVideo({ includeBgm: true, includeSfx: true })} disabled={isPreparingAudio || isExporting} className="flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold rounded-xl transition-all bg-orange-800/50 text-orange-300 border border-orange-600/40 hover:bg-orange-700/50 disabled:opacity-50 active:scale-95"><VideoCameraIcon className="w-4 h-4" /> 전체 영상 내보내기</button>
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
