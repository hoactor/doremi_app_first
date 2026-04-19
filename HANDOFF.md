# 핸드오프 — 2026-04-18 → 다음 세션

## 어제 완료
6 commits on `dev`:
- `7e4875d` sceneDescription 시프트 fix (작가 메타 힌트 1-based)
- `710e201` tsconfig src-tauri/dist exclude
- `f17d968` Phase 1: EditableCut Intense + factory artStyleLabel + STYLE_NAMES dedup
- `4b8bc8f` Phase 2: UI 모달 unknown 정렬
- `50e71de` Phase 3: USS 토큰 추적 버그 + USS 타입 + ErrorBoundary + Flux 호환
- `0e67606` Phase 4: @types/react@19 설치 + 5건 런타임 버그

**lint 57 → 3건.** 진짜 런타임 버그 6건 수정 (sceneDescription 시프트, USS 토큰 0 집계, StoryboardReview 의상 매칭 데드, ImageStudio 마스크 메서드명, ProportionStudio savedToAsset 폴백, dead handleConfirmTargetCutSelection).

---

## 내일 첫 작업: AI 모델 속도 검증

**증상:** 컷분할(Step 4 generateConti) 단계가 어제 오전보다 3~5배 느림.

**조사 결과:**
- 파이프라인 #2→#3 점프는 **정상 핸드오프** (handleStartStudio → cancelActivePipeline + runAnalysisPipeline → 상세대본 자동 흐름에서 resumeFromEnrichedPause가 또 startNewPipeline). Claude 호출 5회 (Step 1+2+3+4+5)는 정상.
- 코드 변경 중 generateConti 경로 수정 = `[Line N]` 라벨 1글자 차이뿐 ([appAnalysisPipeline.ts:429](appAnalysisPipeline.ts:429))
- claudeService / aiCore / textAnalysisPipeline = 무변경
- **사용자 모델 설정 변경 없음 확인됨** → Opus 서버측 변동 가능성이 가장 높음

**테스트:**
1. 같은 입력 (어제 64줄 대본 + 4 캐릭터 + 8 장소) 컷분할 1회
2. 빠르면 → Anthropic 서버 변동 확정, 종결
3. 여전히 느림 → 콘솔에 429 retry 로그 / 네트워크 응답 시간 / `[Pipeline]` 로그 캡처해서 추가 조사

---

## 보류 (lint에 남은 3건)

### ② ImageStudio.tsx referenceImageUrl 단수/복수 — 기능 회귀
[components/ImageStudio.tsx:162](components/ImageStudio.tsx:162)
- 현재: `session.referenceImageUrl` (undefined). 8군데에서 잘못된 단수 키로 접근.
- 실제 데이터: `session.referenceImageUrls[]` 배열
- **영향: 스튜디오 편집에 레퍼런스 이미지가 한 번도 안 들어가는 중.**
- 선택지:
  - **A.** 빠른 패치: `referenceImageUrls?.[0] ?? null` 패턴 (8곳 모두)
  - **B.** 정식 다중 레퍼런스 지원 — onEdit 시그니처를 `string[]`로 확장. CLAUDE.md "다중 레퍼런스 최대 5개" 명시 있음 ⇒ **B가 정석.** 작업량 큼.
- **배포 전 필수 수정** (사용자가 클레임 들어올 항목)

### ⑤ AssetCatalogEntry 타입 중복 정의 — 아키텍처 부채
- [types.ts:492](types.ts:492) — `type: 'character' | 'outfit' | 'background'` (3값), extraTypes 없음, visualDNA 구체 shape
- [services/tauriAdapter.ts:452](services/tauriAdapter.ts:452) — `+ 'prop'` (4값), + extraTypes, visualDNA `any`
- CharacterStudio가 types.ts판 import, `loadAssetCatalog`는 tauriAdapter판 리턴 → 대입 실패
- **영향: 런타임은 호환 (구조 유사). 타입 안전성만 깨짐.**
- 권장: 한쪽으로 통일하는 별도 PR. 모든 import 경로 점검 후 진행. **배포 차단 사유 아님.**

