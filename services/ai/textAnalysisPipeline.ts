// services/ai/textAnalysisPipeline.ts — 대본 분석 파이프라인 핵심 함수 (textAnalysis.ts에서 분리)
// analyzeScenario → analyzeCharacterBible → generateConti → designCinematography → convertContiToEditableStoryboard

import { ScenarioAnalysis, CharacterBible, ContiCut, CinematographyCut, CinematographyPlan, EditableScene, EditableCut, CharacterDescription, Cut, EnrichedBeat } from '../../types';
import { callTextModel, parseJsonResponse } from './aiCore';

// ============================================================
// Phase 4: Preproduction Pipeline Functions
// ============================================================

/**
 * 3-1. analyzeScenario — 시나리오 분석
 * 대본을 읽고 플롯 구조, 감정 아크, 전환점, 컬러 무드를 추출
 */

export const analyzeScenario = async (
    script: string,
    seed?: number,
    logline?: string
): Promise<{ analysis: ScenarioAnalysis; tokenCount: number }> => {
    const lines = script.split('\n').filter(l => l.trim());
    const totalLines = lines.length;
    const loglineHint = logline?.trim() ? `\n# 로그라인 (작가의 한줄 설명): ${logline}\n이 로그라인의 장르/톤/갈등/반전 정보를 분석에 반영하라.\n` : '';

    const prompt = `
# Role: 시니어 영화 감독 / 시나리오 분석가
# Task: 아래 대본을 읽고 "감독의 시나리오 해석"을 JSON으로 출력하라.
${loglineHint}
대본은 총 ${totalLines}줄이다. 각 줄 번호는 1부터 시작한다.

# 분석 요소:
1. **genre**: 장르/톤 (예: "직장 로맨스, 츤데레 코미디")
2. **tone**: 전체 톤 키워드 (예: "가볍고 유머러스하다가 마지막에 묵직")
3. **threeActStructure**: 3막 구조
   - setup: 설정부 (시작줄~끝줄, 설명)
   - confrontation: 대립부 (시작줄~끝줄, 설명)
   - resolution: 해소부 (시작줄~끝줄, 설명)
4. **emotionalArc**: 각 대사줄의 감정 키워드 배열 (정확히 ${totalLines}개)
5. **turningPoints**: 핵심 전환점 줄 번호 배열 (반전, 클라이맥스 등)
6. **colorMood**: 전체 컬러 톤 가이드 (예: "전반부 차가운 형광등 → 후반부 따뜻한 석양")
7. **pacing**: 전체 템포 (빠름/보통/느림/변칙)
8. **locations**: 대본에 등장하는 모든 물리적 장소를 한국어 문자열 배열로 추출하라.
   - 직접 언급된 장소 + 맥락상 암시된 장소 모두 포함
   - 가능한 구체적으로 (예: "집" → "집 거실", "회사" → "사무실")
   - 중복 없이, 등장 순서대로

# 출력 형식 (JSON만, 설명 없이):
{
  "genre": "...",
  "tone": "...",
  "threeActStructure": {
    "setup": { "startLine": 1, "endLine": N, "description": "..." },
    "confrontation": { "startLine": N, "endLine": M, "description": "..." },
    "resolution": { "startLine": M, "endLine": ${totalLines}, "description": "..." }
  },
  "emotionalArc": ["긴장", "놀람", ...],
  "turningPoints": [N, M],
  "colorMood": "...",
  "pacing": "...",
  "locations": ["장소1", "장소2", ...]
}

# 대본:
\`\`\`
${lines.map((l, i) => `[${i + 1}] ${l}`).join('\n')}
\`\`\`
`;

 const result = await callTextModel(
    'You are a senior film director...',
    prompt,
    { responseMimeType: 'application/json', seed, temperature: 0.5, maxTokens: 32768 }
);

    const parsed = parseJsonResponse<ScenarioAnalysis>(result.text, 'analyzeScenario');

    // emotionalArc 길이 보정 — AI가 개수를 틀릴 수 있음
    while (parsed.emotionalArc.length < totalLines) {
        parsed.emotionalArc.push('neutral');
    }
    if (parsed.emotionalArc.length > totalLines) {
        parsed.emotionalArc = parsed.emotionalArc.slice(0, totalLines);
    }

    // locations 보정 — 없으면 빈 배열
    if (!Array.isArray(parsed.locations)) {
        parsed.locations = [];
    }

    return { analysis: parsed, tokenCount: result.tokenCount };
};


