import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Cut } from '../types';
import { XIcon, SparklesIcon, PlusIcon, TrashIcon, PlayIcon, PauseIcon, ZoomInIcon, ZoomOutIcon } from './icons';

interface CutSplitterModalProps {
  isOpen: boolean;
  onClose: () => void;
  cut: Cut | null;
  onConfirm: (originalCut: Cut, splitPoints: { time: number; textIndex: number }[]) => void;
}

interface SplitPoint {
  time: number;
  textIndex: number;
}

// Audio processing utilities
const decodeAudioData = (audioData: ArrayBuffer, audioCtx: AudioContext): Promise<AudioBuffer> => {
    return new Promise((resolve, reject) => {
        audioCtx.decodeAudioData(audioData, resolve, reject);
    });
};

const drawWaveform = (
    canvas: HTMLCanvasElement, 
    audioBuffer: AudioBuffer, 
    progress: number, 
    splitPoints: number[],
    zoom: number,
    scroll: number, // 0 to 1
    hoveredIndex: number | null
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const amp = height / 2;
    const totalSamples = audioBuffer.length;
    
    const visibleSamples = Math.floor(totalSamples / zoom);
    const startSample = Math.floor(scroll * (totalSamples - visibleSamples));
    
    const samplesPerPixel = visibleSamples / width;

    ctx.clearRect(0, 0, width, height);

    // Draw progress
    const progressTime = progress * audioBuffer.duration;
    const startTime = (startSample / totalSamples) * audioBuffer.duration;
    const endTime = startTime + (visibleSamples / totalSamples) * audioBuffer.duration;
    
    if (progressTime > startTime && progressTime < endTime) {
        const progressX = ((progressTime - startTime) / (endTime - startTime)) * width;
        ctx.fillStyle = 'rgba(79, 70, 229, 0.3)';
        ctx.fillRect(0, 0, progressX, height);
    }
    
    // Draw waveform
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fb923c'; // orange-400
    ctx.beginPath();
    const data = audioBuffer.getChannelData(0);

    for (let i = 0; i < width; i++) {
        const sampleStartIndex = startSample + Math.floor(i * samplesPerPixel);
        if (sampleStartIndex >= totalSamples) break;

        let min = 1.0;
        let max = -1.0;
        
        const sampleEndIndex = Math.min(sampleStartIndex + Math.ceil(samplesPerPixel), totalSamples);

        for (let j = sampleStartIndex; j < sampleEndIndex; j++) {
            const sample = data[j];
            if (sample < min) min = sample;
            if (sample > max) max = sample;
        }
        
        if (i === 0) {
            ctx.moveTo(i, (1 + max) * amp);
        } else {
            ctx.lineTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
    }
    ctx.stroke();

    // Draw split points
    splitPoints.forEach((time, index) => {
        if (time >= startTime && time <= endTime) {
            const x = ((time - startTime) / (endTime - startTime)) * width;
            ctx.lineWidth = index === hoveredIndex ? 3 : 1.5;
            ctx.strokeStyle = index === hoveredIndex ? '#fb923c' : '#f87171'; // orange-400 for hover, red-400 for normal
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    });
};

export const CutSplitterModal: React.FC<CutSplitterModalProps> = ({ isOpen, onClose, cut, onConfirm }) => {
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [splitPoints, setSplitPoints] = useState<SplitPoint[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackProgress, setPlaybackProgress] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [scrollPosition, setScrollPosition] = useState(0); // 0 to 1
    const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
    const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
    const isDraggingRef = useRef(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const narrationRef = useRef<HTMLDivElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const playbackStartTimeRef = useRef<number>(0);

    useEffect(() => {
        if (isOpen && !audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !cut || !cut.audioDataUrls?.[0]) {
            setIsLoading(false);
            setAudioBuffer(null);
            setSplitPoints([]);
            setZoomLevel(1);
            setScrollPosition(0);
            return;
        }

        let isActive = true;
        setIsLoading(true);

        const loadAudio = async () => {
            try {
                const audioCtx = audioContextRef.current;
                if (!audioCtx) throw new Error("AudioContext not available");
                const response = await fetch(cut.audioDataUrls![0]);
                const arrayBuffer = await response.arrayBuffer();
                const decodedBuffer = await decodeAudioData(arrayBuffer, audioCtx);
                if (isActive) {
                    setAudioBuffer(decodedBuffer);
                }
            } catch (error) {
                console.error("Failed to load and decode audio:", error);
                if (isActive) setAudioBuffer(null);
            } finally {
                if (isActive) setIsLoading(false);
            }
        };

        loadAudio();

        return () => {
            isActive = false;
        };
    }, [isOpen, cut]);

    useEffect(() => {
        if (audioBuffer && canvasRef.current) {
            const splitTimes = splitPoints.map(p => p.time);
            drawWaveform(canvasRef.current, audioBuffer, playbackProgress, splitTimes, zoomLevel, scrollPosition, hoveredPointIndex);
        }
    }, [audioBuffer, splitPoints, playbackProgress, zoomLevel, scrollPosition, hoveredPointIndex]);

    const stopPlayback = useCallback(() => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioSourceRef.current) {
            try { audioSourceRef.current.stop(); } catch(e){}
        }
        setIsPlaying(false);
    }, []);

    const togglePlay = () => {
        if (isPlaying) {
            stopPlayback();
            return;
        }

        if (!audioBuffer || !audioContextRef.current) return;

        const audioCtx = audioContextRef.current;
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        
        const startOffset = playbackProgress * audioBuffer.duration;
        playbackStartTimeRef.current = audioCtx.currentTime - startOffset;

        source.start(0, startOffset);
        setIsPlaying(true);
        audioSourceRef.current = source;

        const animate = () => {
            const elapsed = audioCtx.currentTime - playbackStartTimeRef.current;
            const progress = elapsed / audioBuffer.duration;
            if (progress >= 1) {
                setPlaybackProgress(0);
                stopPlayback();
            } else {
                setPlaybackProgress(progress);
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };
        animate();

        source.onended = () => {
            if (isPlaying) { // Check if it wasn't stopped manually
                setPlaybackProgress(0);
                stopPlayback();
            }
        };
    };

    const getClickTime = (e: React.MouseEvent<HTMLCanvasElement>): number => {
        if (!audioBuffer || !canvasRef.current) return 0;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const progressInView = x / rect.width;

        const totalDuration = audioBuffer.duration;
        const visibleDuration = totalDuration / zoomLevel;
        const startTime = scrollPosition * (totalDuration - visibleDuration);

        return startTime + progressInView * visibleDuration;
    };

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!audioBuffer || !canvasRef.current) return;
        const clickTime = getClickTime(e);
        let clickedPointIndex = -1;
        
        const timeThreshold = (audioBuffer.duration / canvasRef.current!.width) * 5 / zoomLevel;
        splitPoints.forEach((point, index) => {
            if (Math.abs(point.time - clickTime) < timeThreshold) {
                clickedPointIndex = index;
            }
        });

        if (clickedPointIndex !== -1) {
            setDraggingPointIndex(clickedPointIndex);
            isDraggingRef.current = true;
        } else {
            const closestCharIndex = Math.round((clickTime / audioBuffer.duration) * (cut?.narration.length || 0));
            setSplitPoints(prev => {
                const newPoints = [...prev, { time: clickTime, textIndex: closestCharIndex }];
                return newPoints.sort((a, b) => a.time - b.time);
            });
        }
    };
    
    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!audioBuffer || !canvasRef.current) return;
        const hoverTime = getClickTime(e);

        if (isDraggingRef.current && draggingPointIndex !== null) {
            const newTime = Math.max(0, Math.min(audioBuffer.duration, hoverTime));
            const newTextIndex = Math.round((newTime / audioBuffer.duration) * (cut?.narration.length || 0));
            setSplitPoints(prev => {
                const newPoints = [...prev];
                newPoints[draggingPointIndex] = { time: newTime, textIndex: newTextIndex };
                return newPoints;
            });
        } else {
            const timeThreshold = (audioBuffer.duration / canvasRef.current!.width) * 5 / zoomLevel;
            let foundHover = -1;
            splitPoints.forEach((point, index) => {
                if (Math.abs(point.time - hoverTime) < timeThreshold) {
                    foundHover = index;
                }
            });
            setHoveredPointIndex(foundHover !== -1 ? foundHover : null);
            canvasRef.current.style.cursor = foundHover !== -1 ? 'ew-resize' : 'crosshair';
        }
    };

    const handleCanvasMouseUp = () => {
        if (isDraggingRef.current) {
            isDraggingRef.current = false;
            setDraggingPointIndex(null);
            setSplitPoints(prev => [...prev].sort((a, b) => a.time - b.time));
        }
    };
    
    const handleCanvasMouseLeave = () => {
        setHoveredPointIndex(null);
        if(canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
        if (isDraggingRef.current) {
            handleCanvasMouseUp();
        }
    };
    
    const handleTextClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!audioBuffer || !cut || !narrationRef.current) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(narrationRef.current);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        
        const clickedCharIndex = preCaretRange.toString().length;
        const clickTime = (clickedCharIndex / cut.narration.length) * audioBuffer.duration;

        setSplitPoints(prev => {
            const newPoints = [...prev, { time: clickTime, textIndex: clickedCharIndex }];
            return newPoints.sort((a, b) => a.time - b.time);
        });
    };
    
    const removeSplitPoint = (index: number) => {
        setSplitPoints(prev => prev.filter((_, i) => i !== index));
    };

    const handleConfirm = () => {
        if (cut) {
            onConfirm(cut, splitPoints);
        }
    };
    
    const renderNarrationWithSplits = () => {
        if (!cut) return null;
        const { narration } = cut;
        let lastIndex = 0;
        const segments = [];
        const sortedPoints = [...splitPoints].sort((a, b) => a.textIndex - b.textIndex);

        sortedPoints.forEach((point) => {
            segments.push(narration.substring(lastIndex, point.textIndex));
            lastIndex = point.textIndex;
        });
        segments.push(narration.substring(lastIndex));

        return segments.map((segment, i) => (
            <React.Fragment key={i}>
                {segment}
                {i < segments.length - 1 && (
                    <span className="inline-block relative h-full align-text-bottom">
                        <span className="absolute -top-1 -bottom-1 left-1/2 -translate-x-1/2 w-0.5 bg-red-400 opacity-70" />
                        <button
                            onClick={() => removeSplitPoint(i)}
                            className="absolute -top-2.5 left-1/2 -translate-x-1/2 p-0.5 bg-red-500 text-white rounded-full leading-none text-xs z-10"
                            title="분할 지점 삭제"
                        >
                            <XIcon className="w-2.5 h-2.5" />
                        </button>
                    </span>
                )}
            </React.Fragment>
        ));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 sm:p-8 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-4xl h-full max-h-[80vh] flex flex-col">
                <header className="flex justify-between items-center p-4 border-b border-zinc-700">
                    <h2 className="text-xl font-bold text-white">컷 분할 편집기 (CUT #{cut?.cutNumber})</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700"><XIcon className="w-6 h-6" /></button>
                </header>

                <main className="flex-grow p-6 overflow-y-auto space-y-6">
                    {isLoading ? (
                        <div className="text-center text-zinc-400">오디오 로딩 중...</div>
                    ) : !audioBuffer ? (
                        <div className="text-center text-red-400">오디오를 불러올 수 없습니다.</div>
                    ) : (
                        <>
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-400 mb-2">오디오 파형 (클릭하여 분할, 드래그하여 수정)</h3>
                                <div className="bg-zinc-800 p-2 rounded-lg">
                                    <canvas
                                        ref={canvasRef}
                                        width="800"
                                        height="100"
                                        className="w-full"
                                        onMouseDown={handleCanvasMouseDown}
                                        onMouseMove={handleCanvasMouseMove}
                                        onMouseUp={handleCanvasMouseUp}
                                        onMouseLeave={handleCanvasMouseLeave}
                                    />
                                    <div className="flex items-center justify-between mt-2">
                                        <button onClick={togglePlay} className="p-2 bg-zinc-700 rounded-full hover:bg-zinc-600">
                                            {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                                        </button>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setZoomLevel(z => Math.max(1, z / 1.5))} className="p-2 bg-zinc-700 rounded-full hover:bg-zinc-600" title="축소"><ZoomOutIcon className="w-5 h-5"/></button>
                                            <span className="text-xs text-zinc-400 w-10 text-center">{zoomLevel.toFixed(1)}x</span>
                                            <button onClick={() => setZoomLevel(z => Math.min(50, z * 1.5))} className="p-2 bg-zinc-700 rounded-full hover:bg-zinc-600" title="확대"><ZoomInIcon className="w-5 h-5"/></button>
                                        </div>
                                    </div>
                                    {zoomLevel > 1 && (
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.001"
                                            value={scrollPosition}
                                            onChange={(e) => setScrollPosition(Number(e.target.value))}
                                            className="w-full h-2 mt-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                                            title="파형 스크롤"
                                        />
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-400 mb-2">나레이션 (클릭하여 분할)</h3>
                                <div
                                    ref={narrationRef}
                                    onClick={handleTextClick}
                                    className="p-4 bg-zinc-800 rounded-lg text-lg leading-relaxed whitespace-pre-wrap cursor-text"
                                >
                                    {renderNarrationWithSplits()}
                                </div>
                            </div>
                        </>
                    )}
                </main>

                <footer className="p-4 bg-zinc-800/50 border-t border-zinc-700 flex justify-between items-center">
                    <p className="text-sm text-zinc-400">
                        {splitPoints.length > 0 ? `이 컷을 ${splitPoints.length + 1}개로 분할합니다.` : '분할 지점을 추가하세요.'}
                    </p>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-6 py-2 text-sm font-semibold rounded-lg bg-zinc-600 hover:bg-zinc-500 text-white">취소</button>
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading || !audioBuffer || splitPoints.length === 0}
                            className="group inline-flex items-center justify-center gap-2 px-6 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-500 rounded-lg disabled:opacity-50"
                        >
                            <SparklesIcon className="w-5 h-5"/>
                            컷 분할 확정
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};
