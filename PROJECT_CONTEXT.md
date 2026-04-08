# DoReMiSsul Studio — 프로젝트 컨텍스트
# 새 Claude 채팅에서 이 파일 + 소스코드 zip을 함께 올리면 됨

## 앱 정체
썰쇼츠 유튜브 채널용 제작 도구. 대본 → 이미지 프롬프트 → AI 이미지 생성 → TTS 음성 → 영상 편집까지 하나의 앱에서 처리.

## 기술 스택
- **프론트엔드**: React 19 + TypeScript + Vite 6 + Tailwind (CDN)
- **데스크톱**: Tauri v2 (Rust 백엔드)
- **AI**: Claude Sonnet (대본 분석/프롬프트) + Gemini 2.5 Flash (이미지 생성) + Supertone (TTS)
- **실행 환경**: Mac Studio M4 Max (32GB)
- **Claude API**: Tier 3 (800K ITPM, 누적 $200 충전)

## 아키텍처 (Phase 12)
```
React Frontend (WebView)
    ↓ invoke() IPC
Rust Backend (src-tauri/src/main.rs)  ← 주의: lib.rs 없음, main.rs 하나에 다 있음
    ├─ proxy_claude()       → Claude API (대본 분석)
    ├─ proxy_claude_stream() → Claude 스트리밍
    ├─ proxy_gemini()       → Gemini API (이미지 생성)
    ├─ proxy_supertone()    → Supertone API (TTS)
    ├─ save/load/check_api_keys() → macOS Keychain (keyring crate)
    ├─ ensure_directories() → 로컬 스토리지 디렉토리 생성
    ├─ save_image_file() / delete_image_file() → 이미지 파일 관리 + 썸네일
    ├─ create/save/load/list/delete_project() → 프로젝트 CRUD (artStyle 포함)
    ├─ save/load/delete/update_asset() → 에셋 카탈로그 CRUD
    ├─ read_image_base64()  → 로컬 파일 → data:URL 변환
    ├─ proxy_fetch()        → 범용 HTTP
    └─ open_asset_catalog() → 에셋 카탈로그 독립 윈도우 (멀티윈도우)
    ※ HTTP 타임아웃: 300초 (from_secs(300))
```

## 핵심 파일 구조 (Phase 12)
```
doremi_app-main/
├── index.tsx                # 엔트리포인트 — URL ?view=asset-catalog 분기 (멀티윈도우)
├── App.tsx                  # 메인 앱 — 사이드바 + SceneCard 그리드(3열) + 오른쪽 2탭 + 전체 흐름 확인(6열) + 확대 모달
├── AppContext.tsx            # Provider + 액션 래퍼 — 러프/일반/수정/확정/다운로드 필터 포함
├── appReducer.ts            # 리듀서 + 순수 헬퍼
├── appTypes.ts              # UIState 인터페이스 + initialUIState (enlargedCutNumber 포함)
├── appStyleEngine.ts        # 화풍 프롬프트 빌더 + buildFinalPrompt (DNA 오염 방지 + fxMap 자동매칭 + 씬무드 감지 + 동적 acting)
├── appProjectActions.ts     # 프로젝트 CRUD + 에셋 저장
├── appDownloadActions.ts    # ★ Phase 10+: ZIP/SRT/필터 다운로드 (AppContext에서 분리)
├── appGenerationActions.ts  # ★ Phase 10+: 이미지 생성/러프/일반/수정/일괄수정 (AppContext에서 분리)
├── appNormalizationActions.ts # ★ Phase 10+: 정규화 + 의상적용 스토리보드 (AppContext에서 분리)
├── appCharacterActions.ts   # ★ Phase 10+: 캐릭터 스튜디오 액션 — 업스케일/성격/마네킹/의상 (AppContext에서 분리)
├── appCutEditActions.ts     # ★ Phase 10+: Studio 편집/생성 + 컷필드 수정/정제/제3인물 (AppContext에서 분리)
├── appAnalysisPipeline.ts        # 대본 분석 파이프라인 ★ Phase 12: Phase1(Step1~3+pause) / Phase2(Step4~6) 분리
├── appImageEngine.ts        # 이미지 생성 + 인서트 컷 스타일 참조 (sceneImageMap)
├── appMiscActions.ts        # 화풍 핫스왑, outpaint/fill 재시도
├── appUtils.ts              # ★ Phase 10+: 공통 유틸 — getEngineFromModel, createGeneratedImage, buildMechanicalOutfit
├── appUtils.ts              # ★ Phase 10+: 공통 유틸 — getEngineFromModel, createGeneratedImage, buildMechanicalOutfit
├── types.ts                 # 타입 — GeneratedImage.tag/model, Cut.isConfirmed, EditImageFunction(배열)
├── services/
│   ├── claudeService.ts     # Claude API (429 재시도)
│   ├── geminiService.ts     # Re-export 허브 (레거시 함수는 textAnalysis.legacy.ts에서 re-export)
│   ├── ai/
│   │   ├── aiCore.ts        # AI 공유 헬퍼
│   │   ├── textAnalysis.ts  # 텍스트 분석 함수 ★ Phase 10+: 파이프라인/수정 분리 후 695줄 (re-export 허브)
│   │   ├── textAnalysisPipeline.ts # ★ Phase 10+: 파이프라인 5함수 (analyzeScenario→convertContiToEditableStoryboard)
│   │   ├── textAnalysisRefine.ts   # ★ Phase 10+: 프롬프트 수정/포맷/블루프린트/CutFieldChanges
│   │   ├── textAnalysis.legacy.ts # ★ Phase 9: 레거시 보관 (generateEditableStoryboard, generateEditableStoryboardChunk)
│   │   └── imageGeneration.ts # 이미지 생성 11개 (Imagen 4 Fast 삭제됨)
│   ├── supertoneService.ts  # TTS API
│   └── tauriAdapter.ts      # Tauri IPC 브릿지
├── components/
│   ├── SceneCard.tsx        # ★ 메인 CutCard — [러프][일반][확정]+수정입력란+VERSIONS+더블클릭확대+이미지호버메뉴(다운로드/Studio)
│   ├── AppInputScreen.tsx   # ★ Phase 10+: 첫 화면 — 로그라인+대본입력+프로젝트설정 (App.tsx에서 분리)
│   ├── EnlargedCutModal.tsx # ★ Phase 10+: 더블클릭 확대 모달 (App.tsx에서 분리)
│   ├── EnrichedScriptEditor.tsx # ★ Phase 12: 연출 대본 편집기 (Copy/Paste/Validate)
│   ├── slideshowUtils.ts   # ★ Phase 10+: 슬라이드쇼 유틸/캔버스 렌더링 (SlideshowModal에서 분리)
│   ├── slideshowExport.ts  # ★ Phase 10+: 영상 내보내기 — 전체/컷별 (SlideshowModal에서 분리)
│   ├── ImageStudio.tsx      # 이미지 편집 Studio — 참조 슬롯 2~5개(드래그+파일+에셋 3경로) + 메인 캔버스
│   ├── imageStudioUtils.ts  # ★ Phase 10+: 드래그 프리뷰 + 캔버스 변환 (ImageStudio에서 분리)
│   ├── ImageEditorModal.tsx # Nano Image Editor — 다중 레퍼런스 (최대 5개)
│   ├── CharacterStudio.tsx  # 캐릭터 스튜디오 3컬럼
│   ├── AssetCatalogModal.tsx # 에셋 카탈로그 (모달 — 메인 앱 내)
│   ├── AssetCatalogPage.tsx # ★ Phase 10: 에셋 카탈로그 (독립 윈도우용 풀페이지, AppContext 미사용)
│   └── (기타 모달 14개)
├── src-tauri/
│   ├── src/main.rs          # Rust 백엔드
│   ├── tauri.conf.json
│   └── Cargo.toml
└── vite.config.ts
```

## 대본 분석 파이프라인 (Phase 12)
```
모든 대본 (기본/상세 구분 없이 단일 경로)
  → [Step 1] analyzeScenario()           → 시나리오 분석 + ★ locations 배열 (장소 레지스트리)
  → [Step 2] analyzeCharacterBible()     → 캐릭터 바이블 (의상 키 = 레지스트리 장소명 강제)
  → [Step 3] enrichScript()              → 썰쇼츠 연출 감독 (4원칙) → ★ JSON EnrichedBeat[] 출력
  → ⏸ enriched_pause                    → 사용자 편집 (Copy → 외부 AI → Paste → 검증)
  → [Step 4] generateConti()             → 컷 분할 (★ EnrichedBeat[] 입력)
  → [Step 5] designCinematography()      → 촬영 설계 (카메라, 시선, 조명)
  → [Step 6] convertContiToEditableStoryboard() → 최종 변환
```

### 장소 레지스트리 (Phase 10)
```
analyzeScenario → locations: ["집 거실", "고기집", "바디프로필 촬영장"]
                       ↓ SET_LOCATION_REGISTRY
              AppState.locationRegistry
                       ↓
  analyzeCharacterBible: outfitRecommendations 키 = 레지스트리 장소명
  enrichScript: 연출 설계 시 레지스트리 장소명 참조
  generateConti: cut.location = 레지스트리에서만 선택 (새 이름 금지)
  StoryboardReviewModal: LOCATION 드롭다운 = 레지스트리 기반
                       ↓
  의상 매칭 검증: cut.location ↔ characterDescriptions[key].locations[location]
  매칭 실패 시: 빨간 점 + 인라인 경고 "의상 매칭 실패"
```

### enrichScript — 썰쇼츠 연출 감독 (Phase 9 핵심)
```
역할: 태그 붙이기 보조 → 썰쇼츠 전문 연출 감독으로 격상

미션: 쇼츠 60초 안에 Hook → Escalate → Punch Out
타겟: 20~50대 남성, 쿨하고 건조한 나레이션

연출 문법 4원칙:
  1. Show → Tell → Kill (보여주고 설명해서 확인사살)
  2. Emotional Whiplash (감정 롤러코스터 — 감정 낙차 극대화)
  3. Hook → Bait → Punch Out (3초 낚시 → 떡밥 → 감정 빵 엔딩)
  4. Tension Rhythm (긴장-이완 리듬 — 클라이맥스 전 정적 브레이크)

2모드 자동 감지:
  - 기본대본 모드: 연출 태그 없음 → 4원칙 적용해서 상세 연출 대본으로 변환
  - 상세대본 모드: (등장인물:, 이미지프롬프트:) 감지 → 4원칙 기준 검수 + 부족분만 보완

감지 로직: /\(등장인물:|이미지프롬프트:|연출의도:\)/i.test(script)
시그니처: enrichScriptWithDirections(script, characterProfilesString?, seed?, onProgress?)
```

### generateConti — enrichScript 따르기 (Phase 9 변경)
```
enrichScript 출력이 있으면:
  - [훅], [Show→Tell], [Whiplash], [인서트: ...], [리액션: ...] 등 연출 태그를 정확히 따라서 컷 변환
  - 연출 순서를 임의로 바꾸지 않음
  - 감정 비트([Sparkling], [Gloom] 등)를 emotionBeat에 반영

시그니처: generateConti(script, scenarioAnalysis, characterBibles, enrichedScript?, seed?, onProgress?)
```

### 레거시 경로 (Phase 9에서 제거)
```
기존: isDetailedScript 분기 → analyzeCharacters → generateEditableStoryboard (chunked)
제거: appAnalysisPipeline.ts에서 레거시 분기 완전 삭제
보관: textAnalysis.legacy.ts (generateEditableStoryboard, generateEditableStoryboardChunk)
호환: geminiService.ts가 legacy 파일에서 re-export → AppContext.tsx의 handleRegenerateStoryboardDraft 동작 유지
```

## 메인 레이아웃 (Phase 9)
```
┌─────────┬───────────────────────────────┬──────────────────┐
│ 사이드바 │  SceneCard 그리드 (메인, 3열)  │  오른쪽 2탭      │
│ (고정)   │  상단: [전체러프][전체일반][전체확정]│                │
│         │                               │  [편집] [이력]   │
│         │  씬별로 CutCard 나열 (접기/펼치기) │                │
│         │  각 CutCard:                   │  편집 탭:        │
│         │    CAST, STYLE, 나레이션        │   참조 슬롯 2~5  │
│         │    이미지(호버: 다운로드+Studio) │   + 에셋 버튼    │
│         │    (더블클릭→확대모달)          │   메인 캔버스    │
│         │    AUDIO, GUEST                │   텍스트 편집    │
│         │    [러프][일반][확정]            │                  │
│         │    수정 요청 (⌘+Enter)          │  이력 탭:        │
│         │    VERSIONS (배지: 러프/일반/HQ) │   호버: 다운로드  │
│         │    PROMPT DETAILS (확장형)      │   +Studio+삭제   │
│         │                               │   컷 미선택 시   │
│         │  하단: 일괄 수정 바 (⌘+Enter)   │     전체 이미지  │
└─────────┴───────────────────────────────┴──────────────────┘
```

## 전체 흐름 확인 모달 (Phase 9)
- 사이드바 "전체 흐름 확인" 버튼 → `isCutDetailOpen` 토글
- 98vw × 95vh 풀스크린 모달
- **6열 그리드** (grid-cols-2 / md:4 / xl:6) + gap-1
- 각 CutCard `transform: scale(0.78)` + `transformOrigin: top left` + `marginBottom: -22%` + `marginRight: -22%`
- 각 카드 wrapper에 `border border-zinc-400 rounded-xl` (시인성 보장)
- 내용 100% 동일 유지 (버튼, 수정 입력란, VERSIONS 전부 작동)
- 한 화면에 최대 12~18컷 표시 → 전체 흐름 한눈에 파악

## CutCard 대표이미지 호버 메뉴 (Phase 9+)
- 대표이미지 호버 시 하단 그라데이션 오버레이에 2버튼 표시:
  - 📥 **다운로드** — fetch → blob → `<a download>` 방식 개별 PNG 다운로드
  - ✏️ **Studio 전송** — `handleSendImageToStudio(selectedImage)` 호출
- 기존 호버 버튼 유지: 좌상단 에셋 저장, 우상단 선택 해제

## 히스토리 이미지 호버 메뉴 (Phase 9+)
- **선택 컷 이력** (3버튼): 📥다운로드 + ✏️Studio + 🗑삭제
- **전체 이미지** (3버튼): 👁확대 + 📥다운로드 + ✏️Studio
- 다운로드: `handleDownloadSingleImage(url, filename)` — fetch → blob → createObjectURL

## 이미지 태그 시스템 (Phase 8)
### GeneratedImage.tag + model
```typescript
interface GeneratedImage {
    id: string;
    imageUrl: string;
    localPath?: string;
    sourceCutNumber: string;
    prompt: string;
    engine: 'dalle3' | 'nano' | 'nano-v3' | 'imagen-rough';
    createdAt: string;
    tag?: 'rough' | 'normal' | 'hq';  // 없으면 'hq' 기본값 (기존 호환)
    model?: string;  // 'nano-2.5', 'nano-3.1', 'nano-3pro' 등
}
```
- 별도 RoughCutState 없음 → 이중 상태 문제(Phase 7 버그) 근본 해결
- VERSIONS 썸네일에 `[러프/2.5]` `[일반/3.1]` `[HQ/3pro]` 배지 표시
- 기존 이미지(tag 없음)는 'hq'로 처리, model 없으면 미표시

### 러프/일반 투트랙 — 둘 다 Gemini Flash
| 버튼 | 모델 | 레퍼런스 | 용도 |
|------|------|---------|------|
| [러프] | Gemini 2.5 Flash | 없음 (characters: [], characterDescriptions: {}) | 구도/포즈 확인 |
| [일반] | Gemini 2.5 Flash | 캐릭터 레퍼런스 포함 | 표정/디테일 확인 |
| 사이드바 생성 | Gemini 2.5 Flash | 캐릭터 레퍼런스 포함 | 고퀄 (tag: 'hq') |

### 확정 시스템
- `Cut.isConfirmed?: boolean` — 프롬프트 잠금, 고퀄 생성 대상
- `TOGGLE_CONFIRM_CUT`, `CONFIRM_ALL_CUTS` 리듀서 액션
- 상단 [전체 확정]: 이미지 있는 컷 전부 확정

## 품질 보호 시스템 (Phase 8+)

### characterOutfit DNA 오염 방지
- `buildFinalPrompt`에서 `DNA_POLLUTION_PATTERN` 정규식으로 hair/face/skin/eyes 등 인물 외모 키워드 감지
- customOutfit에 인물 DNA가 들어가 있으면 무시 → `char.locations[location]`으로 폴백
- 단일/다중 캐릭터 모두 적용

