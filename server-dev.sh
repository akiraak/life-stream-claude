#!/usr/bin/env bash
set -e
SERVER_DIR="$(cd "$(dirname "$0")/server" && pwd)"

# 以前のサーバプロセスが残っていれば落とす。
# 判定基準: 実行ファイルが node 系かつ CWD が $SERVER_DIR 配下。
# → 古い nodemon / ts-node / `node dist/index.js` を拾い、dev-admin など他ディレクトリは素通りする。
find_stale_pids() {
  local pid pid_dir cwd exe
  for pid_dir in /proc/[0-9]*; do
    pid=${pid_dir##*/}
    cwd=$(readlink "$pid_dir/cwd" 2>/dev/null) || continue
    case "$cwd" in
      "$SERVER_DIR"|"$SERVER_DIR"/*) ;;
      *) continue ;;
    esac
    exe=$(readlink "$pid_dir/exe" 2>/dev/null) || continue
    case "$exe" in
      */node|*/nodejs) echo "$pid" ;;
    esac
  done
}

for pid in $(find_stale_pids); do
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | head -c 80)
  echo "[server-dev.sh] killing stale pid=$pid ($cmd)"
  kill "$pid" 2>/dev/null || true
done

sleep 0.3
for pid in $(find_stale_pids); do
  echo "[server-dev.sh] force-killing pid=$pid"
  kill -9 "$pid" 2>/dev/null || true
done

cd "$SERVER_DIR"
exec npm run dev
