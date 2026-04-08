// appDownloadActions.ts — 다운로드/ZIP/SRT 액션 (AppContext에서 분리)

import type { AppAction, GeneratedImage } from './types';
import JSZip from 'jszip';
import { downloadFile } from './services/tauriAdapter';

export interface DownloadActionHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: any };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    setUIState: (updater: (prev: any) => any) => void;
    isCancellingZippingRef: { current: boolean };
    zippingAbortControllerRef: { current: AbortController | null };
    isGeneratingSRTRef: { current: boolean };
}

export function createDownloadActions(h: DownloadActionHelpers) {
    const { dispatch, stateRef, addNotification, setUIState, isCancellingZippingRef, zippingAbortControllerRef, isGeneratingSRTRef } = h;

    const handleCancelZipping = () => {
        isCancellingZippingRef.current = true;
        if (zippingAbortControllerRef.current) {
            zippingAbortControllerRef.current.abort();
        }
        dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { ...stateRef.current.zippingProgress, isCancelling: true } as any });
    };

    const handleCancelSRTGeneration = () => {
        isGeneratingSRTRef.current = false;
    };

    const handleDownloadAllImagesZip = async () => {
        dispatch({ type: 'START_ZIPPING' });
        isCancellingZippingRef.current = false;
        zippingAbortControllerRef.current = new AbortController();
        const zip = new JSZip();
        try {
            const images = stateRef.current.generatedImageHistory;
            const total = images.length;
            let current = 0;

            for (const img of images) {
                if (isCancellingZippingRef.current) {
                    addNotification('다운로드가 취소되었습니다.', 'info');
                    return;
                }
                try {
                    const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current!.signal });
                    const blob = await res.blob();
                    zip.file(`cut_${img.sourceCutNumber}_${img.id.substring(0, 4)}.png`, blob);
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

            if (isCancellingZippingRef.current) return;

            const content = await zip.generateAsync({ type: 'blob' }, () => {
                if (isCancellingZippingRef.current) throw new Error("Cancelled");
            });
            if (isCancellingZippingRef.current) return;

            const saved = await downloadFile(content, 'wvs_project.zip', [{ name: 'ZIP Archive', extensions: ['zip'] }]);
            if (saved) addNotification('ZIP 파일이 저장되었습니다.', 'success');
        } catch (error: any) {
            if (error.message === "Cancelled") {
                addNotification('다운로드가 취소되었습니다.', 'info');
            } else {
                console.error("Error zipping all images:", error);
                addNotification('전체 이미지 압축 중 오류가 발생했습니다.', 'error');
            }
        } finally {
            dispatch({ type: 'END_ZIPPING' });
            isCancellingZippingRef.current = false;
        }
    };

    const handleDownloadFilteredImagesZip = async (tagFilter: 'rough' | 'normal' | 'hq') => {
        dispatch({ type: 'START_ZIPPING' });
        isCancellingZippingRef.current = false;
        zippingAbortControllerRef.current = new AbortController();
        const zip = new JSZip();
        try {
            const allImages = stateRef.current.generatedImageHistory;
            const images = allImages.filter((img: GeneratedImage) => {
                const tag = img.tag || (img.engine === 'imagen-rough' ? 'rough' : 'hq');
                return tag === tagFilter;
            });
            if (images.length === 0) {
                addNotification(`${tagFilter === 'rough' ? '러프' : tagFilter === 'normal' ? '일반' : 'HQ'} 이미지가 없습니다.`, 'info');
                return;
            }
            const total = images.length;
            let current = 0;
            for (const img of images) {
                if (isCancellingZippingRef.current) { addNotification('다운로드가 취소되었습니다.', 'info'); return; }
                try {
                    const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current!.signal });
                    const blob = await res.blob();
                    zip.file(`cut_${img.sourceCutNumber}_${tagFilter}_${img.id.substring(0, 4)}.png`, blob);
                } catch (e: any) {
                    if (e.name === 'AbortError') { addNotification('다운로드가 취소되었습니다.', 'info'); return; }
                }
                current++;
                dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { current, total, isCancelling: false } });
            }
            if (isCancellingZippingRef.current) return;
            const content = await zip.generateAsync({ type: 'blob' });
            if (isCancellingZippingRef.current) return;
            const label = tagFilter === 'rough' ? 'rough' : tagFilter === 'normal' ? 'normal' : 'hq';
            const saved = await downloadFile(content, `wvs_${label}_images.zip`, [{ name: 'ZIP Archive', extensions: ['zip'] }]);
            if (saved) addNotification(`${label} 이미지 ZIP 저장 완료`, 'success');
        } catch (error: any) {
            if (error.message !== "Cancelled") addNotification('이미지 압축 중 오류가 발생했습니다.', 'error');
        } finally {
            dispatch({ type: 'END_ZIPPING' });
            isCancellingZippingRef.current = false;
        }
    };

    const handleDownloadSRT = async () => {
        const { generatedContent } = stateRef.current;
        if (!generatedContent || generatedContent.scenes.length === 0) {
            addNotification('다운로드할 자막이 없습니다.', 'info');
            return;
        }

        dispatch({ type: 'START_LOADING', payload: 'AI 자막(SRT) 생성 중...' });
        setUIState((prev: any) => ({ ...prev, isGeneratingSRT: true }));
        isGeneratingSRTRef.current = true;
        try {
            let srtContent = '';
            let subtitleIndex = 1;
            let currentStartTime = 0;

            const formatSRTTime = (seconds: number): string => {
                const hr = Math.floor(seconds / 3600);
                const mn = Math.floor((seconds % 3600) / 60);
                const sc = Math.floor(seconds % 60);
                const ms = Math.floor((seconds % 1) * 1000);
                return `${hr.toString().padStart(2, '0')}:${mn.toString().padStart(2, '0')}:${sc.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
            };

            const getAudioDuration = (url: string): Promise<number> => {
                return new Promise((resolve) => {
                    const audio = new Audio(url);
                    const timeoutId = setTimeout(() => resolve(3), 3000);
                    audio.addEventListener('loadedmetadata', () => { clearTimeout(timeoutId); resolve(audio.duration); });
                    audio.addEventListener('error', () => { clearTimeout(timeoutId); resolve(3); });
                });
            };

            for (const scene of generatedContent.scenes) {
                for (const cut of scene.cuts) {
                    if (!isGeneratingSRTRef.current) {
                        addNotification('자막 생성이 중단되었습니다.', 'info');
                        return;
                    }

                    let cutDuration = cut.audioDuration;
                    if (!cutDuration) {
                        if (cut.audioDataUrls && cut.audioDataUrls.length > 0) {
                            cutDuration = await getAudioDuration(cut.audioDataUrls[0]);
                        } else {
                            const charCount = cut.narration ? cut.narration.replace(/\s/g, '').length : 0;
                            cutDuration = charCount > 0 ? charCount * 0.1 : 3;
                        }
                    }

                    if (!cut.narration || cut.narration.trim() === '') {
                        currentStartTime += cutDuration;
                        continue;
                    }

                    const lines = cut.narration.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                    const totalLength = lines.reduce((acc: number, line: string) => acc + line.length, 0);

                    for (const line of lines) {
                        const lineRatio = totalLength > 0 ? line.length / totalLength : 1;
                        const lineDuration = cutDuration * lineRatio;
                        srtContent += `${subtitleIndex}\n`;
                        srtContent += `${formatSRTTime(currentStartTime)} --> ${formatSRTTime(currentStartTime + lineDuration)}\n`;
                        srtContent += `${line}\n\n`;
                        currentStartTime += lineDuration;
                        subtitleIndex++;
                    }
                }
            }

            if (!isGeneratingSRTRef.current) return;

            const srtFileName = `${generatedContent.title || 'project'}_subtitles.srt`;
            const saved = await downloadFile(srtContent, srtFileName, [{ name: 'SRT Subtitle', extensions: ['srt'] }]);
            if (saved) addNotification('SRT 자막 파일이 다운로드되었습니다.', 'success');
        } catch (error) {
            console.error('SRT generation failed:', error);
            addNotification('자막 생성에 실패했습니다.', 'error');
        } finally {
            isGeneratingSRTRef.current = false;
            setUIState((prev: any) => ({ ...prev, isGeneratingSRT: false }));
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    const handleDownloadSelectedImagesZip = async () => {
        dispatch({ type: 'START_ZIPPING' });
        isCancellingZippingRef.current = false;
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
                    if (cut.selectedImageId) selectedImageIds.add(cut.selectedImageId);
                });
            });

            if (selectedImageIds.size === 0) {
                addNotification('선택된 대표 이미지가 없습니다.', 'info');
                return;
            }

            const imagesToDownload = generatedImageHistory.filter((img: GeneratedImage) => selectedImageIds.has(img.id));
            const total = imagesToDownload.length;
            let current = 0;

            for (const img of imagesToDownload) {
                if (isCancellingZippingRef.current) { addNotification('다운로드가 취소되었습니다.', 'info'); return; }
                try {
                    const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current!.signal });
                    const blob = await res.blob();
                    zip.file(`cut_${img.sourceCutNumber}_${img.id.substring(0, 4)}.png`, blob);
                } catch (e: any) {
                    if (e.name === 'AbortError') { addNotification('다운로드가 취소되었습니다.', 'info'); return; }
                    console.error("Failed to fetch image", img.imageUrl, e);
                }
                current++;
                dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { current, total, isCancelling: false } });
            }

            if (isCancellingZippingRef.current) return;

            const content = await zip.generateAsync({ type: 'blob' }, () => {
                if (isCancellingZippingRef.current) throw new Error("Cancelled");
            });
            if (isCancellingZippingRef.current) return;

            const selectedZipName = `${storyTitle || 'wvs_project'}_selected.zip`;
            const saved = await downloadFile(content, selectedZipName, [{ name: 'ZIP Archive', extensions: ['zip'] }]);
            if (saved) addNotification('선택 이미지가 저장되었습니다.', 'success');
        } catch (error: any) {
            if (error.message === "Cancelled") {
                addNotification('다운로드가 취소되었습니다.', 'info');
            } else {
                console.error("Error zipping selected images:", error);
                addNotification('선택 이미지 압축 중 오류가 발생했습니다.', 'error');
            }
        } finally {
            dispatch({ type: 'END_ZIPPING' });
            isCancellingZippingRef.current = false;
        }
    };

    return {
        handleCancelZipping,
        handleCancelSRTGeneration,
        handleDownloadAllImagesZip,
        handleDownloadFilteredImagesZip,
        handleDownloadSRT,
        handleDownloadSelectedImagesZip,
    };
}
