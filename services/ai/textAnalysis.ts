// services/ai/textAnalysis.ts — 텍스트 분석 함수
// geminiService.ts에서 분리됨. 파이프라인/수정/포맷은 별도 파일로 재분리.

import { CharacterDescription, Scene, Cut, Gender, EditableScene, EditableCut, EnrichedBeat } from '../../types';
import { callTextModel, callTextModelStream, callVisionTextModel, parseJsonResponse, SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, SFW_SYSTEM_INSTRUCTION, dataUrlToBlob, blobToBase64 } from './aiCore';

export const analyzeHairStyle = async (imageDataUrl: string, characterName: string, seed?: number): Promise<{ hairDescription: string, facialFeatures: string, tokenCount: number }> => {
    const { blob, mimeType } = await dataUrlToBlob(imageDataUrl);
    const imageBase64 = await blobToBase64(blob);

    const prompt = `
# Role: Character Visual DNA Extractor (Style-Independent)
# Task: Extract ONLY the features that must remain consistent across different art styles.
# DO NOT describe art style, body proportions, face shape, or eye size — these change with art style.

Analyze this character image and return JSON:

{
  "hair": "Detailed hair description: color with HEX code, cut type (bob/ponytail/pixie/etc), length, bangs style, texture (straight/wavy/curly), and ANY hair accessories (ribbons, pins, clips) with their color and position. Example: 'Chin-length black (#1A1A2E) bob, blunt cut, side-swept bangs covering right eyebrow, straight texture, small red hairpin on left side above ear'",
  "colorPalette": {
    "hair": "#hexcode",
    "eyes": "#hexcode",
    "skin": "#hexcode"
  },
  "distinctiveMarks": "Comma-separated list of: moles (with position), glasses (shape+color), scars, piercings, freckles, birthmarks, tattoos. Write 'none' if no distinctive marks."
}

CRITICAL RULES:
1. Hair description: 15-30 words. Include HEX color code. Be specific about cut and accessories.
2. HEX codes: Extract from the LARGEST AREA of base color, NOT from highlights or light reflections.
3. Distinctive marks: Be precise about POSITION (left/right, above/below).
4. DO NOT mention: art style, body type, face shape, eye size, proportions, clothing.
5. Respond with ONLY the JSON object. No markdown, no explanation.
6. ANIME/CHIBI COLOR RULES: In anime, chibi, or cartoon-style images, blue/purple highlights on dark hair are artistic convention for lighting — NOT the actual hair color. Ignore these highlights entirely.
7. BLACK vs DARK BROWN: If the hair appears very dark with no clearly visible brown tone, classify as black (#1A1A2E or similar). Only use "dark brown" when the brown tone is clearly and obviously visible across the main hair area, not just in highlights or edges.
8. HIGHLIGHT AWARENESS: Glow effects, sparkle overlays, and rim lighting can make black hair appear brown or warm-toned. Always judge color from the shadowed/mid-tone areas of the hair, not the brightest spots.

Character Name: ${characterName}
`;

    const result = await callVisionTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, prompt, imageBase64, mimeType, { seed });

    try {
        const parsed = JSON.parse(result.text.replace(/```json\n?|```/g, '').trim());
        const hairDesc = parsed.hair || 'Standard hairstyle';
        const palette = parsed.colorPalette || {};
        const marks = parsed.distinctiveMarks || 'none';

        const colorInfo = palette.hair ? `Hair:${palette.hair} Eyes:${palette.eyes || 'N/A'} Skin:${palette.skin || 'N/A'}` : '';
        const featuresStr = marks !== 'none' ? `${colorInfo}. Distinctive: ${marks}` : colorInfo;

        return {
            hairDescription: hairDesc,
            facialFeatures: featuresStr || 'Match reference image facial features exactly',
            tokenCount: result.tokenCount
        };
    } catch {
        return {
            hairDescription: result.text.trim().substring(0, 200),
            facialFeatures: 'Match reference image facial features exactly',
            tokenCount: result.tokenCount
        };
    }
};


export const analyzeCharacterVisualDNA = analyzeHairStyle;

// [NEW] Helper function to analyze global story context
async function analyzeStoryContext(script: string, seed?: number): Promise<{ context: string, tokenCount: number }> {
    try {
        const prompt = `
        # Role: Senior Story Editor / Narrative Consultant
        # Task: Analyze the provided script to extract the "Global Narrative Context" for a visual director.
        # Output Format: A concise summary (Korean) covering:
        1. **Core Theme & Tone** (e.g., Melancholic Romance, High-Octane Action, Noir Thriller)
        2. **Key Narrative Arc** (Beginning -> Climax -> Ending flow)
        3. **Dominant Emotions** (The overarching emotional journey)
        4. **Visual Key** (Keywords for lighting, color palette, and atmosphere)

        This summary will be used to ensure every individual cut aligns with the bigger picture.

        # Script:
        \`\`\`
        ${script}
        \`\`\`
        `;

        const result = await callTextModel('You are a senior story editor and narrative consultant.', prompt, {
            temperature: 0.7,
            seed,
        });

        return { context: result.text, tokenCount: result.tokenCount };
    } catch (error) {
        console.warn("analyzeStoryContext failed, using fallback:", error);
        return {
            context: "전체적인 맥락을 분석하는 중 오류가 발생했습니다. 개별 컷의 나레이션에 집중하여 연출을 진행합니다.",
            tokenCount: 0
        };
    }
}


