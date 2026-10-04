<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# DoReMiSsul Studio 로컬 실행

Mac 한 대에서 사용하는 로컬 Tauri 앱입니다. 외부 배포용 설정은 포함하지 않습니다.

## Run Locally

**Prerequisites:** Node.js, Rust


1. Install dependencies:
   `npm install`
2. Run the desktop app:
   `npm run tauri:dev`
3. 앱의 "API 키 설정" 화면에서 키를 입력합니다. 키는 macOS Keychain에만 저장됩니다.

`.env` 또는 `.env.local` 파일에는 API 키를 넣지 마세요. 브라우저 단독 모드에서는 유료 AI API를 호출하지 않습니다.
