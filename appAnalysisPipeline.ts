// appAnalysisPipeline.ts — React 의존 제로
// 대본 분석 파이프라인 (handleStartStudio + handleResumeFromEnrichedPause)
// Phase 9: enrichScript 재설계 + 파이프라인 통합 (레거시 경로 제거)
// ★ Phase 12: enriched_pause — Step 3 후 일시정지, 사용자 편집 후 Step 4~6 재개

import type { AppAction, ArtStyle, CharacterDescription, EnrichedBeat } from './types';
import type { UIState } from './appTypes';
import type { CharacterBible } from './types';
import {
    normalizeScriptCuts,
    generateTitleSuggestions, analyzeScenario, analyzeCharacterBible,
    enrichScriptWithDirections,
    generateConti, designCinematography, convertContiToEditableStoryboard,
    parseMSFScript, generateTitleAndSetup, enrichContiCutsBatch,
    analyzeUSSStructure, convertAllNarrationToCuts, ussToAppData,
    regenerateForNewLocations,
} from './services/geminiService';
import { IS_TAURI, createProject as createProjectLocal } from './services/tauriAdapter';
import { setClaudeModel } from './services/claudeService';

export interface PipelineHelpers {
    dispatch: (action: AppAction) => void;
    stateRef: { current: any };
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    handleAddUsage: (tokens: number, source: 'claude' | 'gemini') => void;
    updateUIState: (update: Partial<UIState>) => void;
}

// ─── 파이프라인 취소 토큰 ──────────────────────────────────────────
let activePipelineId = 0;

/** 새 파이프라인 시작 시 호출 — 이전 파이프라인을 무효화 */
function startNewPipeline(): number {
    activePipelineId += 1;
    console.log(`[Pipeline] 새 파이프라인 시작: #${activePipelineId}`);
    return activePipelineId;
}

/** 현재 파이프라인이 아직 유효한지 확인 — 무효하면 throw */
function checkPipelineAlive(pipelineId: number, stepName: string): void {
    if (pipelineId !== activePipelineId) {
        throw new PipelineCancelledError(`파이프라인 #${pipelineId} 취소됨 (현재: #${activePipelineId}, step: ${stepName})`);
    }
}

/** 외부에서 호출: 진행 중인 파이프라인 강제 취소 */
export function cancelActivePipeline(): void {
    console.log(`[Pipeline] 파이프라인 #${activePipelineId} 취소 요청`);
    activePipelineId += 1;
}

/** PipelineHelpers를 감싸서 취소된 파이프라인의 dispatch/notification을 자동 무시 */
function createSafeHelpers(h: PipelineHelpers, pid: number): PipelineHelpers {
    return {
        ...h,
        dispatch: (action) => {
            if (pid !== activePipelineId) { console.log(`[Pipeline] #${pid} dispatch 무시 (현재: #${activePipelineId}): ${action.type}`); return; }
            h.dispatch(action);
        },
        addNotification: (msg, type) => {
            if (pid !== activePipelineId) return;
            h.addNotification(msg, type);
        },
        updateUIState: (update) => {
            if (pid !== activePipelineId) return;
            h.updateUIState(update);
        },
    };
}

class PipelineCancelledError extends Error {
    constructor(msg: string) { super(msg); this.name = 'PipelineCancelledError'; }
}

// ─── 상세 대본 전처리 ──────────────────────────────────────────────

export interface ScriptMetadata {
    cutNumber?: number;
    characters?: string[];
    direction?: string;
    imagePrompt?: string;
}

/**
 * 상세 대본에서 괄호 메타데이터를 추출하고 순수 나레이션을 반환
 * "컷 13 그렇게 사귀고... (등장인물: 여주 남주, 연출의도: ...)"
 * → narration: "그렇게 사귀고..."  + metadata: { characters: ['여주','남주'], ... }
 */