export const enrichScriptWithDirections = async (
    script: string,
    characterProfilesString?: string,
    locationRegistry?: string[],
    logline?: string,
    contentFormat?: 'ssul-shorts' | 'webtoon' | 'anime',  // ★ 콘텐츠 포맷
    seed?: number,
    onProgress?: (textLength: number) => void
): Promise<{ enrichedScript: string, enrichedBeats: EnrichedBeat[], tokenCount: number }> => {

    // ── 모드 자동 감지 ──
    const isDetailed = /\(등장인물:|이미지프롬프트:|연출의도:\)/i.test(script);

    const format = contentFormat || 'ssul-shorts';

    const SSUL_SHORTS_MISSION = `
# 썰쇼츠 연출 감독 (DoReMiSsul Director)

## 미션
유튜브 쇼츠 60초 안에:
- 3초 안에 시청자를 잡고 (Hook)
- 감정을 에스컬레이트하며 이탈을 막고 (Escalate)
- 엔딩에서 좋아요/공유/댓글을 유도한다 (Punch Out)

## 타겟
20~50대 남성. 공감 포인트: 연애, 직장, 가족, 자존심, 허세와 현실의 갭.
톤: 과도한 소녀 감성 ❌ → 쿨하고 건조한 나레이션. 담담하게 깔다가 한방.
반응 유도: "아 나도 저래ㅋㅋ" / "와 사이다" / "미쳤다 진짜"

## 표현 수위
만화적 과장이 기본. 과장된 리액션, 만화 기호(땀방울, 느낌표, 물음표), 빠른 감정 전환.
모든 표정/포즈는 "유튜브 썸네일에 쓸 수 있을 정도로" 강하고 명확해야 함.
`;

    const WEBTOON_MISSION = `
# 웹툰 연출 감독 (DoReMiSsul Director — Webtoon Mode)

## 미션
세로스크롤 웹툰의 1화분을 연출:
- 첫 3컷 안에 상황을 세팅하고
- 대사 중심으로 캐릭터 간 텐션을 빌드업하며
- 마지막 컷에서 다음화가 궁금하게 끊는다

## 타겟
10~40대 남녀. 장르에 따라 유동적.
톤: 캐릭터 대사가 주도. 나레이션은 장면 전환/내면 독백에만.

## 표현 수위
미묘한 표정 변화가 핵심. 눈, 입술, 손의 미세한 연기.
과장된 만화 기호는 코미디 장면에만 선별적으로.
클로즈업이 많고, 배경은 감정에 집중하기 위해 단순화.
대사 없는 무음 컷의 임팩트가 가장 중요.
`;

    const ANIME_MISSION = `
# 애니메이션 연출 감독 (DoReMiSsul Director — Anime Mode)

## 미션
극장판 애니메이션 품질의 시퀀스를 연출:
- 환경과 분위기 설정에 시간을 투자하고
- 캐릭터의 감정을 대사보다 "보이는 공기"로 전달하며
- 매 컷이 스크린샷으로 쓸 수 있는 작화 품질

## 타겟
애니메이션 팬. 작화/연출 감상이 핵심.
톤: 시네마틱. 빛, 바람, 공기, 소리가 감정을 전달.

## 표현 수위
미세한 표정과 환경 연출이 핵심. 바람에 날리는 머리카락, 창문 밖 빛의 변화.
만화 기호 최소화 (서늘한 시선만으로 긴장을 표현).
establish 컷(환경/장소)을 적극 활용. 배경이 캐릭터만큼 중요.
카메라 무브먼트 지시가 상세해야 함 (트래킹, 패닝, 줌인 속도).
`;

    const missionStatement = format === 'webtoon' ? WEBTOON_MISSION
        : format === 'anime' ? ANIME_MISSION
        : SSUL_SHORTS_MISSION;

    const directionGrammar = `
## 연출 문법 4원칙

1. 보여주고 설명해서 확인사살 (Show → Tell → Kill)
   - 나레이션 전에 시각으로 먼저 보여줌 (인서트/리액션 삽입 지시)
   - 나레이션이 뒤에서 설명하며 확인사살
   - 충격 대사 직전에 무음 리액션으로 뜸 들이기
   예: [인서트: 남자들 시선 2컷] → "남자들이 노려봐" → [인서트: 배 클로즈업] → "뱃살이 좀 있고"

2. 감정 롤러코스터 (Emotional Whiplash)
   - 연속 컷의 감정 낙차를 의도적으로 극대화
   - 자랑 직후 민망, 행복 직후 충격
   - 갭이 클수록 웃기거나 충격적
   예: 여주 자신만만 머리 넘기기 [Sparkling] → 바로 남주 배 클로즈업 [Gloom]

3. 3초 낚시, 떡밥, 감정 빵 엔딩 (Hook → Bait → Punch Out)
   오프닝: 첫 1~2줄에 가장 자극적/궁금한 장면 배치 (쇼츠 3초 룰)
   떡밥: 씬 전환 시 불안 요소 하나 남기기
   엔딩: 썰의 핵심 감정을 가장 강하게 터뜨리며 끝냄
   - 코믹: 가장 웃긴 장면 마지막 + 과장 극대화
   - 감동: 가장 애틋한 순간 + 슬로우 클로즈업
   - 사이다: 통쾌한 한마디 + 로우앵글 파워샷
   핵심: 마지막 표정이 영상의 여운 = 좋아요/댓글 유도

4. 숨 고르기 (Tension Rhythm)
   - 긴장: 짧은 컷 연속 (클로즈업, 빠른 전환)
   - 이완: 긴 컷 (와이드, 호흡)
   - 시간 점프: 인서트 몽타주 2~3컷
   - 클라이맥스 직전 가장 짧은 컷 연사 → 정적 1컷 브레이크
`;

    const characterContext = characterProfilesString
        ? `\n## 캐릭터 의상 데이터 (참조용 — 의상 키워드 활용)\n\`\`\`json\n${characterProfilesString}\n\`\`\``
        : '';

    const locationContext = (locationRegistry && locationRegistry.length > 0)
        ? `\n## 장소 레지스트리 (참조용)\n연출 설계 시 장소명은 다음 목록을 그대로 사용하라:\n${locationRegistry.join(', ')}\n`
        : '';

    const loglineContext = logline?.trim() ? `\n## 이 썰의 핵심: ${logline}\n` : '';

    // ★ 포맷별 emotion 가이드
    const emotionGuide = format === 'webtoon' ? `
- emotion: 감정 비트 — 웹툰 감정 목록에서 선택:
  기본: "일상", "긴장", "충격", "분노", "슬픔", "기쁨", "Comedy"
  미묘한 연기: "미세떨림", "서늘", "잔잔한분노", "체념", "의미심장", "씁쓸"
  ★ 웹툰에서는 과장된 감정("Sparkling", "Shock")보다 미묘한 감정이 기본.
  ★ 모든 emotion은 direction에 구체적 표정 묘사를 동반:
    ❌ "슬픔" + direction: "슬픈 표정" (추상적)
    ✅ "슬픔" + direction: "고개 숙인, 입술 살짝 깨문, 눈 밑 그림자, 클로즈업" (물리적)
` : format === 'anime' ? `
- emotion: 감정 비트 — 애니메이션 감정 목록에서 선택:
  기본: "일상", "Tension", "Shock", "Relief", "Comedy", "Gloom"
  시네마틱: "여운", "공기감", "적막", "온기", "서늘한빛", "황혼", "감정급반전"
  ★ 애니메이션에서는 감정을 "빛/공기/환경"으로 표현:
    "여운" → direction에 "석양빛, 느린 페이드, 바람에 날리는 머리카락"
    "공기감" → direction에 "먼지 입자 보이는 역광, 정적, 깊은 피사계심도"
    "적막" → direction에 "와이드샷, 캐릭터 작게, 넓은 배경, 차가운 색온도"
  ★ 만화 기호(땀방울, 느낌표) 최소화. 대신 조명/카메라/환경으로 감정 전달.
` : `
- emotion: 감정 비트 — 아래 목록에서 선택. ★ 각 감정의 "시각 연기"를 direction에 반드시 반영하라.
  기본: "Sparkling", "Gloom", "Shock", "Comedy", "Tension", "Relief", "일상"
  캐릭터 연기 (★ 쿨/도발적 캐릭터 전용 — Sparkling 대신 사용):
    "능청" → direction에 "과장된 한쪽 smirk, 턱 살짝 올린, 반쯤 감은 눈, 자신만만한 자세" 포함
    "장난/지배" → direction에 "능글맞은 표정, 턱 까딱, 명령하는 손짓, 로우앵글 파워샷" 포함
    "단호" → direction에 "날카로운 눈빛, 팔짱, 입 꾹 다문, 정면 응시" 포함
    "추궁" → direction에 "눈 가늘게 뜬, 고개 살짝 숙여 올려다보는, 서늘한 시선" 포함
    "소유욕" → direction에 "소유하듯 어깨에 손, 영역 표시하는 자세, 도발적 미소" 포함
  공통: "체념", "감정급반전"
  ★ "Sparkling" 사용 기준: 순수한 설렘, 기쁨, 감탄에만. 쿨/도발적 캐릭터가 "잘해주는" 장면 ≠ Sparkling.
  ★ 모든 emotion은 direction에 최소 1개의 구체적 표정/포즈 묘사를 동반해야 함.
    ❌ direction: "능청스러운 톤" (추상적 — 이미지 AI가 해석 못함)
    ✅ direction: "한쪽 입꼬리만 올린 smirk, 턱 살짝 들어올린, 클로즈업" (물리적 — 이미지 AI가 그림)
`;

    // ★ Phase 12: JSON 구조화 출력 공통 형식
    const jsonOutputFormat = `
## [중요] 출력 형식 — JSON 배열 (반드시 준수)
아래 형식의 JSON 배열만 출력하라. 설명이나 마크다운 코드펜스 없이 순수 JSON만.

각 항목의 필드:
- id: 1부터 시작하는 순번 (number)
- type: "narration" (원본 대사) | "insert" (인서트컷) | "reaction" (리액션컷)
- text: narration이면 원본 대사 그대로, insert/reaction이면 시각 묘사 (한국어)
- beat: 구조 태그 — "훅/설정", "Show→Tell", "Whiplash→감정", "Bait/떡밥", "PunchOut", "브레이크", "설정" 등
${emotionGuide}
- direction: 연출 노트 — 앵글, FX, 소품, 구체적 표정/포즈 묘사 (없으면 빈 문자열)
  ★ insert 컷(사물/화면만)에는 반드시 "NO characters" 포함
  ★ 캐릭터가 쿨/도발적 성격이면 "NOT warm, NOT gentle" 네거티브 추가
  ★ 당황/놀람이지만 빨개지면 안 되는 경우 "NO blushing" 추가

### direction 작성의 철학 — "감정을 쓰지 말고 물리적 묘사를 써라"
AI 이미지 생성 모델은 "도도한", "슬픈", "자신만만한" 같은 추상 감정을 이해하지 못한다.
반드시 신체 동작, 표정 근육, 자세, 소품, 만화 기호로 변환해서 기술하라.

❌ 나쁜 예 (추상적 — 이미지 AI가 해석 못함):
- "당황한 표정" / "서늘한 시선" / "능청스러운 톤" / "쿨한 표정"

✅ 좋은 예 (물리적 — 이미지 AI가 그대로 그림):
- "눈을 최대한 크게 뜨고 입이 벌어진 채 양손을 벌리고 땀방울이 사방으로 튀는"
- "눈을 반쯤 감고 한쪽 입꼬리만 올린 smirk, 턱을 살짝 들어올리고 팔짱 낀 자세"
- "눈썹을 찌푸리고 입을 꾹 다물고 팔짱, 정면 응시, ゴゴゴ menacing aura"
- "고개를 푹 숙이고 어깨를 축 늘어뜨린, 머리 위에 먹구름 만화 효과"

### 만화 기호(만푸) 적극 활용 — 썰쇼츠의 핵심 표현 도구:
- 놀람: !, ?, 땀방울, 눈 하얗게, 소용돌이 눈
- 분노: 혈관 마크, ゴゴゴ, 어두운 오라, 눈 빨갛게
- 당황: 땀방울 폭발, 세로줄, 식은땀, ???? 물음표
- 자신만만: 반짝이, 전구, 파워 포즈 후광
- 슬픔/체념: 먹구름, 영혼 빠져나가는 효과, 파란 세로선
- 코미디: 소용돌이 눈, 과장된 입 O자, $$$ 기호, 넘어지는 포즈

예시:
[
  { "id": 1, "type": "narration", "beat": "훅/설정", "text": "남친이랑 데이트를 하면", "emotion": "일상", "direction": "미디엄 트래킹샷, 번화가 네온" },
  { "id": 2, "type": "insert", "beat": "Show→Tell", "text": "지나가는 남자1 시선 — 여주를 훑어보는 눈", "emotion": "Tension", "direction": "클로즈업, 시선 추적" },
  { "id": 3, "type": "narration", "beat": "Show→Tell", "text": "남자들이 죄다 쟤를 노려봐", "emotion": "Tension", "direction": "카메라 여주 POV→주변 남자들" },
  { "id": 4, "type": "narration", "beat": "Sparkling", "text": "내가 좀 이쁜 편이거든", "emotion": "자신만만", "direction": "로우앵글, 머리 넘기기, Sparkling Aura" },
  { "id": 5, "type": "insert", "beat": "Whiplash→Gloom", "text": "남친 배 클로즈업", "emotion": "감정급반전", "direction": "클로즈업, Vertical Gloom Lines" },
  { "id": 6, "type": "narration", "beat": "PunchOut", "text": "근데 그게 좋아", "emotion": "반전감동", "direction": "남주 표정 클로즈업, Soft Bloom" }
]
`;

    let modePrompt: string;

    if (isDetailed) {
        modePrompt = `
## 모드: 상세대본 검수 (Review & Enhance)
이미 연출 태그가 포함된 대본입니다.
4원칙 기준으로 검수하고 부족한 부분만 보완하십시오.

### 검수 체크리스트:
1. [Hook 검사] 첫 1~2줄이 충분히 자극적/궁금한가?
2. [Whiplash 검사] 연속 항목 간 감정 대비가 충분한가?
3. [Punch Out 검사] 엔딩이 감정을 강하게 터뜨리는가?
4. [Rhythm 검사] 긴장-이완 리듬이 단조롭지 않은가?

### 규칙:
- 잘 된 부분은 절대 건드리지 않음
- 원본 대사 텍스트(text 필드)는 단 한 글자도 수정하지 마십시오
- 보완이 필요하면 beat/emotion/direction만 보강하거나, 새 insert/reaction 항목을 삽입
- 인서트/리액션은 전체의 30% 이하로 유지
`;
    } else {
        modePrompt = `
## 모드: 기본대본 → 상세 연출 대본 변환 (Full Direction)
뼈대만 있는 대본입니다. 4원칙을 적용해서 구조화 연출 대본으로 변환하십시오.

### 변환 규칙:
1. 각 원본 대사 줄마다 beat/emotion/direction을 채워서 narration 항목으로 생성
2. 필요한 곳에 insert/reaction 항목을 새로 삽입
3. 원본 대사 텍스트는 단 한 글자도 수정하지 마십시오
4. 메타데이터 줄('(', '['로 시작하는 장소/인물 정보)은 무시하고 출력에 포함하지 마라
5. 인서트/리액션은 전체의 30% 이하로 유지
6. 60초 쇼츠 기준 총 항목 수가 과도하지 않게 조절 (원본 줄 수 × 1.5 이하)
`;
    }

    // ★ 포맷별 추가 규칙
    const formatRules = format === 'webtoon' ? `
### 웹툰 추가 규칙:
- 대사가 스토리를 주도. 나레이션은 장면 전환과 내면 독백에만 사용
- 대사 핑퐁 허용 (3연속 이상도 OK — 웹툰은 대사가 엔진)
- 무음 reaction 컷을 감정 전환점에 적극 배치 (대사 없이 표정만으로 1컷)
- 총 항목 수 제한 없음 (웹툰은 세로스크롤이라 분량 자유)
` : format === 'anime' ? `
### 애니메이션 추가 규칙:
- establish 컷(환경/장소 와이드샷)을 장면 전환마다 반드시 삽입
- insert 컷으로 환경 디테일(바람, 빛, 소품) 적극 활용
- 클라이맥스 직전에 "정적" 브레이크 컷 필수 (무음 + 와이드)
- direction에 카메라 무브먼트를 상세히 (트래킹 속도, 줌인 타이밍 등)
- 인서트/리액션은 전체의 40% 이하로 유지
- 총 항목 수: 원본 줄 수 × 2.5 이하
` : `
### direction 네거티브 규칙 (AI 이미지 생성용 — 필수):
- insert 컷(사물/화면/소품만 보여주는 컷)의 direction에는 반드시 "NO characters" 포함
- reaction 컷에서 캐릭터가 "넋나간/멍한/굳은" 표정이면 direction에 "NO blushing, NO open mouth, frozen expression" 포함
- 쿨/도발적 캐릭터의 direction에는 "NOT warm, NOT gentle, NOT soft, smirk NOT smile" 포함
- 당황하는 남성 캐릭터의 direction에는 "NO blushing, NO red cheeks" 포함

### 캐릭터 감정 일관성 (★ 가장 중요):
- 대본 첫 줄부터 마지막 줄까지 캐릭터의 emotion/direction 톤이 일관되어야 함
- 특히 엔딩 PunchOut 구간에서 갑자기 "달콤한", "로맨틱한", "따뜻한" 톤으로 전환하지 마라
- 쿨한 캐릭터는 엔딩에서도 쿨해야 함
`;

    modePrompt += formatRules;

    const prompt = `
${missionStatement}
${directionGrammar}
${characterContext}
${locationContext}
${loglineContext}
${modePrompt}
${jsonOutputFormat}

# 원본 대본:
\`\`\`
${script}
\`\`\`
`;

    const systemInstruction = `You are the DoReMiSsul Director — a YouTube Shorts directing AI specialized in 썰(ssul/story) content.
You MUST respond with a raw JSON array only. No markdown fences, no backticks, no explanation.
Start with [ and end with ]. Every original narration line must appear in your output text field exactly as written.`;

    const result = await callTextModel(systemInstruction, prompt, {
        responseMimeType: 'application/json',
        temperature: 0.7,
        seed,
        maxTokens: 16384,
    });

    if (onProgress) onProgress(result.text.length);

    // ★ JSON 파싱 + 안전 정규화
    const raw = parseJsonResponse<EnrichedBeat[] | { beats: EnrichedBeat[] }>(result.text, 'enrichScriptWithDirections');
    const beats: EnrichedBeat[] = (Array.isArray(raw) ? raw : (raw as any).beats || []).map((b: any, i: number) => ({
        id: b.id ?? (i + 1),
        type: (['narration', 'insert', 'reaction'].includes(b.type) ? b.type : 'narration') as EnrichedBeat['type'],
        text: String(b.text || ''),
        beat: String(b.beat || ''),
        emotion: String(b.emotion || ''),
        direction: String(b.direction || ''),
    }));

    // 레거시 호환: enrichedScript (텍스트 형태)
    const enrichedScript = beats.map(b => {
        const prefix = b.type === 'insert' ? `[인서트: ${b.text}]` : b.type === 'reaction' ? `[리액션: ${b.text}]` : `[${b.beat}] ${b.text}`;
        return `${prefix} [${b.emotion}]${b.direction ? ` [연출: ${b.direction}]` : ''}`;
    }).join('\n');

    return { enrichedScript, enrichedBeats: beats, tokenCount: result.tokenCount };
};