### 의상 자동생성 빈 장소만 필터링
- `handleGenerateLocationOutfits`에서 빈 장소만 필터링
- 기존 의상이 있는 장소는 보존, 기존 의상 컨텍스트를 프롬프트에 포함 (톤 일관성)

### 인서트 컷 스타일 참조
- `handleRunSelectiveGeneration`에서 `sceneImageMap` 빌드 → `generateImageForCut` ctx에 전달
- 인서트 컷(캐릭터 없음)은 같은 location에 이미 생성된 캐릭터 컷 이미지를 스타일 레퍼런스로 자동 첨부

### fxMap 자동 매칭
- `directorialIntent`가 비어있을 때 `sceneDescription` + `emotion`에서 감정 키워드 자동 추출
- gloom/sad → Vertical Gloom Lines, rush/action → Speed Lines, romantic/love → Soft Bloom, sparkle/happy → Sparkling Aura

## AI 프롬프트 수정 — 하이브리드
```
자연어 → Claude → CutFieldChanges JSON (변경 필드만) → buildFinalPrompt 재조립
```
- SceneCard 개별 수정: 수정 입력란 + ⌘+Enter → handleRefinePrompt
- 하단 일괄 수정: 모든 컷에 동일 요청 적용 → handleBatchRefine
- Claude 절대 규칙: 요청하지 않은 필드(LOCATION/배경/의상/앵글) 변경 금지

### 인물 ↔ AI 수정 양방향 동기화
- CAST 버튼 토글 → characters + characterOutfit 재조립 + calculateFinalPrompt
- AI 수정(Claude)에서 characters 반환 → characters + characterOutfit 재조립 + buildFinalPrompt
- 핵심: characters 변경 시 항상 characterOutfit + imagePrompt 재조립 (변경 출처 무관)

## Studio 편집 — 참조 슬롯 + 메인 캔버스
```
┌────┐ ┌────┐ [+] [에셋] [🗑]  ← 3경로: 드래그/파일/에셋
│참조1│ │참조2│              ← 채우면 5개까지 확장, 클릭→확대뷰
└────┘ └────┘              ← 드래그 시 전체 영역 ring 하이라이트
┌──────────────────────┐
│                      │    ← 메인 캔버스: 원본 이미지 드래그앤드롭
│   편집 이미지         │    ← 줌/팬/마스크 지원
│                      │
└──────────────────────┘
  텍스트로 편집 (Nano)
  [Ori] [Res] [Sav] [Can] [Ups]
  [수정] [생성]
```
- 원본 이미지 슬롯 없음 → 메인 캔버스에 직접 드래그앤드롭
- 참조 슬롯: 기본 2개 표시, 최대 5개 확장 (Gemini 5개 레퍼런스 지원)
- 참조 슬롯 클릭 시 ImageViewer로 확대 가능
- 참조 추가 3경로: 드래그앤드롭 / 파일업로드 / 에셋 카탈로그 선택 (IS_TAURI에서만)
- Studio A만 사용 (B 미사용, 타입 시그니처에 보관)

## ImageEditorModal — 다중 레퍼런스 (Phase 8+)
- 기존 단일 `referenceImageUrl` → `referenceImageUrls: string[]` 배열 (최대 5개)
- 캐릭터 A-Pose, 마스터 배경 등을 슬롯형 UI로 복수 추가
- 개별 삭제 + 전체 삭제 지원
- `EditImageFunction` 타입도 `referenceImageUrls?: string[]`로 변경

## 더블클릭 확대 모달 (Phase 8+)
- SceneCard 이미지 더블클릭 → `enlargedCutNumber` (UIState) → 확대 모달
- 확대 모달: 이미지 + 나레이션 + 캐릭터 + 프롬프트 + [러프][일반][확정][Studio] 버튼 + 이미지 이력 그리드
- 이미지 이력에서 대표 이미지 선택, Studio 전송, 삭제 가능

## 진행률 표시 (Phase 8+)
- 전체 러프/일반 생성 시 `loadingMessage`에서 `(X/Y)` 패턴 파싱 → progress bar + 퍼센트 표시
- 분석 파이프라인은 기존 `analysisStage` + `analysisProgress` 사용

## 다운로드 시스템 (Phase 9)
- **전체 이미지 다운로드**: 모든 이미지 ZIP
- **선택 이미지 다운로드**: 각 컷의 대표(선택) 이미지만 ZIP
- **HQ만 다운로드**: tag === 'hq' 이미지만 ZIP
- **일반만 다운로드**: tag === 'normal' 이미지만 ZIP
- **러프만 다운로드**: tag === 'rough' 이미지만 ZIP
- **AI 자막 (SRT) 다운로드**
- **개별 이미지 다운로드**: 컷카드 호버/이력 호버에서 단건 PNG 다운로드 (`handleDownloadSingleImage`)

## AppContext 주요 액션 (Phase 9)
```typescript
// 러프/일반 생성
handleGenerateForCut(cutNumber, mode: 'rough' | 'normal')
handleGenerateAll(mode: 'rough' | 'normal')

// AI 프롬프트 수정
handleRefinePrompt(cutNumber, request)   // 개별 (⌘+Enter)
handleBatchRefine(request)               // 일괄 (하단 바)

// 확정
handleToggleConfirmCut(cutNumber)
handleConfirmAllCuts()

// Studio 참조 이미지
handleStudioReferenceAdd(studioId, url)
handleStudioReferenceRemove(studioId, index)
handleStudioReferenceClear(studioId)

// 인물 토글 (양방향 동기화)
handleUpdateCutCharacters(cutNumber, names)  // → outfit + prompt 재조립

// 다운로드
handleDownloadAllImagesZip()
handleDownloadFilteredImagesZip(tagFilter: 'rough' | 'normal' | 'hq')
handleDownloadSelectedImagesZip()
handleDownloadSRT()
```

## 실행 명령어
- 개발: `npm run tauri:dev`
- 빌드: `npm run tauri:build` → .dmg
- 백업: `cd ~/Downloads && zip -r doremi_app-backup-$(date +%Y%m%d-%H%M).zip doremi_app-main/ -x "*/node_modules/*" "*/target/*" "*/.git/*"`

## 버전 히스토리
- Phase 1~3.5: 기본 앱 + Claude+Gemini 하이브리드 + Tauri + 화풍 핫스왑
- Phase 4: 프리프로덕션 파이프라인
- Phase 5~5.6: 로컬 스토리지 + 리팩토링
- Phase 6: 캐릭터 스튜디오 + 에셋 자동분석 + AppContext 분리
- Phase 7: 러프 프리뷰 메인 통합 (RoughPreviewBoard — 이중 상태 문제 발생)
- Phase 8: SceneCard 확장 — 이중 상태 제거, tag/model, Studio 참조 2~5슬롯
- Phase 8+ (세션1~3): 품질 보호 + UI 개선 + 레거시 정리
- **Phase 9: enrichScript 재설계 + 파이프라인 통합 + 전체 흐름 확인 모달**
- **Phase 9+: UI 개선 — 이미지 호버 메뉴 + 히스토리 다운로드 + 에셋 참조 + 의상/DNA 분리**
- **Phase 10 (C-1): 에셋 카탈로그 독립 윈도우 — 창 띄우기 + 라우팅**
- **Phase 10 (C-2): 에셋 카탈로그 독립 윈도우 — 창 간 통신 + 동기화**
- **Phase 10 (C-3): 에셋 카탈로그 독립 윈도우 — Studio 연동 + 마무리**
- **Phase 10: 장소 레지스트리 + 의상 매칭 시스템**
- **Phase 11: 에셋 저장경로 설정 기능 (배포 대응)**
- **Phase 12: 구조화 연출 대본 + enriched_pause (파이프라인 편집 기능)**

### Phase 9 변경사항
| 작업 | 파일 | 내용 |
|------|------|------|
| enrichScript 재설계 | textAnalysis.ts | 썰쇼츠 연출 감독 (4원칙 + 2모드 자동감지), 시그니처 변경 |
| 파이프라인 통합 | appAnalysisPipeline.ts | isDetailedScript 레거시 분기 제거, enrichScript 스텝 삽입, 6단계 단일 경로 |
| generateConti 변경 | textAnalysis.ts | enrichedScript 파라미터 추가, 연출 태그 따르기 지시 |
| 레거시 분리 보관 | textAnalysis.legacy.ts (신규) | generateEditableStoryboard + generateEditableStoryboardChunk 이동 |
| re-export 수정 | geminiService.ts | 레거시 함수를 textAnalysis.legacy.ts에서 re-export (AppContext 호환) |
| 전체 흐름 확인 모달 | App.tsx | 기존 "컷 상세 보기" → 6열 + scale(0.78) + 98vw 오버뷰 모달 |

### Phase 9+ UI 개선
| 작업 | 파일 | 내용 |
|------|------|------|
| 전체 흐름 모달 간격+테두리 | App.tsx | gap-1, border-zinc-400, scale(0.78) origin top-left, margin -22% |
| 히스토리 다운로드 버튼 | App.tsx | handleDownloadSingleImage 유틸, 선택컷/전체 이력 호버에 📥 추가 |
| 참조 슬롯 에셋 추가 | ImageStudio.tsx | AssetCatalogModal 연동, 에셋 버튼(amber), resolveImageUrl→onReferenceAdd |
| 컷카드 이미지 호버 메뉴 | SceneCard.tsx | 하단 gradient 오버레이 + 📥다운로드 + ✏️Studio 전송 |
| AI Director Review 버튼명 | StoryboardReviewModal.tsx | "Finalize Direction & Generate" → "연출 확정" |
| SYNC OUTFIT hair DNA 제거 | StoryboardReviewModal.tsx | handleSyncOutfitFromProfile/handleManualOutfitSelect에서 hair 삽입 제거 |
| characterIdentityDNA 분리 | types.ts, appReducer.ts, textAnalysis.ts, appStyleEngine.ts, AppContext.tsx, SceneCard.tsx | Cut/EditableCut에 characterIdentityDNA 필드 추가, buildFinalPrompt BODY 라인, 프로젝트 호환 |

### Phase 8+ 상세 변경 (세션 1~3)
| 작업 | 파일 | 내용 |
|------|------|------|
| characterOutfit DNA 오염 방지 | appStyleEngine.ts | DNA_POLLUTION_PATTERN으로 인물 외모 키워드 감지 → 폴백 |
| 인서트 컷 sceneImageMap 전달 | AppContext.tsx | handleRunSelectiveGeneration에 sceneImageMap 빌드+전달 |
| fxMap 자동 매칭 | appStyleEngine.ts | intent 빈 경우 emotion/sceneDescription에서 FX 자동 선택 |
| SceneCard 그리드 3열 | App.tsx | xl:grid-cols-2 → xl:grid-cols-3 |
| PROMPT DETAILS 시인성 | SceneCard.tsx | 텍스트/아이콘 확대, hover 배경, 클릭영역 패딩 |
| 참조 슬롯 드래그 개선 | ImageStudio.tsx | 전체 영역 drop zone + ring 하이라이트 + 빈 슬롯 80px |
| 이력 탭 전체 이미지 | App.tsx | 컷 미선택 시 전체 이미지 역순 표시 + 컷번호 배지 |
| 인물 양방향 동기화 | AppContext.tsx | C1/C2 검증 통과 (코드 수정 없음) |
| 더블클릭 확대 모달 | App.tsx, appTypes.ts, SceneCard.tsx | enlargedCutNumber + 확대 모달 UI |
| 진행률 표시 | App.tsx | loadingMessage (X/Y) 파싱 → progress bar |
| RoughPreview 삭제 | 삭제 | RoughPreviewBoard.tsx, RoughPreviewModal.tsx 완전 삭제 |
| ImageEditorModal 다중 레퍼런스 | ImageEditorModal.tsx, types.ts | 단일→배열(최대 5개), 슬롯형 UI |
| Imagen 4 Fast 삭제 | imageGeneration.ts, geminiService.ts | generateImagenRough 함수 완전 삭제 |
| 참조 슬롯 프리뷰 확대 | ImageStudio.tsx | 참조 이미지 클릭 시 ImageViewer 연동 |
| 다운로드 tag 필터 | AppContext.tsx, App.tsx | HQ만/일반만/러프만 다운로드 버튼 추가 |
| EyeIcon 추가 | icons.tsx | 전체 이미지 뷰 확대 버튼용 |

### Phase 10 C-1: 에셋 카탈로그 독립 윈도우 — 창 띄우기 + 라우팅
| 작업 | 파일 | 내용 |
|------|------|------|
| open_asset_catalog 커맨드 | src-tauri/src/main.rs | Tauri 멀티윈도우 — 에셋 카탈로그 별도 창 열기, 중복 방지(포커스) |
| capabilities 윈도우 추가 | src-tauri/capabilities/default.json | windows에 "asset-catalog" 추가 |
| URL 파라미터 라우팅 | index.tsx | ?view=asset-catalog → AssetCatalogPage 렌더링 (AppProvider 없이) |
| openAssetCatalog + emit/listen export | services/tauriAdapter.ts | openAssetCatalog(), emit(), listen() export 추가 |
| AssetCatalogPage 신규 | components/AssetCatalogPage.tsx | 풀페이지 독립 에셋 카탈로그 (AppContext 미사용, Tauri 커맨드 직접 호출) |
| 사이드바 "새 창" 버튼 | App.tsx | 에셋 카탈로그 버튼 옆에 ArrowTopRightOnSquareIcon 새 창 버튼 추가 |

### Phase 10 C-2: 에셋 카탈로그 독립 윈도우 — 창 간 통신 + 동기화
| 작업 | 파일 | 내용 |
|------|------|------|
| CRUD 후 emit | components/AssetCatalogPage.tsx | 추가/삭제/수정 후 emit('asset-catalog-updated') |
| 메인 앱 listen (동기화) | AppContext.tsx | listen('asset-catalog-updated') → 카탈로그 변경 감지 로그 |
| 메인 앱 listen (Studio) | AppContext.tsx | listen('send-to-studio') → 참조 슬롯 삽입 (5개 초과 시 경고) |

### Phase 10 C-3: 에셋 카탈로그 독립 윈도우 — Studio 연동 + 마무리
| 작업 | 파일 | 내용 |
|------|------|------|
| Studio로 보내기 | components/AssetCatalogPage.tsx | handleSendToStudio → emit('send-to-studio', {imageUrl}) |
| 호버 메뉴 Studio 버튼 | components/AssetCatalogPage.tsx | 에셋 카드 호버 시 초록색 ↗ 버튼 추가 |
| 창 닫힘 알림 | components/AssetCatalogPage.tsx | beforeunload → emit('asset-window-closed') |
| 사이드바 열림 표시 | App.tsx | isAssetWindowOpen 상태 + 초록 점 인디케이터 |
| 창 닫힘 감지 | App.tsx | listen('asset-window-closed') → isAssetWindowOpen = false |

### Phase 10: 장소 레지스트리 + 의상 매칭 시스템
| 작업 | 파일 | 내용 |
|------|------|------|
| ScenarioAnalysis.locations | types.ts | 장소 레지스트리 필드 추가 |
| AppState.locationRegistry | types.ts, appReducer.ts | 상태 + 초기값 + SET_LOCATION_REGISTRY 액션 |
| 프로젝트 저장/로드 | types.ts, appReducer.ts | ProjectMetadata + buildProjectMetadata에 locationRegistry 포함 |
| analyzeScenario locations 추출 | textAnalysis.ts | 프롬프트에 locations 배열 추출 지시 추가 |
| analyzeCharacterBible 레지스트리 강제 | textAnalysis.ts | outfitRecommendations 키를 레지스트리 장소명으로 강제 |
| enrichScript 레지스트리 전달 | textAnalysis.ts | 시그니처에 locationRegistry 추가, 프롬프트에 장소 컨텍스트 |
| generateConti 레지스트리 강제 | textAnalysis.ts | location 필드를 레지스트리 목록에서만 선택하도록 강제 |
| 파이프라인 연결 | appAnalysisPipeline.ts | SET_LOCATION_REGISTRY dispatch + enrichScript에 전달 |
| LOCATION 드롭다운 레지스트리 기반 | StoryboardReviewModal.tsx | allLocations를 레지스트리 우선으로 구성 |
| 의상 매칭 실패 감지 | StoryboardReviewModal.tsx | outfitMismatchCuts Set — 빨간 점 + 인라인 경고 |

