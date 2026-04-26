#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"

API_URL="https://basket.chobi.me"
echo "[mobile-build-prod] EXPO_PUBLIC_API_URL=${API_URL}"
EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start "$@"
