// services/ai/ussAnalysis.ts — USS (Universal Script Schema) 분석
// Call 1: 대본 → 구조 분석 (meta + characters + locations + 막 구분)
// Call 2~N: 나레이션 배치 → 컷 변환
// ussToAppData: USS → 기존 앱 데이터 구조 매핑 (AI 불필요)

import { callClaude } from '../claudeService';
import { inferLocationCategory } from '../../appUtils';
import { generateOutfitsForLocations } from './textAnalysis';
import type {
    UniversalScriptSchema, USSCharacter, USSLocation, USSCut,
    ContiCut, CharacterBible, ScenarioAnalysis, CharacterDescription,
    BehaviorPatterns, CutType, SceneVisualAnalysis, SceneLayer,
} from '../../types';

// ═══════════════════════════════════════════════════════════════════
// Call 1: 구조 분석 — meta + characters + locations + actBoundaries
// ═══════════════════════════════════════════════════════════════════

const STRUCTURE_SYSTEM_PROMPT = `You are a professional storyboard director for Korean YouTube Shorts (썰쇼츠).

Your task: Analyze the given Korean narration script and extract its STRUCTURE.
Do NOT split into cuts yet. Focus on:

1. **meta**: Genre, tone, color mood, pacing, and act boundaries.
   - actBoundaries: Identify WHERE in the script each act ends (by line number).
     - setupEndLine: The line number where Act 1 (setup/introduction) ends
     - confrontationEndLine: The line number where Act 2 (conflict/confrontation) ends
     - Act 3 (resolution) runs from confrontationEndLine+1 to the end
   - Provide a short Korean description of each act's content

2. **characters**: Extract ALL characters mentioned or implied.
   - name: Korean name exactly as written in the script
   - canonicalName: English romanized name for this character (e.g., "Juli", "Minho"). This becomes the UNIQUE internal key for all subsequent image prompts.
   - aliases: Array of ALL Korean references to this character in the script (e.g., ["줄리", "딸", "아이", "애기"]). MUST include the name itself. Scan the entire script thoroughly.
   - isSpeaker: Set to true for the protagonist/narrator (the character whose 1st-person perspective drives the narration). Exactly ONE character should have isSpeaker=true. If the script has no proper name for the speaker, use canonicalName="Speaker" and name="나".
   - gender: male/female
   - hair: English hair description ONLY — length, color (include hex code), style, texture, bangs, accessories. Example: "shoulder-length light brown (#B8956A) bob with wavy texture and side-swept bangs, small pink hair clip on right side"
   - face: English face description ONLY — bone structure, eye shape/color, nose, lips, skin tone, distinguishing marks. Example: "soft oval face, large expressive brown eyes, small nose, fair skin with rosy cheeks"
   - body: English body type (optional) — height, build, posture. Example: "average height, slim build, tends to slouch"
   - appearance: Combined summary (for backward compatibility)
   - personality: Korean personality summary
   - defaultOutfit: English DEFAULT outfit — clothes ONLY, NO hair or face details
   - outfitByLocation: object mapping EACH location name → specific outfit for that place. Include HEX color codes. Every location MUST have an entry. Example:
     {"화자의 아파트": "cream knit sweater #F5E6D3 with loose fit, dark navy jogger pants #1B2838", "회사 사무실": "fitted charcoal blazer #36454F over white dress shirt #FFFFFF, navy slacks #1B2838"}
   - behaviorPatterns: optional emotion-behavior mapping

   CRITICAL: hair/face/outfit must be COMPLETELY SEPARATE.
   - hair field: NEVER include clothing. NEVER include face details.
   - face field: NEVER include hair. NEVER include clothing.
   - defaultOutfit/outfitByLocation: NEVER include hair or face descriptions. Clothes ONLY with HEX colors.
   - Each location outfit must be SPECIFIC and DIFFERENT — do NOT copy-paste the same outfit for every location.

3. **locations**: Extract ALL locations/places.
   - name: Korean location name
   - visual: English visual description — interior details, props, lighting, atmosphere
   - ★ CRITICAL: If the story has DIFFERENT physical spaces within the same building (e.g., bedroom, kitchen, entrance, rooftop), list them as SEPARATE locations.
   - Example: Instead of just "집", extract "여주 방", "여주 집 주방", "여주 집 현관", "여주 집 거실" as separate entries.
   - Example: Instead of just "병원", extract "병원 신생아실", "병원 복도", "병원 휴게실" as separate entries.
   - Reason: Image AI generates backgrounds from location names. Same location name = same background for every scene.
   - MINIMUM: If any character lives in a house/apartment, extract at least 2-3 sub-locations (방/거실/현관 등).

4. **sceneLayers**: Extract distinct narrative time/perspective layers.
   Each layer represents a separate timeline or mental state in the script.
   - id: short Korean identifier (e.g., "현재", "어린시절_과거", "10년전_과거", "상상_미래", "꿈")
   - label: Korean UI label (same as id or shorter)
   - timeDelta: optional Korean time hint ("과거 10년", "내일", "5년 후", "어린시절")
   - isFlashback: true if this layer is past memory/recall
   - isImagined: true if this layer is dream/imagination/hypothetical
   - toneModifier: visual tone hint
     - 'none' for present time (default)
     - 'warm-vintage' or 'sepia' for flashback/childhood
     - 'dream-blur' or 'soft-focus' for imagined/dream
     - 'cool-blue' for distant/melancholic memories
   ★ ALWAYS include the "현재" layer first (id="현재", label="현재", toneModifier="none"),
     even if the script seems entirely present-tense. This is the default anchor.
   ★ DETECT flashback markers: "어린시절", "옛날", "그때", "10년 전", "과거에", "어렸을 때",
     "어머니가 살아계실 때", verbs in past-perfect tense suggesting deep recall.
     → Create a separate flashback layer with isFlashback=true.
   ★ DETECT imagined markers: "만약", "상상해보니", "꿈에서", "~한다고 생각하면",
     "혹시 ~라면". → Create separate imagined layer with isImagined=true.
   ★ For most casual stories, 1~2 layers is enough. Only add a layer if the script
     explicitly transitions to that timeline.

## OUTPUT: Valid JSON only. No explanation, no markdown fences.
{
  "meta": {
    "title": "",
    "genre": "",
    "tone": "",
    "colorMood": "",
    "pacing": "",
    "actBoundaries": {
      "setupEndLine": 0,
      "setupDescription": "",
      "confrontationEndLine": 0,
      "confrontationDescription": "",
      "resolutionDescription": ""
    }
  },
  "characters": [{"name":"","canonicalName":"","aliases":[],"isSpeaker":false,"gender":"","hair":"","face":"","body":"","appearance":"","personality":"","defaultOutfit":"","outfitByLocation":{}}],
  "locations": [{"name":"","visual":""}],
  "sceneLayers": [{"id":"현재","label":"현재","timeDelta":"","isFlashback":false,"isImagined":false,"toneModifier":"none"}]
}`;