export const regenerateSingleCutDraft = async (
    cut: EditableCut,
    gender: Gender,
    seed?: number
): Promise<Partial<EditableCut> & { tokenCount: number }> => {
    const prompt = `
# Role: YouTube Shorts Visual Director (Cinematographer)
# Task: Propose a DIFFERENT and SPECIFIC visual direction for this cut.
# Current Cut Context:
- **Narration:** "${cut.narrationText}"
- **Characters:** ${cut.character.join(', ')}
- **Location:** ${cut.location}
# Output JSON Schema:
{
"directorialIntent": "string (Specific Visual Direction: [Angle/Lighting] + Action. NO abstract emotions)",
"sceneDescription": "string (Detailed Korean visual description including camera and lighting)",
"characterPose": "string (Specific body position: describe limb placement, head direction, weight center, hand position. Match the scene mood.)",
"characterEmotionAndExpression": "string (New exaggerated facial expression)",
"otherNotes": "string (New camera angle/technique)"
}
`;
    const result = await callTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION, prompt, {
        responseMimeType: 'application/json',
        seed,
        temperature: 0.8,
    });
    const data = parseJsonResponse<Partial<EditableCut>>(result.text, 'regenerateSingleCutDraft');
    return { ...data, tokenCount: result.tokenCount };
};


