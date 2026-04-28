# ログインデータ移行で「request entity too large」が出る件の修正プラン

## 目的・背景

ローカル（未ログイン）で長期間使ってデータを溜めたユーザーがログインすると、
`runLoginMigration` から `POST /api/migrate` にローカルの items / dishes / savedRecipes を
丸ごと送信する。送信ボディが Express デフォルト上限（100KB）を超えると body-parser が
`PayloadTooLargeError` を投げ、サーバの `errorHandler` 経由で
`{ success: false, error: 'request entity too large' }`（ステータスは 500）が返る。
モバイル側 axios interceptor が `response.data.error` を `error.message` に詰めるので、
最終的に `Alert.alert('エラー', 'request entity too large')` という英語の生メッセージが
ユーザーに見えてしまう。

ローカルに保存される `dishes.recipes_json` / `dishes.ingredients_json` / 
`saved_recipes.steps_json` は、Gemini が返したレシピ本文（手順テキスト数百〜千文字 × 複数）を
そのまま JSON として持つので、料理 / レシピが数十件レベルになると 100KB は容易に超える。

このプランは多角的に再検証した上で、以下の三段構えに整理する。

1. `/api/migrate` のボディ上限を実用範囲（10MB）まで引き上げる
2. 汎用 `errorHandler` を `err.status` / `err.expose` 対応に直し、
   migrate ルートでは日本語メッセージで 413 を返す
3. モバイル側で 413 / タイムアウトを区別し、
   「破棄してログイン続行」「再試行」を選べるリカバリ動線を出す

チャンク分割・ローカル保存件数キャップは引き続き「将来の拡張」に置く。

## 関連ファイル

- `server/src/app.ts` — 27 行目で `express.json()` をデフォルト上限のまま使っている
- `server/src/middleware/error-handler.ts` — 常に 500 で返す。`err.status` / `err.expose` 未対応
- `server/src/routes/migrate.ts` — `/api/migrate` のルーター
- `server/src/services/migrate-service.ts` — `db.transaction(...)` で同期一括 INSERT
- `server/tests/integration/migrate.test.ts` — 既存の supertest スイート
- `server/tests/integration/error-handler.test.ts` — errorHandler のフォールバック挙動
- `server/tests/helpers/app.ts` — テスト用 `createApp` ヘルパ（DI 拡張の入口）
- `mobile/src/utils/migration.ts` — 116 行目で `Alert.alert('エラー', message)` に
  サーバ生メッセージをそのまま流す
- `mobile/src/api/client.ts` — 9 行目 `timeout: 30000`（全 API 共通）。
  33–36 行目で `error.response.data.error` を `error.message` に上書きする interceptor
- `mobile/src/api/migrate.ts` — `request('post', '/api/migrate', payload)` 単体で
  timeout を上書きできる

## 多角的レビュー（着手前の前提整理）

### a) errorHandler は migrate 局所修正だけでは片付かない

`error-handler.ts` は `res.status(500)` 固定 / `err.message` をそのまま流用する設計。
これは migrate に限らないバグで、`error-handler.test.ts:24` は内部 Error の message
（`'boom'`）が無加工で client に漏れることを意図せず保証してしまっている。
`http-errors` 系の `err.status` / `err.expose` を尊重する形に汎用化するのが筋。

`server/src/routes/` / `server/src/middleware/` を grep した結果、`Error.status` を
意図的に付けて throw している箇所は無い（`admin.ts` の `throw err` は再 throw のみ）。
汎用化しても波及リスクは低い。

### b) クライアント側 30 秒 timeout と大ペイロードの相性

`client.ts:9` の `timeout: 30000` は全 API 共通。10MB を 3G/弱回線でアップロードすると
30 秒では切れる可能性が高い。「413」より「タイムアウトで不可解に失敗」のほうが
頻度が高くなり得るので、migrate だけ timeout を緩める必要がある。

### c) 失敗時のリカバリ動線がゼロ

現状、`runLoginMigration` 失敗時は `'cancelled'` を返してログインを巻き戻す。
ユーザーから見ると「ログイン取り消し → 再ログイン → また失敗 → 最終的に破棄するしかない」
という袋小路。413 / タイムアウト時に「破棄して続行」「再試行」を選べる UX が必要。

### d) `better-sqlite3` 同期トランザクションのイベントループブロック

`migrate-service.ts:60-114` は同期 transaction なので、10MB / 数千件を 1 回で流す間
他リクエストが完全に止まる。即座の運用問題ではないが、将来 chunked insert に
切り替える余地として「将来の拡張」に明記しておく。

### e) インフラ前段（Cloudflare）の上限

