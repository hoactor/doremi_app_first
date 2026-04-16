// appSafetySanitize.ts — 이미지 프롬프트 안전 필터 대응 (런타임 안전망)
// buildFinalPrompt / buildFluxPromptSmart 출력에 적용
// appStyleEngine.ts는 수정하지 않음 — 이 함수를 호출하는 쪽에서 적용

/**
 * 아동 장면 안전 필터 트리거 패턴을 감지하고 완화된 표현으로 치환
 * Gemini/Flux 안전 필터가 거부하는 "child + distress" 조합을 방지
 */
export function sanitizeChildSafety(prompt: string): string {
    // 아동 관련 키워드가 없으면 빠르게 통과
    const CHILD_INDICATORS = /\b(child|kid|toddler|infant|baby|little boy|little girl|small child|young child|아이|어린이|유아|아기|어린 아이|꼬마)\b/i;
    if (!CHILD_INDICATORS.test(prompt)) return prompt;

    let result = prompt;
    let modified = false;

    // === 위험 조합 패턴 → 완화된 표현으로 치환 ===

    const REPLACEMENTS: [RegExp, string][] = [
        // crying/tears 계열
        [/\bcrying\b/gi, 'with pouting lip and scrunched face'],
        [/\bsobbing\b/gi, 'sniffling with scrunched face'],
        [/\bweeping\b/gi, 'with eyes welling up'],
        [/\btears streaming\b/gi, 'eyes glistening'],
        [/\btears rolling\b/gi, 'eyes glistening'],
        [/\btear-?stained\b/gi, 'flushed cheeks'],
        [/\bin tears\b/gi, 'with misty eyes'],

        // hurt/injury 계열
        [/\bbleeding\b/gi, 'with band-aid'],
        [/\bblood\b/gi, 'dirt smudge'],
        [/\bwound(ed)?\b/gi, 'bandaged'],
        [/\bbruis(e|ed|ing)\b/gi, 'with small band-aid'],
        [/\binjur(ed|y|ies)\b/gi, 'dusting off clothes'],
        [/\bhurt\b/gi, 'holding knee'],
        [/\bin pain\b/gi, 'rubbing elbow'],
        [/\bscratch(ed|es)?\b/gi, 'with small band-aid'],

        // fear/distress 계열 (아동 컨텍스트에서만)
        [/\bterrified\b/gi, 'wide-eyed'],
        [/\bscreaming\b/gi, 'with wide open mouth'],
        [/\babandoned\b/gi, 'waiting'],
        [/\blost and (scared|alone)\b/gi, 'looking around curiously'],

        // "alone" + 부정 감정 조합
        [/\balone\s+(and\s+)?(crying|scared|terrified|frightened)\b/gi, 'sitting quietly, looking around'],
        [/\b(crying|scared)\s+(and\s+)?alone\b/gi, 'sitting on steps, holding stuffed animal'],
    ];

    for (const [pattern, replacement] of REPLACEMENTS) {
        if (pattern.test(result)) {
            result = result.replace(pattern, replacement);
            modified = true;
        }
    }

    // === 위험 조합 감지 경고 (치환 후에도 남아있으면) ===
    const DANGER_COMBOS = [
        /\b(child|kid|little boy|little girl|small child|young child)\b.{0,30}\b(crying|hurt|bleeding|injured|terrified|screaming)\b/i,
        /\b(crying|hurt|bleeding|injured)\b.{0,30}\b(child|kid|little boy|little girl|small child|young child)\b/i,
    ];

    for (const combo of DANGER_COMBOS) {
        if (combo.test(result)) {
            console.warn('[SafetySanitize] ⚠️ 아동+고통 위험 조합 잔존 — 추가 완화 적용');
            // 최후의 수단: 위험 키워드 단순 제거
            result = result
                .replace(/\bcrying\b/gi, '')
                .replace(/\bhurt\b/gi, '')
                .replace(/\bbleeding\b/gi, '')
                .replace(/\binjured\b/gi, '')
                .replace(/\bterrified\b/gi, '')
                .replace(/\bscreaming\b/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            modified = true;
        }
    }

    if (modified) {
        console.log('[SafetySanitize] 아동 장면 안전 필터 완화 적용됨');
    }

    return result;
}