export const analyzeCharacters = async (script: string, gender: Gender, isDetailedScript: boolean = false, seed?: number, onProgress?: (textLength: number) => void): Promise<{ characters: { [key: string]: CharacterDescription }, firstScenePrompt: string, title: string, tokenCount: number }> => {

    let sceneAnalysisInstruction = `
3. Design detailed outfits for EVERY UNIQUE SCENE/LOCATION identified in the script.
# 장면 및 장소 전수 조사 (CRITICAL):
- 대본 전체를 읽고 [SCENE], [장소: ...], 또는 장소 변화가 일어나는 모든 지점을 파악하십시오.
- **분석된 모든 장면에 대해 캐릭터별 의상을 각각 생성해야 합니다.**
- **고유 장소 키 생성 (ABSOLUTE RULE):**
- 장소 키는 **'주인공의 방 (저녁)'** 처럼 **"공간명 (시간대)"** 형식으로 추론하고 정제해야 합니다. 단, 사용자가 '[장소: 헬스장/야외 (밤)]' 처럼 적어두었다면 그 텍스트 그대로 키로 사용하십시오.
- **[CRITICAL: LOCATION EXTRACTION GUARANTEE]**
- 원본 대본에 '[장소: A]', '[장소: B]' 처럼 명시적인 장소 태그가 여러 개 있다면, AI는 이를 임의로 병합하거나 생략해서는 절대 안 됩니다.
- 캐릭터가 여러 장소에 등장한다면, 'locations' 객체에 **각 장소별로 반드시 별도의 키를 생성**해야 합니다. (예: "헬스장/야외 (밤)": "운동복...", "술집 (밤)": "캐주얼...")
- 절대 여러 장소를 하나의 키로 묶거나(예: "헬스장 및 술집"), 일부 장소를 누락하지 마십시오. 대본에 등장하는 모든 고유 장소는 빠짐없이 추출되어야 합니다.
`;

    if (isDetailedScript) {
        sceneAnalysisInstruction += `
- **[상세 대본 모드 활성화]:** 사용자가 명시적으로 적어둔 '[장소: ...]' 태그들을 100% 신뢰하고, 하나도 빠짐없이 모두 'locations' 키로 등록하십시오. 대본에 등장하는 모든 장소 태그를 무조건 추출하여 개별 키로 만들어야 합니다.
`;
    }

    const prompt = `
Please analyze the following webtoon script.
1. Identify ALL characters (Protagonists, Supporting roles).
2. Create profiles for each identified character.
${sceneAnalysisInstruction}
# IDENTITY PRESERVATION PROTOCOL (CRITICAL):
- **OUTFIT STRING REUSE:** Once an outfit is defined for a character in a specific context (e.g., school uniform, military uniform), you MUST reuse the EXACT same detailed description string for every scene where they wear that outfit.
- **DO NOT SUMMARIZE:** Never simplify "Navy blue school blazer with gold buttons" to "school uniform".
- **DETAIL ENFORCEMENT:** Include fabric, fit, and specific colors with HEX codes.
# SINGLE SOURCE OF TRUTH (NEW):
- **ENGLISH ONLY:** Generate outfit descriptions ONLY in English. Do NOT generate Korean translations for outfits.
- Populate 'locations' with English descriptions.
- 'koreanLocations' field is NOT required, but if schema demands it, simply copy the English text into it.
# Output JSON Structure (CRITICAL):
{
"title": "Short title",
"firstScenePrompt": "Description",
"characters": {
 "character_id_1": {
 "koreanName": "Name",
 "koreanBaseAppearance": "...",
 "baseAppearance": "...",
 "gender": "male" | "female",
 "personality": "Detailed movement style and personality",
 "locations": { "Location Name": "Literal English outfit description" },
 "koreanLocations": { "Location Name": "Literal English outfit description" }
 },
 "character_id_2": { ... }
}
}
**Script:**
\`\`\`
${script}
\`\`\`
`;

    // Use Claude streaming for progress feedback
    const result = await callTextModelStream(
        SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nYou MUST respond with valid JSON only, no markdown fences.',
        prompt,
        onProgress,
        { seed, responseMimeType: 'application/json', maxTokens: 16384 }
    );
    
    const parsedJson = parseJsonResponse<{ characters: { [key: string]: CharacterDescription }, firstScenePrompt: string, title: string }>(result.text, 'analyzeCharacters');
    
    return {
        characters: parsedJson.characters,
        firstScenePrompt: parsedJson.firstScenePrompt,
        title: parsedJson.title,
        tokenCount: result.tokenCount,
    };
};


