// services/ai/msfAnalysis.ts — MSF(Master Scene Format) 대본 파싱 + 콘티 생성
// 기존 나레이션 경로(textAnalysisPipeline.ts)와 완전 분리

import { ContiCut, CharacterBible, ScenarioAnalysis } from '../../types';
import { callTextModel, parseJsonResponse, SFW_SYSTEM_INSTRUCTION } from './aiCore';
import { callClaude } from '../claudeService';

export interface MSFParseResult {
    scenarioAnalysis: ScenarioAnalysis;
    characterBibles: CharacterBible[];
    contiCuts: ContiCut[];
    tokenCount: number;
}

/**
 * MSF 대본을 한 번의 Claude 호출로 파싱 + 보정 + ContiCut[] 생성
 * 불완전한 MSF(슬러그라인 누락, 시간 생략 등)도 문맥 추론으로 처리
 */
export async function parseMSFScript(
    msfScript: string,
    logline?: string,
    seed?: number,
    speakerGender?: 'male' | 'female'
): Promise<MSFParseResult> {

    const systemPrompt = `${SFW_SYSTEM_INSTRUCTION}

You are an expert MSF (Master Scene Format) screenplay analyst and storyboard designer.
Your task: Parse an MSF screenplay and produce structured data for storyboard generation.

CAPABILITIES:
- Extract locations, time-of-day, INT/EXT from sluglines (INT./EXT. 장소 — 시간)
- Identify character names, dialogue, V.O., O.S.
- Extract emotion/acting cues from parentheticals
- Extract actions, props, situations from action lines (지문)
- INFER missing information from context (if slugline missing → guess location from action lines; if time omitted → default to 낮; if no emotion cue → infer from dialogue tone)
- Generate character appearance and outfits from dialogue/action context

OUTPUT FORMAT: Respond with valid JSON only.`;

    const speakerGenderInstruction = speakerGender
        ? `\n## [필수] 화자(나레이터) 성별: ${speakerGender}\n- 이 대본의 1인칭 화자("나", "내")는 반드시 ${speakerGender === 'male' ? '남성(male)' : '여성(female)'}이다.\n- 화자 캐릭터의 gender 필드는 반드시 "${speakerGender}"로 설정하라.\n- 대본 내용이 모호하더라도 이 설정을 절대 변경하지 마라.\n`
        : '';

    const userPrompt = `# MSF 대본 분석 요청

${logline ? `## 로그라인\n${logline}\n` : ''}${speakerGenderInstruction}
## MSF 대본
\`\`\`
${msfScript}
\`\`\`

## 작업 지시

위 MSF 대본을 분석하여 아래 JSON 구조로 출력하세요.

### 출력 JSON 구조:
{
  "scenarioAnalysis": {
    "genre": "장르 키워드 (한국어, 예: 직장 코미디)",
    "tone": "톤 키워드 (한국어, 예: 위트, 소심한 유머)",
    "threeActStructure": { "setup": [1,1], "confrontation": [1,1], "resolution": [1,1] },
    "emotionalArc": [],
    "turningPoints": [],
    "colorMood": "전체 색감/시각 분위기 (영어, 예: warm office fluorescent mixed with cold night blue)",
    "pacing": "normal",
    "locations": ["장소1", "장소2"],
    "locationVisualDNA": {
      "장소1": "영어 시각 묘사. 인테리어, 분위기, 대표 색감, 조명 특성. 20-30 words.",
      "장소2": "..."
    }
  },
  "characterBibles": [
    {
      "koreanName": "캐릭터 한국어 이름",
      "canonicalName": "English romanized name (e.g. 'Juli', 'Minho'). Unique internal key for all image prompts.",
      "aliases": ["한국어 이름", "딸", "아이", "애기 등 대본에서 이 캐릭터를 가리키는 모든 한국어 지칭. koreanName 포함 필수."],
      "gender": "male 또는 female",
      "baseAppearance": "영어로 외모 묘사 (나이, 체형, 머리 스타일+색상, 눈 색상, 피부톤). 15-25 words. 대본의 맥락에서 추론.",
      "personalityProfile": {
        "core": "한국어 성격 요약 (1-2문장)",
        "behaviorPatterns": {
          "nervous": "영어 신체 반응",
          "angry": "영어 신체 반응",
          "happy": "영어 신체 반응",
          "flustered": "영어 신체 반응"
        },
        "relationships": { "다른캐릭터이름": "관계 설명 (한국어)" },
        "physicalMannerisms": "영어 버릇/자세",
        "voiceCharacter": "영어 목소리 특성"
      },
      "outfitRecommendations": {
        "장소1": {
          "description": "영어 의상 묘사. 의류만. hair/face/body 언급 금지. HEX 컬러 포함.",
          "reasoning": "한국어 의상 선택 이유"
        }
      }
    }
  ],
  "contiCuts": [
    {
      "id": "C001",
      "cutType": "establish | dialogue | reaction | insert | transition",
      "originLines": [1],
      "narration": "원본 대사 그대로 (무음 컷이면 빈 문자열)",
      "characters": ["canonicalName (영어 이름만 사용, 한국어 금지)"],
      "location": "scenarioAnalysis.locations에 있는 장소명만 사용",
      "visualDescription": "영어로 시각 묘사. 인물 행동, 표정, 소품, 배경 디테일 포함. 20-40 words.",
      "emotionBeat": "이중 언어: '한국어 — English facial/body description' (예: '긴장 — nervous, wide eyes, stiff shoulders')",
      "characterPose": "영어로 구체적 포즈. 팔다리 위치, 머리 방향, 무게 중심. insert/establish/transition은 빈 문자열.",
      "sfxNote": "한국어 효과음 메모 (없으면 빈 문자열)",
      "locationDetail": "영어로 장소 시각 묘사. 인테리어, 소품, 분위기, 색감, 조명. 15-25 words."
    }
  ]
}

### 규칙:
1. **locations 배열**: 대본에서 추출한 모든 고유 장소. 중복 없이. 슬러그라인이 없으면 지문에서 추론.
2. **contiCuts[].location**: 반드시 scenarioAnalysis.locations 안의 값만 사용. 새 이름 금지.
3. **outfitRecommendations 키**: 반드시 locations 배열의 장소명과 일치.
4. **컷 분할 원칙**:
   - 장소 전환 = 새 컷 (establish 또는 transition)
   - 대사 1~2줄 = dialogue 컷 1개
   - 인서트(INSERT, 톡 화면, 소품 클로즈업) = insert 컷
   - 반응(대답 없이, 표정 변화) = reaction 컷
   - V.O. = 해당 인물의 dialogue 컷 (characters에 화자 포함)
5. **contiCut ID**: C001, C002, ... 순차적으로.
6. **baseAppearance**: CLOTHING 절대 포함 금지. 신체 특성만.
6b. **canonicalName**: 반드시 영어 로마자 변환. 이후 contiCuts의 characters 배열에서 이 이름만 사용.
6c. **aliases**: 대본에서 이 캐릭터를 가리키는 모든 한국어 지칭 수집. koreanName 반드시 포함.
7. **outfitRecommendations.description**: HAIR/FACE/BODY 절대 포함 금지. 의류만.
8. **불완전한 대본 처리**: 빠진 정보(시간, 감정, 장소)는 문맥에서 추론하여 채우기.
9. **visualDescription 인물 규칙 (CRITICAL):**
   - characters[] 배열에 있는 인물만 주어로 사용
   - characters[]에 없는 인물(boyfriend, 엄마, 친구, 동료 등)은 절대 이름/관계로 언급 금지
   - 대신 비특정 표현 사용: "a tall figure in apron", "someone behind the counter"
   - 또는 characters[] 인물의 시점으로 변환: "she sees a figure working behind counter"
   - 감정/카메라 지시는 포함 금지 (별도 필드 사용)
   - 순수 시각 행동만: 누가(characters만) + 뭘 하고 있는지 + 어디서 + 주변 소품/상황
10. **emotionBeat 이중 언어:**
    - 형식: "한국어키워드 — English facial/body description"
    - 예: "긴장 — nervous, wide eyes, stiff shoulders, fidgeting hands"
    - 예: "설렘 — excited sparkle in eyes, slight blush, leaning forward"
    - 신체 반응까지 포함. 단순 형용사 금지.
12. **DSF(DoReMiSsul Scene Format) @필드 지원:**
    - 입력 대본에 @EMOTION, @ACTION, @POSE, @CAMERA 블록이 있을 수 있다.
    - 이 블록들이 있으면 해당 내용을 ContiCut 필드에 우선 매핑:
      - @EMOTION → emotionBeat 필드에 그대로 (한국어 — 영어 형식 유지)
      - @ACTION → visualDescription 필드에 그대로
      - @POSE → characterPose 필드에 그대로
      - @CAMERA → sfxNote 필드에 "[CAM] " 접두어 붙여서 저장 (예: "[CAM] 바스트샷, 살짝 로우앵글")
    - @필드가 없는 비트는 기존처럼 지문/대사에서 추론하여 생성.
    - @필드가 있는 비트는 해당 내용을 존중하되, 누락된 필드만 추론으로 채움.
11. **locationDetail (NEW FIELD):**
    - 각 contiCut에 locationDetail 필드 추가
    - 해당 장소의 시각 묘사: 인테리어, 소품, 분위기, 색감, 조명
    - 영어 15-25 words
    - 예: "Warm Korean BBQ restaurant, wooden tables with built-in grills, steam rising, red neon signs, amber overhead lighting"`;

    const result = await callTextModel(systemPrompt, userPrompt, {
        responseMimeType: 'application/json',
        seed,
        temperature: 0.5,
        maxTokens: 32768,
    });

    const parsed = parseJsonResponse<{
        scenarioAnalysis: any;
        characterBibles: any[];
        contiCuts: any[];
    }>(result.text, 'parseMSFScript');

    // scenarioAnalysis 정규화 — 빠진 필드 채우기
    const scenarioAnalysis: ScenarioAnalysis = {
        genre: parsed.scenarioAnalysis?.genre || '',
        tone: parsed.scenarioAnalysis?.tone || '',
        threeActStructure: parsed.scenarioAnalysis?.threeActStructure || { setup: [1, 1], confrontation: [1, 1], resolution: [1, 1] },
        emotionalArc: parsed.scenarioAnalysis?.emotionalArc || [],
        turningPoints: parsed.scenarioAnalysis?.turningPoints || [],
        colorMood: parsed.scenarioAnalysis?.colorMood || '',
        pacing: parsed.scenarioAnalysis?.pacing || 'normal',
        locations: parsed.scenarioAnalysis?.locations || [],
        locationVisualDNA: parsed.scenarioAnalysis?.locationVisualDNA || {},  // ★ NEW
    };

    // characterBibles 정규화
    const characterBibles: CharacterBible[] = (parsed.characterBibles || []).map((b: any) => ({
        koreanName: b.koreanName || '',
        canonicalName: b.canonicalName || b.koreanName || '',
        aliases: b.aliases || [b.koreanName || ''],
        gender: b.gender || 'male',
        baseAppearance: b.baseAppearance || '',
        personalityProfile: {
            core: b.personalityProfile?.core || '',
            behaviorPatterns: b.personalityProfile?.behaviorPatterns || {},
            relationships: b.personalityProfile?.relationships || {},
            physicalMannerisms: b.personalityProfile?.physicalMannerisms || '',
            voiceCharacter: b.personalityProfile?.voiceCharacter || '',
        },
        outfitRecommendations: b.outfitRecommendations || {},
    }));

    // contiCuts 정규화 — ID 순차 보정
    const contiCuts: ContiCut[] = (parsed.contiCuts || []).map((c: any, i: number) => ({
        id: `C${String(i + 1).padStart(3, '0')}`,
        cutType: c.cutType || 'dialogue',
        originLines: c.originLines || [i + 1],
        narration: c.narration || '',
        characters: c.characters || [],
        location: c.location || scenarioAnalysis.locations[0] || '',
        visualDescription: c.visualDescription || '',
        emotionBeat: c.emotionBeat || '',
        characterPose: c.characterPose || '',
        sfxNote: c.sfxNote || '',
        locationDetail: c.locationDetail || '',  // ★ NEW: 장소 시각 묘사
    }));

    return {
        scenarioAnalysis,
        characterBibles,
        contiCuts,
        tokenCount: result.tokenCount,
    };
}

