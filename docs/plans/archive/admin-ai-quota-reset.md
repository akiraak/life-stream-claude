# AI 呼び出し回数を管理画面から初期化可能に

## 目的
1 日あたりの AI 呼び出し**消化数**（ログインユーザー / 未ログインゲスト）を、
サーバを再起動せずに `/admin/` の管理画面から **0 にリセット**できるようにする。

現状は `ai_quota` テーブルに (key, date, count) で消化数が積まれており、
JST 翌 0:00 まで自動リセットされない。
そのため、

- 上限を一時的に緩めても、既に当日の消化数が上限に達しているキーはリセットを
  待たないと AI 呼び出しを再開できない
- テスト・デモ・障害対応で「特定ユーザーだけ枠を戻したい」「全体の今日の消化を
  ゼロから始めたい」というニーズに即応できない

を解消する。`AI_LIMIT_USER` / `AI_LIMIT_GUEST` の値を変える（実装済み:
[admin-ai-limit-config](archive/admin-ai-limit-config.md)）のとは独立した、
**消化済みカウンタの初期化**機能を追加する。

## 現状

### 消化数の記録（`server/src/middleware/rate-limit-ai.ts`）
- リクエスト毎に `key` を組み立て（ログイン時 `user:<userId>`、ゲスト時
  `device:<sha256(deviceId+secret)>`）、`date` は JST の `YYYY-MM-DD`
- `ai_quota (key, date, count)` を UPSERT してインクリメント
- `count >= getAiLimits().{user|guest}` で 429 `ai_quota_exceeded`
- リセットは「JST の日付が変わって新しい `date` 行になる」ことに依存（旧行は
  単に参照されなくなるだけで物理削除はされない）

### 管理画面（`web/admin/app.js` `renderAiQuota()`）
- 「1 日あたりの AI 呼出上限」編集セクション（実装済み）
- 「今日の呼出数」「ログイン利用」「ゲスト利用」カード
- 「日次推移（直近 14 日）」テーブル
- 「キー単位の直近利用」テーブル（`recent` 配列、日付降順 200 件）
- **リセット用の UI は存在しない**

### 管理 API（`server/src/routes/admin.ts` / `services/admin-service.ts`）
- `GET /api/admin/ai-quota` … `getAiQuotaStats()` の `today / todaySummary /
  daily / recent / limits` を返す
- `PUT /api/admin/ai-limits` … 上限値を保存
- **消化数を変更する API は存在しない**

### 認可
- すべての admin ルートは `requireAuth + requireAdmin` 配下（既存の
  `/api/admin/*` ルータと同じガード）

## 選択肢と比較

### 案 A: スコープ別（user / guest / 全体 / 単一キー）の消化リセット API（採用）
- `POST /api/admin/ai-quota/reset` を 1 本追加し、body のフィールドで
  スコープを切り替える
  - `{ scope: 'user' }`  … 今日の `key LIKE 'user:%'` を削除
  - `{ scope: 'guest' }` … 今日の `key LIKE 'device:%'` を削除
  - `{ scope: 'all' }`   … 今日の `ai_quota` 行をすべて削除
  - `{ scope: 'key', key: 'user:42' }` … 単一キーの今日の行のみ削除
- 「日付」は明示しない（常に今日 JST）。過去日のリセットは非スコープ
- 利点: 1 本のエンドポイントに集約でき、UI も「ボタン + 確認ダイアログ」で
  実装できる
- 欠点: body の形が分岐する。ただし他の admin API（例えば
  `PUT /api/admin/ai-limits` の partial update）と同じ温度感

### 案 B: スコープ別のエンドポイントを分ける
- `DELETE /api/admin/ai-quota/today/users`
- `DELETE /api/admin/ai-quota/today/guests`
- `DELETE /api/admin/ai-quota/today`
- `DELETE /api/admin/ai-quota/today/key/:key`
- 利点: REST 的に綺麗
- 欠点: 4 本に分かれて追加・テスト・admin UI 配線が増える。`:key`
  にハッシュ文字列やコロンが入るのも扱いづらい。却下

### 案 C: 「消化数を任意の値に書き換える」 PUT
- `PUT /api/admin/ai-quota` で `{ key, date, count }` を直接更新できる
- 利点: 柔軟（増やしたり減らしたり）
- 欠点: 管理画面から要求されているのは「初期化」だけで、過剰機能。任意値は
  デバッグ用にしかならず、誤操作の余地が増える。却下

## 設計上の原則
1. **対象は「今日 JST の行」だけ**。過去日の `ai_quota` を消すと「日次推移」
   グラフが穴あきになり、過去の消化量が分からなくなる。リセットの目的は
   「現在の上限到達状態を解除する」ことなので、当日に絞れば十分。
