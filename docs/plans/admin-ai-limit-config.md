# AI 利用回数の上限を管理画面から設定可能に

## 目的
1 日あたりの AI 呼び出し上限（ログインユーザー / 未ログインゲスト）を、サーバを
再起動せずに `/admin/` の管理画面から変更できるようにする。

現状は `.env` の `AI_LIMIT_USER` / `AI_LIMIT_GUEST` をいじってコンテナを再起動
する必要があり、Gemini の利用が想定外に増えたとき・キャンペーンで一時的に
緩めたいときに対応が遅れる。

## 現状
- `server/src/middleware/rate-limit-ai.ts` がリクエスト毎に
  `Number(process.env.AI_LIMIT_USER || 20)` / `Number(process.env.AI_LIMIT_GUEST || 3)`
  を読み取り、`ai_quota` テーブルの当日カウントと比較している
- 値の変更は `.env` 編集 + コンテナ再起動が必要
- `web/admin/` の「AI 利用状況」タブ（`renderAiQuota()`）は今日の呼出数・日次
  推移・キー別利用を表示するだけで、**上限値そのものはどこにも出ていない**
- 上限に到達したクライアントには `429 ai_quota_exceeded` が返る
  （`server/src/middleware/rate-limit-ai.ts:71`）

## 選択肢と比較

### 案 A: DB の `app_settings` テーブルに保存（本プラン採用）
- 新規テーブル `app_settings (key, value, updated_at)` を作って key-value で持つ
- env (`AI_LIMIT_USER` / `AI_LIMIT_GUEST`) は **DB 値が無いときのフォールバック**
  として残す（既存デプロイの値は壊さない）
- 利点: 永続化される（コンテナ再起動で巻き戻らない）、env も併存できる
- 欠点: テーブルとサービスを 1 つ増やす

### 案 B: env を admin から書き換える
- `.env` を直接編集して `process.env` を更新
- 却下。Docker コンテナの中で `.env` を書き換えても次のデプロイで上書きされ、
  しかもプロセスのメモリ空間を直接いじることになる

### 案 C: メモリのみ（再起動で env 値に戻る）
- 起動時に env から読んでメモリに保持、admin から変更されたらメモリだけ更新
- 利点: 実装が極小
- 欠点: コンテナ再起動 / デプロイで毎回 env の値に戻り、変更がデプロイ毎に
  消える。「再起動せずに変えたい」という目的とミスマッチ。却下

## 設計上の原則
1. **既存 env は壊さない**。DB に値が無ければ env、env も無ければ default
   （user=20 / guest=3）の優先順位。新規環境でも壊れない。
2. **読み込みは O(1)**。リクエスト毎に DB を叩かないよう、プロセス内の単純な
   メモリキャッシュ（モジュールスコープ変数）に持つ。更新時に同プロセス内の
   キャッシュを差し替える。マルチコンテナ運用にはなっていないので、コンテナ
   間伝播は考えない（後述「非スコープ」）。
3. **値は非負整数**。`0` は「AI 機能を実質停止」する設定として有効に扱う
   （UI で警告は出すが、保存は許可）。
4. **書き込みは admin 専用**。`requireAuth + requireAdmin` の下にぶら下げる
   （既存 `/api/admin/*` と同じ）。

## データモデル

