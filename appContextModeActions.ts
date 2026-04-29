// appContextModeActions.ts — Phase A.6: Context 모드 분석/생성 액션 핸들러
// factory 패턴 (appXxxActions.ts 일관성)

import type React from 'react';
import type { AppDataState, AppAction, OutfitSession, ContiCut, EditableCut } from './types';
import { analyzeForContextMode } from './services/ai/contextModeAnalysis';
import { generateContextScene } from './services/ai/contextModeGeneration';
import { buildSessionKey } from './appUtils';
import { DEFAULT_SCENE_LAYER_ID } from './types/pipeline';

interface Helpers {
    dispatch: React.Dispatch<AppAction>;
    stateRef: React.MutableRefObject<AppDataState>;
    addNotification: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

/**
 * outfitSession에서 등장 인물 추출.
 * 메인 경로: ContiCut/EditableCut 기반 (location, sceneLayerId 매칭).
 * 보조: visualAnalysis.characters 필드가 존재하면 추가 union.
 */
function extractCharactersForSession(
    state: AppDataState,
    session: OutfitSession | undefined,
): string[] {
    if (!session) return [];
    const targetLayer = session.layerId || DEFAULT_SCENE_LAYER_ID;

    // 메인: ContiCut/EditableCut 기반
    const allCuts: (ContiCut | EditableCut)[] =
        state.editableStoryboard?.flatMap(s => s.cuts as any) ??
        (state.contiCuts as any) ??
        [];
    const sessionCuts = allCuts.filter((c: any) =>
        c.location === session.location &&
        (c.sceneLayerId || DEFAULT_SCENE_LAYER_ID) === targetLayer,
    );
    const charSet = new Set<string>();
    sessionCuts.forEach((c: any) => {
        const chars = c.characters || c.character || [];
        if (Array.isArray(chars)) chars.forEach((ch: string) => ch && charSet.add(ch));
    });

    // 보조: visualAnalysis (필드 존재 시)
    const va = state.scenarioAnalysis?.visualAnalysis ?? [];
    const matched = (va as any[]).find(v =>
        Array.isArray(v.lineRange) &&
        v.lineRange[0] <= session.lineRange[1] &&
        v.lineRange[1] >= session.lineRange[0]
    );
    if (matched && Array.isArray(matched.characters)) {
        matched.characters.forEach((ch: string) => ch && charSet.add(ch));
    }

    return Array.from(charSet);
}

export function createContextModeActions(helpers: Helpers) {
    const { dispatch, stateRef, addNotification } = helpers;

    const handleAnalyzeAllScenes = async () => {
        const state = stateRef.current;
        if (state.imageEngineMode !== 'context' || state.selectedImageEngine !== 'openai') {
            addNotification('Context 모드 + OpenAI 엔진에서만 사용 가능', 'warning');
            return;
        }
        const sessions = state.scenarioAnalysis?.outfitSessions || [];
        if (sessions.length === 0) {
            addNotification('outfitSession이 없습니다. 먼저 USS 분석 진행 필요.', 'warning');
            return;
        }

        dispatch({ type: 'SET_CONTEXT_ANALYSIS_STATUS', payload: { isRunning: true, target: 'all', progress: 0, message: '' } });
        try {
            const { designs } = await analyzeForContextMode({
                targetSessions: sessions,
                script: state.userInputScript || '',
                visualAnalysis: state.scenarioAnalysis?.visualAnalysis,
                characterDescriptions: state.characterDescriptions,
                sceneLayers: state.scenarioAnalysis?.sceneLayers,
                onProgress: (current, total, message) => {
                    dispatch({
                        type: 'SET_CONTEXT_ANALYSIS_STATUS',
                        payload: { isRunning: true, target: 'all', progress: total > 0 ? (current / total) * 100 : 0, message },
                    });
                },
            });
            dispatch({ type: 'SET_CONTEXT_SCENE_DESIGNS', payload: designs });
            addNotification(`${designs.length}개 씬 분석 완료`, 'success');
        } catch (err: any) {
            addNotification(`씬 분석 실패: ${err?.message ?? err}`, 'error');
        } finally {
            dispatch({ type: 'SET_CONTEXT_ANALYSIS_STATUS', payload: undefined });
        }
    };

    const handleAnalyzeOneScene = async (sessionKey: string) => {
        const state = stateRef.current;
        const sessions = state.scenarioAnalysis?.outfitSessions || [];
        const target = sessions.find(s => buildSessionKey(s) === sessionKey);
        if (!target) {
            addNotification('대상 outfitSession을 찾을 수 없습니다', 'warning');
            return;
        }

        dispatch({ type: 'SET_CONTEXT_ANALYSIS_STATUS', payload: { isRunning: true, target: sessionKey, progress: 0 } });
        try {
            const { designs } = await analyzeForContextMode({
                targetSessions: [target],
                script: state.userInputScript || '',
                visualAnalysis: state.scenarioAnalysis?.visualAnalysis,
                characterDescriptions: state.characterDescriptions,
                sceneLayers: state.scenarioAnalysis?.sceneLayers,
            });
            if (designs.length > 0) {
                dispatch({ type: 'UPDATE_CONTEXT_SCENE_DESIGN', payload: { sessionKey, design: designs[0] } });
                addNotification('재분석 완료', 'success');
            } else {
                addNotification('분석 결과 없음', 'warning');
            }
        } catch (err: any) {
            addNotification(`재분석 실패: ${err?.message ?? err}`, 'error');
        } finally {
            dispatch({ type: 'SET_CONTEXT_ANALYSIS_STATUS', payload: undefined });
        }
    };

    const handleGenerateScene = async (sessionKey: string) => {
        const state = stateRef.current;
        const design = state.contextSceneDesigns?.find(d => d.sessionKey === sessionKey);
        if (!design) {
            addNotification('씬 디자인 없음. 먼저 분석 필요.', 'warning');
            return;
        }
        if (design.isStale) {
            addNotification('outfitSession이 변경되었습니다. 재분석이 필요합니다.', 'warning');
            return;
        }

        const sessions = state.scenarioAnalysis?.outfitSessions || [];
        const session = sessions.find(s => buildSessionKey(s) === sessionKey);
        const characters = extractCharactersForSession(state, session);

        dispatch({ type: 'SET_CONTEXT_GENERATION_STATUS', payload: { isRunning: true, target: sessionKey, progress: 0 } });
        try {
            const result = await generateContextScene({
                design,
                characters,
                characterDescriptions: state.characterDescriptions,
                sceneLayerId: design.sourceSession.layerId,
                artStyle: state.artStyle,
                customArtStyle: state.customArtStyle,
                imageRatio: state.imageRatio || '9:16',
                quality: state.openaiImageQuality || 'medium',
                onProgress: (message) => {
                    dispatch({
                        type: 'SET_CONTEXT_GENERATION_STATUS',
                        payload: { isRunning: true, target: sessionKey, progress: 50, message },
                    });
                },
            });

            dispatch({ type: 'SET_CONTEXT_SCENE_GENERATION', payload: { sessionKey, result } });
            dispatch({
                type: 'ADD_OPENAI_USAGE',
                payload: {
                    images: result.images.length,
                    costUsd: result.estimatedCostUsd,
                    quality: result.quality,
                },
            });
            addNotification(`${result.images.length}컷 생성 완료 ($${result.estimatedCostUsd.toFixed(3)})`, 'success');
        } catch (err: any) {
            const msg = String(err?.message ?? err ?? 'Unknown');
            if (msg.includes('moderation')) {
                addNotification('OpenAI 정책 거부 — 프롬프트 수정 필요', 'error');
            } else if (msg.includes('rate') || msg.includes('429')) {
                addNotification('OpenAI Rate limit — 잠시 후 재시도', 'warning');
            } else {
                addNotification(`씬 생성 실패: ${msg.slice(0, 100)}`, 'error');
            }
        } finally {
            dispatch({ type: 'SET_CONTEXT_GENERATION_STATUS', payload: undefined });
        }
    };

    return { handleAnalyzeAllScenes, handleAnalyzeOneScene, handleGenerateScene };
}
