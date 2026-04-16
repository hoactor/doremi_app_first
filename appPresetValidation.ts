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
    enrichedBeats: EnrichedBeat[],
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

    // locationVisualDNA ↔ locations 키 일치
    if (Array.isArray(scenarioAnalysis.locations) && scenarioAnalysis.locationVisualDNA) {
        const dnaKeys = Object.keys(scenarioAnalysis.locationVisualDNA);
        for (const loc of scenarioAnalysis.locations) {
            if (!dnaKeys.includes(loc)) {
                warnings.push(`locationVisualDNA에 "${loc}" 키 누락`);
            }
        }
    } else if (Array.isArray(scenarioAnalysis.locations) && scenarioAnalysis.locations.length > 0 && !scenarioAnalysis.locationVisualDNA) {
        warnings.push('locationVisualDNA가 없습니다. 배경 묘사가 기본값으로 대체됩니다.');
    }

    // ── characterBibles 검증 ──
    if (!Array.isArray(characterBibles) || characterBibles.length === 0) {
        errors.push('characterBibles가 비어있습니다.');
    } else {
        for (let i = 0; i < characterBibles.length; i++) {
            const b = characterBibles[i];
            const prefix = `characterBibles[${i}]`;
            if (!b.koreanName) errors.push(`${prefix}.koreanName 누락`);
            if (!b.baseAppearance) errors.push(`${prefix}.baseAppearance 누락`);
            if (b.gender !== 'male' && b.gender !== 'female') errors.push(`${prefix}.gender은 "male" 또는 "female"이어야 합니다`);
            if (!b.personalityProfile?.core) warnings.push(`${prefix}.personalityProfile.core 누락`);
            if (!b.personalityProfile?.behaviorPatterns) warnings.push(`${prefix}.personalityProfile.behaviorPatterns 누락`);

            // outfitRecommendations ↔ locations 키 일치
            if (Array.isArray(scenarioAnalysis.locations) && b.outfitRecommendations) {
                const outfitKeys = Object.keys(b.outfitRecommendations);
                for (const loc of scenarioAnalysis.locations) {
                    if (!outfitKeys.includes(loc)) {
                        warnings.push(`${prefix}(${b.koreanName})의 outfitRecommendations에 "${loc}" 의상 누락`);
                    }
                }
            }
        }
    }

    // ── enrichedBeats 검증 ──
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

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
