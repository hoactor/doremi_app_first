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

export interface OutfitRecommendation {
    description: string;
    reasoning: string;
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