/**
 * MSF 대본에서 제목 + 스토리 셋업(장르/톤/갈등/반전)을 자동 생성
 * 대본만 있고 제목/셋업이 비어있을 때 호출
 */
export async function generateTitleAndSetup(
    script: string,
    seed?: number
): Promise<{
    titles: string[];
    genre: string;
    tones: string[];
    conflict: string;
    twist: string;
    tokenCount: number;
}> {
    const prompt = `Analyze the following script and generate:
1. Three catchy viral YouTube-style Korean titles (짧고 자극적인 썰 제목)
2. Genre (장르) — pick the single best match from: 연애썰, 직장썰, 가족썰, 군대썰, 학교썰, 복수썰, 공포썰, 감동썰, 사이다썰
3. Tones (톤) — pick 1~3 from: 코믹, 자조유머, 따뜻, 냉소, 긴장감, 감동, 사이다, 어둠, 열혈, 밝음
4. Conflict (핵심 갈등) — 1~2 sentences in Korean
5. Twist (반전/펀치라인) — 1 sentence in Korean

Output JSON: { "titles": ["...", "...", "..."], "genre": "...", "tones": ["...", "..."], "conflict": "...", "twist": "..." }

Script:
${script}`;

    const result = await callTextModel(
        SFW_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.',
        prompt,
        { responseMimeType: 'application/json', seed }
    );

    const parsed = parseJsonResponse<{
        titles: string[];
        genre: string;
        tones: string[];
        conflict: string;
        twist: string;
    }>(result.text, 'generateTitleAndSetup');

    return {
        titles: parsed.titles || [],
        genre: parsed.genre || '',
        tones: parsed.tones || [],
        conflict: parsed.conflict || '',
        twist: parsed.twist || '',
        tokenCount: result.tokenCount,
    };
}

