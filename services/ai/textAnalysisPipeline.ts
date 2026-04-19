// services/ai/textAnalysisPipeline.ts — 대본 분석 파이프라인 핵심 함수 (textAnalysis.ts에서 분리)
// analyzeScenario → analyzeCharacterBible → generateConti → designCinematography → convertContiToEditableStoryboard

import { ScenarioAnalysis, CharacterBible, ContiCut, CinematographyCut, CinematographyPlan, EditableScene, EditableCut, CharacterDescription, Cut, EnrichedBeat } from '../../types';
import { callTextModel, parseJsonResponse } from './aiCore';
import { normalizeLocationEntries } from '../../appUtils';

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
4. **emotionalArc**: 각 대사줄의 감정 키워드 배열
   - **반드시 정확히 ${totalLines}개 원소.**
   - 출력 직전 self-check: 배열 길이가 ${totalLines}인가? 부족하면 중립("neutral") 채우고 초과하면 앞에서부터 ${totalLines}개만 사용.
5. **turningPoints**: 핵심 전환점 줄 번호 배열 (반전, 클라이맥스 등)
6. **colorMood**: 전체 컬러 톤 가이드 (예: "전반부 차가운 형광등 → 후반부 따뜻한 석양")
7. **pacing**: 전체 템포 (빠름/보통/느림/변칙)
8. **locations**: 대본의 **"의상 세션(outfit session)" 공간 단위**로 장소를 추출하라.
   - 의상 세션 = 캐릭터가 같은 옷차림을 유지하는 연속된 공간 범위
   - **같은 건물의 여러 방(부엌/거실/침실/현관 등)은 반드시 하나로 묶어라:**
     * "집 부엌", "집 거실", "집 현관" → "집" 하나
     * "할머니집 부엌", "할머니집 방" → "할머니집" 하나
   - **다음 경우에만 분리:**
     * 건물·장소 자체가 다름 (집 ≠ 옷가게 ≠ 카페 ≠ 회사)
     * 장시간 체류 이동 수단 (자동차 안, 비행기 안)
   - 표면 통과 공간(복도, 엘리베이터, 계단)은 인접 주요 장소로 흡수. 별도 장소로 만들지 말 것.
   - 중복 없이, 등장 순서대로.
   - 시간 축(오늘/내일/회상)은 아래 sceneLayers에서 처리. locations에는 **순수 공간**만.
   - **출력 형식: 객체 배열 [{ name, category, description? }]**
   - **category 값 (이 7종 중 하나만 사용):**
     * "private_home" — 본인 집/방/본인 공간 (홈웨어·파자마 가능)
     * "visiting_home" — 친척집/지인집/외가 (방문 중, 외출복 유지 상태)
     * "public_indoor" — 카페·식당·옷가게·서점·마트 등 상업/공공 실내
     * "public_outdoor" — 공원·거리·광장·해변·놀이터 등 외부 공간
     * "transit" — 자동차·지하철·비행기·택시 등 이동 수단
     * "formal" — 회사·공항·병원·예식장·학교·관공서 등 격식/공식
     * "other" — 위 어디에도 해당 안 될 때만 (최대한 지양)
   - description은 선택 (UI 노출용 한 줄 메모, 없어도 됨)
   - **category 판단 기준:** 캐릭터가 그 장소에서 어떤 의상을 입을지가 카테고리로 결정됨.
     "파자마 가능" = private_home / "방문자 상태" = visiting_home / "외출복 기본" = public_indoor·public_outdoor·transit·formal.
9. **sceneLayers**: 대본에서 감지되는 시간/서사 레이어 배열.
   - **"현재" 레이어는 반드시 포함.**
   - 시간 경과 감지: "다음날", "며칠 후", "1주일 뒤", "내일 아침" → 별도 레이어
   - 회상/플래시백: "10년 전", "어렸을 때", "그때는", "과거엔" → { isFlashback: true, timeDelta: "과거 10년" }
   - 상상/꿈: "꿈 속", "만약 ~라면", "상상으로는" → { isImagined: true }
   - 캐릭터 연령·시대가 크게 달라지는 회상은 별도 레이어로 (어린시절 vs 성인 과거).
   - id는 한국어 slug (예: "현재", "회상_어린시절", "다음날_아침", "상상_미래").
   - label은 UI에 표시할 한국어.
