// appReducerHelpers/contextModeCases.ts — Phase A.6: Context 모드 씬 디자인 reducer cases
// appReducer.ts의 메인 switch에서 이 함수에 위임. 매칭되는 case 없으면 null 반환.

import type { AppDataState, AppAction } from '../types';

export function handleContextModeCases(state: AppDataState, action: AppAction): AppDataState | null {
    switch (action.type) {
        case 'SET_CONTEXT_ANALYSIS_STATUS':
            return { ...state, contextAnalysisStatus: action.payload };

        case 'SET_CONTEXT_SCENE_DESIGNS':
            return { ...state, contextSceneDesigns: action.payload };

        case 'UPDATE_CONTEXT_SCENE_DESIGN': {
            const existing = state.contextSceneDesigns || [];
            const idx = existing.findIndex(d => d.sessionKey === action.payload.sessionKey);
            if (idx === -1) return { ...state, contextSceneDesigns: [...existing, action.payload.design] };
            const next = [...existing];
            next[idx] = action.payload.design;
            return { ...state, contextSceneDesigns: next };
        }

        case 'DELETE_CONTEXT_SCENE_DESIGN':
            return { ...state, contextSceneDesigns: (state.contextSceneDesigns || []).filter(d => d.sessionKey !== action.payload) };

        case 'UPDATE_PLANNED_CUT': {
            const existing = state.contextSceneDesigns || [];
            const idx = existing.findIndex(d => d.sessionKey === action.payload.sessionKey);
            if (idx === -1) return state;
            const design = existing[idx];
            const cutIdx = design.plannedCuts.findIndex(p => p.cutIndex === action.payload.cutIndex);
            if (cutIdx === -1) return state;
            const updatedCuts = [...design.plannedCuts];
            updatedCuts[cutIdx] = { ...updatedCuts[cutIdx], ...action.payload.data };
            const next = [...existing];
            next[idx] = { ...design, plannedCuts: updatedCuts };
            return { ...state, contextSceneDesigns: next };
        }

        case 'SET_TARGET_CUT_COUNT': {
            const existing = state.contextSceneDesigns || [];
            const idx = existing.findIndex(d => d.sessionKey === action.payload.sessionKey);
            if (idx === -1) return state;
            const count = Math.min(8, Math.max(1, action.payload.count));
            const next = [...existing];
            next[idx] = { ...next[idx], targetCutCount: count };
            return { ...state, contextSceneDesigns: next };
        }

        case 'SET_CONTEXT_GENERATION_STATUS':
            return { ...state, contextGenerationStatus: action.payload };

        case 'SET_CONTEXT_SCENE_GENERATION': {
            const existing = state.contextSceneDesigns || [];
            const idx = existing.findIndex(d => d.sessionKey === action.payload.sessionKey);
            if (idx === -1) return state;
            const next = [...existing];
            next[idx] = { ...next[idx], generationResult: action.payload.result };
            return { ...state, contextSceneDesigns: next };
        }

        case 'CLEAR_CONTEXT_SCENE_GENERATION': {
            const existing = state.contextSceneDesigns || [];
            const idx = existing.findIndex(d => d.sessionKey === action.payload);
            if (idx === -1) return state;
            const next = [...existing];
            next[idx] = { ...next[idx], generationResult: undefined };
            return { ...state, contextSceneDesigns: next };
        }

        case 'MARK_CONTEXT_DESIGNS_STALE': {
            const targetKeys = new Set(action.payload);
            return {
                ...state,
                contextSceneDesigns: (state.contextSceneDesigns || []).map(d =>
                    targetKeys.has(d.sessionKey) ? { ...d, isStale: true } : d
                ),
            };
        }

        default:
            return null;
    }
}