/**
 * 3-2. analyzeCharacterBible — 캐릭터 바이블 (강화)
 * 성격→행동 패턴, 관계 역학, 의상 추천
 */

export const analyzeCharacterBible = async (
    script: string,
    scenarioAnalysis: ScenarioAnalysis,
    seed?: number,
    speakerGender?: 'male' | 'female'
): Promise<{ bibles: CharacterBible[]; tokenCount: number }> => {

    const locationList = (scenarioAnalysis.locations && scenarioAnalysis.locations.length > 0)
        ? `\n# [중요] 장소 레지스트리 (Location Registry)\n아래 목록은 시나리오 분석에서 확정된 정규 장소명이다.\noutfitRecommendations의 키는 반드시 이 목록의 장소명을 그대로 사용하라.\n새로운 장소명을 만들지 마라. 목록에 없는 장소에 대한 의상은 생성하지 마라.\n장소 목록: ${scenarioAnalysis.locations.join(', ')}\n`
        : '';

    const prompt = `
# Role: 캐릭터 디자이너 / 캐스팅 디렉터
# Task: 대본에 등장하는 모든 캐릭터의 "캐릭터 바이블"을 작성하라.

# 시나리오 분석 결과 (참고):
- 장르/톤: ${scenarioAnalysis.genre} / ${scenarioAnalysis.tone}
- 컬러 무드: ${scenarioAnalysis.colorMood}
${locationList}
# 각 캐릭터별 필수 항목:
1. **koreanName**: 한국어 이름
2. **canonicalName**: 영어 정규 이름 (예: "Juli", "Minho"). 대본의 한국어 이름을 로마자 변환하라. 이 이름이 이후 모든 이미지 프롬프트에서 캐릭터를 식별하는 유일한 키가 된다.
3. **aliases**: 대본에서 이 캐릭터를 가리키는 모든 한국어 지칭 배열 (예: ["딸", "아이", "애기", "줄리"]). koreanName도 반드시 포함하라. 대본 전체를 꼼꼼히 읽고 빠짐없이 수집하라.
4. **gender**: "male" 또는 "female"
5. **baseAppearance**: 외형 묘사 (영어, 이미지 생성용)
6. **personalityProfile**:
   - core: 성격 핵심 요약 (한국어)
   - behaviorPatterns: 감정별 신체 반응 (nervous, angry, happy, flustered 필수, sad/surprised 선택)
     → 각 값은 "구체적 신체 행동" (예: "입술을 살짝 깨무는 버릇, 서류를 정리하는 척")
   - relationships: { "상대 canonicalName": "관계 설명" } — 대본에 나오는 인물 간 역학. 키는 반드시 상대의 canonicalName(영어)을 사용.
   - physicalMannerisms: 걸음걸이, 자세, 습관 등
   - voiceCharacter: 목소리 특징
7. **outfitRecommendations**: 장소별 의상 추천
   - { "장소명": { "description": "영어 의상 묘사 (색상 hex 포함)", "reasoning": "이유(한국어)" } }
   - CRITICAL: description에는 순수 의상(옷, 신발, 악세서리)만 기술하라. 헤어스타일, 얼굴, 체형 묘사를 절대 포함하지 마라. (별도 필드에서 처리됨)

# 규칙:
- behaviorPatterns의 값은 반드시 "눈에 보이는 신체 반응"으로. 추상적 서술 금지.
- outfitRecommendations의 description은 반드시 영어. reasoning은 한국어.
- 장소 레지스트리가 주어졌으면 그 장소명만 키로 사용할 것. 없으면 대본에 명시된 장소마다 의상 1개씩.
${speakerGender ? `\n# [필수] 화자(나레이터) 성별 지정: ${speakerGender}\n- 이 대본의 1인칭 화자("나", "내")는 반드시 ${speakerGender === 'male' ? '남성(male)' : '여성(female)'}이다.\n- 화자 캐릭터의 gender 필드는 반드시 "${speakerGender}"로 설정하라.\n- 대본 내용이 모호하더라도 이 설정을 절대 변경하지 마라.` : ''}

# 출력 형식 (JSON만):
{ "bibles": [ { "koreanName": "줄리", "canonicalName": "Juli", "aliases": ["줄리", "딸", "아이"], "gender": "female", "baseAppearance": "...", ... } ] }

# 대본:
\`\`\`
${script}
\`\`\`
`;

    const result = await callTextModel(
        'You are a character designer and casting director for anime/film production. Respond with valid JSON only.',
        prompt,
        { responseMimeType: 'application/json', seed, temperature: 0.6, maxTokens: 32768 }
    );

    const parsed = parseJsonResponse<{ bibles: CharacterBible[] }>(result.text, 'analyzeCharacterBible');
    return { bibles: parsed.bibles, tokenCount: result.tokenCount };
};


