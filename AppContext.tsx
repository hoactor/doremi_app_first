
import {
    generateEditableStoryboard,
    generateCharacterMask, generateTitleSuggestions,
    renderTextOnImage,
    regenerateSingleCutDraft,
    generateCinematicBlueprint, formatTextWithSemanticBreaks,
    normalizeScriptCuts,
    generateTitleAndSetup,
} from './services/geminiService';
import React, { createContext, useContext, useReducer, useRef, useEffect, useCallback, useState } from 'react';
import {
    AppDataState, AppAction, Cut, GeneratedImage, Notification, TextEditingTarget, EditableScene, StudioSession, NanoModel, EditableCut, LibraryAsset, Scene, GeneratedScript, ArtStyle, ApiSource,
} from './types';
import { editImageWithFlux, generateImageWithFlux, getFluxImageSize } from './services/falService';
import { buildFluxPrompt, buildFluxPromptSmart } from './appFluxPromptEngine';
import { loadOpenAiApiKey } from './utils/settingsStorage';
import { AudioSplitterModal } from './components/AudioSplitterModal';
import { get, set, del } from 'idb-keyval';
import { IS_TAURI, ensureDirectories, saveImageFile, resolveImageUrl, createProject as createProjectLocal, saveProjectMetadata, listen, loadLoraRegistry, cleanupOldProjects } from './services/tauriAdapter';
import type { LoRAEntry } from './types';
import { setGlobalRetryHandler } from './services/claudeService';
import type { ProjectListEntry as TauriProjectListEntry } from './services/tauriAdapter';

import { UIState, initialUIState } from './appTypes';

const ConfettiPiece: React.FC<{ type: 'fall' | 'explode'; style: React.CSSProperties }> = ({ type, style }) => (
    <div className={`fixed z-[100] pointer-events-none ${type === 'fall' ? 'animate-confetti-fall' : 'animate-confetti-explode'}`} style={style} />
);