export function preprocessDetailedScript(rawScript: string): {
    cleanScript: string;
    metadataByLine: Map<number, ScriptMetadata>;
    isDetailed: boolean;
} {
    const lines = rawScript.split('\n').filter(l => l.trim());
    const metadataByLine = new Map<number, ScriptMetadata>();
    const cleanLines: string[] = [];
    let isDetailed = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        const meta: ScriptMetadata = {};

        // 컷 번호 감지: "컷 13", "컷13", "CUT 13"
        // ★ normalizeScriptCuts가 [장소:...] 를 컷 앞에 붙일 수 있으므로 ^가 아닌 위치 매칭
        const cutMatch = line.match(/(?:^|\]\s*)(?:컷|CUT)\s*(\d+)\s*/i);
        if (cutMatch) {
            meta.cutNumber = parseInt(cutMatch[1]);
            // [장소:...] 부분을 포함한 매칭이면 컷 번호 이후부터만 사용
            const cutStartIdx = line.indexOf(cutMatch[0]) + cutMatch[0].length;
            line = line.slice(cutStartIdx);
            isDetailed = true;
        }

        // 괄호 메타데이터 추출: (등장인물: ..., 연출의도: ..., 이미지프롬프트: ...)
        // ★ 키워드가 포함된 괄호만 매칭 (일반 괄호 느낌표(!) 등과 구분)
        // ★ `)` 뒤에 대사 텍스트가 올 수 있으므로 $ 대신 허용
        const metaParenMatch = line.match(/\(\s*(등장인물|연출의도|이미지프롬프트)\s*[:：](.+)\)/);
        if (metaParenMatch) {
            // 전체 매칭에서 괄호 안 내용 추출
            const fullMatch = metaParenMatch[0];
            const parenContent = fullMatch.slice(1, fullMatch.lastIndexOf(')')).trim(); // 바깥 괄호 제거

            // 등장인물
            const charMatch = parenContent.match(/등장인물\s*[:：]\s*([^,，]*?)(?=\s*(?:,\s*연출의도|,\s*이미지프롬프트|$))/);
            if (charMatch) {
                meta.characters = charMatch[1].trim().split(/\s+/).filter(Boolean);
            }
            // 연출의도
            const dirMatch = parenContent.match(/연출의도\s*[:：]\s*([^,，]*?)(?=\s*(?:,\s*이미지프롬프트|$))/);
            if (dirMatch) {
                meta.direction = dirMatch[1].trim();
            }
            // 이미지프롬프트
            const promptMatch = parenContent.match(/이미지프롬프트\s*[:：]\s*(.*)/);
            if (promptMatch) {
                meta.imagePrompt = promptMatch[1].trim().replace(/\)\s*$/, '');
            }

            // 메타 괄호 제거: 괄호 앞 텍스트 + 괄호 뒤 텍스트(대사) 결합
            const matchIdx = line.indexOf(fullMatch);
            const before = line.slice(0, matchIdx).trim();
            const after = line.slice(matchIdx + fullMatch.length).trim();
            line = [before, after].filter(Boolean).join(' ');
            isDetailed = true;
        }

        // [장소: ...] 태그는 그대로 유지 (Step 1에서 활용)
        // ★ cutNumber만 있어도 메타데이터로 저장 (컷 단위 추적)
        if (Object.keys(meta).length > 0) {
            metadataByLine.set(i, meta);
        }
        cleanLines.push(line);
    }

    return {
        cleanScript: cleanLines.join('\n'),
        metadataByLine,
        isDetailed,
    };
}

/**
 * Phase 1: Step 1~3 (시나리오 분석 → 캐릭터 바이블 → enrichScript)
 * enrichScript 완료 후 enriched_pause 상태로 정지 → 사용자가 편집 가능
 */
