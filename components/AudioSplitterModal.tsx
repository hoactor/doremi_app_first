import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Scene } from '../types';
import { XIcon, SparklesIcon, TrashIcon, PlayIcon, PauseIcon, ZoomInIcon, ZoomOutIcon, SpinnerIcon, CheckIcon, SpeakerWaveIcon, ScissorsIcon, UploadIcon, RefreshIcon } from './icons';

interface AudioSplitterModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  onConfirm: (processedAudios: { cutNumber: string; audioUrl: string; duration: number }[]) => void;
}

// --- Audio Processing Utilities ---

const audioBufferToWavBlob = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const bufferLength = buffer.length;
  const dataSize = bufferLength * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < bufferLength; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
};

const findSpeechBoundaries = (buffer: AudioBuffer, start: number, end: number, threshold = 0.012): { start: number; end: number } => {
  const data = buffer.getChannelData(0);
  const startSample = Math.floor(start * buffer.sampleRate);
  const endSample = Math.floor(end * buffer.sampleRate);
  
  let firstSpeech = startSample;
  for (let i = startSample; i < endSample; i++) {
    if (Math.abs(data[i]) > threshold) {
      firstSpeech = i;
      break;
    }
  }
  
  let lastSpeech = endSample;
  for (let i = endSample - 1; i >= firstSpeech; i--) {
    if (Math.abs(data[i]) > threshold) {
      lastSpeech = i;
      break;
    }
  }
  
  const bufferSamples = Math.floor(0.05 * buffer.sampleRate);
  return {
    start: Math.max(startSample, firstSpeech - bufferSamples) / buffer.sampleRate,
    end: Math.min(endSample, lastSpeech + bufferSamples) / buffer.sampleRate
  };
};

