// components/slideshowExport.ts — 영상 내보내기 (SlideshowModal에서 분리)

import { SlideshowItem, VideoSegment, ZOOM_RATE_PER_SECOND, LOGO_DATA_URL, loadImage, getSfxOffsetByName, getSupportedMimeType, drawFrame } from './slideshowUtils';
import { applySmartLineBreaks } from '../utils/textUtils';

export interface ExportHelpers {
    sortedItems: SlideshowItem[];
    audioContextRef: { current: AudioContext | null };
    audioCacheRef: { current: Map<string, AudioBuffer | 'failed' | 'empty'> };
    bgmAudioBufferRef: { current: AudioBuffer | null };
    getSfxForIndex: (index: number) => { buffer: AudioBuffer; name: string } | null;
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    setIsExporting: (v: boolean) => void;
    setExportMessage: (v: string) => void;
    storyTitle: string | null;
}

export async function handleExportToVideo(h: ExportHelpers, options: { includeBgm: boolean, includeSfx: boolean } = { includeBgm: true, includeSfx: true }) {
    const { sortedItems, audioContextRef, audioCacheRef, bgmAudioBufferRef, getSfxForIndex, addNotification, setIsExporting, setExportMessage, storyTitle } = h;
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
}

export async function handleExportCutsToVideos(h: ExportHelpers) {
    const { sortedItems, audioContextRef, audioCacheRef, getSfxForIndex, addNotification, setIsExporting, setExportMessage, storyTitle } = h;
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
}