export const generateTitleSuggestions = async (script: string, seed?: number): Promise<{ titles: string[], tokenCount: number }> => {
    const prompt = `Analyze the script and generate 3 catchy viral YouTube-style Korean titles. Output JSON: { "titles": ["...", "...", "..."] }. Script: ${script}`;
    const result = await callTextModel(SFW_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed });
    const parsedJson = parseJsonResponse<{ titles: string[] }>(result.text, 'generateTitleSuggestions');
    return { titles: parsedJson.titles, tokenCount: result.tokenCount };
};



export const generateOutfitsForLocations = async (characterName: string, gender: Gender, signatureOutfitDescription: string, locations: string[], seed?: number): Promise<{ tokenCount: number, locationOutfits: { [location: string]: string } }> => {
    const prompt = `Design detailed outfits for locations: ${locations.join(', ')}. 
# Requirements:
1. Match the base style: ${signatureOutfitDescription}. 
2. Include HEX codes for every item.
3. Describe fabric textures and garment fit.
4. ABSOLUTELY NO mention of facial expressions, poses, or emotions. Describe the OUTFIT only.
5. **LITERAL CONSISTENCY:** Ensure the core elements of the uniform (blazer, tie, etc.) use the EXACT same words across all locations unless a change is logically required by the environment.
6. **ENGLISH ONLY:** Return descriptions ONLY in English.
7. Output JSON { "locationOutfits": { "Loc": "English description" } }`;
    const result = await callTextModel(SFW_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed });
    const parsed = parseJsonResponse<{ locationOutfits: { [location: string]: string } }>(result.text, 'generateOutfitsForLocations');
    return { locationOutfits: parsed.locationOutfits, tokenCount: result.tokenCount };
};


