// services/ai/contextModeAnalysis.ts — Phase A.6: Context 모드 씬 디자인 분석
// 영상 감독 페르소나로 outfitSession을 ContextSceneDesign으로 변환.
// USS 트랙 + Context+OpenAI 모드 전용. Legacy 트랙 무관.

import { callClaude, callClaudeStream } from '../claudeService';
import { buildSessionKey } from '../../appUtils';
import type {
    OutfitSession, SceneVisualAnalysis,
    CharacterDescription, ContextSceneDesign,
    SceneLayer,
} from '../../types';

export interface AnalyzeForContextModeOptions {
    /** 분석 대상 outfitSession 배열. 전체 분석은 전체, 배치별은 1개. */
    targetSessions: OutfitSession[];
    /** 원본 대본 (라인 컨텍스트) */
    script: string;
    /** Phase A.5 visualAnalysis (있으면 활용) */
    visualAnalysis?: SceneVisualAnalysis[];
    /** 등장 인물 정보 */
    characterDescriptions: { [key: string]: CharacterDescription };
    /** scenarioAnalysis.sceneLayers */
    sceneLayers?: SceneLayer[];
    /** 진행률 콜백 */
    onProgress?: (current: number, total: number, message: string) => void;
}

const SYSTEM_PROMPT = `You are a Korean webtoon/animation director designing multi-cut scenes from a script.

Each "scene" corresponds to one outfitSession (a continuous time/space moment with consistent character outfits).

For each scene, you must design:
1. A scene narrative (how the scene unfolds visually)
2. Camera intent (how cameras vary within the scene)
3. Mood arc (emotional progression within the scene)
4. Key visual moments (3-5 standout beats)
5. Recommended cut count (1-8 cuts based on scene complexity)
6. Planned cuts:
   - Cut 1: ALWAYS the "anchor" — defines the scene's character/space/lighting
   - Cuts 2~N: "follow" cuts — show progression with camera/action/emotion variation

Design principles:
- Cuts 1-3 (short scene): single moment with subtle variation. Only if really brief.
- Cuts 4-5 (typical scene): full emotional arc with camera diversity.
- Cuts 6-8 (climactic scene): rich sequence — only for emotional climax or detailed action.

Camera diversity:
- Each cut MUST have a different camera angle/distance from the previous.
- Example sequence: medium establishing → close-up emotional → over-shoulder → wide reveal → detail shot.
- Avoid: 5 identical front-facing close-ups (this is what we're moving away from).

Action progression:
- Anchor cut: define the scene as a representative still image.
- Follow cuts: show MOMENT progression — what happens next.
  - Time progression within minutes (not days/years).
  - Subtle action changes (raising hand, turning head, leaning forward).
  - Emotional intensification (calm → tension → release).

TIME LAYER AWARENESS (critical when scenes span flashbacks or different eras):
- Each outfitSession belongs to a sceneLayer (provided in input "sceneLayers" array).
  Match by sourceSession.layerId.
- If the matching sceneLayer has isFlashback === true: this scene is set in the PAST.
  - Character ages, outfits, hairstyles, and ambient lighting must reflect that era.
  - Mention the time layer EXPLICITLY in sceneNarrative
    (e.g., "Set in the protagonist's youth, ~20 years before the present" or
    "A flashback to childhood — the character appears younger").
  - Mention age/era cues in plannedCuts.momentDescription when visually relevant.
- If isImagined === true: this scene is a dream/fantasy/imagined sequence.
  - Reflect that in sceneNarrative ("In a dream...", "In an imagined scenario...").
- If toneModifier is set (e.g., "warm-vintage", "sepia"): the user has marked
  a visual tone for this layer. Reinforce that mood in moodArc.
- Character variants (provided per character in "characters[].variants"):
  - If a character has a variant where appliedToLayerId === this scene's layerId,
    that variant defines the character's appearance in this scene
    (different age, era-appropriate outfit, hairstyle, etc.).
  - In plannedCuts, when describing the character, IMPLICITLY assume the variant's
    age/era — do NOT contradict it (e.g., do not call a "young version" character
    "elderly" in momentDescription).
- Default: if no flashback/imagined/variant applies, treat as the present-day
  scene with the character's base appearance.

Output schema (JSON only, no markdown fences, no commentary):
{
  "designs": [
    {
      "sessionKey": "거실::현재::5-9",
      "sourceSession": { "location": "거실", "layerId": "현재", "lineRange": [5, 9] },
      "sceneNarrative": "ENGLISH narrative of the scene...",
      "cameraIntent": "ENGLISH camera diversity guidance...",
      "moodArc": "ENGLISH emotional arc...",
      "keyMoments": ["ENGLISH moment 1", "ENGLISH moment 2"],
      "recommendedCutCount": 5,
      "plannedCuts": [
        {
          "cutIndex": 1,
          "role": "anchor",
          "momentDescription": "ENGLISH visual moment...",
          "cameraNote": "ENGLISH shot description...",
          "actionDelta": "(anchor — defines the scene)",
          "moodPoint": "ENGLISH mood at this point"
        },
        {
          "cutIndex": 2,
          "role": "follow",
          "momentDescription": "...",
          "cameraNote": "...",
          "actionDelta": "ENGLISH change from previous cut",
          "moodPoint": "..."
        }
      ]
    }
  ]
}`;

