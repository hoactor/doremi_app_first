import JSZip from 'jszip';
import { AppAction } from './types';
import { UIState } from './appTypes';

export interface DownloadActionHelpers {
    dispatch: React.Dispatch<AppAction>;
    stateRef: { current: any };
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
    setUIState: React.Dispatch<React.SetStateAction<UIState>>;
    isCancellingZippingLocalRef: { current: boolean };
    zippingAbortControllerRef: { current: AbortController | null };
    isGeneratingSRTLocalRef: { current: boolean };
}

export function createDownloadActions(h: DownloadActionHelpers) {
    const {
        dispatch,
        stateRef,
        addNotification,
        setUIState,
        isCancellingZippingLocalRef,
        zippingAbortControllerRef,
        isGeneratingSRTLocalRef,
    } = h;

    const handleCancelZipping = () => {
        isCancellingZippingLocalRef.current = true;
        if (zippingAbortControllerRef.current) {
            zippingAbortControllerRef.current.abort();
        }
        dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { ...stateRef.current.zippingProgress, isCancelling: true } as any });
    };

    const handleDownloadAllImagesZip = async () => {
        dispatch({ type: 'START_ZIPPING' });
        isCancellingZippingLocalRef.current = false;
        zippingAbortControllerRef.current = new AbortController();
        const zip = new JSZip();
        try {
            const images = stateRef.current.generatedImageHistory;
            const total = images.length;
            let current = 0;

            for (const img of images) {
                if (isCancellingZippingLocalRef.current) {
                    addNotification('다운로드가 취소되었습니다.', 'info');
                    return;
                }
                try {
                    const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current!.signal });
                    const blob = await res.blob();
                    zip.file(`cut_${img.sourceCutNumber}_${img.id.substring(0,4)}.png`, blob);
                } catch (e: any) {
                    if (e.name === 'AbortError') {
                        addNotification('다운로드가 취소되었습니다.', 'info');
                        return;
                    }
                    console.error("Failed to fetch image", img.imageUrl, e);
                }
                current++;
                dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { current, total, isCancelling: false } });
            }

            if (isCancellingZippingLocalRef.current) return;

            const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
                if (isCancellingZippingLocalRef.current) {
                    throw new Error("Cancelled");
                }
            });
            if (isCancellingZippingLocalRef.current) return;

            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'wvs_project.zip';
            a.click();
            URL.revokeObjectURL(url);
        } catch (error: any) {
            if (error.message === "Cancelled") {
                addNotification('다운로드가 취소되었습니다.', 'info');
            } else {
                console.error("Error zipping all images:", error);
                addNotification('전체 이미지 압축 중 오류가 발생했습니다.', 'error');
            }
        } finally {
            dispatch({ type: 'END_ZIPPING' });
            isCancellingZippingLocalRef.current = false;
        }
    };

    const handleDownloadSRT = async () => {
        const { generatedContent } = stateRef.current;
        if (!generatedContent || generatedContent.scenes.length === 0) {
            addNotification('다운로드할 자막이 없습니다.', 'info');
            return;
        }

        dispatch({ type: 'START_LOADING', payload: 'AI 자막(SRT) 생성 중...' });
        setUIState(prev => ({ ...prev, isGeneratingSRT: true }));
        isGeneratingSRTLocalRef.current = true;
        try {
            let srtContent = '';
            let subtitleIndex = 1;
            let currentStartTime = 0;

            const formatSRTTime = (seconds: number): string => {
                const h = Math.floor(seconds / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const s = Math.floor(seconds % 60);
                const ms = Math.floor((seconds % 1) * 1000);
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
            };

            const getAudioDuration = (url: string): Promise<number> => {
                return new Promise((resolve) => {
                    const audio = new Audio(url);

                    const timeoutId = setTimeout(() => {
                        resolve(3); // fallback after 3 seconds
                    }, 3000);

                    audio.addEventListener('loadedmetadata', () => {
                        clearTimeout(timeoutId);
                        resolve(audio.duration);
                    });
                    audio.addEventListener('error', () => {
                        clearTimeout(timeoutId);
                        resolve(3); // fallback
                    });
                });
            };

            for (const scene of generatedContent.scenes) {
                for (const cut of scene.cuts) {
                    if (!isGeneratingSRTLocalRef.current) {
                        addNotification('자막 생성이 중단되었습니다.', 'info');
                        return;
                    }

                    let cutDuration = cut.audioDuration;
                    if (!cutDuration) {
                        if (cut.audioDataUrls && cut.audioDataUrls.length > 0) {
                            cutDuration = await getAudioDuration(cut.audioDataUrls[0]);
                        } else {
                            // Calculate duration based on 1.3x TTS speed (0.1s per character)
                            const charCount = cut.narration ? cut.narration.replace(/\s/g, '').length : 0;
                            cutDuration = charCount > 0 ? charCount * 0.1 : 3; // fallback to 3s if no narration
                        }
                    }

                    if (!cut.narration || cut.narration.trim() === '') {
                        currentStartTime += cutDuration;
                        continue;
                    }

                    // 1. Use existing semantic breaks (newlines) from normalization
                    const lines = cut.narration.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                    // 2. Calculate duration per line based on length
                    const totalLength = lines.reduce((acc, line) => acc + line.length, 0);

                    for (const line of lines) {
                        const lineRatio = totalLength > 0 ? line.length / totalLength : 1;
                        const lineDuration = cutDuration * lineRatio;

                        const startTimeStr = formatSRTTime(currentStartTime);
                        const endTimeStr = formatSRTTime(currentStartTime + lineDuration);

                        srtContent += `${subtitleIndex}\n`;
                        srtContent += `${startTimeStr} --> ${endTimeStr}\n`;
                        srtContent += `${line}\n\n`;

                        currentStartTime += lineDuration;
                        subtitleIndex++;
                    }
                }
            }

            if (!isGeneratingSRTLocalRef.current) return;

            // Download file
            const blob = new Blob([srtContent], { type: 'text/srt;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${generatedContent.title || 'project'}_subtitles.srt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            addNotification('SRT 자막 파일이 다운로드되었습니다.', 'success');
        } catch (error) {
            console.error('SRT generation failed:', error);
            addNotification('자막 생성에 실패했습니다.', 'error');
        } finally {
            isGeneratingSRTLocalRef.current = false;
            setUIState(prev => ({ ...prev, isGeneratingSRT: false }));
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    const handleCancelSRTGeneration = () => {
        isGeneratingSRTLocalRef.current = false;
    };

    const handleDownloadSelectedImagesZip = async () => {
        dispatch({ type: 'START_ZIPPING' });
        isCancellingZippingLocalRef.current = false;
        zippingAbortControllerRef.current = new AbortController();
        const zip = new JSZip();
        try {
            const { generatedContent, generatedImageHistory, storyTitle } = stateRef.current;
            if (!generatedContent) {
                addNotification('다운로드할 컷이 없습니다.', 'info');
                return;
            }

            const selectedImageIds = new Set<string>();
            (generatedContent.scenes || []).forEach((scene: any) => {
                (scene.cuts || []).forEach((cut: any) => {
                    if (cut.selectedImageId) {
                        selectedImageIds.add(cut.selectedImageId);
                    }
                });
            });

            if (selectedImageIds.size === 0) {
                addNotification('선택된 대표 이미지가 없습니다.', 'info');
                return;
            }

            const imagesToDownload = generatedImageHistory.filter((img: any) => selectedImageIds.has(img.id));
            const total = imagesToDownload.length;
            let current = 0;

            for (const img of imagesToDownload) {
                if (isCancellingZippingLocalRef.current) {
                    addNotification('다운로드가 취소되었습니다.', 'info');
                    return;
                }
                try {
                    const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current!.signal });
                    const blob = await res.blob();
                    const filename = `cut_${img.sourceCutNumber}_${img.id.substring(0, 4)}.png`;
                    zip.file(filename, blob);
                } catch (e: any) {
                    if (e.name === 'AbortError') {
                        addNotification('다운로드가 취소되었습니다.', 'info');
                        return;
                    }
                    console.error("Failed to fetch image", img.imageUrl, e);
                }
                current++;
                dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { current, total, isCancelling: false } });
            }

            if (isCancellingZippingLocalRef.current) return;

            const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
                if (isCancellingZippingLocalRef.current) {
                    throw new Error("Cancelled");
                }
            });
            if (isCancellingZippingLocalRef.current) return;

            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${storyTitle || 'wvs_project'}_selected.zip`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error: any) {
            if (error.message === "Cancelled") {
                addNotification('다운로드가 취소되었습니다.', 'info');
            } else {
                console.error("Error zipping selected images:", error);
                addNotification('선택 이미지 압축 중 오류가 발생했습니다.', 'error');
            }
        } finally {
            dispatch({ type: 'END_ZIPPING' });
            isCancellingZippingLocalRef.current = false;
        }
    };

    return {
        handleDownloadAllImagesZip,
        handleCancelZipping,
        handleDownloadSRT,
        handleCancelSRTGeneration,
        handleDownloadSelectedImagesZip,
    };
}