/**
 * 3-3. generateConti — 콘티/컷 나누기 (핵심! 1줄=1컷 해방)
 * Claude가 감독으로서 자유롭게 컷을 분할/합치기
 */

export const generateConti = async (
    script: string,
    scenarioAnalysis: ScenarioAnalysis,
    characterBibles: CharacterBible[],
    enrichedBeats?: EnrichedBeat[],
    logline?: string,
    seed?: number,
    onProgress?: (textLength: number) => void
): Promise<{ cuts: ContiCut[]; tokenCount: number }> => {
    const lines = script.split('\n').filter(l => l.trim());
    const totalLines = lines.length;
    const maxCuts = Math.ceil(totalLines * 1.5);

    // ★ canonicalName 캐스트 테이블 — characters 배열에 영어 이름 사용 강제
    const hasCanonical = characterBibles.some(b => b.canonicalName && b.canonicalName !== b.koreanName);
    const castTable = hasCanonical
        ? characterBibles.map(b => `${b.canonicalName || b.koreanName} (${b.koreanName}${b.aliases?.length ? ', aliases: ' + b.aliases.join('/') : ''})`).join(' | ')
        : '';
    const characterNames = hasCanonical
        ? characterBibles.map(b => b.canonicalName || b.koreanName).join(', ')
        : characterBibles.map(b => b.koreanName).join(', ');

    // enrichScript 출력이 있으면 연출 지시를 따르도록 지시 (★ Phase 12: JSON 구조화)
    const enrichedSection = (enrichedBeats && enrichedBeats.length > 0)
        ? `
# [핵심] enrichScript 연출 지시문 (MUST FOLLOW)
아래는 연출 감독(enrichScript)이 작성한 구조화 연출 대본(JSON 배열)입니다.
- 각 항목의 id 순서가 곧 컷 순서다. 순서를 임의로 바꾸지 마라.
- type=narration 항목은 dialogue 또는 적절한 cutType으로 변환하라.
- type=insert 항목은 반드시 별도 insert 컷으로 생성하라.
- type=reaction 항목은 반드시 별도 reaction 컷으로 생성하라.
- beat/emotion 필드를 emotionBeat에 반영하라.
- direction 필드를 참고하여 visualDescription과 sfxNote를 채워라.

\`\`\`json
${JSON.stringify(enrichedBeats, null, 2)}
\`\`\`
`
        : '';

    const prompt = `
# Role: 콘티 분할 전문가 (Cut Splitter)
# Task: 대본을 읽고 "콘티(컷 분할)"를 설계하라.
${logline?.trim() ? `# 전체 톤: ${logline}` : ''}
${enrichedBeats?.length ? '# 주의: enrichScript의 연출 지시를 최우선으로 따를 것. 당신의 역할은 컷 분할에만 전념하는 것이다.' : ''}

# 핵심 원칙: "1줄=1컷" 족쇄 해제
- 하나의 대사를 여러 컷으로 분할 가능 (인서트컷, 리액션컷 추가)
- 여러 대사를 하나의 컷으로 합칠 수도 있음 (트래킹샷 등)
${enrichedBeats?.length ? '- enrichScript가 인서트/리액션을 이미 지시한 경우 그대로 반영하라.' : '- 감독으로서 최적의 시각적 스토리텔링을 설계하라.'}

# 컷 타입:
- dialogue: 대사 컷 (나레이션/대화)
- reaction: 리액션 컷 (대사 없이 표정/반응만)
- insert: 인서트컷 (소품, 환경, 상징물 클로즈업)
- establish: 설정컷 (장소 전체를 보여주는 와이드샷)
- transition: 전환컷 (시간 경과, 장소 이동)

# 시나리오 분석:
- 장르: ${scenarioAnalysis.genre}
- 톤: ${scenarioAnalysis.tone}
- 전환점 줄: ${scenarioAnalysis.turningPoints.join(', ')}
- 템포: ${scenarioAnalysis.pacing}
${scenarioAnalysis.locations?.length ? `
# [중요] 장소 레지스트리 — location 필드 강제
각 컷의 location 필드는 반드시 다음 목록에서 선택하라.
새로운 장소명을 만들지 마라 (예: "실내", "집" 등 임의 이름 금지).
장소 목록: ${scenarioAnalysis.locations.join(', ')}
` : ''}
# 등장인물: ${characterNames}
${hasCanonical ? `
# [필수] 캐릭터 캐스트 테이블 (Character Cast Table)
대본에는 한국어 이름/지칭이 쓰이지만, cuts의 characters 배열에는 반드시 아래 영어 canonicalName만 사용하라.
${castTable}
- 대본에서 "딸", "아이" 등 별칭이 나오면 위 테이블에서 매칭되는 canonicalName을 넣어라.
- characters 배열에 한국어 이름을 절대 넣지 마라.
` : ''}
${enrichedSection}
# 규칙:
1. 최대 컷 수: ${maxCuts}컷 (원본 ${totalLines}줄 × 1.5 = 상한)
2. 리액션컷 + 인서트컷은 전체의 30% 이하
3. 전환점(turningPoints) 근처는 컷을 세밀하게 (클로즈업, 리액션 추가)
4. 장소가 바뀌면 establish 컷 삽입 고려
5. originLines: 이 컷이 기반한 원본 대사 줄 번호 배열. 리액션/인서트컷도 관련된 줄 번호를 명시.
6. narration: dialogue 컷은 해당 대사, reaction/insert/establish/transition은 빈 문자열 ""
7. visualDescription: 영어로, 이미지 생성 AI가 정확히 그릴 수 있는 물리적 시각 묘사. 아래 [한국어 뉘앙스 보존] 규칙을 반드시 따르라.
8. emotionBeat: 이 컷의 감정 키워드 (한국어)
9. id: "C001", "C002" 형식으로 순서대로
10. characterPose: 영어로, 캐릭터의 구체적인 신체 포지션/자세를 묘사. 아래 규칙을 따르라:
    - 신체 부위별 위치를 구체적으로 (예: "lying on side, phone held close to face with right hand, left arm under pillow")
    - 손 위치, 머리 방향, 무게 중심을 반드시 포함
    - 감정과 상황에 맞는 자연스러운 자세 (슬플 때: 웅크림, 신날 때: 팔 벌림 등)
    - insert/establish 컷(characters 빈 배열)은 빈 문자열 ""
    - 이전 컷과의 연결성 고려 (누워있었는데 갑자기 서 있으면 안 됨)

# [중요] 한국어 뉘앙스 보존 — visualDescription & characterPose 작성 시 필수
한국어 대본의 표현(동사·형용사·부사·의태어·의성어)을 영어로 단순 번역하지 마라.
모든 한국어 표현이 만드는 **물리적 장면**을 구체적 신체 동작, 사물 배치, 표정으로 변환하라.

❌ 나쁜 예 (단순 번역):
- "뒤집어쓰고" → "under blanket"
- "몰래" → "secretly" / "secretive atmosphere"  
- "바쁜 일과속" → "busy daily routine"
- "움찔" → "flinch"
- "후다닥" → "quickly"

✅ 좋은 예 (물리적 장면 변환):
- "뒤집어쓰고" → "blanket pulled completely over head forming a cocoon/tent shape, only face and phone visible from inside the blanket cave"
- "몰래" → "eyes darting sideways checking surroundings, phone held close to chest to hide screen light, lips pressed together"
- "바쁜 일과속" → "papers stacked high on desk, phone wedged between ear and shoulder while typing, half-eaten lunch pushed aside"
- "움찔" → "shoulders jerking upward, neck retracting into collar, eyes widening with frozen body"
- "후다닥" → "legs mid-stride in full sprint, arms pumping, hair blown back by speed"

# 출력 형식 (JSON만):
{
  "cuts": [
    {
      "id": "C001",
      "cutType": "establish",
      "originLines": [1],
      "narration": "",
      "characters": [],
      "location": "사무실",
      "visualDescription": "Wide shot of a modern office...",
      "emotionBeat": "일상",
      "characterPose": "",
      "sfxNote": "에어컨 윙윙"
    },
    {
      "id": "C002",
      "cutType": "dialogue",
      "originLines": [1],
      "narration": "원본 대사 그대로",
      "characters": ["Yeo"],
      "location": "사무실",
      "visualDescription": "Bust shot, she speaks while...",
      "emotionBeat": "긴장",
      "characterPose": "standing with arms crossed, chin slightly raised, weight on left leg, looking down at subordinate",
      "sfxNote": ""
    }
  ]
}

# 원본 대본 (줄 번호 포함):
\`\`\`
${lines.map((l, i) => `[${i + 1}] ${l}`).join('\n')}
\`\`\`
`;

    const result = await callTextModel(
        'You are a top-tier storyboard cut splitter. Respond with valid JSON only. Do not include any explanation.',
        prompt,
        { responseMimeType: 'application/json', seed, temperature: 0.6, maxTokens: 32768 }
    );

    if (onProgress) onProgress(result.text.length);

    const parsed = parseJsonResponse<{ cuts: ContiCut[] }>(result.text, 'generateConti');

    // ID 정규화 — 혹시 AI가 순서를 틀리면 재정렬
    parsed.cuts = parsed.cuts.map((cut, i) => ({
        ...cut,
        id: `C${String(i + 1).padStart(3, '0')}`,
    }));

    return { cuts: parsed.cuts, tokenCount: result.tokenCount };
};


