# CLAUDE.md — DoReMiSsul Studio

## 이 앱이 뭔가
썰쇼츠 유튜브 채널용 제작 도구. 대본 → 이미지 프롬프트 → AI 이미지 생성 → TTS → 영상 편집까지 하나의 데스크톱 앱에서 처리.

## 기술 스택
- React 19 + TypeScript + Vite 6 + Tailwind (CDN)
- Tauri v2 (Rust 백엔드)
- AI: Claude Opus 4.6 (대본 분석) + Gemini 2.5 Flash (이미지 생성) + fal.ai Flux (이미지 생성, 병행) + Supertone (TTS)
- 실행 환경: Mac Studio M4 Max (32GB)

## 절대 규칙 — 위반 시 앱이 깨진다

### Rust 백엔드
- **`lib.rs` 절대 만들지 마.** 모든 Rust 코드는 `src-tauri/src/main.rs` 하나에 있다.
- **`tauri.conf.json`의 plugins 섹션은 빈 `{}` 유지.** 내용 넣으면 빌드 실패.
- API 키는 macOS Keychain 저장 (`keyring` crate, feature = `apple-native`, service = `"doremissul-studio"`).
- 키 종류: `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `SUPERTONE_API_KEY`.
- HTTP 타임아웃: `from_secs(300)` — 줄이지 마.
- `dragDropEnabled: false` 유지.

### Flux 통합 (병행 운영)
- **기존 Gemini 경로 수정 금지.** `imageGeneration.ts`, `appStyleEngine.ts`는 절대 건드리지 마.
- Flux는 별도 경로: `falService.ts` (API), `appFluxPromptEngine.ts` (프롬프트).
- 엔진 전환: `state.selectedImageEngine` → `'gemini'` | `'flux'`. 기본값 `'gemini'`.
- `generateCharacterMask()`와 `renderTextOnImage()`는 엔진 무관 항상 Gemini 사용.
- fal CDN URL은 임시 → 반환 즉시 `falUrlToDataUrl()`로 base64 변환 필수.
- Flux 프롬프트에 `DO NOT`, `[SECTION]:`, `# HEADER`, `(weight:1.4)` 등 지시형/SD식 문법 금지. 묘사형 자연어만.
- 작업 상세: `FLUX_INTEGRATION_WORKPLAN.md` 참조.

### 프론트엔드 구조
- **contexts/ 폴더 금지.** 모든 .ts 파일은 루트 레벨.
- AppContext는 factory 패턴으로 분할됨: `createXxxActions(helpers)` → 핸들러 객체 반환.
  - 분할 파일: appDownloadActions, appGenerationActions, appNormalizationActions, appCharacterActions, appCutEditActions, appProjectActions, appMiscActions
  - helpers: dispatch, stateRef, addNotification + 필요 유틸 주입
  - React Hook 의존 없음 (순수 함수 + async)
- `geminiService.ts`는 re-export 허브. 직접 수정하지 말고 실제 함수가 있는 파일을 수정할 것.
  - 파이프라인 함수 → `textAnalysisPipeline.ts`
  - 수정/포맷 함수 → `textAnalysisRefine.ts`
  - enrichScript + 유틸 → `textAnalysis.ts`
  - 레거시 보관 → `textAnalysis.legacy.ts`
- `⌘+Enter`만 수정 실행. 일반 Enter는 줄바꿈.

### 공통 유틸 (appUtils.ts) — 중복 만들지 마
- `getEngineFromModel(model)` — nano-3pro/3.1 → nano-v3, 그 외 → nano
- `createGeneratedImage({...})` — GeneratedImage 객체 팩토리 (id 자동 생성)
- `buildMechanicalOutfit(names, descs, location, opts?)` — 의상 조립 로직
  - `fallbackUnknown: true` → 정규화 전용
  - `useKorean: true` → StoryboardReviewModal 전용

### 이미지 생성
- 현재 Gemini 단일 엔진. Flux 병행 운영은 **계획 중** (`FLUX_INTEGRATION_WORKPLAN.md` 참조).
- Imagen 4 Fast는 삭제됨. `generateImagenRough` 함수 없음.
- 러프/일반 모두 Gemini 2.5 Flash. 차이는 레퍼런스 유무.
- 인서트 컷은 `sceneImageMap`으로 같은 location 이미지를 스타일 레퍼런스로 자동 첨부.
- Studio는 studioId `'a'` 단일 사용.

