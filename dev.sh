#!/bin/bash
# DoReMiSsul Studio dev 시작 스크립트
# 환경변수 키 주입 → keychain 다이얼로그 우회

set -a  # export all subsequent vars
source ~/.zshrc 2>/dev/null
set +a

if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY 미설정 — ~/.zshrc 확인 필요"
    exit 1
fi

echo "✅ OPENAI_API_KEY loaded (length: ${#OPENAI_API_KEY})"
[ -n "$CLAUDE_API_KEY" ]    && echo "✅ CLAUDE_API_KEY (env)"
[ -n "$GEMINI_API_KEY" ]    && echo "✅ GEMINI_API_KEY (env)"
[ -n "$SUPERTONE_API_KEY" ] && echo "✅ SUPERTONE_API_KEY (env)"
[ -n "$FAL_API_KEY" ]       && echo "✅ FAL_API_KEY (env)"

cd "$(dirname "$0")"
exec npm run tauri:dev