### ⑥ AppContext.tsx re-review 재구성 cutNumber 누락 — 즉시 안전
[AppContext.tsx:696](AppContext.tsx:696)
- EditableCut 필수 필드 `cutNumber` 누락 (재구성 객체 리터럴에)
- 한 줄 `cutNumber: c.cutNumber,` 추가로 끝
- **영향: "편집 다시 검토" 모달 열면 모든 컷의 cutNumber undefined → 컷 번호 표시 깨짐**

---

## 추가 발견 (콘솔 로그 분석)

### ⓐ Tailwind CDN — 🔴 배포 차단
- `index.html`에서 `cdn.tailwindcss.com` 스크립트 태그 사용
- 프로덕션: 인터넷 의존, JIT 런타임 컴파일, 모든 클래스 번들 포함
- **배포 전 Tailwind PostCSS 설정으로 전환 필수.** 별도 작업 (build pipeline 변경, 회귀 테스트 필요).

### ⓑ outfit 누락 — narration 파이프라인 잠재 품질 저하
[services/ai/textAnalysisPipeline.ts:99-158](services/ai/textAnalysisPipeline.ts:99) `analyzeCharacterBible`
- 보조 캐릭터(아빠/외할머니 등)가 모든 장소에서 outfitRecommendations 빠지는 케이스 발생 (어제 17건 검증 경고 중 15건이 이거)
- USS 파이프라인은 [ussAnalysis.ts:128-138](services/ai/ussAnalysis.ts:128)에 `defaultOutfit` 자동 폴백 있음
- **narration 파이프라인엔 없음 → 컷마다 다른 옷으로 그려질 가능성** (캐릭터 일관성 핵심 가치 깨짐)
- 권장 수정 (USS 패턴 이식):
  ```ts
  // analyzeCharacterBible 응답 후처리
  for (const bible of parsed.bibles) {
      if (!bible.outfitRecommendations) bible.outfitRecommendations = {};
      const fallbackDesc = Object.values(bible.outfitRecommendations)[0]?.description
          || `${bible.koreanName}의 기본 의상`;
      for (const loc of scenarioAnalysis.locations) {
          if (!bible.outfitRecommendations[loc]) {
              bible.outfitRecommendations[loc] = {
                  description: fallbackDesc,
                  reasoning: '자동 폴백 (Step 2에서 누락)'
              };
          }
      }
  }
  ```
- **결정론적, 위험 0, 진짜 품질 향상.** 어디 PR에 묶어도 안전.

### ⓒ emotionalArc 길이 불일치 — 검증 노이즈
- 검증은 `normalizedScript` (preprocess 입력) 기준
- Step 1 `analyzeScenario`는 `cleanScript` (preprocess 출력, 메타-only 줄 빠짐) 기준
- 두 줄 수 다르면 `emotionalArc 길이(58) ≠ 대본 줄 수(64)` 경고
- **영향 작음**. 검증을 cleanScript 기준으로 바꾸면 깔끔.

### ⓓ locationVisualDNA — narration 파이프라인 미생성
- MSF/USS만 `analyzeScenario`에서 locationVisualDNA 생성
- narration 경로의 [textAnalysisPipeline.ts:25-67](services/ai/textAnalysisPipeline.ts:25) 프롬프트엔 요청 안 함
- [appFluxPromptEngine.ts:370](appFluxPromptEngine.ts:370)에서 폴백 (`|| ''`)
- **영향: 배경 묘사가 일반화됨 (미묘한 품질 저하).** 우선순위 낮음.

---

## 권장 작업 순서

1. **모델 속도 검증** (5분) — 어제 의문 해소
2. **⑥ cutNumber 한 줄** (1분) — 즉시 안전
3. **ⓑ outfit 자동 폴백** (15분) — 진짜 품질 향상, USS 패턴 이식
4. **② B안 다중 레퍼런스 정식 지원** (2~3시간) — 배포 전 필수
5. **ⓐ Tailwind PostCSS 전환** (별도 작업) — 배포 전 필수
6. **⑤ AssetCatalogEntry 통일** (별도 PR) — 부채 청산

배포 전 게이트: lint 0건, 수동 QA (이미지 생성 / 스튜디오 편집 / 에셋 카탈로그 / 비율 스튜디오), git tag, 이전 .dmg 보존.
