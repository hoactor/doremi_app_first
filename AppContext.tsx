
import React, { createContext, useContext, useReducer, useRef, useEffect, useCallback, useState } from 'react';
import { 
    AppDataState, AppAction, Cut, GeneratedImage, Notification, TextEditingTarget, EditableScene, StudioSession, CharacterDescription, NanoModel, EditableCut, ClosetCharacter, LibraryAsset, Scene, GeneratedScript, ArtStyle
} from './types';
import { loadOpenAiApiKey } from './utils/settingsStorage';
import { UIState, initialUIState } from './appTypes';
// sanitizeState moved to appProjectActions
import { initialAppDataState, appReducer } from './appReducer';
import { buildArtStylePrompt, buildFinalPrompt } from './appStyleEngine';
import { getVisionModelName as getVisionModelNamePure, editImageWithNanoWithRetry } from './appImageEngine';
import JSZip from 'jszip';
import { createCharacterActions } from './appCharacterActions';
import { createCutEditActions } from './appCutEditActions';
import { createGenerationActions } from './appGenerationActions';
import { createMiscActions } from './appMiscActions';
import { createAnalysisPipelineActions } from './appAnalysisPipeline';
import { createNormalizationActions } from './appNormalizationActions';
import { createProjectActions } from './appProjectActions';
import { AudioSplitterModal } from './components/AudioSplitterModal';
import { get, set } from 'idb-keyval';

// Define ConfettiPiece component locally
const ConfettiPiece: React.FC<{ type: 'fall' | 'explode'; style: React.CSSProperties }> = ({ type, style }) => (
    <div className={`fixed z-[100] pointer-events-none ${type === 'fall' ? 'animate-confetti-fall' : 'animate-confetti-explode'}`} style={style} />
);