/**
 * 3-4. designCinematography — 촬영 설계
 * 컷 연결, 시선 유도, 조명 노트
 */

export const designCinematography = async (
    contiCuts: ContiCut[],
    scenarioAnalysis: ScenarioAnalysis,
    seed?: number
): Promise<{ plan: CinematographyPlan; tokenCount: number }> => {

    // 컷 요약 (토큰 절약)
    const cutSummary = contiCuts.map(c =>
        `${c.id} [${c.cutType}] chars:${c.characters.join(',')||'none'} loc:${c.location} emotion:${c.emotionBeat}`
    ).join('\n');

    const prompt = `
# Role: 촬영 감독 (Director of Photography)
# Task: 콘티의 각 컷에 대해 촬영 설계를 하라.

# 촬영 문법 규칙 (반드시 준수):
1. 180도 규칙: 대화 씬에서 두 인물은 카메라 기준 항상 같은 쪽에 위치
2. 시선 유도: A컷에서 왼쪽을 보면 B컷에서는 오른쪽에서 반응
3. 샷 스케일 교차: Wide → Medium → Close → 다시 Wide (단조로움 방지)
4. 감정 강도 = 샷 크기: 감정 강한 순간 → 클로즈업, 전환/이동 → 와이드
5. 리액션 비율: 대사 컷 2~3개당 리액션/인서트 1개
6. 인서트컷 용도: 시간경과, 감정 상징, 복선 설치

# 시나리오 정보:
- 장르: ${scenarioAnalysis.genre}
- 컬러 무드: ${scenarioAnalysis.colorMood}
- 전환점: 줄 ${scenarioAnalysis.turningPoints.join(', ')}

# 콘티 컷 목록:
${cutSummary}

# 각 컷별 출력 필드:
- cutId: 콘티 ID와 동일
- shotSize: "extreme close-up" / "close-up" / "bust" / "medium" / "full" / "wide"
- cameraAngle: "eye-level" / "low" / "high" / "bird's-eye" / "dutch"
- cameraMovement: "static" / "pan" / "tilt" / "tracking" / "zoom-in" / "zoom-out"
- transitionFrom: 이전 컷과의 연결 (예: "cut", "tilt-up from previous", "match-cut on hands")
- eyelineDirection: "left" / "right" / "center" / "down" / "up"
- lightingNote: 조명 메모 (영어, 짧게)

# 출력 형식 (JSON만):
{
  "cuts": [ { "cutId": "C001", "shotSize": "wide", ... }, ... ],
  "globalNotes": "전체 촬영 노트 (한국어)"
}
`;

    const result = await callTextModel(
        'You are an expert Director of Photography for anime and film. Respond with valid JSON only.',
        prompt,
        { responseMimeType: 'application/json', seed, temperature: 0.5, maxTokens: 32768 }
    );

    const parsed = parseJsonResponse<CinematographyPlan>(result.text, 'designCinematography');

    return { plan: parsed, tokenCount: result.tokenCount };
};


