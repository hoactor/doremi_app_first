// appProjectActions.ts — React 의존 제로
// 프로젝트 CRUD + 에셋 저장 액션

import type { AppDataState, AppAction } from './types';
import type { ProjectListEntry } from './services/tauriAdapter';
import { UIState, initialUIState } from './appTypes';
import { buildProjectMetadata, sanitizeState, restoreStateFromProject } from './appReducer';
import { hydrateProjectAudio, persistProjectAudio } from './appAudioPersistence';
import { hydrateProjectImages, persistProjectImages } from './appImagePersistence';
import {
    downloadFile, IS_TAURI, createProject as createProjectLocal,
    saveProjectMetadata, loadProjectMetadata, listProjects as listProjectsLocal,
    deleteProject as deleteProjectLocal, saveAsset, saveAudioFile, readAudioBase64,
    saveImageFile, resolveImageUrl
} from './services/tauriAdapter';

// 같은 프로젝트 저장은 요청 순서대로 직렬화한다. 액션 팩토리가 다시 만들어져도 큐는 유지된다.
export class ProjectSaveCoordinator {
    private readonly queues = new Map<string, Promise<void>>();
    private readonly revisions = new Map<string, number>();
    private readonly blocked = new Set<string>();

    isBlocked(projectId: string): boolean {
        return this.blocked.has(projectId);
    }

    isLatest(projectId: string, revision: number): boolean {
        return this.revisions.get(projectId) === revision;
    }

    enqueue<T>(projectId: string, task: (revision: number) => Promise<T>): Promise<T> {
        if (this.isBlocked(projectId)) {
            return Promise.reject(new Error('삭제 중이거나 삭제된 프로젝트에는 저장할 수 없습니다.'));
        }
        const revision = (this.revisions.get(projectId) || 0) + 1;
        this.revisions.set(projectId, revision);
        const previous = this.queues.get(projectId) || Promise.resolve();
        const run = previous.catch(() => undefined).then(() => {
            if (this.isBlocked(projectId)) {
                throw new Error('삭제 중인 프로젝트 저장을 취소했습니다.');
            }
            return task(revision);
        });
        const tail = run.then(() => undefined, () => undefined);
        this.queues.set(projectId, tail);
        void tail.finally(() => {
            if (this.queues.get(projectId) === tail) this.queues.delete(projectId);
        });
        return run;
    }

    async blockAndDrain(projectId: string): Promise<void> {
        this.blocked.add(projectId);
        this.revisions.set(projectId, (this.revisions.get(projectId) || 0) + 1);
        await this.queues.get(projectId)?.catch(() => undefined);
    }

    unblock(projectId: string): void {
        this.blocked.delete(projectId);
    }
}

const projectSaveCoordinator = new ProjectSaveCoordinator();
let latestProjectOpenRequest = 0;

const invalidateProjectOpenRequests = (): number => ++latestProjectOpenRequest;

export interface ProjectActionHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: AppDataState };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    setUIState: (update: UIState) => void;
}

