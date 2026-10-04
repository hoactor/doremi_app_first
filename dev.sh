#!/bin/bash
# DoReMiSsul Studio dev 시작 스크립트
# API 키는 환경변수로 주입하지 않는다. 앱의 macOS Keychain 저장값만 사용한다.

cd "$(dirname "$0")"
exec env \
  -u CLAUDE_API_KEY \
  -u GEMINI_API_KEY \
  -u GOOGLE_API_KEY \
  -u SUPERTONE_API_KEY \
  -u FAL_API_KEY \
  -u OPENAI_API_KEY \
  npm run tauri:dev
