// types/uss.ts — USS (Universal Script Schema) 타입

export interface UniversalScriptSchema {
    meta: {
        title?: string;
        genre: string;
        tone: string;
        colorMood: string;
        pacing: string;
        actBoundaries: {
            setupEndLine: number;
            setupDescription: string;
            confrontationEndLine: number;
            confrontationDescription: string;
            resolutionDescription: string;
        };
    };
    characters: USSCharacter[];
    locations: USSLocation[];
}

export interface USSCharacter {
    name: string;
    /** 영어 정규 이름 — 내부 매칭 키 */
    canonicalName?: string;
    /** 대본에서 이 캐릭터를 가리키는 모든 한국어 지칭 */
    aliases?: string[];
    gender: 'male' | 'female';
    appearance: string;          // 레거시 호환 (hair+face+body 합본)
    hair: string;                // ★ 헤어 전용: 길이, 색상(hex), 스타일, 질감, 악세서리
    face: string;                // ★ 얼굴 전용: 골격, 눈, 코, 입, 피부톤
    body?: string;               // ★ 체형 (선택): 키, 체형, 특징
    personality: string;
    defaultOutfit: string;
    behaviorPatterns?: {
        nervous?: string;
        angry?: string;
        happy?: string;
        [key: string]: string | undefined;
    };
}

export interface USSLocation {
    name: string;
    visual: string;
}

export interface USSCut {
    narration: string;
    characters: string[];
    location: string;
    action: string;
    emotion: string;
    pose: string;
    outfit?: string;
    locationDetail?: string;
    sfxNote?: string;
    cutType?: 'dialogue' | 'action' | 'reaction' | 'insert' | 'montage';
    originLine?: number;
}