export function createProjectActions(h: ProjectActionHelpers) {
    const { dispatch, stateRef, addNotification, setUIState } = h;

    const samePaths = (left?: string[], right?: string[]): boolean =>
        left === right
        || (Array.isArray(left) && Array.isArray(right)
            && left.length === right.length
            && left.every((value, index) => value === right[index]));

    const saveProjectWithAudio = async (
        projectId: string,
        sourceState: AppDataState = stateRef.current,
    ): Promise<void> => {
        if (projectSaveCoordinator.isBlocked(projectId)) {
            throw new Error('삭제 중이거나 삭제된 프로젝트에는 저장할 수 없습니다.');
        }
        if (sourceState.currentProjectId && sourceState.currentProjectId !== projectId) {
            throw new Error('열려 있는 프로젝트와 저장 대상이 달라 저장을 중단했습니다.');
        }
        // 호출 시점의 불변 스냅샷을 큐에 넣어, 뒤늦게 끝난 저장이 최신 요청을 덮지 않게 한다.
        const snapshot = sanitizeState({ ...sourceState, currentProjectId: projectId });
        await projectSaveCoordinator.enqueue(projectId, async revision => {
            // 가져오기/업로드 이미지를 대상 프로젝트에 독립 복사한 뒤 오디오와 JSON을 저장한다.
            const imagePersisted = await persistProjectImages(
                snapshot,
                projectId,
                saveImageFile,
                resolveImageUrl,
            );
            const persisted = await persistProjectAudio(imagePersisted.state, projectId, saveAudioFile);
            const metadata = buildProjectMetadata(persisted.state);
            await saveProjectMetadata(projectId, metadata);

            const isLatestRequest = projectSaveCoordinator.isLatest(projectId, revision);
            const isStillOpen = stateRef.current.currentProjectId === projectId;
            if (!isLatestRequest || !isStillOpen) return;

            const beforeImages = new Map(snapshot.generatedImageHistory.map(image => [image.id, image] as const));
            const updatedImagePaths = persisted.state.generatedImageHistory
                .filter(image => image.localPath && beforeImages.get(image.id)?.localPath !== image.localPath)
                .map(image => ({ id: image.id, localPath: image.localPath! }));
            if (updatedImagePaths.length > 0) {
                dispatch({ type: 'UPDATE_IMAGE_LOCAL_PATHS', payload: updatedImagePaths });
            }
            if (imagePersisted.localPathReplacements.length > 0) {
                dispatch({
                    type: 'REMAP_CUT_IMAGE_URLS',
                    payload: imagePersisted.localPathReplacements,
                });
            }

            // 저장 도중 사용자가 고친 다른 컷 필드를 덮지 않고 오디오 경로만 반영한다.
            const beforeCuts = new Map(
                (snapshot.generatedContent?.scenes || [])
                    .flatMap(scene => scene.cuts)
                    .map(cut => [cut.cutNumber, cut] as const)
            );
            for (const scene of persisted.state.generatedContent?.scenes || []) {
                for (const cut of scene.cuts) {
                    const before = beforeCuts.get(cut.cutNumber);
                    if (samePaths(before?.audioPaths, cut.audioPaths) && before?.audioPath === cut.audioPath) {
                        continue;
                    }
                    dispatch({
                        type: 'UPDATE_CUT',
                        payload: {
                            cutNumber: cut.cutNumber,
                            data: {
                                audioPaths: cut.audioPaths,
                                audioPath: cut.audioPath,
                            },
                        },
                    });
                }
            }
            dispatch({ type: 'SET_PROJECT_SAVED', payload: true });
        });
    };

    const hydrateAudioIfAvailable = async (
        restored: Partial<AppDataState>,
    ): Promise<Partial<AppDataState>> => {
        const hasAudioPaths = Boolean(restored.generatedContent?.scenes.some(scene =>
            scene.cuts.some(cut => (cut.audioPaths?.length || 0) > 0 || Boolean(cut.audioPath))
        ));
        if (!IS_TAURI || !hasAudioPaths) return restored;

        return hydrateProjectAudio(restored, readAudioBase64);
    };

    const hydrateImagesIfAvailable = async (
        restored: Partial<AppDataState>,
    ): Promise<Partial<AppDataState>> => {
        if (!IS_TAURI) return restored;
        return hydrateProjectImages(restored, resolveImageUrl);
    };

    const restoreImportedProject = async (parsed: any): Promise<void> => {
        const requestId = invalidateProjectOpenRequests();
        const isMetadataProject = Boolean(
            parsed?.id
            && Array.isArray(parsed?.scenes)
            && [1, 2, 3].includes(Number(parsed?.version ?? 1))
        );
        const baseState = isMetadataProject ? restoreStateFromProject(parsed) : parsed;
        const withImages = await hydrateImagesIfAvailable(baseState);
        if (requestId !== latestProjectOpenRequest) return;
        const restored = await hydrateAudioIfAvailable(withImages);
        if (requestId !== latestProjectOpenRequest) return;
        // 가져온 파일은 기존 로컬 프로젝트 ID를 덮지 않는 새 복사본으로 연다.
        dispatch({
            type: 'RESTORE_STATE',
            payload: {
                ...restored,
                currentProjectId: null,
                projectCreatedAt: undefined,
                isProjectSaved: false,
            },
        });
        dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: null });
        dispatch({ type: 'SET_PROJECT_SAVED', payload: false });
        setUIState(initialUIState);
        addNotification('프로젝트 파일을 새 복사본으로 불러왔습니다. 저장하면 새 프로젝트가 됩니다.', 'success');
    };

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
                        await restoreImportedProject(parsed);
                    } catch { addNotification('불러오기 실패: 파일 형식이 올바르지 않습니다.', 'error'); }
                    finally { e.target.value = ''; }
                };
                reader.readAsText(file);
            }
        },

        handleUploadProjectFile: async (file: File): Promise<void> => {
            try {
                const parsed = JSON.parse(await file.text());
                await restoreImportedProject(parsed);
            } catch (error: any) {
                console.error('프로젝트 파일 불러오기 실패:', error);
                addNotification(`불러오기 실패: ${error?.message || '파일 형식이 올바르지 않습니다.'}`, 'error');
            }
        },

        handleCreateNewProject: async (title?: string) => {
            if (!IS_TAURI) { addNotification('프로젝트 저장은 데스크톱 앱에서만 가능합니다.', 'info'); return; }
            try {
                const projectTitle = title || '새 프로젝트';
                // 디스크 생성이 성공하기 전에는 현재 미저장 세션을 지우지 않는다.
                const projectId = await createProjectLocal(projectTitle);
                invalidateProjectOpenRequests();
                dispatch({ type: 'RESET_STATE' });
                setUIState(initialUIState);
                dispatch({ type: 'SET_STORY_TITLE', payload: projectTitle });
                dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
                // create_project가 빈 project.json과 목록 항목을 이미 원자적으로 기록한다.
                dispatch({ type: 'SET_PROJECT_SAVED', payload: true });
                addNotification(`프로젝트 "${projectTitle}" 생성 완료`, 'success');
            } catch (err: any) { addNotification(`프로젝트 생성 실패: ${err.message || err}`, 'error'); }
        },

        handleListProjects: async (): Promise<ProjectListEntry[]> => {
            if (!IS_TAURI) return [];
            try { return await listProjectsLocal(); }
            catch (err) { console.error('프로젝트 목록 로드 실패:', err); return []; }
        },

        handleOpenProject: async (projectId: string) => {
            if (!IS_TAURI) return;
            const requestId = invalidateProjectOpenRequests();
            try {
                dispatch({ type: 'START_LOADING', payload: '프로젝트 불러오는 중...' });
                const metadata = await loadProjectMetadata(projectId);
                const withImages = await hydrateImagesIfAvailable(restoreStateFromProject(metadata));
                const restoredState = await hydrateAudioIfAvailable(withImages);
                if (requestId !== latestProjectOpenRequest) return;
                // ★ 진단: 복원된 state의 핵심 필드 출력
                const sceneCount = restoredState.generatedContent?.scenes?.length || 0;
                const cutCount = (restoredState.generatedContent?.scenes || []).reduce(
                    (sum: number, s: any) => sum + (s.cuts?.length || 0), 0
                );
                console.log(
                    `[handleOpenProject] 복원: appState=${restoredState.appState}, ` +
                    `scenes=${sceneCount}, cuts=${cutCount}, ` +
                    `pipelineCheckpoint=${restoredState.pipelineCheckpoint}, ` +
                    `enrichedBeats=${restoredState.enrichedBeats ? restoredState.enrichedBeats.length : 'null'}, ` +
                    `contiCuts=${restoredState.contiCuts ? restoredState.contiCuts.length : 'null'}, ` +
                    `editableStoryboard=${restoredState.editableStoryboard ? 'present' : 'null'}`
                );

                dispatch({ type: 'RESTORE_STATE', payload: restoredState });
                dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
                dispatch({ type: 'SET_PROJECT_SAVED', payload: true });
                setUIState(initialUIState);

                // ★ scenes 비어있으면 사용자에게 명시적 경고
                if (sceneCount === 0) {
                    if (restoredState.pipelineCheckpoint === 'enriched_pause' && restoredState.enrichedBeats) {
                        addNotification('연출 대본 편집 단계에서 저장된 프로젝트입니다. 편집을 이어서 진행하세요.', 'info');
                    } else if (restoredState.pipelineCheckpoint === 'conti_pause' && restoredState.contiCuts) {
                        addNotification('콘티 컷 편집 단계에서 저장된 프로젝트입니다. 편집을 이어서 진행하세요.', 'info');
                    } else {
                        addNotification(
                            '프로젝트는 불러왔지만 컷 데이터가 비어있습니다. ' +
                            '분석 완료 전에 저장된 것 같습니다. 콘솔 로그에서 상세 상태 확인 가능.',
                            'warning'
                        );
                    }
                } else {
                    addNotification(`프로젝트를 불러왔습니다. (${sceneCount}씬, ${cutCount}컷)`, 'success');
                }
            } catch (err: any) {
                if (requestId === latestProjectOpenRequest) {
                    addNotification(`불러오기 실패: ${err.message || err}`, 'error');
                }
            } finally {
                if (requestId === latestProjectOpenRequest) dispatch({ type: 'STOP_LOADING' });
            }
        },

        handleDeleteProject: async (projectId: string) => {
            if (!IS_TAURI) return;
            invalidateProjectOpenRequests();
            try {
                // 이미 시작된 저장이 끝난 뒤 삭제해 오디오 폴더/프로젝트가 되살아나지 않게 한다.
                await projectSaveCoordinator.blockAndDrain(projectId);
                await deleteProjectLocal(projectId);
                if (stateRef.current.currentProjectId === projectId) {
                    dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: null });
                }
                addNotification('프로젝트가 삭제되었습니다.', 'success');
            } catch (err: any) {
                // 폴더가 실제로 남아 있을 때만 저장 잠금을 푼다. 이미 지워진 프로젝트를 되살리지 않는다.
                try {
                    await loadProjectMetadata(projectId);
                    projectSaveCoordinator.unblock(projectId);
                } catch {
                    // 삭제 도중 목록 갱신만 실패한 경우 프로젝트 폴더는 이미 없을 수 있다.
                }
                addNotification(`삭제 실패: ${err.message || err}`, 'error');
            }
        },

        handleSaveProjectNow: async (): Promise<boolean> => {
            if (!IS_TAURI) { addNotification('데스크톱 앱에서만 지원됩니다.', 'info'); return false; }
            const sourceState = stateRef.current;
            let projectId = stateRef.current.currentProjectId;
            if (!projectId) {
                const projectTitle = sourceState.storyTitle || '새 프로젝트';
                try {
                    projectId = await createProjectLocal(projectTitle);
                    dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
                } catch (err: any) {
                    addNotification(`프로젝트 생성 실패: ${err.message || err}`, 'error');
                    return false;
                }
            }
            try {
                await saveProjectWithAudio(projectId, sourceState);
                addNotification('프로젝트 저장 완료!', 'success');
                return true;
            } catch (err: any) {
                console.error('프로젝트 저장 실패:', err);
                addNotification(`프로젝트 저장 실패: ${err?.message || err}`, 'error');
                return false;
            }
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
                    // artStyle 태그 제거 (2026-04-19)
                    tags: { character: char.koreanName || characterKey, artStyle: null, location: null, description: char.hairStyleDescription || char.baseAppearance || '' },
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
                    // artStyle 태그 제거 (2026-04-19)
                    tags: { character: char.koreanName || characterKey, artStyle: null, location, description: outfitDesc },
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
                    // artStyle 태그 제거 (2026-04-19)
                    tags: { character: null, artStyle: null, location: cut.location || '', description: cut.locationDescription || '' },
                    spatialDNA: stateRef.current.locationVisualDNA[cut.location] || null,
                    prompt: cut.imagePrompt || '',
                } as any);
                addNotification(`"${cut.location}" 배경 에셋 저장!`, 'success');
            } catch (err: any) { addNotification(`에셋 저장 실패: ${err.message || err}`, 'error'); }
        },
    };
}