## 에셋 카탈로그 멀티윈도우 (Phase 10)
```
메인 앱 사이드바
  ├─ [에셋 카탈로그] → 기존 모달 (AssetCatalogModal)
  └─ [↗ 새 창]      → Rust open_asset_catalog → 별도 윈도우
                       URL: /?view=asset-catalog
                       index.tsx에서 분기 → AssetCatalogPage (AppContext 없이)

에셋 카탈로그 독립 창:
  - 독립 CRUD: loadAssetCatalog, saveAsset, deleteAsset, updateAssetMetadata (Tauri 직접)
  - 이미지 표시: resolveImageUrl → asset:// (메인 앱과 동일)
  - API 키: 같은 앱이므로 macOS Keychain 공유
  - Vision 분석: aiCore.ts 직접 import (토큰 카운트는 콘솔 로그)
  - 창 간 통신 (C-2 완료):
    - 에셋→메인: emit('asset-catalog-updated', {action, assetId}) → 메인 앱 감지
    - 에셋→메인: emit('send-to-studio', {imageUrl}) → Studio 참조 슬롯 삽입 (5개 초과 경고)
  - Studio 전송 (C-3 완료):
    - 에셋 카드 호버 시 ↗ "Studio로 보내기" 버튼 (초록색)
    - emit('send-to-studio') → 메인 AppContext listen → studioSessions['a'] 삽입
    - 창 닫힘: beforeunload → emit('asset-window-closed') → 사이드바 초록 점 제거
```

## 주의사항
- `lib.rs` 없음 — 전부 `main.rs`
- `dragDropEnabled: false`, Rust 타임아웃 300초
- contexts/ 폴더 금지 — 루트 레벨 .ts만
- geminiService.ts는 re-export 허브 (레거시는 textAnalysis.legacy.ts에서 re-export)
- textAnalysis.legacy.ts: generateEditableStoryboard + generateEditableStoryboardChunk 보관 (Phase 9)
- enrichScriptWithDirections: 시그니처 변경됨 — (script, characterProfilesString?, locationRegistry?, logline?, seed?, onProgress?) → ★ Phase 12: 반환 { enrichedScript, enrichedBeats, tokenCount }
- generateConti: 시그니처 변경됨 — (script, scenarioAnalysis, characterBibles, enrichedBeats?, logline?, seed?, onProgress?) ★ Phase 12: enrichedScript→enrichedBeats
- analyzeScenario: 시그니처 변경됨 — (script, seed?, logline?)
- Imagen 4 Fast: 완전 삭제됨 (generateImagenRough 없음)
- refinePromptWithAI: CutFieldChanges JSON 반환
- 인서트 컷: sceneImageMap으로 같은 location 이미지 스타일 참조
- RoughPreviewBoard.tsx, RoughPreviewModal.tsx: 삭제됨
- ImageStudio: studioId 'a'만 사용 중, 'b' 미사용 (타입 시그니처 보관)
- ImageStudio: 원본 이미지 슬롯 없음, 메인 캔버스에 직접 드롭
- ImageStudio: 참조 추가 3경로 (드래그/파일/에셋), 에셋은 IS_TAURI에서만 표시
- ImageEditorModal: 다중 레퍼런스 배열 (referenceImageUrls, 최대 5개)
- EditImageFunction: referenceImageUrls?: string[] (배열)
- ⌘+Enter만 수정 실행 (일반 Enter는 무반응 또는 줄바꿈)
- characterIdentityDNA: Cut/EditableCut 필드, 의상(characterOutfit)과 분리된 인물 체형 DNA
- buildFinalPrompt: characterIdentityDNA 있으면 BODY 라인 추가, 없으면 생략 (기존 프로젝트 호환)
- SYNC OUTFIT: hair DNA 삽입 제거 (hair는 buildFinalPrompt IDENTITY DNA에서 별도 처리)
- 전체 흐름 확인 모달(isCutDetailOpen): 6열 + scale(0.78) + origin top-left + margin -22% + gap-1 + border-zinc-400 오버뷰 모달
- SceneCard 대표이미지: 호버 시 하단 gradient에 다운로드+Studio 버튼
- 히스토리 이미지: 호버 시 다운로드 버튼 포함 (handleDownloadSingleImage)
- index.tsx: URL ?view=asset-catalog 분기 → AssetCatalogPage (AppProvider 감싸지 않음)
- AssetCatalogPage: useAppContext() 사용 안 함, Tauri 커맨드만으로 독립 CRUD
- AssetCatalogPage: analyzeAssetWithVision + AssetTagPopup은 AssetCatalogModal에서 import (공유)
- tauriAdapter.ts: listen(), emit(), openAssetCatalog() export 추가 (Phase 10)
- capabilities/default.json: windows에 "asset-catalog" 추가 (멀티윈도우 권한)
- open_asset_catalog: 이미 열려있으면 포커스만 (중복 창 방지)
- 에셋 독립 창 토큰 카운트: AppContext 없으므로 console.log만 (메인 앱 표시 안 됨)
- emit('asset-catalog-updated'): 에셋 창 CRUD 후 메인 앱에 알림 (Phase 10 C-2)
- listen('send-to-studio'): 메인 AppContext에서 수신 → studioSessions['a'] 참조 슬롯 삽입, 5개 초과 시 에러 알림
- listen 정리: useEffect cleanup에서 unlisten 호출 (메모리 누수 방지)
- handleSendToStudio: 에셋 창 호버 메뉴 → emit('send-to-studio') → 메인 앱 참조 슬롯 삽입 (Phase 10 C-3)
- isAssetWindowOpen: 에셋 독립 창 열림 상태 → 사이드바 ↗ 버튼에 초록 점 표시
- asset-window-closed: 에셋 창 beforeunload → 메인 앱 listen → isAssetWindowOpen = false
- ScenarioAnalysis.locations: 장소 레지스트리 — analyzeScenario에서 추출, 없으면 빈 배열 (기존 프로젝트 호환)
- AppState.locationRegistry: 파이프라인 Step 1 후 저장, analyzeCharacterBible/enrichScript/generateConti에 전달
- locationRegistry가 없는 기존 프로젝트: 빈 배열 → 기존 동작 유지 (드롭다운은 컷 장소에서 추출)
- StoryboardReviewModal LOCATION 드롭다운: 레지스트리 우선 + 컷에만 있는 장소 append
- outfitMismatchCuts: 의상 매칭 실패 컷 감지 → DraftCutCard 빨간 점 + Base Outfit 영역 인라인 경고

## appStyleEngine 리팩토링 — 씬무드 기반 동적 acting (2026-03-18)

### 문제
- `lockInstruction`이 모든 씬에 "high-energy, exaggerated manga-style pose" 강제 → 차분한 씬(이불 속 클로즈업 등)에서 무시됨
- `sceneDescription`이 FX 자동매칭용으로만 읽히고, 최종 프롬프트에 아예 미포함 → Gemini가 장면 묘사를 모름
- `lockInstruction`이 프롬프트 최상단에 위치 → 씬별 카메라/분위기 정보가 우선순위에서 밀림

### 수정 내용
1. **lockInstruction 분리**: `identityLock` (얼굴/의상 고정, 항상 동일) + `dynamicActing` (씬 무드에 따라 동적 생성)
2. **씬 무드 감지 시스템 추가**: `detectSceneMood()` — sceneDescription + emotion + intent + shotSize 분석 → 5가지 무드(calm/energetic/romantic/tense/neutral) 분류
   - calm: 클로즈업, 이불, 침대, 어둠, 고요 등 → 차분한 포즈 지시
   - energetic: 뛰기, 싸움, 놀람 등 → 기존 하이에너지 포즈 유지
   - romantic: 포옹, 사랑, 따뜻 등 → 부드러운 바디랭귀지
   - tense: 긴장, 불안, 위협 등 → 경직된 포즈
   - neutral: 매칭 없음 → 씬 디스크립션 따르기
3. **sceneDescription 최종 프롬프트에 삽입**: `# [CRITICAL: SCENE DESCRIPTION — MUST FOLLOW]` 블록으로 identityLock 바로 다음에 배치 → Gemini가 장면 묘사를 우선 참조
4. **TECHNICAL_CONSTRAINTS 완화**: "EXAGGERATED MANGA EXPRESSIONS" → "Expressive manga-style features. Body language should match the scene's emotional context."
5. **프롬프트 레이어 순서 재조정**: IDENTITY LOCK → SCENE DESCRIPTION → IDENTITY DNA → CINEMATOGRAPHY → COMPOSITION → ACTING → ENVIRONMENT
6. **클로즈업 샷 감지**: shotSize에 'close'/'ecu'/'cu' 포함 시 calm 가중치 부스트 (물리적으로 하이에너지 포즈 불가능)
- `buildActingDirection()`: 무드별 acting 지시문 반환 함수
- 기존 `technicalFX`는 동적 acting 블록 안으로 이동 (분산 방지)

### imageGeneration.ts — 하드코딩 acting 제거 (2026-03-18, 후속 패치)

**문제**: appStyleEngine 리팩토링 후에도 결과가 동일 → `imageGeneration.ts`에 하드코딩된 "high-energy" 3곳이 buildFinalPrompt 출력을 덮어씌움
**수정**:
1. `editImageWithNano` L62: `"High-energy performance, dynamic manga silhouettes"` → `"Follow the acting and mood directions provided in the instruction"` (scene-adaptive)
2. `generateMultiCharacterImage` L194: `"EXAGGERATED MANGA ACTING"` 제거 → `"Follow the acting and mood directions in the scene description below"`
3. `generateMultiCharacterImage` L201: `"high-energy and communicative"` → `"match the scene mood described above"`
- 핵심: buildFinalPrompt의 씬무드 기반 동적 acting이 imageGeneration.ts까지 관통하도록 파이프라인 정리

### convertContiToEditableStoryboard 필드 매핑 정리 (2026-03-18, 후속 패치 2)

**문제**: ContiCut → EditableCut 변환 시 필드가 잘못 매핑되어 컷카드 표시 + 최종 프롬프트 모두 오염
- characterPose ← `shotSize, cameraAngle` ("medium, eye-level") → 포즈가 아니라 카메라 정보
- characterEmotionAndExpression ← `emotionBeat` ("일상") → 표정 묘사가 아니라 감정 키워드 (이건 유지, 씬무드 감지 입력용)
- locationDescription ← `lightingNote` ("cold morning light") → 장소 묘사가 아니라 조명 메모
- otherNotes ← `sfxNote` ("유튜브 영상 소리") → 카메라 노트 자리에 효과음

**수정 (textAnalysis.ts L1215~1232)**:
- `characterPose`: 빈값 (ContiCut에 포즈 데이터 없음, sceneDescription + 동적 acting이 커버)
- `locationDescription`: `장소명 + Lighting: 조명메모` 결합 (예: "민준의 방. Lighting: cold morning light")
- `otherNotes`: `shotSize, cameraAngle` (buildFinalPrompt 카메라 폴백용 — cinematographyPlan 없을 때)
- `directorialIntent`: 기존 + `sfxNote` 병합 (`| sfx: 유튜브 영상 소리`)
- 주석으로 필드 매핑 규칙 명시

### 최종 프롬프트 확인 UI + 콘솔 로그 (2026-03-18, 후속 패치 3)

**문제**: Gemini에 실제 전송되는 최종 프롬프트를 확인할 수 없어 생성 문제 원인(프롬프트 vs Gemini) 판별 불가
**수정**:
1. **SceneCard.tsx**: IMAGE PROMPT 필드에 `🔍 FULL` 버튼 → 클릭 시 모달로 3가지 프롬프트 확인
   - Scene Prompt (buildFinalPrompt 출력) + 📋 Copy
   - Art Style Prompt (buildArtStylePrompt 출력) + 📋 Copy
   - Combined 설명 (두 프롬프트가 Gemini에 분리 전송되는 구조 안내) + 📋 Copy All
   - import: `buildArtStylePrompt` from `../appStyleEngine`
   - state: `showFullPromptModal`
2. **imageGeneration.ts**: `[GEMINI PROMPT]` 콘솔 로그 2곳 추가
   - `editImageWithNano`: 텍스트 프롬프트 전체 로그
   - `generateMultiCharacterImage`: finalPrompt 전체 로그

### appAnalysisPipeline — analysisStage idle 미복귀 버그 수정 (2026-03-18, 후속 패치 4)

**증상**: 대본 분석 완료 후 아무 작업 안 해도 주기적으로 "상세 스토리보드 생성 및 검토 준비 중..." 로딩 모달이 재등장
**원인**: 분석 파이프라인 성공 시 `analysisStage`가 `'storyboard'`에 머물고 `'idle'`로 안 돌아감. 이후 다른 `START_LOADING` (이미지 생성, 자동저장 등) 발동 시 `isLoading: true` + `analysisStage !== 'idle'` 조건이 맞아서 분석 진행 UI 표시
**수정**: `appAnalysisPipeline.ts` — 100% 도달 후 800ms 뒤 `analysisStage: 'idle'` 리셋 (`setTimeout`)

### ContiCut characterPose 필드 추가 (2026-03-18, 후속 패치 5)

**문제**: ContiCut에 포즈 데이터가 없어서 characterPose가 항상 빈값 → Gemini가 자세를 랜덤 해석 → 컷 간 연결성 단절
**수정**:
1. **types.ts**: `ContiCut.characterPose?: string` 필드 추가
2. **textAnalysis.ts (generateConti)**: 프롬프트 규칙 10번 추가 — 신체 부위별 위치, 손/머리/무게중심 필수, 감정 연동, 이전 컷 연결성 고려, insert/establish은 빈값. JSON 예시에 characterPose 포함.
3. **textAnalysis.ts (convertContiToEditableStoryboard)**: `characterPose: cut.characterPose || ''` 매핑 (기존: 빈값 하드코딩)
4. **textAnalysis.ts (regenerateSingleCutDraft + regenerateCutFieldsForCharacterChange)**: 포즈 프롬프트 개선 — "dynamic pose" → "limb placement, head direction, weight center, hand position"
- appStyleEngine.ts는 이미 characterPose를 읽고 있어서 변경 불필요
- 기존 프로젝트 호환: characterPose 없으면 `|| ''` 폴백 → sceneDescription 위임

### generateConti 한국어 뉘앙스 보존 규칙 (2026-03-18, 후속 패치 6)

**문제**: 한국어 대본의 동사/형용사/부사/의태어를 영어 visualDescription으로 변환 시 단순 번역되어 뉘앙스 소실
- "뒤집어쓰고" → "under blanket" (텐트처럼 머리까지 뒤집어쓴 느낌 소실)
- "몰래" → "secretive atmosphere" (구체적 행동 없이 분위기로 퉁침)
**수정 (textAnalysis.ts — generateConti 프롬프트)**:
- 규칙 7 강화: "이미지 생성 AI가 정확히 그릴 수 있는 물리적 시각 묘사" + 뉘앙스 보존 규칙 참조
- `# [중요] 한국어 뉘앙스 보존` 섹션 추가: ❌ 나쁜 예(단순 번역) vs ✅ 좋은 예(물리적 장면 변환) 5쌍
- 적용 범위: visualDescription + characterPose 양쪽 모두
### Keep 2: FINALIZE 의상 검증 강화 (2026-03-18)

**변경**: StoryboardReviewModal.tsx — 의상 매칭 실패 인라인 경고에 액션 버튼 추가
- [자동 생성] 버튼: 매칭 실패한 캐릭터의 `actions.handleGenerateLocationOutfits(charKey)` 호출
- [장소 변경] 버튼: `#location-dropdown` 포커스 → 장소 드롭다운 즉시 조작 가능
- LOCATION `<select>`에 `id="location-dropdown"` 추가 (포커스 타겟)
- 기존 빨간 점(DraftCutCard) + 인라인 경고 텍스트는 그대로 유지

### Keep 3: 로그라인 + 첫 화면 리디자인 (2026-03-18)

**로그라인 시스템**: 구조화 입력 → 한줄 결합 → 파이프라인 전달
- UI: 장르(드롭다운) + 톤(멀티칩) + 갈등(텍스트) + 반전(텍스트) → 자동 결합
- 포맷: `장르 / 톤1+톤2 / 갈등 / 반전` (선택, 비어있으면 무시)
- 로컬 state: llGenre, llTones[], llConflict, llTwist → useEffect로 logline 결합
- 프로젝트 로드: logline 문자열을 " / " 분할하여 필드 복원
- 전달 경로: state.logline → analyzeScenario, enrichScript, generateConti 프롬프트에 삽입