interface AppContextType {
    state: AppDataState & UIState;
    dispatch: (action: AppAction) => void;
    actions: {
        setUIState: (update: Partial<UIState>) => void;
        addNotification: (message: string, type: Notification['type'], action?: { label: string; callback: () => void }) => void;
        handleAddUsage: (tokens: number, source: ApiSource) => void;
        handleGenerateTitles: () => Promise<void>;
        handleAutoSetup: () => Promise<void>;
        handleResetState: () => void;
        handleResumePipeline: () => void;
        handleResetPipeline: () => void;
        handleExportProject: () => void;
        handleImportFile: (e: any) => void;
        // Phase 5: 프로젝트 관리
        handleCreateNewProject: (title?: string) => Promise<void>;
        handleListProjects: () => Promise<TauriProjectListEntry[]>;
        handleOpenProject: (projectId: string) => Promise<void>;
        handleDeleteProject: (projectId: string) => Promise<void>;
        handleSaveProjectNow: () => Promise<void>;
        // Phase 5: 에셋
        handleSaveCharacterAsset: (characterKey: string) => Promise<void>;
        handleSaveOutfitAsset: (characterKey: string, location: string) => Promise<void>;
        handleSaveBackgroundAsset: (cutNumber: string) => Promise<void>;
        handleStartStudio: (overrides?: { artStyle?: ArtStyle, customArtStyle?: string }) => Promise<void>;
        handleResumeFromEnrichedPause: (editedBeats: import('./types').EnrichedBeat[]) => Promise<void>;
        handleRefreshLocations: (newLocations: string[]) => Promise<boolean>;
        handleConfirmSceneAnalysis: () => void;
        handleRegenerateSceneAnalysis: () => Promise<void>;
        handleGenerateStoryboardWithCustomCostumes: () => Promise<void>;
        handleUploadSourceImageForStudio: (characterKey: string, file: File) => Promise<void>;
        handleUploadUpscaledImageForStudio: (characterKey: string, file: File) => Promise<void>;
        handleUpscaleCharacterImage: (characterKey: string) => Promise<void>;
        handleInjectPersonality: (characterKey: string) => Promise<void>;
        handleEditSignaturePose: (characterKey: string, prompt: string) => Promise<void>;
        handleUndoSignaturePoseEdit: (characterKey: string) => void;
        handleEditMannequin: (characterKey: string, prompt: string) => Promise<void>;
        handleUndoMannequin: (characterKey: string) => void;
        handleGenerateLocationOutfits: (characterKey: string) => Promise<void>;
        handleGenerateOutfitImage: (characterKey: string, location: string, outfitDescription: string) => Promise<void>;
        handleTryOnOutfit: (characterKey: string, outfitKorean: string, outfitEnglish: string) => Promise<void>;
        handleModifyOutfitDescription: (characterKey: string, location: string, userRequest: string) => Promise<void>;
        handleUpdateCutCharacters: (cutNumber: string, newCharacterNames: string[]) => Promise<void>;
        handleUpdateCutIntent: (cutNumber: string, newIntent: string) => Promise<void>;
        handleAnalyzeYoutubeUrl: () => Promise<void>;
        handleEditInStudio: (studioId: 'a', imageToEdit: GeneratedImage, editPrompt: string, refUrls: string[], maskBase64?: string, sourceCutNumberOverride?: string) => Promise<void>;
        handleCreateInStudio: (studioId: 'a', baseIdentityImage: GeneratedImage, prompt: string) => Promise<void>;
        handleEditForCut: (cutNumber: string, img: GeneratedImage, prompt: string, refs: string[], mask?: string) => Promise<void>;
        handleCreateForCut: (cutNumber: string, base: GeneratedImage, prompt: string) => Promise<void>;
        handleConfirmCutAssignment: (cutNumber: string) => void;
        handleOpenTargetCutSelector: (studioId: 'a') => void;
        handleConfirmTargetCutSelection: (cutNumber: string) => void;
        handleReplaceBackground: (newBackgroundPrompt: string, cutNumber: string) => Promise<void>;
        handleClearStudioSession: (studioId: 'a') => void;
        handleRevertInStudio: (studioId: 'a') => void;
        handleUndoInStudio: (studioId: 'a') => void;
        handleCopyOriginalToCurrent: (studioId: 'a') => void;
        handleCopyPromptToStudios: (prompt: string) => void;
        handleCopyPromptToStudio: (studioId: 'a', prompt: string) => void;
        handleSaveStudioToHistory: (studioId: 'a') => void;
        handleSaveFromEditor: (newImageUrl: string, sourceInfo: GeneratedImage) => void;
        handleStudioReferenceAdd: (studioId: 'a', url: string) => void;
        handleStudioReferenceRemove: (studioId: 'a', index: number) => void;
        handleStudioReferenceClear: (studioId: 'a') => void;
        handleStudioPromptChange: (studioId: 'a', prompt: string) => void;
        handleStudioTransformChange: (studioId: 'a', zoom: number, pan: { x: number; y: number }) => void;
        handleCommitStudioTransform: (studioId: 'a', newImageDataUrl: string) => void;
        handleStudioRefill: (studioId: 'a') => Promise<void>;
        handleDeleteFromHistory: (imageId: string) => void;
        handleDownloadAllImagesZip: () => Promise<void>;
        handleDownloadFilteredImagesZip: (tagFilter: 'rough' | 'normal' | 'hq') => Promise<void>;
        handleCancelZipping: () => void;
        handleDownloadSRT: () => Promise<void>;
        handleCancelSRTGeneration: () => void;
        handleDownloadSelectedImagesZip: () => Promise<void>;
        handleOpenEditor: (info: any) => void;
        handleOpenImageViewer: (url: string, alt: string, prompt?: string) => void;
        handleOpenTextEditor: (cutNumber: string, imageUrl: string, characters: string[]) => void;
        handleDeleteCut: (cutNumber: string) => void;
        handleTextRender: (target: TextEditingTarget, text: string, textType: 'speech' | 'narration', characterName?: string) => Promise<void>;
        handleAutoGenerateImageForCut: (cut: Cut) => void;
        handleGenerateForCut: (cutNumber: string, mode: 'rough' | 'normal') => Promise<void>;
        handleGenerateAll: (mode: 'rough' | 'normal') => Promise<void>;
        handleRefinePrompt: (cutNumber: string, request: string) => Promise<void>;
        handleBatchRefine: (request: string) => Promise<void>;
        handleToggleIntenseEmotion: (cutNumber: string) => Promise<void>;
        handleToggleAllIntenseEmotion: () => void;
        handleApplyAndRunPrompt: (prompt: string, cutNumber: string) => void;
        handleOriginalPromptToActiveStudio: (prompt: string) => void;
        handlePrepareStudioForCut: (cutNumber: string, prompt: string) => void;
        handleUpdateCutFieldAndRegenerate: (cutNumber: string, field: keyof Cut, newValue: string) => Promise<void>;
        handleUpdateCutIntentAndRegenerate: (cutNumber: string, newIntent: string) => Promise<void>;
        handleRefineCharacter: (cutNumber: string, characterName: string) => void;
        handleRefineImage: (cutNumber: string) => Promise<void>;
        handleUserImageUpload: (studioId: 'a', imageDataUrl: string) => void;
        handleUpdateStudioImageFromUpload: (studioId: 'a', imageDataUrl: string) => void;
        handleUserImageUploadForStudio: (studioId: 'a', imageDataUrl: string) => void;
        handleLoadImageIntoStudio: (studioId: 'a', image: GeneratedImage) => void;
        handleSetOriginalImage: (studioId: 'a', image: GeneratedImage) => void;
        handleSetActiveStudioTarget: (studioId: 'a') => void;
        handleToggleAutoGeneration: () => void;
        handleCancelGenerateAll: () => void;
        handleRunSelectiveGeneration: (selectedCutNumbers: string[], overrideContent?: GeneratedScript) => Promise<void>;
        handleRetryFailedCuts: () => Promise<void>;
        handleRunNormalization: (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => Promise<void>;
        handleAttachAudioToCut: (cutNumber: string, file: File) => void;
        handleRemoveAudioFromCut: (cutNumber: string, indexToRemove: number) => void;
        handleUpdateCut: (cutNumber: string, data: Partial<Cut>) => void;
        handleUpdateAndFormatNarration: (cutNumber: string, newNarration: string) => Promise<void>;
        handleSelectImageForCut: (cutNumber: string, id: string | null) => void;
        handleAssignImageToCut: (cutNumber: string, image: GeneratedImage) => void; // NEW
        handleSelectAsset: (asset: LibraryAsset) => void;
        handleSelectAssetForBackground: (asset: LibraryAsset, cutNumber: string) => void;
        handleAllCharacterHairAnalysis: (characterKey: string, imageUrl: string) => Promise<void>;
        handleAddEffectToPrompt: (cutNumber: string, effectPrompt: string) => void;
        handleRemoveEffectFromPrompt: (cutNumber: string, effectPrompt: string) => void;
        handleScrollToCut: (cutNumber: string) => void;
        handleOpenReviewModalForEdit: () => void;
        handleRegenerateStoryboardDraft: () => Promise<void>;
        handleRegenerateSingleCut: (cut: EditableCut) => Promise<Partial<EditableCut> | null>;
        handleOpenReviewModal: (cutNumber: string) => void;
        handleOpenReviewModalForDirectEntry: () => void;
        handleUploadImageForCut: (cutNumber: string, file: File) => void;
        handleOpenCutSplitter: (cut: Cut) => void;
        handleConfirmCutSplit: (originalCut: Cut, splitPoints: { time: number; textIndex: number }[]) => Promise<void>;
        handleConfirmDraftReview: (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => Promise<void>;
        handleOpenGuestSelection: (cutNumber: string) => void;
        handleOpenAudioSplitter: () => void;
        handleConfirmAudioSplit: (processedAudios: { cutNumber: string; audioUrl: string; duration: number }[]) => void;
        handleUploadProjectFile: (file: File) => Promise<void>;
        handleThirdCharacterEdit: (baseImage: GeneratedImage, referenceImage: GeneratedImage, characterToReplace: string) => Promise<void>;
        triggerConfetti: (targetId?: string) => void;
        handleEditImageWithNanoWithRetry: (baseImageUrl: string, editPrompt: string, originalPrompt: string, referenceImageUrls?: string[], maskBase64?: string, masterStyleImageUrl?: string, isCreativeGeneration?: boolean, artStylePromptOverride?: string) => Promise<{ imageUrl: string, textResponse: string, tokenCount: number }>;
        handleOutpaintImageWithNanoWithRetry: (baseImageUrl: string, direction: 'up' | 'down' | 'left' | 'right') => Promise<{ imageUrl: string, textResponse: string, tokenCount: number }>;
        handleFillImageWithNanoWithRetry: (baseImageUrl: string) => Promise<{ imageUrl: string, tokenCount: number }>;
        handleUpdateCutArtStyle: (cutNumber: string, style: ArtStyle | undefined) => void;
        handleBatchUpdateStyle: (style: ArtStyle, customText: string) => void;
        handleSwapArtStyle: (newStyle: ArtStyle, newCustomText?: string) => void;
        handleApplyCharacterChangesToAllCuts: () => Promise<void>;
        handleConfirmRoughPreview: (updatedPrompts: Map<string, string>) => void;
    };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Factory for independent studio session objects


// ─── 분리된 순수 함수 (appReducer.ts) ─────────────────────────
import { 
    createInitialStudioSession, sanitizeState, buildProjectMetadata,
    restoreStateFromProject, initialAppDataState, appReducer
} from './appReducer';
import { buildArtStylePrompt, buildFinalPrompt, PromptContext } from './appStyleEngine';
import { createProjectActions, createAssetActions } from './appProjectActions';
import { runAnalysisPipeline, resumeFromEnrichedPause, resumeFromContiPause, runMSFPipeline, runUSSPipeline, cancelActivePipeline, handleRefreshLocations } from './appAnalysisPipeline';
import { editImageWithRetry } from './appImageEngine';
import { createMiscActions } from './appMiscActions';
import { createDownloadActions } from './appDownloadActions';
import { createNormalizationActions } from './appNormalizationActions';
import { createGenerationActions } from './appGenerationActions';
import { createCharacterActions } from './appCharacterActions';
import { createCutEditActions } from './appCutEditActions';
import { getEngineFromModel, createGeneratedImage } from './appUtils';


export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [appState, dispatch] = useReducer(appReducer, initialAppDataState);
    const [uiState, setUIState] = useState<UIState>(initialUIState);
    const notificationIdCounter = useRef(0);
    const isAutoGeneratingLocalRef = useRef(false);
    const isGeneratingSRTLocalRef = useRef(false);
    const isCancellingZippingLocalRef = useRef(false);
    const zippingAbortControllerRef = useRef<AbortController | null>(null);
    const currentSessionIdRef = useRef<number>(0);
    const isInitializedRef = useRef(false);
    
    // Combined State
    const state = { ...appState, ...uiState };
    const stateRef = useRef(state); // Sync ref for async actions
    const projectSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    // ─── Phase 6: LoRA 레지스트리 캐시 ────────────────────────────
    const loraRegistryRef = useRef<LoRAEntry[]>([]);
    useEffect(() => {
        if (IS_TAURI) {
            loadLoraRegistry().then(entries => {
                loraRegistryRef.current = entries;
                // styleLoraId 미설정 시 기본 치비 LoRA 자동 선택
                if (!stateRef.current.styleLoraId) {
                    const defaultStyle = entries.find(e => e.type === 'style');
                    if (defaultStyle) {
                        dispatch({ type: 'SET_STYLE_LORA', payload: { id: defaultStyle.id, scaleOverride: undefined } });
                    }
                }
            }).catch(() => {});
        }
    }, []);

    /** 현재 컷의 캐릭터 LoRA + 화풍 LoRA → loraUrls 배열 조립 */
    const collectLoraUrls = useCallback((characterNames?: string[]): { path: string; scale: number }[] => {
        const loras: { path: string; scale: number }[] = [];
        const registry = loraRegistryRef.current;
        if (!registry.length) return loras;
        const st = stateRef.current;

        // 캐릭터 LoRA
        if (characterNames) {
            for (const name of characterNames) {
                const key = Object.keys(st.characterDescriptions).find(k => { const cd = st.characterDescriptions[k]; return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name; });
                if (!key) continue;
                const char = st.characterDescriptions[key];
                if (!char.loraId) continue;
                const entry = registry.find(e => e.id === char.loraId);
                if (!entry) continue;
                loras.push({ path: entry.url, scale: char.loraScaleOverride ?? entry.scale });
            }
        }

        // 화풍 LoRA
        if (st.styleLoraId) {
            const styleEntry = registry.find(e => e.id === st.styleLoraId);
            if (styleEntry) {
                loras.push({ path: styleEntry.url, scale: st.styleLoraScaleOverride ?? styleEntry.scale });
            }
        }

        // ★ 개수 기반 자동 감쇠 (사용자 오버라이드 없는 항목만)
        if (loras.length >= 2) {
            const autoScale = loras.length === 2 ? 0.7 : loras.length === 3 ? 0.55 : 0.45;
            for (let i = 0; i < loras.length; i++) {
                // 사용자가 수동 오버라이드 설정한 항목은 감쇠 안 함
                const isCharLora = i < (characterNames?.length ?? 0);
                const hasOverride = isCharLora
                    ? (() => {
                        const name = characterNames?.[i];
                        const key = name ? Object.keys(st.characterDescriptions).find(k => { const cd = st.characterDescriptions[k]; return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name; }) : undefined;
                        return key ? st.characterDescriptions[key].loraScaleOverride != null : false;
                    })()
                    : st.styleLoraScaleOverride != null;
                if (!hasOverride) {
                    loras[i] = { ...loras[i], scale: autoScale };
                }
            }
        }

        return loras;
    }, []);

    // ─── Phase 5: 디렉토리 초기화 (Tauri만) ────────────────────────
    useEffect(() => {
        if (IS_TAURI) {
            ensureDirectories().catch(err => console.error('디렉토리 초기화 실패:', err));
            // 30일 지난 프로젝트 자동 정리
            cleanupOldProjects(30).then(result => {
                if (result.deleted.length > 0) {
                    console.log(`[cleanup] ${result.deleted.length}개 오래된 프로젝트 자동 삭제:`, result.deleted);
                }
            }).catch(err => console.warn('프로젝트 정리 실패:', err));
        }
    }, []);

    // ─── 429 재시도 UI 카운트다운 연결 ───────────────────────────────
    useEffect(() => {
        setGlobalRetryHandler((status) => {
            if (!status || !status.waiting) return;
            dispatch({ 
                type: 'SET_LOADING_DETAIL', 
                payload: `⏳ API 한도 대기 중... ${status.secondsLeft}초 남음 (${status.attempt}/${status.maxAttempts})` 
            });
        });
        return () => setGlobalRetryHandler(null);
    }, []);

    // ─── Phase 5: 프로젝트 로드 후 localPath → imageUrl 복원 ────────
    useEffect(() => {
        if (!IS_TAURI) return;
        const unresolvedImages = appState.generatedImageHistory.filter(
            img => img.localPath && !img.imageUrl
        );
        if (unresolvedImages.length === 0) return;

        const resolveAll = async () => {
            const updates: GeneratedImage[] = [...appState.generatedImageHistory];
            let changed = false;
            for (let i = 0; i < updates.length; i++) {
                const img = updates[i];
                if (img.localPath && !img.imageUrl) {
                    try {
                        const dataUrl = await resolveImageUrl(img.localPath);
                        updates[i] = { ...img, imageUrl: dataUrl };
                        changed = true;
                    } catch (err) {
                        console.warn(`이미지 복원 실패: ${img.localPath}`, err);
                    }
                }
            }
            if (changed) {
                // 이미지 히스토리 업데이트 + 컷 imageUrls 갱신
                dispatch({ type: 'RESTORE_IMAGE_URLS', payload: updates } as any);
            }
        };
        resolveAll();
    }, [appState.currentProjectId]); // 프로젝트 전환 시에만 실행

    // ─── Phase 5: 이미지 디스크 저장 헬퍼 ──────────────────────────
    const persistImageToDisk = useCallback(async (
        base64Url: string,
        cutNumber: string,
        imageId: string,
    ): Promise<string | undefined> => {
        if (!IS_TAURI) return undefined;
        const projectId = stateRef.current.currentProjectId;
        if (!projectId) return undefined;
        try {
            const filename = `cut_${cutNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}_img_${imageId.slice(0, 8)}.png`;
            const relativePath = await saveImageFile(
                'project',
                `${projectId}/images`,
                filename,
                base64Url,
            );
            return relativePath;
        } catch (err) {
            console.error('이미지 디스크 저장 실패:', err);
            return undefined;
        }
    }, []);

    // ─── Phase 5: 프로젝트 자동저장 헬퍼 ───────────────────────────
    const autoSaveProject = useCallback(async () => {
        const s = stateRef.current;
        if (!IS_TAURI || !s.currentProjectId) return;
        try {
            const metadata = buildProjectMetadata(s);
            await saveProjectMetadata(s.currentProjectId, metadata);
            dispatch({ type: 'SET_PROJECT_SAVED', payload: true });
        } catch (err) {
            console.error('프로젝트 자동저장 실패:', err);
        }
    }, []);

    // Auto-Restore on mount + v1→v2 마이그레이션
    useEffect(() => {
        const loadSavedState = async () => {
            try {
                const savedState = await get('wvs_auto_save_state');
                if (savedState) {
                    // v1→v2 마이그레이션: IndexedDB에 base64 이미지가 있고 Tauri 환경이면
                    if (IS_TAURI && savedState.generatedImageHistory?.length > 0) {
                        const hasBase64Images = savedState.generatedImageHistory.some(
                            (img: GeneratedImage) => img.imageUrl?.startsWith('data:') && !img.localPath
                        );
                        if (hasBase64Images) {
                            console.log('v1→v2 마이그레이션 감지: base64 이미지를 로컬 파일로 변환합니다...');
                            try {
                                // 프로젝트 없으면 생성
                                let projectId = savedState.currentProjectId;
                                if (!projectId) {
                                    projectId = await createProjectLocal(savedState.storyTitle || '마이그레이션 프로젝트');
                                }
                                // base64 이미지 → 파일 변환
                                const migratedHistory: GeneratedImage[] = [];
                                for (const img of savedState.generatedImageHistory) {
                                    if (img.imageUrl?.startsWith('data:') && !img.localPath) {
                                        try {
                                            const filename = `cut_${(img.sourceCutNumber || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')}_img_${img.id.slice(0, 8)}.png`;
                                            const localPath = await saveImageFile('project', `${projectId}/images`, filename, img.imageUrl);
                                            migratedHistory.push({ ...img, localPath });
                                        } catch {
                                            migratedHistory.push(img); // 실패 시 그대로 유지
                                        }
                                    } else {
                                        migratedHistory.push(img);
                                    }
                                }
                                savedState.generatedImageHistory = migratedHistory;
                                savedState.currentProjectId = projectId;
                                console.log(`v1→v2 마이그레이션 완료: ${migratedHistory.filter(i => i.localPath).length}개 이미지 변환`);
                            } catch (err) {
                                console.error('v1→v2 마이그레이션 실패:', err);
                            }
                        }
                    }
                    try {
                        dispatch({ type: 'RESTORE_STATE', payload: savedState });
                        console.log("Auto-restored previous session from IndexedDB.");
                    } catch (restoreErr) {
                        // ★ 복원 실패 시 손상된 IndexedDB 상태 제거 → 다음 재시작 시 깨끗하게
                        console.warn('IndexedDB 상태 복원 실패 — 손상 데이터 제거:', restoreErr);
                        try { await del('wvs_auto_save_state'); } catch {}
                    }
                }
            } catch (error) {
                console.error("Failed to restore state from IndexedDB:", error);
                try { await del('wvs_auto_save_state'); } catch {}
            } finally {
                isInitializedRef.current = true;
            }
        };
        loadSavedState();
    }, []);

    // Auto-Save on appState change
    useEffect(() => {
        if (!isInitializedRef.current) return;
        
        // Debounce saving to avoid performance issues on rapid state changes
        const timeoutId = setTimeout(() => {
            if (IS_TAURI && appState.currentProjectId) {
                // Tauri: project.json 기반 자동저장
                autoSaveProject().then(() => {
                    setUIState(prev => ({ ...prev, lastAutoSaved: Date.now() }));
                });
            } else {
                // 브라우저 or 프로젝트 미생성: IndexedDB 폴백
                set('wvs_auto_save_state', appState).catch(err => {
                    console.error("Failed to auto-save state to IndexedDB:", err);
                });
            }
        }, 2000); // 2초 디바운스 (이미지 저장 완료 대기)

        return () => clearTimeout(timeoutId);
    }, [appState, autoSaveProject]);

    useEffect(() => {
        const apiKey = loadOpenAiApiKey();
        if (apiKey) dispatch({ type: 'SET_OPENAI_API_KEY', payload: apiKey });
    }, []);

    const updateUIState = useCallback((update: Partial<UIState>) => {
        setUIState(prev => ({ ...prev, ...update }));
    }, []);

    const addNotification = useCallback((message: string, type: Notification['type'], action?: { label: string; callback: () => void }) => {
        const id = notificationIdCounter.current++;
        dispatch({ type: 'ADD_NOTIFICATION', payload: { id, message, type, action } });
        setTimeout(() => {
            dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
        }, action ? 8000 : 5000);  // 액션 버튼 있으면 8초, 없으면 5초
    }, []);

    // ─── Phase 10 C-2: 에셋 카탈로그 독립 창 ↔ 메인 앱 동기화 ──────
    useEffect(() => {
        if (!IS_TAURI) return;
        let unlisten: (() => void) | null = null;
        listen('asset-catalog-updated', (_payload: any) => {
            console.log('[MainApp] 에셋 카탈로그 변경 감지:', _payload);
        }).then(fn => { unlisten = fn; });
        return () => { if (unlisten) unlisten(); };
    }, []);

    useEffect(() => {
        if (!IS_TAURI) return;
        let unlisten: (() => void) | null = null;
        listen('send-to-studio', (payload: any) => {
            const { imageUrl } = payload || {};
            if (!imageUrl) return;
            const curr = stateRef.current.studioSessions['a'].referenceImageUrls || [];
            if (curr.length >= 5) {
                addNotification('참조 슬롯이 가득 찼습니다 (최대 5개)', 'error');
                return;
            }
            dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: 'a', data: { referenceImageUrls: [...curr, imageUrl] } } });
            addNotification('Studio 참조 슬롯에 이미지가 추가되었습니다.', 'success');
        }).then(fn => { unlisten = fn; });
        return () => { if (unlisten) unlisten(); };
    }, [addNotification]);

    const triggerConfetti = useCallback((targetId?: string) => {
        const pieces: React.ReactElement[] = [];
        const count = 50;
        const colors = ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'];

        let startX = window.innerWidth / 2;
        let startY = window.innerHeight / 2;

        if (targetId) {
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                startX = rect.left + rect.width / 2;
                startY = rect.top + rect.height / 2;
            }
        }

        for (let i = 0; i < count; i++) {
            const type = targetId ? 'explode' : 'fall';
            const style: React.CSSProperties = {
                left: `${startX}px`,
                top: `${startY}px`,
                width: `${Math.random() * 8 + 4}px`,
                height: `${Math.random() * 8 + 4}px`,
                backgroundColor: colors[Math.floor(Math.random() * colors.length)],
                animationDelay: `${type === 'explode' ? 0 : Math.random() * 2}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
            };
            
            if (type === 'explode') {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * 150 + 50;
                (style as any)['--tx'] = `${Math.cos(angle) * distance}px`;
                (style as any)['--ty'] = `${Math.sin(angle) * distance}px`;
            }

            const key = `confetti-${Date.now()}-${i}`;
            pieces.push(<ConfettiPiece key={key} type={type} style={style} />);
        }

        updateUIState({ confetti: [...stateRef.current.confetti, ...pieces] });

        setTimeout(() => {
            updateUIState({
                confetti: stateRef.current.confetti.filter(c => !pieces.some(p => p.key === c.key)),
            });
        }, 3000); 
    }, [updateUIState]);

    const handleAddUsage = useCallback((tokens: number, source: ApiSource) => {
        dispatch({ type: 'ADD_USAGE', payload: { tokens, source } });
    }, []);

    const getArtStylePrompt = useCallback((overrideStyle?: ArtStyle, overrideCustomText?: string) => {
        const { artStyle, customArtStyle } = stateRef.current;
        return buildArtStylePrompt(artStyle, customArtStyle, overrideStyle, overrideCustomText);
    }, []);
    
    const getVisionModelName = useCallback(() => {
        switch (stateRef.current.selectedNanoModel) {
            case 'nano-3.1':
                return 'gemini-3.1-flash-image-preview';
            case 'nano-3pro':
                return 'gemini-3-pro-image-preview';
            case 'nano-2.5':
            default:
                return 'gemini-2.5-flash-image';
        }
    }, []);

    const getFluxModelName = useCallback(() => {
        switch (stateRef.current.selectedFluxModel) {
            case 'flux-pro': return 'fal-ai/flux-2-pro';
            case 'flux-flex': return 'fal-ai/flux-2-flex';
            case 'flux-lora': return 'fal-ai/flux-2/lora';
            default: return 'fal-ai/flux-2-pro';
        }
    }, []);

    const handleEditImageWithNanoWithRetry = useCallback(async (baseImageUrl: string, editPrompt: string, originalPrompt: string, referenceImageUrls?: string[], maskBase64?: string, masterStyleImageUrl?: string, isCreativeGeneration: boolean = false, artStylePromptOverride?: string, characterNames?: string[]) => {
        const engine = stateRef.current.selectedImageEngine || 'gemini';

        if (engine === 'flux') {
            // ★ Flux 경로
            const modelName = getFluxModelName();
            const imageSize = getFluxImageSize(stateRef.current.imageRatio || '9:16');
            const isLoraModel = stateRef.current.selectedFluxModel === 'flux-lora';
            const loraUrls = isLoraModel ? collectLoraUrls(characterNames) : undefined;

            if (isLoraModel) {
                // ★ Flux LoRA: txt2img 전용 — 레퍼런스 이미지 없이 프롬프트+LoRA만 사용
                const { generateImageWithFlux: genTxt2Img } = await import('./services/falService');
                const res = await genTxt2Img(editPrompt, {
                    loraUrls: loraUrls?.length ? loraUrls : undefined,
                    imageSize,
                    endpoint: modelName,
                });
                dispatch({ type: 'ADD_FAL_USAGE', payload: { images: 1, model: 'flux-lora' } });
                return res;
            }

            const editPath = modelName.includes('flux-2') ? '/edit' : '/image-to-image';
            const endpoint = modelName + editPath;
            const res = await editImageWithFlux(baseImageUrl, editPrompt, {
                referenceImageUrls,
                loraUrls: loraUrls?.length ? loraUrls : undefined,
                strength: isCreativeGeneration ? 0.85 : 0.75,
                imageSize,
                endpoint,
            });
            dispatch({ type: 'ADD_FAL_USAGE', payload: { images: 1, model: stateRef.current.selectedFluxModel || 'flux-pro' } });
            return res;
        } else {
            // 기존 Gemini 경로 (수정 없음)
            const artStylePrompt = artStylePromptOverride || getArtStylePrompt();
            const modelName = getVisionModelName();
            const res = await editImageWithRetry(baseImageUrl, editPrompt, originalPrompt, artStylePrompt, modelName, stateRef.current.imageRatio || '1:1', referenceImageUrls, maskBase64, masterStyleImageUrl, isCreativeGeneration);
            handleAddUsage(res.tokenCount, 'gemini');
            return res;
        }
    }, [getArtStylePrompt, getVisionModelName, handleAddUsage]);

    const calculateFinalPrompt = useCallback((cut: Cut | EditableCut) => {
        return buildFinalPrompt(cut, {
            characterDescriptions: stateRef.current.characterDescriptions,
            locationVisualDNA: stateRef.current.locationVisualDNA,
            cinematographyPlan: stateRef.current.cinematographyPlan,
            imageRatio: stateRef.current.imageRatio || '1:1',
            artStyle: stateRef.current.artStyle,
        });
    }, []);

    // --- Standalone function definitions to avoid circular reference in 'actions' object ---
    
    // ── 캐릭터 액션 (appCharacterActions.ts에서 생성) ──
    const characterActions = createCharacterActions({
        dispatch, stateRef, addNotification, handleAddUsage, getVisionModelName, getArtStylePrompt, calculateFinalPrompt, handleEditImageWithNanoWithRetry, updateUIState,
    });

    // ── 컷 편집/Studio 액션 (appCutEditActions.ts에서 생성) ──
    const cutEditActions = createCutEditActions({
        dispatch, stateRef, addNotification, handleAddUsage, calculateFinalPrompt, getArtStylePrompt, getVisionModelName, handleEditImageWithNanoWithRetry, persistImageToDisk, updateUIState,
    });
    const { handleEditInStudio, handleCreateInStudio, handleEditForCut, handleCreateForCut } = cutEditActions;

    const handleStartStudio = async (overrides?: { artStyle?: ArtStyle, customArtStyle?: string }) => {
        cancelActivePipeline(); // ★ 이전 파이프라인 취소
        const mode = stateRef.current.scriptInputMode || 'narration';
        if (mode === 'uss') {
            await runUSSPipeline({ dispatch, stateRef, addNotification, handleAddUsage, updateUIState }, overrides);
        } else if (mode === 'msf') {
            await runMSFPipeline({ dispatch, stateRef, addNotification, handleAddUsage, updateUIState }, overrides);
        } else {
            await runAnalysisPipeline({ dispatch, stateRef, addNotification, handleAddUsage, updateUIState }, overrides);
        }
    };

    const handleResumeFromEnrichedPauseAction = async (editedBeats: import('./types').EnrichedBeat[]) => {
        await resumeFromEnrichedPause({ dispatch, stateRef, addNotification, handleAddUsage, updateUIState }, editedBeats);
    };

    const handleRefreshLocationsAction = async (newLocations: string[]): Promise<boolean> => {
        return handleRefreshLocations({ dispatch, stateRef, addNotification, handleAddUsage, updateUIState }, newLocations);
    };

    const handleConfirmAudioSplit = useCallback((processedAudios: { cutNumber: string; audioUrl: string; duration: number }[]) => {
        processedAudios.forEach(item => {
            dispatch({
                type: 'UPDATE_CUT',
                payload: {
                    cutNumber: item.cutNumber,
                    data: { 
                        audioDataUrls: [item.audioUrl],
                        audioDuration: item.duration
                    }
                }
            });
        });
        addNotification(`${processedAudios.length}개의 컷에 오디오가 정밀 분할되어 할당되었습니다.`, 'success');
    }, [addNotification]);

    const handleOpenReviewModalForEdit = () => {
        const { editableStoryboard, generatedContent } = stateRef.current;
        if (!editableStoryboard && generatedContent) {
            // Reconstruct editable draft from final storyboard data for re-review
            const reconstructed: EditableScene[] = generatedContent.scenes.map(s => ({
                sceneNumber: s.sceneNumber,
                title: s.title,
                cuts: s.cuts.map(c => ({
                    id: c.cutNumber,
                    narrationText: c.narration,
                    character: c.characters,
                    location: c.location,
                    sceneDescription: c.sceneDescription,
                    characterEmotionAndExpression: c.characterEmotionAndExpression,
                    characterPose: c.characterPose,
                    characterOutfit: c.characterOutfit,
                    characterIdentityDNA: c.characterIdentityDNA || '',
                    locationDescription: c.locationDescription,
                    otherNotes: c.otherNotes,
                    directorialIntent: c.directorialIntent
                }))
            }));
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: reconstructed });
        }
        updateUIState({ isStoryboardReviewModalOpen: true });
    };

    const handleUpdateAndFormatNarration = async (cutNumber: string, newNarration: string) => {
        dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { narration: newNarration, isFormattingNarration: true } } });
        try {
            const { formattedText, tokenCount } = await formatTextWithSemanticBreaks(newNarration);
            handleAddUsage(tokenCount, 'claude');
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { narration: formattedText, isFormattingNarration: false } } });
        } catch (error) {
            console.error("Narration formatting failed:", error);
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { isFormattingNarration: false } } });
        }
    };

    // ── 프로젝트/에셋 액션 (appProjectActions.ts에서 생성) ──
    const projectHelpers = { dispatch, stateRef, addNotification, autoSaveProject, setUIState: (u: any) => setUIState(u) };
    const projectActions = createProjectActions(projectHelpers);
    const assetActions = createAssetActions(projectHelpers);

    // ── 기타 액션 (appMiscActions.ts에서 생성) ──
    const miscHelpers = { dispatch, stateRef, addNotification, handleAddUsage, getVisionModelName, calculateFinalPrompt };
    const miscActions = createMiscActions(miscHelpers);

    // ── 다운로드 액션 (appDownloadActions.ts에서 생성) ──
    const downloadActions = createDownloadActions({
        dispatch, stateRef, addNotification, setUIState,
        isCancellingZippingRef: isCancellingZippingLocalRef,
        zippingAbortControllerRef,
        isGeneratingSRTRef: isGeneratingSRTLocalRef,
    });

    // ── 정규화 + 스토리보드 의상적용 (appNormalizationActions.ts에서 생성) ──
    const normalizationActions = createNormalizationActions({
        dispatch, stateRef, addNotification, handleAddUsage, updateUIState, calculateFinalPrompt, handleOpenReviewModalForEdit,
    });
    const { handleRunNormalization, handleGenerateStoryboardWithCustomCostumes } = normalizationActions;

    // ── 이미지 생성/수정 (appGenerationActions.ts에서 생성) ──
    const generateForCutRef = useRef<(cutNumber: string, mode: 'rough' | 'normal') => Promise<void>>(null as any);
    const cancelGenerateAllRef = useRef(false);
    const generationActions = createGenerationActions({
        dispatch, stateRef, addNotification, handleAddUsage, calculateFinalPrompt,
        getArtStylePrompt, getVisionModelName, handleEditImageWithNanoWithRetry,
        persistImageToDisk, triggerConfetti, currentSessionIdRef, isAutoGeneratingLocalRef,
        generateForCutRef, cancelGenerateAllRef, loraRegistryRef,
    });
    const { handleRunSelectiveGeneration, handleGenerateForCut, handleGenerateAll, handleRefinePrompt, handleBatchRefine } = generationActions;

    const actions = {
        setUIState: updateUIState,
        addNotification,
        handleAddUsage,
        handleGenerateTitles: async () => {
            updateUIState({ isGeneratingTitles: true });
            try {
                const { titles, tokenCount } = await generateTitleSuggestions(stateRef.current.userInputScript);
                handleAddUsage(tokenCount, 'claude');
                updateUIState({ titleSuggestions: titles, isGeneratingTitles: false });
            } catch (e) { updateUIState({ isGeneratingTitles: false }); }
        },
        handleAutoSetup: async () => {
            const script = stateRef.current.userInputScript;
            if (!script.trim()) { addNotification('대본을 먼저 입력해주세요.', 'error'); return; }
            updateUIState({ isGeneratingTitles: true });
            try {
                const result = await generateTitleAndSetup(script);
                handleAddUsage(result.tokenCount, 'claude');
                updateUIState({ titleSuggestions: result.titles, isGeneratingTitles: false });
                if (result.titles.length > 0 && !stateRef.current.storyTitle) {
                    dispatch({ type: 'SET_STORY_TITLE', payload: result.titles[0] });
                }
                // logline 구성: genre / tones / conflict / twist
                const parts = [result.genre, result.tones.join('+'), result.conflict, result.twist].filter(Boolean);
                if (parts.length > 0) {
                    dispatch({ type: 'SET_LOGLINE', payload: parts.join(' / ') });
                }
            } catch (e) {
                updateUIState({ isGeneratingTitles: false });
                addNotification('자동 셋업 실패: ' + (e instanceof Error ? e.message : String(e)), 'error');
            }
        },
        handleResetState: () => {
            dispatch({ type: 'RESET_STATE' });
            setUIState(initialUIState);
        },
        handleResumePipeline: () => {
            const checkpoint = stateRef.current.pipelineCheckpoint;
            const hasCharacters = Object.keys(stateRef.current.characterDescriptions).length > 0;
            const hasStoryboard = !!stateRef.current.editableStoryboard;
            const hasContiCuts = !!stateRef.current.contiCuts;

            if (checkpoint === 'conti_pause' && hasContiCuts) {
                // conti_pause: 사용자가 컷 편집 완료 → Step 6 진행
                resumeFromContiPause({ dispatch, stateRef, addNotification, handleAddUsage, updateUIState });
            } else if (checkpoint === 'analysis_done' && hasStoryboard) {
                updateUIState({ isSceneAnalysisReviewModalOpen: true });
            } else if (checkpoint === 'scene_confirmed' && hasCharacters) {
                updateUIState({ isCostumeModalOpen: true });
            } else if (checkpoint === 'costume_done') {
                handleOpenReviewModalForEdit();
            } else if (checkpoint === 'enriched_pause') {
                // enriched_pause: EnrichedScriptEditor가 처리 — no-op
            } else if (checkpoint === 'complete' || checkpoint === 'idle') {
                // 완료 또는 미시작 — no-op
            } else {
                addNotification('저장된 데이터가 손상되어 처음부터 다시 시작합니다.', 'warning');
                dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'idle' });
            }
        },
        handleResetPipeline: () => {
            cancelActivePipeline(); // ★ 진행 중인 파이프라인 취소
            dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'idle' });
            dispatch({ type: 'START_NEW_ANALYSIS' });
            setUIState(initialUIState);
        },
        // 프로젝트 + 에셋 액션 (분리됨)
        ...projectActions,
        ...assetActions,
        ...miscActions,
        handleStartStudio,
        handleResumeFromEnrichedPause: handleResumeFromEnrichedPauseAction,
        handleRefreshLocations: handleRefreshLocationsAction,
        handleConfirmSceneAnalysis: () => {
            dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'scene_confirmed' });
            updateUIState({ isSceneAnalysisReviewModalOpen: false, isCostumeModalOpen: true });
        },
        handleRegenerateSceneAnalysis: async () => handleStartStudio(),
        handleGenerateStoryboardWithCustomCostumes,
        ...characterActions,
        ...cutEditActions,
        handleAnalyzeYoutubeUrl: async () => {},
        handleEditInStudio,
        handleCreateInStudio,
        handleEditForCut,
        handleCreateForCut,
        handleConfirmCutAssignment: (cutNumber: string) => {
            const img = stateRef.current.imageToAssign; if (img) { 
                const updated = { ...img, id: window.crypto.randomUUID(), sourceCutNumber: cutNumber }; 
                dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: updated, cutNumber } }); 
                updateUIState({ isCutAssignmentModalOpen: false, imageToAssign: null }); 
            }
        },
        handleConfirmTargetCutSelection: (cutNumber: string) => { 
            const studioId = stateRef.current.targetCutSelectionStudioId;
            if (studioId) { 
                const session = stateRef.current.studioSessions[studioId];
                
                // Update history images within session to the new target cut for consistency
                const nextHistory = session.history.map(img => ({ ...img, sourceCutNumber: cutNumber }));
                const nextCurrent = session.currentImage ? { ...session.currentImage, sourceCutNumber: cutNumber } : null;
                const nextOriginal = session.originalImage ? { ...session.originalImage, sourceCutNumber: cutNumber } : null;

                dispatch({ 
                    type: 'UPDATE_STUDIO_SESSION', 
                    payload: { 
                        studioId: studioId, 
                        data: { 
                            sourceCutForNextEdit: cutNumber,
                            history: nextHistory,
                            currentImage: nextCurrent,
                            originalImage: nextOriginal
                        } 
                    } 
                }); 
                updateUIState({ isTargetCutSelectionModalOpen: false, targetCutSelectionStudioId: null }); 
            } 
        },
        handleReplaceBackground: async (newBackgroundPrompt: string, cutNumber: string) => {},
        handleClearStudioSession: (sId: 'a') => dispatch({ type: 'CLEAR_STUDIO_SESSION', payload: { studioId: sId } }),
        handleRevertInStudio: (sId: 'a') => dispatch({ type: 'REVERT_STUDIO_SESSION', payload: { studioId: sId } }),
        handleUndoInStudio: (sId: 'a') => dispatch({ type: 'UNDO_STUDIO_SESSION', payload: { studioId: sId } }),
        handleCopyOriginalToCurrent: (sId: 'a') => dispatch({ type: 'COPY_ORIGINAL_TO_CURRENT', payload: { studioId: sId } }),
        handleCopyPromptToStudios: (prompt: string) => dispatch({ type: 'COPY_PROMPT_TO_STUDIOS', payload: prompt }),
        handleCopyPromptToStudio: (studioId: 'a', prompt: string) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId, data: { editPrompt: prompt } } }),
        handleSaveStudioToHistory: (sId: 'a') => {
            const sess = stateRef.current.studioSessions[sId]; 
            if (sess.currentImage) { 
                const newImg = { ...sess.currentImage, id: window.crypto.randomUUID() };
                dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: sess.sourceCutForNextEdit || 'custom' } }); 
                addNotification('저장되었습니다.', 'success'); 
            }
        },
        handleSaveFromEditor: (url: string, info: GeneratedImage) => { 
            const newImg = { ...info, id: window.crypto.randomUUID(), imageUrl: url, createdAt: new Date().toISOString() }; 
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: info.sourceCutNumber } }); 
        },
        handleStudioReferenceAdd: (sId: 'a', url: string) => { const curr = stateRef.current.studioSessions[sId].referenceImageUrls || []; if (curr.length < 5) dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { referenceImageUrls: [...curr, url] } } }); },
        handleStudioReferenceRemove: (sId: 'a', index: number) => { const curr = [...(stateRef.current.studioSessions[sId].referenceImageUrls || [])]; curr.splice(index, 1); dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { referenceImageUrls: curr } } }); },
        handleStudioReferenceClear: (sId: 'a') => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { referenceImageUrls: [] } } }),
        handleStudioPromptChange: (sId: 'a', p: string) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { editPrompt: p } } }),
        handleStudioTransformChange: (sId: 'a', z: number, p: { x: number; y: number }) => dispatch({ type: 'UPDATE_STUDIO_TRANSFORM', payload: { studioId: sId, zoom: z, pan: p } }),
        handleCommitStudioTransform: (sId: 'a', url: string) => { const sess = stateRef.current.studioSessions[sId]; if (sess.currentImage) { const newImg = { ...sess.currentImage, id: window.crypto.randomUUID(), imageUrl: url, createdAt: new Date().toISOString() }; dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { currentImage: newImg, history: [...sess.history, newImg], zoom: 1, pan: { x: 0, y: 0 } } } }); } },
        handleStudioRefill: (sId: 'a') => Promise.resolve(),
        handleDeleteFromHistory: (id: string) => dispatch({ type: 'DELETE_FROM_IMAGE_HISTORY', payload: id }),
        ...downloadActions,
        handleOpenEditor: (info: any) => updateUIState({ isEditorOpen: true, editingImageInfo: info }),
        handleOpenImageViewer: (url: string, alt: string, prompt?: string) => updateUIState({ isImageViewerOpen: true, viewerImage: { url, alt, prompt } }),
        handleOpenTextEditor: (cutNumber: string, url: string, chars: string[]) => updateUIState({ isTextEditorOpen: true, textEditingTarget: { cutNumber, imageUrl: url, characters: chars } }),
        handleDeleteCut: (cutNumber: string) => dispatch({ type: 'DELETE_CUT', payload: cutNumber }),
        handleTextRender: async (target: TextEditingTarget, text: string, type: 'speech' | 'narration', char?: string) => {
            dispatch({ type: 'START_LOADING', payload: '텍스트 렌더링 중...' });
            try { const { imageUrl, tokenCount } = await renderTextOnImage({ ...target, text, textType: type, characterName: char }, getVisionModelName()); handleAddUsage(tokenCount, 'gemini'); const newImg = createGeneratedImage({ imageUrl, sourceCutNumber: target.cutNumber, prompt: text, model: stateRef.current.selectedNanoModel }); dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber: target.cutNumber } }); } finally { dispatch({ type: 'STOP_LOADING' }); }
        },
        handleAutoGenerateImageForCut: (cut: Cut) => handleRunSelectiveGeneration([cut.cutNumber]),
        handleGenerateForCut,
        handleGenerateAll,
        handleRefinePrompt,
        handleBatchRefine,
        handleToggleIntenseEmotion: async (cutNumber: string) => {
            const s = stateRef.current;
            const cut = s.generatedContent?.scenes.flatMap(sc => sc.cuts).find(c => c.cutNumber === cutNumber);
            if (!cut) return;
            // 이미 intense 데이터 있으면 → 단순 토글
            if (cut.characterEmotionAndExpressionIntense) {
                dispatch({ type: 'TOGGLE_INTENSE_EMOTION', payload: { cutNumber } });
                return;
            }
            // 없으면 → 확인 후 Claude로 온디맨드 생성
            if (!window.confirm('🔥 감정 강화 데이터를 생성할까요?\n(Claude API 호출)')) return;
            const contiCuts = s.contiCuts || [];
            const targetConti = contiCuts.find(c => c.id === cut.id);
            if (!targetConti) { dispatch({ type: 'TOGGLE_INTENSE_EMOTION', payload: { cutNumber } }); return; }
            const idx = contiCuts.indexOf(targetConti);
            const surrounding = contiCuts.slice(Math.max(0, idx - 2), idx + 3);
            dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { isIntensifying: true } } });
            try {
                const { intensifyCut } = await import('./services/ai/msfAnalysis');
                const { intensified, tokenCount } = await intensifyCut(targetConti, surrounding, s.characterBibles || [], s.scenarioAnalysis || {} as any);
                dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: {
                    characterEmotionAndExpressionIntense: intensified.emotionBeatIntense,
                    sceneDescriptionIntense: intensified.visualDescriptionIntense,
                    characterPoseIntense: intensified.characterPoseIntense,
                    isIntensifying: false,
                } } });
                dispatch({ type: 'TOGGLE_INTENSE_EMOTION', payload: { cutNumber } });
                handleAddUsage(tokenCount, 'claude');
            } catch (err: any) {
                dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { isIntensifying: false } } });
                addNotification(`감정 강화 실패: ${err.message?.slice(0, 50)}`, 'error');
            }
        },
        handleToggleAllIntenseEmotion: () => dispatch({ type: 'TOGGLE_ALL_INTENSE_EMOTION' }),
        handleApplyAndRunPrompt: (p: string, cutNumber: string) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: stateRef.current.activeStudioTarget, data: { editPrompt: p, sourceCutForNextEdit: cutNumber } } }),
        handleOriginalPromptToActiveStudio: (p: string) => handleCreateInStudio(stateRef.current.activeStudioTarget, stateRef.current.studioSessions[stateRef.current.activeStudioTarget].originalImage!, p),
        handlePrepareStudioForCut: (cutNumber: string, p: string) => dispatch({ type: 'PREPARE_STUDIO_FOR_CUT', payload: { studioId: stateRef.current.activeStudioTarget, cutNumber, prompt: p } }),
        handleUpdateCutFieldAndRegenerate: async (cutNumber: string, field: keyof Cut, val: string) => { const target = stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber); if (!target) return; const updates: any = { [field]: val }; if (field !== 'imagePrompt') { const temp = { ...target, ...updates }; updates.imagePrompt = calculateFinalPrompt(temp as any); } dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: updates } }); },
        handleUpdateCutIntentAndRegenerate: cutEditActions.handleUpdateCutIntent,
        handleRefineCharacter: cutEditActions.handleRefineCharacter,
        handleRefineImage: cutEditActions.handleRefineImage,
        handleUserImageUpload: (sId: 'a', url: string) => dispatch({ type: 'LOAD_USER_IMAGE_INTO_STUDIO', payload: { studioId: sId, imageDataUrl: url } }),
        handleUpdateStudioImageFromUpload: (sId: 'a', url: string) => dispatch({ type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: sId, imageDataUrl: url } }),
        handleUserImageUploadForStudio: (sId: 'a', url: string) => dispatch({ type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: sId, imageDataUrl: url } }),
        handleLoadImageIntoStudio: (sId: 'a', img: GeneratedImage) => dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: sId, image: img } }),
        handleSetOriginalImage: (sId: 'a', image: GeneratedImage) => dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: sId, image: image } }),
        handleSetActiveStudioTarget: (sId: 'a') => dispatch({ type: 'SET_ACTIVE_STUDIO_TARGET', payload: sId }),
        handleToggleAutoGeneration: () => { if (stateRef.current.isAutoGenerating) { isAutoGeneratingLocalRef.current = false; dispatch({ type: 'STOP_AUTO_GENERATION' }); } else handleRunSelectiveGeneration([]); },
        handleCancelGenerateAll: () => { cancelGenerateAllRef.current = true; dispatch({ type: 'STOP_LOADING' }); },
        handleRunSelectiveGeneration,
        handleRetryFailedCuts: async () => handleRunSelectiveGeneration(stateRef.current.failedCutNumbers),
        handleRunNormalization,
        handleAttachAudioToCut: (cutNumber: string, file: File) => { const reader = new FileReader(); reader.onload = (e) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: { audioDataUrls: [...(stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.audioDataUrls || []), e.target?.result as string] } } }); reader.readAsDataURL(file); },
        handleRemoveAudioFromCut: (cutNumber: string, idx: number) => { const current = stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.audioDataUrls || []; dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: { audioDataUrls: current.filter((_, i) => i !== idx) } } }); },
        handleUpdateCut: (cutNumber: string, data: Partial<Cut>) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data } }),
        handleSelectImageForCut: (cutNumber: string, id: string | null) => dispatch({ type: 'SELECT_IMAGE_FOR_CUT', payload: { cutNumber: cutNumber, imageId: id } }),
        handleAssignImageToCut: (cutNumber: string, image: GeneratedImage) => {
            const updated = { ...image, id: window.crypto.randomUUID(), sourceCutNumber: cutNumber }; 
            dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: updated, cutNumber } }); 
        },
        handleSelectAsset: (asset: LibraryAsset) => {
            if (stateRef.current.guestSelectionTargetCutNumber) {
                const cutNumber = stateRef.current.guestSelectionTargetCutNumber;
                const guestName = window.prompt('게스트의 역할이나 이름을 입력하세요 (예: 경찰관, 친구, 도둑):', '조연') || '조연';
                dispatch({ 
                    type: 'UPDATE_CUT', 
                    payload: { 
                        cutNumber, 
                        data: { 
                            guestCharacterUrl: asset.imageDataUrl,
                            guestCharacterName: guestName
                        } 
                    } 
                });
                dispatch({ type: 'CLOSE_ASSET_LIBRARY' });
            } else if (stateRef.current.backgroundReplacementTargetCutNumber) {
                // Handle background replacement if needed
                const cutNumber = stateRef.current.backgroundReplacementTargetCutNumber;
                // ... logic for background replacement
                dispatch({ type: 'CLOSE_ASSET_LIBRARY' });
            }
        },
        handleSelectAssetForBackground: (asset: LibraryAsset, cutNumber: string) => {},
        handleAllCharacterHairAnalysis: async (characterKey: string, imageUrl: string) => {},
        handleAddEffectToPrompt: (cutNumber: string, effectPrompt: string) => {},
        handleRemoveEffectFromPrompt: (cutNumber: string, effectPrompt: string) => {},
        handleScrollToCut: (cutNumber: string) => { const el = document.getElementById(`cut-${cutNumber}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
        handleOpenReviewModalForEdit,
        handleRegenerateStoryboardDraft: async () => { 
            const { userInputScript, enrichedScript, speakerGender, characterDescriptions } = stateRef.current; 
            dispatch({ type: 'START_LOADING', payload: '재생성 중...' }); 
            try { 
                const normalizedScript = normalizeScriptCuts(userInputScript); 
                const seed = Math.floor(Math.random() * 100000); 
                const { blueprint, tokenCount: bToken } = await generateCinematicBlueprint(enrichedScript!, seed); 
                handleAddUsage(bToken, 'claude'); 
                const { storyboard, locationDNAMap, tokenCount: sToken } = await generateEditableStoryboard(normalizedScript, enrichedScript!, blueprint, speakerGender, characterDescriptions, seed); 
                handleAddUsage(sToken, 'claude'); 
                dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: storyboard }); 
                dispatch({ type: 'SET_LOCATION_VISUAL_DNA', payload: locationDNAMap }); 
            } catch (error) {
                console.error("Failed to regenerate storyboard:", error);
                addNotification('스토리보드 재생성 중 오류가 발생했습니다.', 'error');
            } finally { 
                dispatch({ type: 'STOP_LOADING' }); 
            } 
        },
        handleRegenerateSingleCut: async (cut: EditableCut) => { 
            try {
                const seed = Math.floor(Math.random() * 100000); 
                const res = await regenerateSingleCutDraft(cut, stateRef.current.speakerGender, seed); 
                handleAddUsage(res.tokenCount, 'gemini'); 
                return res; 
            } catch (error) {
                console.error("Failed to regenerate single cut:", error);
                addNotification('단일 컷 재생성 중 오류가 발생했습니다.', 'error');
                return null;
            }
        },
        handleUpdateAndFormatNarration,
        handleOpenReviewModal: (cutNumber: string) => {},
        handleOpenReviewModalForDirectEntry: () => updateUIState({ isStoryboardReviewModalOpen: true }),
        handleUploadImageForCut: (cutNumber: string, file: File) => { const reader = new FileReader(); reader.onload = (e) => { const newImg = createGeneratedImage({ imageUrl: e.target?.result as string, sourceCutNumber: cutNumber, prompt: 'User Upload', model: stateRef.current.selectedNanoModel }); dispatch({ type: 'ADD_IMAGE_TO_CUT', payload: { image: newImg, cutNumber } }); }; reader.readAsDataURL(file); },
        handleOpenCutSplitter: (cut: Cut) => dispatch({ type: 'OPEN_CUT_SPLITTER', payload: cut }),
        handleConfirmCutSplit: async (orig: Cut, points: { time: number; textIndex: number }[]) => { dispatch({ type: 'CLOSE_CUT_SPLITTER' }); let lastIdx = 0; const newCuts = points.map((p, i) => { const text = orig.narration.substring(lastIdx, p.textIndex); lastIdx = p.textIndex; return { ...orig, id: window.crypto.randomUUID(), cutNumber: `${orig.cutNumber}-${i+1}`, narration: text.trim(), selectedImageId: i === 0 ? orig.selectedImageId : null }; }); newCuts.push({ ...orig, id: window.crypto.randomUUID(), cutNumber: `${orig.cutNumber}-${points.length+1}`, narration: orig.narration.substring(lastIdx).trim(), selectedImageId: null }); dispatch({ type: 'REPLACE_CUT', payload: { originalCutNumber: orig.cutNumber, newCuts: newCuts as Cut[] } }); },
        handleConfirmDraftReview: async (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => {
            await handleRunNormalization(updatedScenes, modifiedCutIds);
        },
        handleOpenGuestSelection: (cutNumber: string) => dispatch({ type: 'START_GUEST_SELECTION', payload: cutNumber }),
        handleOpenAudioSplitter: () => updateUIState({ isAudioSplitterOpen: true }),
        handleConfirmAudioSplit,
        handleUploadProjectFile: (file: File) => { 
            const reader = new FileReader(); 
            reader.onload = (ev) => { try { const parsed = JSON.parse(ev.target?.result as string); dispatch({ type: 'RESTORE_STATE', payload: parsed }); } catch (e) { addNotification('실패', 'error'); } }; 
            reader.readAsText(file); 
        },
        handleThirdCharacterEdit: cutEditActions.handleThirdCharacterEdit,
        triggerConfetti,
        handleEditImageWithNanoWithRetry,
        handleConfirmRoughPreview: (updatedPrompts: Map<string, string>) => {
            // 러프 프리뷰에서 확정 → 프롬프트 적용 + 모달 닫기
            // 고퀄 생성은 메인 페이지 사이드바에서 사용자가 직접 실행
            if (updatedPrompts.size > 0) {
                updatedPrompts.forEach((newPrompt, cutNumber) => {
                    dispatch({ type: 'UPDATE_CUT', payload: { cutNumber, data: { imagePrompt: newPrompt } } });
                });
                addNotification(`${updatedPrompts.size}개 컷 프롬프트 확정 완료. 사이드바에서 고퀄 생성하세요.`, 'success');
            }
            updateUIState({ isRoughPreviewModalOpen: false });
        },
    };

    return (
        <AppContext.Provider value={{ state, dispatch, actions }}>
            {children}
            {state.isAudioSplitterOpen && state.generatedContent && (
                <AudioSplitterModal 
                    isOpen={state.isAudioSplitterOpen}
                    onClose={() => updateUIState({ isAudioSplitterOpen: false })}
                    scenes={state.generatedContent.scenes}
                    onConfirm={handleConfirmAudioSplit}
                />
            )}
        </AppContext.Provider>
    );
};

export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (context === undefined) throw new Error('useAppContext must be used within AppProvider');
    return context;
};
