// appMiscActions.ts — React 의존 제로
// 화풍 핫스왑, outpaint/fill 재시도, 컷별 화풍 오버라이드

import type { AppDataState, AppAction, ArtStyle, Cut, EditableCut } from './types';
import { outpaintImageWithNano, fillImageWithNano } from './services/geminiService';

export interface MiscActionHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: AppDataState };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    handleAddUsage: (tokens: number, source: 'gemini' | 'claude') => void;
    getVisionModelName: () => string;
    calculateFinalPrompt: (cut: Cut | EditableCut) => string;
}

export function createMiscActions(h: MiscActionHelpers) {
    const { dispatch, stateRef, addNotification, handleAddUsage, getVisionModelName, calculateFinalPrompt } = h;

    return {
        // ── outpaint 재시도 래퍼 ──────────────────────────────────────
        handleOutpaintImageWithNanoWithRetry: async (baseImageUrl: string, direction: 'up' | 'down' | 'left' | 'right', originalPrompt?: string) => {
            let attempt = 0;
            const maxAttempts = 3;
            while (attempt < maxAttempts) {
                try {
                    const res = await outpaintImageWithNano(baseImageUrl, direction, getVisionModelName(), originalPrompt);
                    handleAddUsage(res.tokenCount, 'gemini');
                    return { imageUrl: res.imageUrl, textResponse: res.textResponse, tokenCount: res.tokenCount };
                } catch (error: any) {
                    attempt++;
                    const isServerError = error.message && (error.message.includes('500') || error.message.includes('503') || error.message.includes('429') || error.message.includes('Internal error') || error.message.includes('Service Unavailable') || error.message.includes('Too Many Requests'));
                    if (isServerError && attempt < maxAttempts) {
                        console.warn(`[handleOutpaintImageWithNanoWithRetry] Server/Rate limit error encountered. Retrying attempt ${attempt} of ${maxAttempts}...`, error);
                        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                    } else {
                        throw error;
                    }
                }
            }
            throw new Error("Maximum retry attempts reached.");
        },

        // ── fill 재시도 래퍼 ──────────────────────────────────────────
        handleFillImageWithNanoWithRetry: async (baseImageUrl: string, originalPrompt?: string, maskBase64?: string) => {
            let attempt = 0;
            const maxAttempts = 3;
            while (attempt < maxAttempts) {
                try {
                    const res = await fillImageWithNano(baseImageUrl, getVisionModelName(), originalPrompt, maskBase64, undefined, stateRef.current.imageRatio || '1:1');
                    handleAddUsage(res.tokenCount, 'gemini');
                    return { imageUrl: res.imageUrl, tokenCount: res.tokenCount };
                } catch (error: any) {
                    attempt++;
                    const isServerError = error.message && (error.message.includes('500') || error.message.includes('503') || error.message.includes('429') || error.message.includes('Internal error') || error.message.includes('Service Unavailable') || error.message.includes('Too Many Requests'));
                    if (isServerError && attempt < maxAttempts) {
                        console.warn(`[handleFillImageWithNanoWithRetry] Server/Rate limit error encountered. Retrying attempt ${attempt} of ${maxAttempts}...`, error);
                        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                    } else {
                        throw error;
                    }
                }
            }
            throw new Error("Maximum retry attempts reached.");
        },

        // ── 컷별 화풍 오버라이드 ─────────────────────────────────────
        handleUpdateCutArtStyle: (cutNumber: string, style: ArtStyle | undefined) => {
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { artStyleOverride: style } } });
        },

        // ── 일괄 화풍 변경 (드래프트 검수 전) ─────────────────────────
        handleBatchUpdateStyle: (style: ArtStyle, customText: string) => {
            // 1. Update Global State
            dispatch({ type: 'SET_ART_STYLE', payload: style });
            dispatch({ type: 'SET_CUSTOM_ART_STYLE', payload: customText });

            // 2. Trigger updates for draft scenes if they exist (to ensure fresh state for generation)
            if (stateRef.current.editableStoryboard) {
                addNotification(`화풍이 '${style}'로 변경되었습니다. '검수 완료'를 누르면 새 스타일이 적용됩니다.`, 'success');
            }
        },

        // ── 화풍 핫스왑 (확정 스토리보드 이미지 프롬프트 재계산) ──────
        handleSwapArtStyle: (newStyle: ArtStyle, newCustomText?: string) => {
            // [화풍 핫스왑] 대본/연출/스토리보드는 유지, 화풍만 교체 후 이미지 프롬프트 재계산

            // 1. 전역 화풍 교체
            dispatch({ type: 'SET_ART_STYLE', payload: newStyle });
            if (newCustomText !== undefined) {
                dispatch({ type: 'SET_CUSTOM_ART_STYLE', payload: newCustomText });
            }

            // 2. stateRef를 즉시 업데이트 (calculateFinalPrompt가 stateRef.current.artStyle을 참조)
            stateRef.current = { ...stateRef.current, artStyle: newStyle };
            if (newCustomText !== undefined) {
                stateRef.current = { ...stateRef.current, customArtStyle: newCustomText };
            }

            // 3. 확정 스토리보드(generatedContent)의 모든 컷 imagePrompt 재계산 + 이미지 초기화
            const scenes = stateRef.current.generatedContent?.scenes;
            if (scenes) {
                for (const scene of scenes) {
                    for (const cut of scene.cuts) {
                        // 컷별 오버라이드가 있으면 그건 유지 (사용자가 의도적으로 설정한 것)
                        if (cut.artStyleOverride) continue;

                        const newPrompt = calculateFinalPrompt(cut as any);
                        dispatch({ type: 'UPDATE_CUT', payload: {
                            cutNumber: cut.cutNumber,
                            data: {
                                imagePrompt: newPrompt,
                                imageUrls: [],
                                selectedImageId: null
                            }
                        }});
                    }
                }
                addNotification(`화풍이 변경되었습니다. 이미지를 재생성하세요.`, 'success');
            }

            // 4. 편집 중인 드래프트(editableStoryboard)도 있으면 알림
            if (stateRef.current.editableStoryboard && !scenes) {
                addNotification(`화풍이 '${newStyle}'로 변경되었습니다. 검수 완료 후 이미지 생성 시 새 화풍이 적용됩니다.`, 'success');
            }
        }
    };
}