/**
 * ContiCut[]의 감정/포즈/행동을 전체 대본 맥락 기반으로 풍부화
 * parseMSFScript 직후, designCinematography 직전에 호출
 */
// ─── 배치 enrichment (신규 진입점) ─────────────────────────────────

export async function enrichContiCutsBatch(
    contiCuts: ContiCut[],
    originalScript: string,
    characterBibles: CharacterBible[],
    scenarioAnalysis: ScenarioAnalysis,
    options?: { batchSize?: number; contextWindow?: number; onProgress?: (done: number, total: number) => void; storyBrief?: string }
): Promise<{ enrichedCuts: ContiCut[]; tokenCount: number }> {
    const batchSize = options?.batchSize || 8;
    const contextWindow = options?.contextWindow || 2;
    const results: ContiCut[] = [...contiCuts];
    let totalTokens = 0;

    for (let i = 0; i < contiCuts.length; i += batchSize) {
        const batchCuts = contiCuts.slice(i, i + batchSize);
        const prevContext = contiCuts.slice(Math.max(0, i - contextWindow), i);
        const nextContext = contiCuts.slice(i + batchSize, i + batchSize + contextWindow);

        const { enrichedCuts: enriched, tokenCount } = await enrichContiCutsSingle(
            batchCuts, prevContext, nextContext,
            originalScript, characterBibles, scenarioAnalysis, options?.storyBrief
        );

        for (const e of enriched) {
            const idx = results.findIndex(r => r.id === e.id);
            if (idx >= 0) results[idx] = e;
        }
        totalTokens += tokenCount;
        options?.onProgress?.(Math.min(i + batchSize, contiCuts.length), contiCuts.length);
    }

    return { enrichedCuts: results, tokenCount: totalTokens };
}