interface AppContextType {
    state: AppDataState & UIState;
    dispatch: React.Dispatch<AppAction>;
    actions: {
        setUIState: (update: Partial<UIState>) => void;
        addNotification: (message: string, type: Notification['type']) => void;
        handleAddUsage: (geminiTokens: number, dalleImages: number) => void;
        handleGenerateTitles: () => Promise<void>;
        handleResetState: () => void;
        handleExportProject: () => void;
        handleImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
        handleStartStudio: (overrides?: { artStyle?: ArtStyle, customArtStyle?: string }) => Promise<void>;
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
        handleEditInStudio: (studioId: 'a' | 'b', imageToEdit: GeneratedImage, editPrompt: string, refUrl: string | null, maskBase64?: string, sourceCutNumberOverride?: string) => Promise<void>;
        handleCreateInStudio: (studioId: 'a' | 'b', baseIdentityImage: GeneratedImage, prompt: string) => Promise<void>;
        handleConfirmCutAssignment: (cutNumber: string) => void;
        handleOpenTargetCutSelector: (studioId: 'a' | 'b') => void;
        handleConfirmTargetCutSelection: (cutNumber: string) => void;
        handleReplaceBackground: (newBackgroundPrompt: string, cutNumber: string) => Promise<void>;
        handleClearStudioSession: (studioId: 'a' | 'b') => void;
        handleRevertInStudio: (studioId: 'a' | 'b') => void;
        handleUndoInStudio: (studioId: 'a' | 'b') => void;
        handleCopyOriginalToCurrent: (studioId: 'a' | 'b') => void;
        handleCopyPromptToStudios: (prompt: string) => void;
        handleCopyPromptToStudio: (studioId: 'a' | 'b', prompt: string) => void;
        handleSaveStudioToHistory: (studioId: 'a' | 'b') => void;
        handleSaveFromEditor: (newImageUrl: string, sourceInfo: GeneratedImage) => void;
        handleStudioReferenceChange: (studioId: 'a' | 'b', url: string | null) => void;
        handleStudioPromptChange: (studioId: 'a' | 'b', prompt: string) => void;
        handleStudioTransformChange: (studioId: 'a' | 'b', zoom: number, pan: { x: number; y: number }) => void;
        handleCommitStudioTransform: (studioId: 'a' | 'b', newImageDataUrl: string) => void;
        handleStudioRefill: (studioId: 'a' | 'b') => Promise<void>;
        handleSendImageToStudio: (image: GeneratedImage) => void;
        handleDeleteFromHistory: (imageId: string) => void;
        handleDownloadAllImagesZip: () => Promise<void>;
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
        handleApplyAndRunPrompt: (prompt: string, cutNumber: string) => void;
        handleOriginalPromptToActiveStudio: (prompt: string) => void;
        handlePrepareStudioForCut: (cutNumber: string, prompt: string) => void;
        handleUpdateCutFieldAndRegenerate: (cutNumber: string, field: keyof Cut, newValue: string) => Promise<void>;
        handleUpdateCutIntentAndRegenerate: (cutNumber: string, newIntent: string) => Promise<void>;
        handleRefineCharacter: (cutNumber: string, characterName: string) => void;
        handleRefineImage: (cutNumber: string) => Promise<void>;
        handleUserImageUpload: (studioId: 'a' | 'b', imageDataUrl: string) => void;
        handleUpdateStudioImageFromUpload: (studioId: 'a' | 'b', imageDataUrl: string) => void;
        handleUserImageUploadForStudio: (studioId: 'a' | 'b', imageDataUrl: string) => void;
        handleLoadImageIntoStudio: (studioId: 'a' | 'b', image: GeneratedImage) => void;
        handleSetOriginalImage: (studioId: 'a' | 'b', image: GeneratedImage) => void;
        handleSetActiveStudioTarget: (studioId: 'a' | 'b') => void;
        handleToggleAutoGeneration: () => void;
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
        handleGenerateMask: (imageUrl: string) => Promise<string | null>;
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
        handleEditImageWithNanoWithRetry: (baseImageUrl: string, editPrompt: string, originalPrompt: string, referenceImageUrl?: string, maskBase64?: string, masterStyleImageUrl?: string, isCreativeGeneration?: boolean, artStylePromptOverride?: string) => Promise<{ imageUrl: string, textResponse: string, tokenCount: number }>;
        handleOutpaintImageWithNanoWithRetry: (baseImageUrl: string, direction: 'up' | 'down' | 'left' | 'right') => Promise<{ imageUrl: string, textResponse: string, tokenCount: number }>;
        handleFillImageWithNanoWithRetry: (baseImageUrl: string) => Promise<{ imageUrl: string, tokenCount: number }>;
        handleUpdateCutArtStyle: (cutNumber: string, style: ArtStyle | undefined) => void;
        handleBatchUpdateStyle: (style: ArtStyle, customText: string) => void;
        handleApplyCharacterChangesToAllCuts: () => Promise<void>;
    };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    // Auto-Restore on mount
    useEffect(() => {
        const loadSavedState = async () => {
            try {
                const savedState = await get('wvs_auto_save_state');
                if (savedState) {
                    dispatch({ type: 'RESTORE_STATE', payload: savedState });
                    console.log("Auto-restored previous session from IndexedDB.");
                }
            } catch (error) {
                console.error("Failed to restore state from IndexedDB:", error);
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
            set('wvs_auto_save_state', appState).catch(err => {
                console.error("Failed to auto-save state to IndexedDB:", err);
            });
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [appState]);

    useEffect(() => {
        const apiKey = loadOpenAiApiKey();
        if (apiKey) dispatch({ type: 'SET_OPENAI_API_KEY', payload: apiKey });
    }, []);

    const updateUIState = useCallback((update: Partial<UIState>) => {
        setUIState(prev => ({ ...prev, ...update }));
    }, []);

    const addNotification = useCallback((message: string, type: Notification['type']) => {
        const id = notificationIdCounter.current++;
        dispatch({ type: 'ADD_NOTIFICATION', payload: { id, message, type } });
        setTimeout(() => {
            dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
        }, 5000);
    }, []);

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

    const handleAddUsage = useCallback((geminiTokens: number, dalleImages: number) => {
        dispatch({ type: 'ADD_USAGE', payload: { geminiTokens, dalleImages } });
    }, []);

    const getArtStylePrompt = useCallback((overrideStyle?: ArtStyle, overrideCustomText?: string) => {
        return buildArtStylePrompt(stateRef.current.artStyle, stateRef.current.customArtStyle, overrideStyle, overrideCustomText);
    }, []);
    
    const getVisionModelName = useCallback(() => {
        return getVisionModelNamePure(stateRef.current.selectedNanoModel);
    }, []);

    const handleEditImageWithNanoWithRetry = useCallback(async (baseImageUrl: string, editPrompt: string, originalPrompt: string, referenceImageUrl?: string, maskBase64?: string, masterStyleImageUrl?: string, isCreativeGeneration: boolean = false, artStylePromptOverride?: string) => {
        return editImageWithNanoWithRetry(
            { getArtStylePrompt, getVisionModelName, handleAddUsage },
            baseImageUrl, editPrompt, originalPrompt, referenceImageUrl, maskBase64, masterStyleImageUrl, isCreativeGeneration, artStylePromptOverride,
        );
    }, [getArtStylePrompt, getVisionModelName, handleAddUsage]);

    const calculateFinalPrompt = useCallback((cut: Cut | EditableCut) => {
        const activeStyle = ('artStyleOverride' in cut && cut.artStyleOverride)
            ? cut.artStyleOverride
            : stateRef.current.artStyle;

        return buildFinalPrompt(cut, {
            characterDescriptions: stateRef.current.characterDescriptions,
            locationVisualDNA: stateRef.current.locationVisualDNA,
            artStylePrompt: getArtStylePrompt(),
            activeArtStyle: activeStyle,
        });
    }, [getArtStylePrompt]);

    // --- Cut edit actions from factory ---
    const cutEditActions = createCutEditActions({
        dispatch, stateRef, addNotification, handleAddUsage,
        handleEditImageWithNanoWithRetry, getArtStylePrompt, getVisionModelName,
        updateUIState, calculateFinalPrompt,
    });

    const handleEditInStudio = cutEditActions.handleEditInStudio;
    const handleCreateInStudio = cutEditActions.handleCreateInStudio;

    // --- Misc actions from factory ---
    const miscActions = createMiscActions({
        dispatch, stateRef, addNotification, handleAddUsage,
        handleEditImageWithNanoWithRetry, getArtStylePrompt: getArtStylePrompt, getVisionModelName,
        updateUIState,
    });

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

    // --- Generation actions from factory ---
    const generationActions = createGenerationActions({
        dispatch, stateRef, addNotification, handleAddUsage,
        handleEditImageWithNanoWithRetry, getArtStylePrompt, getVisionModelName,
        triggerConfetti, currentSessionIdRef, isAutoGeneratingLocalRef,
        updateUIState, calculateFinalPrompt,
    });

    const handleRunSelectiveGeneration = generationActions.handleRunSelectiveGeneration;

    // --- Analysis pipeline actions from factory ---
    const pipelineActions = createAnalysisPipelineActions({
        dispatch, stateRef, addNotification, handleAddUsage,
        updateUIState, triggerConfetti, getArtStylePrompt, calculateFinalPrompt,
    });

    // --- Normalization actions from factory ---
    const normalizationActions = createNormalizationActions({
        dispatch, stateRef, addNotification, handleAddUsage,
        updateUIState, calculateFinalPrompt,
    });

    const characterActions = createCharacterActions({
        dispatch,
        stateRef,
        addNotification,
        handleAddUsage,
        handleEditImageWithNanoWithRetry,
        getArtStylePrompt,
        getVisionModelName,
    });

    // --- Project actions from factory ---
    const projectActions = createProjectActions({
        dispatch, stateRef, addNotification, updateUIState, setUIState,
    });

    const actions = {
        setUIState: updateUIState,
        addNotification,
        handleAddUsage,
        handleGenerateTitles: pipelineActions.handleGenerateTitles,
        handleResetState: projectActions.handleResetState,
        handleExportProject: projectActions.handleExportProject,
        handleImportFile: projectActions.handleImportFile,
        handleStartStudio: pipelineActions.handleStartStudio,
        handleConfirmSceneAnalysis: pipelineActions.handleConfirmSceneAnalysis,
        handleRegenerateSceneAnalysis: pipelineActions.handleRegenerateSceneAnalysis,
        handleGenerateStoryboardWithCustomCostumes: pipelineActions.handleGenerateStoryboardWithCustomCostumes,
        handleApplyCharacterChangesToAllCuts: normalizationActions.handleApplyCharacterChangesToAllCuts,
        ...characterActions,
        ...cutEditActions,
        handleAnalyzeYoutubeUrl: pipelineActions.handleAnalyzeYoutubeUrl,
        handleReplaceBackground: miscActions.handleReplaceBackground,
        handleClearStudioSession: (sId: 'a' | 'b') => dispatch({ type: 'CLEAR_STUDIO_SESSION', payload: { studioId: sId } }),
        handleRevertInStudio: (sId: 'a' | 'b') => dispatch({ type: 'REVERT_STUDIO_SESSION', payload: { studioId: sId } }),
        handleUndoInStudio: (sId: 'a' | 'b') => dispatch({ type: 'UNDO_STUDIO_SESSION', payload: { studioId: sId } }),
        handleCopyOriginalToCurrent: (sId: 'a' | 'b') => dispatch({ type: 'COPY_ORIGINAL_TO_CURRENT', payload: { studioId: sId } }),
        handleCopyPromptToStudios: (prompt: string) => dispatch({ type: 'COPY_PROMPT_TO_STUDIOS', payload: prompt }),
        handleCopyPromptToStudio: (studioId: 'a' | 'b', prompt: string) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId, data: { editPrompt: prompt } } }),
        handleSaveStudioToHistory: (sId: 'a' | 'b') => {
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
        handleStudioReferenceChange: (sId: 'a' | 'b', url: string | null) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { referenceImageUrl: url } } }),
        handleStudioPromptChange: (sId: 'a' | 'b', p: string) => dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { editPrompt: p } } }),
        handleStudioTransformChange: (sId: 'a' | 'b', z: number, p: { x: number; y: number }) => dispatch({ type: 'UPDATE_STUDIO_TRANSFORM', payload: { studioId: sId, zoom: z, pan: p } }),
        handleCommitStudioTransform: (sId: 'a' | 'b', url: string) => { const sess = stateRef.current.studioSessions[sId]; if (sess.currentImage) { const newImg = { ...sess.currentImage, id: window.crypto.randomUUID(), imageUrl: url, createdAt: new Date().toISOString() }; dispatch({ type: 'UPDATE_STUDIO_SESSION', payload: { studioId: sId, data: { currentImage: newImg, history: [...sess.history, newImg], zoom: 1, pan: { x: 0, y: 0 } } } }); } },
        handleStudioRefill: miscActions.handleStudioRefill,
        handleSendImageToStudio: (img: GeneratedImage) => dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: stateRef.current.activeStudioTarget, image: img } }),
        handleDeleteFromHistory: (id: string) => dispatch({ type: 'DELETE_FROM_IMAGE_HISTORY', payload: id }),
        handleCancelZipping: () => {
            isCancellingZippingLocalRef.current = true;
            if (zippingAbortControllerRef.current) {
                zippingAbortControllerRef.current.abort();
            }
            dispatch({ type: 'SET_ZIPPING_PROGRESS', payload: { ...stateRef.current.zippingProgress, isCancelling: true } as any });
        },
        handleDownloadAllImagesZip: async () => {
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
                        const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current.signal });
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
        },
        handleDownloadSRT: async () => {
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
        },
        handleCancelSRTGeneration: () => {
            isGeneratingSRTLocalRef.current = false;
        },
        handleDownloadSelectedImagesZip: async () => {
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
                (generatedContent.scenes || []).forEach(scene => {
                    (scene.cuts || []).forEach(cut => {
                        if (cut.selectedImageId) {
                            selectedImageIds.add(cut.selectedImageId);
                        }
                    });
                });

                if (selectedImageIds.size === 0) {
                    addNotification('선택된 대표 이미지가 없습니다.', 'info');
                    return;
                }

                const imagesToDownload = generatedImageHistory.filter(img => selectedImageIds.has(img.id));
                const total = imagesToDownload.length;
                let current = 0;

                for (const img of imagesToDownload) {
                    if (isCancellingZippingLocalRef.current) {
                        addNotification('다운로드가 취소되었습니다.', 'info');
                        return;
                    }
                    try {
                        const res = await fetch(img.imageUrl, { signal: zippingAbortControllerRef.current.signal });
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
        },
        handleOpenEditor: (info: any) => updateUIState({ isEditorOpen: true, editingImageInfo: info }),
        handleOpenImageViewer: (url: string, alt: string, prompt?: string) => updateUIState({ isImageViewerOpen: true, viewerImage: { url, alt, prompt } }),
        handleOpenTextEditor: (cutNumber: string, url: string, chars: string[]) => updateUIState({ isTextEditorOpen: true, textEditingTarget: { cutNumber, imageUrl: url, characters: chars } }),
        handleTextRender: miscActions.handleTextRender,
        handleAutoGenerateImageForCut: generationActions.handleAutoGenerateImageForCut,
        handleApplyAndRunPrompt: generationActions.handleApplyAndRunPrompt,
        handleOriginalPromptToActiveStudio: (p: string) => handleCreateInStudio(stateRef.current.activeStudioTarget, stateRef.current.studioSessions[stateRef.current.activeStudioTarget].originalImage!, p),
        handlePrepareStudioForCut: (cutNumber: string, p: string) => dispatch({ type: 'PREPARE_STUDIO_FOR_CUT', payload: { studioId: stateRef.current.activeStudioTarget, cutNumber, prompt: p } }),
        handleUserImageUpload: (sId: 'a' | 'b', url: string) => dispatch({ type: 'LOAD_USER_IMAGE_INTO_STUDIO', payload: { studioId: sId, imageDataUrl: url } }),
        handleUpdateStudioImageFromUpload: (sId: 'a' | 'b', url: string) => dispatch({ type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: sId, imageDataUrl: url } }),
        handleUserImageUploadForStudio: (sId: 'a' | 'b', url: string) => dispatch({ type: 'UPDATE_CURRENT_STUDIO_IMAGE_FROM_UPLOAD', payload: { studioId: sId, imageDataUrl: url } }),
        handleLoadImageIntoStudio: (sId: 'a' | 'b', img: GeneratedImage) => dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: sId, image: img } }),
        handleSetOriginalImage: (sId: 'a' | 'b', image: GeneratedImage) => dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: sId, image: image } }),
        handleSetActiveStudioTarget: (sId: 'a' | 'b') => dispatch({ type: 'SET_ACTIVE_STUDIO_TARGET', payload: sId }),
        handleToggleAutoGeneration: generationActions.handleToggleAutoGeneration,
        handleRunSelectiveGeneration: generationActions.handleRunSelectiveGeneration,
        handleRetryFailedCuts: generationActions.handleRetryFailedCuts,
        handleRunNormalization: normalizationActions.handleRunNormalization,
        handleAttachAudioToCut: (cutNumber: string, file: File) => { const reader = new FileReader(); reader.onload = (e) => dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: { audioDataUrls: [...(stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.audioDataUrls || []), e.target?.result as string] } } }); reader.readAsDataURL(file); },
        handleRemoveAudioFromCut: (cutNumber: string, idx: number) => { const current = stateRef.current.generatedContent?.scenes.flatMap(s=>s.cuts).find(c=>c.cutNumber===cutNumber)?.audioDataUrls || []; dispatch({ type: 'UPDATE_CUT', payload: { cutNumber: cutNumber, data: { audioDataUrls: current.filter((_, i) => i !== idx) } } }); },
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
        handleGenerateMask: miscActions.handleGenerateMask,
        handleScrollToCut: (cutNumber: string) => { const el = document.getElementById(`cut-${cutNumber}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
        handleOpenReviewModalForEdit: pipelineActions.handleOpenReviewModalForEdit,
        handleRegenerateStoryboardDraft: pipelineActions.handleRegenerateStoryboardDraft,
        handleRegenerateSingleCut: pipelineActions.handleRegenerateSingleCut,
        handleUpdateAndFormatNarration: cutEditActions.handleUpdateAndFormatNarration,
        handleOpenReviewModal: pipelineActions.handleOpenReviewModal,
        handleOpenReviewModalForDirectEntry: pipelineActions.handleOpenReviewModalForDirectEntry,
        handleOpenCutSplitter: (cut: Cut) => dispatch({ type: 'OPEN_CUT_SPLITTER', payload: cut }),
        handleConfirmCutSplit: pipelineActions.handleConfirmCutSplit,
        handleConfirmDraftReview: async (updatedScenes: EditableScene[], modifiedCutIds: Set<string>) => {
            await normalizationActions.handleRunNormalization(updatedScenes, modifiedCutIds);
        },
        handleOpenGuestSelection: (cutNumber: string) => dispatch({ type: 'START_GUEST_SELECTION', payload: cutNumber }),
        handleOpenAudioSplitter: () => updateUIState({ isAudioSplitterOpen: true }),
        handleConfirmAudioSplit,
        handleUploadProjectFile: projectActions.handleUploadProjectFile,
        handleThirdCharacterEdit: miscActions.handleThirdCharacterEdit,
        triggerConfetti,
        handleEditImageWithNanoWithRetry,
        handleOutpaintImageWithNanoWithRetry: miscActions.handleOutpaintImageWithNanoWithRetry,
        handleFillImageWithNanoWithRetry: miscActions.handleFillImageWithNanoWithRetry,
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