export const regenerateOutfitDescription = async (originalDescription: string, userRequest: string, characterName: string, gender: 'male' | 'female', seed?: number): Promise<{ newDescription: string, tokenCount: number }> => {
    const prompt = `Modify outfit. Original: ${originalDescription}, Request: ${userRequest}. 
Keep HEX codes and high physical detail. DO NOT include emotions or expressions. 
Output JSON { "newDescription": "..." } (English Only)`;
    const result = await callTextModel(SFW_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed });
    const parsed = parseJsonResponse<{ newDescription: string; }>(result.text, 'regenerateOutfitDescription');
    return { newDescription: parsed.newDescription, tokenCount: result.tokenCount };
};




export const regenerateImagePrompts = async (params: { narration: string; sceneSettingPrompt: string; originalImagePrompt: string; characters?: string[]; cameraAngle?: string; }, seed?: number): Promise<{ koreanImagePrompt: string; imagePrompt: string; tokenCount: number; }> => {
    const prompt = `Create high-quality AI prompt. JSON { "koreanImagePrompt": "...", "imagePrompt": "..." }. Context: ${params.narration}`;
    const result = await callTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed });
    return { ...parseJsonResponse<{ koreanImagePrompt: string; imagePrompt: string; }>(result.text, 'regenerateImagePrompts'), tokenCount: result.tokenCount };
};


export const generateLocationProps = async (
    location: string,
    characterProfiles: string,
    scriptContext: string,
    seed?: number
): Promise<{ ambientProps: string[]; keyProps: string[]; contextualProps: string[]; spatialDNA: string; tokenCount: number; }> => {

    const prompt = `
# Persona: AI Art Director & Set Dresser
# Task: Generate a detailed list of props for a specific location in a webtoon.
# Contextual Information:
- **Location:** ${location}
- **Character Profiles:** ${characterProfiles}
- **Script Snippets (Crucial for symbolic props):**
${scriptContext}
# Logic Pipeline:
1. **Analyze Context:** Based on the location name, character personalities, and ESPECIALLY the script snippets, brainstorm suitable props.
2. **Identify Symbolic Items:** Look for specific objects mentioned in the script or implied by the dialogue (e.g., "expensive coffee", "bill", "abandoned ring").
3. **Categorize Props:**
 * **ambientProps:** General background items. List 3-4 items.
 * **keyProps:** Items essential for potential character actions in this location (e.g., monitor, chair for a desk scene). List 2-3 items.
 * **contextualProps:** "Signature" items that reveal character personality, story irony, or emotional weight. Be creative and specific. (e.g., "a single luxury coffee cup", "a discarded receipt for a large amount"). List 1-2 unique items.
4. **Format Output:** Provide the result as a clean JSON object.
# Output JSON Schema:
{
"ambientProps": ["string"],
"keyProps": ["string"],
"contextualProps": ["string"],
"spatialDNA": "string"
}
# IMPORTANT: All string values MUST be on a single line. Do NOT use unescaped newlines inside strings.
`;
    const result = await callTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, {
        responseMimeType: 'application/json',
        seed,
        temperature: 0.5,
    });

    const parsed = parseJsonResponse<{ ambientProps: string[]; keyProps: string[]; contextualProps: string[]; spatialDNA: string; }>(result.text, 'generateLocationProps');
    return { ...parsed, tokenCount: result.tokenCount };
};