**첫 화면 SaaS 리디자인**:
- 레이아웃: 8:4 그리드 (기존 7:3)
- 디자인 톤: 절제된 다크 SaaS (Linear/Raycast 참조)
- 카드: bg-zinc-900/60 + border-zinc-800/60 + backdrop-blur-sm
- 라벨: 10px uppercase tracking-[0.15em] 마이크로 라벨
- 버튼: 그라데이션 제거 → 단색 indigo-600, 절제된 shadow
- 흥행 공식 카드: 글로우 효과 제거 → 미니멀 텍스트

| 파일 | 변경 |
|------|------|
| types.ts | AppDataState.logline, SET_LOGLINE 액션, ProjectMetadata.logline |
| appReducer.ts | 초기값 + SET_LOGLINE 케이스 + buildProjectMetadata + START_NEW_ANALYSIS 보존 |
| App.tsx | 구조화 로그라인 UI + SaaS 리디자인 (로컬 state: llGenre/llTones/llConflict/llTwist) |
| appAnalysisPipeline.ts | logline을 analyzeScenario/enrichScript/generateConti에 전달 |
| textAnalysis.ts | 3개 함수 시그니처에 logline 추가 + 프롬프트 삽입 |

- logline 없는 기존 프로젝트: 빈 문자열 → 파이프라인에서 무시 (호환)
- GENRE_PRESETS: 연애썰/직장썰/가족썰/군대썰/학교썰/복수썰/공포썰/감동썰/사이다썰
- TONE_PRESETS: 코믹/자조유머/따뜻/냉소/긴장감/감동/사이다/어둠/열혈/밝음

### Phase 10+: AppContext 분할 리팩토링 (2026-03-18)

**목표**: AppContext.tsx 1,971줄 → 500줄 목표를 위한 분할
**결과**: 1,971줄 → **874줄** (▼56%), 신규 파일 5개 모두 300줄 이하

| 작업 | 파일 | 내용 |
|------|------|------|
| 다운로드 분리 | appDownloadActions.ts (신규, 284줄) | handleDownloadAllImagesZip, handleDownloadFilteredImagesZip, handleDownloadSelectedImagesZip, handleDownloadSRT, handleCancelZipping, handleCancelSRTGeneration |
| 정규화 분리 | appNormalizationActions.ts (신규, 274줄) | handleRunNormalization, handleGenerateStoryboardWithCustomCostumes |
| 생성/수정 분리 | appGenerationActions.ts (신규, 241줄) | handleRunSelectiveGeneration, handleGenerateForCut, handleGenerateAll, handleRefinePrompt, handleBatchRefine |
| 캐릭터 스튜디오 분리 | appCharacterActions.ts (신규, 214줄) | 업스케일/성격주입/마네킹/의상생성/의상수정/시그니처포즈 등 14개 핸들러 |
| 컷 편집/Studio 분리 | appCutEditActions.ts (신규, 165줄) | handleEditInStudio, handleCreateInStudio, handleUpdateCutCharacters, handleUpdateCutIntent, handleRefineCharacter, handleRefineImage, handleThirdCharacterEdit |
| AppContext 경량화 | AppContext.tsx (874줄) | factory 패턴 연결 + 미사용 import 정리 |

**분리 패턴**: 기존 appProjectActions/appMiscActions와 동일한 factory 패턴 사용
- `createXxxActions(helpers)` → 핸들러 객체 반환
- helpers: dispatch, stateRef, addNotification + 필요한 유틸 함수 주입
- React Hook 의존 없음 (순수 함수 + async)

**주의사항**:
- appDownloadActions: `setUIState`에 `(prev) => ({...prev})` 패턴 사용 (함수형 업데이트)
- appGenerationActions: generateForCutRef/cancelGenerateAllRef를 helpers로 주입받음
- appNormalizationActions: handleOpenReviewModalForEdit를 helpers로 주입받음 (순환 방지)
- appCharacterActions: handleEditImageWithNanoWithRetry를 helpers로 주입받음 (이미지 수정 재활용)
- appCutEditActions: persistImageToDisk를 helpers로 주입받음 (Studio 이미지 디스크 저장)
- actions 객체에서 `...characterActions`, `...cutEditActions`, `...downloadActions` spread로 연결
- cutEditActions의 handleUpdateCutIntent는 actions에서 `handleUpdateCutIntentAndRegenerate` 키로도 매핑됨

### Phase 10+: textAnalysis.ts 분할 리팩토링 (2026-03-18)

**목표**: textAnalysis.ts 1,407줄 → 500줄 목표 접근
**결과**: 1,407줄 → **695줄** (▼51%), 신규 파일 2개 (471줄 + 268줄)

| 작업 | 파일 | 내용 |
|------|------|------|
| 파이프라인 분리 | textAnalysisPipeline.ts (신규, 471줄) | analyzeScenario, analyzeCharacterBible, generateConti, designCinematography, convertContiToEditableStoryboard |
| 수정/포맷 분리 | textAnalysisRefine.ts (신규, 268줄) | purifyImagePromptForSafety, generateCinematicBlueprint, formatMultipleTextsWithSemanticBreaks, formatTextWithSemanticBreaks, CutFieldChanges, refinePromptWithAI, refineAllPromptsWithAI |
| 본체 경량화 | textAnalysis.ts (695줄) | enrichScript + 유틸 함수 + re-export (기존 import 경로 호환) |

**import 체인**: geminiService.ts → textAnalysis.ts → textAnalysisPipeline.ts / textAnalysisRefine.ts
- geminiService.ts 변경 불필요 (textAnalysis.ts가 re-export 유지)
- textAnalysis.ts 미사용 import 정리 (GoogleGenAI, claudeService 등 제거)

### Phase 10+: App.tsx 분할 리팩토링 (2026-03-18)

**목표**: App.tsx 1,132줄 → 500줄 접근
**결과**: 1,132줄 → **808줄** (▼29%), 신규 컴포넌트 2개

| 작업 | 파일 | 내용 |
|------|------|------|
| 첫 화면 분리 | components/AppInputScreen.tsx (신규, 186줄) | 로그라인 구조화 입력 + 대본 텍스트에어리어 + 드래그앤드롭 + 프로젝트 설정 (제목/화자/비율) |
| 확대 모달 분리 | components/EnlargedCutModal.tsx (신규, 105줄) | 더블클릭 확대 모달 — 이미지/나레이션/프롬프트/버튼/이력 |
| App.tsx 경량화 | App.tsx (808줄) | 로컬 state 7개 + useEffect 3개 + 핸들러 5개 + JSX ~240줄 제거 |

**주의사항**:
- AppInputScreen: `onImportClick` prop으로 `importProjectFileRef.current?.click()` 전달 (ref는 App에 남음)
- AppInputScreen: `localScript` 로컬 state가 컴포넌트 내부로 이동, `handleScriptBlur` 시 `dispatch(SET_USER_INPUT_SCRIPT)` 동기화
- CutPreviewModal: `script` prop이 `localScript` → `userInputScript`로 변경 (context에서 직접 읽음)
- EnlargedCutModal: `useAppContext()` 사용 — App에서 props 전달 불필요
- GENRE_PRESETS, TONE_PRESETS: AppInputScreen.tsx 내부 상수로 이동

### Phase 10+: SlideshowModal.tsx 분할 리팩토링 (2026-03-18)

**목표**: SlideshowModal.tsx 1,032줄 → 500줄 접근
**결과**: 1,032줄 → **597줄** (▼42%), 신규 파일 2개

| 작업 | 파일 | 내용 |
|------|------|------|
| 유틸/캔버스 분리 | slideshowUtils.ts (신규, 161줄) | SlideshowItem/VideoSegment 타입, LOGO_DATA_URL, decode, decodePCMAudioData, loadImage, getSfxOffsetByName, getSupportedMimeType, measureAndWrapText, drawFrame |
| 영상 내보내기 분리 | slideshowExport.ts (신규, 282줄) | handleExportToVideo (전체 영상), handleExportCutsToVideos (컷별 영상), ExportHelpers 인터페이스 |
| 본체 경량화 | SlideshowModal.tsx (597줄) | 재생/프리뷰/SFX/BGM UI + wrapper 호출 |

**주의사항**:
- slideshowUtils.ts의 drawFrame/measureAndWrapText는 순수 함수 (useCallback → 일반 export)
- SlideshowModal에서 drawFrame dependency 배열에서 제거 (모듈 레벨 함수이므로)
- slideshowExport.ts는 ExportHelpers 인터페이스로 컴포넌트 state 주입받음
- SlideshowItem 타입이 slideshowUtils.ts로 이동 → App.tsx의 slideshowData useMemo에서 참조 시 import 경로 확인

### Phase 10+: ImageStudio.tsx 분할 리팩토링 (2026-03-18)

**목표**: ImageStudio.tsx 1,000줄 → 500줄 접근
**결과**: 1,000줄 → **750줄** (▼25%), 신규 파일 1개

| 작업 | 파일 | 내용 |
|------|------|------|
| 캔버스/드래그 유틸 분리 | imageStudioUtils.ts (신규, 104줄) | setDragPreview (드래그 이미지 프리뷰, 3곳 중복 제거), commitTransformCore (줌/팬 → 크롭/AI필 캔버스 로직) |
| 인라인 ImageDropZone 제거 | ImageStudio.tsx | 미사용 인라인 컴포넌트 95줄 제거 |
| 드래그 핸들러 간소화 | ImageStudio.tsx | 3개 핸들러의 반복 드래그 프리뷰 코드 → setDragPreview() 1줄 호출 |
| handleCommitTransform 간소화 | ImageStudio.tsx | 114줄 → 21줄 (commitTransformCore wrapper) |

**주의사항**:
- commitTransformCore: 순수 함수 (DOM/Canvas만 조작, React state 없음)
- setDragPreview: DOM 직접 조작 (dragImage 생성/제거)
- ImageDropZone.tsx도 생성됨 (현재 미사용, 향후 리팩토링용 보관)

### Phase 10+: 중복 코드 제거 — appUtils.ts 공통 유틸 (2026-03-18)

**목표**: 프로젝트 전반에 반복되는 3가지 패턴을 단일 유틸로 통합
**결과**: ~150줄 중복 제거, 수정 시 한 곳만 변경하면 전파

| 유틸 함수 | 제거된 중복 | 적용 파일 |
|-----------|-----------|-----------|
| `getEngineFromModel(model)` | 14곳 동일 삼항 | appCutEditActions, appGenerationActions, appNormalizationActions, AppContext, appReducer, ImageStudio, ThirdCharacterStudioModal |
| `createGeneratedImage({...})` | 11곳+ 동일 객체 조립 | appCutEditActions, appGenerationActions, appNormalizationActions, AppContext, appReducer, ThirdCharacterStudioModal |
| `buildMechanicalOutfit(names, charDescs, location, options?)` | 6곳 동일 의상 조립 로직 | appCutEditActions, appGenerationActions, appCharacterActions, appNormalizationActions(2곳), StoryboardReviewModal |

**buildMechanicalOutfit options**:
- `fallbackUnknown: true` — 정규화에서만 사용 (미등록 캐릭터 → `[name: standard outfit]` 폴백)
- `useKorean: true` — StoryboardReviewModal에서만 사용 (koreanLocations/koreanBaseAppearance)
- 기본값: 영문 locations, 폴백 없음

**주의사항**:
- App.tsx의 `nanoStyle` (UI 테두리 스타일)과 모델 드롭다운 하이라이트는 UI 로직이므로 유틸화 대상 아님
- ImageStudio.tsx의 참조 드래그용 tempImage는 커스텀 id 형식(`ref-${studioId}-${Date.now()}`)이므로 createGeneratedImage 미적용
- appUtils.ts는 React 의존성 제로 (순수 함수만)

### Phase 10+: 중복 코드 통합 — appUtils.ts (2026-03-18)

**목표**: 프로젝트 전체에 반복되는 3가지 패턴을 유틸 함수로 통합
**결과**: ~150줄 중복 제거, 향후 수정 시 1곳만 변경

| 유틸 함수 | 교체 전 | 교체 후 | 내용 |
|-----------|--------|--------|------|
| `getEngineFromModel(model)` | 14곳 삼항 반복 | 1곳 정의 | `nano-3pro/3.1 → nano-v3, 그 외 → nano` |
| `createGeneratedImage({...})` | 11곳+ 객체 조립 | 1곳 팩토리 | `id, imageUrl, engine, tag, model, createdAt` 자동 |
| `buildMechanicalOutfit(names, descs, location, opts?)` | 6곳 15줄 복붙 | 1곳 정의 | 옵션: `fallbackUnknown`, `useKorean`, `wrapHairInParens` |

**적용 파일**: appCutEditActions, appGenerationActions, appNormalizationActions, appCharacterActions, AppContext, appReducer, StoryboardReviewModal, ImageStudio, ThirdCharacterStudioModal (9개 파일)

**주의사항**:
- App.tsx의 `selectedNanoModel === 'nano-3pro'`는 UI 스타일링/드롭다운 비교이므로 교체하지 않음
- buildMechanicalOutfit `useKorean: true` — StoryboardReviewModal에서만 사용 (한국어 의상)
- buildMechanicalOutfit `fallbackUnknown: true` — 정규화 1단계에서만 사용 (미등록 캐릭터 폴백)
- createGeneratedImage의 `id` 파라미터는 optional (미지정 시 crypto.randomUUID() 자동)

### Phase 10+: 화풍 UI 수정 — SceneCard 드롭다운 버그 수정 + 사이드바 전역 화풍 변경 (2026-03-18)

**문제 1 (SceneCard 드롭다운 버그)**:
- 컷카드의 STYLE 드롭다운이 옛 value(normal/vibrant/kyoto/moe/dalle-chibi)를 사용
- 현재 ArtStyle 타입(glow-chibi/pastel-chibi/cinema-mood/sparkle-glam/clean-webtoon/custom)과 불일치
- 결과: 어떤 화풍을 선택해도 buildArtStylePrompt에서 default(클린 웹툰) 폴백

**수정 1**: SceneCard.tsx — 드롭다운 옵션을 현재 ArtStyle 값으로 교체
- Default / 글로우 치비 / 파스텔 치비 / 시네마 감성 / 스파클 글램 / 클린 웹툰 / 커스텀

**문제 2 (전역 화풍 변경 버튼 누락)**:
- handleSwapArtStyle 함수 존재 (appMiscActions.ts) + StyleSelectionModal 연결 코드 존재 (App.tsx L734)
- 하지만 storyboardGenerated 상태에서 isStyleModalOpen을 트리거하는 사이드바 버튼이 없음
- STYLE_NAMES 상수도 정의되어 있지만 미사용 상태

**수정 2**: App.tsx — Settings 섹션 모델 드롭다운 아래에 화풍 변경 버튼 추가
- PaintBrushIcon + 현재 화풍 이름(STYLE_NAMES) 표시
- 클릭 시 isStyleModalOpen: true → StyleSelectionModal 열림
- storyboardGenerated 상태: handleSwapArtStyle 호출 (프롬프트 재계산 + 이미지 초기화)
- rose 컬러 톤 (Settings 섹션 통일)

| 파일 | 변경 |
|------|------|
| components/SceneCard.tsx | STYLE 드롭다운 옵션 교체 (6개 ArtStyle + Default) |
| App.tsx | Settings 섹션에 화풍 변경 버튼 추가 (모델 아래, rose 톤) |

### Phase 10+: 모델 선택 UI 변경 — 드롭다운 → 인라인 3버튼 (2026-03-18)

**변경**: App.tsx Settings 섹션 — 모델 선택을 드롭다운에서 grid-cols-3 인라인 버튼으로 교체
- `[2.5] [3.1] [3Pro]` 3개 버튼이 한 줄에 나란히 배치
- 선택된 모델: bg-rose-900/40 + border-rose-500/50 + text-rose-200 (밝게)
- 비선택 모델: bg-rose-900/10 + border-rose-500/20 + text-rose-400/60 (어둡게)
- 클릭 즉시 전환 (드롭다운 열기/닫기 불필요)
- modelDropdownRef + isModelDropdownOpen 관련 코드 제거 (ref, click-outside 핸들러)

### Phase 10+: 사이드바 버튼 컴팩트화 — 1/2 페어 + 호버 툴팁 (2026-03-18)

**목표**: 사이드바 세로 공간 절약 — 관련 버튼 쌍을 grid-cols-2로 나란히 배치
**스타일**: B타입 (아이콘+한글 동사형 2~3자) + title 속성으로 호버 시 전체 이름 표시
**사이즈**: 1/2 버튼은 px-2 py-2 text-xs + 아이콘 w-3.5 h-3.5 + p-1 (풀사이즈 대비 축소)

