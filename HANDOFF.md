# 핸드오프 — 2026-04-19 → 다음 세션

## 오늘(2026-04-19) 완료 작업 — 15 commits

### Phase 5 안정화 + 부가 수정 (오전)
- `37e93bf` **USS 파이프라인 maxTokens 4000 → 16000** (JSON 파싱 실패 복구)
- `b19e884` validatePresetData에 cleanScript 전달 (emotionalArc false positive 해결)
- `8c755ea` buildMechanicalOutfit 복합 키 폴백 (DNA pollution 대량 경고 해결)
- `cd20d61` normalization DNA 자가치유 + formatting 타임아웃 30s로 연장

### Phase 7 — 장소 카테고리 + 전환 매트릭스 + 외투 레이어
- `ce9b20c` **Phase 7-a**: LocationCategory/LocationEntry 타입 + sanitizeState 마이그레이션 + 전 소비자 업데이트
- `df597da` **Phase 7-b/c/d**: Step 1~4 프롬프트에 카테고리 + 전환 매트릭스 주입
- `694ee40` **심화 1**: TransitionType 사전 계산 (카테고리 매트릭스 49셀)
- `26d6715` **심화 2**: OutfitRecommendation에 base/outerwear/state 분리
- `69ba192` baseAppearance 폴백 제거 (DNA pollution 완전 차단 — 설계 오류 수정)

## 현재 3축 의상 시스템 구성

| 축 | 타입 | 역할 |
|---|---|---|
| **시간/서사 레이어** | SceneLayer (Phase 5) | 현재·내일·회상·상상 구분 |
| **장소 카테고리** | LocationCategory (Phase 7) | 7종: private_home/visiting_home/public_indoor/public_outdoor/transit/formal/other |
| **의상 상태** | OutfitState (심화 2) | 6종: pajama/homewear/casual/outdoor/formal/special + base/outerwear 분리 |

**결정론적 전환** (심화 1):
- 집 → 옷가게 = `full_change` (완전 교체)
- 옷가게 → 공원 = `add_outerwear` (외투 추가)
- 공원 → 카페 = `remove_outerwear` (외투 제거)
- (어디든) → 집 = `home_return` (귀가 변경)
- (어디든) → formal = `full_change`

Step 1 후처리가 outfitSessions 배열에 `transitionFromPrev` 사전 계산 → Step 2가 그대로 따름.

---

## 다음 세션 시작 시 우선순위

### 1순위 — Phase 7 수동 검증 (사용자가 할 일)
새 대본으로 분석 돌려서 확인:
- **DevTools IndexedDB → scenarioAnalysis.locations가 LocationEntry[] 형식인가**
- **outfitSessions[i].transitionFromPrev 값이 제대로 계산됐는가**
- **실제 이미지에서 집(홈웨어) vs 옷가게(외출복+외투)가 명확히 다른가**
- **회상 씬이 있다면 의상·배경 톤이 현재와 구분되는가**
- **같은 장소(집 부엌/거실/현관)가 하나로 묶여 있는가**

콘솔 경고:
- PresetValidation warnings = 0건 (목표)
- DNA pollution = 0건 (재실행 시)
- Tailwind CDN = 배포 전 해결 (ⓐ)

### 2순위 — 킵 중인 **설계 재검토** 큐 (사용자 예약)
사용자가 "몇 번 테스트 후 설계를 다시 잡을 테니 킵"이라 명시.
Phase 7 + 심화 시스템을 실제 이미지 생성 몇 차례 돌려본 후, 아래 관점으로 재검토 예정:
- 카테고리 7종이 실제 쓸만한지 (부족/과잉 분류 확인)
- 전환 매트릭스 49셀 중 실제 발생 빈도·품질
- base/outerwear 분리가 AI한테 부담스럽지 않은지
- 3축 의상 시스템이 과한지 (복잡도 vs 효과)
- TransitionType 사전 계산을 AI 판단으로 돌려도 될 만큼 프롬프트가 명확해졌는지

#### 발견된 한계 케이스 (Phase 8 입력 데이터)

**2026-04-19 이미지 테스트 1회차 관찰:**

1. **활동 컨텍스트 (activity context) 미감지** ⚠️
   - 사례: CUT C021 "신발 신고 따라나섰어"
   - 물리적으로는 집(private_home) 현관 안인데 맥락적으로 외출복 상태여야 자연스러움
   - 현재: `집::현재` outfitSession이 라인 전체를 포괄 → 홈웨어로 판정
   - **제안 설계 옵션 3가지:**
     - **A. Step 1 프롬프트 강화**: "외출 준비 키워드(신발 신기, 따라나섰다, 가방 챙기기) 감지 시 별도 sceneLayer로 분리 (`현재_외출준비`)". 구조 유지하지만 sceneLayer가 시간축 + 활동축 혼용되는 의미 오염.
     - **B. `activityContext` 신규 필드**: OutfitSession에 `departing|arriving|sleeping|cooking|null` 옵셔널. Step 1이 활동 감지 → Step 2가 outfitState 조정. 의미 깨끗하지만 4축 시스템 돼서 복잡도 ↑.
     - **C. 룰 기반 상태 전환**: private_home + 외출 직전 N줄 = outfitState='casual'로 강제 override. 코드 레벨 후처리. 가장 단순.