export async function analyzeUSSStructure(
    script: string,
    logline?: string,
    storyBrief?: string,
    speakerGender?: 'male' | 'female',
): Promise<{ structure: Omit<UniversalScriptSchema, 'cuts'> & { cuts?: undefined }; tokenCount: number }> {
    const lines = script.split('\n').filter(l => l.trim());
    const numberedScript = lines.map((l, i) => `[${i + 1}] ${l}`).join('\n');

    const speakerGenderInstruction = speakerGender
        ? `\n[필수] 화자(나레이터) 성별: ${speakerGender}. 이 대본의 1인칭 화자("나", "내")는 반드시 ${speakerGender === 'male' ? '남성(male)' : '여성(female)'}이다. 대본 내용이 모호하더라도 화자의 gender는 반드시 "${speakerGender}"로 설정하라.\n`
        : '';
    const userMessage = `${storyBrief ? `[작품해설서]\n${storyBrief}\n\n` : ''}${logline ? `[로그라인] ${logline}\n\n` : ''}${speakerGenderInstruction}[대본 — ${lines.length}줄]\n${numberedScript}`;

    const result = await callClaude(STRUCTURE_SYSTEM_PROMPT, userMessage, {
        temperature: 0.3,
        // ★ 캐릭터·장소 많은 대본에서 응답 중간 잘림 방지 (구조 분석은 output 크기 상당).
        // 4000 → 16000 (narration Step 1의 32768과 일치시키지는 않되, 충분한 마진).
        maxTokens: 16000,
    });

    let parsed: any;
    try {
        const cleaned = result.text
            .replace(/```json\s*/g, '').replace(/```\s*/g, '')
            .trim();
        parsed = JSON.parse(cleaned);
    } catch (e) {
        throw new Error(`USS 구조 분석 JSON 파싱 실패: ${(e as Error).message}`);
    }

    // 기본값 채우기
    if (!parsed.meta) parsed.meta = {};
    if (!parsed.meta.actBoundaries) {
        const totalLines = lines.length;
        parsed.meta.actBoundaries = {
            setupEndLine: Math.floor(totalLines / 3),
            setupDescription: '도입',
            confrontationEndLine: Math.floor(totalLines * 2 / 3),
            confrontationDescription: '갈등',
            resolutionDescription: '해결',
        };
    }
    if (!parsed.characters) parsed.characters = [];
    if (!parsed.locations) parsed.locations = [];
    const locationNames = parsed.locations.map((l: any) => l.name);

    // hair/face 폴백
    for (const c of parsed.characters) {
        if (!c.hair) c.hair = '';
        if (!c.face && c.appearance) c.face = 'Match facial visage exactly';
        if (!c.body) c.body = '';
        if (!c.outfitByLocation || typeof c.outfitByLocation !== 'object') {
            c.outfitByLocation = {};
        }
    }

    // ===== outfitByLocation 자동 LLM 보강 =====
    // LLM이 단일 호출에서 5명 × N장소 detailed outfit을 회피하는 경향이 있음.
    // 누락된 (캐릭터, 장소) 페어를 generateOutfitsForLocations로 캐릭터별 일괄 생성.
    let outfitTokens = 0;
    type MissingPair = { character: any; locations: string[] };
    const missingPairs: MissingPair[] = [];
    for (const c of parsed.characters) {
        const empty = locationNames.filter((loc: string) =>
            !c.outfitByLocation[loc] || typeof c.outfitByLocation[loc] !== 'string' || !c.outfitByLocation[loc].trim()
        );
        if (empty.length > 0) missingPairs.push({ character: c, locations: empty });
    }

    if (missingPairs.length > 0 && locationNames.length > 0) {
        const totalPairs = missingPairs.reduce((s, p) => s + p.locations.length, 0);
        console.log(`[USS] outfitByLocation 자동 보강 시작: ${missingPairs.length}명, 총 ${totalPairs}개 페어`);

        // 직렬 호출 — Claude rate limit 회피, 캐릭터당 1회
        for (const pair of missingPairs) {
            const c = pair.character;
            try {
                const { locationOutfits, tokenCount } = await generateOutfitsForLocations(
                    c.name,
                    c.gender || 'female',
                    c.defaultOutfit || 'standard casual outfit',
                    pair.locations,
                );
                outfitTokens += tokenCount || 0;
                let filled = 0;
                for (const [loc, outfit] of Object.entries(locationOutfits || {})) {
                    if (outfit && typeof outfit === 'string' && outfit.trim()) {
                        c.outfitByLocation[loc] = outfit;
                        filled++;
                    }
                }
                console.log(`[USS] '${c.name}' outfit 보강 완료: ${filled}/${pair.locations.length}개 채움`);
            } catch (e: any) {
                console.warn(`[USS] '${c.name}' outfit 보강 실패 (defaultOutfit 폴백 적용): ${e?.message || e}`);
            }
        }
    }

    // 최종 폴백 — LLM 보강 실패한 페어는 defaultOutfit으로
    for (const c of parsed.characters) {
        for (const locName of locationNames) {
            if (!c.outfitByLocation[locName] || !c.outfitByLocation[locName].trim()) {
                c.outfitByLocation[locName] = c.defaultOutfit || 'standard casual outfit';
                console.warn(`[USS-FALLBACK] outfit 최종 폴백: ${c.name} → ${locName} = defaultOutfit`);
            }
        }
    }

    // ===== Speaker Presence — 자동 보정 =====
    // (1) speakerGender 정합 검증 — 사용자 지정 성별과 isSpeaker 캐릭터 gender 불일치 시 강제 보정
    const speakerChar = parsed.characters.find((c: any) => c.isSpeaker === true);
    if (speakerGender && speakerChar && speakerChar.gender !== speakerGender) {
        console.warn(
            `[USS-FALLBACK] isSpeaker(${speakerChar.name}) gender 불일치 ` +
            `→ 강제 보정: ${speakerChar.gender} → ${speakerGender}`
        );
        speakerChar.gender = speakerGender;
    }

    // (2) isSpeaker 누락 시 fallback — 첫 캐릭터를 화자로 자동 지정
    if (!speakerChar && parsed.characters.length > 0) {
        parsed.characters[0].isSpeaker = true;
        console.warn(
            `[USS-FALLBACK] isSpeaker 누락 → 첫 캐릭터(${parsed.characters[0].name})로 자동 지정`
        );
    }

    // ===== sceneLayers — 자동 보정 =====
    // (1) 누락 시 "현재" 단일 레이어로 폴백
    if (!Array.isArray(parsed.sceneLayers) || parsed.sceneLayers.length === 0) {
        parsed.sceneLayers = [{ id: '현재', label: '현재', toneModifier: 'none' }];
        console.warn('[USS-FALLBACK] sceneLayers 누락 → "현재" 단일 레이어로 자동 폴백');
    }
    // (2) "현재" 레이어가 없으면 맨 앞에 자동 삽입 (다른 레이어와 함께 있어야 함)
    if (!parsed.sceneLayers.some((sl: any) => sl.id === '현재')) {
        parsed.sceneLayers.unshift({ id: '현재', label: '현재', toneModifier: 'none' });
        console.warn('[USS-FALLBACK] "현재" 레이어 누락 → 맨 앞에 자동 삽입');
    }
    // (3) 각 레이어 필드 기본값 보장
    parsed.sceneLayers = parsed.sceneLayers.map((sl: any) => ({
        id: String(sl.id || '현재'),
        label: String(sl.label || sl.id || '현재'),
        timeDelta: sl.timeDelta ? String(sl.timeDelta) : undefined,
        isFlashback: !!sl.isFlashback,
        isImagined: !!sl.isImagined,
        toneModifier: sl.toneModifier || (sl.isFlashback ? 'warm-vintage' : sl.isImagined ? 'dream-blur' : 'none'),
        customToneText: sl.customToneText ? String(sl.customToneText) : undefined,
    }));

    const outfitNote = outfitTokens > 0 ? `, outfit 보강 ${outfitTokens.toLocaleString()} tokens` : '';
    const layerNote = parsed.sceneLayers.length > 1 ? `, ${parsed.sceneLayers.length}개 sceneLayer` : '';
    console.log(`[USS] 구조 분석 완료: ${parsed.characters.length}명, ${parsed.locations.length}장소${layerNote}, 막구분 1→${parsed.meta.actBoundaries.setupEndLine}/${parsed.meta.actBoundaries.confrontationEndLine}/${lines.length}${outfitNote}`);
    return { structure: parsed, tokenCount: (result.totalTokens || 0) + outfitTokens };
}