2. **物理削除する**（`UPDATE count = 0` ではない）。`rateLimitAi` は
   `SELECT count FROM ai_quota WHERE key = ? AND date = ?` の有無を見て
   `currentCount = existing?.count ?? 0` にしているので、行を削除しても
   次のリクエストで再 INSERT され、count = 1 から積み直される。`count = 0` の
   行が残っていても支障はないが、削除のほうが「ゼロから始める」状態が直感的で、
   `unique_keys` カウントなどの集計とも整合する。
3. **スコープは `user` / `guest` / `all` / `key` の 4 種**。それ以上の細分化
   （メールアドレスでフィルタ等）は非スコープ。
4. **冪等性**。同じスコープを 2 回叩いても 200 を返す（2 回目は 0 件削除）。
   レスポンスに削除件数を含めて、UI から「N 件リセットしました」を出せる
   ようにする。
5. **キャッシュの考慮は不要**。`ai_quota` はキャッシュされていない（毎回
   DB の `SELECT count` を実行している）ので、admin の DELETE が
   即時反映される。`settings-service` の `aiLimitsCache` には触らない。
6. **監査は `updated_at` 等で持たない**。実行時刻のロギングは
   `pino` の `info` ログで十分（`logs` タブから後追いできる）。専用テーブルや
   履歴 API は作らない。
7. **書き込みは admin 専用**。`requireAuth + requireAdmin` の下にぶら下げる
   （`/api/admin/*` は既にこのガードで囲われている）。

## API 設計

### `POST /api/admin/ai-quota/reset`
リクエスト:
```json
{ "scope": "user" | "guest" | "all" | "key", "key"?: string }
```

- `scope` が `'key'` のときのみ `key` 必須。それ以外で `key` を渡すと無視
  （400 にはしない）
- `scope` が無効値、または `scope='key'` で `key` 未指定/空文字列なら
  400 + `error: 'invalid_scope'`
- `key` の形式チェックは `/^(user:\d+|device:[0-9a-f]{64})$/` 程度の緩い
  ものに留める（厳密に validate しても実害が無いので、`startsWith` の
  ほぼ素通しでよい）

レスポンス:
```json
{ "success": true, "data": { "scope": "user", "deleted": 7 }, "error": null }
```

ステータスコード:
- 200: 成功（削除 0 件でも 200）
- 400: `invalid_scope` / `key` 形式不正
- 401 / 403: 認証 / 認可で既存ガードに従う

## データベース変更
- **無し**。`ai_quota` テーブルへの `DELETE` のみ。インデックス変更も不要
  （`PRIMARY KEY (key, date)` で十分絞り込める）。

## フェーズ

### Phase 1: service 層
- [ ] `server/src/services/admin-service.ts` に
  `resetAiQuota(scope, options?)` を追加
  - 引数: `scope: 'user' | 'guest' | 'all' | 'key'`,
    `options?: { key?: string }`
  - 戻り値: `{ scope, deleted: number }`（`run().changes` を返す）
  - SQL:
    - `'user'`  → `DELETE FROM ai_quota WHERE date = ? AND key LIKE 'user:%'`
    - `'guest'` → `DELETE FROM ai_quota WHERE date = ? AND key LIKE 'device:%'`
    - `'all'`   → `DELETE FROM ai_quota WHERE date = ?`
    - `'key'`   → `DELETE FROM ai_quota WHERE date = ? AND key = ?`
  - JST 当日の日付計算は既存 `getJstDate()` を再利用（同ファイル内に
    既にある private 関数。`export` するか同等関数を共有モジュールに
    出すかは実装時に判断）
  - 不正 scope は `Error('invalid_scope')` を投げる
- [ ] `server/tests/unit/admin-service.test.ts` にユニットテスト追加
  - 事前に `ai_quota` に `user:1 / 2026-04-24 / 5`, `device:abc / 2026-04-24 / 2`,
    `user:1 / 2026-04-23 / 9`（昨日の行）を仕込む
  - `resetAiQuota('user')` が今日の `user:%` だけを消す（`user:1 / 今日`、
    `user:1 / 昨日` は残る、`device:%` も残る）。`deleted: 1` を返す
  - `resetAiQuota('guest')` が `device:%` のみ消す
  - `resetAiQuota('all')` が今日の全行を消す（昨日の行は残す）
  - `resetAiQuota('key', { key: 'user:1' })` が指定キーの今日の行のみ消す
  - 不正 scope で例外
  - `'key'` で `key` 未指定なら例外

### Phase 2: admin API
- [ ] `server/src/routes/admin.ts` に
  `POST /api/admin/ai-quota/reset` を追加
  - body 検証（`scope` の enum チェック、`key` 必須/形式）
  - `resetAiQuota` 呼び出し → `{ success: true, data: { scope, deleted } }`
  - 不正 → 400 + `error: 'invalid_scope'`