本番は Cloudflare Access 経由（[admin-auth-cloudflare.md](admin-auth-cloudflare.md)）。
Cloudflare のリクエストボディ上限は Free/Pro でも 100MB。10MB は十分内側で問題なし。

### f) ログ汚染リスク

`pinoHttp` は req.body をデフォルトで吐かない。`errorHandler` の `reqLogger.error({ err })`
は `PayloadTooLargeError` の `length` / `limit` / `type` 程度しか巻き込まない。
ペイロード本体がログに乗ることは無い。

### g) DoS / レート制限

`/api/migrate` は `requireAuth` 通過後なので未認証 DoS は無い。認証ユーザーが
10MB を連投する DoS は理論上残るが、本サービスは個人利用前提・他 API も同様に
個別レート制限は無い方針なので **今回は対象外**。プランに明記して line を引く。

### h) ペイロード自体の縮小（採用しない）

`dishes.recipes_json` と `saved_recipes.steps_json` の中身は重複しがちで、
正規化（localId 参照化）すれば 30〜50% 削減できる可能性がある。ただし API スキーマ
変更でモバイル両対応が必要になり、10MB 引き上げより工数が大きい。**採用しない**が、
「将来の拡張」に置く。

## 対応方針

### Phase 1 — サーバ: `/api/migrate` のボディ上限を 10MB に引き上げる + DI 化

- `app.ts` のグローバル `express.json()` はデフォルト 100KB のままにし、
  `/api/migrate` のルートだけで `express.json({ limit: '10mb' })` を併用する。
  - 全 API を 10MB に上げると DoS 面が広がるため、必要なルートだけスコープする
  - `app.use('/api/migrate', requireAuth, express.json({ limit: '10mb' }), migrateRouter)`
    のようにルート単位ミドルウェアを足す
- 上限値は **テスト容易性のため `createApp` のオプションで上書き可能にする**。
  - `createApp({ migrateBodyLimit?: string })`、デフォルト `'10mb'`
  - `tests/helpers/app.ts` でテスト時は `'10kb'` を渡せるようにする
  - これで「11MB ダミーボディ」を毎回作らずに 413 挙動を検証できる
- 10MB は恣意的な数字だが、`saved_recipes.steps_json` を 1 件 5KB と仮定して 2,000 件を
  受け切れる規模感。普通の利用範囲は 1MB を超えないはずなのでヘッドルームとして十分

### Phase 2 — サーバ: errorHandler を汎用化 + migrate で日本語化

着手前に再度 grep で `err.status` / `err.statusCode` を意図的に付けて throw している
箇所が無いことを確認する（現時点では無いことを確認済み）。

#### 2a. 汎用 `errorHandler` の `err.status` / `err.expose` 対応

- `status = err.status ?? err.statusCode ?? 500` を使う
- メッセージ露出は `http-errors` 互換ルールに合わせる:
  - `err.expose === true`（4xx 由来）→ `err.message` をそのまま返す
  - それ以外（500 系・素の Error）→ メッセージを `'Internal Server Error'` に塗り潰す
- 既存の `error-handler.test.ts` は「内部 Error の message が漏れる」挙動を保証して
  いるが、これはバグ寄りなのでテストごと書き換える
  - 旧: `throw new Error('boom')` → `error: 'boom'`
  - 新: `throw new Error('boom')` → `error: 'Internal Server Error'`
  - logger には引き続き `'boom'` が残ることを確認するテストに差し替える

#### 2b. migrate ルート専用エラーハンドラで日本語化

- `migrateRouter` の末尾に `(err, req, res, next)` を追加し、
  `err.type === 'entity.too.large'` を捕捉して
  `res.status(413).json({ success: false, data: null, error: '<日本語メッセージ>' })` を返す
- メッセージは UX を意識してアクション含みに:
  - 例: 「データが多すぎて移行できませんでした。一部を削除してから再度お試しください。」
- それ以外のエラーは `next(err)` で汎用 handler に流す

#### 2c. 波及確認

- `auth.ts` / `cloudflare-access.ts` などが `res.status(401).json(...)` で完結しており
  `Error.status` を使っていないことを確認（確認済み）
- 既存の `error-handler.test.ts` の "boom" / 空メッセージケースを 2a に合わせて更新

### Phase 3 — モバイル: timeout 緩和 + リカバリ動線

#### 3a. migrate 個別の timeout 緩和

- `mobile/src/api/migrate.ts` で `request('post', '/api/migrate', payload, { timeout: 120000 })` を渡す
- `client.ts` の request メソッドが既に `config?: AxiosRequestConfig` を受け取れるので
  そのまま流用可能