// ═══════════════════════════════════════════════════════════════════
// Call 2~N: 나레이션 배치 → 컷 변환
// ═══════════════════════════════════════════════════════════════════

const CUTS_SYSTEM_PROMPT = `You are TWO people working on a Korean YouTube Shorts (썰쇼츠) production.

# ROLE 1: 연출 감독 (Director)
You break the narration into cuts. You decide WHAT each cut shows and WHY.
Your job: every single cut must make the viewer FEEL something — even without reading the narration text.

# ROLE 2: 스토리보드 작가 (Storyboard Artist)
The director hands you the cuts. You fill in the action and pose.
Your job: draw each cut so that someone who CANNOT READ would still understand
what emotion is happening, what the relationship between characters is,
and what just happened or is about to happen.

# THE AUDIENCE — 20~30대 한국 남성, 60초 유튜브 쇼츠
They must feel:
- 여자 캐릭터에게 → 애정. "이런 여자 어디 없나..." 설렘과 집착 사이의 매력.
- 남자 캐릭터에게 → 감정이입. "아 나도 저래ㅋㅋ" 자기 자신을 보는 느낌.
If neither happens in a cut, that cut is wasted screen time.

# WHEN YOU FAIL
- 시청자가 이미지만 보고 스와이프(넘기기)하면 — 실패.
- 시청자가 캐릭터 사이의 긴장/설렘/갈등을 느끼지 못하면 — 실패.
- 첫 3컷 안에 "뭐지? 왜?" 궁금증이 안 생기면 — 실패.
- 마지막 5컷에서 "좋아요 누르고 싶다"는 감정이 안 오면 — 실패.

# DIRECTOR'S RULES
1. One narration line → 1~3 cuts. Split when the emotion CHANGES or a new person REACTS.
2. For dialogue: always show the LISTENER's reaction too. The listener's face is often more interesting than the speaker.
3. 시청자가 긴장/설렘/갈등을 계속 느끼게 하라. 연속 컷이 같은 온도면 시청자가 떠난다.
4. 첫 3컷: 가장 궁금한 순간. "왜 저러지?"가 떠올라야 한다.
5. 마지막 5컷: 가장 강한 감정. 시청자가 박수치거나 댓글을 쓰고 싶어야 한다.

# STORYBOARD ARTIST'S RULES
6. action field: You are drawing a SINGLE FROZEN FRAME from the middle of a movement.
   NOT "she drinks coffee" → YES "cup raised halfway to lips, steam curling past her nose, other hand mid-gesture"
   NOT "he is surprised" → YES "body rocking backward in chair, papers flying off desk from the jolt, one hand gripping armrest"
   The viewer must feel the MOTION even though it's a still image.
   Include what hands are doing, what objects are reacting, what's in mid-air.

7. pose field: The body tells the story. A shy person curls inward. An angry person takes up space.
   NOT "standing" → YES "shoulders hunched, arms crossed tight against chest, weight shifted to back foot, chin tucked — making himself small"
   NOT "sitting" → YES "leaned far back with one arm draped over chair back, legs spread wide, chin up — owning the room"
   The pose must match the CHARACTER'S PERSONALITY, not just the situation.

8. VARIETY IS SURVIVAL: If two consecutive cuts have the same body silhouette, the viewer swipes away. Every cut must feel like a DIFFERENT screenshot from an anime — new angle, new weight distribution, new hand position. Repeat a pose and you lose the audience.

9. emotion field: Read the narration carefully. What does this character ACTUALLY feel — not what the words superficially suggest.
   Emotions have TEMPERATURE. Most narration lines are 🟢~🟡. 🔴 is rare — 1~2 times per entire story.
   🟢 10% — 의아, 궁금, 심심, 무심, 평온 (일상적 반응, 대부분의 컷이 여기)
   🟡 40% — 당황, 서운, 신남, 짜증, 민망 (감정이 움직이기 시작)
   🟠 70% — 분노, 감동, 패닉, 설렘, 질투 (감정이 터지는 순간)
   🔴 100% — 절규, 오열, 폭발, 충격, 멘붕 (극한 — 스토리 클라이맥스에만)

   "갑자기 카톡이 왔어" → 🟢 "주인공-궁금(새벽에 웬 카톡?)" NOT "주인공-놀람"
   "배가 아파서 화장실 갔는데" → 🟢 "주인공-귀찮음(또 배탈)" NOT "주인공-고통"
   "남친이 바람을 피웠어" → 🔴 "여주-충격(세상이 무너짐)" THIS is real shock.

   Format: "캐릭터명-감정(맥락)" — the parenthetical context tells the image AI the EXACT temperature.

# LANGUAGE RULE
10. action and pose fields MUST be written in English. The image AI cannot read Korean body descriptions. emotion field stays in Korean. narration field stays in Korean.

# TECHNICAL RULES

11. cutType: "dialogue" | "action" | "reaction" | "insert" | "montage"

12. Characters keep their defaultOutfit unless the story explicitly changes clothes.

13. WHY THIS MATTERS — viewer attention.
    한국 1인칭 썰 콘텐츠에서 시청자는 나레이션을 듣자마자
    "말하는 사람의 얼굴"을 찾는다. 빈 frame은 그 기대를 배신한다.
    시청자가 스와이프하면 실패.
    → 화자가 행위/감정/시선/대사의 주체인 컷에는
       화자가 반드시 frame에 있어야 한다.

14. SPEAKER PRESENCE TRIGGERS
    Speaker is the character marked 'isSpeaker: true' in CHARACTER CONTEXT
    (fallback: the first character listed).
    Speaker MUST appear in 'characters' array when narration contains:
    (a) explicit 1st-person — 나/내가/난/나는/우리/우린
    (b) implicit subject — no pronoun but action/feeling/movement
        e.g., "그러다 대학 갔을 때야", "한참 망설였다", "결국 일어났다"
    (c) dialogue spoken by the speaker
        e.g., "괜찮대"(told), "물어봤지"(asked)

15. ALIAS / RELATIONSHIP MATCHING
    Korean references like 동기/오빠/엄마/그 사람/남친/선배 must be matched
    against each character's 'aliases' array to find the canonicalName.
    NEVER skip a character because the canonical name isn't spelled out.

16. EMPTY characters — ONLY for true environmental inserts.

    ✅ Empty OK (object/landscape IS the subject):
    - "한강이 보였다" — pure landscape
    - "휴대폰이 울렸다" — object close-up, no actor visible
    - "비가 내렸다" — symbolic weather insert

    ❌ Empty NOT OK (include speaker):
    - "한강을 바라봤다" — speaker observes
    - "휴대폰을 들었다" — speaker acts
    - "비를 맞으며 걸었다" — speaker in scene
    - "그러다 대학 갔을 때야" — speaker exists in memory

    Default: when in doubt, include the speaker.
    Empty characters cost viewer connection.

17. cutType vs characters are INDEPENDENT axes.
    cutType = camera/edit purpose (insert/wide/close-up/POV).
    characters = who is visible in frame.
    A POV close-up of speaker's hands is cutType="insert" AND characters=["Speaker"].

18. originLine: The line number this cut came from.

19. location field: Use the EXACT location NAME from the list below. Do NOT put
    visual descriptions here — just the short name (e.g. "주인공의 방", NOT
    "Dark bedroom at 2AM with phone glow..."). Visual details go in the
    locationDetail field only.
    ★ If a scene clearly takes place in a different room/area than the previous
      cut (e.g., moving from bedroom to kitchen), use the appropriate sub-location.
    ★ If the character is OUTSIDE a building (door entrance, front steps), use
      the exterior location name, not the interior one.

20. Use character names and location names EXACTLY as provided. Do NOT invent
    new location names. Every cut's location MUST be one of the names listed in
    LOCATION CONTEXT — no exceptions.
    ★ If CHARACTER CONTEXT uses English canonicalNames (e.g., "Juli", "Minho"),
      the characters array MUST use those English names — NEVER the Korean name.
      Match aliases (rule 15) to the correct canonicalName.

21. sceneLayerId — INHERIT from VISUAL DIRECTOR ANALYSIS.
    Each cut MUST have a sceneLayerId taken from the corresponding scene's lineRange.
    - Look up which scene's lineRange contains this cut's originLine.
    - Use that scene's sceneLayerId verbatim (e.g., "현재", "어린시절_과거").
    - If VISUAL DIRECTOR ANALYSIS is missing or the cut falls outside any lineRange,
      use "현재" as default.
    - Do NOT invent new sceneLayerId values. Use only ids from SCENELAYER CONTEXT.

## CHARACTER CONTEXT:
{CHARACTER_CONTEXT}

## LOCATION CONTEXT:
{LOCATION_CONTEXT}

## SCENELAYER CONTEXT:
{SCENELAYER_CONTEXT}

# PHASE A.5 — NATURAL-LANGUAGE FIELDS (gpt-image-2 트랙)
In addition to the SD-style fields above, ALSO populate these natural-language fields
for each cut. They feed into gpt-image-2 directly. Existing SD fields stay as-is.

★ STRICT LENGTH LIMITS (token budget critical — exceeding these will truncate the JSON):
- sceneNarrative: ENGLISH, max 25 words (1 sentence). Scene + key subject + setting.
- cameraNote: ENGLISH, max 15 words. Shot type + angle + lighting hint.
- moodNote: ENGLISH, max 10 words. Emotional tone only.
- detailsNarrative: ENGLISH, max 20 words (1 sentence). Action flow, not static pose.

Total natural-language budget per cut: ~70 words. DO NOT exceed.

If a "VISUAL DIRECTOR ANALYSIS" block appears in the user message, use it as
context (camera diversity hints, key moments, mood arc) — but it is NOT a strict rule.

## OUTPUT: Valid JSON array only. No explanation, no markdown fences.
[{"narration":"","characters":[],"location":"","action":"","emotion":"","pose":"","cutType":"","originLine":0,"sceneLayerId":"현재","sceneNarrative":"","cameraNote":"","moodNote":"","detailsNarrative":""}]`;

