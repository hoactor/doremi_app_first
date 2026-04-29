// types/pipeline.ts — 대본 분석 파이프라인 타입
// Phase 4: Preproduction Pipeline + Phase 12: EnrichedBeat

export type CutType = 'dialogue' | 'reaction' | 'insert' | 'establish' | 'transition';
export type PipelineCheckpoint = 'idle' | 'enriched_pause' | 'conti_pause' | 'analysis_done' | 'scene_confirmed' | 'costume_done' | 'complete';
export type ApiSource = 'claude' | 'gemini';

export interface EnrichedBeat {
    id: number;
    type: 'narration' | 'insert' | 'reaction';
    text: string;
    beat: string;
    emotion: string;
    direction: string;
}

/**
 * Phase 7: 장소 카테고리 — 의상 전환 매트릭스의 기본 축.
 * - private_home: 본인 집·방·본인 공간 → 홈웨어/파자마 가능
 * - visiting_home: 친척집·지인집 (방문 중) → 외출복 유지
 * - public_indoor: 카페·옷가게·서점·식당 → 외출복
 * - public_outdoor: 공원·거리·광장·관광지 → 외출복 + 외투
 * - transit: 자동차·지하철·비행기·택시 → 직전 외출복 유지
 * - formal: 회사·공항·병원·행사장 → 포멀/비즈니스
 * - other: 분류 모호 (기본 public_indoor처럼 취급)
 */
export type LocationCategory =
    | 'private_home'
    | 'visiting_home'
    | 'public_indoor'
    | 'public_outdoor'
    | 'transit'
    | 'formal'
    | 'other';

/**
 * Phase 7: 장소 엔트리 — 이름 + 카테고리 + (선택) 설명.
 * 레거시 호환: 문자열 배열로 저장된 기존 프로젝트는 sanitizeState에서 자동 변환.
 */
export interface LocationEntry {
    name: string;
    category: LocationCategory;
    description?: string;
}

/**
 * 심화 1: 의상 전환 타입 — outfitSession 간 이동 시 의상이 어떻게 변하는지.
 * Step 1 후처리에서 TRANSITION_MATRIX로 사전 계산하여 OutfitSession에 저장.
 * Step 2가 이 값을 보고 의상을 결정론적으로 생성.
 */
export type TransitionType =
    | 'maintain'            // 유지 (정확히 같은 의상)
    | 'add_outerwear'       // 외투 추가 (하위 의상 유지)
    | 'remove_outerwear'    // 외투 제거
    | 'full_change'         // 완전 교체 (상의·하의·신발 다름)
    | 'home_return';        // 귀가 변경 (외출복 → 홈웨어)

/**
 * Phase A: 기본 sceneLayer ID 상수 (하드코딩 방지).
 * appReducer.ts의 폴백 / textAnalysisPipeline.ts의 폴백과 정확히 동기 필수.
 * 수정 금지 파일(appStyleEngine.ts, appFluxPromptEngine.ts)의 '현재' 리터럴은
 * 값이 같으므로 동작 영향 없음 — 향후 이 상수 변경 시 수정 금지 파일도 함께 갱신.
 */
export const DEFAULT_SCENE_LAYER_ID = '현재';

/**
 * Phase A: 회상/상상 시각 톤 modifier — sceneLayer 단위로 부여.
 * 'none'이 현재 시간 기본값. 'custom'은 SceneLayer.customToneText 자유 입력 사용.
 */
export type ToneModifier =
    | 'none'
    | 'sepia'
    | 'desaturated'
    | 'cool-blue'
    | 'soft-focus'
    | 'warm-vintage'
    | 'dream-blur'
    | 'sketchy'
    | 'custom';

/**
 * 시간/서사 레이어 — 같은 공간(location)이어도 시점이나 내러티브 레이어가 다르면
 * 별개의 "의상 세션"을 형성한다.
 * 예: 엄마집 현재 / 엄마집 회상_어린시절 / 엄마집 내일아침
 */
export interface SceneLayer {
    id: string;                 // "현재" | "회상_어린시절" | "다음날_아침" 등
    label: string;              // UI 표시용 (한국어 라벨)
    timeDelta?: string;         // "과거 10년" / "내일" / "1주일 후" 등
    isFlashback?: boolean;      // 회상·플래시백
    isImagined?: boolean;       // 상상·꿈
    /** Phase A: 회상/상상 시각 톤 modifier. 없으면 'none' (현재 시간). */
    toneModifier?: ToneModifier;
    /** Phase A: toneModifier === 'custom'일 때만 사용. 자유 입력 톤 묘사. */
    customToneText?: string;
}

