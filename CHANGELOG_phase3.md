# DoReMiSsul Studio — Phase 3 변경 내역
## Tauri v2 데스크톱 앱 전환

---

## 아키텍처 변경

```
Phase 2 (브라우저)                    Phase 3 (데스크톱)
┌───────────────────────┐            ┌────────────────────────────────┐
│ Browser               │            │ Tauri Window (WebView)         │
│ ┌───────────────────┐ │            │ ┌────────────────────────────┐ │
│ │ React Frontend    │ │            │ │ React Frontend (동일)      │ │
│ │  ↓ fetch          │ │            │ │  ↓ invoke()               │ │
│ │ Vite Proxy        │──→ Claude    │ └────────┬───────────────────┘ │
│ │ corsproxy.io      │──→ Supertone │          │ IPC                 │
│ │ process.env 키    │──→ Gemini    │ ┌────────▼───────────────────┐ │
│ └───────────────────┘ │            │ │ Rust Backend               │ │
│ ⚠️ 키 브라우저 노출    │            │ │  ├─ proxy_claude()         │ │
│ ⚠️ CORS 프록시 의존    │            │ │  ├─ proxy_gemini()         │ │
└───────────────────────┘            │ │  ├─ proxy_supertone()      │ │
                                     │ │  ├─ tauri-plugin-store     │ │
                                     │ │  │   (암호화 키 저장)        │ │
                                     │ │  └─ tauri-plugin-fs        │ │
                                     │ │      (로컬 파일 접근)        │ │
                                     │ └────────────────────────────┘ │
                                     │ ✅ 키 안전 (Rust에서만 처리)     │
                                     │ ✅ CORS 문제 없음               │
                                     │ ✅ 로컬 파일 직접 접근           │
                                     └────────────────────────────────┘
```

---

## 신규 파일

### Rust 백엔드 (`src-tauri/`)
| 파일 | 역할 |
|------|------|
| `Cargo.toml` | Rust 의존성 (tauri 2, reqwest, tokio, serde 등) |
| `tauri.conf.json` | 앱 메타데이터, 윈도우 설정, CSP, 플러그인 권한 |
| `capabilities/default.json` | Tauri v2 권한 시스템 (fs, dialog, store, shell) |
| `build.rs` | Tauri 빌드 스크립트 |
| `src/lib.rs` | **핵심** — 8개 Tauri 커맨드 (API 프록시 3종 + 키 관리 3종 + 범용 fetch + 스트리밍) |
| `src/main.rs` | 진입점 |
| `icons/` | 플레이스홀더 아이콘 (추후 교체) |

### 프론트엔드
| 파일 | 역할 |
|------|------|
| `services/tauriAdapter.ts` | Tauri ↔ 프론트엔드 브릿지 (IS_TAURI 감지, invoke 래퍼) |
| `components/ApiKeySettings.tsx` | API 키 설정 모달 (암호화 저장) |

---

## 수정 파일

### `services/claudeService.ts` — 완전 재작성
- `IS_TAURI` 분기: Tauri → `invoke('proxy_claude')`, 브라우저 → Vite proxy
- 스트리밍: Tauri → `invoke('proxy_claude_stream')` + Tauri Events
- Vision: 동일 패턴
- **export 시그니처 변경 없음** → geminiService의 브릿지 함수 호환 유지

### `services/geminiService.ts`
- `getGeminiAI()` 헬퍼 추가 — Tauri: Store에서 키 로드, 브라우저: process.env
- 14개 `new GoogleGenAI({ apiKey: process.env.API_KEY })` → `await getGeminiAI()`
- `clearGeminiKeyCache()` export 추가 (설정 변경 시 호출)
- `tauriAdapter` import 추가

### `services/supertoneService.ts`
- Tauri 환경: `callSupertoneTauri()` → Rust가 직접 HTTPS 호출 (CORS 없음!)
- 브라우저 환경: 기존 `corsproxy.io` 유지 (개발용)
- API 키: Tauri → Store, 브라우저 → process.env

### `vite.config.ts`
- `clearScreen: false` (Tauri CLI 터미널 출력 보존)
- `strictPort: true` (devUrl 포트 고정)
- `envPrefix: ['VITE_', 'TAURI_ENV_']`
- Tauri 빌드 시 proxy 비활성화 (Rust가 처리)
- `build.target`: Tauri → `safari15` (WebKit), 브라우저 → `esnext`

### `package.json`
- 이름: `doremissul-studio`, 버전: `0.3.0`
- Tauri 스크립트: `tauri:dev`, `tauri:build`
- `@tauri-apps/api`, `@tauri-apps/cli`, 4개 플러그인 추가
- 기존 모든 의존성 유지

### `.gitignore`
- `src-tauri/target/`, `src-tauri/gen/`, 아이콘 빌드 파일 추가

---

## 보안 개선 요약

| 항목 | Phase 2 | Phase 3 |
|------|---------|---------|
| API 키 저장 | `.env` 텍스트 파일 | macOS Keychain (Security.framework) |
| 키 노출 | `process.env.define` → JS 번들 | Rust 메모리만 (프론트엔드 접근 불가) |
| 키 관리 | 텍스트 에디터로 수동 편집 | 앱 내 설정 UI + "키체인 접근" 앱에서도 확인 |
| CORS | `corsproxy.io` 제3자 의존 | Rust `reqwest` 직접 호출 |
| 네트워크 | 브라우저 제한 | 네이티브 HTTP (제한 없음) |

---

## Mac Studio에서 실행하기

### 사전 준비
```bash
# 1. Rust 설치 (이미 설치되어 있으면 건너뛰기)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 2. Xcode Command Line Tools (이미 설치되어 있으면 건너뛰기)
xcode-select --install
```

### 개발 모드
```bash
# 1. 압축 해제
unzip doremi_app-phase3.zip
cd doremi_app-main

# 2. 의존성 설치
npm install

# 3. Tauri 개발 모드 실행
npm run tauri:dev
# → 첫 실행 시 Rust 컴파일 (3~5분), 이후 핫리로드
# → 앱 창이 열리면 🔐 버튼으로 API 키 설정
```

### 프로덕션 빌드 (.dmg)
```bash
npm run tauri:build
# → src-tauri/target/release/bundle/dmg/도레미썰 스튜디오_0.3.0_aarch64.dmg
```

### 브라우저 개발 모드 (기존 방식 — Tauri 없이)
```bash
cp .env.example .env
# .env에 API 키 입력
npm run dev
# → http://localhost:3000
```

---

## 아이콘 교체 방법
현재 플레이스홀더 아이콘. 실제 아이콘으로 교체:
```bash
# 1024x1024 PNG 준비 후:
npm run tauri icon path/to/icon-1024x1024.png
# → src-tauri/icons/ 에 모든 사이즈 자동 생성
```

---

## 롤백 방법
1. **Tauri → 브라우저 전용**: `npm run dev`로 실행 (기존 방식)
2. **Claude → Gemini**: `geminiService.ts`의 `USE_CLAUDE_FOR_TEXT = false`

---

## 다음 단계 (Phase 4 후보)
- 프로젝트 폴더 관리 (tauri-plugin-fs 활용)
- 대본 로컬 자동저장 + 버전 관리
- 렌더링 결과물 자동 내보내기
- 커스텀 타이틀바 + 앱 아이콘 디자인
- 자동 업데이트 (tauri-plugin-updater)