export async function convertNarrationToCutsBatch(
    lines: { lineNum: number; text: string }[],
    characters: USSCharacter[],
    locations: USSLocation[],
    sceneLayers: SceneLayer[] | undefined,
    opts?: { onProgress?: (text: string) => void; storyBrief?: string; visualAnalysis?: SceneVisualAnalysis[] },
): Promise<{ cuts: USSCut[]; tokenCount: number }> {
    const hasCanonical = characters.some(c => c.canonicalName && c.canonicalName !== c.name);
    const hasExplicitSpeaker = characters.some(c => c.isSpeaker === true);
    const charContext = characters.map((c, idx) => {
        const id = hasCanonical ? (c.canonicalName || c.name) : c.name;
        const aliasInfo = (hasCanonical && c.aliases?.length) ? ` [aliases: ${c.aliases.join(', ')}]` : '';
        // SPEAKER 식별: isSpeaker 필드 우선, 누구도 명시 안 됐으면 첫 번째 캐릭터로 fallback
        const isSpeakerChar = c.isSpeaker === true || (idx === 0 && !hasExplicitSpeaker);
        const speakerTag = isSpeakerChar ? ' [SPEAKER / 화자 / 주인공]' : '';
        return `- ${id}${speakerTag} (${c.gender}${hasCanonical ? ', 한국어: ' + c.name : ''}): ${c.appearance} / outfit: ${c.defaultOutfit}${aliasInfo}`;
    }).join('\n');
    const locContext = locations.map(l => `- ${l.name}: ${l.visual}`).join('\n');
    // ★ SCENELAYER CONTEXT — 컷의 sceneLayerId 부여 시 사용 가능한 id 목록
    const layerArr: SceneLayer[] = (sceneLayers && sceneLayers.length > 0)
        ? sceneLayers
        : [{ id: '현재', label: '현재', toneModifier: 'none' }];
    const layerContext = layerArr.map(sl => {
        const flags: string[] = [];
        if (sl.isFlashback) flags.push('flashback');
        if (sl.isImagined) flags.push('imagined');
        const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
        const time = sl.timeDelta ? ` ${sl.timeDelta}` : '';
        return `- ${sl.id}${flagStr}${time}`;
    }).join('\n');

    const systemPrompt = CUTS_SYSTEM_PROMPT
        .replace('{CHARACTER_CONTEXT}', charContext)
        .replace('{LOCATION_CONTEXT}', locContext)
        .replace('{SCENELAYER_CONTEXT}', layerContext);

    const numberedLines = lines.map(l => `[${l.lineNum}] ${l.text}`).join('\n');

    // ★ Phase A.5 v2: visualAnalysis는 user message에 임베드 (시스템 프롬프트 cache hit 유지)
    const visualContext = (opts?.visualAnalysis && opts.visualAnalysis.length > 0)
        ? `\n\n---\nVISUAL DIRECTOR ANALYSIS (use as context, not strict rule):\n${JSON.stringify(opts.visualAnalysis)}\n---\n\n`
        : '';

    const userMessage = `${opts?.storyBrief ? `[작품해설서]\n${opts.storyBrief}\n\n` : ''}${visualContext}다음 ${lines.length}줄의 나레이션을 컷으로 분할하세요:\n\n${numberedLines}`;

    opts?.onProgress?.(`🎬 컷 변환 중... (${lines[0].lineNum}~${lines[lines.length - 1].lineNum}번 줄)`);

    const result = await callClaude(systemPrompt, userMessage, {
        temperature: 0.4,
        // ★ Phase A.5 v3: 60줄+ 대본에서 24K도 부족 (자연어 4필드 × 50컷 = 12K+).
        //    Opus 32K 한도까지 상향 + 시스템 프롬프트에 길이 제한 명시 + truncation 복구.
        maxTokens: 32000,
    });

    let parsed: USSCut[];
    try {
        const cleaned = result.text
            .replace(/```json\s*/g, '').replace(/```\s*/g, '')
            .trim();
        parsed = JSON.parse(cleaned);
    } catch (e) {
        // ★ Phase A.5 v3: truncation 복구 시도
        // Claude가 토큰 한도에서 문자열 중간에 잘리면 마지막 완전한 객체까지만 살림.
        try {
            const cleaned = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const recovered = recoverTruncatedJsonArray(cleaned);
            if (recovered && recovered.length > 0) {
                console.warn(`[USS] JSON truncation 복구: ${recovered.length}컷 살림 (원본 잘림)`);
                parsed = recovered;
            } else {
                throw e;
            }
        } catch {
            throw new Error(`USS 컷 변환 JSON 파싱 실패 (줄 ${lines[0].lineNum}~${lines[lines.length - 1].lineNum}): ${(e as Error).message}`);
        }
    }

    if (!Array.isArray(parsed)) {
        throw new Error(`USS 컷 변환 결과가 배열이 아닙니다`);
    }

    // 기본값 채우기 + 타입 강제(Claude가 string 필드를 array로 반환하는 케이스 방어)
    const toStr = (v: any): string => {
        if (v == null) return '';
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(' ');
        return String(v);
    };
    for (const cut of parsed) {
        if (!cut.cutType) cut.cutType = 'action';
        if (!Array.isArray(cut.characters)) {
            cut.characters = cut.characters ? [toStr(cut.characters)] : [];
        } else {
            // ★ 배열 내부 원소가 array/object일 수 있음 → 모두 string으로 강제
            cut.characters = cut.characters.map(toStr).filter((s: string) => s.length > 0);
        }
        cut.narration = toStr(cut.narration);
        cut.action = toStr(cut.action);
        cut.emotion = toStr(cut.emotion);
        cut.pose = toStr(cut.pose);
        cut.location = toStr(cut.location);
        if (!cut.originLine) cut.originLine = lines[0].lineNum;
        // ★ sceneLayerId — string 강제 + 미등록 id는 빈 값으로 (후처리에서 직전 컷 상속)
        cut.sceneLayerId = (cut as any).sceneLayerId ? toStr((cut as any).sceneLayerId) : undefined;
        // ★ Phase A.5: 자연어 4필드도 string 강제 (Claude array 반환 방어)
        cut.sceneNarrative = toStr((cut as any).sceneNarrative);
        cut.cameraNote = toStr((cut as any).cameraNote);
        cut.moodNote = toStr((cut as any).moodNote);
        cut.detailsNarrative = toStr((cut as any).detailsNarrative);
    }

    // ===== sceneLayerId — 후처리 안전망 =====
    // 1) 미등록 id → 빈 값으로 정리 (직전 컷 상속 후보)
    // 2) 빈 컷 → 직전 컷의 sceneLayerId 상속
    // 3) 첫 컷이 빈 경우 → "현재" 폴백
    const validLayerIdsForCut = new Set(layerArr.map(sl => sl.id));
    let sceneLayerInheritCount = 0;
    let sceneLayerDefaultCount = 0;
    let prevLayerId: string | undefined = undefined;
    parsed.forEach((cut: any, i: number) => {
        let layerId: string | undefined = cut.sceneLayerId;
        // 미등록 id면 폐기
        if (layerId && !validLayerIdsForCut.has(layerId)) {
            console.warn(`[USS-FALLBACK] cut ${i + 1} sceneLayerId="${layerId}" 미등록 → 폐기 후 직전 컷 상속`);
            layerId = undefined;
        }
        // 비어있으면 직전 컷 상속, 첫 컷이면 "현재"
        if (!layerId) {
            if (prevLayerId) {
                layerId = prevLayerId;
                sceneLayerInheritCount++;
            } else {
                layerId = '현재';
                sceneLayerDefaultCount++;
            }
        }
        cut.sceneLayerId = layerId;
        prevLayerId = layerId;
    });
    if (sceneLayerInheritCount > 0 || sceneLayerDefaultCount > 0) {
        console.warn(
            `[USS-FALLBACK] sceneLayerId 보강: 직전 컷 상속 ${sceneLayerInheritCount}건, ` +
            `"현재" 폴백 ${sceneLayerDefaultCount}건 (전체 ${parsed.length}컷)`
        );
    }

    // ===== Speaker Presence — 후처리 안전망 =====
    // LLM이 새 프롬프트(rule 13~16)를 따르지 못해 빈 characters를 출력하는 케이스 방어.
    // 한국어는 \b가 작동하지 않으므로 [^가-힣] boundary 사용.
    // 1) 명시 1인칭 + 조사 (나/내가/난/나는/나도/나만/우리/우린/우릴/우리가)
    const FIRST_PERSON_EXPLICIT = /(^|[^가-힣])(나|내가|난|나는|나도|나만|우리|우린|우릴|우리가)([은는이가도만의를을과와에게로한테]|\s|[.,!?…"')\]]|$)/;
    // 2) "내 + 공백 + 한글" — 소유격 ("내 친구", "내 동생"). "내일/내년/내성적" 차단
    const POSSESSIVE_NAE = /(^|[^가-힣])내\s+[가-힣]/;
    // 3) "날 + 공백 + 한글" — 목적격 ("날 좋아한대", "날 보더니"). "날씨/날개/날아" 차단
    const OBJECT_NAL = /(^|[^가-힣])날\s+[가-힣]/;

    // 화자 식별: isSpeaker 우선, fallback은 첫 번째 캐릭터
    const speaker = characters.find(c => c.isSpeaker === true) || characters[0];

    if (speaker) {
        const speakerKey = speaker.canonicalName || speaker.name;

        parsed.forEach((cut: any, i: number) => {
            const currentChars = cut.characters || [];
            if (currentChars.length === 0 && cut.narration) {
                const isFirstPerson =
                    FIRST_PERSON_EXPLICIT.test(cut.narration) ||
                    POSSESSIVE_NAE.test(cut.narration) ||
                    OBJECT_NAL.test(cut.narration);

                if (isFirstPerson) {
                    cut.characters = [speakerKey];
                    console.warn(
                        `[USS-FALLBACK] cut ${i + 1} 빈 characters + 1인칭 나레이션 ` +
                        `→ speaker '${speakerKey}' 자동 삽입 ` +
                        `(narration: "${String(cut.narration).slice(0, 30)}...")`
                    );
                }
            }
        });
    }
    // ===== End Speaker Presence 후처리 =====

    return { cuts: parsed, tokenCount: result.totalTokens || 0 };
}

/**
 * 전체 대본을 한번에 컷 변환 (배치 없음 — Claude 200K 컨텍스트 활용)
 */
export async function convertAllNarrationToCuts(
    script: string,
    characters: USSCharacter[],
    locations: USSLocation[],
    sceneLayers: SceneLayer[] | undefined,
    opts?: {
        batchSize?: number;  // 하위 호환용 (무시됨)
        storyBrief?: string;
        visualAnalysis?: SceneVisualAnalysis[];  // ★ Phase A.5
        onProgress?: (done: number, total: number, text: string) => void;
    },
): Promise<{ cuts: USSCut[]; totalTokens: number }> {
    const rawLines = script.split('\n').filter(l => l.trim());
    const allLines = rawLines.map((text, i) => ({ lineNum: i + 1, text }));

    opts?.onProgress?.(0, 1, `🎬 컷 변환 중... (전체 ${rawLines.length}줄 → Claude 1회 호출)`);

    const { cuts, tokenCount } = await convertNarrationToCutsBatch(
        allLines, characters, locations, sceneLayers,
        {
            onProgress: (text) => opts?.onProgress?.(0, 1, text),
            storyBrief: opts?.storyBrief,
            visualAnalysis: opts?.visualAnalysis,  // ★ Phase A.5
        },
    );

    opts?.onProgress?.(1, 1, `✅ 컷 변환 완료: ${cuts.length}컷`);
    console.log(`[USS] 전체 컷 변환 완료: ${cuts.length}컷, 1회 호출, ${tokenCount} tokens`);
    return { cuts, totalTokens: tokenCount };
}


// ═══════════════════════════════════════════════════════════════════
// USS → 기존 앱 데이터 구조 변환 (AI 호출 없음, 순수 매핑)
// ═══════════════════════════════════════════════════════════════════

/** USS CutType → 기존 앱 CutType 매핑 */
function mapCutType(ussCutType?: string): CutType {
    switch (ussCutType) {
        case 'dialogue': return 'dialogue';
        case 'reaction': return 'reaction';
        case 'insert': return 'insert';
        case 'montage': return 'transition';
        case 'action': return 'dialogue'; // 기존 타입에 action 없음 → dialogue로
        default: return 'dialogue';
    }
}

export function ussToAppData(
    structure: Omit<UniversalScriptSchema, 'cuts'>,
    cuts: USSCut[],
): {
    contiCuts: ContiCut[];
    characterBibles: CharacterBible[];
    scenarioAnalysis: ScenarioAnalysis;
    legacyCharacters: { [key: string]: CharacterDescription };
    locationVisualDNA: { [loc: string]: string };
} {
    const { meta, characters, locations } = structure;

    // ── CharacterBible[] ──
    const characterBibles: CharacterBible[] = characters.map(c => ({
        koreanName: c.name,
        canonicalName: c.canonicalName || c.name,
        aliases: c.aliases || [c.name],
        gender: c.gender,
        baseAppearance: c.appearance,
        personalityProfile: {
            core: c.personality,
            behaviorPatterns: {
                nervous: c.behaviorPatterns?.nervous || '',
                angry: c.behaviorPatterns?.angry || '',
                happy: c.behaviorPatterns?.happy || '',
                flustered: '',
                ...(c.behaviorPatterns || {}),
            } as BehaviorPatterns,
            relationships: {},
            physicalMannerisms: '',
            voiceCharacter: '',
        },
        outfitRecommendations: Object.fromEntries(
            locations.map(loc => [loc.name, { description: c.outfitByLocation?.[loc.name] || c.defaultOutfit, reasoning: 'USS location-specific' }])
        ),
    }));

    // ── legacyCharacters (기존 호환) ──
    const legacyCharacters: { [key: string]: CharacterDescription } = {};
    for (const c of characters) {
        const key = c.name.replace(/\s/g, '_');
        const locs: { [loc: string]: string } = {};
        const koreanLocs: { [loc: string]: string } = {};
        for (const loc of locations) {
            const locOutfit = c.outfitByLocation?.[loc.name] || c.defaultOutfit;
            locs[loc.name] = locOutfit;
            koreanLocs[loc.name] = locOutfit;
        }
        legacyCharacters[key] = {
            koreanName: c.name,
            canonicalName: c.canonicalName || c.name,
            aliases: c.aliases || [c.name],
            koreanBaseAppearance: c.appearance,
            baseAppearance: c.appearance,
            gender: c.gender,
            personality: c.personality,
            locations: locs,
            koreanLocations: koreanLocs,
            hairStyleDescription: c.hair || '',        // ★ 헤어 DNA 분리
            facialFeatures: c.face || '',               // ★ 얼굴 DNA 분리
        };
    }

    // ── locationVisualDNA ──
    const locationVisualDNA: { [loc: string]: string } = {};
    for (const loc of locations) {
        locationVisualDNA[loc.name] = loc.visual;
    }

    // ── ScenarioAnalysis — actBoundaries 활용 ──
    const ab = meta.actBoundaries;
    const totalCuts = cuts.length;
    // originLine 기반으로 컷 범위 매핑
    let setupEndCut = 0;
    let confrontationEndCut = 0;
    for (let i = 0; i < cuts.length; i++) {
        const ol = cuts[i].originLine || 0;
        if (ol <= ab.setupEndLine) setupEndCut = i + 1;
        if (ol <= ab.confrontationEndLine) confrontationEndCut = i + 1;
    }
    // 폴백: 매핑 실패 시 비율 적용
    if (setupEndCut === 0) setupEndCut = Math.floor(totalCuts / 3);
    if (confrontationEndCut === 0) confrontationEndCut = Math.floor(totalCuts * 2 / 3);

    // ★ sceneLayers — Step 1 LLM 추출 결과 우선, 없으면 "현재" 단일 레이어 폴백
    const finalSceneLayers: SceneLayer[] = (structure as any).sceneLayers && (structure as any).sceneLayers.length > 0
        ? (structure as any).sceneLayers
        : [{ id: '현재', label: '현재', toneModifier: 'none' }];
    const defaultLayerId = finalSceneLayers[0].id;
    // ★ outfitSessions — sceneLayer × location 곱셈으로 의상 세션 생성 (회상/현재 분리)
    const outfitSessions = finalSceneLayers.flatMap(sl =>
        locations.map(l => ({
            location: l.name,
            layerId: sl.id,
            lineRange: [1, totalCuts] as [number, number],
        }))
    );

    const scenarioAnalysis: ScenarioAnalysis = {
        genre: meta.genre,
        tone: meta.tone,
        threeActStructure: {
            setup: { startLine: 1, endLine: setupEndCut, description: ab.setupDescription },
            confrontation: { startLine: setupEndCut + 1, endLine: confrontationEndCut, description: ab.confrontationDescription },
            resolution: { startLine: confrontationEndCut + 1, endLine: totalCuts, description: ab.resolutionDescription },
        },
        emotionalArc: cuts.map(c => c.emotion),
        turningPoints: [setupEndCut, confrontationEndCut],
        colorMood: meta.colorMood,
        pacing: meta.pacing,
        // Phase 7: LocationEntry[]. USS 파이프라인은 이름에서 카테고리 자동 유추 (휴리스틱).
        locations: locations.map(l => ({ name: l.name, category: inferLocationCategory(l.name) })),
        locationVisualDNA,
        // ★ Step 1 LLM 추출 sceneLayers를 그대로 사용 (이전 'current' 하드코딩 → 정상 흐름)
        sceneLayers: finalSceneLayers,
        outfitSessions,
    };

    // ── location 정규화 함수: 시각 묘사가 들어온 경우 가장 가까운 장소명으로 매칭 ──
    const locationNames = locations.map(l => l.name);

    // 공간 힌트 → sub-location 키워드 매핑 (모호한 "집" 등이 올 때 보조)
    const SPACE_HINTS: { keywords: string[]; subLocKeywords: string[] }[] = [
        { keywords: ['침대', '이불', '베개', '서랍', '잠'], subLocKeywords: ['방'] },
        { keywords: ['부엌', '요리', '냄비', '냉장고', '싱크대'], subLocKeywords: ['주방'] },
        { keywords: ['소파', 'TV', '텔레비전', '리모컨'], subLocKeywords: ['거실'] },
        { keywords: ['현관', '신발', '초인종', '문 앞', '벨'], subLocKeywords: ['현관'] },
        { keywords: ['옥상', '지붕'], subLocKeywords: ['옥상'] },
        { keywords: ['화장실', '샤워', '거울', '세면대'], subLocKeywords: ['화장실'] },
        { keywords: ['아이방', '장난감', '아기', '유아'], subLocKeywords: ['아이방'] },
    ];

    function normalizeLocation(rawLoc: string, cutContext?: string): string {
        // 정확히 매칭되면 그대로
        if (locationNames.includes(rawLoc)) return rawLoc;
        // 장소명이 포함되어 있으면 해당 장소로
        const found = locationNames.find(name => rawLoc.includes(name) || name.includes(rawLoc));
        if (found) return found;

        // ★ 공간 힌트 기반 sub-location 매칭 (cutContext = narration + visualDescription)
        if (cutContext) {
            const ctx = cutContext.toLowerCase();
            for (const hint of SPACE_HINTS) {
                const hasHint = hint.keywords.some(kw => ctx.includes(kw));
                if (hasHint) {
                    const subLoc = locationNames.find(name =>
                        hint.subLocKeywords.some(sk => name.includes(sk))
                    );
                    if (subLoc) return subLoc;
                }
            }
        }

        // 시각 묘사와 비교하여 매칭
        const locByVisual = locations.find(l =>
            rawLoc.toLowerCase().includes(l.visual.slice(0, 20).toLowerCase()) ||
            l.visual.toLowerCase().includes(rawLoc.slice(0, 20).toLowerCase())
        );
        if (locByVisual) return locByVisual.name;
        // 매칭 실패 → 원본 유지 (최소한 일관성)
        console.warn(`[USS] location 정규화 실패: "${rawLoc}" → 원본 유지`);
        return rawLoc;
    }

    // ── ContiCut[] ──
    const contiCuts: ContiCut[] = cuts.map((cut, i) => {
        const cutContext = `${cut.narration || ''} ${cut.visualDescription || ''}`;
        const normalizedLoc = normalizeLocation(cut.location, cutContext);

        // 의상: 컷 전용 → 캐릭터별 기본 의상 조립
        let outfitForCut = cut.outfit || '';
        if (!outfitForCut && cut.characters.length > 0) {
            outfitForCut = cut.characters.map(name => {
                const char = characters.find(c => (c.canonicalName && c.canonicalName === name) || c.name === name);
                return char ? `${name}: ${char.defaultOutfit}` : '';
            }).filter(Boolean).join(', ');
        }

        // ★ sceneLayerId — Step 3 출력 우선, 누락 시 폴백 (이미 convertNarrationToCutsBatch 후처리에서 채워짐)
        const cutLayerId = cut.sceneLayerId && finalSceneLayers.some(sl => sl.id === cut.sceneLayerId)
            ? cut.sceneLayerId
            : defaultLayerId;

        return {
            id: `C${String(i + 1).padStart(3, '0')}`,
            cutType: mapCutType(cut.cutType),
            originLines: [cut.originLine || (i + 1)],
            narration: cut.narration,
            characters: cut.characters,
            location: normalizedLoc,
            sceneLayerId: cutLayerId,
            visualDescription: cut.action,
            emotionBeat: cut.emotion,
            characterPose: cut.pose,
            locationDetail: cut.locationDetail || locations.find(l => l.name === normalizedLoc)?.visual || '',
            sfxNote: cut.sfxNote || '',
            // ★ Phase A.5: 자연어 4필드 ContiCut으로 전달 (gpt-image-2 트랙)
            sceneNarrative: cut.sceneNarrative || undefined,
            cameraNote: cut.cameraNote || undefined,
            moodNote: cut.moodNote || undefined,
            detailsNarrative: cut.detailsNarrative || undefined,
        };
    });

    return { contiCuts, characterBibles, scenarioAnalysis, legacyCharacters, locationVisualDNA };
}

// ═══════════════════════════════════════════════════════════════════
// Phase A.5 v3: JSON truncation 복구 헬퍼
// Claude가 maxTokens 한도에서 string 중간에 잘리면 마지막 완전 객체까지 살림.
// ═══════════════════════════════════════════════════════════════════

function recoverTruncatedJsonArray(raw: string): any[] | null {
    if (!raw.startsWith('[')) return null;
    // 1) 가장 마지막의 완전한 '}' 위치 찾기 (불완전 객체 잘라냄)
    let lastCompleteEnd = -1;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) lastCompleteEnd = i;
        }
    }
    if (lastCompleteEnd < 0) return null;
    // 2) 마지막 완전 객체까지 + ']'로 닫기
    const recovered = raw.slice(0, lastCompleteEnd + 1) + ']';
    try {
        const parsed = JSON.parse(recovered);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════
// Phase A.5: analyzeVisualNarrative — 영상 감독 페르소나 시각 분석
// ═══════════════════════════════════════════════════════════════════

const VISUAL_NARRATIVE_SYSTEM_PROMPT = `You are a Korean webtoon/animation short film director.
Analyze the given USS script and produce visual narrative analysis scene-by-scene.

Use the structural metadata (characters, locations, sceneLayers, act boundaries)
provided in the user message as context. Identify scene boundaries using actBoundaries
+ your visual judgment (additional cuts for flashback, viewpoint shift, location change).

# SCENE LAYER ASSIGNMENT (CRITICAL)
The user message includes a 'sceneLayers' list (e.g., ["현재", "어린시절_과거", "상상_미래"]).
For EVERY scene, you MUST assign exactly ONE sceneLayerId from this list.

★ Treat sceneLayer transitions as scene boundaries.
   Even if 3 consecutive lines are in the same physical location, if the timeline shifts
   (e.g., "현재" → "어린시절_과거" → "현재"), split them into 3 SEPARATE scenes.

★ Detect timeline transition signals:
   - 회상 진입: "어렸을 때", "옛날에", "그때", "10년 전", "어머니가 살아계실 때",
                past-perfect tense bursts ("~했었다", "~했더랬어")
   - 상상 진입: "만약 ~라면", "상상해보니", "꿈에서", "혹시"
   - 현재 복귀: "그러다 정신을 차리니", "지금은", "현재", or natural return to direct action

★ Default to "현재" when ambiguous. Empty/missing sceneLayerId costs visual coherence.

For each scene, produce a SceneVisualAnalysis object with:
- sceneId: "scene-1", "scene-2", etc.
- sceneIndex: 1-indexed
- lineRange: [startLine, endLine] (1-indexed inclusive — line numbers from the script)
- sceneLayerId: ONE id from the sceneLayers list (e.g., "현재", "어린시절_과거")
- sceneNarrative: ENGLISH 2~3 sentences. Where, when, atmosphere. Visualize as if
  directing a film: lighting, time of day, weather, density of background, mood.
- subjectDescription: ENGLISH. Which characters appear, their visual state in this
  scene (clothing continuity, posture baseline, expression baseline).
- detailsNarrative: ENGLISH. WHAT HAPPENS in this scene as continuous action flow.
  Action momentum, not static poses. Describe how the scene unfolds.
- cameraIntent: ENGLISH. Suggest 2~4 shot variations for this scene
  (e.g., "establishing wide shot of the cafe, then medium shot of Yuna at the
  window, close-up of her hands holding the mug"). Avoid monotonous front-facing shots.
- moodArc: ENGLISH. Emotional progression within the scene.
- suggestedCutBoundaries: optional array of line numbers where you'd cut (max 5).
- keyMoments: optional array of ENGLISH descriptions of 1-3 visually important moments.

OUTPUT: Valid JSON only. No markdown fences, no explanation.

{
  "visualAnalysis": [
    {
      "sceneId": "scene-1",
      "sceneIndex": 1,
      "lineRange": [1, 12],
      "sceneLayerId": "현재",
      "sceneNarrative": "...",
      "subjectDescription": "...",
      "detailsNarrative": "...",
      "cameraIntent": "...",
      "moodArc": "...",
      "suggestedCutBoundaries": [3, 7, 10],
      "keyMoments": ["..."]
    }
  ]
}`;

/**
 * Phase A.5: 씬 단위 자연어 시각 분석.
 * analyzeUSSStructure 결과를 컨텍스트로 받아 영상 감독 페르소나로 씬별 자연어 묘사 생성.
 *
 * 실패 안전망: 에러 시 throw, 호출부에서 catch → 빈 배열 + warning notification.
 */
export async function analyzeVisualNarrative(
    script: string,
    structure: Omit<UniversalScriptSchema, 'cuts'>,
    speakerGender?: 'male' | 'female',
): Promise<{ visualAnalysis: SceneVisualAnalysis[]; tokenCount: number }> {
    const lines = script.split('\n').filter(l => l.trim());
    const numberedScript = lines.map((l, i) => `[${i + 1}] ${l}`).join('\n');

    // 메타데이터 컨텍스트 빌드
    const charSummary = structure.characters.map(c => {
        const id = c.canonicalName || c.name;
        return `- ${id} (${c.gender}): ${c.appearance}`;
    }).join('\n');
    const locSummary = structure.locations.map(l => `- ${l.name}: ${l.visual}`).join('\n');
    const actBounds = structure.meta.actBoundaries
        ? `setupEnds @ line ${structure.meta.actBoundaries.setupEndLine}, confrontationEnds @ line ${structure.meta.actBoundaries.confrontationEndLine}, totalLines ${lines.length}`
        : `totalLines ${lines.length}`;
    // ★ sceneLayers 컨텍스트 — Step 2의 sceneLayerId 부여 결정에 사용
    const layerList = (structure.sceneLayers && structure.sceneLayers.length > 0)
        ? structure.sceneLayers
        : [{ id: '현재', label: '현재', toneModifier: 'none' as const }];
    const layerSummary = layerList.map(sl => {
        const flags: string[] = [];
        if (sl.isFlashback) flags.push('flashback');
        if (sl.isImagined) flags.push('imagined');
        const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
        const tone = sl.toneModifier && sl.toneModifier !== 'none' ? ` [tone: ${sl.toneModifier}]` : '';
        const time = sl.timeDelta ? ` ${sl.timeDelta}` : '';
        return `- ${sl.id}${flagStr}${time}${tone}`;
    }).join('\n');

    const userMessage = `[Title] ${structure.meta.title || '(no title)'}
[Genre] ${structure.meta.genre || ''} / [Tone] ${structure.meta.tone || ''} / [ColorMood] ${structure.meta.colorMood || ''}
[ActBoundaries] ${actBounds}
${speakerGender ? `[SpeakerGender] ${speakerGender}\n` : ''}
[Characters]
${charSummary}

[Locations]
${locSummary}

[SceneLayers — choose ONE per scene]
${layerSummary}

[Script — 1-indexed lines]
${numberedScript}`;

    const result = await callClaude(VISUAL_NARRATIVE_SYSTEM_PROMPT, userMessage, {
        temperature: 0.5,
        maxTokens: 8000,
    });

    let parsed: { visualAnalysis: SceneVisualAnalysis[] };
    try {
        const cleaned = result.text.trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '');
        parsed = JSON.parse(cleaned);
    } catch (e) {
        console.error('[analyzeVisualNarrative] JSON parse error:', e, result.text?.slice(0, 500));
        return { visualAnalysis: [], tokenCount: result.totalTokens || 0 };
    }

    if (!parsed || !Array.isArray(parsed.visualAnalysis)) {
        return { visualAnalysis: [], tokenCount: result.totalTokens || 0 };
    }

    // 검증/보정 + 자연어 필드 string 강제
    const toStr = (v: any): string => {
        if (v == null) return '';
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(' ');
        return String(v);
    };
    const valid = parsed.visualAnalysis.filter((va: any) =>
        va && va.sceneId && Array.isArray(va.lineRange) && va.lineRange.length === 2
    ).map((va: any, idx: number) => ({
        sceneId: String(va.sceneId),
        sceneIndex: typeof va.sceneIndex === 'number' ? va.sceneIndex : idx + 1,
        lineRange: [Number(va.lineRange[0]) || 1, Number(va.lineRange[1]) || lines.length] as [number, number],
        sceneLayerId: va.sceneLayerId ? String(va.sceneLayerId) : undefined,
        sceneNarrative: toStr(va.sceneNarrative),
        subjectDescription: toStr(va.subjectDescription),
        detailsNarrative: toStr(va.detailsNarrative),
        cameraIntent: toStr(va.cameraIntent),
        moodArc: toStr(va.moodArc),
        suggestedCutBoundaries: Array.isArray(va.suggestedCutBoundaries)
            ? va.suggestedCutBoundaries.map((n: any) => Number(n)).filter((n: number) => !isNaN(n))
            : undefined,
        keyMoments: Array.isArray(va.keyMoments)
            ? va.keyMoments.map(toStr).filter((s: string) => s.length > 0)
            : undefined,
    }));

    // ===== sceneLayerId 검증 + 폴백 =====
    // 사용 가능한 layer id set
    const validLayerIds = new Set(layerList.map(sl => sl.id));
    let layerFallbackCount = 0;
    for (const va of valid) {
        // 누락 또는 등록되지 않은 layer id → "현재"로 폴백
        if (!va.sceneLayerId || !validLayerIds.has(va.sceneLayerId)) {
            const original = va.sceneLayerId;
            va.sceneLayerId = '현재';
            layerFallbackCount++;
            if (original) {
                console.warn(`[USS-FALLBACK] scene ${va.sceneId} sceneLayerId="${original}" 미등록 → "현재"로 폴백`);
            }
        }
    }
    if (layerFallbackCount > 0 && layerFallbackCount === valid.length && layerList.length > 1) {
        console.warn(`[USS-FALLBACK] 모든 ${valid.length}씬이 sceneLayerId 누락 → 전부 "현재" 처리 (LLM이 layer 활용 못함)`);
    }

    const layerDist = new Map<string, number>();
    valid.forEach(va => {
        const k = va.sceneLayerId || '현재';
        layerDist.set(k, (layerDist.get(k) || 0) + 1);
    });
    const distStr = Array.from(layerDist.entries()).map(([k, n]) => `${k}:${n}`).join(', ');
    console.log(`[Phase A.5] Visual analysis: ${valid.length} scenes [${distStr}]`);
    return { visualAnalysis: valid, tokenCount: result.totalTokens || 0 };
}
