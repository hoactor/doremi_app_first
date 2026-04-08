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
    locations: string[];
    locationVisualDNA?: { [loc: string]: string };
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