- [ ] `server/tests/integration/admin.test.ts` に追加
  - 401（未認証）、403（非 admin）
  - `POST` で `scope='all'` を叩いた直後に `GET /api/admin/ai-quota` の
    `todaySummary.total_calls` が 0 になる（事前に `ai_quota` に行を仕込む）
  - `scope='user'` でゲストの行が残る、`scope='guest'` で逆
  - `scope='key'` で 1 行だけ消える
  - `scope='unknown'` で 400 + `invalid_scope`
  - `scope='key'` で `key` 未指定なら 400 + `invalid_scope`
  - `scope='key'` で形式不正（`'foo'`）なら 400
  - 既に空でも 200 + `deleted: 0`（冪等性）

### Phase 3: 管理画面 UI（`web/admin/app.js` `renderAiQuota()`）
- [ ] 既存の「1 日あたりの AI 呼出上限」セクションの**直下** or
  「今日の呼出数」カード群の**直後** に「今日の消化数をリセット」
  セクションを追加
  - ボタン 3 つ:「ログインユーザー分をリセット」「ゲスト分をリセット」
    「すべてリセット」
  - 各ボタンは `confirm()` で「今日の AI 呼び出し回数を 0 に戻します。
    よろしいですか？」を表示し、OK なら `POST /api/admin/ai-quota/reset`
  - 完了後 `showToast('N 件リセットしました')` + `renderAiQuota()` で再描画
  - 失敗時は `showToast('リセットに失敗しました', 'error')`
- [ ] 「キー単位の直近利用」テーブルに「リセット」列（or 行アクション）を追加
  - 各行に小さな「今日分リセット」ボタン
  - 押下時: `confirm` → `POST … { scope: 'key', key: row.key }`
  - 過去日（`row.date !== today`）の行はボタンを隠す or disable
    （API 側で当日しか消せないため UI で明示する）
- [ ] スタイルは既存の `btn` クラスを流用、新規 CSS は最小限に留める

### Phase 4: 動作確認
- [ ] dev サーバ + admin ログインで:
  - 自分のアカウントで AI 呼び出しを 1〜2 回行う → `ai-quota` ページの
    「ログイン利用」が増えることを確認
  - 「ログインユーザー分をリセット」を押す → カードが 0 に戻り、
    トーストに「1 件リセットしました」等が出る
  - 上限を 1 に下げて 2 回目の AI 呼び出しが 429 になることを確認 →
    リセット後に再度叩けることを確認
  - 「キー単位の直近利用」のリセットボタンで該当行だけ消える
- [ ] `npm test` が server 側で通る
- [ ] 過去日のグラフ（`daily`）に穴が空かない（リセット後も `daily` で
  過去 14 日が表示される）

## 非スコープ（やらないこと）
- 過去日の `ai_quota` 行のリセット / 削除（日次推移を保つため）
- 上限値の編集（既に [admin-ai-limit-config](archive/admin-ai-limit-config.md)
  で実装済み）
- ユーザー個別の上限設定や、リセット履歴の監査ログ専用テーブル
- 全期間（all dates）の `ai_quota` 一括クリア（実質 `daily` グラフを
  破壊する操作なので意図的に提供しない。必要になったら別プラン）
- モバイルクライアント側からのリセット（admin 専用機能）
- リセット直後に 429 を返している進行中の重複リクエストへの即時通知
  （クライアントは 429 のメッセージを既に持っており、ユーザーが再操作
  すれば通る）
- マルチコンテナ運用時の他コンテナへの伝播（`ai_quota` は DB に直接
  書くので問題ないが、`settings-service` のメモリキャッシュ伝播は
  今回も対象外）

## 影響ファイル

### 変更
- `server/src/services/admin-service.ts`（`resetAiQuota` 追加）
- `server/src/routes/admin.ts`（`POST /api/admin/ai-quota/reset` 追加）
- `web/admin/app.js`（`renderAiQuota()` にリセット UI とハンドラ追加）

### 追加
- なし（既存テストファイルへの追記のみ）

### テスト
- `server/tests/unit/admin-service.test.ts`（`resetAiQuota` のユニットテスト）
- `server/tests/integration/admin.test.ts`（`POST /api/admin/ai-quota/reset`
  の統合テスト）

## 運用メモ
- リセット操作は「上限到達でハマったキーの救済」「障害時の状態クリア」
  「デモ前のクリーンアップ」の 3 用途を想定。日常運用での頻発は想定しない
- リセット後も `ai_quota` の行が再び積まれていくので、`daily` グラフは
  「リセット時点までの消化分は集計から消えるが、その後の積み上げで
  穴あきにはならない」挙動になる
- 監査が必要になったら、`logger.info({ scope, deleted, adminUserId },
  'ai_quota_reset')` のログから後追いできる（`logs` タブで `q=ai_quota_reset`
  でフィルタ）