export async function runAnalysisPipeline(
    h: PipelineHelpers,
    overrides?: { artStyle?: ArtStyle; customArtStyle?: string }
): Promise<void> {
    const pid = startNewPipeline();
    const { dispatch, stateRef, addNotification, handleAddUsage, updateUIState } = createSafeHelpers(h, pid);
    const { userInputScript, speakerGender, logline } = stateRef.current;

    if (!userInputScript.trim()) {
        addNotification('대본을 입력해주세요.', 'error');
        return;
    }

    // ★ AI 모델 티어 설정
    setClaudeModel(stateRef.current.aiModelTier || 'opus');

    dispatch({ type: 'START_LOADING', payload: '스튜디오 시작 중...' });
    updateUIState({ analysisStage: 'character', analysisProgress: 0 });

    // 프로젝트 자동 생성
    if (IS_TAURI && !stateRef.current.currentProjectId) {
        try {
            const projectId = await createProjectLocal(stateRef.current.storyTitle || '새 프로젝트');
            dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
        } catch (err) { console.warn('프로젝트 자동 생성 실패:', err); }
    }

    try {
        const normalizedScript = normalizeScriptCuts(userInputScript);

        // ★ 상세 대본 전처리: 괄호 메타데이터 추출 + 순수 나레이션 분리
        const { cleanScript, metadataByLine, isDetailed } = preprocessDetailedScript(normalizedScript);

        // ★ 이미지대본 탭: 상세대본 포맷 권장 — 감지 실패 시 일반 파이프라인으로 폴백
        const inputMode = stateRef.current.scriptInputMode || 'narration';
        if (inputMode === 'narration' && !isDetailed) {
            addNotification(
                '이미지대본 형식이 감지되지 않아 일반 분석 모드로 진행합니다.',
                'info'
            );
        }

        const scriptForAnalysis = isDetailed ? cleanScript : normalizedScript;
        if (isDetailed) {
            const totalLines = normalizedScript.split('\n').filter(l => l.trim()).length;
            addNotification(`상세 대본 감지: ${totalLines}줄 중 ${metadataByLine.size}개 컷 메타데이터 추출됨`, 'info');
            dispatch({ type: 'SET_SCRIPT_METADATA', payload: { metadataByLine: Object.fromEntries(metadataByLine), isDetailed } });
        }
        dispatch({ type: 'SET_USER_INPUT_SCRIPT', payload: scriptForAnalysis });

        // Step 1: 시나리오 분석
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📖 시나리오 구조 분석 중... (플롯, 감정 아크, 전환점)' });
        const { analysis: scenario, tokenCount: scenarioToken } = await analyzeScenario(scriptForAnalysis, undefined, logline || undefined);
        checkPipelineAlive(pid, 'Step1-scenario');
        handleAddUsage(scenarioToken, 'claude');
        dispatch({ type: 'SET_SCENARIO_ANALYSIS', payload: scenario });
        const locationRegistry = scenario.locations || [];
        dispatch({ type: 'SET_LOCATION_REGISTRY', payload: locationRegistry });
        updateUIState({ analysisProgress: 10 });

        // Step 2: 캐릭터 바이블
        updateUIState({ analysisStage: 'character' });
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '🎭 캐릭터 바이블 생성 중... (성격, 행동패턴, 관계, 의상)' });
        const { bibles, tokenCount: bibleToken } = await analyzeCharacterBible(normalizedScript, scenario, undefined, speakerGender);
        checkPipelineAlive(pid, 'Step2-bible');
        handleAddUsage(bibleToken, 'claude');
        dispatch({ type: 'SET_CHARACTER_BIBLES', payload: bibles });

        // 기존 characterDescriptions 호환
        const legacyCharacters: { [key: string]: CharacterDescription } = {};
        for (const bible of bibles) {
            const key = bible.koreanName.replace(/\s/g, '_');
            const allLocations = Object.keys(bible.outfitRecommendations || {});
            const locations: { [loc: string]: string } = {};
            const koreanLocations: { [loc: string]: string } = {};
        for (const loc of allLocations) {
            let outfitDesc = bible.outfitRecommendations[loc]?.description || '';
            outfitDesc = outfitDesc.replace(/^\s*\([^)]*hair[^)]*\)\s*/i, '').trim();
            locations[loc] = outfitDesc;
            koreanLocations[loc] = outfitDesc;
        }

            legacyCharacters[key] = {
                koreanName: bible.koreanName,
                canonicalName: bible.canonicalName || bible.koreanName,
                aliases: bible.aliases || [bible.koreanName],
                koreanBaseAppearance: bible.baseAppearance,
                baseAppearance: bible.baseAppearance,
                gender: bible.gender,
                personality: bible.personalityProfile.core,
                locations,
                koreanLocations,
            };
        }
        dispatch({ type: 'SET_CHARACTER_DESCRIPTIONS', payload: legacyCharacters });

        // 제목 추출
        const titleResult = await generateTitleSuggestions(normalizedScript);
        handleAddUsage(titleResult.tokenCount, 'claude');
        if (titleResult.titles.length > 0) {
            dispatch({ type: 'SET_STORY_TITLE', payload: titleResult.titles[0] });
        }
        updateUIState({ analysisProgress: 25 });

        // Step 3: enrichScript (썰쇼츠 연출 감독) — ★ Phase 12: JSON 구조화 출력
        updateUIState({ analysisStage: 'enrichment' });
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '🎬 연출 감독이 대본을 분석 중... (Hook, 감정 롤러코스터, Punch Out)' });

        const characterProfilesString = JSON.stringify(Object.values(legacyCharacters || {}).map(char => ({
            koreanName: char.koreanName,
            gender: char.gender,
            personality: char.personality,
            outfitsByLocation: char.locations,
        })), null, 2);

        const { enrichedScript, enrichedBeats, tokenCount: enrichToken } = await enrichScriptWithDirections(
            normalizedScript, characterProfilesString, locationRegistry, logline || undefined,
            stateRef.current.contentFormat,
            undefined,
            (textLength) => { dispatch({ type: 'SET_LOADING_DETAIL', payload: `🎬 연출 감독이 대본 작성 중... (${textLength}자)` }); }
        );
        checkPipelineAlive(pid, 'Step3-enrich');
        handleAddUsage(enrichToken, 'claude');
        dispatch({ type: 'SET_ENRICHED_SCRIPT', payload: enrichedScript });
        dispatch({ type: 'SET_ENRICHED_BEATS', payload: enrichedBeats });
        updateUIState({ analysisProgress: 45 });

        // ★ 상세 대본: enriched_pause 건너뛰고 바로 Step 4~5 → conti_pause
        if (isDetailed) {
            addNotification('상세 대본 — 연출 편집 생략, 콘티 분할로 진행합니다.', 'info');
            dispatch({ type: 'STOP_LOADING' });
            await resumeFromEnrichedPause(h, enrichedBeats);
            return;
        }

        // 기본 대본: enriched_pause — Step 3 완료 후 정지, 사용자 편집 대기
        dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'enriched_pause' });
        addNotification('연출 대본이 생성되었습니다. 편집 후 [Continue] 버튼을 눌러 진행하세요.', 'info');

    } catch (error) {
        if (error instanceof PipelineCancelledError) {
            console.log(`[Pipeline] 나레이션 파이프라인 취소됨: ${error.message}`);
            return;
        }
        console.error(error);
        addNotification(`분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, 'error');
        updateUIState({ analysisStage: 'idle', analysisProgress: 0 });
    } finally {
        dispatch({ type: 'STOP_LOADING' });
    }
}

/**
 * Phase 2: Step 4~6 (콘티 → 촬영설계 → 스토리보드 변환)
 * enriched_pause 상태에서 사용자가 편집 완료 후 호출
 * @param editedBeats 사용자가 편집(또는 그대로 유지)한 EnrichedBeat[]
 */
export async function resumeFromEnrichedPause(
    h: PipelineHelpers,
    editedBeats: EnrichedBeat[]
): Promise<void> {
    const pid = startNewPipeline();
    const { dispatch, stateRef, addNotification, handleAddUsage, updateUIState } = createSafeHelpers(h, pid);
    const { userInputScript, scenarioAnalysis, characterBibles, logline } = stateRef.current;

    if (!scenarioAnalysis || !characterBibles) {
        addNotification('시나리오 분석 데이터가 없습니다. 처음부터 다시 시작하세요.', 'error');
        return;
    }

    // ★ AI 모델 티어 설정 (resume 시에도)
    setClaudeModel(stateRef.current.aiModelTier || 'opus');

    dispatch({ type: 'START_LOADING', payload: '콘티 분할 시작 중...' });
    updateUIState({ analysisStage: 'blueprint', analysisProgress: 45 });

    try {
        // 편집된 beats 저장
        dispatch({ type: 'SET_ENRICHED_BEATS', payload: editedBeats });
        // 레거시 enrichedScript도 동기화
        const enrichedScript = editedBeats.map(b => {
            const prefix = b.type === 'insert' ? `[인서트: ${b.text}]` : b.type === 'reaction' ? `[리액션: ${b.text}]` : `[${b.beat}] ${b.text}`;
            return `${prefix} [${b.emotion}]${b.direction ? ` [연출: ${b.direction}]` : ''}`;
        }).join('\n');
        dispatch({ type: 'SET_ENRICHED_SCRIPT', payload: enrichedScript });

        // Step 4: 콘티 (★ Phase 12: EnrichedBeat[] 기반)
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '✂️ 콘티 분할 중... (컷 분할, 인서트컷, 리액션컷)' });

        // ★ 상세 대본 메타데이터가 있으면 컨텍스트로 첨부
        const scriptMeta = stateRef.current.scriptMetadata;
        let scriptWithHints = userInputScript;
        if (scriptMeta?.isDetailed && scriptMeta.metadataByLine) {
            const hints = Object.entries(scriptMeta.metadataByLine).map(([lineIdx, meta]: [string, any]) => {
                const parts: string[] = [];
                if (meta.cutNumber) parts.push(`컷${meta.cutNumber}`);
                if (meta.characters?.length) parts.push(`등장: ${meta.characters.join(', ')}`);
                if (meta.direction) parts.push(`연출: ${meta.direction}`);
                if (meta.imagePrompt) parts.push(`이미지힌트: ${meta.imagePrompt}`);
                return parts.length ? `[Line ${lineIdx}] ${parts.join(' | ')}` : '';
            }).filter(Boolean);
            if (hints.length) {
                scriptWithHints = `${userInputScript}\n\n--- 작가 메타데이터 (참고용, 컷 분할과 연출에 활용) ---\n${hints.join('\n')}`;
            }
        }

        const { cuts: contiCuts, tokenCount: contiToken } = await generateConti(
            scriptWithHints, scenarioAnalysis, characterBibles, editedBeats, logline || undefined, undefined,
            (textLength) => { dispatch({ type: 'SET_LOADING_DETAIL', payload: `✂️ 콘티 분할 중... (${textLength}자 생성됨)` }); }
        );
        checkPipelineAlive(pid, 'Step4-conti');
        handleAddUsage(contiToken, 'claude');

        // ★ 상세 대본: 메타데이터(direction, imagePrompt)를 ContiCut에 직접 주입
        // originLines 기반 매핑 — USS가 한 줄을 여러 컷으로 분할해도 shift 없음
        if (scriptMeta?.isDetailed && scriptMeta.metadataByLine) {
            for (const cut of contiCuts) {
                const lineNum = cut.originLines?.[0];
                if (lineNum == null) continue;
                const lineIdx = String(lineNum - 1); // originLines는 1-based, metadataByLine 키는 0-based
                const meta = (scriptMeta.metadataByLine as any)[lineIdx];
                if (!meta) continue;

                // direction: AI가 안 넣었으면 사용자 값 보충
                if (!cut.direction && meta.direction) {
                    cut.direction = meta.direction;
                }
                // ★ imagePrompt → visualDescription: 사용자 직접 입력이 AI 분석보다 우선
                if (meta.imagePrompt) {
                    cut.visualDescription = meta.imagePrompt;
                    // 구성 컷(타임랩스/화면분할 등) 충돌 방지: AI 단일 포즈가 사용자 구도를 덮는 것 방지
                    cut.characterPose = '';
                }
            }
        }

        dispatch({ type: 'SET_CONTI_CUTS', payload: contiCuts });
        updateUIState({ analysisProgress: 65 });

        // Step 5: 촬영 설계
        updateUIState({ analysisStage: 'blueprint' });
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📹 촬영 설계 중... (카메라 문법, 시선 유도, 조명)' });
        const { plan: cinePlan, tokenCount: cineToken } = await designCinematography(contiCuts, scenarioAnalysis);
        checkPipelineAlive(pid, 'Step5-cine');
        handleAddUsage(cineToken, 'claude');
        dispatch({ type: 'SET_CINEMATOGRAPHY_PLAN', payload: cinePlan });
        updateUIState({ analysisProgress: 80 });

        // ★ conti_pause — Step 4+5 완료 후 정지, 사용자가 컷 편집 후 진행
        dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'conti_pause' });
        addNotification('콘티+촬영 설계 완료. 컷을 확인/편집 후 [Continue] 버튼을 눌러 진행하세요.', 'info');

    } catch (error) {
        if (error instanceof PipelineCancelledError) {
            console.log(`[Pipeline] 콘티 파이프라인 취소됨: ${error.message}`);
            return;
        }
        console.error(error);
        addNotification(`콘티 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, 'error');
        updateUIState({ analysisStage: 'idle', analysisProgress: 0 });
    } finally {
        dispatch({ type: 'STOP_LOADING' });
    }
}