/**
 * 의상 세션 — (장소 × 시간 레이어)의 실제 대본 등장 조합.
 * Cartesian 전체가 아니라 실제 쓰이는 것만 나열.
 * Step 2 analyzeCharacterBible은 이 세션 단위로 캐릭터별 의상 생성.
 */
export interface OutfitSession {
    location: string;
    layerId: string;            // SceneLayer.id
    lineRange: [number, number]; // 대본 줄 범위 (1-based, 포함)
    /**
     * 심화 1: 이전 세션(시간 순서상 직전)에서 이 세션으로 전환 시 의상이 어떻게 변하는지.
     * Step 1 후처리에서 TRANSITION_MATRIX로 사전 계산.
     * 첫 세션은 undefined. Step 2 프롬프트 + 런타임 resolver에서 활용.
     */
    transitionFromPrev?: TransitionType;
    /** Phase A: 사용자가 부여한 배치 라벨 (UI 표시용). 없으면 자동 생성: "{location} · {layerLabel}" */
    userLabel?: string;
    /** Phase A: 배치 메모 (검수 노트, 의도 기록). */
    userNote?: string;
    /**
     * Phase B v3 Stage 1: 사용자가 수동 오버라이드한 anchor 컷 번호.
     * 없으면 lineRange 첫 줄에 매핑된 컷이 자동 anchor.
     * Context 엔진 모드 + OpenAI 엔진일 때만 활용.
     */
    anchorCutNumber?: string;
    /**
     * Phase B v3 Stage 1: anchor로 사용할 GeneratedImage.id.
     * 없으면 anchor 컷의 selectedImageId 폴백.
     */
    anchorImageId?: string;
}

export interface ScenarioAnalysis {
    genre: string;
    tone: string;
    threeActStructure: {
        setup: { startLine: number; endLine: number; description: string };
        confrontation: { startLine: number; endLine: number; description: string };
        resolution: { startLine: number; endLine: number; description: string };
    };
    emotionalArc: string[];
    turningPoints: number[];
    colorMood: string;
    pacing: string;
    /**
     * Phase 7: LocationEntry[]로 변경. 카테고리(private_home/public_indoor/...)가
     * 의상 전환 매트릭스의 기본 축이 됨.
     * 레거시 프로젝트: sanitizeState가 string[] → LocationEntry[]로 자동 마이그레이션.
     */
    locations: LocationEntry[];
    /**
     * 키 형식: "{location}" (레거시) 또는 "{location}::{layerId}" (신규, Phase 5).
     * buildFinalPrompt resolver가 신규 키 우선 → 레거시 폴백 순으로 조회.
     */
    locationVisualDNA?: { [compositeKey: string]: string };
    /** Phase 5: 시간/내러티브 레이어 배열. 없으면 [{id:'현재',label:'현재'}] 폴백. */
    sceneLayers?: SceneLayer[];
    /** Phase 5: 의상 세션 목록. 없으면 [] (레거시 = location만으로 의상 키 구성). */
    outfitSessions?: OutfitSession[];
    /**
     * Phase A.5: 씬 단위 자연어 시각 분석 (analyzeVisualNarrative 결과).
     * Phase B(gpt-image-2)에서 활용. 없으면 undefined (이전 프로젝트 호환).
     */
    visualAnalysis?: SceneVisualAnalysis[];
}

/**
 * Phase A.5: 씬 단위 자연어 시각 분석.
 * analyzeVisualNarrative가 출력. ScenarioAnalysis.visualAnalysis 배열에 저장.
 * convertAllNarrationToCuts(=Step 4 generateConti)에서 컷 분할 컨텍스트로 활용.
 */
