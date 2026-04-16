// appProjectActions.ts — React 의존 제로
// 프로젝트 CRUD + 에셋 저장 액션

import type { AppDataState, AppAction } from './types';
import type { ProjectListEntry } from './services/tauriAdapter';
import { UIState, initialUIState } from './appTypes';
import { sanitizeState, restoreStateFromProject } from './appReducer';
import {
    downloadFile, IS_TAURI, createProject as createProjectLocal,
    saveProjectMetadata, loadProjectMetadata, listProjects as listProjectsLocal,
    deleteProject as deleteProjectLocal, saveAsset
} from './services/tauriAdapter';

export interface ProjectActionHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: AppDataState };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    autoSaveProject: () => Promise<void>;
    setUIState: (update: UIState) => void;
}

export function createProjectActions(h: ProjectActionHelpers) {
    const { dispatch, stateRef, addNotification, autoSaveProject, setUIState } = h;

    return {
        handleExportProject: async () => {
            const sanitizedState = sanitizeState(stateRef.current);
            const data = JSON.stringify(sanitizedState);
            const fileName = `${stateRef.current.storyTitle || 'wvs_project'}.wvs_project`;
            try {
                const saved = await downloadFile(data, fileName, [{ name: 'WVS Project', extensions: ['wvs_project'] }]);
                if (saved) addNotification('프로젝트 파일로 내보냈습니다.', 'success');
            } catch (err: any) {
                console.error('Export failed:', err);
                addNotification(`내보내기 실패: ${err.message || err}`, 'error');
            }
        },

        handleImportFile: async (e: any) => {
            const file = e.target.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const parsed = JSON.parse(ev.target?.result as string);
                        if (parsed.version === 2 && parsed.id && IS_TAURI) {
                            try {
                                const existing = await loadProjectMetadata(parsed.id);
                                if (existing) {
                                    dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: parsed.id });
                                    addNotification('로컬 프로젝트를 열었습니다.', 'success');
                                    return;
                                }
                            } catch {}
                        }
                        dispatch({ type: 'RESTORE_STATE', payload: parsed });
                        setUIState(initialUIState);
                        addNotification('프로젝트를 불러왔습니다.', 'success');
                    } catch { addNotification('불러오기 실패: 파일 형식이 올바르지 않습니다.', 'error'); }
                    finally { e.target.value = ''; }
                };
                reader.readAsText(file);
            }
        },

        handleCreateNewProject: async (title?: string) => {
            if (!IS_TAURI) { addNotification('프로젝트 저장은 데스크톱 앱에서만 가능합니다.', 'info'); return; }
            try {
                const projectTitle = title || '새 프로젝트';
                // ★ 이전 프로젝트 데이터 초기화 (사용자 선호 설정은 보존)
                dispatch({ type: 'RESET_STATE' });
                setUIState(initialUIState);
                const projectId = await createProjectLocal(projectTitle);
                dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
                dispatch({ type: 'SET_PROJECT_SAVED', payload: false });
                addNotification(`프로젝트 "${projectTitle}" 생성 완료`, 'success');
                setTimeout(() => autoSaveProject(), 500);
            } catch (err: any) { addNotification(`프로젝트 생성 실패: ${err.message || err}`, 'error'); }
        },

        handleListProjects: async (): Promise<ProjectListEntry[]> => {
            if (!IS_TAURI) return [];
            try { return await listProjectsLocal(); }
            catch (err) { console.error('프로젝트 목록 로드 실패:', err); return []; }
        },

        handleOpenProject: async (projectId: string) => {
            if (!IS_TAURI) return;
            try {
                dispatch({ type: 'START_LOADING', payload: '프로젝트 불러오는 중...' });
                const metadata = await loadProjectMetadata(projectId);
                const restoredState = restoreStateFromProject(metadata);
                dispatch({ type: 'RESTORE_STATE', payload: restoredState });
                dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
                dispatch({ type: 'SET_PROJECT_SAVED', payload: true });
                setUIState(initialUIState);
                addNotification('프로젝트를 불러왔습니다.', 'success');
            } catch (err: any) { addNotification(`불러오기 실패: ${err.message || err}`, 'error'); }
            finally { dispatch({ type: 'STOP_LOADING' }); }
        },

        handleDeleteProject: async (projectId: string) => {
            if (!IS_TAURI) return;
            try {
                await deleteProjectLocal(projectId);
                if (stateRef.current.currentProjectId === projectId) {
                    dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: null });
                }
                addNotification('프로젝트가 삭제되었습니다.', 'success');
            } catch (err: any) { addNotification(`삭제 실패: ${err.message || err}`, 'error'); }
        },

        handleSaveProjectNow: async () => {
            if (!IS_TAURI) { addNotification('데스크톱 앱에서만 지원됩니다.', 'info'); return; }
            if (!stateRef.current.currentProjectId) {
                const projectTitle = stateRef.current.storyTitle || '새 프로젝트';
                try {
                    const projectId = await createProjectLocal(projectTitle);
                    dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
                } catch (err: any) { addNotification(`프로젝트 생성 실패: ${err.message || err}`, 'error'); return; }
            }
            setTimeout(async () => {
                await autoSaveProject();
                addNotification('프로젝트 저장 완료!', 'success');
            }, 300);
        },
    };
}