/**
 * 3-7. convertContiToEditableStoryboard — ContiCut[] → EditableScene[] 변환
 * 기존 StoryboardReviewModal UI와 호환되도록 변환
 */

export const convertContiToEditableStoryboard = (
    contiCuts: ContiCut[],
    cinematographyPlan: CinematographyPlan,
    characterBibles: CharacterBible[]
): EditableScene[] => {
    // 장소별로 씬 그룹핑
    const sceneMap = new Map<string, { cuts: ContiCut[], cinematography: CinematographyCut[] }>();
    const sceneOrder: string[] = [];

    for (const cut of contiCuts) {
        const loc = cut.location || '기본';
        if (!sceneMap.has(loc)) {
            sceneMap.set(loc, { cuts: [], cinematography: [] });
            sceneOrder.push(loc);
        }
        sceneMap.get(loc)!.cuts.push(cut);
        const cine = cinematographyPlan.cuts.find(c => c.cutId === cut.id);
        if (cine) sceneMap.get(loc)!.cinematography.push(cine);
    }

    // 인접한 같은 장소는 하나의 씬으로 합치되, 떨어져 있으면 별도 씬
    const scenes: EditableScene[] = [];
    let sceneNumber = 1;
    let prevLocation = '';

    for (const cut of contiCuts) {
        const loc = cut.location || '기본';
        const cine = cinematographyPlan.cuts.find(c => c.cutId === cut.id);

        // 장소가 바뀌면 새 씬
        if (loc !== prevLocation) {
            scenes.push({
                sceneNumber,
                title: `씬 ${sceneNumber}: ${loc}`,
                cuts: [],
            });
            sceneNumber++;
            prevLocation = loc;
        }

        const currentScene = scenes[scenes.length - 1];

        // 캐릭터별 의상 찾기
        const outfitParts: string[] = [];
        const dnaParts: string[] = [];
       for (const charName of cut.characters) {
            const bible = characterBibles.find(b => (b.canonicalName && b.canonicalName === charName) || b.koreanName === charName);
            if (bible?.outfitRecommendations?.[loc]) {
                let desc = bible.outfitRecommendations[loc].description;
                desc = desc.replace(/^\s*\([^)]*hair[^)]*\)\s*/i, '').trim();
                outfitParts.push(`${charName}: ${desc}`);
            }
            if (bible?.baseAppearance) {
                dnaParts.push(`${charName}: ${bible.baseAppearance}`);
            }
        }
        
        // ── 필드 매핑 규칙 (2026-03-18 리팩토링) ──
        // characterPose: 포즈/자세 묘사 전용 → ContiCut.characterPose에서 매핑
        // characterEmotionAndExpression: 표정/감정 묘사 → emotionBeat (씬무드 감지 입력으로도 사용)
        // locationDescription: 장소 시각 묘사 → 장소명 + 조명 결합
        // otherNotes: 카메라 앵글/기법 → shotSize + cameraAngle (buildFinalPrompt 카메라 폴백용)
        // directorialIntent: 연출 의도 → cutType + cameraMovement + eyeline + transition + SFX
        // ★ 비등장 인물 필터: characters[] 기반 + 관계어 안전망
        const allCharacterNames = characterBibles.map(b => b.koreanName);
        const cleanVisualDesc = (rawDesc: string) => {
            let desc = rawDesc;
            const cutCharacters = cut.characters || [];
            // 이 컷에 배당되지 않은 캐릭터 이름을 비특정화
            const nonAppearing = allCharacterNames.filter(name => !cutCharacters.includes(name));
            for (const name of nonAppearing) {
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                desc = desc.replace(new RegExp(escaped, 'gi'), 'someone');
            }
            // 관계어 안전망 (이중 보호)
            const PERSON_PATTERNS = [
                /\b(boyfriend|girlfriend|husband|wife|mother|father|mom|dad|boss|colleague|friend|senior|junior|stranger)\b/gi,
                /\b(남자친구|여자친구|남친|여친|엄마|아빠|친구|동료|상사|선배|후배|남편|아내)\b/gi,
            ];
            for (const pattern of PERSON_PATTERNS) {
                desc = desc.replace(pattern, 'someone');
            }
            desc = desc.replace(/\s+/g, ' ').trim();
            return desc;
        };
        const cleanedVisualDescription = cleanVisualDesc(cut.visualDescription);

        const editableCut: EditableCut = {
            id: cut.id,
            cutNumber: `${currentScene.sceneNumber}-${currentScene.cuts.length + 1}`,
            narrationText: cut.narration,
            // canonicalName → koreanName 변환 (UI는 koreanName 기준)
            character: (cut.characters || []).map(name => {
                const bible = characterBibles.find(b => b.canonicalName === name);
                return bible ? bible.koreanName : name;
            }),
            location: loc,
            sceneDescription: cleanedVisualDescription,
            characterEmotionAndExpression: cut.emotionBeat,
            characterPose: cut.characterPose || '',
            // ★ intense 버전 매핑
            sceneDescriptionIntense: cut.visualDescriptionIntense ? cleanVisualDesc(cut.visualDescriptionIntense) : '',
            characterEmotionAndExpressionIntense: cut.emotionBeatIntense || '',
            characterPoseIntense: cut.characterPoseIntense || '',
            useIntenseEmotion: false,
            characterOutfit: outfitParts.join(' | '),
            characterIdentityDNA: dnaParts.join(' | '),
            locationDescription: (() => {
                const parts: string[] = [];
                // 1순위: ContiCut의 locationDetail (시각 묘사)
                if (cut.locationDetail) parts.push(cut.locationDetail);
                // 2순위: lightingNote
                if (cine?.lightingNote) parts.push(`Lighting: ${cine.lightingNote}`);
                // 3순위: 아무것도 없으면 장소명
                return parts.length > 0 ? parts.join('. ') : loc;
            })(),
            otherNotes: (() => {
                // 1순위: sfxNote의 [CAM] 태그 (DSF @CAMERA에서 온 것)
                const camMatch = (cut.sfxNote || '').match(/\[CAM\]\s*(.*)/);
                if (camMatch) return camMatch[1].trim();
                // 2순위: cinematographyPlan
                if (cine) return `${cine.shotSize}, ${cine.cameraAngle}`;
                // 3순위: 빈 문자열
                return '';
            })(),
            suggestedEffect: null,
            directorialIntent: (() => {
                // ★ 사용자 원본 direction이 있으면 최우선 (영어 FX 키워드 보존)
                if (cut.direction) return cut.direction;
                // 없으면 기존 로직 (cutType + sfxNote + cameraMovement 조립)
                const parts: string[] = [];
                const typeMap: Record<string, string> = {
                    'establish': 'Establishing shot, setting the scene',
                    'dialogue': '',
                    'reaction': 'Reaction shot, focus on facial expression',
                    'insert': 'Insert shot, close-up on object/detail',
                    'transition': 'Scene transition',
                };
                if (typeMap[cut.cutType] && typeMap[cut.cutType] !== '') parts.push(typeMap[cut.cutType]);
                const cleanSfxNote = (cut.sfxNote || '').replace(/\[CAM\].*/, '').trim();
                if (cleanSfxNote) parts.push(cleanSfxNote);
                if (cine?.cameraMovement && cine.cameraMovement !== 'static') {
                    parts.push(`camera: ${cine.cameraMovement}`);
                }
                return parts.join('. ') || '';
            })(),
            context_analysis: cut.emotionBeat,
            primary_emotion: cut.emotionBeat,
        };

        currentScene.cuts.push(editableCut);
    }

    return scenes;
};