/**
 * conti_pause 상태에서 사용자가 컷 편집 완료 후 호출
 * Step 6만 실행: ContiCut → EditableScene 변환
 */
export async function resumeFromContiPause(
    h: PipelineHelpers,
): Promise<void> {
    const pid = startNewPipeline();
    const { dispatch, stateRef, addNotification, handleAddUsage, updateUIState } = createSafeHelpers(h, pid);
    const { contiCuts, cinematographyPlan, characterBibles } = stateRef.current;

    if (!contiCuts || !cinematographyPlan) {
        addNotification('콘티/촬영 데이터가 없습니다. 처음부터 다시 시작하세요.', 'error');
        return;
    }

    dispatch({ type: 'START_LOADING', payload: '스토리보드 변환 중...' });
    updateUIState({ analysisStage: 'storyboard', analysisProgress: 80 });

    try {
        // Step 6: ContiCut → EditableScene 변환
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📋 스토리보드 변환 중...' });
        const editableStoryboard = convertContiToEditableStoryboard(contiCuts, cinematographyPlan, characterBibles);
        dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: editableStoryboard });

        const enrichedLines = contiCuts.map((c: any) =>
            `[${c.cutType.toUpperCase()}] ${c.narration || c.visualDescription}`
        ).join('\n');
        dispatch({ type: 'SET_ENRICHED_SCRIPT', payload: enrichedLines });

        const seed = Math.floor(Math.random() * 100000);
        dispatch({ type: 'SET_STORYBOARD_SEED', payload: seed });

        updateUIState({ analysisStage: 'storyboard', analysisProgress: 100 });
        dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'analysis_done' });
        setTimeout(() => updateUIState({ analysisStage: 'idle', analysisProgress: 0 }), 800);
        updateUIState({ isSceneAnalysisReviewModalOpen: true });

    } catch (error) {
        console.error(error);
        addNotification(`스토리보드 변환 중 오류: ${error instanceof Error ? error.message : String(error)}`, 'error');
        updateUIState({ analysisStage: 'idle', analysisProgress: 0 });
    } finally {
        dispatch({ type: 'STOP_LOADING' });
    }
}

