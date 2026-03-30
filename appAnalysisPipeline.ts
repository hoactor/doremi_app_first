
import {
    enrichScriptWithDirections, analyzeCharacters, generateEditableStoryboard,
    generateTitleSuggestions, regenerateSingleCutDraft,
    generateCinematicBlueprint, normalizeScriptCuts
} from './services/geminiService';
import {
    AppAction, Cut, EditableScene, EditableCut, ArtStyle, GeneratedImage, GeneratedScript, Scene,
} from './types';
import { UIState } from './appTypes';
import { getEngineFromModel } from './appUtils';

// --- Helper types ---

export interface AnalysisPipelineHelpers {
    dispatch: React.Dispatch<AppAction>;
    stateRef: { current: any };
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
    handleAddUsage: (geminiTokens: number, dalleImages: number) => void;
    updateUIState: (update: Partial<UIState>) => void;
    triggerConfetti: (targetId?: string) => void;
    getArtStylePrompt: (overrideStyle?: ArtStyle, overrideCustomText?: string) => string;
    calculateFinalPrompt: (cut: Cut | EditableCut) => string;
}

// --- Factory ---

export function createAnalysisPipelineActions(h: AnalysisPipelineHelpers) {
    const {
        dispatch,
        stateRef,
        addNotification,
        handleAddUsage,
        updateUIState,
        getArtStylePrompt,
        calculateFinalPrompt,
    } = h;

    // ---- handleStartStudio ----
    const handleStartStudio = async (overrides?: { artStyle?: ArtStyle, customArtStyle?: string }) => {
        const { userInputScript, speakerGender, artStyle, customArtStyle } = stateRef.current;
        const selectedArtStyle = overrides?.artStyle || artStyle;
        const selectedCustomArtStyle = overrides?.customArtStyle || customArtStyle;

        if (!userInputScript.trim()) {
            addNotification('대본을 입력해주세요.', 'error');
            return;
        }

        dispatch({ type: 'START_LOADING', payload: '스튜디오 시작 중...' });
        updateUIState({ analysisStage: 'character', analysisProgress: 0 });

        try {
            // Normalize the script so that each logical cut is exactly one line
            const normalizedScript = normalizeScriptCuts(userInputScript);

            // Update the state with the normalized script so the user sees the clean version
            dispatch({ type: 'SET_USER_INPUT_SCRIPT', payload: normalizedScript });

            // Check if the script is already a "detailed script"
            // A detailed script contains explicit instructions like (등장인물: ..., 연출의도: ..., 이미지프롬프트: ...)
            const hasCharacterTag = /(등장인물|인물|캐릭터|Character)\s*[:：]/i.test(normalizedScript);
            const hasImageTag = /(이미지프롬프트|이미지|그림|프롬프트|Image)\s*[:：]/i.test(normalizedScript);
            const isDetailedScript = hasCharacterTag && hasImageTag;

            // 1. Character Analysis
            dispatch({ type: 'SET_LOADING_DETAIL', payload: '대본에서 등장인물을 분석하고 프로필을 생성하고 있습니다...' });
            const stylePrompt = getArtStylePrompt(selectedArtStyle, selectedCustomArtStyle);
            const { characters, firstScenePrompt, title, tokenCount: charToken } = await analyzeCharacters(
                normalizedScript,
                speakerGender,
                stylePrompt,
                selectedArtStyle,
                isDetailedScript,
                undefined,
                (textLength) => {
                    dispatch({ type: 'SET_LOADING_DETAIL', payload: `대본에서 등장인물을 분석하고 프로필을 생성하고 있습니다... (${textLength}자 생성됨)` });
                }
            );
            handleAddUsage(charToken, 0);

            // Dispatch immediately to update state, but use local variable for next steps
            dispatch({ type: 'SET_CHARACTER_DESCRIPTIONS', payload: characters });
            if (title) dispatch({ type: 'SET_STORY_TITLE', payload: title });

            updateUIState({ analysisProgress: 25 });

            let enrichedScript = normalizedScript;
            let blueprint: any = {};

            if (isDetailedScript) {
                console.log("Detailed script detected. Skipping enrichment and blueprint generation.");
                updateUIState({ analysisStage: 'enrichment' });
                dispatch({ type: 'SET_LOADING_DETAIL', payload: '상세 대본이 감지되어 연출 지시문 추가를 건너뜁니다...' });
                updateUIState({ analysisProgress: 50 });

                updateUIState({ analysisStage: 'blueprint' });
                dispatch({ type: 'SET_LOADING_DETAIL', payload: '상세 대본이 감지되어 샷 구성 설계를 건너뜁니다...' });
                const seed = Math.floor(Math.random() * 100000);
                dispatch({ type: 'SET_STORYBOARD_SEED', payload: seed });
                updateUIState({ analysisProgress: 75 });
            } else {
                // 2. Script Enrichment
                updateUIState({ analysisStage: 'enrichment' });
                dispatch({ type: 'SET_LOADING_DETAIL', payload: '스토리의 전체 맥락을 파악하고 연출 지시문을 추가하고 있습니다...' });
                const enrichResult = await enrichScriptWithDirections(
                    normalizedScript,
                    undefined,
                    selectedArtStyle,
                    (textLength) => {
                        dispatch({ type: 'SET_LOADING_DETAIL', payload: `스토리의 전체 맥락을 파악하고 연출 지시문을 추가하고 있습니다... (${textLength}자 생성됨)` });
                    }
                );
                enrichedScript = enrichResult.enrichedScript;
                handleAddUsage(enrichResult.tokenCount, 0);
                dispatch({ type: 'SET_ENRICHED_SCRIPT', payload: enrichedScript });

                updateUIState({ analysisProgress: 50 });

                // 3. Cinematic Blueprint
                updateUIState({ analysisStage: 'blueprint' });
                dispatch({ type: 'SET_LOADING_DETAIL', payload: '최적의 카메라 앵글과 샷 구성을 설계하고 있습니다...' });
                const seed = Math.floor(Math.random() * 100000);
                dispatch({ type: 'SET_STORYBOARD_SEED', payload: seed });
                const blueprintResult = await generateCinematicBlueprint(
                    enrichedScript,
                    seed,
                    (textLength) => {
                        dispatch({ type: 'SET_LOADING_DETAIL', payload: `최적의 카메라 앵글과 샷 구성을 설계하고 있습니다... (${textLength}자 생성됨)` });
                    }
                );
                blueprint = blueprintResult.blueprint;
                handleAddUsage(blueprintResult.tokenCount, 0);

                updateUIState({ analysisProgress: 75 });
            }

            // 4. Spatial DNA & Storyboard Generation
            updateUIState({ analysisStage: 'spatial' });
            dispatch({ type: 'SET_LOADING_DETAIL', payload: '장소별 공간 데이터를 생성하고 상세 스토리보드를 구성 중입니다...' });

            const { storyboard, locationDNAMap, tokenCount: sToken } = await generateEditableStoryboard(
                normalizedScript,
                enrichedScript,
                blueprint,
                speakerGender,
                characters, // Use the characters we just analyzed
                stateRef.current.storyboardSeed, // Use the seed we just generated or existing one
                selectedArtStyle,
                (part, total) => {
                    // Map remaining progress (75-95%)
                    const p = 75 + Math.floor((part / total) * 20);
                    updateUIState({ analysisProgress: p });
                    dispatch({ type: 'SET_LOADING_DETAIL', payload: `스토리보드 생성 중... (Part ${part}/${total})` });
                }
            );
            handleAddUsage(sToken, 0);

            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: storyboard });
            dispatch({ type: 'SET_LOCATION_VISUAL_DNA', payload: locationDNAMap });

            updateUIState({ analysisStage: 'storyboard', analysisProgress: 100 });

            // Open the Scene Analysis Review Modal instead of going straight to storyboard
            updateUIState({ isSceneAnalysisReviewModalOpen: true });

        } catch (error) {
            console.error(error);
            addNotification(`분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, 'error');
            updateUIState({ analysisStage: 'idle', analysisProgress: 0 });
        } finally {
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    // ---- handleConfirmSceneAnalysis ----
    const handleConfirmSceneAnalysis = () => {
        updateUIState({ isSceneAnalysisReviewModalOpen: false, isCostumeModalOpen: true });
    };

    // ---- handleRegenerateSceneAnalysis ----
    const handleRegenerateSceneAnalysis = async () => handleStartStudio();

    // ---- handleGenerateStoryboardWithCustomCostumes ----
    const handleGenerateStoryboardWithCustomCostumes = async () => {
        const { editableStoryboard, characterDescriptions } = stateRef.current;

        // --- [1단계: 캐릭터 시트 결과물을 이미지 스튜디오로 연동] ---
        const getFinalImg = (key: string) => {
            const char = characterDescriptions[key];
            if (!char) return null;
            const url = char.mannequinImageUrl || char.upscaledImageUrl || (char.characterSheetHistory?.[char.characterSheetHistory.length - 1]);
            if (!url) return null;
            return {
                id: `char-sheet-${key}-${Date.now()}`,
                imageUrl: url,
                sourceCutNumber: 'character-sheet',
                prompt: char.baseAppearance || 'Character Sheet Base',
                engine: getEngineFromModel(stateRef.current.selectedNanoModel),
                createdAt: new Date().toISOString()
            };
        };

        const charKeys = Object.keys(characterDescriptions);

        if (charKeys.length > 0) {
            const imgA = getFinalImg(charKeys[0]);
            if (imgA) {
                dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: 'a', image: imgA } });
                dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: 'a', image: imgA } });
            }
        }

        if (charKeys.length > 1) {
            const imgB = getFinalImg(charKeys[1]);
            if (imgB) {
                dispatch({ type: 'SET_ORIGINAL_IMAGE', payload: { studioId: 'b', image: imgB } });
                dispatch({ type: 'LOAD_IMAGE_INTO_STUDIO', payload: { studioId: 'b', image: imgB } });
            }
        }

        if (editableStoryboard) {
            const syncedDraft = editableStoryboard.map((scene: EditableScene) => ({
                ...scene,
                cuts: scene.cuts.map((cut: EditableCut) => {
                    const profileOutfitParts: string[] = [];
                    (cut.character || []).forEach((name: string) => {
                        const key = Object.keys(characterDescriptions).find((k: string) => characterDescriptions[k].koreanName === name);
                        if (key && characterDescriptions[key]) {
                            // [이름: (헤어) 의상] 형식으로 리터럴 복사 및 DNA 주입
                            const hair = characterDescriptions[key].hairStyleDescription || 'Standard';
                            // Use English locations map as source
                            const outfitText = characterDescriptions[key].locations?.[cut.location] || characterDescriptions[key].locations?.['기본 의상'] || characterDescriptions[key].baseAppearance || 'standard outfit';
                            profileOutfitParts.push(`[${name}: (${hair}) ${outfitText}]`);
                        }
                    });
                    return { ...cut, characterOutfit: profileOutfitParts.join(' ') };
                })
            }));
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: syncedDraft });
        }
        updateUIState({ isCostumeModalOpen: false });
        handleOpenReviewModalForEdit();
    };

    // ---- handleOpenReviewModalForEdit ----
    const handleOpenReviewModalForEdit = () => {
        const { editableStoryboard, generatedContent } = stateRef.current;
        if (!editableStoryboard && generatedContent) {
            // Reconstruct editable draft from final storyboard data for re-review
            const reconstructed: EditableScene[] = generatedContent.scenes.map((s: Scene) => ({
                sceneNumber: s.sceneNumber,
                title: s.title,
                cuts: s.cuts.map((c: Cut) => ({
                    id: c.cutNumber,
                    narrationText: c.narration,
                    character: c.characters,
                    location: c.location,
                    sceneDescription: c.sceneDescription,
                    characterEmotionAndExpression: c.characterEmotionAndExpression,
                    characterPose: c.characterPose,
                    characterOutfit: c.characterOutfit,
                    locationDescription: c.locationDescription,
                    otherNotes: c.otherNotes,
                    directorialIntent: c.directorialIntent
                }))
            }));
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: reconstructed });
        }
        updateUIState({ isStoryboardReviewModalOpen: true });
    };

    // ---- handleOpenReviewModalForDirectEntry ----
    const handleOpenReviewModalForDirectEntry = () => updateUIState({ isStoryboardReviewModalOpen: true });

    // ---- handleOpenReviewModal ----
    const handleOpenReviewModal = (cutNumber: string) => {};

    // ---- handleGenerateTitles ----
    const handleGenerateTitles = async () => {
        updateUIState({ isGeneratingTitles: true });
        try {
            const { titles, tokenCount } = await generateTitleSuggestions(stateRef.current.userInputScript);
            handleAddUsage(tokenCount, 0);
            updateUIState({ titleSuggestions: titles, isGeneratingTitles: false });
        } catch (e) { updateUIState({ isGeneratingTitles: false }); }
    };

    // ---- handleRegenerateStoryboardDraft ----
    const handleRegenerateStoryboardDraft = async () => {
        const { userInputScript, enrichedScript, speakerGender, characterDescriptions } = stateRef.current;
        dispatch({ type: 'START_LOADING', payload: '재생성 중...' });
        try {
            const normalizedScript = normalizeScriptCuts(userInputScript);
            const seed = Math.floor(Math.random() * 100000);
            const { blueprint, tokenCount: bToken } = await generateCinematicBlueprint(enrichedScript!, seed);
            handleAddUsage(bToken, 0);
            const { storyboard, locationDNAMap, tokenCount: sToken } = await generateEditableStoryboard(normalizedScript, enrichedScript!, blueprint, speakerGender, characterDescriptions, seed, stateRef.current.artStyle);
            handleAddUsage(sToken, 0);
            dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: storyboard });
            dispatch({ type: 'SET_LOCATION_VISUAL_DNA', payload: locationDNAMap });
        } catch (error) {
            console.error("Failed to regenerate storyboard:", error);
            addNotification('스토리보드 재생성 중 오류가 발생했습니다.', 'error');
        } finally {
            dispatch({ type: 'STOP_LOADING' });
        }
    };

    // ---- handleRegenerateSingleCut ----
    const handleRegenerateSingleCut = async (cut: EditableCut): Promise<Partial<EditableCut> | null> => {
        try {
            const seed = Math.floor(Math.random() * 100000);
            const res = await regenerateSingleCutDraft(cut, stateRef.current.speakerGender, seed);
            handleAddUsage(res.tokenCount, 0);
            return res;
        } catch (error) {
            console.error("Failed to regenerate single cut:", error);
            addNotification('단일 컷 재생성 중 오류가 발생했습니다.', 'error');
            return null;
        }
    };

    // ---- handleConfirmDraftReview ----
    // Note: This delegates to handleRunNormalization which is in appNormalizationActions.
    // The actual wiring is done in AppContext.tsx where both factories are available.

    // ---- handleConfirmCutSplit ----
    const handleConfirmCutSplit = async (orig: Cut, points: { time: number; textIndex: number }[]) => {
        dispatch({ type: 'CLOSE_CUT_SPLITTER' });
        let lastIdx = 0;
        const newCuts = points.map((p, i) => {
            const text = orig.narration.substring(lastIdx, p.textIndex);
            lastIdx = p.textIndex;
            return { ...orig, id: window.crypto.randomUUID(), cutNumber: `${orig.cutNumber}-${i+1}`, narration: text.trim(), selectedImageId: i === 0 ? orig.selectedImageId : null };
        });
        newCuts.push({ ...orig, id: window.crypto.randomUUID(), cutNumber: `${orig.cutNumber}-${points.length+1}`, narration: orig.narration.substring(lastIdx).trim(), selectedImageId: null });
        dispatch({ type: 'REPLACE_CUT', payload: { originalCutNumber: orig.cutNumber, newCuts: newCuts as Cut[] } });
    };

    // ---- handleAnalyzeYoutubeUrl ----
    const handleAnalyzeYoutubeUrl = async () => {};

    return {
        handleStartStudio,
        handleConfirmSceneAnalysis,
        handleRegenerateSceneAnalysis,
        handleGenerateStoryboardWithCustomCostumes,
        handleOpenReviewModalForEdit,
        handleOpenReviewModalForDirectEntry,
        handleOpenReviewModal,
        handleGenerateTitles,
        handleRegenerateStoryboardDraft,
        handleRegenerateSingleCut,
        handleConfirmCutSplit,
        handleAnalyzeYoutubeUrl,
    };
}
