# 대본 분석 파이프라인 가이드

> 이 문서는 DoReMiSsul Studio의 **3개 대본 파이프라인**과 **이미지 생성까지의 전체 흐름**을 한 장으로 정리한 것입니다. 코드 수정 전 구조 파악용.

## 한 눈에 보기

```
사용자 대본 입력
    │
    ▼
[AppContext.handleStartStudio] ──→ scriptInputMode 확인
    │
    ├─ 'narration' (이미지상세대본 탭)
    │      │
    │      ▼
    │  runAnalysisPipeline
    │      │
    │      ├─ preprocessDetailedScript로 포맷 감지
    │      │      │
    │      │      ├─ isDetailed=true  → Step 1~3 → (pause 스킵) → resumeFromEnrichedPause
    │      │      │
    │      │      └─ isDetailed=false → runUSSPipeline에 위임  ◄─ 자동 폴백 (2b72a4c)
    │      │
    │      └─ 일반 대본 → Step 1~3 → enriched_pause → 사용자 편집 → resumeFromEnrichedPause
    │
    ├─ 'msf' (MSF 탭) ──→ runMSFPipeline (parseMSFScript 1회로 Step 1~4 통합)
    │
    └─ 'uss' (USS 탭) ──→ runUSSPipeline (구조 분석 후 배치 컷 변환)
```

## 3개 파이프라인 비교표

| 항목 | **narration** (이미지상세대본) | **MSF** (Master Scene Format) | **USS** (Universal Script Schema) |
|---|---|---|---|
| 진입 함수 | `runAnalysisPipeline` | `runMSFPipeline` | `runUSSPipeline` |
| 정의 위치 | appAnalysisPipeline.ts:167 | appAnalysisPipeline.ts:505 | appAnalysisPipeline.ts:722 |
| 입력 형태 | 괄호 메타데이터가 포함된 대본 | INT./EXT. 씬헤딩 포함 대본 | 한 줄 = 한 컷의 기본 나레이션 |
| 대표 함수 | `analyzeScenario` + `analyzeCharacterBible` + `enrichScriptWithDirections` | `parseMSFScript` (한 번에) | `analyzeUSSStructure` + `convertAllNarrationToCuts` |
| enriched_pause | ✅ (사용자 편집 가능) | ❌ (전체 자동) | ❌ (전체 자동) |
| Step 1~3 분할 | 3개 Claude 호출 | 1개 Claude 호출로 통합 | 구조 호출 + 배치 컷 변환 |
| Step 5~6 | 공통 사용 | 공통 사용 | 공통 사용 |
| validatePresetData | ✅ (Step 3 직후) | ❌ (향후 이식 예정) | ❌ (향후 이식 예정) |
| 토큰 효율 | 중간 | 좋음 (1회 호출) | 좋음 (배치 처리) |
| 상세 편집 유연성 | 높음 | 낮음 | 중간 |

## Step별 함수 앵커

| Step | 역할 | 구현 파일:라인 | 출력 |
|---|---|---|---|
| 1 | 시나리오 분석 | [services/ai/textAnalysisPipeline.ts](services/ai/textAnalysisPipeline.ts) `analyzeScenario` | `ScenarioAnalysis` (genre, tone, locations, emotionalArc) |
| 2 | 캐릭터 바이블 | [services/ai/textAnalysisPipeline.ts](services/ai/textAnalysisPipeline.ts) `analyzeCharacterBible` | `CharacterBible[]` (koreanName, gender, outfitRecommendations) |
| 3 | 대본 풍부화 | [services/ai/textAnalysis.ts](services/ai/textAnalysis.ts) `enrichScriptWithDirections` | `EnrichedBeat[]` (4원칙 태깅된 연출) |
| ⏸ | enriched_pause | — | (narration만) 사용자 편집 대기 |
| 4 | 콘티 분할 | [services/ai/textAnalysisPipeline.ts](services/ai/textAnalysisPipeline.ts) `generateConti` | `ContiCut[]` (cutType, characters, location, visualDescription) |
| 5 | 촬영 설계 | [services/ai/textAnalysisPipeline.ts:340](services/ai/textAnalysisPipeline.ts) `designCinematography` | `CinematographyPlan` (shotSize, cameraAngle, eyelineDirection, lightingNote) |
| 6 | 스토리보드 변환 | [services/ai/textAnalysisPipeline.ts](services/ai/textAnalysisPipeline.ts) `convertContiToEditableStoryboard` | `EditableScene[]` (UI 렌더용) |