2. (추후 테스트로 발견될 케이스 여기 누적)

결정 사항이 있으면 Phase 8로 넘어가서 리팩토링.

---

## 보류 중인 작업 (아직 착수 안 한 것)

### ② ImageStudio referenceImageUrl — 기능 회귀 🔴
[components/ImageStudio.tsx:162](components/ImageStudio.tsx:162)
- session.referenceImageUrl (단수, undefined) 사용 8군데
- 실제 데이터는 session.referenceImageUrls[] (복수 배열)
- **스튜디오 편집에 레퍼런스 이미지가 안 들어가는 중**
- 선택지:
  - A. 빠른 패치: `referenceImageUrls?.[0] ?? null` (첫 번째만 사용)
  - **B. 정식 다중 레퍼런스 (CLAUDE.md "최대 5개" 명시) — 권장**
- **배포 전 필수**

### ⑤ AssetCatalogEntry 타입 중복 정의
- [types.ts:492](types.ts:492) — 3종 type, extraTypes 없음, 구체 shape
- [services/tauriAdapter.ts:452](services/tauriAdapter.ts:452) — + 'prop', + extraTypes, any shape
- CharacterStudio:98 타입 불일치 에러 원인
- 런타임은 호환 → 배포 차단 아님. **별도 PR 권장**

### ⓐ Tailwind CDN → PostCSS 전환 🔴
- 현재 `cdn.tailwindcss.com` 스크립트 방식
- 프로덕션: 인터넷 의존 + JIT 런타임 컴파일 + 전체 번들 포함
- **배포 전 필수**. 작업량 1~2시간:
  1. `npm i -D tailwindcss postcss autoprefixer`
  2. tailwind.config.js + postcss.config.js
  3. src/index.css에 `@tailwind` 디렉티브
  4. index.html에서 CDN 스크립트 제거
  5. 전 페이지 스타일 회귀 테스트
  6. `npm run tauri:build` 통과 확인

### Phase 6 — MSF/USS → narration 통합 (사용자 제안 아이디어)
사용자가 "효율적이지 않을까?" 제안. 내 권장은 **OPTION B 정석으로 추후 진행**:
- MSF의 씬헤딩(INT./EXT.) → deterministic regex로 상세대본 변환기 작성
- USS는 이미 narration 자동 폴백이 있어 별도 변환기 불필요할 수도
- `runMSFPipeline` / `runUSSPipeline` deprecated 처리 (삭제는 2~3 릴리스 후)
- **Phase 5+7 검증 후 착수**. Phase 8 재검토 이후가 적절

---

## 남은 lint 2건 (= 위 ② + ⑤)

```
components/CharacterStudio.tsx(98,23) — AssetCatalogEntry 중복 (⑤)
components/ImageStudio.tsx(162,42) — referenceImageUrl 단수 (②)
```

나머지는 모두 정리됨. Phase 5~7이 내부적으로 깨끗함.

---

## 권장 다음 세션 흐름

1. **사용자가 실제 이미지 1~2회 생성** → Phase 7 + 심화 효과 체감
2. **설계 재검토 피드백** → 필요 시 Phase 8 리팩토링 착수
3. **Phase 6 (MSF/USS 통합)** — 설계 확정 후 착수
4. **② 다중 레퍼런스 정식 지원** (배포 전 필수)
5. **ⓐ Tailwind PostCSS 전환** (배포 전 필수)
6. **⑤ AssetCatalogEntry 통일** (별도 PR, 여유 되면)
7. **최종 QA + git tag + 배포**

---

## 안전 장치 요약

- **레거시 프로젝트 완전 호환**: sanitizeState가 3축(sceneLayers/outfitSessions/locations) 모두 자동 마이그레이션
- **3단 폴백 resolver**: `"loc::layer"` → `"loc::현재"` → `"loc"` → 중립 (appStyleEngine, appFluxPromptEngine, convertContiToEditableStoryboard, buildMechanicalOutfit 모두 일관)
- **자가 치유**: 정규화 실행 시 DNA 오염 자동 감지 + 깨끗한 mechanicalOutfit으로 교체
- **모호할 때 보수적**: TransitionType 매트릭스에서 알 수 없는 조합 → full_change (현실성 우선, 사용자 명시)

---

## 오늘 배포 차단 요소 최종 정리

🔴 **필수** (배포 전):
- ② ImageStudio 다중 레퍼런스 (기능 회귀)
- ⓐ Tailwind PostCSS

🟡 **권장** (다음 릴리스):
- ⑤ AssetCatalogEntry 통일
- Phase 6 MSF/USS 통합
- Phase 8 재설계 (사용자 테스트 후)

🟢 **관찰만**:
- Anthropic API 변동 (모델 속도)
- 설계 재검토 큐
