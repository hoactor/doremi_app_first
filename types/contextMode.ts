// types/contextMode.ts — Phase A.6: Context 모드 씬 디자인 데이터 모델
// 기존 ContiCut/EditableCut과 무관. Context 모드 전용 트랙.

/**
 * Phase A.6: 한 씬(outfitSession)을 시각적 시퀀스로 디자인한 결과.
 * Claude 분석으로 생성, 사용자가 검수/수정, gpt-image-2 일괄 생성 입력으로 사용.
 */
export interface ContextSceneDesign {
    /** outfitSession 식별자 — `${location}::${layerId}::${lineRange[0]}-${lineRange[1]}` */
    sessionKey: string;

    /** 원본 outfitSession 정보 (스냅샷) — 변경 감지용 */
    sourceSession: {
        location: string;
        layerId: string;
        lineRange: [number, number];
    };

    /** 씬 내러티브 (영상 감독 시각) */
    sceneNarrative: string;

    /** 카메라 다양성 의도 */
    cameraIntent: string;

    /** 감정 곡선 (씬 안의 emotional arc) */
    moodArc: string;

    /** 시각적 핵심 모멘트들 */
    keyMoments: string[];

    /** Claude가 추천한 컷 수 */
    recommendedCutCount: number;

    /** 사용자가 최종 결정한 컷 수 */
    targetCutCount: number;

    /** 컷별 시각 디자인 (사용자가 검수/수정 가능) */
    plannedCuts: PlannedCut[];

    /** 분석 시점 (stale 감지용) */
    analyzedAt: string;

    /** 분석 시 입력된 outfitSession이 그 후 변경됐는지 */
    isStale?: boolean;

    /** 생성 결과 (있으면) */
    generationResult?: ContextSceneGeneration;
}

/**
 * 씬 안의 한 컷 디자인.
 * 같은 씬 안의 시각적 모멘트 단위 (시간/공간 동일).
 */
export interface PlannedCut {
    /** 씬 내 인덱스 (1-indexed) */
    cutIndex: number;

    /** 'anchor' = 씬 첫 컷 (대표 시각), 'follow' = 후속 컷 */
    role: 'anchor' | 'follow';

    /** 이 컷의 시각적 모멘트 */
    momentDescription: string;

    /** 카메라 (씬 내 다양성 확보 — 매 컷 다른 카메라 권장) */
    cameraNote: string;

    /** 액션 (앵커는 '(anchor — defines the scene)', follow는 변화점) */
    actionDelta: string;

    /** 감정 비트 (씬의 moodArc 안의 한 지점) */
    moodPoint: string;
}

/**
 * 씬 일괄 생성 결과.
 */
export interface ContextSceneGeneration {
    sessionKey: string;
    /** 생성된 이미지 N장 (앵커 + follow) */
    images: ContextGeneratedImage[];
    /** 사용된 프롬프트 (디버그용) */
    promptUsed: string;
    /** 생성 시 사용된 quality */
    quality: 'low' | 'medium' | 'high';
    generatedAt: string;
    /** 비용 (USD) */
    estimatedCostUsd: number;
}

export interface ContextGeneratedImage {
    /** plannedCut.cutIndex와 매칭 */
    cutIndex: number;
    /** data:image/png;base64,... 또는 로컬 path */
    imageUrl: string;
    /** PlannedCut 메타 (사용자에게 표시용) */
    momentDescription: string;
}