// ============================================================
// 장소 추가 시 의상 + visualDNA 재생성 (enriched_pause / conti_pause 공용)
// ============================================================

export interface LocationRegenerationResult {
    /** 새 장소별 visualDNA */
    locationVisualDNA: { [loc: string]: string };
    /** 캐릭터별 새 장소 의상 추가 */
    updatedBibles: CharacterBible[];
    tokenCount: number;
}

/**
 * 새로 추가된 장소에 대해서만 visualDNA + 캐릭터 의상을 생성
 * 기존 장소의 데이터는 절대 수정하지 않음
 */
export const regenerateForNewLocations = async (
    newLocations: string[],
    existingBibles: CharacterBible[],
    scenarioAnalysis: ScenarioAnalysis,
    script: string,
): Promise<LocationRegenerationResult> => {
    if (newLocations.length === 0) {
        return { locationVisualDNA: {}, updatedBibles: existingBibles, tokenCount: 0 };
    }

    const characterSummary = existingBibles.map(b => {
        const existingOutfitExample = Object.entries(b.outfitRecommendations)[0];
        return `- ${b.koreanName} (${b.gender}): ${b.baseAppearance}${existingOutfitExample ? `\n  기존 의상 예시 [${existingOutfitExample[0]}]: ${existingOutfitExample[1].description}` : ''}`;
    }).join('\n');

    const prompt = `
# Role: 장소 디자이너 + 의상 코디네이터
# Task: 새로 추가된 장소의 배경 묘사(visualDNA)와 캐릭터별 의상을 생성하라.

# 시나리오 컨텍스트:
- 장르/톤: ${scenarioAnalysis.genre} / ${scenarioAnalysis.tone}
- 컬러 무드: ${scenarioAnalysis.colorMood}
- 기존 장소: ${scenarioAnalysis.locations?.join(', ') || '없음'}

# 등장인물:
${characterSummary}

# 새로 추가된 장소: ${newLocations.join(', ')}

# 대본 (참고용):
\`\`\`
${script.substring(0, 3000)}
\`\`\`

# 출력 규칙:
1. **locationVisualDNA**: 각 새 장소의 시각적 배경 묘사 (영어, 40~60 단어)
   - 가구, 조명, 색감, 분위기, 소품 등 구체적 묘사
   - 캐릭터 묘사 금지 — 순수 배경만
2. **outfits**: 각 캐릭터 × 각 새 장소의 의상 (영어)
   - description: 순수 의상만 (옷, 신발, 악세서리). 헤어/얼굴/체형 절대 금지.
   - reasoning: 한국어로 이유 설명
   - 기존 의상의 스타일 톤을 참고하되, 장소 특성에 맞게 변형

# 출력 형식 (JSON만):
{
  "locationVisualDNA": {
    "장소명": "영어 배경 묘사"
  },
  "outfits": {
    "캐릭터 한국어 이름": {
      "장소명": { "description": "영어 의상", "reasoning": "한국어 이유" }
    }
  }
}
`;

    const result = await callTextModel(
        'You are a production designer and costume coordinator for anime/film. Respond with valid JSON only.',
        prompt,
        { responseMimeType: 'application/json', temperature: 0.6, maxTokens: 8192 }
    );

    const parsed = parseJsonResponse<{
        locationVisualDNA: { [loc: string]: string };
        outfits: { [charName: string]: { [loc: string]: { description: string; reasoning: string } } };
    }>(result.text, 'regenerateForNewLocations');

    // 기존 bibles에 새 장소 의상만 병합 (기존 의상 보존)
    const updatedBibles = existingBibles.map(bible => {
        const charOutfits = parsed.outfits[bible.koreanName];
        if (!charOutfits) return bible;

        const mergedOutfits = { ...bible.outfitRecommendations };
        for (const loc of newLocations) {
            if (charOutfits[loc]) {
                mergedOutfits[loc] = charOutfits[loc];
            }
        }
        return { ...bible, outfitRecommendations: mergedOutfits };
    });

    return {
        locationVisualDNA: parsed.locationVisualDNA || {},
        updatedBibles,
        tokenCount: result.tokenCount,
    };
};