function buildUserMessage(opts: AnalyzeForContextModeOptions): string {
    const { targetSessions, script, visualAnalysis, characterDescriptions, sceneLayers } = opts;

    const layersInfo = (sceneLayers || []).map(l => ({
        id: l.id,
        label: l.label,
        isFlashback: !!l.isFlashback,
        isImagined: !!l.isImagined,
        toneModifier: l.toneModifier,
    }));

    const charactersInfo = Object.entries(characterDescriptions).map(([key, c]) => ({
        key,
        koreanName: c.koreanName,
        canonicalName: c.canonicalName,
        baseAppearance: c.baseAppearance,
        // Phase A.6 + 시점 인식: variant 외형 (어린 시절/노년 등) — Claude가 sceneLayer 매칭에 사용
        variants: (c.variants || []).map(v => ({
            label: v.label,
            appliedToLayerId: v.appliedToLayerId,
            baseAppearance: v.baseAppearance,
        })),
    }));

    const targets = targetSessions.map(s => ({
        sessionKey: buildSessionKey(s),
        location: s.location,
        layerId: s.layerId,
        lineRange: s.lineRange,
        userLabel: s.userLabel,
        userNote: s.userNote,
    }));

    return JSON.stringify({
        script,
        sceneLayers: layersInfo,
        characters: charactersInfo,
        visualAnalysis: visualAnalysis || [],
        targetSessions: targets,
    }, null, 2);
}

export async function analyzeForContextMode(
    opts: AnalyzeForContextModeOptions,
): Promise<{ designs: ContextSceneDesign[]; tokenCount: number }> {
    if (opts.targetSessions.length === 0) {
        return { designs: [], tokenCount: 0 };
    }

    const userMessage = buildUserMessage(opts);
    opts.onProgress?.(0, 1, 'Claude 분석 호출 중...');

    let response;
    try {
        response = await callClaudeStream(
            SYSTEM_PROMPT,
            userMessage,
            (len: number) => opts.onProgress?.(0, 1, `분석 중... ${len.toLocaleString()}자`),
            { temperature: 0.7, maxTokens: 32000 },
        );
    } catch (e) {
        console.warn('[analyzeForContextMode] stream 실패, callClaude로 폴백:', e);
        response = await callClaude(SYSTEM_PROMPT, userMessage, { temperature: 0.7, maxTokens: 32000 });
    }

    let parsed: { designs: any[] } = { designs: [] };
    try {
        const cleaned = response.text.trim()
            .replace(/^```json\s*/i, '')
            .replace(/```\s*$/i, '');
        parsed = JSON.parse(cleaned);
    } catch (e) {
        console.error('[analyzeForContextMode] JSON parse 실패:', e, response.text.slice(0, 500));
        return { designs: [], tokenCount: response.totalTokens };
    }

    const validDesigns: ContextSceneDesign[] = (parsed.designs || [])
        .filter(d => d && d.sessionKey && d.sourceSession && Array.isArray(d.plannedCuts) && d.plannedCuts.length > 0)
        .map(d => {
            const cutCount = d.recommendedCutCount || d.plannedCuts.length;
            return {
                sessionKey: d.sessionKey,
                sourceSession: d.sourceSession,
                sceneNarrative: d.sceneNarrative || '',
                cameraIntent: d.cameraIntent || '',
                moodArc: d.moodArc || '',
                keyMoments: Array.isArray(d.keyMoments) ? d.keyMoments : [],
                recommendedCutCount: cutCount,
                targetCutCount: cutCount,
                plannedCuts: d.plannedCuts,
                analyzedAt: new Date().toISOString(),
                isStale: false,
            };
        });

    opts.onProgress?.(1, 1, `${validDesigns.length}개 씬 분석 완료`);
    return { designs: validDesigns, tokenCount: response.totalTokens };
}