/** 단일 배치 enrichment (내부 호출용) */
async function enrichContiCutsSingle(
    batchCuts: ContiCut[],
    prevContext: ContiCut[],
    nextContext: ContiCut[],
    originalScript: string,
    characterBibles: CharacterBible[],
    scenarioAnalysis: ScenarioAnalysis,
    storyBrief?: string,
): Promise<{ enrichedCuts: ContiCut[]; tokenCount: number }> {
    // enrichContiCutsLegacy와 동일한 프롬프트 + 배치 맥락 추가
    return enrichContiCutsLegacy(batchCuts, originalScript, characterBibles, scenarioAnalysis, prevContext, nextContext, storyBrief);
}

/** 기존 enrichContiCuts (레거시 보관) */
export async function enrichContiCutsLegacy(
    contiCuts: ContiCut[],
    originalScript: string,
    characterBibles: CharacterBible[],
    scenarioAnalysis: ScenarioAnalysis,
    prevContext?: ContiCut[],
    nextContext?: ContiCut[],
    storyBrief?: string,
): Promise<{ enrichedCuts: ContiCut[]; tokenCount: number }> {

    const systemPrompt = `${SFW_SYSTEM_INSTRUCTION}

You are an expert mise-en-scène director and acting coach for manga/anime storyboards.

Your task: Take structured storyboard cuts and ENRICH the acting — emotion, body language, and visual dynamism — while preserving the exact same story structure.

You understand Korean emotional nuance deeply.
"긴장" before a confession is different from "긴장" after being caught lying.
"웃음" from relief is different from "웃음" masking pain.
You read the FULL script context and character relationships to get these nuances right.

CRITICAL RULES:
- You receive ContiCut[] as JSON. Return the SAME array with SAME number of cuts, SAME ids.
- Only modify these 3 fields: emotionBeat, visualDescription, characterPose
- Do NOT change: id, cutType, originLines, narration, characters, location, sfxNote, locationDetail
- All enriched descriptions must be in ENGLISH (emotionBeat keeps "한국어 — English" format)
- Think about the SEQUENCE: each cut's emotion should flow naturally from the previous cut
- Think about CHARACTER PERSONALITY: a shy character expresses anger differently than a bold character
- Think about ESCALATION: emotions build across a scene, they don't repeat at the same intensity`;

    const characterContext = characterBibles.map(b => {
        const relationships = Object.entries(b.personalityProfile?.relationships || {})
            .map(([name, rel]) => `${name}: ${rel}`).join(', ');
        return `- ${b.koreanName} (${b.gender}): ${b.personalityProfile?.core || ''}. 관계: ${relationships}. 버릇: ${b.personalityProfile?.physicalMannerisms || 'none'}`;
    }).join('\n');

    const cutsForEnrichment = contiCuts.map(c => ({
        id: c.id, cutType: c.cutType, narration: c.narration,
        characters: c.characters, location: c.location,
        emotionBeat: c.emotionBeat, visualDescription: c.visualDescription, characterPose: c.characterPose,
    }));

    const prevContextStr = prevContext?.length ? `## 이전 컷 맥락 (참조용, 수정하지 않음)\n${prevContext.map(c => `- ${c.id}: ${c.emotionBeat} / ${c.narration?.slice(0, 30) || ''}`).join('\n')}\n` : '';
    const nextContextStr = nextContext?.length ? `## 이후 컷 맥락 (참조용, 수정하지 않음)\n${nextContext.map(c => `- ${c.id}: ${c.emotionBeat} / ${c.narration?.slice(0, 30) || ''}`).join('\n')}\n` : '';

    const userPrompt = `${storyBrief ? `## 작품 해설\n${storyBrief}\n\n` : ''}## 원본 대본 (맥락 참조용)
\`\`\`
${originalScript}
\`\`\`

## 캐릭터 성격/관계
${characterContext}

## 시나리오 정보
- 장르: ${scenarioAnalysis.genre || ''}
- 톤: ${scenarioAnalysis.tone || ''}
- 전체 색감: ${scenarioAnalysis.colorMood || ''}

${prevContextStr}${nextContextStr}## 풍부화 대상 ContiCuts
\`\`\`json
${JSON.stringify(cutsForEnrichment, null, 2)}
\`\`\`

## 풍부화 규칙

### emotionBeat — 전신 감정 반응 (이미지 생성 AI용 물리적 묘사)
- 형식: "한국어키워드 — FACE: ... | UPPER: ... | LOWER: ..."
- 각 파트에서 반드시 **구체적 근육/관절/방향**을 명시:
  - FACE: 눈(동공 크기, 시선 방향, 눈썹 각도) + 입(열림/닫힘, 이빨 노출, 입꼬리 방향) + 볼(홍조 유무, 볼 부풀림) + 이마(주름, 땀방울)
  - UPPER: 어깨(높이, 각도) + 팔(위치, 꺾임) + 손(뭘 잡고 있는지, 주먹/펴짐, 손가락 상태) + 흉부(기울기)
  - LOWER: 무게중심(앞/뒤/한쪽) + 무릎(굽힘 정도) + 발(방향, 까치발/평발) + 전체 자세(비틀림, 기울기)
- **금지**: 추상적 형용사만 나열 (nervous, happy, sad). 반드시 해부학적 묘사로 변환.
- 캐릭터 성격에 따라 같은 감정도 다르게 표현:
  - 소심한 캐릭터의 "화남" → 주먹 쥐고 떨지만 시선은 바닥
  - 당당한 캐릭터의 "화남" → 정면 응시, 턱 내밀기, 어깨 넓히기
- **만푸(manga symbols) 반드시 포함** (감정 강도가 높은 컷):
  만푸는 "그려지는 시각 오브젝트"로 묘사 (이모지 아님).
  - 놀람: "!! exclamation marks floating above head, eyes turned to white circles with shrunk pupils"
  - 분노: "ゴゴゴ menacing kanji symbols behind, anger vein mark on forehead and temple"
  - 당황: "multiple sweat drops spraying from forehead, spiral pattern on cheek"
  - 기쁨: "sparkle star effects around eyes, flower petals floating, rosy warm glow on cheeks"
  - 슬픔: "dark gloomy cloud hovering above head, blue vertical lines on face, soul-wisp floating out"
  - 자신감: "golden sparkle aura behind, confident star-shaped eye highlights"
  - 긴장: "small sweat beads on forehead, tight cross-hatching shadow on face, shaking motion lines on hands"
  - 코미디: "spiral dizzy eyes or white-out eyes, oversized reaction, floating ??? or !!! marks"
  맥락에 맞게 창의적으로 조합/변형. 감정이 있는 컷에서 만푸가 0개이면 안 됨.
- 감정 강도를 시퀀스에 맞게 조절 (빌드업 → 클라이맥스 → 여운)

### visualDescription — Mid-Action 프레임 캡처 + 만화적 시각 효과
- characters[] 인물만 주어로 사용 (비등장 인물은 "a figure", "someone")
- 모든 묘사는 "동작의 정확히 중간 지점"을 캡처한 것처럼 작성:
  **변환 공식:**
  ❌ 정적: "she drinks coffee"
  ✅ mid-action: "she is bringing the cup to her lips, cup 2cm from mouth, eyes looking over the rim at someone, other hand folding a napkin"
  ❌ 정적: "he opens the door"
  ✅ mid-action: "his hand pressing the door handle downward, door cracked open 3cm with hallway light spilling through, one foot mid-step over threshold"
  **필수 포함 요소 (매 컷):**
  1. 손이 무엇과 상호작용하고 있는지 (소품/의류/신체 부위)
  2. 동작의 방향과 속도감 (빠르면 모션블러 암시, 느리면 정지 프레임 느낌)
  3. 주변 물리 반응 (바람에 날리는 머리카락, 흔들리는 음료, 펄럭이는 옷자락)
  4. 감정을 드러내는 무의식적 미세 행동 (손톱 깨물기, 다리 떨기, 목 만지기)
- **만화적 시각 효과 필수 포함** (감정 강도에 비례):
  - 놀람/충격: "with !! marks floating above, eyes turned to white circles, sweat drops spraying"
  - 분노: "with ゴゴゴ menacing kanji floating behind, dark shadow on upper face, anger vein on temple"
  - 기쁨: "with sparkle particles radiating, flower petals floating, rosy warm glow on cheeks"
  - 당황: "with giant sweat drop on temple, wavy embarrassment lines on cheek, steam from head"
  - 슬픔: "with dark gloomy cloud hovering above, blue vertical lines on face, soul-wisp floating out"
- 25-50 words. 연속 컷 반복 금지.

### characterPose — 해부학적 동적 포즈 (이미지 AI가 정확히 재현할 수 있는 수준)
- 4파트 구조로 작성. 각 파트에 각도/방향/힘의 방향을 명시:
  - WEIGHT: 무게중심 위치, 기울기 각도(degrees), 어느 발에 하중, 전체 실루엣 형태
  - ARMS: 양팔 각각의 위치(올림/내림/꺾임), 손의 상태(주먹/편손/잡기/가리키기), 팔꿈치 방향
  - HEAD: 고개 각도(끄덕임/기울임/돌림), 시선 방향(정면/위/아래/좌우), 목 긴장도
  - LEGS: 양다리 각도, 무릎 상태(펴짐/굽힘), 발 방향, 스탠스(넓게/좁게/비대칭)
- 25-50 words. "Mid-action" 원칙: 정지 사진이 아니라 동작 중간 프레임처럼 묘사.
- insert/transition 컷은 빈 문자열 유지.
- **금지**: "standing", "sitting" 같은 단순 자세 서술. 반드시 구체적 관절 상태 포함.
- 연속 컷에서 같은 포즈 반복 금지. 이전 컷과 확실히 다른 실루엣을 만들어라.

## 출력: 동일 JSON 배열. id + emotionBeat + visualDescription + characterPose만.`;

    const result = await callClaude(systemPrompt, userPrompt, {
        temperature: 0.7,
        maxTokens: 16384,
    });

    let rawParsed: any;
    try {
        const cleaned = result.text
            .replace(/```json\s*/g, '').replace(/```\s*/g, '')
            .trim();
        rawParsed = JSON.parse(cleaned);
    } catch (e) {
        console.error('[enrichContiCuts] JSON 파싱 실패:', e, '\n원문:', result.text.slice(0, 200));
        rawParsed = [];
    }
    // Claude가 배열을 객체로 감쌀 수 있음: { cuts: [...] } 또는 { enrichedCuts: [...] }
    const enriched: Array<{ id: string; emotionBeat: string; visualDescription: string; characterPose: string }> =
        Array.isArray(rawParsed) ? rawParsed
        : Array.isArray(rawParsed?.cuts) ? rawParsed.cuts
        : Array.isArray(rawParsed?.enrichedCuts) ? rawParsed.enrichedCuts
        : [];

    const enrichedCuts = contiCuts.map(original => {
        const match = enriched.find(e => e.id === original.id);
        if (match) {
            return {
                ...original,
                emotionBeat: match.emotionBeat || original.emotionBeat,
                visualDescription: match.visualDescription || original.visualDescription,
                characterPose: match.characterPose || original.characterPose,
            };
        }
        return original;
    });

    return { enrichedCuts, tokenCount: result.totalTokens || 0 };
}

