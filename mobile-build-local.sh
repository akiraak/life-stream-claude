#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$IP" ]; then
  IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
if [ -z "$IP" ]; then
  echo "[mobile-build-local] LAN IP を検出できませんでした" >&2
  exit 1
fi

API_URL="http://${IP}:3000"
echo "[mobile-build-local] EXPO_PUBLIC_API_URL=${API_URL}"
EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start "$@"