### 프롬프트 수정
- Claude 수정: CutFieldChanges JSON 반환 → buildFinalPrompt 재조립.
- **요청하지 않은 필드(LOCATION/배경/의상/앵글) 변경 금지.**
- characters 변경 시 → characterOutfit + imagePrompt 항상 재조립 (변경 출처 무관).

### 다운로드 패턴
- Tauri 환경: `downloadFile()` 헬퍼 사용 (`@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs`).
- 웹 환경: fetch → blob → `<a download>` 패턴.

## 아키텍처

```
React Frontend (WebView)
    ↓ invoke() IPC
Rust Backend (src-tauri/src/main.rs)
    ├─ proxy_claude()       → Claude API
    ├─ proxy_claude_stream() → Claude 스트리밍
    ├─ proxy_gemini()       → Gemini API (이미지)
    ├─ proxy_supertone()    → Supertone API (TTS)
    ├─ save/load/check_api_keys() → macOS Keychain (claude/gemini/supertone)
    ├─ ensure_directories() → 로컬 스토리지
    ├─ save_image_file() / delete_image_file() → 이미지 + 썸네일
    ├─ create/save/load/list/delete_project() → 프로젝트 CRUD
    ├─ save/load/delete/update_asset() → 에셋 카탈로그 CRUD
    ├─ read_image_base64()  → 로컬 파일 → data:URL
    ├─ proxy_fetch()        → 범용 HTTP
    └─ open_asset_catalog() → 에셋 카탈로그 독립 윈도우
```

## 핵심 파일 구조

```
doremi_app-main/
├── index.tsx                # 엔트리 — URL ?view=asset-catalog 분기 (멀티윈도우)
├── App.tsx                  # 메인 앱 — 사이드바 + SceneCard 그리드(3열) + 오른쪽 2탭
├── AppContext.tsx            # Provider + 액션 래퍼 (factory 패턴)
├── appReducer.ts            # 리듀서 + 순수 헬퍼
├── appTypes.ts              # UIState + initialUIState
├── appStyleEngine.ts        # 화풍 프롬프트 빌더 + buildFinalPrompt + 씬무드 감지 + buildProportionStylePrompt
├── appProjectActions.ts     # 프로젝트 CRUD + 에셋 저장
├── appDownloadActions.ts    # ZIP/SRT/필터 다운로드
├── appGenerationActions.ts  # 이미지 생성/러프/일반/수정/일괄수정
├── appNormalizationActions.ts # 정규화 + 의상적용 스토리보드
├── appCharacterActions.ts   # 캐릭터 스튜디오 14개 핸들러
├── appCutEditActions.ts     # Studio 편집/생성 + 컷필드 수정
├── appAnalysisPipeline.ts   # 대본 분석 파이프라인 (Phase1 Step1~3+pause / Phase2 Step4~6)
├── appImageEngine.ts        # 이미지 생성 + 인서트 컷 스타일 참조
├── appMiscActions.ts        # 화풍 핫스왑, outpaint/fill
├── appUtils.ts              # 공통 유틸 (getEngineFromModel, createGeneratedImage, buildMechanicalOutfit)
├── types.ts                 # 전체 타입 정의
├── services/
│   ├── claudeService.ts     # Claude API (429 재시도)
│   ├── geminiService.ts     # Re-export 허브 (직접 수정 금지)
│   ├── ai/
│   │   ├── aiCore.ts        # AI 공유 헬퍼 + Vision 리사이즈 + MIME 감지
│   │   ├── textAnalysis.ts  # enrichScript + 유틸 + re-export
│   │   ├── textAnalysisPipeline.ts # 파이프라인 5함수
│   │   ├── textAnalysisRefine.ts   # 프롬프트 수정/포맷/블루프린트
│   │   ├── textAnalysis.legacy.ts  # 레거시 보관 (건드리지 마)
│   │   └── imageGeneration.ts      # 이미지 생성 (Gemini)
│   ├── supertoneService.ts  # TTS API
│   └── tauriAdapter.ts      # Tauri IPC 브릿지 + emit/listen/openAssetCatalog
├── components/
│   ├── SceneCard.tsx         # 메인 CutCard
│   ├── AppInputScreen.tsx    # 첫 화면 (로그라인+대본+프로젝트설정)
│   ├── EnlargedCutModal.tsx  # 더블클릭 확대 모달
│   ├── EnrichedScriptEditor.tsx # 연출 대본 편집기 (Copy/Paste/Validate)
│   ├── SlideshowModal.tsx    # 슬라이드쇼 재생/프리뷰
│   ├── slideshowUtils.ts    # 캔버스 렌더링 유틸
│   ├── slideshowExport.ts   # 영상 내보내기 (전체/컷별)
│   ├── ImageStudio.tsx       # 이미지 편집 (참조 슬롯 2~5 + 메인 캔버스)
│   ├── imageStudioUtils.ts   # 드래그 프리뷰 + 캔버스 변환
│   ├── ImageEditorModal.tsx  # Nano Image Editor (다중 레퍼런스 최대 5개)
│   ├── CharacterStudio.tsx   # 캐릭터 스튜디오 3컬럼
│   ├── ProportionStudioModal.tsx # 캐릭터 비율 스튜디오 (등신 조절)
│   ├── AssetCatalogModal.tsx # 에셋 카탈로그 (모달)
│   └── AssetCatalogPage.tsx  # 에셋 카탈로그 (독립 윈도우, AppContext 미사용)
├── src-tauri/
│   ├── src/main.rs           # Rust 백엔드 (유일한 .rs 파일)
│   ├── tauri.conf.json       # plugins: {} 유지!
│   └── Cargo.toml
└── vite.config.ts
```

