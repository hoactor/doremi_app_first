// appReducerHelpers/blockEditorCases.ts — Phase A: 블록 에디터 reducer cases
// outfitSession / sceneLayer / characterVariant 편집 11개 case + SET_IMAGE_ENGINE_MODE
// appReducer.ts의 메인 switch에서 위임. 매칭 없으면 null.

import type { AppDataState, AppAction, OutfitSession, SceneLayer, ContiCut } from '../types';
import { DEFAULT_SCENE_LAYER_ID } from '../types/pipeline';
import { buildSessionKey } from '../appUtils';

export function handleBlockEditorCases(state: AppDataState, action: AppAction): AppDataState | null {
    switch (action.type) {
        case 'SET_IMAGE_ENGINE_MODE':
            // Phase B v3: 에피소드 중에도 토글 가능 (런타임 reference 결정 — 기존 데이터 안 깨짐)
            return { ...state, imageEngineMode: action.payload };

        case 'UPDATE_SCENE_LAYER': {
            if (!state.scenarioAnalysis) return state;
            const sa = state.scenarioAnalysis;
            const newLayers = (sa.sceneLayers || []).map(l =>
                l.id === action.payload.layerId ? { ...l, ...action.payload.data } : l
            );
            return { ...state, scenarioAnalysis: { ...sa, sceneLayers: newLayers } };
        }

        case 'UPDATE_OUTFIT_SESSION': {
            if (!state.scenarioAnalysis) return state;
            const sa = state.scenarioAnalysis;
            const old = (sa.outfitSessions || [])[action.payload.index];
            const newSessions = (sa.outfitSessions || []).map((os, i) =>
                i === action.payload.index ? { ...os, ...action.payload.data } : os
            );
            // Phase A.6: 영향받는 design을 stale 표시
            const affectedKey = old ? buildSessionKey(old) : null;
            const designs = affectedKey
                ? (state.contextSceneDesigns || []).map(d =>
                    d.sessionKey === affectedKey ? { ...d, isStale: true } : d
                )
                : state.contextSceneDesigns;
            return { ...state, scenarioAnalysis: { ...sa, outfitSessions: newSessions }, contextSceneDesigns: designs };
        }

        case 'SPLIT_OUTFIT_SESSION': {
            if (!state.scenarioAnalysis) return state;
            const sa = state.scenarioAnalysis;
            const target = (sa.outfitSessions || [])[action.payload.index];
            if (!target) return state;
            const splitLine = action.payload.splitAtLine;
            if (splitLine <= target.lineRange[0] || splitLine > target.lineRange[1]) return state;
            const left: OutfitSession = { ...target, lineRange: [target.lineRange[0], splitLine - 1] };
            const right: OutfitSession = {
                ...target,
                lineRange: [splitLine, target.lineRange[1]],
                userLabel: undefined,
                transitionFromPrev: 'maintain',
            };
            const sessions = sa.outfitSessions || [];
            const newSessions = [
                ...sessions.slice(0, action.payload.index),
                left,
                right,
                ...sessions.slice(action.payload.index + 1),
            ];
            const affectedKey = buildSessionKey(target);
            const designs = (state.contextSceneDesigns || []).map(d =>
                d.sessionKey === affectedKey ? { ...d, isStale: true } : d
            );
            return { ...state, scenarioAnalysis: { ...sa, outfitSessions: newSessions }, contextSceneDesigns: designs };
        }

        case 'MERGE_OUTFIT_SESSIONS': {
            if (!state.scenarioAnalysis) return state;
            const sa = state.scenarioAnalysis;
            const sessions = sa.outfitSessions || [];
            const a = sessions[action.payload.firstIndex];
            const b = sessions[action.payload.firstIndex + 1];
            if (!a || !b) return state;
            if (a.location !== b.location || a.layerId !== b.layerId) return state;
            if (a.lineRange[1] + 1 !== b.lineRange[0]) {
                console.warn('[MERGE_OUTFIT_SESSIONS] 인접하지 않은 배치는 병합 불가:', a.lineRange, b.lineRange);
                return state;
            }
            const merged: OutfitSession = {
                ...a,
                lineRange: [Math.min(a.lineRange[0], b.lineRange[0]), Math.max(a.lineRange[1], b.lineRange[1])],
            };
            const newSessions = [
                ...sessions.slice(0, action.payload.firstIndex),
                merged,
                ...sessions.slice(action.payload.firstIndex + 2),
            ];
            const aKey = buildSessionKey(a), bKey = buildSessionKey(b);
            const designs = (state.contextSceneDesigns || []).map(d =>
                (d.sessionKey === aKey || d.sessionKey === bKey) ? { ...d, isStale: true } : d
            );
            return { ...state, scenarioAnalysis: { ...sa, outfitSessions: newSessions }, contextSceneDesigns: designs };
        }

        case 'CONVERT_TO_MEMORY_BATCH': {
            if (!state.scenarioAnalysis) return state;
            const sa = state.scenarioAnalysis;
            const sessions = sa.outfitSessions || [];
            const target = sessions[action.payload.sessionIndex];
            if (!target) return state;
            const oldLayerId = target.layerId;
            const targetLocation = target.location;
            const targetLineRange = target.lineRange;
            const isInRange = (line: number) => line >= targetLineRange[0] && line <= targetLineRange[1];

            const newLayerId = `회상_${Date.now()}`;
            const newLayer: SceneLayer = {
                id: newLayerId,
                label: action.payload.layerLabel,
                isFlashback: true,
                toneModifier: action.payload.toneModifier ?? 'warm-vintage',
            };
            const updatedSession: OutfitSession = { ...target, layerId: newLayerId, userLabel: undefined };
            const newLayers = [...(sa.sceneLayers || []), newLayer];
            const newSessions = sessions.map((os, i) => i === action.payload.sessionIndex ? updatedSession : os);

            const updateContiByLine = (cuts: ContiCut[]): ContiCut[] =>
                cuts.map(c => {
                    const line = c.originLines?.[0];
                    if (line != null && isInRange(line) && c.location === targetLocation) {
                        return { ...c, sceneLayerId: newLayerId };
                    }
                    return c;
                });

            const updateByOldLayer = <T extends { sceneLayerId?: string; location: string }>(cuts: T[]): T[] =>
                cuts.map(c =>
                    c.sceneLayerId === oldLayerId && c.location === targetLocation
                        ? { ...c, sceneLayerId: newLayerId }
                        : c
                );

            const newStoryboard = state.editableStoryboard?.map(scene => ({
                ...scene,
                cuts: updateByOldLayer(scene.cuts),
            })) ?? null;
            const newContiCuts = state.contiCuts ? updateContiByLine(state.contiCuts) : null;
            const newGeneratedContent = state.generatedContent ? {
                ...state.generatedContent,
                scenes: state.generatedContent.scenes.map(scene => ({
                    ...scene,
                    cuts: updateByOldLayer(scene.cuts),
                })),
            } : null;

            const affectedKey = buildSessionKey(target);
            const designs = (state.contextSceneDesigns || []).map(d =>
                d.sessionKey === affectedKey ? { ...d, isStale: true } : d
            );
            return {
                ...state,
                scenarioAnalysis: { ...sa, sceneLayers: newLayers, outfitSessions: newSessions },
                editableStoryboard: newStoryboard,
                contiCuts: newContiCuts,
                generatedContent: newGeneratedContent,
                contextSceneDesigns: designs,
            };
        }

        case 'ADD_SCENE_LAYER': {
            if (!state.scenarioAnalysis) return state;
            const sa = state.scenarioAnalysis;
            return { ...state, scenarioAnalysis: { ...sa, sceneLayers: [...(sa.sceneLayers || []), action.payload] } };
        }

        case 'DELETE_SCENE_LAYER': {
            if (!state.scenarioAnalysis) return state;
            const sa = state.scenarioAnalysis;
            if (action.payload === DEFAULT_SCENE_LAYER_ID) return state;
            const oldSessions = sa.outfitSessions || [];
            const affectedKeys = new Set(oldSessions.filter(os => os.layerId === action.payload).map(buildSessionKey));
            const newSessions = oldSessions.map(os =>
                os.layerId === action.payload ? { ...os, layerId: DEFAULT_SCENE_LAYER_ID, userLabel: undefined } : os
            );
            const newLayers = (sa.sceneLayers || []).filter(l => l.id !== action.payload);

            const updateCutLayer = <T extends { sceneLayerId?: string }>(cuts: T[]): T[] =>
                cuts.map(c => c.sceneLayerId === action.payload ? { ...c, sceneLayerId: DEFAULT_SCENE_LAYER_ID } : c);

            const newStoryboard = state.editableStoryboard?.map(scene => ({
                ...scene,
                cuts: updateCutLayer(scene.cuts),
            })) ?? null;
            const newContiCuts = state.contiCuts ? updateCutLayer(state.contiCuts) : null;
            const newGeneratedContent = state.generatedContent ? {
                ...state.generatedContent,
                scenes: state.generatedContent.scenes.map(scene => ({
                    ...scene,
                    cuts: updateCutLayer(scene.cuts),
                })),
            } : null;

            const designs = (state.contextSceneDesigns || []).map(d =>
                affectedKeys.has(d.sessionKey) ? { ...d, isStale: true } : d
            );
            return {
                ...state,
                scenarioAnalysis: { ...sa, sceneLayers: newLayers, outfitSessions: newSessions },
                editableStoryboard: newStoryboard,
                contiCuts: newContiCuts,
                generatedContent: newGeneratedContent,
                contextSceneDesigns: designs,
            };
        }

        case 'ADD_CHARACTER_VARIANT': {
            const char = state.characterDescriptions[action.payload.characterKey];
            if (!char) return state;
            const variants = [...(char.variants || []), action.payload.variant];
            return {
                ...state,
                characterDescriptions: {
                    ...state.characterDescriptions,
                    [action.payload.characterKey]: { ...char, variants },
                },
            };
        }

        case 'UPDATE_CHARACTER_VARIANT': {
            const char = state.characterDescriptions[action.payload.characterKey];
            if (!char) return state;
            const variants = (char.variants || []).map(v =>
                v.variantId === action.payload.variantId ? { ...v, ...action.payload.data } : v
            );
            return {
                ...state,
                characterDescriptions: {
                    ...state.characterDescriptions,
                    [action.payload.characterKey]: { ...char, variants },
                },
            };
        }

        case 'DELETE_CHARACTER_VARIANT': {
            const char = state.characterDescriptions[action.payload.characterKey];
            if (!char) return state;
            const variants = (char.variants || []).filter(v => v.variantId !== action.payload.variantId);
            return {
                ...state,
                characterDescriptions: {
                    ...state.characterDescriptions,
                    [action.payload.characterKey]: { ...char, variants },
                },
            };
        }

        default:
            return null;
    }
}