// ─── 온디맨드 감정 강화 (1컷 단위) ─────────────────────────────────

const INTENSIFY_SYSTEM = `You are an expert acting coach for manga/anime storyboards.
Your task: Take ONE storyboard cut and push the emotion HARDER — bigger gestures, stronger facial expressions, more dramatic body language, more manga visual effects.

You are given surrounding cuts for CONTEXT ONLY. Only output the intensified version of the TARGET cut.

RULES:
- emotionBeatIntense: Keep "한국어 — FACE: ... | UPPER: ... | LOWER: ..." format.
  Push EVERY element more extreme than the original:
  - FACE: wider eyes, more exaggerated mouth, more visible manga effects (!! marks, anger veins, spiral eyes, white-out eyes)
  - UPPER: bigger arm gestures, more dramatic shoulder angles, hands in more extreme positions
  - LOWER: more dynamic weight shift, wider/more dramatic stance, more energy in legs
  - MANDATORY manga symbols (만푸): At least 2 manga visual effects per intense cut.
    Describe as drawn visual objects: "!! floating above head", "anger vein pulsing on temple", "sweat drops spraying outward", "ゴゴゴ kanji floating behind", "sparkle particles radiating"

- visualDescriptionIntense: Same action pushed to MAXIMUM manga energy. Mid-action freeze frame at peak moment.
  Include: physical impact effects (coffee splashing in arc, papers flying, hair whipping), manga FX (speed lines, impact stars, emotion particles), clothing/environment reactions (tie fluttering, curtains billowing). 30-60 words.

- characterPoseIntense: Dramatically amplified pose, 30-50 words. Use WEIGHT/ARMS/HEAD/LEGS 4-part structure.
  Push every angle further — wider stance, more extreme lean, bigger gestures, more dramatic silhouette. Think "manga key frame at climax moment."

- Consider character personality: a shy character intensifies differently than a bold one.
- Consider emotional flow: the intensification should feel natural given the surrounding cuts.
- Output ONLY the JSON object. No markdown, no explanation.`;