| 원래 이름 | 축소 라벨 | title (호버) |
|----------|----------|------------|
| 프로젝트 저장 | 저장 | 프로젝트 저장 |
| 프로젝트 목록 | 열기 | 프로젝트 목록 |
| 파일로 내보내기 | Export | 파일로 내보내기 |
| 파일에서 가져오기 | Import | 파일에서 가져오기 |
| 캐릭터/의상 수정 | 의상 | 캐릭터/의상 수정 |
| 스토리보드 재검수 | 검수 | 스토리보드 재검수 |
| 선택 컷 자동 생성 | 선택 | 선택 컷 자동 생성 |
| 전체 컷 자동 생성 | 전체 | 전체 컷 자동 생성 |
| 생성 중단 | 중단 | 생성 중단 |

**모델 버튼 라벨**: 2.5/3.1/3Pro → N-2.5/N-3.1/N-3Pro (Nano 약어 접두사)

**유지된 풀사이즈 버튼**: 전체 흐름 확인, 실패 컷 재시도, Audio 섹션, Export & Render 섹션, 화풍 변경
**저장 버튼**: 미저장 시 우상단 amber pulse dot 유지 (absolute top-1 right-1)

| 파일 | 변경 |
|------|------|
| App.tsx | 사이드바 8개 버튼 1/2 페어 + 모델 라벨 N- 접두사 |

### Phase 10+: Studio 편집 시 캐릭터 DNA/의상 미반영 버그 수정 (2026-03-18)

**증상**: 컷카드에서 "텍스트로 수정" 후 생성 시 인물의 헤어스타일/의상이 원본 이미지와 동일하게 생성됨
**근본 원인 (2곳)**:

1. **editImageWithNano** (imageGeneration.ts): `originalPrompt` 파라미터가 시그니처에만 존재하고 Gemini 프롬프트 조합에서 완전 누락
   - Gemini가 받는 프롬프트: `Modify image. Instruction: 유저 입력. Style: 화풍. [STRICT CONSTRAINT]...`
   - 캐릭터 DNA, 의상, 씬 묘사, 포즈 등 컨텍스트 전무 → 원본 이미지 그대로 보존

2. **appCutEditActions.ts**: handleEditInStudio/handleCreateInStudio에서 `img.prompt` (이미지 생성 당시 저장된 프롬프트) 전달
   - 스토리보드에서 의상/DNA 변경해도 이미 생성된 이미지의 `.prompt`는 갱신 안 됨 → 옛 정보 전달

**수정**:
1. `editImageWithNano`: originalPrompt가 존재하면 `[SCENE & CHARACTER CONTEXT]` 블록으로 Gemini 프롬프트에 추가
   - 캐릭터 identity DNA, 의상, 씬 묘사, 카메라 정보 등이 컨텍스트로 전달됨
   - originalPrompt가 빈 문자열이면 생략 (기존 호출 호환 — generateImageForCut, 캐릭터 스튜디오)

2. `appCutEditActions.ts`: `img.prompt`/`base.prompt` → `calculateFinalPrompt(cut)` 로 교체
   - 컷이 존재하면 항상 최신 buildFinalPrompt 출력 사용 (의상/DNA 변경 즉시 반영)
   - 컷이 없으면 기존 `img.prompt` 폴백 (커스텀 이미지 등)

| 파일 | 변경 |
|------|------|
| services/ai/imageGeneration.ts | editImageWithNano에 sceneContext 블록 추가 |
| appCutEditActions.ts | handleEditInStudio/handleCreateInStudio → calculateFinalPrompt(cut) 사용 |

### Phase 10+: 에셋 카탈로그 화풍 태그 시스템 리뉴얼 (2026-03-18)

**문제**:
1. STYLE_NAMES가 옛 화풍 (dalle-chibi/ghibli-anime/webtoon-line) → 현재 ArtStyle과 불일치 → "DALL-E 치비" 등 잘못된 표시
2. 외부 이미지 가져올 때 화풍 선택 불가 → 무조건 전역 artStyle로 저장
3. 기존 에셋 태그 편집 시 화풍 수정 불가
4. 태그 편집 팝업에서 이미지 미리보기 없음 → 이름만 보고 태그 선택

**수정**:

#### STYLE_NAMES 업데이트 (2곳)
- AssetCatalogModal.tsx + AssetCatalogPage.tsx
- glow-chibi/pastel-chibi/cinema-mood/sparkle-glam/clean-webtoon/custom

#### AssetTagPopup 리뉴얼 (공유 컴포넌트 — 양쪽 자동 적용)
- 새 props: `imagePreviewUrl?`, `defaultArtStyle?`
- onSave 시그니처 확장: `(type, name, extraTypes?, artStyle?) => void`
- UI 구성 (위→아래):
  1. 이미지 미리보기 (h-40, object-cover, rounded — imagePreviewUrl 있을 때만)
  2. 에셋 이름 입력
  3. 유형 버튼 (인물/의상/배경 — 기존 3열 유지)
  4. 화풍 버튼 (grid-cols-3, 6개 — rose 톤, 토글 선택/해제)
  5. 취소/저장 버튼
- 화풍 미선택 시 artStyle = undefined → 호출부에서 currentArtStyle 폴백

#### 호출부 업데이트 (4곳 × 2파일 = 8곳)
- 외부 import: `imagePreviewUrl={currentPending.dataUrl}` 전달
- 기존 편집: `imagePreviewUrl={imageUrls[editingAsset.id]}` + `defaultArtStyle={editingAsset.tags.artStyle}`
- handleImportSave: artStyle 파라미터 추가, `finalArtStyle = artStyle || currentArtStyle`
- 편집 onSave: `artStyle: artStyle || editingAsset.tags.artStyle`

#### 앱 에셋 저장 — artStyleOverride 반영
- appProjectActions.ts handleSaveBackgroundAsset: `cut.artStyleOverride || stateRef.current.artStyle`

| 파일 | 변경 |
|------|------|
| components/AssetCatalogModal.tsx | STYLE_NAMES + AssetTagPopup 리뉴얼 + 호출부 4곳 + handleImportSave |
| components/AssetCatalogPage.tsx | STYLE_NAMES + 호출부 4곳 + handleImportSave |
| appProjectActions.ts | 배경 에셋 artStyleOverride 반영 |

### Phase 10+: Studio 생성 버튼 비활성 버그 수정 + 동작 변경 (2026-03-18)

**버그**: LOAD_IMAGE_INTO_STUDIO에서 originalImage 미설정 → 생성 버튼 항상 비활성
**동작 변경**: 생성 버튼이 originalImage → currentImage 기반으로 변경

**수정 전 동작**:
- [수정] → currentImage 부분 편집 (보존 모드)
- [생성] → originalImage 기반 새로 그리기 (비활성 버그)

**수정 후 동작**:
- [수정] → currentImage 부분 편집 (isCreativeGeneration=false, 원본 보존 지시)
- [생성] → currentImage 기반 새로 그리기 (isCreativeGeneration=true, 자유 재해석 지시)
- [Ori]  → originalImage로 복귀 (별도 버튼, 변경 없음)

**수정 흐름 예시**:
```
Studio 전송 → originalImage=A, currentImage=A
수정 1회 → currentImage=B (originalImage=A 유지)
수정 2회 → currentImage=C
되돌리기 → currentImage=B
[생성] 클릭 → B를 기반으로 자유 재해석
[Ori] 클릭 → currentImage=A로 복귀
```

| 파일 | 변경 |
|------|------|
| appReducer.ts | LOAD_IMAGE_INTO_STUDIO에 originalImage 설정 추가 |
| components/ImageStudio.tsx | handleCreate: originalImage→currentImage, disabled 조건, 키보드 단축키 동일 변경 |

### Phase 10+: 첫 화면 UI 리디자인 — 단일 오렌지 액센트 (2026-03-18)

**목표**: aienhancer.ai 참조 — 색상 통일성 + 명도 3단계 + 단일 액센트 컬러 시스템 도입
**범위**: AppInputScreen.tsx만 (첫 페이지 테스트 — 마음에 들면 이후 다른 화면에 순차 적용)

