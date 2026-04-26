# モバイルスクリプトの tunnel 切り替えオプション

## 目的
`mobile-build-local.sh` / `mobile-build-prod.sh` で `--tunnel` を毎回スクリプトを編集せずに
ON/OFF できるようにする。

## 背景
- 現状は両スクリプトに `--tunnel` をハードコード
- `--tunnel` は Metro 接続を ngrok 経由に切り替えるため、LAN の device discovery が
  不安定なときに有用
- 一方で
  - 初回 ngrok セットアップで起動が遅い
  - 安定 LAN では不要
  - ngrok 側の障害に引きずられる
  ので、常時 ON は重い
- スクリプトはすでに `"$@"` で追加引数を `expo start` に透過渡ししているので、
  ハードコードを外すだけでユーザ側からフラグ指定できる
- `EXPO_PUBLIC_API_URL` 自体は LAN IP / 本番 URL のままでよい（tunnel は Metro 接続のみに効く）

## 採用案: ハードコード削除 + `"$@"` 透過渡し
両スクリプトの末尾を以下に変更する（`--tunnel` を外す）。

```bash
EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start "$@"
```

使い方:
```bash
./mobile-build-local.sh                       # tunnel なし（既定・速い）
./mobile-build-local.sh --tunnel              # tunnel あり
./mobile-build-local.sh --tunnel --port 8088  # tunnel + 追加引数
./mobile-build-prod.sh --tunnel               # prod 接続でも同様
```

メリット:
- 環境変数を新設しない（覚えるものが増えない）
- `expo start` 標準フラグそのままなので Expo ドキュメントがそのまま読める
- スクリプトを変更しないユーザは挙動が「速くなる方向」に変わるだけ
- 追加引数（`--port` 等）と自然に併用できる

却下案:
- **環境変数 `MOBILE_TUNNEL=1`**: 透過渡しで足りるので不要
- **スクリプト分割（`*-tunnel.sh`）**: ファイル数倍増で割に合わない

## 影響ファイル
- `mobile-build-local.sh`（`--tunnel` 削除）
- `mobile-build-prod.sh`（`--tunnel` 削除）
- `docs/plans/mobile-build-scripts.md`（tunnel の渡し方を追記）

> README は今のところモバイルスクリプトに触れていないので追記対象外。

## テスト方針
シェルスクリプトのため自動テストなし。手動確認:

1. `./mobile-build-local.sh` 実行 → Metro が LAN 接続で立ち上がる（ngrok URL 出ない）
2. `./mobile-build-local.sh --tunnel` 実行 → ngrok tunnel URL が表示される
3. `./mobile-build-local.sh --tunnel --port 8088` で tunnel + 8088 が両方効く
4. `./mobile-build-prod.sh` / `./mobile-build-prod.sh --tunnel` も同様
5. `git status` で `mobile/.env` `mobile/eas.json` に差分が出ない

## 非スコープ
- `mobile-submit-testflight.sh` への適用（tunnel 関係なし）
- `mobile/eas.json` の変更
- CI 連携
- `EXPO_PUBLIC_API_URL` の追加切り替えオプション

## フェーズ

### Phase 1: スクリプト改修
- [x] `mobile-build-local.sh` の `--tunnel` を削除
- [x] `mobile-build-prod.sh` の `--tunnel` を削除
- [x] 動作確認（OFF / `--tunnel` / `--tunnel --port`）

### Phase 2: ドキュメント
- [x] `docs/plans/mobile-build-scripts.md` に tunnel の渡し方を追記
