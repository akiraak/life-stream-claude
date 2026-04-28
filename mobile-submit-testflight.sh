#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"

submit=1
args=()
for arg in "$@"; do
  case "$arg" in
    --no-submit|--build-only)
      submit=0
      ;;
    *)
      args+=("$arg")
      ;;
  esac
done

if [ "$submit" -eq 1 ]; then
  exec eas build --profile production --platform ios --auto-submit "${args[@]}"
else
  exec eas build --profile production --platform ios "${args[@]}"
fi