## 대본 분석 파이프라인

```
[Step 1] analyzeScenario(script, seed?, logline?)
    → 시나리오 분석 + locations 배열 (장소 레지스트리)
[Step 2] analyzeCharacterBible()
    → 캐릭터 바이블 (의상 키 = 레지스트리 장소명 강제)
[Step 3] enrichScript()
    → 썰쇼츠 연출 감독 (4원칙) → JSON EnrichedBeat[] 출력
    → 4원칙: Show→Tell→Kill / Emotional Whiplash / Hook→Bait→Punch Out / Tension Rhythm
⏸ enriched_pause → 사용자 편집 (Copy → 외부 AI → Paste → 검증)
[Step 4] generateConti()
    → 컷 분할 (EnrichedBeat[] 입력, 연출 태그 정확히 따를 것)
[Step 5] designCinematography()
    → 촬영 설계
[Step 6] convertContiToEditableStoryboard()
    → 최종 변환
```

### 장소 레지스트리 규칙
- analyzeScenario에서 추출 → AppState.locationRegistry에 저장
- generateConti의 cut.location = 레지스트리에서만 선택 (새 이름 금지)
- 의상 매칭: cut.location ↔ characterDescriptions의 locations 키
- locationRegistry 없는 기존 프로젝트: 빈 배열 → 기존 동작 유지

## 품질 보호 시스템 — 수정 시 유지할 것

### characterOutfit DNA 오염 방지
- `buildFinalPrompt`에서 `DNA_POLLUTION_PATTERN`으로 hair/face/skin/eyes 키워드 감지
- customOutfit에 인물 DNA 있으면 무시 → `char.locations[location]` 폴백

### 씬무드 기반 동적 acting
- `detectSceneMood()` → 5가지 무드(calm/energetic/romantic/tense/neutral)
- lockInstruction이 identityLock + dynamicActing으로 분리됨
- imageGeneration.ts에 하드코딩 "high-energy" 없어야 함 (이전에 제거 완료)
- 프롬프트 레이어 순서: IDENTITY LOCK → SCENE DESCRIPTION → IDENTITY DNA → CINEMATOGRAPHY → COMPOSITION → ACTING → ENVIRONMENT

### Vision API 안전장치
- 12MB+ 이미지 → Canvas 리사이즈(JPEG 85%) 자동 적용
- MIME 감지: base64 매직 바이트로 실제 포맷 판별 (/9j/→JPEG, iVBOR→PNG, UklGR→WebP, R0lGO→GIF)

## 화풍 시스템

### ArtStyle 값 (현재 유효)
normal (정통 썰툰) / moe (극강 귀요미) / dalle-chibi (프리미엄) / vibrant (도파민) / kyoto (감성) / custom

### 프롬프트 시스템 핵심
- `buildArtStylePrompt`: IDENTITY_PROTECTION_CLAUSE + 5개 화풍. 4인자 시그니처 (overrideStyle/overrideCustomText 지원).
- `buildFinalPrompt`: FACE_LOCK + proportion override + 씬무드 감지 + 24개 emotion FX 자동 매칭.

### 에셋 기본 화풍
- 신규 에셋 추가 시 화풍 미선택 → 기본값 `'dalle-chibi'`

## 멀티윈도우 (에셋 카탈로그)

