# モバイルアプリのビルドスクリプト整備

## 目的
Expo Go で実機テストするための起動手順と、TestFlight 提出手順を 3 種類のスクリプトに
まとめて誰でも同じ操作で実行できるようにする。

1. **ローカルサーバ接続起動** — LAN 上の `npm run dev` サーバに接続する `expo start`（Metro QR 表示）
2. **本番サーバ接続起動** — `https://basket.chobi.me` に接続する `expo start`（Metro QR 表示）
3. **TestFlight アップロード** — 直近の production EAS ビルドを TestFlight に提出

iOS / Android どちらの Expo Go でも同じ QR で読み込める。

## 背景・経緯
- 当初プランは `eas build` を使う構成だったが、`eas build` はクラウドでネイティブ IPA を
  作るフローで、Metro QR は表示されない（出るのは internal distribution の場合の
  ad-hoc インストール用 QR で、Expo Go では使えない）。
- 想定していたのは Expo Go で QR を読み取って即時起動する運用なので、ローカル / 本番の
  両スクリプトを `npx expo start` ベースに書き換える。
- `mobile/src/config/api-endpoint.ts:1-2` のフォールバックは `https://basket.chobi.me`。
  接続先は `EXPO_PUBLIC_API_URL` で切り替える。
- `EXPO_PUBLIC_API_URL` はシェル環境変数が `mobile/.env` より優先されるため、スクリプトから
  環境変数として渡せば `mobile/.env` を書き換えずに済む。
- TestFlight 提出は Expo Go では行えないので、引き続き `eas submit` を使う独立スクリプトを残す。

## 実装方針
- スクリプトはプロジェクトルートに置く（既存 `server-dev.sh` / `dev-admin.sh` と同じパターン）。
- 各スクリプトは `cd "$(dirname "$0")/mobile"` の後に `npx expo start` を起動する。
- ローカル IP は **自動検出**（Linux: `hostname -I` の先頭 / macOS: `ipconfig getifaddr en0|en1`）。
  検出できなければエラー終了。
- 本番接続スクリプトは固定値 `https://basket.chobi.me` を渡す。
- `mobile/.env` と `mobile/eas.json` は触らない。シェル環境変数の優先で上書きする。
- 追加引数はそのまま `expo start` に転送する（`"$@"`）。例: `./mobile-build-local.sh --tunnel`。
- Android 専用スクリプトは作らない（同じ QR で Android Expo Go も動く）。

## スクリプト構成

### `/home/ubuntu/cooking-basket/mobile-build-local.sh`（新規）
LAN IP を自動検出して Expo Go 向け Metro QR を表示する。

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"

# LAN IP 自動検出（Linux: hostname -I / macOS: ipconfig getifaddr en0|en1）
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
```

### `/home/ubuntu/cooking-basket/mobile-build-prod.sh`（新規）
本番サーバ接続の Expo Go 向け Metro QR を表示する。

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"

API_URL="https://basket.chobi.me"
echo "[mobile-build-prod] EXPO_PUBLIC_API_URL=${API_URL}"
EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start "$@"
```

### `/home/ubuntu/cooking-basket/mobile-submit-testflight.sh`（新規）
直近の production EAS ビルドを TestFlight に提出。

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/mobile"
exec eas submit --platform ios --latest
```

注: production ビルド自体は別途 `cd mobile && eas build --profile production --platform ios` で取得する。

### `mobile/eas.json` の修正
- `preview` / `development` プロファイルは Expo Go 運用では使わないため、env なしのまま
  とし、`EXPO_PUBLIC_API_URL` プレースホルダを書かない（誤って `eas build --profile preview`
  を直叩きしても `https://basket.chobi.me` フォールバックが効くだけにしておく）。
- `production` / `submit` 設定はそのまま。

## 使い方

```bash
# 自宅 LAN のサーバに接続する Expo Go 起動（QR 表示）
./mobile-build-local.sh

# 本番サーバ接続の Expo Go 起動（QR 表示）
./mobile-build-prod.sh

# 直近の production ビルドを TestFlight にアップロード
./mobile-submit-testflight.sh
```

LAN の device discovery が不安定なときは `--tunnel` を付けて ngrok 経由で起動する
（`"$@"` で `expo start` に透過渡しされる）。詳細は
[mobile-tunnel-toggle.md](../mobile-tunnel-toggle.md) 参照。

```bash
./mobile-build-local.sh --tunnel              # tunnel 経由
./mobile-build-local.sh --tunnel --port 8088  # 追加引数と併用
./mobile-build-prod.sh --tunnel               # prod 接続でも同様
```

## 影響ファイル
- `mobile-build-local.sh`（新規、実行権限付き）
- `mobile-build-prod.sh`（新規、実行権限付き）
- `mobile-submit-testflight.sh`（新規、実行権限付き）
- `mobile/eas.json`（preview/development の env プレースホルダ削除）
- `README.md`（使い方を 1 段落追記）

## 非スコープ（やらないこと）
- iOS シミュレータでのビルド・起動
- Android 用個別スクリプト / Google Play 提出スクリプト
- App Store 本提出（`mobile-submit-testflight.sh` までで止める）
- production EAS ビルド + 自動 submit ワンショット
- バージョン番号の自動更新（`production.autoIncrement: true` で EAS 側に任せる）
- CI への統合
- `expo prebuild` まわり（managed workflow のまま）

## テスト方針
- **ユニットテスト**: シェルスクリプトなので追加なし。
- **動作確認**:
  1. `./mobile-build-local.sh` を実行し、CLI に LAN IP の URL と Metro QR が表示されること
  2. Expo Go で QR を読み取り、`http://<lan-ip>:3000` の `npm run dev` サーバに到達できること
  3. `./mobile-build-prod.sh` を実行し、`https://basket.chobi.me` 接続の Metro QR が出ること
  4. `./mobile-submit-testflight.sh` で直近 production ビルドが TestFlight にアップされること
  5. 起動・終了時に `git status` で `mobile/.env` `mobile/eas.json` ともに差分が残らないこと

## フェーズ

### Phase 1: スクリプト追加と eas.json 整理
- [ ] `mobile-build-local.sh` を `expo start` ベースで作成し `chmod +x`
- [ ] `mobile-build-prod.sh` を `expo start` ベースで作成し `chmod +x`
- [ ] `mobile-submit-testflight.sh` を作成し `chmod +x`
- [ ] `mobile/eas.json` から preview/development の `EXPO_PUBLIC_API_URL` プレースホルダを削除

### Phase 2: 動作確認
- [x] `./mobile-build-local.sh` で LAN サーバに Expo Go で接続できること
- [x] `./mobile-build-prod.sh` で本番サーバに Expo Go で接続できること
- [x] `./mobile-submit-testflight.sh` で TestFlight に提出できること

### Phase 3: ドキュメント
- [x] README に 3 つのスクリプトの使い方を追記
