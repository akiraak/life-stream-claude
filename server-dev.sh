#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/server"
exec npm run dev
