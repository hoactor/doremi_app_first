// appPresetValidation.ts — 프리셋 데이터 검증 로직

import type { ScenarioAnalysis, CharacterBible, EnrichedBeat } from './types/pipeline';

export interface PresetValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export function safeJsonParse<T>(text: string, label: string): { data: T | null; error: string | null } {
    try {
        const data = JSON.parse(text) as T;
        return { data, error: null };
    } catch (e) {
        return { data: null, error: `${label} JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}` };
    }
}

export function validatePresetData(
    userInputScript: string,
    scenarioAnalysis: ScenarioAnalysis,
    characterBibles: CharacterBible[],
    enrichedBeats?: EnrichedBeat[],
): PresetValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // ── 대본 검증 ──
    if (!userInputScript.trim()) {
        errors.push('대본이 비어있습니다.');
    }

    // ── scenarioAnalysis 검증 ──
    if (!scenarioAnalysis.genre) errors.push('scenarioAnalysis.genre 누락');
    if (!scenarioAnalysis.tone) errors.push('scenarioAnalysis.tone 누락');
    if (!scenarioAnalysis.threeActStructure) errors.push('scenarioAnalysis.threeActStructure 누락');
    if (!Array.isArray(scenarioAnalysis.emotionalArc)) errors.push('scenarioAnalysis.emotionalArc 누락 (배열이어야 함)');
    if (!Array.isArray(scenarioAnalysis.locations) || scenarioAnalysis.locations.length === 0) {
        errors.push('scenarioAnalysis.locations 누락 또는 빈 배열');
    }

    // emotionalArc 길이 = 대본 줄 수 검증
    if (userInputScript.trim() && Array.isArray(scenarioAnalysis.emotionalArc)) {
        const lineCount = userInputScript.split('\n').filter(l => l.trim()).length;
        const arcLength = scenarioAnalysis.emotionalArc.length;
        if (arcLength !== lineCount) {
            warnings.push(`emotionalArc 길이(${arcLength}) ≠ 대본 줄 수(${lineCount})`);
        }
    }

    // ── Phase 5-e: sceneLayers / outfitSessions 검증 ──
    const sceneLayers = scenarioAnalysis.sceneLayers || [];
    const outfitSessions = scenarioAnalysis.outfitSessions || [];
    const hasSessionModel = outfitSessions.length > 0;

    if (sceneLayers.length === 0) {
        warnings.push('sceneLayers가 비어있습니다. "현재" 레이어로 자동 폴백됩니다.');
    } else if (!sceneLayers.some(sl => sl.id === '현재')) {
        warnings.push('sceneLayers에 "현재" 레이어가 없습니다. 기본 레이어로 자동 삽입됩니다.');
    }
    const validLayerIds = new Set(sceneLayers.map(sl => sl.id));
    // Phase 7: scenarioAnalysis.locations는 LocationEntry[]. name만 추출해 Set 구성.
    const locationNames = (scenarioAnalysis.locations || []).map(l => l.name);
    const validLocations = new Set(locationNames);

    for (let i = 0; i < outfitSessions.length; i++) {
        const os = outfitSessions[i];
        if (!validLocations.has(os.location)) {
            errors.push(`outfitSessions[${i}].location="${os.location}"이 locations 배열에 없습니다`);
        }
        if (!validLayerIds.has(os.layerId)) {
            errors.push(`outfitSessions[${i}].layerId="${os.layerId}"이 sceneLayers에 없습니다`);
        }
    }

    // locationVisualDNA 검증 — 신규 "loc::layer" 키 기준
    if (Array.isArray(scenarioAnalysis.locations) && scenarioAnalysis.locationVisualDNA) {
        const dnaKeys = Object.keys(scenarioAnalysis.locationVisualDNA);
        const dnaKeySet = new Set(dnaKeys);
        if (hasSessionModel) {
            for (const os of outfitSessions) {
                const composite = `${os.location}::${os.layerId}`;
                if (!dnaKeySet.has(composite) && !dnaKeySet.has(os.location)) {
                    warnings.push(`locationVisualDNA에 "${composite}" 키 누락 (레거시 "${os.location}"도 없음)`);
                }
            }
        } else {
            // 레거시 프로젝트: location 기준으로 검사
            for (const loc of locationNames) {
                if (!dnaKeySet.has(loc) && !dnaKeySet.has(`${loc}::현재`)) {
                    warnings.push(`locationVisualDNA에 "${loc}" 키 누락`);
                }
            }
        }
    } else if (Array.isArray(scenarioAnalysis.locations) && scenarioAnalysis.locations.length > 0 && !scenarioAnalysis.locationVisualDNA) {
        warnings.push('locationVisualDNA가 없습니다. 배경 묘사가 기본값으로 대체됩니다.');
    }

    // ── characterBibles 검증 ──
    if (!Array.isArray(characterBibles) || characterBibles.length === 0) {
        errors.push('characterBibles가 비어있습니다.');
    } else {
        const expectedSessionKeys = hasSessionModel
            ? outfitSessions.map(os => `${os.location}::${os.layerId}`)
            : locationNames;
        for (let i = 0; i < characterBibles.length; i++) {
            const b = characterBibles[i];
            const prefix = `characterBibles[${i}]`;
            if (!b.koreanName) errors.push(`${prefix}.koreanName 누락`);
            if (!b.baseAppearance) errors.push(`${prefix}.baseAppearance 누락`);
            if (b.gender !== 'male' && b.gender !== 'female') errors.push(`${prefix}.gender은 "male" 또는 "female"이어야 합니다`);
            if (!b.personalityProfile?.core) warnings.push(`${prefix}.personalityProfile.core 누락`);
            if (!b.personalityProfile?.behaviorPatterns) warnings.push(`${prefix}.personalityProfile.behaviorPatterns 누락`);

            // outfitRecommendations 커버리지 — 신규: outfitSessions 기준 / 레거시: locations 기준
            if (expectedSessionKeys.length > 0 && b.outfitRecommendations) {
                const outfitKeys = new Set(Object.keys(b.outfitRecommendations));
                for (const expected of expectedSessionKeys) {
                    const legacyFallback = expected.includes('::') ? expected.split('::')[0] : expected;
                    if (!outfitKeys.has(expected) && !outfitKeys.has(legacyFallback)) {
                        warnings.push(`${prefix}(${b.koreanName})의 outfitRecommendations에 "${expected}" 의상 누락`);
                    }
                }
            }
        }
    }

    // ── enrichedBeats 검증 ── (narration 경로에서만 생성됨. MSF/USS는 이 블록 스킵)
    if (enrichedBeats !== undefined) {
        if (!Array.isArray(enrichedBeats) || enrichedBeats.length === 0) {
            errors.push('enrichedBeats가 비어있습니다.');
        } else {
            const validTypes = new Set(['narration', 'insert', 'reaction']);
            for (let i = 0; i < enrichedBeats.length; i++) {
                const beat = enrichedBeats[i];
                const prefix = `enrichedBeats[${i}]`;
                if (!beat.text) errors.push(`${prefix}.text 누락`);
                if (!validTypes.has(beat.type)) errors.push(`${prefix}.type="${beat.type}"은 narration/insert/reaction 중 하나여야 합니다`);
                if (!beat.beat) warnings.push(`${prefix}.beat 누락`);
                if (!beat.emotion) warnings.push(`${prefix}.emotion 누락`);
                if (!beat.direction) warnings.push(`${prefix}.direction 누락`);
            }

            // id 연속성 검증
            const ids = enrichedBeats.map(b => b.id);
            const isSequential = ids.every((id, idx) => id === idx + 1);
            if (!isSequential) {
                warnings.push('enrichedBeats id가 1부터 연속이 아닙니다. 자동 보정됩니다.');
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