### MSF/USS의 단계 대응

- **MSF**: `parseMSFScript`가 Step 1~4를 한 번에 → Step 5(designCinematography) → Step 6
  - 중간에 `enrichContiCutsBatch`로 컷마다 감정/연기 풍부화 추가
- **USS**: `analyzeUSSStructure`(메타/캐릭터/장소) → `convertAllNarrationToCuts`(배치 컷 변환) → `ussToAppData`(타입 매핑) → Step 5 → Step 6

## 이미지 생성 연결

파이프라인 결과가 **`buildFinalPrompt`**에 공급되는 관계:

```
파이프라인 출력            →  buildFinalPrompt가 읽는 필드
─────────────────────────────────────────────────────────
characterBibles            →  IDENTITY DNA 생성
scenarioAnalysis.locations →  장소 레지스트리 (의상 키 매칭)
locationVisualDNA          →  SPATIAL DNA
cinematographyPlan.cuts    →  shotSize/cameraAngle → cameraInfo
                             (+ extractFramingFromScene 안전망)
EditableCut 자체           →  sceneDescription / emotion / pose / characterOutfit
```

빌드 위치: [appStyleEngine.ts:226](appStyleEngine.ts) `buildFinalPrompt`
실행 위치: [appImageEngine.ts](appImageEngine.ts) `generateImageForCut`

## Resume 경로

```
enriched_pause  ──→  resumeFromEnrichedPause (appAnalysisPipeline.ts:340)
                      └─ Step 4 → Step 5 → Step 6
                      └─ 상세대본은 conti_pause도 스킵, 바로 complete

conti_pause     ──→  resumeFromContiPause (appAnalysisPipeline.ts:453)
                      └─ Step 6만 재실행 (Claude 호출 없이 타입 변환)
```

## 취소 토큰 시스템

`startNewPipeline()` / `checkPipelineAlive(pid)` / `cancelActivePipeline()` — [appAnalysisPipeline.ts:30-74](appAnalysisPipeline.ts)

- 새 파이프라인 시작 시 `ACTIVE_PIPELINE_ID` 증가
- 각 Step 사이에 `checkPipelineAlive(pid)` 호출 → 취소된 경우 `PipelineCancelledError` throw
- `createSafeHelpers`로 dispatch/notification을 wrap해서 취소된 파이프라인의 부작용 자동 차단

## 호환성 주의 (기존 프로젝트 로드 시)

| 필드 | 누락 시 폴백 |
|---|---|
| `scenarioAnalysis.locations` | 빈 배열 `[]` |
| `locationVisualDNA` | 빈 객체 `{}` |
| `characterBibles[].canonicalName` | `koreanName` |
| `characterBibles[].aliases` | `[koreanName]` |
| `ContiCut.characterPose` | `''` |
| `cut.characterIdentityDNA` | BODY 라인 생략 |
| `GeneratedImage.tag` | `'hq'` |
| `state.selectedImageEngine` | `'gemini'` |

## 진행 중 작업

- [ ] narration 탭의 포맷 미감지 폴백 → USS (완료: 커밋 `2b72a4c`)
- [ ] validatePresetData를 MSF/USS 경로에도 이식
- [ ] Flux 프롬프트 엔진 완성 (Gemini 품질 확정 후)
- [ ] 탭 3개 제거 → 대본 포맷 자동 감지로 단일 진입점