#### 3b. 413 / タイムアウト時のリカバリ UX

- `runLoginMigration` の `catch` で Axios エラーを判定:
  - `error.response?.status === 413` → 「データが多すぎて移行できませんでした」
  - `error.code === 'ECONNABORTED'`（タイムアウト）→ 「ネットワークが不安定で移行できませんでした」
  - その他 → 既存どおりサーバメッセージ
- いずれの失敗ケースでも、Alert ボタンを 3 択にする:
  - **「破棄してログイン続行」** → `'discarded'` を返す（ローカルデータを捨ててログイン完了）
  - **「もう一度試す」** → 自分自身を再帰実行（または呼び出し元にリトライさせる）
  - **「キャンセル」** → 既存どおり `'cancelled'`
- これにより「ログインしたら request entity too large が出てログインできない」袋小路を解消

#### 3c. テスト

- `mobile/__tests__/utils/migration.test.ts` に追加:
  - 413 レスポンス → 日本語メッセージ + 3 択 Alert
  - ECONNABORTED → 日本語メッセージ + 3 択 Alert
  - 「破棄してログイン続行」を選択 → `'discarded'` を返す
  - 既存の 200 系成功パスと 'cancelled' 復帰パスは破壊しない

### 将来の拡張（今回は実装しない）

#### A. ローカル保存件数のキャップ + 古いものから削除

ボディ上限の引き上げは「上限を高くしてヒットを遅らせる」だけで、
未ログインのまま使い続けるユーザーがいずれ再びぶつかる可能性は残る。
そこで「ローカルでは N 件までしか保持しない / 溢れた古いものは黙って消える」という
LRU 風キャップをモバイルストア側に入れる案がある。下記は採用時の論点メモ。

**対象ストアと候補上限**

- `recipe-store.savedRecipes`: 1 件の `steps_json` が最大級に重い。**100 件**程度
- `shopping-store.dishes`: `recipes_json` / `ingredients_json` を抱える。**50 件**程度
- `shopping-store.items`: 1 件は軽量。**500 件**程度（実用上ほぼヒットしない）

**追い出しキー**

- savedRecipe: `created_at` 昇順で古いものから削除
- dish: `updated_at` 昇順（ユーザーが最近触ったものを残す）
- item: `checked === 1` を優先して落とす → 同条件内で `updated_at` 昇順

**追い出しの発生タイミング**

- 各 store の add 系アクションの末尾で「上限超過なら末尾を切る」だけにする
  （ロード時の一括チェックは入れない。データ移行・初回起動時に大量削除されると
  ユーザーが「データが減った」体験になるため）
- ログイン時のマイグレーションは「現在ローカルにある分」をそのまま投げる前提なので、
  キャップが効いていれば自然に上限以下に収まる

**ユーザーへの可視化**

- 黙って消すのは UX として最低ライン。可能なら：
  - 設定画面で「ローカル保存上限」と現在件数を表示
  - 上限到達時に「ログインすれば全件保持できます」のヒントを出す
- ただし表示まで作り込むと工数が膨らむ。最低限「黙って消す」+ 設定画面の
  見える化、の二段階リリースが現実的

**懸念**

- いま data/ingredients/recipes 系はユーザーが「お気に入り」として残す前提で UI が
  組まれている節がある（`saved_recipes` テーブル名がそれ）。黙って消えると不信感に
  つながるので、最低でも「キャップに達した状態で新規追加するときは確認ダイアログを出す」
  くらいは入れたい
- 古さ基準で消すと、料理ノート的に蓄積したい人の体験を壊す。
  ログイン誘導のキャッチコピーとセットで提供しないと「勝手に消す悪いアプリ」になる

**採用判断**

- 当面は **見送り**。10MB 引き上げ + 「破棄してログイン続行」UX で現実的なユーザー像はカバーできるはず
- 実ユーザーから「ログインしたら『request entity too large』が出た」という再発報告、
  もしくは未ログイン端末でストレージ肥大の苦情があった場合に再検討する

#### B. マイグレーションのチャンク分割

- savedRecipes / dishes をチャンク分割して `POST /api/migrate` を複数回叩く方式
- サーバ側はトランザクション境界が複数回に割れるので、リクエスト ID（migration session）を
  導入して途中失敗時にロールバックできるようにする必要がある
- 現状ヒットしている上限は 100KB → 10MB 引き上げで実質解消されるため、
  実ユーザーが 10MB 超に到達してから検討する

#### C. ペイロード正規化（localId 参照化）

- `dishes[i].recipes` と `savedRecipes[j].steps` の重複を `source_dish_localId` 経由で
  参照化すれば 30〜50% 削減できる可能性
