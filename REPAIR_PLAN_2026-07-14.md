# DoReMiSsul Studio 복구 후 수정 계획

작성일: 2026-07-14  
운영 범위: Mac Studio 한 대에서만 사용하는 로컬 Tauri 앱. 배포·코드 서명·CI/CD는 이번 범위에서 제외한다.

## 현재 기준점

- 실제 저장 루트: `~/Documents/DoReMiSsul Studio`
- 복구 완료: 프로젝트 50개, 에셋 51개, 프로젝트 이미지 467개, 썸네일 342개
- 레거시 원본: `~/Library/Application Support/com.doremissul.studio`에 그대로 보존
- 복구 백업: `/Volumes/hoya_990pro/doremissul_recovery_backup_20260714-2327`
- 앱 시작 시 30일 프로젝트 자동삭제 호출은 제거함
- Tauri 개발 앱에서 프로젝트 50개·에셋 51개 표시를 확인함

## 우선순위와 의존 관계

```text
복구 기준점 고정
  → 삭제·경로·원자 저장 안전장치
  → Keychain·API IPC·로컬 전용 네트워크 경계
  → 프로젝트/오디오 무손실 저장
  → 입력·프롬프트 보호
  → Flux/DALL-E 경로 정상화
  → 회귀 테스트·의존성 정리
```

각 단계는 별도 커밋으로 나눈다. 데이터 안전, Keychain 이관, 프로젝트 스키마, 오디오, Flux 프롬프트를 한 커밋에 섞지 않는다.

## P0. 데이터 손실 방지

### 1. 오래된 프로젝트 자동삭제 기능 완전 제거

대상:

- `AppContext.tsx`
- `services/tauriAdapter.ts`
- `src-tauri/src/main.rs`
- `components/ProjectListModal.tsx`

작업:

- 이미 제거한 시작 시 `cleanupOldProjects(30)` 호출을 유지한다.
- 사용처가 없어진 프론트 어댑터와 Rust `cleanup_old_projects` 명령을 제거한다.
- 프로젝트 목록의 `D-` 표시와 30일 자동삭제를 암시하는 문구를 제거한다.
- 사용자가 누르는 개별 삭제 확인창은 유지한다.

완료 기준:

- `cleanupOldProjects`, `cleanup_old_projects` 검색 결과가 0이다.
- 앱을 두 번 종료·재실행해도 프로젝트 50개와 전체 파일 수가 변하지 않는다.

### 2. 파일 IPC 경로 제한과 JSON 원자 저장

대상:

- Rust 변경은 `src-tauri/src/main.rs` 하나에서만 한다.
- Rust 테스트도 같은 파일의 `#[cfg(test)]` 모듈에 둔다. `lib.rs`는 만들지 않는다.

작업:

- 프로젝트 ID, 파일명, 저장 루트 하위 경로를 검사하는 공용 헬퍼를 만든다.
- 절대경로, `..`, 경로 구분자가 든 파일명, 심볼릭 링크를 통한 루트 이탈을 거부한다.
- 이미지·오디오·프로젝트·에셋 읽기/쓰기/삭제 명령에 같은 검사를 적용한다.
- `project_list.json`, `asset_catalog.json`, 레지스트리, 설정 파일은 임시 파일에 쓴 뒤 rename한다.
- JSON 손상 시 빈 목록으로 덮지 않고 손상 원본을 별도 보존하고 오류를 반환한다.

완료 기준:

- 현재 복구 데이터의 모든 정상 경로는 허용된다.
- `../x`, 절대경로, 심볼릭 링크 이탈은 거부되며 저장 루트 밖 파일은 바뀌지 않는다.
- 저장 실패를 모사해도 기존 JSON은 온전하다.

## P1. 로컬 전용 보안 경계

배포하지 않으므로 공개 배포 공격면은 제외한다. 다만 현재 개발 서버가 LAN 전체에 열리고 키가 renderer 번들 또는 평문 저장소에 들어가는 문제는 로컬 전용이어도 고친다.

### 3. API 키를 macOS Keychain으로 이관

대상:

- `services/tauriAdapter.ts`
- `components/ApiKeySettings.tsx`
- `src-tauri/src/main.rs`
- 관련 AI 클라이언트 캐시

작업:

- API 키 저장·조회·상태 확인을 Rust Keychain 명령으로 연결한다.
- 기존 `localStorage` 키는 Keychain에 병합하고 검증에 성공한 뒤에만 삭제한다.
- 키 하나만 바꿔도 나머지 키가 유지되도록 부분 갱신한다.
- 키 변경 뒤 Gemini/Fal 클라이언트 캐시를 초기화한다.
- Keychain service 이름은 `doremissul-studio`를 유지한다.

완료 기준:

- 키 하나를 수정해도 다른 키가 사라지지 않는다.
- 이관 실패 시 기존 localStorage 값은 보존되고, 성공 시 평문 키가 남지 않는다.

### 4. 번들·프로젝트 상태에서 비밀 제거

대상:

- `vite.config.ts`
- `types.ts`
- `appReducer.ts`
- `AppContext.tsx`

작업:

- Vite `define`으로 API 키를 frontend에 넣는 코드를 제거한다.
- dev server host를 `127.0.0.1`로 제한한다.
- 앱 state, 프로젝트 export, IndexedDB에 OpenAI/API 키가 직렬화되지 않게 한다.
- 브라우저 단독 실행에서는 유료 API 호출 대신 Tauri 앱이 필요하다는 오류를 보여준다.

완료 기준:

- 새 빌드 산출물과 프로젝트 export에서 실제 키 문자열이 검색되지 않는다.
- 개발 서버가 loopback에서만 열린다.

### 5. API IPC와 Tauri 권한 축소

작업:

- Claude 일반·스트림·Vision 호출을 제한된 Rust 프록시로 통일한다.
- 사용하지 않는 범용 `proxy_fetch` 경로를 제거한다.
- HTTP timeout은 300초를 유지한다.
- Tailwind CDN/import map을 로컬 고정 버전 빌드로 바꾼다.
- home 전체 read/write 권한과 원격 script CSP를 앱에 필요한 경로만으로 줄인다.

완료 기준:

- renderer 요청 헤더·로그에 API 키가 없다.
- 네트워크를 끊어도 UI 스타일이 유지된다.
- `tauri.conf.json`의 `plugins: {}`와 `dragDropEnabled: false`는 그대로다.

## P2. 프로젝트 무손실 저장

### 6. 프로젝트 포맷 v3 round-trip

작업:

- 추가 필드 방식의 `version: 3`을 도입하고 v1/v2 읽기를 계속 지원한다.
- `GeneratedImage`의 tag/model/style/quality/engine/anchor/createdAt을 보존한다.
- 선택 이미지 ID, scene layer, 컷별 화풍, 내레이션·화자·FX 등 지속 필드를 보존한다.
- 저장된 대표 이미지를 정확히 복원하고 tag가 없는 과거 이미지는 `hq`로 처리한다.
- 기존 호환 폴백(locationRegistry, characterPose, DNA, canonicalName/aliases, Gemini/Flux 기본값)을 유지한다.

완료 기준:

- 복구 프로젝트 fixture를 `load → save → load`해 지속 필드가 동일하다.
- 두 번째 이미지를 대표로 선택한 상태가 재실행 후에도 유지된다.

### 7. 컷 오디오 영속화

작업:

- 컷 오디오를 `projects/<id>/audio`에 저장하고 JSON에는 경로와 순서만 기록한다.
- 로드 시 실제 MIME data URL로 복원한다.
- 누락 오디오는 해당 컷에만 경고하고 프로젝트 전체 로드는 계속한다.

완료 기준:

- 한 컷에 오디오 두 개를 붙여 저장·재실행해도 순서대로 재생된다.
- project JSON에는 대용량 base64와 blob URL이 남지 않는다.

## P3. 입력과 프롬프트 보호

### 8. 수정 필드 allowlist와 키보드 규칙

작업:

- Codex 수정 결과에서 사용자가 요청한 필드만 적용한다.
- 배경·장소, 의상, 카메라 요청이 없으면 해당 필드 변경을 버린다.
- characters가 바뀌면 characterOutfit과 imagePrompt를 항상 재조립한다.
- 수정 입력을 textarea로 바꾸고 일반 Enter는 줄바꿈, `⌘/Ctrl+Enter`만 실행한다.

완료 기준:

- “표정을 화나게”에서 장소·의상·앵글이 변하지 않는다.
- Enter는 API 0회, Cmd+Enter는 1회 호출한다.

## P4. 이미지 엔진 정상화

### 9. Flux 캐릭터·모델·레퍼런스

작업:

- `resolveCharId()`가 key, canonicalName, koreanName, aliases, 괄호 제거 이름을 처리하게 한다.
- 중복 캐릭터 매칭을 공용 함수로 통일한다.
- 누락 모델은 호환 규칙대로 `flux-2-flex`로 폴백한다.
- 다인 생성에서도 사용자가 선택한 Pro/Flex endpoint를 전달한다.
- Flux edit에 base 이미지와 추가 레퍼런스를 순서대로 전달하고 모델별 장수 제한을 적용한다.
- fal CDN URL은 계속 즉시 data URL로 바꾼다.

### 10. Flux 자연어 프롬프트

대상:

- `appFluxPromptEngine.ts`
- Gemini 전용 `services/ai/imageGeneration.ts`, `appStyleEngine.ts`는 수정하지 않는다.

작업:

- 활성 JSON/명령형 프롬프트를 묘사형 자연어로 바꾼다.
- 캐릭터 → 행동 → 감정 → 의상 → 카메라 → 배경 → 화풍 → FX 순서를 지킨다.
- JSON, 헤더, 섹션 태그, `DO NOT`, `MUST`, weight 문법을 최종 출력에서 차단한다.
- 품질을 해치지 않는 범위에서 200자 이내를 우선한다.

완료 기준:

- 0인 인서트, 1인, 2인, alias, LoRA 대표 fixture에서 금지 문법과 인물·의상 누락이 없다.

### 11. DALL-E 3 전용 Rust 프록시

작업:

- DALL-E 3 생성과 prompt refinement를 각각 제한된 Rust command로 연결한다.
- OpenAI 키는 Rust가 Keychain에서 주입하고 renderer의 직접 fetch를 제거한다.
- 기존 `DalleError.kind` 분류와 DALL-E 규격별 size 규칙을 유지한다.
- 본편 Gemini/Flux 경로와 격리한다.

완료 기준:

- CSP에 `api.openai.com`을 허용하지 않아도 동작한다.
- missing-key, content-policy, rate-limit, server, network, invalid-response가 구분된다.

## P5. 회귀 테스트와 유지보수

### 12. 자동 회귀 테스트

추가할 최소 테스트:

- 프로젝트 v2 fixture 호환과 v3 round-trip
- 경로 검증·원자 저장 Rust 단위 테스트
- API 키 부분 갱신과 localStorage → Keychain 이관
- Enter/Cmd+Enter 동작
- 요청 필드 allowlist
- Flux alias·endpoint·reference 배열·금지 문법
- 에셋 기본 화풍 `dalle-chibi`

로컬 검증 명령:

```bash
npm run test
npm run lint
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test && cargo clippy -- -D warnings
```

### 13. 작은 품질 수정

- Vision 리사이즈 임계값을 12MB 규칙과 맞춘다.
- Tauri 다운로드를 `downloadFile()`로 통일한다.
- 비동기 listener 등록 해제 race를 막는다.
- production dependency advisory를 호환 버전 업그레이드로 해결한다.
- `.png` 확장자지만 실제 JPEG/WebP인 기존 31개 파일은 자동 변환하지 않고, 먼저 MIME 감지·참조 호환 테스트를 만든 뒤 별도 정리한다.
- Rust format/Clippy 경고와 초기 번들 크기 경고를 마지막에 정리한다.

## 이번 범위에서 하지 않는 일

- 외부 배포, 개발자 인증서 서명·공증, CI/CD
- `contexts/` 폴더 또는 `src-tauri/src/lib.rs` 생성
- `tauri.conf.json`의 plugins 변경
- Gemini 전용 이미지 생성 경로 수정
- 전체 AppContext 또는 Flux 엔진의 불필요한 전면 재작성
- 자동 테스트에서 유료 AI API 반복 호출

## 복구 데이터 보존 규칙

- 모든 단계가 끝나기 전 레거시 원본과 복구 백업을 삭제하지 않는다.
- 데이터 스키마 변경 전 복구 프로젝트 fixture를 별도로 복사한다.
- 저장·마이그레이션 단계는 실패 시 기존 파일을 보존하고 오류를 사용자에게 보여준다.
- 각 단계 완료 뒤 프로젝트 50개·에셋 51개·저장된 대본을 다시 확인한다.

## 완료 결과 — 2026-07-15

이번 복구·로컬 안전화 범위의 P0~P5 구현과 검증을 완료했다.

- 저장 루트는 `~/Documents/DoReMiSsul Studio`로 연결했고 레거시 원본과 복구 백업은 삭제하지 않았다.
- 프로젝트 50개, 872컷, 이미지 이력 334개, 선택 이미지 284개, 프로젝트 이미지 467개, 에셋 51개, 썸네일 342개를 재검사했다.
- 프로젝트 목록 불일치, 중복 ID, 끊어진 이미지·에셋 참조는 모두 0개다.
- 앱 API 키는 `doremissul-studio` Keychain 항목으로 이관했고 `.env`, 셸 설정, 실행 프로세스 환경에는 앱 키를 남기지 않았다.
- Vite는 `127.0.0.1:3000`에서만 수신하며 LAN 주소 접속은 차단된다.
- 프런트 테스트 40개와 Rust 테스트 6개, TypeScript 검사, Vite 빌드, Rust fmt/check/Clippy를 모두 통과했다.
- 전체·운영 의존성 감사 결과 취약점은 0개다.
- 외부 배포, 개발자 인증서 서명·공증, CI/CD, 유료 API 실호출은 수행하지 않았다.
- Codex를 종료해도 열 수 있도록 외장 SSD 안에 로컬 실행용 `.app` 번들을 만들고 ad-hoc 서명 검증을 통과했다. 외부 배포·공증용 서명은 하지 않았다.

### 남은 비차단 항목

- 실제 저장 오디오 파일은 현재 0개라서 오디오 영속화는 자동 fixture 테스트로 검증했다. 이후 실제 TTS 한 컷을 만들 때 앱에서 저장·재실행 확인을 한 번 더 하면 된다.
- 초기 JavaScript 번들은 약 1.55MB로 빌드 경고가 남는다. 로컬 사용과 기능에는 영향이 없으며 추후 화면 단위 코드 분할로 줄일 수 있다.
- 기존 작업 내용과 사용자 파일을 보존하기 위해 이번 변경은 자동 커밋하지 않았다.
