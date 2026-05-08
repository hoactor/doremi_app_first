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
    /** ★ 시간/서사 레이어. Step 1 LLM 추출 → Step 2 sceneLayerId 부여 → Step 3 컷 상속. */
    sceneLayers?: import('./pipeline').SceneLayer[];
}

export interface USSCharacter {
    name: string;
    /** 영어 정규 이름 — 내부 매칭 키 */
    canonicalName?: string;
    /** 대본에서 이 캐릭터를 가리키는 모든 한국어 지칭 */
    aliases?: string[];
    /** ★ 화자(나레이터) 표시. 1인칭 회상 컷의 빈 characters 자동 보강용. fallback: characters[0]. */
    isSpeaker?: boolean;
    gender: 'male' | 'female';
    appearance: string;          // 레거시 호환 (hair+face+body 합본)
    hair: string;                // ★ 헤어 전용: 길이, 색상(hex), 스타일, 질감, 악세서리
    face: string;                // ★ 얼굴 전용: 골격, 눈, 코, 입, 피부톤
    body?: string;               // ★ 체형 (선택): 키, 체형, 특징
    personality: string;
    defaultOutfit: string;
    outfitByLocation?: { [locationName: string]: string };
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
    /** ★ 시간/서사 레이어 id (현재/회상/상상). visualAnalysis에서 상속, 누락 시 직전 컷 상속 → "현재" 폴백. */
    sceneLayerId?: string;
    /** AI가 action 외에 별도 시각 묘사를 넣어줄 때 사용 (location 정규화 컨텍스트). */
    visualDescription?: string;
    /**
     * Phase A.5: 자연어 컷 묘사 (gpt-image-2 트랙). Gemini 미참조.
     * convertNarrationToCutsBatch가 출력 → ussToAppData가 ContiCut으로 전달.
     */
    sceneNarrative?: string;
    cameraNote?: string;
    moodNote?: string;
    detailsNarrative?: string;
}