export async function intensifyCut(
    targetCut: ContiCut,
    surroundingCuts: ContiCut[],
    characterBibles: CharacterBible[],
    scenarioAnalysis: ScenarioAnalysis,
): Promise<{ intensified: { emotionBeatIntense: string; visualDescriptionIntense: string; characterPoseIntense: string }; tokenCount: number }> {

    const charSummary = characterBibles.map(b =>
        `- ${b.koreanName} (${b.gender}): ${b.personalityProfile?.core || ''}, ${b.personalityProfile?.physicalMannerisms || ''}`
    ).join('\n');

    const cutsContext = surroundingCuts.map(c => {
        const isTarget = c.id === targetCut.id;
        return `${isTarget ? '>>> TARGET >>> ' : ''}[${c.id}] characters=${JSON.stringify(c.characters)} narration="${c.narration}" emotionBeat="${c.emotionBeat}" visualDescription="${c.visualDescription}" characterPose="${c.characterPose || ''}"${isTarget ? ' <<< TARGET <<<' : ''}`;
    }).join('\n');

    const prompt = `## Context
Genre: ${scenarioAnalysis.genre || 'drama'}
Tone: ${scenarioAnalysis.tone || 'emotional'}

## Characters
${charSummary}

## Sequence (target cut marked with >>>)
${cutsContext}

## Few-shot Example
INPUT: emotionBeat="당황 — FACE: wide eyes, blush | UPPER: hands up | LOWER: stepping back"
OUTPUT: {
  "emotionBeatIntense": "당황/충격 — FACE: eyes exploded to white circles with shrunk pinpoint pupils, eyebrows launched skyward, mouth dropped into perfect O shape, bright crimson blush flooding both cheeks and ear tips, !! exclamation marks bursting above head, 3-4 sweat drops spraying from forehead in all directions | UPPER: both arms shot upward with fingers splayed wide in maximum shock, shoulders hiked up to earlobes, torso jolting backward with visible recoil arc, papers flying from released grip | LOWER: weight slammed to back foot, one knee buckling from impact, toes curling inside shoes, opposite foot lifting off ground mid-stumble",
  "visualDescriptionIntense": "exact freeze-frame of face-first collision, her cheek pressing into soft belly creating visible fabric indent, hair whipping upward from impact force, apron strings flying, !! marks and star bursts at collision point, speed lines radiating outward, multiple items scattering mid-air from the shock, background characters frozen mid-turn to look, 45 words",
  "characterPoseIntense": "WEIGHT: rocked 25 degrees backward from impact, center of gravity fully on heels, about to lose balance | ARMS: both thrown outward and upward at 45 degrees, fingers maximally splayed, objects flying from released grip | HEAD: chin jerked sharply upward, neck extended, eyes looking down at point of contact | LEGS: left foot barely planted, right foot lifted 10cm off ground mid-stumble, knees buckled at 30 degrees"
}

## Task
Intensify the TARGET cut. Push the emotion harder while keeping it believable for these characters.

Output JSON:
{
  "emotionBeatIntense": "한국어 — FACE: extreme manga expression with 만푸 effects... | UPPER: dramatic arm/hand gestures... | LOWER: dynamic weight shift and stance...",
  "visualDescriptionIntense": "MAXIMUM manga energy mid-action description with physical impact effects and manga FX, 30-60 words",
  "characterPoseIntense": "WEIGHT: extreme lean... | ARMS: dramatic gesture... | HEAD: intense angle... | LEGS: wide dynamic stance... 30-50 words"
}`;

    const result = await callTextModel(INTENSIFY_SYSTEM, prompt, { temperature: 0.7, maxTokens: 2048 });
    const parsed = parseJsonResponse<{ emotionBeatIntense: string; visualDescriptionIntense: string; characterPoseIntense: string }>(result.text, 'intensifyCut');

    return {
        intensified: {
            emotionBeatIntense: parsed.emotionBeatIntense || '',
            visualDescriptionIntense: parsed.visualDescriptionIntense || '',
            characterPoseIntense: parsed.characterPoseIntense || '',
        },
        tokenCount: result.tokenCount,
    };
}
