# 本番環境のサーバログを外部から安全に見れるようにする

> **注記（2026-04-24）**: 本プランで言及している `basket.chobi.me/admin/`
> （管理画面）は今も配信中だが、ユーザー向け PWA は
> [Web アプリ削除プラン](../web-app-removal.md) によって削除済み。
> 同ドメイン直下は `/about` / `/privacy` / `/admin/` のみ提供する。

## 目的
`basket.chobi.me`（Docker コンテナ `cooking-basket`）上のサーバログを、SSH せずに
外部ブラウザから安全に閲覧できるようにする。本番で異常が起きたときに、その場で
原因調査できる導線を作るのがゴール。

**方針：個人プロジェクトに見合ったシンプルさに留める。外部 SaaS には頼らず、
既存の管理画面（`/admin/`）にログタブを足す形で自己ホスト完結させる。**

## 現状
- ロギングは `console.log` / `console.error` のみ（`server/src/index.ts`,
  `server/src/middleware/error-handler.ts`）
- Docker のデフォルト json-file ドライバに stdout/stderr が流れる
- ログ閲覧は `docker logs cooking-basket`（要 SSH）
- 構造化なし、リクエスト ID なし、機密情報マスクなし
  - Magic Link OTP、JWT、メールアドレスなどが素の文字列でログに載りうる

## 選択肢と比較

### 案 A: 管理画面から自前で tail（本プラン採用）
- pino で JSON Lines を stdout + ファイルに書く
- `/api/admin/logs`（最新 N 件）と `/api/admin/logs/stream`（SSE tail）を追加
- 既存の `requireAuth + requireAdmin` でガード
- 管理画面 `/admin/` に「ログ」タブを追加
- 利点: 外部依存ゼロ、追加コストなし、データは自分のサーバ内
- 欠点: 長期検索・アラートは別途、ファイルローテ管理が必要

### 案 B: 外部 SaaS 集約（BetterStack / Axiom / Grafana Cloud）
- Docker logging driver か pino-transport で送出
- 利点: 横断検索・アラート・保持が堅い
- 欠点: ベンダーロックイン、無料枠の条件管理、個人用途には過剰
- → **将来必要になれば pino-transport を差し込むだけで移行可**（案 A と排他ではない）

## 設計上の原則

1. **機密情報はログに出す前に止める**（出してから consumer 側でマスクするのは手遅れ）
   - pino の `redact` で Authorization / Cookie / `body.password` / `body.otp` /
     `body.token` / `email` をパス指定でマスク
   - Magic Link OTP や JWT を誤ってログ文字列に連結しないよう、
     既存 `console.*` 呼び出しは全て logger に置換する過程で目視確認
2. **認証必須**（既存 admin と同じ）。閲覧はサービスの admin ユーザー限定。
3. **SSE の長時間接続**は nginx / プロキシのタイムアウトに注意
   （必要なら `X-Accel-Buffering: no`、`Cache-Control: no-cache`）。

## フェーズ

### Phase 1: 構造化ロガー導入（redact 必須）
- [x] `server/package.json` に `pino`, `pino-http` を追加
- [x] `server/src/lib/logger.ts` 新規
  - レベル: `LOG_LEVEL` 環境変数（デフォルト `info`）
  - `redact`: `req.headers.authorization`, `req.headers.cookie`,
    `*.password`, `*.otp`, `*.token`, `*.jwt`, `*.email`
  - 本番は JSON、開発は `pino-pretty` 任意
- [x] `server/src/app.ts` に `pino-http` middleware を追加
  - 各リクエストに `x-request-id` 付与、リクエスト／レスポンスをログ
- [x] `server/src/index.ts` と `server/src/middleware/error-handler.ts` の
  `console.*` を logger 呼び出しに置換（`database.ts` / `routes/auth.ts` も同様）
- [x] `npm test` がグリーンであること（`console` スパイを使ってるテストがあれば更新）

### Phase 2: ファイル出力とローテーション
- [x] pino の `transport` で stdout に加えて
  `/app/data/logs/server.log` にも JSON Lines を書く
  - 既存 volume `./data:/app/data` に自動的に永続化される
- [x] ローテーションは `pino-roll`（日次 + 最大 7 ファイル）を採用
  - 別コンテナやホスト側 logrotate には依存させない
- [x] 書き込みディレクトリが無い場合は起動時に `mkdir -p` する
- [x] ローカルで 1 日以上動かす代わりに、手動で日付をまたぐケースの動作を
  ファイル名だけでも確認

### Phase 3: 管理 API の追加
- [x] `server/src/routes/admin.ts` に以下を追加
  - `GET /api/admin/logs?lines=200&level=info&q=keyword`
    → ファイル末尾から逆読みで N 件返す（JSON 配列）
  - `GET /api/admin/logs/stream?level=info`
    → `tail -f` 相当を SSE で push（`fs.watch` + 末尾 read、
    接続時は直近 50 件を先に吐く）
- [x] `server/tests/integration/admin.test.ts` を新規 or 追記
  - 未ログインは 401、非 admin は 403
  - ファイルに書いた行が `/api/admin/logs` で取れる
  - SSE はスモークテスト（接続→1 行受信→切断）

### Phase 4: 管理画面にログタブ
- [ ] `web/admin/index.html` / `web/admin/app.js` に「ログ」タブを追加
  - 表示列: 時刻 / レベル / reqId / メッセージ
  - レベルフィルタ（info / warn / error）とキーワード入力
  - 初期ロードで直近 200 件を取得、以降 SSE で追記
  - 表示行数上限 500、超えたら先頭から切り詰め
  - 接続断時に指数バックオフで自動再接続
- [ ] スマホ画面でも読めるレイアウト（折返し／横スクロール選択可）

### Phase 5: 動作確認
- [ ] ローカル `docker compose up` → `/admin/` のログタブでリアルタイム表示
- [ ] わざとエラーを起こす（例: 不正トークンでリクエスト）→ ログに載る
- [ ] Authorization ヘッダ / OTP / JWT が `[REDACTED]` などに置換されている
- [ ] 本番デプロイ後、PC とスマホのブラウザから `/admin/` ログタブを確認
- [ ] SSE が長時間（10 分以上）切れずに流れること

## 非スコープ（やらないこと）
- 外部 SaaS への送出（将来 pino-transport で追加可能）
- ログベースのアラート通知（別 TODO「サービスの状況をメールで定期報告」側で扱う）
- Docker 他コンテナ（n8n 等）のログ集約
- 30 日以上の長期保管・全文インデックス検索
- 閲覧権限のユーザー別分離（admin 単一で十分）

## 影響ファイル
- `server/package.json`（`pino`, `pino-http`, `pino-roll` 追加）
- `server/src/lib/logger.ts`（新規）
- `server/src/app.ts`（pino-http middleware）
- `server/src/index.ts` / `server/src/middleware/error-handler.ts`（console → logger）
- `server/src/routes/admin.ts`（`/logs`, `/logs/stream` 追加）
- `server/tests/integration/admin.test.ts`（新規 or 追記）
- `web/admin/index.html` / `web/admin/app.js`（ログタブ UI）
- `docker-compose.yml`（既存 volume で十分、変更不要見込み。ログパスのみ確認）

## 運用メモ
- ログファイルは個人情報を含みうるため、ホストの `./data/logs/` のパーミッション
  管理は Docker の uid に依存する。サーバ運用者以外が読めないことを確認する。
- `.gitignore` に `data/logs/` が含まれていることを念のため確認（既存の `data/` が
  あれば OK）。