- API スキーマ変更でモバイル両対応が必要なため、10MB 引き上げより工数大
- 上限引き上げ後も 10MB 超が出るなら検討

#### D. サーバ側 chunked / 非同期 insert

- `migrate-service.ts` の同期トランザクションがイベントループをブロックする問題を
  解消するため、チャンクごとに transaction を切るか、worker_threads に逃がす
- 即座の問題ではないが、運用規模が増えてから

## 影響範囲

- `/api/migrate` の挙動: 100KB → 10MB の許容に拡大（既存正常系には影響なし）
- 共通 `errorHandler`: `err.status` / `err.expose` を見るようになる
  - 現在 `Error.status` 付きで throw している箇所は無い（grep 確認済み）が、
    着手時に再 grep する
  - 既存テスト `error-handler.test.ts` の「boom が漏れる」期待は書き換える
- モバイル: ログイン後マイグレーション失敗時の Alert メッセージとボタン構成が変化
  （'cancelled' 一択 → 'discarded' / リトライを含む 3 択）
- レート制限は今回入れない（個人利用想定 / 他 API も同方針）

## テスト方針

### サーバ (Vitest + supertest)

- `tests/helpers/app.ts` に `createApp({ migrateBodyLimit?: string })` を追加
- `tests/integration/migrate.test.ts` に追加:
  - **大きなボディが 201 で受理される**: 1MB 級の savedRecipes 配列を投げて成功
  - **上限を超えると 413**: `migrateBodyLimit: '10kb'` で起動した app に 11KB 超を投げて
    413 + 日本語エラーが返ることを確認
- `tests/integration/error-handler.test.ts` の更新:
  - `throw new Error('boom')` → `error: 'Internal Server Error'`、ステータス 500
  - logger には元の 'boom' が記録されることを別 spy で確認
  - `err.status === 400` を持つ Error をスタブ → 400 + `err.message` がそのまま露出する
    ことを追加（汎用化の保証）

### モバイル (Jest)

- `mobile/__tests__/utils/migration.test.ts` （既存）に追加:
  - 413 レスポンスを返す axios モックで日本語メッセージ + 3 択 Alert が出る
  - ECONNABORTED で日本語メッセージ + 3 択 Alert が出る
  - 「破棄してログイン続行」を選んで `'discarded'` が返る
  - 既存の 200 系 / 'cancelled' パスは破壊しない
- `mobile/src/api/migrate.ts` の timeout 上書きは API クライアント層 (`__tests__/api/`) で
  request の第 4 引数（config）が渡っていることを軽くスモークテスト

## Phase / Step

- [x] Phase 1: `/api/migrate` ルートのボディ上限を 10MB に引き上げ + DI 化
  - [x] `createApp` に `migrateBodyLimit` オプションを追加
  - [x] `app.ts` で migrate ルートにスコープ付き `express.json({ limit })` を挿入
  - [x] `migrate.test.ts` に「1MB 級は受理される」ケースを追加
- [ ] Phase 2: errorHandler 汎用化 + migrate 日本語化
  - [ ] 着手時に `Error.status` を付けて throw している箇所を再 grep
  - [ ] `errorHandler` を `err.status ?? err.statusCode ?? 500` / `err.expose` 対応に
  - [ ] `migrateRouter` 専用 error middleware で `entity.too.large` を 413 + 日本語化
  - [ ] `error-handler.test.ts` を「Internal Server Error に塗り潰す」期待に書き換え
  - [ ] `migrate.test.ts` に「上限超過は 413 + 日本語エラー」ケースを追加（DI で小さい limit を使う）
- [ ] Phase 3: モバイル側 timeout 緩和 + リカバリ動線整備
  - [ ] `mobile/src/api/migrate.ts` で timeout 120s を渡す
  - [ ] `runLoginMigration` の catch で 413 / ECONNABORTED 分岐 + 日本語メッセージ
  - [ ] 失敗 Alert を「破棄してログイン続行」「もう一度試す」「キャンセル」の 3 択に
  - [ ] `__tests__/utils/migration.test.ts` に上記ケースを追加

## 完了条件

- `POST /api/migrate` は 1MB 級のリアルなマイグレーションペイロードを 201 で受け取る
- それでも溢れた場合は 413 + 日本語の `error` メッセージで返り、
  モバイル側も「request entity too large」を生で見せない
- 失敗時にユーザーは「破棄してログイン続行」を選ぶことで袋小路に陥らずに進める
- 共通 `errorHandler` は `err.status` / `err.expose` を尊重し、
  内部 Error の message を勝手に露出しない
- `npm test` (server) / `npm test` (mobile) が緑