### `app_settings` テーブル
```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

使うキー（このプランで導入する分）:
- `ai_limit_user`  … 1 日のログインユーザー上限（整数を文字列で保存）
- `ai_limit_guest` … 1 日のゲスト上限

`value` を TEXT にしておくのは、将来別の設定（文字列・JSON）を同じテーブルに
入れられるようにするため。

### 取得ロジック（疑似コード）
```ts
function getAiLimits(): { user: number; guest: number } {
  if (cache) return cache;
  const dbUser  = readSetting('ai_limit_user');
  const dbGuest = readSetting('ai_limit_guest');
  const user  = parseIntOr(dbUser,  parseIntOr(process.env.AI_LIMIT_USER,  20));
  const guest = parseIntOr(dbGuest, parseIntOr(process.env.AI_LIMIT_GUEST, 3));
  cache = { user, guest };
  return cache;
}
```
更新時は `cache = null` にして次回読み込みで再構築する（あるいは新値で直接
差し替える）。

## フェーズ

### Phase 1: DB & service 層
- [ ] `server/src/database.ts` に `app_settings` テーブルのマイグレーションを追加
- [ ] `server/src/services/settings-service.ts` を新規作成し、以下を提供
  - `getAiLimits(): { user: number; guest: number }`
  - `setAiLimits(values: { user?: number; guest?: number }): { user: number; guest: number }`
  - `readSetting(key) / writeSetting(key, value)` の内部ヘルパ
  - モジュールスコープのキャッシュ + 更新時の invalidate
- [ ] `server/tests/unit/settings-service.test.ts` を新規作成
  - DB 値が無いとき env を読む / env も無いとき default
  - 値を保存すると次回 `getAiLimits()` に反映
  - 不正値（負数 / 非整数文字列 / NaN）を `setAiLimits` で投げると例外
  - 0 は許可

### Phase 2: rate-limit-ai を新サービス経由に切替
- [ ] `server/src/middleware/rate-limit-ai.ts` の env 直読み 2 行を
  `getAiLimits()` 呼び出しに置き換える
- [ ] `server/tests/integration/ai.test.ts` の上限境界テストを、env ではなく
  `setAiLimits()` で値をセットして検証する形に変更
  （env 経由の既存ケースは「DB 未設定 + env 設定」のフォールバック確認として残す）

### Phase 3: admin API
- [ ] `server/src/services/admin-service.ts` の `getAiQuotaStats()` の戻り値に
  `limits: { user: number; guest: number }` を追加（読みだけならここに同居でよい）
- [ ] `server/src/routes/admin.ts` に
  - `PUT /api/admin/ai-limits` を追加
    - body: `{ user?: number, guest?: number }`
    - バリデーション: 整数、0 以上、上限 100000（暴発防止の sanity）
    - 不正なら 400 + `error: 'invalid_ai_limit'`
    - 成功時は `{ user, guest }` を返す
- [ ] `server/tests/integration/admin.test.ts` に以下を追加
  - 非 admin は 403（既存の admin gate を踏むことの確認）
  - 正常更新で値が反映され、続く `GET /api/admin/ai-quota` の `limits` が
    新値になる
  - 負数 / 文字列 / 上限超過 で 400

### Phase 4: 管理画面 UI（`web/admin/`）
- [ ] `web/admin/app.js` `renderAiQuota()` の **先頭に** 上限編集セクションを
  追加
  - 表示: 「ログインユーザー上限 / 日」「ゲスト上限 / 日」の 2 つの number input
  - 「保存」ボタンを押すと `PUT /api/admin/ai-limits` を投げ、トーストで
    「保存しました」/「保存に失敗しました」
  - 0 を入れると下に「※ 0 は AI 機能を実質停止します」の muted 警告
  - 既存の「今日の呼出数」カードのサブ行に「上限 N」も併記する
    （上限と消化数を並べて見られるように）
- [ ] スタイルは既存の `info-section` + `data-table` のトーンに合わせる
  （新規 CSS は最小限）

### Phase 5: 動作確認
- [ ] dev サーバで以下を確認
  - 初回（DB 未設定）に env / default 値が表示される
  - 値を変更 → ページリロードしても保持されている
  - 値を 0 にすると AI 系エンドポイント（例: `/api/ai/...`）が即 429 を返す
  - admin 以外のユーザーで `PUT /api/admin/ai-limits` が 403 になる
- [ ] 本番デプロイ前に `.env` の `AI_LIMIT_USER` / `AI_LIMIT_GUEST` を残した
  ままでも壊れないことを確認（DB に値があれば DB が勝つ）

## 非スコープ（やらないこと）
- 上限の **時間帯別 / 曜日別** 設定（必要になったら別プラン）
- ユーザー個別の上限（プレミアム枠など）
- 上限変更の履歴・監査ログ（`updated_at` だけは持つ）
- 複数コンテナ運用時のキャッシュ伝播（現状シングルコンテナ前提。
  将来マルチ化したら Redis pub/sub か短 TTL に切り替える）
- 上限を「月単位」に変える（現状の日次 JST リセットを踏襲）
- 上限値を超えたときの UX 改善（429 のメッセージ等）

## 影響ファイル
- `server/src/database.ts`（`app_settings` マイグレーション 1 ブロック）
- `server/src/services/settings-service.ts`（新規）
- `server/src/middleware/rate-limit-ai.ts`（env 直読みを置換）
- `server/src/services/admin-service.ts`（`getAiQuotaStats` の戻り値に
  `limits` を追加）
- `server/src/routes/admin.ts`（`PUT /api/admin/ai-limits` を追加）
- `server/tests/unit/settings-service.test.ts`（新規）
- `server/tests/integration/admin.test.ts`（追記）
- `server/tests/integration/ai.test.ts`（境界テストの値投入を env →
  `setAiLimits()` に切替）
- `web/admin/app.js`（`renderAiQuota()` に編集 UI セクションを追加）

## 運用メモ
- DB に値が入った後でも `.env` の `AI_LIMIT_USER` / `AI_LIMIT_GUEST` は
  「DB をリセットしたときのフォールバック」として残しておく。env を消す
  必要はない。
- 値を一時的に緩めて元に戻すときは管理画面でやる。`.env` は触らない。
- もし「DB の値を一旦無視して env 値で動かしたい」フェイルセーフが欲しく
  なったら、`AI_LIMIT_FORCE_FROM_ENV=1` のようなスイッチを後追いで足せば
  よい（このプランには含めない）。