// ── [LEGACY] generateEditableStoryboardChunk + mergeMetaLines → textAnalysis.legacy.ts로 분리 (Phase 9) ──

/**
 * Normalizes a script so that each logical cut is exactly one line.
 * This prevents issues where "Cut 18" and the dialogue are treated as separate cuts.
 */

export const normalizeScriptCuts = (script: string): string => {
    if (!script) return "";
    
    const isCutMarker = (line: string) => {
        const t = line.trim();
        return /^(컷|cut|#)\s*\d+/i.test(t) || /^\d+\.$/.test(t);
    };
    
    const isSceneContext = (line: string) => {
        const t = line.trim();
        if (/^(scene|s#|씬)\s*\d+/i.test(t)) return true;
        if (/^\[?(장소|시간|배경)\s*[:：]/i.test(t)) return true;
        
        if (t.startsWith('[') && t.endsWith(']')) {
             if (/(등장인물|연출의도|이미지프롬프트)/.test(t)) return false;
             return true;
        }
        return false;
    };

    const isCutContext = (line: string) => {
        const t = line.trim();
        if (/^\[?(등장인물|연출의도|이미지프롬프트)\s*[:：]/i.test(t)) return true;
        if (t.startsWith('(') && t.endsWith(')')) return true;
        return false;
    };

    const lines = script.split('\n').map(l => l.trim()).filter(l => l !== '');
    
    let hasCutMarkers = false;
    for (const line of lines) {
        if (isCutMarker(line)) {
            hasCutMarkers = true;
            break;
        }
    }

    const normalizedBlocks: string[] = [];
    let currentSceneContext = "";
    let pendingCutContext = "";

    if (hasCutMarkers) {
        let currentCut = "";
        
        for (const line of lines) {
            if (isCutMarker(line)) {
                if (currentCut) {
                    normalizedBlocks.push(currentCut.trim());
                }
                currentCut = "";
                if (currentSceneContext) currentCut += currentSceneContext + " ";
                if (pendingCutContext) currentCut += pendingCutContext + " ";
                currentCut += line;
                pendingCutContext = "";
            } else if (isSceneContext(line)) {
                if (currentCut) {
                    normalizedBlocks.push(currentCut.trim());
                    currentCut = "";
                    currentSceneContext = line;
                } else {
                    currentSceneContext = currentSceneContext ? currentSceneContext + " " + line : line;
                }
            } else if (isCutContext(line)) {
                if (currentCut) {
                    currentCut += " " + line;
                } else {
                    pendingCutContext = pendingCutContext ? pendingCutContext + " " + line : line;
                }
            } else {
                if (currentCut) {
                    currentCut += " " + line;
                } else {
                    pendingCutContext = pendingCutContext ? pendingCutContext + " " + line : line;
                }
            }
        }
        if (currentCut) {
            normalizedBlocks.push(currentCut.trim());
        } else if (pendingCutContext || currentSceneContext) {
            const trailing = [currentSceneContext, pendingCutContext].filter(Boolean).join(" ");
            if (normalizedBlocks.length > 0) {
                normalizedBlocks[normalizedBlocks.length - 1] += " " + trailing;
            } else {
                normalizedBlocks.push(trailing);
            }
        }
    } else {
        // No cut markers. Use double newlines if they exist.
        if (script.includes('\n\n')) {
            const blocks = script.split(/\n\s*\n/).map(b => b.trim().replace(/\n/g, ' ')).filter(b => b !== '');
            for (const block of blocks) {
                if (isSceneContext(block)) {
                    currentSceneContext = block;
                } else {
                    let finalBlock = block;
                    if (currentSceneContext && !block.includes(currentSceneContext)) {
                        finalBlock = currentSceneContext + " " + block;
                    }
                    normalizedBlocks.push(finalBlock);
                }
            }
        } else {
            return lines.join('\n');
        }
    }

    return normalizedBlocks.join('\n');
};



// ── [LEGACY] generateEditableStoryboard → textAnalysis.legacy.ts로 분리 (Phase 9) ──


export const regenerateSceneFromModification = async (currentCut: Cut, elementName: string, elementValue: string, seed?: number): Promise<{ newSceneDescription: string, tokenCount: number }> => {
    const prompt = `Regenerate sceneDescription. User changed ${elementName} to "${elementValue}". Context: ${currentCut.location}, ${currentCut.narration}. Focus on physical composition. Output JSON { "newSceneDescription": "..." }`;
    const result = await callTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed });
    return { ...parseJsonResponse<{ newSceneDescription: string }>(result.text, 'regenerateSceneFromModification'), tokenCount: result.tokenCount };
};


export const extractFieldsFromSceneDescription = async (newSceneDescription: string, currentCut: Cut, seed?: number): Promise<{ characterPose: string; characterEmotionAndExpression: string; characterOutfit: string; locationDescription: string; otherNotes: string; tokenCount: number; }> => {
    const prompt = `Extract fields from: "${newSceneDescription}". JSON Output. Ensure all fields are strings.`;
    const result = await callTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed });
    return { ...parseJsonResponse<any>(result.text, 'extractFieldsFromSceneDescription'), tokenCount: result.tokenCount };
};


export const verifyAndEnrichCutPrompt = async (cut: EditableCut, characterDescriptions: { [key: string]: CharacterDescription }, seed?: number): Promise<{ newSceneDescription: string; newCharacterOutfit: string; tokenCount: number; }> => {
    
    // Inject hair DNA directly into outfit field
    let hairContext = "";
    let profileOutfitFallback = "";
    (cut.character || []).forEach(name => {
        const key = Object.keys(characterDescriptions).find(k => { const cd = characterDescriptions[k]; return (cd.canonicalName && cd.canonicalName === name) || cd.koreanName === name; });
        if (key && characterDescriptions[key]) {
             if (characterDescriptions[key].hairStyleDescription) {
                hairContext += `${name} has ${characterDescriptions[key].hairStyleDescription}. `;
             }
             const outfitFromProfile = characterDescriptions[key].locations?.[cut.location];
             if (outfitFromProfile) {
                profileOutfitFallback += `[${name}'s base outfit for ${cut.location}: ${outfitFromProfile}] `;
             }
        }
    });

    const prompt = `Continuity check. Location: ${cut.location}, Characters: ${cut.character.join(', ')}. 
# Goal: 
1. Ensure 'characterOutfit' is a detailed physical description with HEX codes.
2. IMPORTANT: Prepend the hair descriptions into the start of 'characterOutfit'.
3. **LITERAL PRESERVATION:** If you update the outfit, you MUST use the provided Profile Outfit Fallback as your base string. DO NOT SUMMARIZE IT.
# Reference Hair DNA:
${hairContext}
# Profile Outfit Fallback (MANDATORY SOURCE):
${profileOutfitFallback}
JSON output.`;
    const result = await callTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed });
    return { ...parseJsonResponse<{ newSceneDescription: string; newCharacterOutfit: string; }>(result.text, 'verifyAndEnrichCutPrompt'), tokenCount: result.tokenCount };
};


