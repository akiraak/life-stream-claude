#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"

API_URL="https://basket.chobi.me"
echo "[mobile-build-prod] EXPO_PUBLIC_API_URL=${API_URL}"

# EXPO_PUBLIC_* は babel がビルド時に文字列リテラルとして埋め込み、Metro が
# その変換結果をキャッシュする。前回と URL が違うときだけ --clear を渡す。
LAST_URL_FILE=".expo/.last-api-url"
mkdir -p .expo
LAST_URL=$(cat "$LAST_URL_FILE" 2>/dev/null || true)
EXTRA_ARGS=()
if [ "$LAST_URL" != "$API_URL" ]; then
  echo "[mobile-build-prod] API_URL が変わった (前回: ${LAST_URL:-未設定}) ので --clear を付ける"
  EXTRA_ARGS+=(--clear)
fi
echo "$API_URL" > "$LAST_URL_FILE"

EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start "${EXTRA_ARGS[@]}" "$@"