export interface SceneVisualAnalysis {
    /** "scene-1", "scene-2" 등 또는 sceneLayer id */
    sceneId: string;
    /** 1-indexed 시간 순서 */
    sceneIndex: number;
    /** 이 씬이 다루는 라인 범위 [start, end] inclusive */
    lineRange: [number, number];
    /** sceneLayer id (현재/회상 등). 없으면 '현재' */
    sceneLayerId?: string;
    /** [Scene] 자연어 — where/when/atmosphere */
    sceneNarrative: string;
    /** [Subject] 자연어 — 인물 + 외형/상태 흐름 */
    subjectDescription: string;
    /** [Details] 자연어 — 액션/감정/분위기 통합 */
    detailsNarrative: string;
    /** [Camera] 자연어 — 권장 카메라 다양성 */
    cameraIntent: string;
    /** 감정/분위기 흐름 */
    moodArc: string;
    /** 컷 분할 힌트 (강제 X) */
    suggestedCutBoundaries?: number[];
    /** 시각적으로 강조할 핵심 모멘트 */
    keyMoments?: string[];
}

export interface BehaviorPatterns {
    nervous: string;
    angry: string;
    happy: string;
    flustered: string;
    sad?: string;
    surprised?: string;
    [key: string]: string | undefined;
}

/**
 * 심화 2: 의상 상태 카테고리 — 장면 맥락에 따른 의상 유형.
 * Step 2가 각 세션 의상에 이 값 부여 → resolver가 외투 add/remove 시 base만 유지.
 */
export type OutfitState =
    | 'pajama'      // 파자마/잠옷 (외출 불가)
    | 'homewear'    // 홈웨어/실내복 (편한 티셔츠·추리닝·원피스 등)
    | 'casual'      // 일상 외출복 (외투 없음)
    | 'outdoor'     // 외출복 + 외투 (코트·자켓·카디건 포함 상태)
    | 'formal'      // 포멀/비즈니스
    | 'special';    // 특수 (이벤트·파티·전통복 등)

export interface OutfitRecommendation {
    /** 전체 의상 설명 (base + outerwear 합쳐진 기존 형태, 하위 호환). */
    description: string;
    reasoning: string;
    /**
     * 심화 2: 기본 의상 (외투 없이). outerwear가 있으면 description은 base+outerwear 합본.
     * resolver가 remove_outerwear 전환 시 base만 사용해 외투 제거 효과 구현.
     */
    base?: string;
    /**
     * 심화 2: 외투/상의 추가 레이어. 있으면 outdoor 상태.
     * null = 외투 없음, 문자열 = 외투 묘사.
     */
    outerwear?: string | null;
    /** 심화 2: 의상 상태 (파자마·홈웨어·외출복·포멀·특수). 필수는 아니지만 있으면 resolver가 활용. */
    state?: OutfitState;
}

export interface CharacterBible {
    koreanName: string;
    /** 영어 정규 이름 — 내부 매칭 키. 없으면 koreanName 폴백 (기존 프로젝트 호환) */
    canonicalName?: string;
    /** 대본에서 이 캐릭터를 가리키는 모든 한국어 지칭 (딸, 아이, 애기 등) */
    aliases?: string[];
    gender: 'male' | 'female';
    baseAppearance: string;
    personalityProfile: {
        core: string;
        behaviorPatterns: BehaviorPatterns;
        relationships: { [characterName: string]: string };
        physicalMannerisms: string;
        voiceCharacter: string;
    };
    outfitRecommendations: {
        [location: string]: OutfitRecommendation;
    };
}

export interface ContiCut {
    id: string;
    cutType: CutType;
    originLines: number[];
    narration: string;
    characters: string[];
    location: string;
    visualDescription: string;
    emotionBeat: string;
    characterPose?: string;
    direction?: string;
    sfxNote?: string;
    locationDetail?: string;
    emotionBeatIntense?: string;
    visualDescriptionIntense?: string;
    characterPoseIntense?: string;
    /**
     * Phase 5: 이 컷이 속한 시간/서사 레이어.
     * 없으면 "현재" 가정 (buildFinalPrompt resolver가 폴백 처리).
     */
    sceneLayerId?: string;
    /**
     * Phase A.5: 자연어 컷 묘사 (gpt-image-2 트랙 활용).
     * Gemini buildFinalPrompt는 미참조. 모두 optional.
     */
    sceneNarrative?: string;
    cameraNote?: string;
    moodNote?: string;
    detailsNarrative?: string;
}

export interface CinematographyCut {
    cutId: string;
    shotSize: string;
    cameraAngle: string;
    cameraMovement: string;
    transitionFrom: string;
    eyelineDirection: string;
    lightingNote: string;
}

export interface CinematographyPlan {
    cuts: CinematographyCut[];
    globalNotes: string;
}
