#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"

# 優先順位:
#  1. MOBILE_API_HOST 環境変数（手動上書き）
#  2. デフォルトルートの送信元 IP（WSL2 NAT の 10.5.x.x は除外）
#  3. global scope のインタフェースから docker/lo/WSL NAT を除いた先頭 IP
#  4. macOS の en0/en1
#  5. hostname -I の先頭
# WSL2 ミラードモードでは ip route の src がスマホ不可達な 10.5.x.x を返すため、
# 自動検出ではこのレンジを必ず除外する。
is_unreachable_for_phone() {
  case "$1" in
    10.5.*) return 0 ;;  # WSL2 NAT
    *) return 1 ;;
  esac
}

IP="${MOBILE_API_HOST:-}"

if [ -z "$IP" ]; then
  CANDIDATE=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") print $(i+1)}')
  if [ -n "$CANDIDATE" ] && ! is_unreachable_for_phone "$CANDIDATE"; then
    IP="$CANDIDATE"
  fi
fi

if [ -z "$IP" ]; then
  while read -r ifname addr; do
    case "$ifname" in
      lo|docker*|br-*|veth*) continue ;;
    esac
    if is_unreachable_for_phone "$addr"; then continue; fi
    IP="$addr"
    break
  done < <(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4, a, "/"); print $2, a[1]}')
fi

if [ -z "$IP" ]; then
  IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
if [ -z "$IP" ]; then
  IP=$(hostname -I 2>/dev/null | tr ' ' '\n' | while read -r addr; do
    [ -n "$addr" ] || continue
    is_unreachable_for_phone "$addr" && continue
    echo "$addr"; break
  done)
fi
if [ -z "$IP" ]; then
  echo "[mobile-build-local] LAN IP を検出できませんでした。MOBILE_API_HOST=<IP> で指定してください" >&2
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
