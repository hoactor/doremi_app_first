# CLAUDE.md — 도레미썰 스튜디오

## 이 앱이 뭔가
썰쇼츠 유튜브 채널용 제작 도구. 대본 → AI 분석 → 이미지 프롬프트 → AI 이미지 생성 → TTS → 영상 편집까지 하나의 데스크톱 앱에서 처리.

## 기술 스택
- React 19 + TypeScript + Vite 6 + Tailwind (CDN)
- Tauri v2 (Rust 백엔드)
- AI: Gemini 2.5 Flash (이미지 생성) + Gemini 3 Flash (텍스트 분석) + Supertone/Typecast (TTS)
- 실행 환경: macOS (Apple Silicon)

## 절대 규칙

### Rust 백엔드
- **`tauri.conf.json`의 plugins 섹션은 빈 `{}` 유지.** 내용 넣으면 런타임 패닉.
- HTTP 타임아웃 줄이지 마.

### 프론트엔드 구조
- **contexts/ 폴더 금지.** 모든 app*.ts 파일은 루트 레벨.
- AppContext는 factory 패턴으로 분할됨: `createXxxActions(helpers)` → 핸들러 객체 반환.
  - 분할 파일: appDownloadActions, appGenerationActions, appNormalizationActions, appCharacterActions, appCutEditActions, appProjectActions, appMiscActions
  - helpers: dispatch, stateRef, addNotification + 필요 유틸 주입
  - React Hook 의존 없음 (순수 함수 + async)
- `geminiService.ts`는 **re-export 허브**. 직접 수정하지 말고 실제 함수가 있는 파일을 수정할 것.
  - 텍스트 분석 → `services/ai/textAnalysis.ts`
  - 이미지 생성 → `services/ai/imageGeneration.ts`
  - 공통 헬퍼 → `services/ai/aiCore.ts`

### 공통 유틸 (appUtils.ts) — 중복 만들지 마
- `getEngineFromModel(model)` — nano-3pro/3.1 → nano-v3, 그 외 → nano
- `createGeneratedImage({...})` — GeneratedImage 객체 팩토리 (id 자동 생성)
- `createInitialStudioSession()` — StudioSession 초기값
- `sanitizeState(state)` — 저장 전 transient 상태 제거

### 이미지 생성
- 현재 Gemini 단일 엔진. Flux 병행 운영은 향후 계획.
- Studio는 studioId `'a'`, `'b'` 듀얼 사용.

### 프롬프트 수정
- characters 변경 시 → characterOutfit + imagePrompt 항상 재조립.
- 요청하지 않은 필드 변경 금지.

## 아키텍처

```
React Frontend (Tauri WebView)
    ↓
AppContext.tsx (Provider + factory wiring)
    ├─ appReducer.ts (상태 변경)
    ├─ appTypes.ts (UIState)
    ├─ appUtils.ts (공통 유틸)
    ├─ appStyleEngine.ts (화풍 프롬프트 + buildFinalPrompt)
    ├─ appImageEngine.ts (이미지 엔진 + retry)
    ├─ appAnalysisPipeline.ts (6단계 분석)
    ├─ appGenerationActions.ts (이미지 생성)
    ├─ appCharacterActions.ts (캐릭터 스튜디오)
    ├─ appCutEditActions.ts (컷 편집)
    ├─ appNormalizationActions.ts (정규화)
    ├─ appDownloadActions.ts (다운로드)
    ├─ appMiscActions.ts (배경/outpaint/fill)
    └─ appProjectActions.ts (프로젝트 CRUD)

Services/
    ├─ geminiService.ts (re-export hub — 수정 금지)
    ├─ ai/aiCore.ts (Gemini 클라이언트 + 공통 헬퍼)
    ├─ ai/textAnalysis.ts (텍스트 분석 23개 함수)
    ├─ ai/imageGeneration.ts (이미지 생성 12개 함수)
    ├─ openaiService.ts (DALL-E 3)
    ├─ supertoneService.ts (TTS)
    └─ typecastService.ts (TTS)
```

## 핵심 파일 구조