10. **outfitSessions**: (locations × sceneLayers) 중 **대본에 실제 등장하는 조합만**.
    - 전체 cartesian 아님. 대본에서 해당 캐릭터가 그 장소·레이어로 등장하는 경우만.
    - 각 항목: { location, layerId, lineRange: [startLine, endLine] }.
    - lineRange는 그 조합이 등장하는 줄 범위 (불연속이면 첫 등장~마지막 등장).
    - 같은 (location, layerId)가 대본 여러 군데 등장해도 하나의 outfitSession.
    - **이 배열이 Step 2 의상 생성의 단위가 된다.**
11. **locationVisualDNA**: 시각 DNA (배경 묘사용).
    - 키 형식: "{location}::{layerId}" (예: "집::현재", "할머니집::회상_어린시절").
    - 값: 그 (장소, 레이어)의 시각 묘사 (영어, 건축·조명·색감·분위기·시대감·구체적 오브젝트 포함).
    - **반드시 outfitSessions의 모든 항목에 대응하는 키가 있어야 한다.**
    - 회상/상상 레이어는 시각 톤 반영 (세피아, 데사추레이션, 소프트 포커스, 90년대 가구 등).

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
  "locations": [
    { "name": "집", "category": "private_home" },
    { "name": "할머니집", "category": "visiting_home" },
    { "name": "옷가게", "category": "public_indoor" },
    { "name": "공항", "category": "formal" },
    { "name": "자동차 안", "category": "transit" }
  ],
  "sceneLayers": [
    { "id": "현재", "label": "현재" },
    { "id": "회상_어린시절", "label": "회상 (어린시절)", "timeDelta": "과거 15년", "isFlashback": true }
  ],
  "outfitSessions": [
    { "location": "집", "layerId": "현재", "lineRange": [1, 20] },
    { "location": "할머니집", "layerId": "회상_어린시절", "lineRange": [21, 45] }
  ],
  "locationVisualDNA": {
    "집::현재": "modern Korean apartment interior, warm wooden floor, beige walls, natural daylight",
    "할머니집::회상_어린시절": "traditional Korean house, 2010s-era furniture, warm sepia tint, soft-focus childhood nostalgia"
  }
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

    // locations 보정 — Phase 7: AI가 string[] 또는 LocationEntry[]로 낼 수 있으므로
    // 어느 쪽이든 LocationEntry[]로 정규화. 카테고리 누락 시 휴리스틱으로 유추.
    parsed.locations = normalizeLocationEntries(parsed.locations as unknown);

    // ── Phase 5-b: sceneLayers / outfitSessions / locationVisualDNA 보정 ──

    // sceneLayers: 없거나 비어있으면 "현재" 하나로 폴백
    if (!Array.isArray(parsed.sceneLayers) || parsed.sceneLayers.length === 0) {
        parsed.sceneLayers = [{ id: '현재', label: '현재' }];
    }
    // "현재" 레이어가 없으면 맨 앞에 강제 삽입
    if (!parsed.sceneLayers.some(sl => sl.id === '현재')) {
        parsed.sceneLayers.unshift({ id: '현재', label: '현재' });
    }
    const validLayerIds = new Set(parsed.sceneLayers.map(sl => sl.id));
    // Phase 7: parsed.locations는 LocationEntry[]. name만 Set에 담아 outfitSession 검증.
    const locationNames = parsed.locations.map(l => l.name);
    const validLocations = new Set(locationNames);

    // outfitSessions: 없으면 빈 배열 / 유효성 검사 (locations·sceneLayers에 존재하는 조합만 유지)
    if (!Array.isArray(parsed.outfitSessions)) {
        parsed.outfitSessions = [];
    }
    parsed.outfitSessions = parsed.outfitSessions.filter(os => {
        const ok = os && validLocations.has(os.location) && validLayerIds.has(os.layerId);
        if (!ok) console.warn(`[Step1] outfitSession 무효 제거:`, os);
        return ok;
    });
    // 레거시 폴백: outfitSessions 비어있고 locations는 있으면 각 location을 "현재" 레이어에 매핑
    if (parsed.outfitSessions.length === 0 && locationNames.length > 0) {
        parsed.outfitSessions = locationNames.map(loc => ({
            location: loc,
            layerId: '현재',
            lineRange: [1, totalLines] as [number, number],
        }));
        console.warn('[Step1] outfitSessions 빈 배열 → 모든 location을 "현재" 레이어로 폴백 생성');
    }

    // locationVisualDNA: 키 형식 정규화. 레거시 "loc" 키를 "loc::현재"로 보존 + 업그레이드
    if (!parsed.locationVisualDNA || typeof parsed.locationVisualDNA !== 'object') {
        parsed.locationVisualDNA = {};
    }
    const dna = parsed.locationVisualDNA;
    for (const key of Object.keys(dna)) {
        if (!key.includes('::')) {
            // 레거시 키 → "loc::현재"로 업그레이드 (원본 키도 폴백용으로 유지)
            const upgraded = `${key}::현재`;
            if (!dna[upgraded]) dna[upgraded] = dna[key];
        }
    }
    // outfitSessions에 있는데 DNA 누락 조합 로깅 (Step 2가 보완하도록 경고만)
    for (const os of parsed.outfitSessions) {
        const k = `${os.location}::${os.layerId}`;
        if (!dna[k] && !dna[os.location]) {
            console.warn(`[Step1] locationVisualDNA 누락: ${k}`);
        }
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

    // ★ Phase 5-c + 7-c: 의상 세션(outfitSessions) 기반 + LocationEntry category 기반 전환 규칙.
    const sessions = scenarioAnalysis.outfitSessions || [];
    const layers = scenarioAnalysis.sceneLayers || [{ id: '현재', label: '현재' }];
    const locEntries = scenarioAnalysis.locations || [];
    const locCategoryMap = new Map(locEntries.map(l => [l.name, l.category]));
    const sessionKeys = sessions.map(s => `${s.location}::${s.layerId}`);
    const sessionCount = sessions.length;
    const sessionTable = sessions.map(s => {
        const layer = layers.find(l => l.id === s.layerId);
        const layerLabel = layer?.label || s.layerId;
        const flags: string[] = [];
        if (layer?.isFlashback) flags.push('회상');
        if (layer?.isImagined) flags.push('상상');
        if (layer?.timeDelta) flags.push(layer.timeDelta);
        const flagStr = flags.length ? ` [${flags.join(', ')}]` : '';
        const cat = locCategoryMap.get(s.location) || 'other';
        return `- "${s.location}::${s.layerId}" (${s.location} [${cat}] / ${layerLabel}${flagStr}, lines ${s.lineRange[0]}~${s.lineRange[1]})`;
    }).join('\n');

    const outfitSessionBlock = sessionCount > 0
        ? `\n# [필수] 의상 세션 목록 (Outfit Sessions)\n각 캐릭터의 outfitRecommendations는 아래 ${sessionCount}개 세션 모두에 대해 키를 가져야 한다.\n키 형식은 반드시 "{location}::{layerId}" (예: "집::현재", "할머니집::회상_어린시절").\n각 세션명 뒤의 [카테고리]가 의상 전환의 기본 축이다 (아래 매트릭스 참조).\n\n${sessionTable}\n`
        : `\n# 장소 정보 없음 — outfitRecommendations 키는 대본에 등장하는 장소별 "{장소}::현재" 형식으로 생성하라.\n`;

    const prompt = `
# Role: 캐릭터 디자이너 / 캐스팅 디렉터
# Task: 대본에 등장하는 모든 캐릭터의 "캐릭터 바이블"을 작성하라.

# 시나리오 분석 결과 (참고):
- 장르/톤: ${scenarioAnalysis.genre} / ${scenarioAnalysis.tone}
- 컬러 무드: ${scenarioAnalysis.colorMood}
${outfitSessionBlock}
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
7. **outfitRecommendations**: **의상 세션별** 의상 추천
   - 형식: { "{location}::{layerId}": { "description": "영어 의상 묘사 (색상 hex 포함)", "reasoning": "이유(한국어)" } }
   - CRITICAL: description에는 순수 의상(옷, 신발, 악세서리)만. 헤어스타일·얼굴·체형 묘사 절대 금지.

# [필수] 의상 일관성 규칙 (Outfit Consistency Laws)
1. **같은 세션 = 같은 의상.** 한 캐릭터가 같은 outfitSession(즉 같은 location+layerId)에 여러 번 등장해도 의상 동일.
2. **같은 장소, 다른 레이어는 구분.** "엄마집::현재"와 "엄마집::회상_어린시절"은 다른 세션 → 의상 달라도 됨 (회상은 시대·연령 반영).
3. **감정 변화로 의상 바꾸지 말 것.** 슬픔·분노·긴장은 소품·표정·자세·조명으로 표현. 의상은 고정.
4. **회상/상상 레이어의 의상:**
   - isFlashback=true → 해당 시대·연령·맥락의 의상 (10년 전 → 그때 유행, 어린시절 → 교복/아동복).
   - isImagined=true → 캐릭터의 이상적 자기 이미지 반영 가능.
   - 현재 레이어의 의상과 명백히 달라야 함 (톤·스타일·시대감).

# [필수] 장소 카테고리 기반 의상 전환 매트릭스 (Phase 7-c)

## 카테고리별 기본 의상 상태
- **private_home** (본인 집/방/본인 공간) → 홈웨어·실내복. 시간·상황 따라 파자마 가능.
  * 아침 기상 직후 = 파자마 / 잠옷
  * 평상시 실내 = 편한 홈웨어 (티셔츠·추리닝 등)
  * 저녁 귀가 후 = 홈웨어
- **visiting_home** (친척집/지인집/외가) → 외출복 유지 (방문 중, 실내복 갈아입지 않음)
- **public_indoor** (카페·옷가게·식당 등) → 외출복
- **public_outdoor** (공원·거리·해변 등) → 외출복 + 계절 외투 (코트/자켓/카디건/스카프)
- **transit** (자동차·지하철·비행기) → 직전 방문 목적지의 외출복 유지
- **formal** (회사·공항·병원·예식장) → 비즈니스 캐주얼 또는 포멀
- **other** → public_indoor처럼 취급

## 전환 매트릭스 (FROM category → TO category)
대본의 cut 순서대로 outfitSession 간 전환이 발생할 때 다음 규칙 적용:

| FROM \\ TO          | private | visiting | indoor | outdoor | transit | formal |
|---------------------|---------|----------|--------|---------|---------|--------|
| **private_home**    | 유지    | 완전교체 | 완전교체| 완전교체 | 완전교체 | 완전교체 |
| **visiting_home**   | 귀가변경| 유지     | 유지   | 외투추가 | 유지    | 완전교체 |
| **public_indoor**   | 귀가변경| 유지     | 유지   | 외투추가 | 유지    | 완전교체 |
| **public_outdoor**  | 귀가변경| 유지     | 외투제거| 유지    | 유지    | 완전교체 |
| **transit**         | 귀가변경| 유지     | 외투제거| 외투착용 | 유지    | 완전교체 |
| **formal**          | 귀가변경| 유지     | 유지   | 외투추가 | 유지    | 유지   |

## 전환 의미
- **유지** = 정확히 같은 의상
- **외투 추가** = 하위 의상 동일, 외투(코트/자켓/니트)만 덧입음
- **외투 제거** = 실내 진입 시 외투 벗기
- **완전 교체** = 상의·하의·신발 전부 다른 의상 (카테고리 간 맥락 차이 표현)
- **귀가 변경** = 외출복 → 홈웨어로 교체 (집 도착 시)

## 특수 룰 (override)
- **파자마 → 어디든 외출** = 반드시 완전 교체 (파자마로 외출 불가)
- **대본에 "옷 갈아입는 씬" 명시** = 룰과 무관하게 대본 따름
- **같은 (location, layerId) 세션 내** = 유지 (전환 발생 안 함)
- **캐릭터 정체성은 레퍼런스 이미지가 담당** → 의상이 세션마다 완전히 달라져도 OK. hair·face·baseAppearance와만 어긋나지 않으면 됨.

## 모호할 때 기본값
룰 적용이 애매하면 **"완전 교체"를 기본으로**. 현실성 우선.

# [필수] 완전 커버리지 (Complete Coverage)
- 각 캐릭터의 outfitRecommendations는 **위 의상 세션 목록의 모든 키 ${sessionCount}개에 대해 항목을 생성**해야 한다.
- 대본에 그 캐릭터가 해당 세션에 등장하지 않더라도 "만약 등장한다면" 기준으로 맥락 추정 생성.
- reasoning에 "대본 비등장, {성격·관계·상황 근거}" 명시.
- **스킵 절대 금지.** 출력 직전 self-check: 각 캐릭터의 outfitRecommendations 키 개수 = ${sessionCount}개인가?

# [필수] 캐릭터 간 색상 충돌 방지
- 같은 세션에서 여러 캐릭터가 모일 때 의상 색상 hex가 서로 명확히 구분되도록 할 것.
- 주요 색 영역이 겹치면 (둘 다 회색 상의 등) 강세 색·패턴·액세서리로 차별화.

# 규칙:
- behaviorPatterns의 값은 반드시 "눈에 보이는 신체 반응"으로. 추상적 서술 금지.
- outfitRecommendations의 description은 반드시 영어. reasoning은 한국어.
- outfitRecommendations의 키 형식은 반드시 "{location}::{layerId}". 단일 "{location}" 형태 금지.
${sessionCount > 0 ? `- 위 목록에 없는 조합 키를 새로 만들지 말 것. 정확히 위 ${sessionCount}개 키만 사용.` : ''}
${speakerGender ? `\n# [필수] 화자(나레이터) 성별 지정: ${speakerGender}\n- 이 대본의 1인칭 화자("나", "내")는 반드시 ${speakerGender === 'male' ? '남성(male)' : '여성(female)'}이다.\n- 화자 캐릭터의 gender 필드는 반드시 "${speakerGender}"로 설정하라.\n- 대본 내용이 모호하더라도 이 설정을 절대 변경하지 마라.` : ''}

# 출력 형식 (JSON만):
{
  "bibles": [
    {
      "koreanName": "줄리",
      "canonicalName": "Juli",
      "aliases": ["줄리", "딸", "아이"],
      "gender": "female",
      "baseAppearance": "...",
      "personalityProfile": { ... },
      "outfitRecommendations": {
${sessionKeys.length > 0 ? sessionKeys.map(k => `        "${k}": { "description": "...", "reasoning": "..." }`).join(',\n') : '        "{장소}::현재": { "description": "...", "reasoning": "..." }'}
      }
    }
  ]
}

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

    // ── Phase 5-c: 의상 세션 커버리지 검증 + 레거시 키 호환 ──
    // AI가 레거시 형식(그냥 "집") 또는 신규 형식("집::현재") 중 섞어서 낼 수 있음.
    // 레거시 키가 있으면 기본 "현재" 레이어에 해당한다고 가정하고 "loc::현재"로 업그레이드.
    for (const bible of parsed.bibles) {
        if (!bible.outfitRecommendations) bible.outfitRecommendations = {};
        const rec = bible.outfitRecommendations;

        // 레거시 키 업그레이드: "집" → "집::현재" (신규 키 없을 때만)
        for (const key of Object.keys(rec)) {
            if (!key.includes('::')) {
                const upgraded = `${key}::현재`;
                if (!rec[upgraded]) rec[upgraded] = rec[key];
                // 원본 레거시 키는 삭제하지 않음 — 구 resolver 호환용
            }
        }

        // 완전 커버리지 검증: sessionKeys 중 누락된 것 경고 (Step 5-e에서 validatePresetData가 최종 검증)
        if (sessionCount > 0) {
            const missing = sessionKeys.filter(k => !rec[k]);
            if (missing.length > 0) {
                console.warn(`[Step2] ${bible.koreanName} outfitRecommendations 누락 ${missing.length}/${sessionCount}:`, missing);
            }
        }
    }

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
장소 목록 (이름 [카테고리]):
${scenarioAnalysis.locations.map(l => `- ${l.name} [${l.category}]`).join('\n')}

카테고리 참고 (컷 설계 시 활용):
- private_home / visiting_home = 실내, 보통 넉넉한 프레이밍 가능
- public_indoor / public_outdoor = 외부, establish 샷 고려
- transit = 좁은 공간, close-up 위주
- formal = 격식, 정돈된 구도
` : ''}
${(scenarioAnalysis.sceneLayers?.length ?? 0) > 1 || (scenarioAnalysis.outfitSessions?.length ?? 0) > 0 ? `
# [중요] 시간/서사 레이어 — sceneLayerId 필드 필수
각 컷은 반드시 sceneLayerId 필드를 포함해야 한다 (어느 시간/서사 레이어에 속하는지).
아래 레이어 목록에서 정확한 id를 선택하라. 새 id 생성 금지.

## 레이어 목록:
${(scenarioAnalysis.sceneLayers || []).map(sl => {
    const flags: string[] = [];
    if (sl.isFlashback) flags.push('회상');
    if (sl.isImagined) flags.push('상상');
    if (sl.timeDelta) flags.push(sl.timeDelta);
    return `- "${sl.id}" (${sl.label}${flags.length ? ', ' + flags.join(', ') : ''})`;
}).join('\n')}

## 의상 세션 (location × sceneLayerId 참고):
${(scenarioAnalysis.outfitSessions || []).map(os => `- "${os.location}::${os.layerId}" (lines ${os.lineRange[0]}~${os.lineRange[1]})`).join('\n')}

규칙:
- 컷의 originLines[0]이 어느 outfitSession의 lineRange에 속하는지 보고 해당 layerId 사용.
- 모호하면 "현재" 사용.
- 회상/상상 씬은 명백히 그 레이어를 사용해야 함 (의상·배경·톤이 달라야 하므로).
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
      "sceneLayerId": "현재",
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
      "sceneLayerId": "현재",
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

    // ── Phase 5-d: sceneLayerId 자동 추론/검증 ──
    const validLayerIds = new Set((scenarioAnalysis.sceneLayers || []).map(sl => sl.id));
    const sessions = scenarioAnalysis.outfitSessions || [];

    // originLines[0] → layerId 추론 함수
    // 같은 줄이 여러 outfitSession에 걸쳐있으면 (장소가 다른 경우 등) cut.location과 일치하는 세션 우선
    const inferLayerId = (cut: ContiCut): string => {
        const line = cut.originLines?.[0];
        if (line == null) return '현재';
        const matchingSessions = sessions.filter(s =>
            line >= s.lineRange[0] && line <= s.lineRange[1]
        );
        if (matchingSessions.length === 0) return '현재';
        // cut.location과 일치하는 세션 우선
        const locMatch = matchingSessions.find(s => s.location === cut.location);
        if (locMatch) return locMatch.layerId;
        // 아니면 첫 번째 매칭 세션
        return matchingSessions[0].layerId;
    };

    for (const cut of parsed.cuts) {
        // AI가 sceneLayerId를 안 넣었거나 무효한 id면 추론
        if (!cut.sceneLayerId || !validLayerIds.has(cut.sceneLayerId)) {
            const inferred = inferLayerId(cut);
            if (cut.sceneLayerId && cut.sceneLayerId !== inferred) {
                console.warn(`[Step4] ${cut.id} sceneLayerId 무효("${cut.sceneLayerId}") → "${inferred}"로 교정`);
            }
            cut.sceneLayerId = inferred;
        }
    }

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

    // 컷 요약 (토큰 절약) — vis 힌트 포함
    const cutSummary = contiCuts.map(c => {
        const visHint = c.visualDescription ? ` vis:"${c.visualDescription.substring(0, 80)}"` : '';
        return `${c.id} [${c.cutType}] chars:${c.characters.join(',')||'none'} loc:${c.location} emotion:${c.emotionBeat}${visHint}`;
    }).join('\n');

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
7. ★ visualDescription 존중 규칙 (최우선): 각 컷의 vis 필드에 이미 카메라 프레이밍 힌트가 포함되어 있으면(예: "Close-up of...", "Wide shot of...", "Bust shot...") 반드시 그 프레이밍을 shotSize로 채택하라. vis 필드의 프레이밍이 위 1~6번 규칙과 충돌해도 vis가 우선한다 — 이미 연출감독이 의도적으로 결정한 프레이밍이다.

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

        // 캐릭터별 의상 찾기 — Phase 5-d: (location, sceneLayerId) 복합 키 우선 + 레거시 폴백
        const outfitParts: string[] = [];
        const dnaParts: string[] = [];
        const layerId = cut.sceneLayerId || '현재';
        const compositeKey = `${loc}::${layerId}`;
        for (const charName of cut.characters) {
            const bible = characterBibles.find(b => (b.canonicalName && b.canonicalName === charName) || b.koreanName === charName);
            // 해상 순서: "loc::layer" → "loc::현재" (레이어 폴백) → "loc" (레거시 키)
            const rec = bible?.outfitRecommendations;
            const resolved = rec?.[compositeKey] || rec?.[`${loc}::현재`] || rec?.[loc];
            if (resolved) {
                let desc = resolved.description;
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
            sceneLayerId: cut.sceneLayerId || '현재',
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
- 기존 장소: ${scenarioAnalysis.locations?.map(l => l.name).join(', ') || '없음'}

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
