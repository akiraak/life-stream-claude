#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"
exec eas submit --platform ios --latest