```
doremi_app_first/
├── index.tsx               # 엔트리
├── App.tsx                 # 메인 레이아웃 (3패널 + 모달)
├── AppContext.tsx           # Provider + factory 조립 (749줄)
├── appReducer.ts           # 리듀서 (~40 case)
├── appTypes.ts             # UIState + initialUIState
├── appUtils.ts             # 공통 유틸 (4개 함수)
├── appStyleEngine.ts       # buildArtStylePrompt + buildFinalPrompt
├── appImageEngine.ts       # getVisionModelName + retry wrapper
├── appAnalysisPipeline.ts  # 6단계 분석 파이프라인
├── appGenerationActions.ts # 이미지 생성 (5 핸들러)
├── appCharacterActions.ts  # 캐릭터 스튜디오 (13 핸들러)
├── appCutEditActions.ts    # 컷 편집 (21 핸들러)
├── appNormalizationActions.ts # 정규화 (2 핸들러)
├── appDownloadActions.ts   # ZIP/SRT 다운로드 (5 핸들러)
├── appMiscActions.ts       # 배경/outpaint/fill/마스크 (7 핸들러)
├── appProjectActions.ts    # 프로젝트 CRUD (4 핸들러)
├── types.ts                # 전체 타입 정의
├── services/
│   ├── geminiService.ts    # Re-export 허브 (수정 금지)
│   ├── ai/
│   │   ├── aiCore.ts       # Gemini 클라이언트 + 공통 헬퍼
│   │   ├── textAnalysis.ts # 텍스트 분석 (23개 함수)
│   │   └── imageGeneration.ts # 이미지 생성 (12개 함수)
│   ├── openaiService.ts    # DALL-E 3
│   ├── supertoneService.ts # TTS
│   └── typecastService.ts  # TTS
├── components/             # UI 컴포넌트 (34개)
├── utils/                  # 유틸리티
└── src-tauri/              # Rust 백엔드
    ├── src/lib.rs          # Tauri 앱 설정
    ├── src/main.rs         # 엔트리
    ├── tauri.conf.json     # plugins: {} 유지!
    └── Cargo.toml
```

## 순환 참조 방지 규칙

```
types.ts (리프)
  ↑
appUtils.ts (types만 import)
  ↑
appReducer.ts (types, appUtils만)
  ↑
appStyleEngine.ts, appImageEngine.ts (types, appUtils, services)
  ↑
app*Actions.ts (types, appUtils, engines, services — 다른 Action 파일 import 금지)
  ↑
AppContext.tsx (유일한 허브 — 모든 Action 팩토리를 import)
```

## 대본 분석 파이프라인

```
[Step 1] normalizeScriptCuts(script)
    → 대본 정규화 (장면/컷 구조 파싱)
[Step 2] analyzeCharacters(script)
    → 캐릭터 분석 (외형, 성격, 의상)
[Step 3] enrichScriptWithDirections(script)
    → 연출 방향 추가
[Step 4] generateCinematicBlueprint()
    → 시네마틱 블루프린트
[Step 5] generateLocationProps()
    → 장소별 비주얼 DNA
[Step 6] generateEditableStoryboard()
    → 편집 가능한 스토리보드 생성
```

## 화풍 시스템

### ArtStyle 값
normal (정통 썰툰) / moe (극강 귀요미) / dalle-chibi (프리미엄) / vibrant (도파민) / kyoto (감성) / custom

## 호환성 주의 — 기존 프로젝트가 깨지면 안 된다
- characterPose 없으면 `|| ''` 폴백
- GeneratedImage.tag 없으면 기본 처리
- locationVisualDNA 없으면 빈 객체 `{}` 폴백

## 실행 명령어
```bash
# 개발
npx tauri dev

# 빌드
npx tauri build   # → .dmg

# 프론트엔드만
npm run dev
```

## 향후 계획
- Claude API 연동 (대본 분석)
- Flux 병행 엔진 (fal.ai)
- 멀티윈도우 (에셋 카탈로그)
- 파이프라인 체크포인트 (pause/resume)
- 장소 레지스트리
- 6축 화풍 시스템 (STYLE/PALETTE/LIGHTING/RENDERING/LINEWORK/BACKGROUND)
- macOS Keychain API 키 저장