export const AudioSplitterModal: React.FC<AudioSplitterModalProps> = ({ isOpen, onClose, scenes, onConfirm }) => {
  const [file, setFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [markers, setMarkers] = useState<{ time: number; cutNumber: string }[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [scroll, setScroll] = useState(0);
  const [shortsPaceMode, setShortsPaceMode] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [draggingMarkerIndex, setDraggingMarkerIndex] = useState<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const drawRequestRef = useRef<number | null>(null);
  const syncRequestRef = useRef<number | null>(null);

  const allCuts = useMemo(() => scenes.flatMap(s => s.cuts || []).filter(Boolean), [scenes]);

  const activeCutNumber = useMemo(() => {
    if (!audioBuffer || markers.length === 0) return null;
    const sorted = [...markers].sort((a, b) => a.time - b.time);
    const found = sorted.slice().reverse().find(m => playbackTime >= m.time);
    return found ? found.cutNumber : markers[0].cutNumber;
  }, [markers, playbackTime, audioBuffer]);

  const draw = useCallback(() => {
    if (!canvasRef.current || !audioBuffer) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const data = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;
    
    ctx.clearRect(0, 0, width, height);

    const visibleDuration = duration / zoom;
    const scrollTime = scroll * (duration - visibleDuration);
    const startSample = Math.floor((scrollTime / duration) * data.length);
    const endSample = startSample + Math.floor((visibleDuration / duration) * data.length);
    
    // Waveform
    ctx.beginPath();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    const step = Math.max(1, Math.floor((endSample - startSample) / width));
    
    for (let i = 0; i < width; i++) {
      const idx = startSample + (i * step);
      const val = data[idx] || 0;
      const x = i;
      const y = (0.5 + val * 0.5) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Red Splitting Markers
    markers.forEach((m, idx) => {
      if (m.time >= scrollTime && m.time <= scrollTime + visibleDuration) {
        const x = ((m.time - scrollTime) / visibleDuration) * width;
        const isDragging = draggingMarkerIndex === idx;
        ctx.beginPath();
        ctx.strokeStyle = isDragging ? '#fbbf24' : '#ef4444';
        ctx.lineWidth = isDragging ? 3 : 1.5;
        ctx.setLineDash(isDragging ? [] : [5, 5]);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = isDragging ? '#fbbf24' : '#ef4444';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`#${m.cutNumber}`, x + 5, 15);

        ctx.beginPath();
        ctx.arc(x, height - 10, isDragging ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // White Playhead
    if (playbackTime >= scrollTime && playbackTime <= scrollTime + visibleDuration) {
      const x = ((playbackTime - scrollTime) / visibleDuration) * width;
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [audioBuffer, markers, playbackTime, zoom, scroll, draggingMarkerIndex]);

  useEffect(() => {
    if (isOpen) {
      const render = () => {
        draw();
        drawRequestRef.current = requestAnimationFrame(render);
      };
      drawRequestRef.current = requestAnimationFrame(render);
    }
    return () => { if (drawRequestRef.current) cancelAnimationFrame(drawRequestRef.current); };
  }, [isOpen, draw]);

  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
        sourceNodeRef.current.onended = null;
        try { sourceNodeRef.current.stop(); } catch(e){}
        sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback((offset: number) => {
    if (!audioBuffer || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if(ctx.state === 'suspended') ctx.resume();

    stopPlayback();

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    const actualOffset = Math.max(0, Math.min(audioBuffer.duration, offset));
    source.start(0, actualOffset);
    sourceNodeRef.current = source;
    startTimeRef.current = ctx.currentTime - actualOffset;
    setIsPlaying(true);

    source.onended = () => {
        if (sourceNodeRef.current === source) {
            setIsPlaying(false);
        }
    };
  }, [audioBuffer, stopPlayback]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback(playbackTime);
    }
  }, [isPlaying, playbackTime, startPlayback, stopPlayback]);

  // Sync playbackTime with AudioContext
  useEffect(() => {
    if (!isPlaying || !audioCtxRef.current || !audioBuffer) {
        if (syncRequestRef.current) cancelAnimationFrame(syncRequestRef.current);
        return;
    }
    const sync = () => {
        if (audioCtxRef.current) {
            const now = audioCtxRef.current.currentTime - startTimeRef.current;
            const clamped = Math.max(0, Math.min(audioBuffer.duration, now));
            setPlaybackTime(clamped);
            syncRequestRef.current = requestAnimationFrame(sync);
        }
    };
    syncRequestRef.current = requestAnimationFrame(sync);
    return () => { if (syncRequestRef.current) cancelAnimationFrame(syncRequestRef.current); };
  }, [isPlaying, audioBuffer]);

  // Spacebar control
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, togglePlay]);

  // Mouse Wheel Zoom & Scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;
    const handleWheelEvent = (e: WheelEvent) => {
        if (!audioBuffer) return;
        e.preventDefault();
        const dx = e.deltaX; const dy = e.deltaY;
        const isHorizontal = e.shiftKey || Math.abs(dx) > Math.abs(dy);
        if (isHorizontal) {
            const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
            setScroll(s => {
                const sensitivity = 0.0008 / Math.max(1, zoom * 0.1);
                const nextScroll = s - (delta * sensitivity);
                return Math.max(0, Math.min(1, nextScroll));
            });
        } else {
            setZoom(z => {
                const zoomSensitivity = 0.001;
                const nextZoom = z - (dy * zoomSensitivity * z);
                return Math.max(1, Math.min(30, nextZoom));
            });
        }
    };
    canvas.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheelEvent);
  }, [audioBuffer, isOpen, zoom]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    
    let file: File | undefined;
    if ('dataTransfer' in e) {
        file = e.dataTransfer.files?.[0];
    } else {
        file = e.target.files?.[0];
    }
    
    if (!file) return;
    setFile(file);
    setIsLoading(true);

    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
      
      setMarkers(allCuts.map((cut, i) => ({ 
        time: (decoded.duration / allCuts.length) * i, 
        cutNumber: cut.cutNumber 
      })));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const detectSilence = () => {
    if (!audioBuffer) return;
    const data = audioBuffer.getChannelData(0);
    const threshold = 0.02; // Slightly more sensitive
    const minSilenceLen = Math.floor(0.25 * audioBuffer.sampleRate); // Shorter silence
    const newMarkers: {time: number, cutNumber: string}[] = [];
    
    let cutIdx = 0;
    let silenceCounter = 0;
    newMarkers.push({ time: 0, cutNumber: allCuts[0].cutNumber });
    cutIdx++;

    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) < threshold) {
        silenceCounter++;
      } else {
        if (silenceCounter > minSilenceLen && cutIdx < allCuts.length) {
          const time = (i - silenceCounter / 2) / audioBuffer.sampleRate;
          newMarkers.push({ time, cutNumber: allCuts[cutIdx].cutNumber });
          cutIdx++;
        }
        silenceCounter = 0;
      }
    }
    
    // If we didn't find enough silences, distribute the rest evenly
    if (cutIdx < allCuts.length) {
        const remainingCuts = allCuts.length - cutIdx;
        const lastTime = newMarkers[newMarkers.length - 1].time;
        const remainingTime = audioBuffer.duration - lastTime;
        const step = remainingTime / (remainingCuts + 1);
        
        for (let i = 0; i < remainingCuts; i++) {
            newMarkers.push({
                time: lastTime + step * (i + 1),
                cutNumber: allCuts[cutIdx].cutNumber
            });
            cutIdx++;
        }
    }
    
    setMarkers(newMarkers);
  };

  const getCanvasTime = (clientX: number): number => {
    if (!audioBuffer || !canvasRef.current) return 0;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const visibleDuration = audioBuffer.duration / zoom;
    const scrollTime = scroll * (audioBuffer.duration - visibleDuration);
    return scrollTime + (x / rect.width) * visibleDuration;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBuffer || !canvasRef.current) return;
    const clickedTime = getCanvasTime(e.clientX);
    
    // Marker dragging or Playhead move
    const rect = canvasRef.current.getBoundingClientRect();
    const markerProximityThreshold = (10 / rect.width) * (audioBuffer.duration / zoom);
    const markerIndex = markers.findIndex(m => Math.abs(m.time - clickedTime) < markerProximityThreshold);
    
    if (markerIndex !== -1) {
        if (e.shiftKey) {
            // Shift + Click could be used to delete if needed, but per original UI we skip for now
        } else {
            setDraggingMarkerIndex(markerIndex);
        }
    } else {
        setPlaybackTime(clickedTime);
        if (isPlaying) startPlayback(clickedTime);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBuffer || !canvasRef.current) return;
    const currentTime = getCanvasTime(e.clientX);

    if (draggingMarkerIndex !== null) {
        setMarkers(prev => {
            const next = [...prev];
            next[draggingMarkerIndex] = { ...next[draggingMarkerIndex], time: Math.max(0, Math.min(audioBuffer.duration, currentTime)) };
            return next;
        });
    } else {
        const rect = canvasRef.current.getBoundingClientRect();
        const markerProximityThreshold = (10 / rect.width) * (audioBuffer.duration / zoom);
        const isNearMarker = markers.some(m => Math.abs(m.time - currentTime) < markerProximityThreshold);
        canvasRef.current.style.cursor = isNearMarker ? 'ew-resize' : 'crosshair';
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingMarkerIndex(null);
  };

  const handleApply = async () => {
    if (!audioBuffer) return;
    setIsProcessing(true);
    const sorted = [...markers].sort((a, b) => a.time - b.time);
    const results: { cutNumber: string; audioUrl: string; duration: number }[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        const nextTime = sorted[i+1]?.time || audioBuffer.duration;
        let sliceStart = m.time;
        let sliceEnd = nextTime;

        if (shortsPaceMode) {
            const boundaries = findSpeechBoundaries(audioBuffer, sliceStart, sliceEnd);
            sliceStart = boundaries.start;
            sliceEnd = boundaries.end;
        }

        const sliceLen = Math.floor((sliceEnd - sliceStart) * audioBuffer.sampleRate);
        if (sliceLen <= 0) continue;

        const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, sliceLen, audioBuffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start(0, sliceStart, sliceEnd - sliceStart);
        
        const rendered = await offlineCtx.startRendering();
        const wavBlob = audioBufferToWavBlob(rendered);
        results.push({
            cutNumber: m.cutNumber,
            audioUrl: URL.createObjectURL(wavBlob),
            duration: sliceEnd - sliceStart
        });
    }

    onConfirm(results);
    setIsProcessing(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        <header className="p-4 border-b border-stone-800 flex justify-between items-center bg-stone-800/50">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
                <SpeakerWaveIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 className="text-xl font-bold text-white">통합 스마트 오디오 스플리터</h2>
                <p className="text-xs text-stone-400">마커 드래그, 휠(줌/스크롤), 클릭(이동), Space(재생)</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-stone-400 hover:bg-stone-700 transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-grow flex flex-col min-h-0 bg-stone-950">
          {!audioBuffer ? (
            <div className="flex-grow flex items-center justify-center">
               <label 
                  className={`group w-[80%] h-64 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all ${isDraggingFile ? 'border-orange-500 bg-orange-500/10' : 'border-stone-800 hover:border-orange-500 hover:bg-orange-500/5'}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                  onDragLeave={(e) => { 
                      e.preventDefault(); 
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setIsDraggingFile(false); 
                      }
                  }}
                  onDrop={handleFileUpload}
               >
                  <div className={`p-6 rounded-full transition-colors ${isDraggingFile ? 'bg-orange-600' : 'bg-stone-800 group-hover:bg-orange-600'}`}>
                    <UploadIcon className={`w-12 h-12 transition-colors ${isDraggingFile ? 'text-white' : 'text-stone-400 group-hover:text-white'}`} />
                  </div>
                  <h3 className="mt-6 text-2xl font-bold text-white">전체 오디오 파일 업로드</h3>
                  <p className="mt-2 text-stone-500">긴 나레이션 녹음 파일을 선택하거나 여기로 드래그하세요.</p>
                  <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
               </label>
            </div>
          ) : (
            <div className="flex-grow flex flex-col min-h-0">
               <div className="p-6 pb-0 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <button onClick={togglePlay} className="w-12 h-12 flex items-center justify-center bg-white text-stone-900 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all">
                           {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                        </button>
                        <button onClick={detectSilence} className="px-4 py-2 bg-orange-600/20 border border-orange-500/50 text-orange-400 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-orange-600 hover:text-white transition-all">
                           <SparklesIcon className="w-4 h-4" /> 무음 구간 자동 감지
                        </button>
                        <span className="text-xl font-mono text-stone-300 ml-4">
                           {Math.floor(playbackTime / 60)}:{Math.floor(playbackTime % 60).toString().padStart(2, '0')} / {Math.floor(audioBuffer.duration / 60)}:{Math.floor(audioBuffer.duration % 60).toString().padStart(2, '0')}
                        </span>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-stone-800 p-1.5 rounded-lg border border-stone-700">
                           <ScissorsIcon className="w-5 h-5 text-amber-400" />
                           <span className="text-xs font-bold text-amber-200 uppercase tracking-tighter">SHORTS PACE</span>
                           <label className="relative inline-flex items-center cursor-pointer ml-1">
                              <input type="checkbox" checked={shortsPaceMode} onChange={e => setShortsPaceMode(e.target.checked)} className="sr-only peer" />
                              <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                           </label>
                        </div>
                        <div className="flex items-center gap-2">
                           <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-2 bg-stone-800 rounded-lg hover:bg-stone-700"><ZoomOutIcon className="w-5 h-5" /></button>
                           <span className="text-xs font-mono text-stone-400 w-10 text-center">{zoom.toFixed(1)}x</span>
                           <button onClick={() => setZoom(z => Math.min(30, z + 0.5))} className="p-2 bg-stone-800 rounded-lg hover:bg-stone-700"><ZoomInIcon className="w-5 h-5" /></button>
                        </div>
                     </div>
                  </div>

                  <div className="relative h-48 bg-stone-900 rounded-xl border border-stone-800 overflow-hidden shadow-inner">
                     <canvas 
                        ref={canvasRef} 
                        width={1200} 
                        height={200} 
                        className="w-full h-full" 
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={handleCanvasMouseUp}
                     />
                  </div>
                  {zoom > 1 && (
                      <input 
                        type="range" min="0" max="1" step="0.001" value={scroll} 
                        onChange={e => setScroll(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-orange-500" 
                      />
                  )}
               </div>

               <div className="flex-grow p-6 overflow-hidden flex flex-col gap-3">
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">컷별 마커 설정 (마커 드래그로 이동)</p>
                  <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {allCuts.map((cut) => {
                      const marker = markers.find(m => m.cutNumber === cut.cutNumber);
                      const isCurrentlyPlaying = activeCutNumber === cut.cutNumber;
                      return (
                        <div 
                          key={cut.cutNumber} 
                          className={`p-4 rounded-xl border transition-all duration-300 relative ${isCurrentlyPlaying ? 'bg-orange-900/40 border-orange-400 ring-4 ring-orange-500/50 scale-[1.02] shadow-xl' : marker ? 'bg-stone-800/40 border-stone-700' : 'bg-stone-900 border-stone-800 opacity-50'}`}
                        >
                           <div className="flex justify-between items-center mb-3">
                              <span className={`text-xs font-black uppercase tracking-tighter ${isCurrentlyPlaying ? 'text-white' : 'text-orange-400'}`}>CUT #{cut.cutNumber}</span>
                               <div className="flex gap-2">
                                <button 
                                    onClick={() => { if(marker) { setPlaybackTime(marker.time); startPlayback(marker.time); } }} 
                                    className={`px-2 py-1 text-[10px] font-bold rounded uppercase transition-all bg-stone-700 text-stone-400 hover:bg-orange-600 hover:text-white`}
                                    title="이 컷의 시작 위치부터 재생"
                                >
                                    ▶ 재생
                                </button>
                                <button 
                                    onClick={() => {
                                        setMarkers(prev => {
                                            const next = [...prev];
                                            const idx = next.findIndex(m => m.cutNumber === cut.cutNumber);
                                            if (idx !== -1) {
                                                next[idx] = { ...next[idx], time: playbackTime };
                                            } else {
                                                next.push({ cutNumber: cut.cutNumber, time: playbackTime });
                                            }
                                            return next.sort((a, b) => a.time - b.time);
                                        });
                                    }} 
                                    className={`px-2 py-1 text-[10px] font-bold rounded uppercase transition-all ${isCurrentlyPlaying ? 'bg-orange-500 text-white' : 'bg-stone-700 text-stone-400 hover:bg-orange-600 hover:text-white'}`}
                                    title="현재 재생 위치를 이 컷의 시작점으로 설정"
                                >
                                    SET START
                                </button>
                              </div>
                           </div>
                           <div className={`flex items-center gap-2 mb-2 p-2 rounded-lg border transition-colors ${isCurrentlyPlaying ? 'bg-stone-900 border-orange-500/50' : 'bg-stone-950 border-stone-800'}`}>
                              <input 
                                type="number" 
                                step="0.01" 
                                value={marker ? marker.time.toFixed(2) : "0.00"} 
                                onChange={e => {
                                    const val = parseFloat(e.target.value);
                                    setMarkers(prev => prev.map(m => m.cutNumber === cut.cutNumber ? { ...m, time: val } : m).sort((a, b) => a.time - b.time));
                                }}
                                className="bg-transparent text-white font-mono text-sm w-full outline-none"
                              />
                              <span className="text-[10px] font-bold text-stone-600 uppercase">SEC</span>
                           </div>
                           <p className={`text-[11px] line-clamp-2 italic transition-colors ${isCurrentlyPlaying ? 'text-stone-200 font-medium' : 'text-stone-400'}`}>"{cut.narration}"</p>
                           {isCurrentlyPlaying && (
                               <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                           )}
                        </div>
                      )
                    })}
                  </div>
               </div>
            </div>
          )}
        </main>

        <footer className="p-4 border-t border-stone-800 bg-stone-800/50 flex justify-between items-center flex-shrink-0">
            <button onClick={() => { setAudioBuffer(null); setFile(null); }} className="flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-stone-300">
               <TrashIcon className="w-4 h-4" /> 리셋
            </button>
            <div className="flex gap-3">
               <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-white bg-stone-700 rounded-lg hover:bg-stone-600 transition-all">취소</button>
               <button 
                  onClick={handleApply} 
                  disabled={!audioBuffer || isProcessing}
                  className="px-8 py-2.5 text-sm font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-500 shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center gap-2"
               >
                  {isProcessing ? <SpinnerIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
                  {isProcessing ? '처리 중...' : '트리밍 적용'}
               </button>
            </div>
        </footer>
      </div>
    </div>
  );
};