**새 색상 체계**:
| 레벨 | 용도 | 값 |
|------|------|-----|
| L0 (최심부) | 메인 배경 (App.tsx) | bg-zinc-950 (기존 유지) |
| L1 (카드) | 카드/패널 표면 | bg-[#141416] |
| L2 (입력) | 인풋/셀렉트 배경 | bg-[#0c0c0e] |
| Border | 카드/입력 테두리 | border-[#232326] / border-[#2a2a2e] |
| Accent | CTA/선택/호버 | orange-500/600 계열 |

**변경 전후 비교**:
- indigo-600 CTA → orange-600 CTA (스튜디오 시작 버튼)
- indigo focus ring → orange focus ring
- 톤 칩 선택: indigo-600/80 → orange-500/15 + orange-500/40 border
- 화자 선택: indigo-600/pink-600 분리 → orange-600 통일
- 카드 배경: bg-zinc-900/60 + backdrop-blur → bg-[#141416] solid
- 인풋 배경: bg-zinc-950/60 → bg-[#0c0c0e]
- 라벨: font-bold text-zinc-600 → font-extrabold text-zinc-500 + tracking-[0.18em]
- 히어로: "도레미썰 스튜디오" 5xl → "새 프로젝트" 4xl + Story Studio 뱃지
- rounded-xl → rounded-2xl (카드)
- 전체 패딩/간격 증가 (py-10→py-12, gap-5→gap-6)

**주의사항**:
- App.tsx 변경 없음 (메인 배경 bg-zinc-950, 사이드바 bg-zinc-900 그대로)
- 기존 코드 로직 100% 동일 (드래그앤드롭, 로그라인 결합, 스크립트 동기화 등)
- 사이드바 색상(blue/emerald/amber/purple/rose 무지개)은 이후 작업 예정
- 다른 모달/화면에는 아직 미적용 (첫 페이지 테스트 후 순차 적용)

### Phase 10+: UI 색상 통일 v2 — 사이드바 + 첫 화면 레이아웃 (2026-03-18)

**목표**: aienhancer.ai 참조 — 사이드바 무지개색 제거, 단일 오렌지 액센트, 첫 화면 레이아웃 균형

**첫 화면 레이아웃 변경 (AppInputScreen.tsx)**:
- 8:4 그리드 → 단일 컬럼 (max-w-4xl 중앙 정렬)
- Project Settings: 오른쪽 분리 카드 → 상단 인라인 바 (Title + Speaker M/F + Ratio)
- Story Setup: 2×2 → 1:3 그리드 (Genre 1칸 + Tone 3칸 + Conflict/Twist)
- Script: 전체 폭 사용, 더 여유로운 느낌
- "프로젝트 불러오기": 오른쪽 카드 → 히어로 우측 상단 "Load Project" 버튼
- 텍스트 크기/밝기: text-[10px] zinc-600 → text-[11px] zinc-400, 본문 text-sm zinc-200
- 라벨: 전부 영어 (Genre, Tone, Conflict, Twist, Title, Speaker, Ratio, Cut Preview, Start Studio)

**사이드바 색상 통일 (App.tsx)**:
| Before | After |
|--------|-------|
| DSS indigo-500 | orange-500 |
| Project: blue 뱃지+버튼 | zinc-500 텍스트 + zinc-800 버튼 |
| Export/Import: purple | zinc-800 |
| Tools: emerald | zinc-800 |
| Audio: amber | zinc-800 |
| Export&Render: purple | zinc-800 |
| Settings: rose | zinc-800 + orange 선택 |
| 토큰 카운트: purple/blue | orange-400/70 |
| 사이드바 배경: bg-zinc-900 | bg-[#111113] |
| 사이드바 border: border-zinc-800 | border-[#1e1e21] |
| 하단 영역: bg-zinc-950/50 | bg-[#0c0c0e] |

**버튼 호버 패턴 (통일)**:
- 기본: `bg-zinc-800/40 border-zinc-700/40 text-zinc-400`
- 호버: `bg-zinc-800 border-zinc-600 text-zinc-200` + 아이콘 `text-zinc-200` (네비게이션 = 회색만)
- 선택(모델): `bg-orange-600/30 border-orange-500/50 text-orange-200` (옵션 = 오렌지)

**영어 라벨 (사이드바)**:
- 저장→Save, 열기→Open, 의상→Costume, 검수→Review
- 전체 흐름 확인→Overview, 선택→Select, 전체→All, 중단→Stop
- 오디오 스플리터→Audio Split, 음성 일괄 추가→Batch TTS
- 다운로드→Download, 영상 렌더링→Render
- API 키 설정→API Keys, 에셋 카탈로그→Assets
- 새 프로젝트→New

**미적용 영역 (향후 작업)**:
- 로딩 모달 (indigo 프로그레스 바)
- 스토리보드 메인 영역 (전체 러프/일반/확정 버튼)
- 이력 탭 배지 색상 (indigo/emerald)
- 일괄 수정 바 (amber 적용 버튼)
- 편집/이력 탭 선택 (indigo-600)
- 다운로드 드롭다운 내부 색상 (emerald/indigo/zinc)
- 모달 전체 (StyleSelection, CharacterStudio, StoryboardReview 등)

**주의사항**:
- 사이드바 unsaved dot: amber → orange 변경
- isZipping 상태: emerald 유지 (진행 중 = 녹색 관례)
- isAutoGenerating 중단: red 유지 (위험 액션 = 빨강 관례)
- 다운로드 드롭다운 내부 텍스트 색상: 기존 유지 (차후 작업)

### Phase 10+: UI 색상 통일 v3 — 테두리 가시성 + 사이드바 구분선 + Conflict/Twist 확장 (2026-03-18)

**변경 1**: App.tsx 사이드바 구분선 — `border-[#1e1e21]` → `border-orange-600/40` (은은한 오렌지 선)
**변경 2**: AppInputScreen 색상 반전 (aienhancer 참조)
| 요소 | Before | After | 효과 |
|------|--------|-------|------|
| 카드 배경 | #141416 | #0a0a0c | 거의 검정 → 테두리 대비 ↑ |
| 카드 테두리 | #232326 | #2a2a2e | 밝게 → 가시성 ↑ |
| 인풋 배경 | #0c0c0e | #1a1a1e | 카드보다 밝은 회색 |
| 인풋 테두리 | #2a2a2e | #333338 | 더 밝게 → 영역 구분 |
| 버튼 hover | #1c1c1f | #111114 | |

**변경 3**: Conflict/Twist — `<input>` → `<textarea rows={2}>` + `col-span-2` (전체 폭)
- placeholder 확장: "핵심 갈등 요소 — 캐릭터가 부딪히는 문제를 자유롭게 적어주세요"
- resize-none 적용 (고정 높이)

**명도 계층 (최종)**:
```
메인 배경 (zinc-950) ≈ #09090b  ← 가장 어두움
카드 배경              #0a0a0c  ← 거의 같지만 테두리로 구분
인풋/셀렉트            #1a1a1e  ← 눈에 띄게 밝음 (입력 영역)
인풋 테두리            #333338  ← 입력 영역 경계선
사이드바 배경          #111113  ← 메인보다 살짝 밝음
사이드바 구분선        orange-600/40 ← 오렌지 악센트
```

---

## 🎨 DSS 디자인 시스템 (Phase 10+ 확정)

> aienhancer.ai 참조. 단일 오렌지 액센트 + 3단 다크 명도 + 절제된 타이포그래피.
> 첫 화면 + 사이드바에 적용 완료. 이후 모달/카드에 순차 확장.

### 색상 팔레트

#### 명도 계층 (어두운 순)
| 토큰 | Hex | 용도 |
|------|-----|------|
| `surface-base` | `zinc-950` (#09090b) | 메인 배경 |
| `surface-card` | `#0a0a0c` | 카드/패널 배경 |
| `surface-sidebar` | `#111113` | 사이드바 배경 |
| `surface-input` | `#1a1a1e` | 인풋/셀렉트/토글 배경 |
| `surface-input-hover` | `orange-950/20` | 인풋 호버 시 틴트 |

#### 테두리
| 토큰 | Hex | 용도 |
|------|-----|------|
| `border-subtle` | `#1e1e21` | 사이드바 내부 구분 |
| `border-card` | `#2a2a2e` | 카드 테두리 |
| `border-input` | `#333338` | 인풋 테두리 (기본) |
| `border-hover` | `orange-500/50` | 인풋/칩 호버 시 |
| `border-focus` | `orange-500/50` + ring | 포커스 시 |
| `border-sidebar` | `orange-600/40` | 사이드바-메인 구분선 |

#### 액센트 (오렌지 단일)
| 용도 | 클래스 |
|------|--------|
| CTA 버튼 | `bg-orange-600 hover:bg-orange-500` |
| CTA shadow | `shadow-orange-600/15` |
| 선택 상태 (모델) | `bg-orange-600/30 border-orange-500/50 text-orange-200` |
| 선택 칩 (톤) | `bg-orange-500/15 text-orange-300 border-orange-500/40` |
| AI 추천 뱃지 | `bg-orange-500/[0.06] text-orange-300/60` |
| 로고 뱃지 | `bg-orange-500 text-black` |
| 토큰 카운트 | `text-orange-400/70` |

#### 의미 색상 (예외 — 오렌지 외)
| 색상 | 용도 | 변경 금지 사유 |
|------|------|---------------|
| `red` | 생성 중단, 에러 | 위험 액션 관례 |
| `emerald` | ZIP 진행 중 | 진행 상태 관례 |
| `orange (unsaved dot)` | 미저장 표시 | 액센트 통일 |

### 타이포그래피

| 요소 | 클래스 |
|------|--------|
| 섹션 헤더 (사이드바) | `text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.18em]` |
| 라벨 (인풋 위) | `text-[11px] font-semibold text-zinc-400 tracking-wide` |
| 본문/인풋 텍스트 | `text-sm text-zinc-200` |
| placeholder | `text-zinc-600` |
| 버튼 텍스트 (사이드바) | `text-xs font-medium text-zinc-400` |
| CTA 버튼 | `text-sm font-bold text-white` |
| 보조 텍스트 | `text-[10px] text-zinc-700` |

### 인터랙션 상태

#### ★ 호버 2원칙 (aienhancer 참조)

| 구분 | 호버 스타일 | 적용 대상 | 의미 |
|------|-----------|----------|------|
| **네비게이션** | 회색 밝아짐 (zinc) | 사이드바 버튼, 씬 헤더, 탭 전환 | "여기로 이동" — 가벼운 신호 |
| **옵션 선택** | 오렌지 테두리+틴트 | 인풋, 톤칩, 모델선택, 셀렉트 | "이 값을 고름" — 강한 신호 |

> 네비게이션(어디로 가냐) = 회색만, 세팅(뭘 고르냐) = 오렌지.
> 사이드바에 오렌지 호버를 쓰면 네비게이션과 옵션 선택이 섞여서 혼란.

#### 네비게이션 호버 (사이드바 버튼)
```
기본:   bg-zinc-800/40 border-zinc-700/40 text-zinc-400
        아이콘: text-zinc-400
호버:   bg-zinc-800 border-zinc-600 text-zinc-200
        아이콘: text-zinc-200 (group-hover) ← 회색만, 오렌지 없음
```

#### 옵션 선택 호버 (인풋/셀렉트/textarea)
```
기본:   bg-[#1a1a1e] border-[#333338] text-zinc-200
호버:   border-orange-500/50 bg-orange-950/20
포커스: border-orange-500/50 ring-1 ring-orange-500/50 bg-orange-950/20
```

#### 옵션 선택 호버 (톤 칩 토글)
```
비선택: bg-[#1a1a1e] text-zinc-500 border-[#2a2a2e]
호버:   text-zinc-300 border-orange-500/40 bg-orange-950/15
선택:   bg-orange-500/15 text-orange-300 border-orange-500/40 ← 선택 = 더 밝은 오렌지
```

#### 옵션 선택 (모델 버튼)
```
비선택: bg-zinc-800/40 border-zinc-700/40 text-zinc-500
선택:   bg-orange-600/30 border-orange-500/50 text-orange-200
```

### 컴포넌트 규칙

| 규칙 | 값 |
|------|-----|
| 카드 모서리 | `rounded-2xl` |
| 인풋 모서리 | `rounded-xl` |
| 버튼 모서리 (사이드바) | `rounded-xl` |
| 아이콘 래퍼 | `p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60` |
| 간격 (카드 간) | `mb-4` or `gap-5` |
| transition | `transition-all duration-200` |

### 언어 규칙

| 영역 | 언어 |
|------|------|
| 사이드바 버튼 라벨 | 영어 (Save, Open, Export, Import, Costume, Review, Overview...) |
| 섹션 헤더 | 영어 대문자 (PROJECT, TOOLS, AUDIO, SETTINGS...) |
| 인풋 라벨 | 영어 (Title, Speaker, Genre, Tone, Conflict, Twist...) |
| placeholder / 안내문 | 한국어 (대본을 붙여넣으세요, 핵심 갈등 요소...) |
| CTA 버튼 | 영어 (Start Studio, Cut Preview, Load Project...) |
| 모달 제목 | 기존 유지 (혼용 — 향후 통일 예정) |

### 로고
```
┌──────┐
│  D   │  DoReMiSsul.Studio
└──────┘
  ↑ bg-orange-500, text-black, w-8 h-8 rounded-xl
              ↑ text-zinc-300 + .Studio = text-orange-400
```

### 미적용 영역 (향후 작업 큐)
1. 로딩 모달 (indigo 프로그레스 → orange)
2. 스토리보드 메인 영역 (전체 러프/일반/확정 버튼)
3. 이력 탭 배지 + 편집/이력 탭 선택
4. 일괄 수정 바
5. 다운로드 드롭다운 내부
6. 모달 전체 (StyleSelection, CharacterStudio, StoryboardReview 등)
7. SceneCard 내부 색상

### Phase 10+: 호버 2원칙 적용 — 사이드바 아이콘 orange 제거 (2026-03-18)

**문제**: 사이드바 버튼(네비게이션)의 아이콘이 호버 시 오렌지로 빛남 → 옵션 선택과 혼동
**규칙**: aienhancer 참조 — 네비게이션=회색만, 옵션 선택=오렌지
**수정**: `group-hover:text-orange-400` → `group-hover:text-zinc-200` (14개 아이콘 + 1개 씬 헤더)

| 파일 | 변경 |
|------|------|
| App.tsx | 사이드바 아이콘 15곳 group-hover 색상 교체 |
| PROJECT_CONTEXT.md | 디자인 시스템 "호버 2원칙" 섹션 추가 |

### Phase 10+: 마지막 페이지 디자인 통일 (2026-03-18)

**범위**: App.tsx 스토리보드 영역 + SceneCard CUT 제목/테두리
**원칙**: indigo/purple/amber/blue 전부 제거, orange 또는 zinc로 교체

| # | 영역 | Before | After |
|---|------|--------|-------|
| 1 | 상단 전체 러프/일반/확정 | zinc-700/indigo-700/emerald-700 | orange-700/orange-600/orange-800 (실행 3형제) |
| 2 | 편집/이력 탭 선택 | bg-indigo-600 | bg-orange-600 |
| 3 | 일괄 수정 바 포커스+적용 | focus:indigo-500 + bg-amber-600 | focus:orange-500 + bg-orange-600 |
| 4 | AI 감독 연출 대본 접기 | text-purple-400 | text-orange-400 |
| 5 | 로딩 모달 전체 | indigo 스피너/라벨/프로그레스바 | orange 통일 |
| 6 | SceneCard CUT 제목+테두리 | text-indigo-400 + hover:border-indigo | text-orange-400 + hover:border-orange |
| 7 | 이력 탭 호버 버튼 | bg-purple-600 / bg-blue-600 | bg-zinc-700 (네비게이션=회색) |
| 8 | 다운로드 드롭다운 | emerald/indigo/zinc 혼용 | text-zinc-200 통일 + hover:bg-zinc-700/70 |
| + | 프로그레스 바 그래디언트 | indigo→purple gradient | bg-orange-500 단색 |
| + | 선택 컷 ring | ring-indigo-500 | ring-orange-500 |
| + | 이력 배지 (일반) | bg-indigo-600 | bg-orange-600 |

**App.tsx 최종 색상 잔존 확인**:
- indigo: 0개 ✅
- purple: 0개 (주석 제외) ✅
- amber: 1개 (nanoStyle border — 의도적 유지)
- emerald: isZipping 상태 + 확정 dot (의미색 유지)
- red: 생성 중단 (의미색 유지)

**SceneCard 미변경 (추후 작업)**:
- 러프/일반/확정 컷 버튼 (indigo-800, emerald-600)
- CAST 배지 색상, STYLE 드롭다운
- 이미지 호버 다운로드/Studio 버튼 (purple/blue)
- 드롭존, PROMPT DETAILS, +Add Guest 등

### Phase 10+: 버튼 스타일 aienhancer 참조 리파인 (2026-03-18)

**상단 3버튼 (전체 러프/일반/확정)**: 솔리드 오렌지 → 아웃라인 스타일
- `bg-transparent border-orange-500/50 text-orange-400`
- hover: `bg-orange-500/10 border-orange-400`

**모델 선택 (N-2.5/3.1/3Pro)**: 솔리드 → 아웃라인 스타일
- 선택: `bg-transparent border-orange-500/60 text-orange-400`
- 비선택: `bg-transparent border-zinc-700/50 text-zinc-500` hover→zinc-600/zinc-300

**편집/이력 탭**: 분리 버튼 → 테두리 래퍼 안 세그먼트 컨트롤
- 래퍼: `rounded-xl border border-zinc-700/50 overflow-hidden`
- 선택: `bg-orange-500 text-black` (검정 볼드)
- 비선택: `bg-transparent text-zinc-200` (흰색 볼드)
- 라벨: 편집→Edit(+PencilIcon), 이력→History(+PhotoIcon)

**디자인 시스템 추가 — 버튼 스타일 유형**:
| 유형 | 스타일 | 사용처 |
|------|--------|--------|
| Solid CTA | bg-orange-600 text-white | Start Studio, Resume |
| Outline Action | bg-transparent border-orange-500/50 text-orange-400 | 전체 러프/일반/확정 |
| Segment Selected | bg-orange-500 text-black | Edit/History 탭 |
| Segment Default | bg-transparent text-zinc-200 | Edit/History 비선택 |
| Option Selected | bg-transparent border-orange-500/60 text-orange-400 | 모델 선택 |
| Option Default | bg-transparent border-zinc-700/50 text-zinc-500 | 모델 비선택 |
| Nav Button | bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800 | 사이드바 |

### Phase 10+: 모달 전체 색상 통일 (2026-03-18)

**범위**: 모든 모달/컴포넌트 23개 파일 — UI/기능 미변경, 색상만 교체
**원칙**: indigo→orange, purple→zinc/orange, amber→orange, blue(버튼)→zinc

**교체 규칙 (일괄 적용)**:
| From | To | 이유 |
|------|----|------|
| `bg-indigo-*` | `bg-orange-*` | 액센트 통일 |
| `text-indigo-*` | `text-orange-*` | 액센트 통일 |
| `border-indigo-*` | `border-orange-*` | 액센트 통일 |
| `ring-indigo-*` | `ring-orange-*` | 포커스 링 |
| `focus:*-indigo-*` | `focus:*-orange-*` | 포커스 상태 |
| `shadow-indigo-*` | `shadow-orange-*` | 그림자 |
| `accent-indigo-*` | `accent-orange-*` | range input |
| `bg-purple-*` | `bg-zinc-*` | 네비게이션=회색 |
| `text-purple-*` | `text-orange-*` | 텍스트 액센트 |
| `bg-amber-*` | `bg-orange-*` | 액센트 통일 |
| `text-amber-*` | `text-orange-*` | 액센트 통일 |
| `bg-blue-*` (버튼) | `bg-zinc-*` | 네비게이션=회색 |
| `text-blue-*` | `text-zinc-*` | 네비게이션=회색 |
| `border-blue-*` | `border-zinc-*` | 네비게이션=회색 |

**잔존 예외 (의도적 유지)**:
- `emerald`: 확정/성공 의미색 (SceneCard, StoryboardReview 등)
- `red`: 에러/위험 의미색 (삭제, 중단 등)
- `green`: 에셋 태그 배지 (배경 유형)
- `amber-500` in App.tsx nanoStyle: 디버그 보더 (기능용)
- `purple/blue` in appStyleEngine.ts: AI 프롬프트 문자열 (UI 아님)
- SceneCard.tsx 내부: 추후 보면서 개별 결정

**변경 파일 (23개)**:
ApiKeySettings, AssetCatalogModal, AssetCatalogPage, AssetLibraryModal,
AudioSplitterModal, BatchAudioModal, CharacterClosetModal, CharacterStudio,
CutAssignmentModal, CutPreviewModal, CutSelectionModal, CutSplitterModal,
EnlargedCutModal, ImageEditorModal, ImageStudio, ImageViewerModal,
ProjectListModal, SceneAnalysisReviewModal, SlideshowModal,
StoryboardReviewModal, StyleSelectionModal, TextEditorModal, ThirdCharacterStudioModal

**디자인 시스템 미적용 큐 업데이트**:
~~1. 로딩 모달~~ ✅ 완료 (v6)
~~2. 스토리보드 메인 영역~~ ✅ 완료 (v6)
~~3. 이력 탭 배지 + 편집/이력 탭~~ ✅ 완료 (v7)
~~4. 일괄 수정 바~~ ✅ 완료 (v6)
~~5. 다운로드 드롭다운~~ ✅ 완료 (v6)
~~6. 모달 전체~~ ✅ 완료 (v8)
7. SceneCard 내부 색상 (추후)

### Phase 10+: UI 마무리 — v9~v10 누락 기록 보충 (2026-03-18)

**v7b: 메인↔스튜디오 구분선 + Edit/History 탭 확대**
- 오른쪽 2탭 패널: `border-l-orange-600/40` 추가 (사이드바 구분선과 동일 패턴)
- Edit/History 탭: `text-xs` → `text-sm`, 아이콘 `w-3.5` → `w-4` (Studio 타이틀과 동급 크기)

**v9: SceneCard 러프/일반/확정 버튼 3단계 + 수정 버튼 + 상단 버튼 크기**
| 버튼 | 스타일 | 의도 |
|------|--------|------|
| 러프 | `bg-transparent border-orange-500/50 text-orange-400` (밝은 아웃라인) | 가볍게 시도 |
| 일반 | `bg-orange-950/60 border-orange-800/40 text-orange-500/80` (어두운 배경) | 본격 작업 |
| 확정 | `bg-orange-800/50 border-orange-600/40 text-orange-300` (중간 배경) | 마무리 |
| 확정됨 | `bg-orange-500 text-black` (솔리드) | 완료 상태 |
| 수정 | `bg-transparent border-orange-500/50 text-orange-400` (아웃라인) | 러프와 동급 |
- 상단 전체 러프/일반/확정: `px-2.5 py-1 text-[10px]` → `px-3.5 py-1.5 text-xs` (20% 확대)

**v10: +New Project + Studio 생성 버튼 + 타이틀바**
- +New Project: 로고 옆 → 로고 아래 별도 줄 (전체 폭, `border-b` 구분)
- Studio 생성 버튼: `bg-green-600 text-white` → `bg-transparent border-orange-500/50 text-orange-400` (아웃라인)
- 앱 타이틀바: tauri.conf.json + index.html `"도레미썰 스튜디오"` → `"DoReMiSsul.Studio"`
  - macOS 타이틀바 텍스트 색상은 OS 제어 (앱에서 변경 불가)

| 파일 | 변경 |
|------|------|
| App.tsx | +New Project 위치, 상단 3버튼 크기, border-l-orange, Edit/History text-sm |
| components/SceneCard.tsx | 러프/일반/확정 3단계 + 수정 아웃라인 |
| components/ImageStudio.tsx | 생성 버튼 아웃라인 |
| src-tauri/tauri.conf.json | title → DoReMiSsul.Studio |
| index.html | title → DoReMiSsul.Studio |

### Phase 10+: 4색 체계 확정 + v11 작업 기록 (2026-03-19)

**DSS 4색 체계 (디자인 시스템 추가)**:
| 색상 | 역할 | Tailwind | 사용처 |
|------|------|----------|--------|
| 🟠 오렌지 | 행동/액션/CTA | orange-400~600 | 버튼, 호버, 포커스, 아이콘 |
| 🟦 시안/틸 | 상태/완료/성공 | teal-400~500 | 선택됨 표시, 확정 dot, 진행 완료 |
| 🔴 레드 | 위험/에러/중단 | red-400~600 | 삭제, 생성 중단, 에러 알림 |
| ⬜ 회색 | 기본/네비게이션 | zinc-400~700 | 비선택, 기본 텍스트, 네비 버튼 |

> 오렌지 = "이걸 해라" / 틸 = "이건 됐다" / 레드 = "위험" / 회색 = "평상시"
> emerald/green은 틸(teal)로 점진 교체 예정 (기존 호환 유지하며)

**v11 변경사항**:
| # | 변경 | 파일 |
|---|------|------|
| 1 | 사이드바 아이콘 14개: zinc-400 → orange-500/70 (기본 오렌지) | App.tsx |
| 2 | All 버튼: 회색 → 오렌지 아웃라인 (실행=오렌지, Select=회색 네비 유지) | App.tsx |
| 3 | 컷 선택 모달 확인: green → orange | CutSelectionModal |
| 4 | 캐릭터 설정: emerald/teal → orange | CharacterStudio |
| 5 | 화풍 모달 선택 glow: indigo shadow → orange shadow | StyleSelectionModal |
| 6 | 영상 렌더링 3버튼: zinc/teal/green → 러프/일반/확정 스타일 | SlideshowModal |
| 7 | 화풍 모달 선택 라디오: orange → teal (상태=틸 원칙) | StyleSelectionModal |

### Phase 11: 에셋 저장경로 설정 기능 (2026-03-19)

**배경**: 배포 대응 — 사용자마다 저장 위치가 다르므로 하드코딩된 경로 제거

**변경 파일 3개**:
| 파일 | 변경 |
|------|------|
| `src-tauri/src/main.rs` | `app_data_root()` config.json 기반으로 변경 + `get_storage_path`, `set_storage_path` 커맨드 추가 |
| `services/tauriAdapter.ts` | `getStoragePath`, `setStoragePath`, `pickStorageFolder` 3개 함수 추가 |
| `components/ApiKeySettings.tsx` | 하단 📁 저장 경로 섹션 추가 (폴더 선택 다이얼로그 + 직접 입력 + 적용 버튼) |

**동작 방식**:
```
앱 시작
  → app_data_root() 호출
  → ~/Library/Application Support/com.doremissul.studio/config.json 읽기
  → storage_path 값 있으면 그 경로 사용
  → 없으면 기본값(Application Support) 폴백
```

**config.json 구조**:
```json
{ "storage_path": "/Users/honamgung/Documents/DoReMiSsul Studio" }
```
- config.json은 항상 Application Support에 고정 (앱 설정 보관용)
- 실제 데이터(projects/assets/thumbnails)는 storage_path 경로에 저장

**권장 저장 경로**:
```
~/Documents/DoReMiSsul Studio/
├── projects/
├── assets/
│   ├── characters/
│   ├── outfits/
│   └── backgrounds/
├── thumbnails/
├── asset_catalog.json
└── project_list.json
```
- 문서 폴더(iCloud 동기화) → 맥스튜디오 ↔ 맥북 자동 공유
- iCloud 최적화 저장공간 **끄기** 필수 (항상 로컬 보관)
- 앱 재설치해도 경로만 재설정하면 데이터 그대로 유지

**데이터 이동 명령어**:
```bash
mkdir -p ~/Documents/DoReMiSsul\ Studio
cp -r ~/Library/Application\ Support/com.doremissul.studio/. ~/Documents/DoReMiSsul\ Studio/
```

### Phase 12: 구조화 연출 대본 + enriched_pause (2026-03-19)

**목표**: enrichScript 출력을 JSON 구조화 → 사용자가 외부 AI(Claude 새세션 등)에서 안전하게 편집 가능
**핵심**: 파이프라인 Step 3 후 일시정지 → 편집 → Step 4~6 재개

**EnrichedBeat 타입** (types.ts):
```typescript
interface EnrichedBeat {
    id: number;           // 1부터 순번
    type: 'narration' | 'insert' | 'reaction';
    text: string;         // 원본 대사 or 시각 묘사
    beat: string;         // 구조 태그 (훅/설정, Show→Tell, Whiplash, PunchOut 등)
    emotion: string;      // 감정 비트 (Sparkling, Gloom, Tension 등)
    direction: string;    // 연출 노트 (앵글, FX, 소품 등)
}
```

**enrichScript 출력 JSON 예시**:
```json
[
  { "id": 1, "type": "narration", "beat": "훅/설정", "text": "남친이랑 데이트를 하면", "emotion": "일상", "direction": "미디엄 트래킹샷, 번화가 네온" },
  { "id": 2, "type": "insert", "beat": "Show→Tell", "text": "지나가는 남자1 시선 — 여주를 훑어보는 눈", "emotion": "Tension", "direction": "클로즈업, 시선 추적" },
  { "id": 3, "type": "narration", "beat": "Show→Tell", "text": "남자들이 죄다 쟤를 노려봐", "emotion": "Tension→자기과시", "direction": "카메라 여주 POV→주변 남자들" },
  { "id": 4, "type": "narration", "beat": "Sparkling", "text": "내가 좀 이쁜 편이거든", "emotion": "자신만만", "direction": "로우앵글, 머리 넘기기, Sparkling Aura" },
  { "id": 5, "type": "insert", "beat": "Whiplash→Gloom", "text": "남친 배 클로즈업", "emotion": "감정급반전", "direction": "클로즈업, Vertical Gloom Lines" },
  { "id": 6, "type": "reaction", "beat": "Whiplash", "text": "여주 당황 표정 — 눈 피하며 입술 깨무는", "emotion": "Gloom", "direction": "버스트샷, 시선 아래" },
  { "id": 7, "type": "narration", "beat": "PunchOut", "text": "근데 그게 좋아", "emotion": "반전감동", "direction": "남주 진지한 표정 클로즈업, Soft Bloom" }
]
```

**필드 값 레퍼런스**:
- **type**: `narration` = 원본 대사 그대로(text 수정 금지), `insert` = 새로 삽입된 시각 묘사, `reaction` = 캐릭터 무음 반응 묘사
- **beat 예시**: 훅/설정, Show→Tell, Whiplash→감정, Bait/떡밥, PunchOut, 브레이크, 설정, 전개, 클라이맥스
- **emotion 예시**: Sparkling, Gloom, Shock, Comedy, Tension, Relief, 일상, 자신만만, 감정급반전, 반전감동, 불안, 분노, 허탈
- **direction 예시**: 미디엄 트래킹샷, 클로즈업, 로우앵글, 버스트샷, 와이드, Sparkling Aura, Vertical Gloom Lines, Soft Bloom, Speed Lines
- **편집 규칙**: type=narration인 항목의 text는 원본 대사이므로 수정 금지. beat/emotion/direction은 자유 수정. insert/reaction 항목은 추가/삭제/text 수정 모두 가능. id는 1부터 연속 순번 유지.

**파이프라인 변경**:
```
[기존] Step 1→2→3→4→5→6 (자동 연속)
[변경] Step 1→2→3 → ⏸ enriched_pause → [사용자 편집] → Step 4→5→6
```

**enrichScript 출력 변경**: 자유 텍스트 → JSON 배열(EnrichedBeat[])
- `callTextModelStream` → `callTextModel` (JSON 안정성)
- `responseMimeType: 'application/json'` 강제
- 레거시 enrichedScript(텍스트)도 자동 생성하여 호환 유지

**generateConti 입력 변경**: `enrichedScript?: string` → `enrichedBeats?: EnrichedBeat[]`
- 프롬프트에 JSON 배열 주입 → type/beat/emotion/direction 필드를 컷 변환에 활용

**PipelineCheckpoint 확장**: `'enriched_pause'` 추가
- `runAnalysisPipeline`: Step 1~3 실행 후 `enriched_pause`로 정지
- `resumeFromEnrichedPause(editedBeats)`: 편집된 beats로 Step 4~6 재개

**EnrichedScriptEditor 컴포넌트** (components/EnrichedScriptEditor.tsx):
- 비트 테이블: id/type/beat/text/emotion/direction 6열
- Copy JSON: 클립보드 복사 → 외부 AI에서 편집
- Paste Modified: 모달 → JSON 붙여넣기 → 실시간 검증 (필수 필드, 타입, 파싱 에러)
- Continue → Step 4: 편집된 beats로 파이프라인 재개
- Restart: 처음부터 재시작
- DSS 디자인 시스템 적용 (오렌지 액센트, 다크 명도, 호버 2원칙)

**변경 파일 8개**:
| 파일 | 변경 |
|------|------|
| types.ts | EnrichedBeat 인터페이스 + enrichedBeats 상태/액션/메타데이터 + PipelineCheckpoint 확장 |
| appReducer.ts | enrichedBeats 초기값/저장/로드/SET_ENRICHED_BEATS 케이스 |
| services/ai/textAnalysis.ts | enrichScript → JSON 출력, 반환타입에 enrichedBeats 추가 |
| services/ai/textAnalysisPipeline.ts | generateConti 시그니처 변경 (enrichedScript→enrichedBeats) |
| appAnalysisPipeline.ts | Phase1(Step1~3+pause) / Phase2(Step4~6) 분리, resumeFromEnrichedPause 신규 |
| AppContext.tsx | handleResumeFromEnrichedPause 연결 + import 추가 |
| App.tsx | enriched_pause 상태 UI 분기 + EnrichedScriptEditor 렌더링 |
| components/EnrichedScriptEditor.tsx | ★ 신규 — 복사/붙여넣기/검증 편집기 |

**주의사항**:
- enrichScriptWithDirections: 반환타입 변경 `{ enrichedScript, enrichedBeats, tokenCount }`
- generateConti: 시그니처 변경 `(script, scenario, bibles, enrichedBeats?, logline?, seed?, onProgress?)`
- geminiService.ts: 변경 없음 (re-export 체인 자동 전파)
- enrichedBeats 없는 기존 프로젝트: `null` → 기존 동작 유지 (enrichedScript 텍스트 표시)
- EnrichedScriptEditor: validateBeats로 JSON 구조 검증 + normalizeBeats로 안전 정규화
- pipelineCheckpoint === 'enriched_pause' 시 AppInputScreen 숨김
- Paste 검증: 배열 or {beats:[...]} 양쪽 허용, type 자동 폴백(narration)

### Phase 12+: 레퍼런스 이미지 포즈 과보존 버그 수정 (2026-03-19)

**증상**: 러프/일반 생성 시 캐릭터가 레퍼런스 원본의 포즈/표정/눈물까지 그대로 복사됨
**원인 3가지**:

1. **identityLock에서 acting 반대 힘 소실**: 기존 `IDENTITY PRESERVATION & DYNAMIC ACTING` 단일 블록이 분리되면서, identityLock에 포즈 탈출 지시만 남고 acting 강제가 빠짐 → Gemini가 "전부 보존"으로 과잉 해석
2. **neutral 무드 acting 너무 약함**: 대부분의 직장/일상 씬이 neutral로 감지 → "Natural, everyday body language" = 레퍼런스 거의 그대로 복사
3. **"Rebuild the scene" 문구 삭제**: LAYER 2에서 레퍼런스에서 벗어나라는 명시적 지시 사라짐 + `Facial Expression` 강제도 약해짐

**수정 4곳**:
| # | 파일 | 변경 |
|---|------|------|
| 1 | appStyleEngine.ts | identityLock: `FACE & HAIR ONLY` 명시 + `POSE SEPARATION (CRITICAL)` + `EXPRESSION OVERRIDE` 지시 추가 |
| 2 | appStyleEngine.ts | neutral 무드: "Create a fresh, natural pose" + "Rebuild the scene from scratch" + "reference = face sheet, not pose template" |
| 3 | appStyleEngine.ts | LAYER 2: "Rebuild the scene with a fresh perspective" 복원 + "Draw THIS emotion, ignoring reference expression" |
| 4 | imageGeneration.ts | generateMultiCharacterImage: `[POSE SEPARATION]` + "Reference images are FACE SHEETS only" 추가 |

**핵심 원칙**: 레퍼런스 이미지에서 **얼굴/헤어만** 가져오고, **포즈/표정/의상/배경/카메라앵글**은 전부 씬 디스크립션 기반으로 새로 그리기

### Phase 12+: 씬무드 에너지 레벨 조정 (2026-03-19)

**문제**: 포즈 과보존 수정 후 표정/눈물 문제는 해결됐으나, 전반적 에너지가 낮아져서 옛날 버전 대비 포즈/과장이 밋밋함
**원인**: 씬무드 시스템의 바닥 에너지가 너무 낮음 — 특히 neutral(대부분의 컷)이 "Natural, everyday" → 만화적 과장 부족

**수정 방향**: 썰쇼츠 = 만화적 과장이 기본. 전체 무드의 에너지를 한 단계씩 올리되, 무드 간 차이는 유지

**에너지 레벨 조정**:
| 무드 | Before | After |
|------|--------|-------|
| calm | Low → 정적/마네킹 느낌 | Medium-low → 조용하지만 살아있는 만화 캐릭터 |
| energetic | High | Very high → 유튜브 쇼츠 하이라이트 모먼트 |
| romantic | Medium-low → 밋밋 | Medium → 만화 로맨스 비주얼 (블러시, 스파클) |
| tense | Medium-high | High → 만화 긴장 마커 (땀방울, 다크 오라) |
| neutral | Medium → 대부분 여기 걸림 | Medium-high → "만화 페이지의 베스트 프레임" 기본값 |

**TECHNICAL_CONSTRAINTS 강화**: "manga/chibi-style YouTube Shorts illustration" 명시 + "EXPRESSIVE with exaggerated manga features" 베이스라인 복원

| 파일 | 변경 |
|------|------|
| appStyleEngine.ts | TECHNICAL_CONSTRAINTS 만화 과장 베이스라인 + buildActingDirection 5개 무드 전체 에너지 업 |

### Phase 12+: 에너지 레벨 슬라이더 — Global + 컷별 (2026-03-19)

**목표**: 생성 후 밋밋한 컷은 에너지를 올려서 그 컷만 재생성

**UI 구성**:
- **사이드바 Settings**: ⚡ Energy [1][2][3][4][5] — 전체 기본값 (새 생성 시 적용)
- **SceneCard 헤더**: ⚡ [1][2][3][4][5] — 컷별 오버라이드 (클릭 토글, 다시 클릭하면 해제→Global 따름)

**에너지 5단계 → 무드 매핑**:
| 레벨 | 무드 | 설명 |
|------|------|------|
| 1 | calm (강제) | 차분, 정적 |
| 2 | calm + gentle boost | 조용하지만 따뜻 |
| 3 | 자동감지 (기본값) | detectSceneMood() 사용 |
| 4 | energetic (강제) | 과장, 다이나믹 |
| 5 | energetic + MAX boost | 200% 과장, 클라이맥스 |

**우선순위**: 컷별 energyLevel > globalEnergyLevel > 3 (기본)

**변경 파일 6개**:
| 파일 | 변경 |
|------|------|
| types.ts | Cut.energyLevel + AppDataState.globalEnergyLevel + SET_GLOBAL_ENERGY_LEVEL 액션 + ProjectMetadata |
| appReducer.ts | 초기값 3 + 케이스 + buildProjectMetadata/restoreState/sanitizeState/START_NEW_ANALYSIS |
| appStyleEngine.ts | PromptContext.globalEnergyLevel + energyLevel→mood 강제 매핑 + 레벨5 MAX부스트 + 레벨2 gentle부스트 |
| AppContext.tsx | calculateFinalPrompt에 globalEnergyLevel 전달 |
| components/SceneCard.tsx | ⚡ 5단계 버튼 (STYLE 옆) — 오렌지 솔리드/아웃라인/회색 3상태 |
| App.tsx | 사이드바 Settings에 ⚡ Energy 5단계 버튼 |

**SceneCard ⚡ 버튼 3상태**:
- 오렌지 솔리드 (`bg-orange-500 text-black`): 이 컷에서 직접 선택한 레벨
- 오렌지 아웃라인 (`bg-orange-500/20 border-orange-500/30`): Global과 같은 레벨 (간접 표시)
- 회색 (`bg-zinc-800/60 text-zinc-600`): 선택 안 됨

**동작**: 컷에서 이미 선택된 레벨을 다시 클릭 → undefined (해제) → Global 따름

### Phase 12+: 캐릭터 설정 — 외부 이미지 드롭 시 자동 분석 (2026-03-19)

**목표**: 에셋이 아닌 외부 이미지를 드래그앤드롭해도 자동으로 분석하여 적용

**수정 2곳** (components/CharacterStudio.tsx):

| 드롭 위치 | 에셋 드롭 (기존) | 외부 파일 드롭 (신규) |
|-----------|-----------------|---------------------|
| 레퍼런스 이미지 | 에셋의 hair DNA 적용 | 이미지 표시 + `analyzeHairStyle()` 자동 호출 → hair DNA 채움 |
| 의상 슬롯 | 에셋의 outfit text 적용 | 이미지 즉시 표시 + `analyzeAssetWithVision(url, 'outfit')` 호출 → 의상 텍스트 자동 채움 |

**동작 흐름**:
- `handleDropOnReference`: `e.dataTransfer.getData('application/json')` 시도 → 실패 시 `e.dataTransfer.files[0]` → FileReader → `handleSetReferenceImage(url)` (기존 자동 분석 경로)
- `handleDropOnOutfit`: JSON 시도 → 실패 시 파일 → 이미지 슬롯 즉시 표시 → `analyzeAssetWithVision(url, 'outfit')` → description → `onUpdateCharacterDescription`

**주의사항**:
- `analyzeAssetWithVision`은 `AssetCatalogModal.tsx`에서 이미 export되어 CharacterStudio에서 import 중
- 레퍼런스: `handleSetReferenceImage(url)` 호출 시 `existingHairDNA` 미전달 → 기존 `analyzeHairStyle()` 자동 트리거
- 의상: 분석 중 알림 표시 ("의상 분석 중...") → 완료 시 텍스트 자동 채움 + 성공 알림

### Phase 12+: 옛날 상태 복원 크래시 수정 (2026-03-19)

**증상**: 코드 업데이트 후 앱 시작 시 "불러오기 실패: 파일 형식이 올바르지 않습니다" 에러
**원인**: IndexedDB의 옛날 상태에 enrichedBeats/globalEnergyLevel 등 새 필드 없음 → sanitizeState 예외
**수정 3곳**:
- `appReducer.ts` sanitizeState: enrichedBeats(null), locationRegistry([]), logline(''), globalEnergyLevel(3) 폴백 + enriched_pause 잔류 방지
- `appReducer.ts` RESTORE_STATE: try-catch → 실패 시 initialAppDataState 폴백
- `AppContext.tsx` auto-restore: dispatch 실패 시 `del('wvs_auto_save_state')` — 손상 데이터 자동 삭제 + `del` import 추가

### Phase 12+: 프로젝트 열기 깜빡임 수정 (2026-03-19)

**증상**: 프로젝트 열기 후 화면이 주기적으로 깜빡이며 클릭이 안 됨
**원인**: `SET_PROJECT_SAVED`가 `isProjectSaved: true`여도 매번 새 객체 생성 → React state 변경 감지 → auto-save 재발동 → 2초마다 무한 루프
**수정**: `appReducer.ts` — 값이 같으면 같은 state 참조 반환
```typescript
case 'SET_PROJECT_SAVED': return state.isProjectSaved === action.payload ? state : { ...state, isProjectSaved: action.payload };
```

### Phase 12+: Global Energy 변경 시 컷별 오버라이드 초기화 (2026-03-19)

**동작**: `SET_GLOBAL_ENERGY_LEVEL` 발동 시 모든 컷의 `energyLevel`을 `undefined`로 초기화
**이유**: 전체 설정 변경하면 개별 설정도 따라가야 함 (사용자 기대)
**수정**: `appReducer.ts` — generatedContent.scenes 순회하며 energyLevel 제거

### Phase 12+: Vision API 이미지 안전장치 (2026-03-19)

**문제 1**: 12MB 이미지 → Claude Vision 5MB 한도 초과 → 400 에러
**수정**: `aiCore.ts` callVisionTextModel에 `resizeBase64IfNeeded()` — Canvas 리사이즈(JPEG 85%) 자동 적용

**문제 2**: `.png` 확장자인데 실제 JPEG (Rust가 확장자로 MIME 결정) → Claude "mimeType 불일치" 400 에러
**수정**: `aiCore.ts` `detectActualMimeType()` — base64 매직 바이트로 실제 포맷 감지
- `/9j/` → JPEG, `iVBOR` → PNG, `UklGR` → WebP, `R0lGO` → GIF
- 콘솔: `[Vision] MIME 보정: image/png → image/jpeg`

### Phase 12+: 의상/배경 분석 프롬프트 정제 (2026-03-19)

**문제**: analyzeAssetWithVision 의상/배경 출력에 마크다운(**bold**, 헤더, 불릿) 포함 → 프롬프트 오염
**수정**: `AssetCatalogModal.tsx` analyzeAssetWithVision
- 의상: `comma-separated sentence` + 60단어 제한 + 예시 포맷 + 후처리 마크다운 제거
- 배경: `comma-separated sentence` + 50단어 제한 + 예시 포맷 + 후처리 마크다운 제거
- 캐릭터/헤어: JSON 파싱 거치므로 변경 없음

### Phase 12+: 캐릭터 스튜디오 — 의상 에셋 적용 버그 + outfitImg 오류 수정 (2026-03-19)

**버그 1**: 의상란에 캐릭터 에셋 드롭 → 헤어 DNA가 의상으로 들어감
**원인**: `asset.tags.description`(=헤어 DNA)를 의상 fallback으로 사용
**수정**: `CharacterStudio.tsx` applyAssetToOutfit — fallback 제거, outfitData.englishDescription만 사용, 없으면 `analyzeAssetWithVision('outfit')` 자동 호출

**버그 2**: 외부 이미지 드롭 시 `<img src="">` → React 경고 + 페이지 리로드
**수정**: `outfitImg` fallback을 `''` → `null`로 변경

### Phase 12+: 의상 분석 중 스피너 오버레이 (2026-03-19)

**추가**: `CharacterStudio.tsx` — `analyzingOutfitLocs: Set<string>` 상태
- 의상 AI 분석 시작 시 해당 location을 Set에 추가
- 이미지 슬롯에 반투명 오버레이(`bg-black/50`) + 오렌지 스피너 표시
- 분석 완료/실패 시 `finally` 블록에서 반드시 해제
- 에셋 드롭 + 외부 파일 드롭 양쪽 모두 적용

### Phase 12+: UI 개선 — 5건 묶음 작업 (2026-03-19)

#### 1. 에셋 기본 화풍 → 글로우 치비
- `AssetTagPopup` 화풍 미선택 시 기본값: `''` → `'glow-chibi'`
- 신규 에셋 추가 시 화풍 선택 안 하면 자동으로 글로우 치비 적용

#### 2. 에셋 카탈로그 이미지 클릭 확대
- AssetCatalogModal + AssetCatalogPage 양쪽에 `ImageViewerModal` 연동
- 에셋 이미지 클릭 시 전체화면 확대 뷰어 열림 (cursor-zoom-in)
- `viewerImage` 로컬 state 추가

#### 3a. 히스토리 전체 보기 토글
- 선택 컷 이력 헤더에 `[All]` 버튼 추가 → `setSelectedCutNumber(null)` → 전체 이미지 뷰로 복귀
- 기존에는 컷 한번 선택하면 전체로 돌아갈 UI가 없었음

#### 3b. 이미지 편집 버튼(✏️) → 스튜디오 자동 전환
- `appTypes.ts`: UIState에 `studioLoadTrigger: number` 추가
- `AppContext.tsx`: `handleSendImageToStudio` 호출 시 `studioLoadTrigger` bump
- `App.tsx`: `useEffect`로 trigger 감지 → `setBoardRightTab('edit')` 자동 전환
- `App.tsx`: `sendToStudioAndSwitch()` 래퍼 — History 탭의 Studio 버튼도 Edit 탭으로 자동 전환
- 히스토리 탭의 Studio 버튼 2곳: `actions.handleSendImageToStudio` → `sendToStudioAndSwitch` 교체
- SceneCard ✏️ 버튼: 기존 `actions.handleSendImageToStudio` 유지 → trigger로 자동 전환

#### 4. Studio 이미지 다운로드 버튼
- `ImageStudio.tsx`: 하단 버튼 줄에 `[Dl]` 버튼 추가 (Ups 뒤)
- 동작: fetch → blob → `<a download>` (기존 SceneCard 패턴 동일)
- 조건: `currentImage` 있을 때만 활성화

#### 5. 캐릭터 의상 → 에셋 저장 (호버 메뉴)
- `CharacterStudio.tsx`: 의상 이미지(80×80) 호버 시 `[📌]` 오버레이 버튼 표시
- 조건: `outfitImg` 존재 + `IS_TAURI` + 생성/분석 중 아님
- 클릭 → `AssetTagPopup` 열림 (type: 'outfit' 기본, 이미지 프리뷰, 이름 자동: "{캐릭터명} - {장소명}")
- 저장: fetch → base64 → `saveAsset` Tauri 커맨드 → 카탈로그에 추가 + 성공 알림
- `outfitAssetPopup` 로컬 state 추가
- `group/outfit` 네스트 그룹으로 호버 범위 제한 (부모 그룹과 간섭 방지)

| 파일 | 변경 |
|------|------|
| appTypes.ts | studioLoadTrigger 필드 추가 |
| AppContext.tsx | handleSendImageToStudio에 trigger bump 추가 |
| App.tsx | sendToStudioAndSwitch 래퍼 + useEffect trigger 감지 + All 버튼 + studioLoadTrigger 디스트럭처 |
| components/AssetCatalogModal.tsx | 기본 화풍 glow-chibi + ImageViewerModal 연동 |
| components/AssetCatalogPage.tsx | ImageViewerModal 연동 |
| components/ImageStudio.tsx | Dl 다운로드 버튼 추가 |
| components/CharacterStudio.tsx | 의상 호버 에셋 저장 + AssetTagPopup |

### 주의사항 추가
- studioLoadTrigger: 0 기본값, handleSendImageToStudio 호출마다 +1 → App.tsx useEffect에서 Edit 탭 전환
- sendToStudioAndSwitch: App.tsx 로컬 래퍼 (History 탭 내 Studio 버튼 전용)
- SceneCard ✏️ 버튼: 기존 actions.handleSendImageToStudio 그대로 사용 (trigger 경유 자동 전환)
- AssetTagPopup 기본 화풍: glow-chibi (defaultArtStyle prop이 있으면 그걸 우선 사용)
- outfitAssetPopup: 의상 이미지 URL + 장소명 + 캐릭터명 저장 → AssetTagPopup에 전달
- group/outfit: Tailwind 네스트 그룹 — 부모 group과 독립 호버 영역

### Phase 12+: 글로벌 단축키 + 에러 복구 안내 (2026-03-20)

#### 글로벌 키보드 단축키
- `Cmd+S` (Ctrl+S): 프로젝트 즉시 저장 → handleSaveWithStatus 호출 → Save/Saving/Saved 3상태
- `Cmd+Z` (Ctrl+Z): Studio 되돌리기 → activeStudioTarget의 handleUndoInStudio 호출
  - Studio history가 2개 이상일 때만 동작 (실수 방지)
  - 텍스트 입력 중(포커스가 input/textarea)일 때는 브라우저 기본 동작 유지 (preventDefault 조건부)
- App.tsx useEffect에 글로벌 keydown 리스너 등록 + cleanup

#### 에러 복구 안내 시스템
- `types.ts`: Notification에 `action?: { label: string; callback: () => void }` 필드 추가 + `'warning'` 타입 추가
- `AppContext.tsx`: addNotification 확장 — action 파라미터 수용, action 있으면 8초(없으면 5초) 자동 소멸
- `App.tsx` NotificationToast: action 있으면 재시도 버튼 렌더링 (bg-white/20 pill)
- 적용 지점 (재시도 버튼 포함):
  - `appGenerationActions.ts`: 배치 생성 실패(실패 컷 재시도), 개별 컷 생성 실패(재시도), 프롬프트 수정 실패(재시도), 일괄 수정 실패(재시도)
  - `appCutEditActions.ts`: Studio 수정 실패(재시도), Studio 생성 실패(재시도)
  - `appCharacterActions.ts`: addNotification 시그니처만 확장 (기존 에러 토스트 호환)

| 파일 | 변경 |
|------|------|
| types.ts | Notification.action 필드 + warning 타입 추가 |
| AppContext.tsx | addNotification 확장 (action 파라미터, 8초 타임아웃) |
| App.tsx | NotificationToast 액션 버튼 + 글로벌 Cmd+S/Cmd+Z |
| appGenerationActions.ts | 4곳 에러에 재시도 버튼 연결 |
| appCutEditActions.ts | 2곳 에러에 재시도 버튼 연결 |
| appCharacterActions.ts | addNotification 시그니처 확장 |

---

## 📋 업계 표준 비교 — TODO 작업 목록

> 업계 기준: Premiere, DaVinci, Midjourney, ComfyUI, Figma, Lightroom 참조
> 우선순위: P0(배포 전 필수) > P1(사용성 크게 향상) > P2(나중에 해도 됨)

### ✅ 완료
| 항목 | 상태 | 비고 |
|------|------|------|
| 글로벌 키보드 단축키 (Cmd+S/Cmd+Z) | ✅ Phase 12+ | 저장 + Studio 언두 |
| 에러 복구 안내 (재시도 버튼) | ✅ Phase 12+ | NotificationToast + action 버튼 |
| 프로젝트 자동 저장 + Saved 표시 | ✅ Phase 12+ | 2초 디바운스 + 3상태 Save 버튼 |
| Export 포맷 (PNG/ZIP/SRT/WebM) | ✅ Phase 10+ | 쇼츠 제작 도구로서 충분 |
| 마스크/인페인트 | ✅ Phase 8+ | MaskingCanvas + AI fill |
| 생성 큐/배치 | ✅ Phase 8+ | 전체 러프/일반/수정 일괄 + 프로그레스 |
| 에셋 관리 | ✅ Phase 10 | 카탈로그 + 태그 + 멀티윈도우 + Studio 연동 |

### 🔲 P0 — 배포 전 필수
| 항목 | 설명 | 예상 난이도 | 참고 앱 |
|------|------|-----------|---------|
| 온보딩 / 도움말 | 첫 실행 시 3~5페이지 가이드 + ? 도움말 패널 | ⭐⭐⭐ | Figma, Notion |
| i18n (다국어) | 한/영 하드코딩 → i18n 프레임워크 (react-i18next) | ⭐⭐⭐⭐ | 모든 SaaS |
| 키보드 단축키 확장 | Space(슬라이드쇼 재생), Cmd+E(Studio), Cmd+G(생성), Cmd+Shift+S(다른이름저장) 등 | ⭐⭐ | Premiere, DaVinci |
| 에러 메시지 개선 | API 키 없음/만료, 네트워크 끊김, Rate Limit 등 원인별 구체적 안내 | ⭐⭐ | 모든 SaaS |

### 🔲 P1 — 사용성 크게 향상
| 항목 | 설명 | 예상 난이도 | 참고 앱 |
|------|------|-----------|---------|
| Before/After 이미지 비교 | Studio 수정 전/후 슬라이더 비교 | ⭐⭐ | Lightroom, Photoshop |
| 생성 히스토리 비교 | 2장 나란히 비교 + diff 하이라이트 | ⭐⭐ | Midjourney |
| 해상도 선택 | 512/768/1024 선택 (API 제약 범위 내) | ⭐ | ComfyUI, A1111 |
| 프롬프트 프리셋 | 포즈/앵글/조명 프리셋 라이브러리 | ⭐⭐ | Midjourney --style |
| 글로벌 Undo/Redo | 앱 전체 레벨 상태 되돌리기 (컷 삭제, 프롬프트 변경 등) | ⭐⭐⭐⭐ | Photoshop, Figma |
| 드래그 정렬 | 컷 순서 드래그로 변경 | ⭐⭐⭐ | Premiere, DaVinci |

### 🔲 P2 — 나중에 해도 됨
| 항목 | 설명 | 예상 난이도 | 참고 앱 |
|------|------|-----------|---------|
| 접근성 (a11y) | aria 속성, 키보드 내비게이션, 스크린 리더 | ⭐⭐⭐ | WCAG 2.1 AA |
| 레이어 시스템 | 다중 레이어 합성 (텍스트/이미지/이펙트) | ⭐⭐⭐⭐⭐ | Photoshop, Canva |
| 플러그인/확장 | 사용자 커스텀 화풍/프롬프트 플러그인 | ⭐⭐⭐⭐ | ComfyUI |
| 클라우드 동기화 | 프로젝트 클라우드 저장 + 협업 | ⭐⭐⭐⭐⭐ | Figma, Canva |
| 실시간 미리보기 | 프롬프트 입력 중 저해상도 프리뷰 | ⭐⭐⭐ | DALL-E editor |