// ═══════════════════════════════════════════════════════════════════
// MSF Pipeline — 기존 나레이션 경로와 완전 분리
// AI 1회(파싱+보정+콘티) → Step5(촬영 설계) → Step6(스토리보드 변환)
// ═══════════════════════════════════════════════════════════════════

/**
 * MSF 대본 모드: Claude 1회 → designCinematography → convertContiToEditableStoryboard
 * enriched_pause 없이 끝까지 자동 진행
 */
export async function runMSFPipeline(
    h: PipelineHelpers,
    overrides?: { artStyle?: ArtStyle; customArtStyle?: string }
): Promise<void> {
    const pid = startNewPipeline();
    const { dispatch, stateRef, addNotification, handleAddUsage, updateUIState } = createSafeHelpers(h, pid);
    const { userInputScript, logline, speakerGender } = stateRef.current;

    if (!userInputScript.trim()) {
        addNotification('MSF 대본을 입력해주세요.', 'error');
        return;
    }

    // ★ AI 모델 티어 설정
    setClaudeModel(stateRef.current.aiModelTier || 'opus');

    dispatch({ type: 'START_LOADING', payload: 'MSF 대본 분석 중...' });
    updateUIState({ analysisStage: 'character', analysisProgress: 0 });

    // 프로젝트 자동 생성
    if (IS_TAURI && !stateRef.current.currentProjectId) {
        try {
            const projectId = await createProjectLocal(stateRef.current.storyTitle || '새 프로젝트');
            dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
        } catch (err) { console.warn('프로젝트 자동 생성 실패:', err); }
    }

    try {
        // ① AI 1회차: MSF 파싱 + 캐릭터 바이블 + ContiCut[] 생성
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '🎬 MSF 대본 파싱 중... (장소, 인물, 대사, 감정, 콘티 분할)' });
        const msfResult = await parseMSFScript(userInputScript, logline || undefined, undefined, speakerGender);
        checkPipelineAlive(pid, 'MSF-parse');
        handleAddUsage(msfResult.tokenCount, 'claude');
        updateUIState({ analysisProgress: 30 });

        // scenarioAnalysis 저장
        dispatch({ type: 'SET_SCENARIO_ANALYSIS', payload: msfResult.scenarioAnalysis });
        const locationRegistry = msfResult.scenarioAnalysis.locations || [];
        dispatch({ type: 'SET_LOCATION_REGISTRY', payload: locationRegistry });
        // ★ locationVisualDNA 저장
        if (msfResult.scenarioAnalysis.locationVisualDNA) {
            dispatch({ type: 'SET_LOCATION_VISUAL_DNA', payload: msfResult.scenarioAnalysis.locationVisualDNA });
        }

        // characterBibles → legacyCharacters 변환 (기존 코드와 동일)
        dispatch({ type: 'SET_CHARACTER_BIBLES', payload: msfResult.characterBibles });
        const legacyCharacters: { [key: string]: CharacterDescription } = {};
        for (const bible of msfResult.characterBibles) {
            const key = bible.koreanName.replace(/\s/g, '_');
            const allLocations = Object.keys(bible.outfitRecommendations || {});
            const locations: { [loc: string]: string } = {};
            const koreanLocations: { [loc: string]: string } = {};
            for (const loc of allLocations) {
                let outfitDesc = bible.outfitRecommendations[loc]?.description || '';
                outfitDesc = outfitDesc.replace(/^\s*\([^)]*hair[^)]*\)\s*/i, '').trim();
                locations[loc] = outfitDesc;
                koreanLocations[loc] = outfitDesc;
            }
            legacyCharacters[key] = {
                koreanName: bible.koreanName,
                canonicalName: bible.canonicalName || bible.koreanName,
                aliases: bible.aliases || [bible.koreanName],
                koreanBaseAppearance: bible.baseAppearance,
                baseAppearance: bible.baseAppearance,
                gender: bible.gender,
                personality: bible.personalityProfile.core,
                locations,
                koreanLocations,
            };
        }
        dispatch({ type: 'SET_CHARACTER_DESCRIPTIONS', payload: legacyCharacters });

        // contiCuts 저장
        dispatch({ type: 'SET_CONTI_CUTS', payload: msfResult.contiCuts });
        updateUIState({ analysisProgress: 40 });

        // ★ 미장센 풍부화 (배치 처리)
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '🎭 감정·연기·포즈 풍부화 중... (0/' + msfResult.contiCuts.length + ' 컷)' });
        const { enrichedCuts, tokenCount: enrichToken } = await enrichContiCutsBatch(
            msfResult.contiCuts,
            userInputScript,
            msfResult.characterBibles,
            msfResult.scenarioAnalysis,
            {
                batchSize: 8,
                contextWindow: 2,
                onProgress: (done, total) => {
                    dispatch({ type: 'SET_LOADING_DETAIL', payload: `🎭 감정·연기·포즈 풍부화 중... (${done}/${total} 컷)` });
                },
            },
        );
        checkPipelineAlive(pid, 'MSF-enrich');
        handleAddUsage(enrichToken, 'claude');
        dispatch({ type: 'SET_CONTI_CUTS', payload: enrichedCuts });
        updateUIState({ analysisProgress: 55 });

        // 제목 자동 생성 (제목이 없을 때)
        if (!stateRef.current.storyTitle) {
            try {
                const titleResult = await generateTitleAndSetup(userInputScript);
                handleAddUsage(titleResult.tokenCount, 'claude');
                if (titleResult.titles.length > 0) {
                    dispatch({ type: 'SET_STORY_TITLE', payload: titleResult.titles[0] });
                }
            } catch { /* 제목 실패는 무시 */ }
        }

        // ② Step 5: 촬영 설계 — enrichedCuts 사용
        updateUIState({ analysisStage: 'blueprint', analysisProgress: 60 });
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📹 촬영 설계 중... (카메라 문법, 시선 유도, 조명)' });
        const { plan: cinePlan, tokenCount: cineToken } = await designCinematography(enrichedCuts, msfResult.scenarioAnalysis);
        checkPipelineAlive(pid, 'MSF-cine');
        handleAddUsage(cineToken, 'claude');
        dispatch({ type: 'SET_CINEMATOGRAPHY_PLAN', payload: cinePlan });
        updateUIState({ analysisProgress: 80 });

        // ③ Step 6: ContiCut → EditableScene 변환 — enrichedCuts 사용
        updateUIState({ analysisStage: 'storyboard' });
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📋 스토리보드 변환 중...' });
        const editableStoryboard = convertContiToEditableStoryboard(enrichedCuts, cinePlan, msfResult.characterBibles);
        dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: editableStoryboard });

        // enrichedScript 동기화 (MSF에선 enrichedBeats 없음)
        const enrichedLines = msfResult.contiCuts.map(c =>
            `[${c.cutType.toUpperCase()}] ${c.narration || c.visualDescription}`
        ).join('\n');
        dispatch({ type: 'SET_ENRICHED_SCRIPT', payload: enrichedLines });

        const seed = Math.floor(Math.random() * 100000);
        dispatch({ type: 'SET_STORYBOARD_SEED', payload: seed });

        // ④ 완료
        updateUIState({ analysisStage: 'storyboard', analysisProgress: 100 });
        dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'analysis_done' });
        setTimeout(() => updateUIState({ analysisStage: 'idle', analysisProgress: 0 }), 800);
        updateUIState({ isSceneAnalysisReviewModalOpen: true });
        addNotification('MSF 대본 분석이 완료되었습니다.', 'success');

    } catch (error) {
        console.error(error);
        if (error instanceof PipelineCancelledError) {
            console.log(`[Pipeline] MSF 파이프라인 취소됨: ${error.message}`);
            return;
        }
        addNotification(`MSF 분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, 'error');
        updateUIState({ analysisStage: 'idle', analysisProgress: 0 });
    } finally {
        dispatch({ type: 'STOP_LOADING' });
    }
}


// ═══════════════════════════════════════════════════════════════════
// USS Pipeline — 나레이션 → Claude 구조분석 → 배치 컷 변환 → Step 5~6
// Call 1: 구조 분석 (meta + characters + locations + 막 구분)
// Call 2~N: 나레이션 배치 → 컷 변환
// 기존 Step 1~4를 대체하는 실험적 경로
// ═══════════════════════════════════════════════════════════════════

export async function runUSSPipeline(
    h: PipelineHelpers,
    overrides?: { artStyle?: ArtStyle; customArtStyle?: string }
): Promise<void> {
    const pid = startNewPipeline();
    const { dispatch, stateRef, addNotification, handleAddUsage, updateUIState } = createSafeHelpers(h, pid);
    const { userInputScript, logline, speakerGender } = stateRef.current;

    if (!userInputScript.trim()) {
        addNotification('대본을 입력해주세요.', 'error');
        return;
    }

    // ★ AI 모델 티어 설정
    setClaudeModel(stateRef.current.aiModelTier || 'opus');

    // ★ 화풍 적용 (overrides)
    if (overrides?.artStyle) {
        dispatch({ type: 'SET_ART_STYLE', payload: overrides.artStyle });
    }
    if (overrides?.customArtStyle) {
        dispatch({ type: 'SET_CUSTOM_ART_STYLE', payload: overrides.customArtStyle });
    }

    dispatch({ type: 'START_LOADING', payload: 'USS 대본 분석 중...' });
    updateUIState({ analysisStage: 'character', analysisProgress: 0 });

    // 프로젝트 자동 생성
    if (IS_TAURI && !stateRef.current.currentProjectId) {
        try {
            const projectId = await createProjectLocal(stateRef.current.storyTitle || '새 프로젝트');
            dispatch({ type: 'SET_CURRENT_PROJECT_ID', payload: projectId });
        } catch (err) { console.warn('프로젝트 자동 생성 실패:', err); }
    }

    try {
        // ① Call 1: 구조 분석 (meta + characters + locations + 막 구분)
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📖 USS 구조 분석 중... (인물, 장소, 극적 구조)' });
        const { structure, tokenCount: structToken } = await analyzeUSSStructure(userInputScript, logline || undefined, stateRef.current.storyBrief || undefined, speakerGender);
        checkPipelineAlive(pid, 'USS-structure');
        handleAddUsage(structToken, 'claude');
        updateUIState({ analysisProgress: 20 });

        addNotification(`구조 분석 완료: ${structure.characters.length}명, ${structure.locations.length}장소`, 'info');

        // ② Call 2~N: 나레이션 배치 → 컷 변환
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '🎬 컷 분할 중... (배치 처리)' });
        const { cuts: ussCuts, totalTokens: cutsToken } = await convertAllNarrationToCuts(
            userInputScript,
            structure.characters,
            structure.locations,
            {
                batchSize: 12,
                storyBrief: stateRef.current.storyBrief || undefined,
                onProgress: (done, total, text) => {
                    const progress = 20 + Math.floor((done / Math.max(total, 1)) * 30);
                    updateUIState({ analysisProgress: progress });
                    dispatch({ type: 'SET_LOADING_DETAIL', payload: text });
                },
            },
        );
        checkPipelineAlive(pid, 'USS-cuts');
        handleAddUsage(cutsToken, 'claude');
        updateUIState({ analysisProgress: 50 });

        // ③ USS → 앱 데이터 변환 (AI 불필요)
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📋 스토리보드 구조 변환 중...' });
        const { contiCuts: rawContiCuts, characterBibles, scenarioAnalysis, legacyCharacters, locationVisualDNA } = ussToAppData(structure, ussCuts);

        // state 저장
        dispatch({ type: 'SET_SCENARIO_ANALYSIS', payload: scenarioAnalysis });
        dispatch({ type: 'SET_LOCATION_REGISTRY', payload: scenarioAnalysis.locations });
        dispatch({ type: 'SET_LOCATION_VISUAL_DNA', payload: locationVisualDNA });
        dispatch({ type: 'SET_CHARACTER_BIBLES', payload: characterBibles });
        dispatch({ type: 'SET_CHARACTER_DESCRIPTIONS', payload: legacyCharacters });

        // 제목 자동 설정
        if (structure.meta.title && !stateRef.current.storyTitle) {
            dispatch({ type: 'SET_STORY_TITLE', payload: structure.meta.title });
        }
        const contiCuts = rawContiCuts;
        dispatch({ type: 'SET_CONTI_CUTS', payload: contiCuts });
        updateUIState({ analysisProgress: 55 });

        // ④ Step 5: 촬영 설계 (Claude)
        updateUIState({ analysisStage: 'blueprint', analysisProgress: 60 });
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📹 촬영 설계 중... (카메라 문법, 시선 유도, 조명)' });
        const { plan: cinePlan, tokenCount: cineToken } = await designCinematography(contiCuts, scenarioAnalysis);
        checkPipelineAlive(pid, 'USS-cine');
        handleAddUsage(cineToken, 'claude');
        dispatch({ type: 'SET_CINEMATOGRAPHY_PLAN', payload: cinePlan });
        updateUIState({ analysisProgress: 80 });

        // ⑤ Step 6: ContiCut → EditableScene 변환
        updateUIState({ analysisStage: 'storyboard' });
        dispatch({ type: 'SET_LOADING_DETAIL', payload: '📋 스토리보드 변환 중...' });
        const editableStoryboard = convertContiToEditableStoryboard(contiCuts, cinePlan, characterBibles);
        dispatch({ type: 'SET_EDITABLE_STORYBOARD', payload: editableStoryboard });

        const enrichedLines = contiCuts.map(c =>
            `[${c.cutType.toUpperCase()}] ${c.narration || c.visualDescription}`
        ).join('\n');
        dispatch({ type: 'SET_ENRICHED_SCRIPT', payload: enrichedLines });

        const seed = Math.floor(Math.random() * 100000);
        dispatch({ type: 'SET_STORYBOARD_SEED', payload: seed });

        // ⑥ 완료
        updateUIState({ analysisStage: 'storyboard', analysisProgress: 100 });
        dispatch({ type: 'SET_PIPELINE_CHECKPOINT', payload: 'analysis_done' });
        setTimeout(() => updateUIState({ analysisStage: 'idle', analysisProgress: 0 }), 800);
        updateUIState({ isSceneAnalysisReviewModalOpen: true });
        addNotification(`USS 분석 완료: ${contiCuts.length}컷, ${characterBibles.length}명 (Claude ${2 + Math.ceil(userInputScript.split('\n').filter(l => l.trim()).length / 12)}회 호출)`, 'success');

    } catch (error) {
        console.error(error);
        if (error instanceof PipelineCancelledError) {
            console.log(`[Pipeline] USS 파이프라인 취소됨: ${error.message}`);
            return;
        }
        addNotification(`USS 분석 오류: ${error instanceof Error ? error.message : String(error)}`, 'error');
        updateUIState({ analysisStage: 'idle', analysisProgress: 0 });
    } finally {
        dispatch({ type: 'STOP_LOADING' });
    }
}


// ═══════════════════════════════════════════════════════════════════
// 장소 재생성 — enriched_pause / conti_pause 공용
// 새 장소 감지 → visualDNA + 의상 생성 → state 업데이트
// ═══════════════════════════════════════════════════════════════════

/**
 * 새로 추가된 장소에 대해 visualDNA + 의상 재생성
 * @param newLocations 새로 추가할 장소 이름 배열
 */
export async function handleRefreshLocations(
    h: PipelineHelpers,
    newLocations: string[],
): Promise<boolean> {
    const { dispatch, stateRef, addNotification, handleAddUsage } = h;
    const { scenarioAnalysis, characterBibles, userInputScript, locationRegistry, locationVisualDNA, characterDescriptions } = stateRef.current;

    if (!scenarioAnalysis || !characterBibles || newLocations.length === 0) {
        addNotification('장소 재생성에 필요한 데이터가 없습니다.', 'error');
        return false;
    }

    dispatch({ type: 'START_LOADING', payload: `📍 새 장소 ${newLocations.length}개 등록 중...` });
    dispatch({ type: 'SET_LOADING_DETAIL', payload: `장소: ${newLocations.join(', ')} — 배경 묘사 + 의상 생성` });

    try {
        const result = await regenerateForNewLocations(
            newLocations,
            characterBibles,
            scenarioAnalysis,
            userInputScript,
        );

        handleAddUsage(result.tokenCount, 'claude');

        // ① locationRegistry 업데이트
        const updatedRegistry = [...(locationRegistry || []), ...newLocations];
        dispatch({ type: 'SET_LOCATION_REGISTRY', payload: updatedRegistry });

        // ② scenarioAnalysis.locations도 동기화
        const updatedScenario = {
            ...scenarioAnalysis,
            locations: updatedRegistry,
        };
        dispatch({ type: 'SET_SCENARIO_ANALYSIS', payload: updatedScenario });

        // ③ locationVisualDNA 병합
        const mergedDNA = { ...(locationVisualDNA || {}), ...result.locationVisualDNA };
        dispatch({ type: 'SET_LOCATION_VISUAL_DNA', payload: mergedDNA });

        // ④ characterBibles 업데이트
        dispatch({ type: 'SET_CHARACTER_BIBLES', payload: result.updatedBibles });

        // ⑤ characterDescriptions (레거시) 동기화
        const updatedDescriptions = { ...characterDescriptions };
        for (const bible of result.updatedBibles) {
            const key = Object.keys(updatedDescriptions).find(
                k => { const cd = updatedDescriptions[k]; return (cd.canonicalName && cd.canonicalName === (bible.canonicalName || bible.koreanName)) || cd.koreanName === bible.koreanName; }
            );
            if (key) {
                const desc = updatedDescriptions[key];
                const newLocations_locs: { [loc: string]: string } = { ...desc.locations };
                const newKoreanLocs: { [loc: string]: string } = { ...desc.koreanLocations };
                for (const loc of newLocations) {
                    const outfit = bible.outfitRecommendations[loc];
                    if (outfit) {
                        const cleanDesc = outfit.description.replace(/^\s*\([^)]*hair[^)]*\)\s*/i, '').trim();
                        newLocations_locs[loc] = cleanDesc;
                        newKoreanLocs[loc] = cleanDesc;
                    }
                }
                updatedDescriptions[key] = { ...desc, locations: newLocations_locs, koreanLocations: newKoreanLocs };
            }
        }
        dispatch({ type: 'SET_CHARACTER_DESCRIPTIONS', payload: updatedDescriptions });

        addNotification(`✅ 새 장소 ${newLocations.length}개 등록 완료: ${newLocations.join(', ')}`, 'success');
        return true;

    } catch (error) {
        console.error('[handleRefreshLocations]', error);
        addNotification(`장소 재생성 실패: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return false;
    } finally {
        dispatch({ type: 'STOP_LOADING' });
    }
}