export const generateFinalStoryboardFromEditable = (editableScenes: EditableScene[], characterDescriptions: { [key: string]: CharacterDescription }, animationStyle: string): { scenes: Scene[], tokenCount: number } => {
    const scenes: Scene[] = editableScenes.map(editableScene => ({
        sceneNumber: editableScene.sceneNumber, title: editableScene.title, settingPrompt: '',
        cuts: editableScene.cuts.map(editableCut => ({
            id: window.crypto.randomUUID(), cutNumber: editableCut.id, narration: editableCut.narrationText,
            characters: editableCut.character, location: editableCut.location, cameraAngle: editableCut.otherNotes,
            sceneDescription: editableCut.sceneDescription, characterEmotionAndExpression: editableCut.characterEmotionAndExpression,
            characterPose: editableCut.characterPose, characterOutfit: String(editableCut.characterOutfit || 'Casual clothes'),
            locationDescription: editableCut.locationDescription, otherNotes: editableCut.otherNotes, imageUrls: [], imageLoading: false, selectedImageId: null, directorialIntent: editableCut.directorialIntent
        }))
    }));
    return { scenes, tokenCount: 0 }; 
};


export const regenerateCutFieldsForCharacterChange = async (originalCut: Cut, newCharacters: string[], characterDescriptions: { [key: string]: CharacterDescription }, location: string, seed?: number): Promise<{ regeneratedCut: Partial<Cut>, tokenCount: number }> => {
    const prompt = `Change characters to: ${newCharacters.join(', ')}. JSON output. Ensure 'characterOutfit' is a string with HEX codes.`;
    const result = await callTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed });
    return { regeneratedCut: parseJsonResponse<Partial<Cut>>(result.text, 'regenerateCutFieldsForCharacterChange'), tokenCount: result.tokenCount };
};


export const regenerateCutFieldsForIntentChange = async (originalCut: Cut | EditableCut, newIntent: string, characterDescriptions: { [key: string]: CharacterDescription }, seed?: number): Promise<{ regeneratedCut: Partial<Cut>, tokenCount: number }> => {
    const narration = 'narration' in originalCut ? originalCut.narration : (originalCut as EditableCut).narrationText;
    const location = originalCut.location;
    const characters = 'characters' in originalCut ? originalCut.characters : (originalCut as EditableCut).character;
    
    const prompt = `
# Persona: Master Webtoon Visual Director
# Task: Update ONLY the ACTING and SCENE fields for a cut based on the user's "Directorial Intent".
# [중요] 역동적 연기 프로토콜 (DYNAMIC PERFORMANCE):
- 인물의 포즈('characterPose')를 설계할 때 "평범한 자세 금지" 원칙을 적용하십시오.
- 인물의 감정이 온몸으로 표현되도록 하십시오. (예: "좌절하여 바닥을 치며 절규함", "기뻐서 발꿈치를 들고 한 바퀴 돎")
- 만화적 기호를 표정 묘사에 반드시 포함하십시오.
# CRITICAL RULE (DO NOT CHANGE IDENTITY):
- DO NOT generate descriptions for clothing or hair. The 'characterOutfit' field is handled by a separate system and MUST NOT be part of your output.
- Your ONLY job is to describe the character's PERFORMANCE (pose, expression) and the ENVIRONMENT (scene, location details).
# Context:
- **Location:** ${location}
- **Characters:** ${characters.join(', ')}
- **Narration:** "${narration}"
- **User's Directorial Intent:** "${newIntent}"
# Output JSON Schema (STRICTLY adhere to this schema, DO NOT include characterOutfit):
{
"sceneDescription": "string",
"characterPose": "string (Specific body position: limb placement, head direction, weight center, hand gestures. Match character personality and scene context.)",
"characterEmotionAndExpression": "string (Exaggerated facial expression with Manpu)",
"locationDescription": "string",
"otherNotes": "string"
}
`;
    const result = await callTextModel(SCRIPT_ANALYSIS_SYSTEM_INSTRUCTION + '\nRespond with valid JSON only.', prompt, { responseMimeType: 'application/json', seed, temperature: 0.1 });
    return { regeneratedCut: parseJsonResponse<Partial<Cut>>(result.text, 'regenerateCutFieldsForIntentChange'), tokenCount: result.tokenCount };
};



// ── Re-exports: 분리된 파일에서 re-export (기존 import 경로 호환) ──

export {
    analyzeScenario,
    analyzeCharacterBible,
    generateConti,
    designCinematography,
    convertContiToEditableStoryboard,
    regenerateForNewLocations,
} from './textAnalysisPipeline';

export {
    purifyImagePromptForSafety,
    generateCinematicBlueprint,
    formatMultipleTextsWithSemanticBreaks,
    formatTextWithSemanticBreaks,
    refinePromptWithAI,
    refineAllPromptsWithAI,
} from './textAnalysisRefine';

export type { CutFieldChanges } from './textAnalysisRefine';
