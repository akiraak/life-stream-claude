#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"

# デフォルトルート（インターネット向け）の送信元 IP を取る。
# hostname -I の先頭は WSL2 の NAT IP (10.5.0.x) になりやすく、スマホからは到達できないため。
IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") print $(i+1)}')
if [ -z "$IP" ]; then
  IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
if [ -z "$IP" ]; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$IP" ]; then
  echo "[mobile-build-local] LAN IP を検出できませんでした" >&2
  exit 1
fi

API_URL="http://${IP}:3000"
echo "[mobile-build-local] EXPO_PUBLIC_API_URL=${API_URL}"

# EXPO_PUBLIC_* は babel がビルド時に文字列リテラルとして埋め込み、Metro が
# その変換結果をキャッシュする。前回と URL が違うときだけ --clear を渡す。
LAST_URL_FILE=".expo/.last-api-url"
mkdir -p .expo
LAST_URL=$(cat "$LAST_URL_FILE" 2>/dev/null || true)
EXTRA_ARGS=()
if [ "$LAST_URL" != "$API_URL" ]; then
  echo "[mobile-build-local] API_URL が変わった (前回: ${LAST_URL:-未設定}) ので --clear を付ける"
  EXTRA_ARGS+=(--clear)
fi
echo "$API_URL" > "$LAST_URL_FILE"

EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start "${EXTRA_ARGS[@]}" "$@"
