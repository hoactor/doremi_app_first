// services/ai/ussAnalysis.ts — USS (Universal Script Schema) 분석
// Call 1: 대본 → 구조 분석 (meta + characters + locations + 막 구분)
// Call 2~N: 나레이션 배치 → 컷 변환
// ussToAppData: USS → 기존 앱 데이터 구조 매핑 (AI 불필요)

import { callClaude } from '../claudeService';
import type {
    UniversalScriptSchema, USSCharacter, USSLocation, USSCut,
    ContiCut, CharacterBible, ScenarioAnalysis, CharacterDescription,
    BehaviorPatterns, CutType,
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
  "characters": [{"name":"","canonicalName":"","aliases":[],"gender":"","hair":"","face":"","body":"","appearance":"","personality":"","defaultOutfit":"","outfitByLocation":{}}],
  "locations": [{"name":"","visual":""}]
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
        maxTokens: 4000,
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
    // hair/face 폴백 + outfitByLocation 누락 보정
    for (const c of parsed.characters) {
        if (!c.hair) c.hair = '';
        if (!c.face && c.appearance) c.face = 'Match facial visage exactly';
        if (!c.body) c.body = '';
        // outfitByLocation 없으면 defaultOutfit으로 전 장소 채움
        if (!c.outfitByLocation || typeof c.outfitByLocation !== 'object') {
            c.outfitByLocation = {};
        }
        // 누락된 장소 채우기
        for (const locName of locationNames) {
            if (!c.outfitByLocation[locName]) {
                c.outfitByLocation[locName] = c.defaultOutfit || 'standard casual outfit';
                console.warn(`[USS] outfitByLocation 누락 보정: ${c.name} → ${locName} = defaultOutfit`);
            }
        }
    }

    console.log(`[USS] 구조 분석 완료: ${parsed.characters.length}명, ${parsed.locations.length}장소, 막구분 1→${parsed.meta.actBoundaries.setupEndLine}/${parsed.meta.actBoundaries.confrontationEndLine}/${lines.length}`);
    return { structure: parsed, tokenCount: result.tokenCount || 0 };
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
13. Insert cuts (no characters, just objects/environment) are valid and powerful for pacing.
14. originLine: The line number this cut came from.
15. location field: Use the EXACT location NAME from the list below. Do NOT put visual descriptions here — just the short name (e.g. "주인공의 방", NOT "Dark bedroom at 2AM with phone glow..."). Visual details go in the locationDetail field only.
    ★ If a scene clearly takes place in a different room/area than the previous cut (e.g., moving from bedroom to kitchen), use the appropriate sub-location from the list.
    ★ If the character is OUTSIDE a building (door entrance, front steps), use the exterior location name, not the interior one.
16. Use character names and location names EXACTLY as provided below. Do NOT invent new location names. Every cut's location MUST be one of the names listed in LOCATION CONTEXT — no exceptions.
17. If CHARACTER CONTEXT uses English canonicalNames (e.g., "Juli", "Minho"), the characters array MUST use those English names — NEVER the Korean name. Match aliases from the narration to the correct canonicalName.

## CHARACTER CONTEXT:
{CHARACTER_CONTEXT}

## LOCATION CONTEXT:
{LOCATION_CONTEXT}

## OUTPUT: Valid JSON array only. No explanation, no markdown fences.
[{"narration":"","characters":[],"location":"","action":"","emotion":"","pose":"","cutType":"","originLine":0}]`;

export async function convertNarrationToCutsBatch(
    lines: { lineNum: number; text: string }[],
    characters: USSCharacter[],
    locations: USSLocation[],
    opts?: { onProgress?: (text: string) => void; storyBrief?: string },
): Promise<{ cuts: USSCut[]; tokenCount: number }> {
    const hasCanonical = characters.some(c => c.canonicalName && c.canonicalName !== c.name);
    const charContext = characters.map(c => {
        const id = hasCanonical ? (c.canonicalName || c.name) : c.name;
        const aliasInfo = (hasCanonical && c.aliases?.length) ? ` [aliases: ${c.aliases.join(', ')}]` : '';
        return `- ${id} (${c.gender}${hasCanonical ? ', 한국어: ' + c.name : ''}): ${c.appearance} / outfit: ${c.defaultOutfit}${aliasInfo}`;
    }).join('\n');
    const locContext = locations.map(l => `- ${l.name}: ${l.visual}`).join('\n');

    const systemPrompt = CUTS_SYSTEM_PROMPT
        .replace('{CHARACTER_CONTEXT}', charContext)
        .replace('{LOCATION_CONTEXT}', locContext);

    const numberedLines = lines.map(l => `[${l.lineNum}] ${l.text}`).join('\n');
    const userMessage = `${opts?.storyBrief ? `[작품해설서]\n${opts.storyBrief}\n\n` : ''}다음 ${lines.length}줄의 나레이션을 컷으로 분할하세요:\n\n${numberedLines}`;

    opts?.onProgress?.(`🎬 컷 변환 중... (${lines[0].lineNum}~${lines[lines.length - 1].lineNum}번 줄)`);

    const result = await callClaude(systemPrompt, userMessage, {
        temperature: 0.4,
        maxTokens: 16000,
    });

    let parsed: USSCut[];
    try {
        const cleaned = result.text
            .replace(/```json\s*/g, '').replace(/```\s*/g, '')
            .trim();
        parsed = JSON.parse(cleaned);
    } catch (e) {
        throw new Error(`USS 컷 변환 JSON 파싱 실패 (줄 ${lines[0].lineNum}~${lines[lines.length - 1].lineNum}): ${(e as Error).message}`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error(`USS 컷 변환 결과가 배열이 아닙니다`);
    }

    // 기본값 채우기
    for (const cut of parsed) {
        if (!cut.cutType) cut.cutType = 'action';
        if (!cut.characters) cut.characters = [];
        if (!cut.pose) cut.pose = '';
        if (!cut.action) cut.action = '';
        if (!cut.originLine) cut.originLine = lines[0].lineNum;
    }

    return { cuts: parsed, tokenCount: result.tokenCount || 0 };
}

/**
 * 전체 대본을 한번에 컷 변환 (배치 없음 — Claude 200K 컨텍스트 활용)
 */
export async function convertAllNarrationToCuts(
    script: string,
    characters: USSCharacter[],
    locations: USSLocation[],
    opts?: {
        batchSize?: number;  // 하위 호환용 (무시됨)
        storyBrief?: string;
        onProgress?: (done: number, total: number, text: string) => void;
    },
): Promise<{ cuts: USSCut[]; totalTokens: number }> {
    const rawLines = script.split('\n').filter(l => l.trim());
    const allLines = rawLines.map((text, i) => ({ lineNum: i + 1, text }));

    opts?.onProgress?.(0, 1, `🎬 컷 변환 중... (전체 ${rawLines.length}줄 → Claude 1회 호출)`);

    const { cuts, tokenCount } = await convertNarrationToCutsBatch(
        allLines, characters, locations,
        { onProgress: (text) => opts?.onProgress?.(0, 1, text), storyBrief: opts?.storyBrief },
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
        locations: locations.map(l => l.name),
        locationVisualDNA,
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

        return {
            id: `C${String(i + 1).padStart(3, '0')}`,
            cutType: mapCutType(cut.cutType),
            originLines: [cut.originLine || (i + 1)],
            narration: cut.narration,
            characters: cut.characters,
            location: normalizedLoc,
            visualDescription: cut.action,
            emotionBeat: cut.emotion,
            characterPose: cut.pose,
            locationDetail: cut.locationDetail || locations.find(l => l.name === normalizedLoc)?.visual || '',
            sfxNote: cut.sfxNote || '',
        };
    });

    return { contiCuts, characterBibles, scenarioAnalysis, legacyCharacters, locationVisualDNA };
}