export function createAssetActions(h: ProjectActionHelpers) {
    const { stateRef, addNotification } = h;

    return {
        handleSaveCharacterAsset: async (characterKey: string) => {
            if (!IS_TAURI) { addNotification('데스크톱 앱에서만 지원됩니다.', 'info'); return; }
            const char = stateRef.current.characterDescriptions[characterKey];
            if (!char) return;
            const imageUrl = char.characterSheetHistory?.[char.characterSheetHistory.length - 1] || char.upscaledImageUrl || char.sourceImageUrl;
            if (!imageUrl) { addNotification('저장할 이미지가 없습니다.', 'error'); return; }
            try {
                await saveAsset('character', `${char.koreanName || characterKey}.png`, imageUrl, {
                    name: char.koreanName || characterKey,
                    tags: { character: char.koreanName || characterKey, artStyle: stateRef.current.artStyle, location: null, description: char.hairStyleDescription || char.baseAppearance || '' },
                    visualDNA: { hair: char.hairStyleDescription || '', colorPalette: {}, distinctiveMarks: '' },
                    prompt: char.revisedPrompt || char.firstScenePrompt || '',
                } as any);
                addNotification(`"${char.koreanName}" 인물 에셋 저장 완료!`, 'success');
            } catch (err: any) { addNotification(`에셋 저장 실패: ${err.message || err}`, 'error'); }
        },

        handleSaveOutfitAsset: async (characterKey: string, location: string) => {
            if (!IS_TAURI) return;
            const char = stateRef.current.characterDescriptions[characterKey];
            if (!char) return;
            const outfitImage = (char as any).locationOutfitImages?.[location]?.imageUrl;
            const outfitDesc = char.locations?.[location] || '';
            const imageUrl = outfitImage || char.characterSheetHistory?.[char.characterSheetHistory.length - 1];
            if (!imageUrl) { addNotification('저장할 이미지가 없습니다.', 'error'); return; }
            try {
                await saveAsset('outfit', `${char.koreanName}_${location}.png`, imageUrl, {
                    name: `${char.koreanName} ${location}`,
                    tags: { character: char.koreanName || characterKey, artStyle: stateRef.current.artStyle, location, description: outfitDesc },
                    outfitData: { englishDescription: outfitDesc, locations: [location] },
                    prompt: '',
                } as any);
                addNotification(`"${char.koreanName} ${location}" 의상 에셋 저장!`, 'success');
            } catch (err: any) { addNotification(`에셋 저장 실패: ${err.message || err}`, 'error'); }
        },

        handleSaveBackgroundAsset: async (cutNumber: string) => {
            if (!IS_TAURI) return;
            const cut = stateRef.current.generatedContent?.scenes.flatMap(s => s.cuts).find(c => c.cutNumber === cutNumber);
            if (!cut) return;
            const selectedImg = stateRef.current.generatedImageHistory.find(img => img.id === cut.selectedImageId);
            const imageUrl = selectedImg?.imageUrl || cut.imageUrls?.[0];
            if (!imageUrl) { addNotification('저장할 이미지가 없습니다.', 'error'); return; }
            try {
                await saveAsset('background', `bg_${cutNumber}.png`, imageUrl, {
                    name: `${cut.location || cutNumber} 배경`,
                    tags: { character: null, artStyle: cut.artStyleOverride || stateRef.current.artStyle, location: cut.location || '', description: cut.locationDescription || '' },
                    spatialDNA: stateRef.current.locationVisualDNA[cut.location] || null,
                    prompt: cut.imagePrompt || '',
                } as any);
                addNotification(`"${cut.location}" 배경 에셋 저장!`, 'success');
            } catch (err: any) { addNotification(`에셋 저장 실패: ${err.message || err}`, 'error'); }
        },
    };
}