```
메인 앱 사이드바
  ├─ [에셋 카탈로그] → 모달 (AssetCatalogModal, AppContext 사용)
  └─ [↗ 새 창]      → Rust open_asset_catalog → 별도 윈도우
                       URL: /?view=asset-catalog
                       index.tsx에서 분기 → AssetCatalogPage (AppContext 없이, Tauri 직접 호출)
```
- 창 간 통신: emit/listen (`asset-catalog-updated`, `send-to-studio`, `asset-window-closed`)
- capabilities/default.json에 `"asset-catalog"` 윈도우 권한 있음

## 이미지 태그 시스템

```typescript
GeneratedImage.tag?: 'rough' | 'normal' | 'hq'  // 없으면 'hq' 기본 (기존 호환)
GeneratedImage.model?: string  // 'nano-2.5', 'nano-3.1', 'nano-3pro'
```
- 러프: 레퍼런스 없음 (구도 확인용)
- 일반: 레퍼런스 포함 (디테일 확인용)
- 둘 다 Gemini 2.5 Flash

## 실행 명령어
```bash
# 개발
npm run tauri:dev

# 빌드
npm run tauri:build   # → .dmg

# 백업
cd ~/Downloads && zip -r doremi_app-backup-$(date +%Y%m%d-%H%M).zip doremi_app-main/ -x "*/node_modules/*" "*/target/*" "*/.git/*"
```

## 스크립트 전달 방식
- fix 스크립트는 `.py` 파일 또는 단일 커맨드로 제공할 것 (멀티라인 터미널 붙여넣기 실패함).

## 현재 작업 큐
- **Flux 통합 (진행 중)** — `FLUX_INTEGRATION_WORKPLAN.md` 참조. Phase별로 작업 지시할 것.
- 파이프라인 체크포인트/이어서진행 ("이어서 진행" 버튼)
- SlideshowModal 다운로드 패턴 수정 (남은 건)

## Flux 통합 계획 (미구현)

> 상세 계획: `FLUX_INTEGRATION_WORKPLAN.md` 참조

### 개요
- fal.ai Flux API를 기존 Gemini 파이프라인과 **병행 운영** 예정
- **기존 Gemini 경로 수정 금지.** `imageGeneration.ts`, `appStyleEngine.ts`는 절대 건드리지 마.
- Flux는 별도 경로로 추가: `falService.ts` (API), `appFluxPromptEngine.ts` (프롬프트)
- 엔진 전환: `state.selectedImageEngine` → `'gemini'` | `'flux'`. 기본값 `'gemini'`.

### 구현 예정 파일 (아직 없음)
- `services/falService.ts` — fal.ai Flux API 클라이언트
- `appFluxPromptEngine.ts` — Flux 전용 프롬프트 빌더
- `types.ts`에 `ImageEngine`, `FluxModel` 타입 추가 예정
- `src-tauri/src/main.rs`에 `FAL_API_KEY` keychain 추가 예정

### Flux 프롬프트 규칙 (구현 시 참고)
- Flux = 디퓨전 모델. **묘사형 자연어만** 이해. 규칙/네거티브/마크다운 전부 무시됨.
- `DO NOT`, `[SECTION]:`, `# HEADER`, `(weight:1.4)` 등 지시형/SD식 문법 쓰지 마.
- 원하는 것만 묘사. 중요도순 배열: 캐릭터 → 행동 → 감정 → 의상 → 카메라 → 배경 → 화풍 → FX
- 200자 이내 권장. 길어질수록 뒷부분 무시됨.

### Flux에서 Gemini 대체 불가 기능
- `generateCharacterMask()` — 비전 분석, Gemini 전용
- `renderTextOnImage()` — 텍스트 삽입, Gemini LLM이 우위

## 호환성 주의 — 기존 프로젝트가 깨지면 안 된다
- locationRegistry 없으면 빈 배열 폴백
- characterPose 없으면 `|| ''` 폴백
- logline 없으면 빈 문자열 → 파이프라인에서 무시
- GeneratedImage.tag 없으면 'hq' 처리
- characterIdentityDNA 없으면 BODY 라인 생략
- ScenarioAnalysis.locations 없으면 빈 배열
- selectedImageEngine 없으면 'gemini' 폴백
- selectedFluxModel 없으면 'flux-2-flex' 폴백
- locationVisualDNA 없으면 빈 객체 `{}` 폴백
- canonicalName 없으면 koreanName 폴백 (캐릭터 매칭)
- aliases 없으면 `[koreanName]` 폴백
