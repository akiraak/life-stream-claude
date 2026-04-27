# リファクタリング監査プラン

## 目的・背景

`TODO.md` の「リファクタリング」項目は対象が広いため、まず**監査（調査）**として候補を洗い出して優先度を付ける。
個別の対応は本プランから派生する別プランファイル（命名規則: `docs/plans/refactoring-<area>-<topic>.md`、例: `refactoring-mobile-shopping-store.md`）に分割し、
本プランは「候補棚卸し → 優先度付け → 個別プランへの分解」までをスコープとする。

リファクタの目的は **将来の自分と他人にとってメンテナンスしやすく、理解しやすいコードにすること**。
行数削減・抽象化・パフォーマンスはこれの結果として付いてくるものであり、目的化しない。

## スコープ / 非スコープ

### スコープ
- `server/src/` 配下: routes / services / middleware / lib に加え、**`database.ts` / `app.ts` / `index.ts`（起動・DB 初期化）も対象**
- `mobile/src/` 配下: components / stores / api / utils / hooks / theme / config / types
- `mobile/app/` の画面ファイル（`_layout.tsx` 含む）
- **テストコード自体**（`server/tests/`, `mobile/__tests__/`）の重複・モック濫用・非決定性
- 重複・責務肥大・型の弱さ・テスト不足など、メンテ性に直結する観点での候補抽出

### 非スコープ
- 機能追加・挙動変更
- パフォーマンス最適化（必要なら別タスク）
- `web/about.html`, `web/privacy.html`（ほぼ静的）
- `web/admin/`（**Phase 0 でロジック量を確認したうえで非スコープ妥当性を判定**。重そうなら別プランへ切り出す）
- `dev-admin/`（別途独自プランあり）

## 進め方（Phase 構成）

### Phase 0: ガードレールと一次データ収集
**コード変更なし。** 各 Phase の判断基準と一次データを揃える。

1. 「リファクタリング全般の心得」「プロジェクト固有の注意点」を確認し、各 Phase の作業時に逸脱していないかチェックする基準とする
2. 既存テストの網羅範囲を把握する（`server/tests/`, `mobile/__tests__/`）
3. リファクタ対象領域でテストが薄い箇所をリストアップ。**実際のテスト追加は本プランでは行わず**、個別プラン側で「特性化テスト → リファクタ → テスト維持」の順に進める原則だけ確定
4. **`web/admin/` の取り扱い判定**: ロジック量・依存数を grep ベースで確認し、本プラン対象に含めるか別プランに切り出すかを決める
5. **一次データの取得**（Phase 1/2 で参照する基礎情報）:
   - 行数（`wc -l`）— **初期スクリーニング用**
   - 変更頻度（`git log --since=... --pretty=format: --name-only | sort | uniq -c | sort -nr`）— よく変わるファイルほど読みやすさのリターンが大きい
   - 型の弱さ: `any` / `as` / `// @ts-ignore` の出現箇所
   - 未使用 export / 未使用ファイル: `npx ts-prune`（または同等の手段）
   - 循環依存: `npx madge --circular`
   - ESLint 警告件数（設定がある範囲で）
   - 同一文字列リテラル・同一エラーメッセージの重複（grep ベースの簡易確認で可）

成果物: 一次データのスナップショット（本ファイルの「Phase 0 一次データ」節に追記）

### Phase 1: サーバ側監査

#### 必須チェック（プロジェクト固有の落とし穴を機械的に拾う）
- [ ] `requireAuth` と `requireCloudflareAccess` の二重掛けが存在しないか grep
- [ ] `{ success, data, error }` 形式から逸脱しているレスポンスがないか
- [ ] route 層で SQL を直接叩いている箇所がないか
- [ ] 外部 API（Gemini / Resend / Google OAuth）の呼び出しがサービス層境界に閉じているか

#### 観点（候補抽出のための定性チェック）
- ルートとサービスの責務分離
- service 層の関数粒度（1 関数で複数責務になっていないか）
- 型定義の重複・`any` の混入
- 認証ミドルウェアの使い分けが正しいか
- エラーハンドリングの一貫性
- 起動・DB 初期化（`database.ts` / `app.ts` / `index.ts`）の見通し

#### 候補抽出の手順
1. Phase 0 の一次データ（行数・変更頻度・`any` 件数・未使用 export 等）の上位を出す
2. 各候補に対し、**証拠（ファイルパス + 行番号 + 抜粋 or 関数名 + 重複箇所一覧）** を必ず添える
3. 観点のうちどれに該当するかをタグ付け
4. ラフな想定工数（半日 / 1〜2 日 / 数日）とリスク（テスト薄 / 影響範囲広 等）を記載

参考: 行数の大きい順（初期スクリーニング用）
- `server/src/routes/docs.ts` (418 行)
- `server/src/services/admin-service.ts` (295 行)
- `server/src/routes/admin.ts` (285 行)
- `server/src/services/logs-service.ts` (234 行)
- その他 routes / services / middleware / lib / 起動系

成果物: サーバ側候補リスト（候補ごとに「ファイル / 観点 / 証拠 / 想定工数 / リスク」）

### Phase 2: モバイル側監査

#### 必須チェック
- [ ] `mobile/src/api/` から `/api/admin` を叩いていないか grep（CLAUDE.md 明記の禁止事項）
- [ ] `mobile/src/types/models.ts` と各所のインライン型の重複
- [ ] `stores/` の状態と `__tests__/stores/` の対応

#### 観点
- 画面ファイル（`app/(tabs)/*.tsx`, `_layout.tsx`）にロジックが集中していないか
- Zustand store の責務肥大（actions と selectors の分離、派生状態の整理）
- API クライアント層（`mobile/src/api/`）の型・エラー処理の統一感
- コンポーネントの責務（表示 vs 状態管理）
- `mobile/src/utils/` 配下の凝集度（`migration.ts` の延命要否を含む）
- `hooks/` `theme/` `config/` の利用状況と凝集度

#### 候補抽出の手順
Phase 1 と同じ。**必ず証拠を添える**。

参考: 行数の大きい順（初期スクリーニング用）
- `mobile/app/(tabs)/index.tsx` (503 行)
- `mobile/src/components/dishes/IngredientsScreen.tsx` (457 行)
- `mobile/src/stores/shopping-store.ts` (399 行)
- `mobile/src/components/ui/DraggableList.tsx` (341 行)
- `mobile/src/components/auth/AuthModal.tsx` (298 行)
- `mobile/src/components/shopping/AddModal.tsx` (257 行)
- `mobile/app/(tabs)/_layout.tsx` (177 行)
- `mobile/app/(tabs)/recipes.tsx` (100 行)
- その他 components / stores / api / utils / hooks

成果物: モバイル側候補リスト（候補ごとに「ファイル / 観点 / 証拠 / 想定工数 / リスク」）

### Phase 3: 優先度付けと個別プランへの分解

1. Phase 1 / 2 の候補リストを以下の軸で評価:
   - **メンテ性インパクト**: 直すと将来の変更がどれだけ楽になるか（変更頻度 × 読みにくさ）
   - **リスク**: テストカバレッジ、影響範囲、本番ユーザーへの影響
   - **工数**: 半日 / 1〜2 日 / 数日 のラフな粒度
2. **個別プランへの分解の打ち切り基準**: 上位 3〜5 件、または「想定工数 1〜2 日以下 × メンテ性インパクト中以上」のものを優先。残りは候補リストに残し、本プラン archive 後の TODO ストックとする
3. 上位候補について `docs/plans/refactoring-<area>-<topic>.md` として個別プランを起こす（命名規則は冒頭参照）
4. `TODO.md` に個別タスクとして追加し、本監査プランは Phase 3 完了をもって `docs/plans/archive/` へ移送する（個別プランの完了は待たない）

## リファクタリング全般の心得（プロジェクト全体に効く価値観）

1. **メンテナンスのしやすさ・理解のしやすさを最優先する** — リファクタの目的は将来の自分と他人が読みやすく直しやすくすること。行数削減・抽象化・パフォーマンスはこれの結果として付いてくるもので、目的化しない
2. 機能変更と純粋リファクタは混ぜない — コミット / PR 単位で分離
3. 小さく刻む — 1 PR = 1 目的（1 ファイル分割 / 1 関数抽出 程度）
4. 過剰抽象化しない — YAGNI。3 箇所で同じパターンが出てから共通化。1〜2 箇所なら重複で OK
5. テストでガードしてから動かす — テストがない領域はまず特性化テストを書いてからリファクタする。書きづらいなら設計が悪いサインなので構造ごと見直す
6. 挙動を変えないこと最優先 — 「ついでに直したくなる」誘惑を抑える。気づいた別問題は TODO に追加して別タスクへ
7. 巨大ファイルは "分割後に見通しが良くなるか" で判断 — 行数だけで切ると、状態の流れが追えない分割になりがち
8. pre-commit フック (`husky`) を無効化しない — `--no-verify` 禁止
9. strict モード / 型を弱めない — `any` を増やすリファクタは劣化
10. 古いコメント・dead code は同時に消す — 明確に古いものに限る
11. **未使用の機能やコードは削除する** — 呼び出されていない関数・到達不能な分岐・参照されていないファイル / 型 / 依存は積極的に削除。「いつか使うかも」で残さない。Git 履歴に残るので必要になれば復元できる

## このプロジェクト固有の注意点（監査時にも実装時にも効く制約）

1. **API レスポンス形式 `{ success, data, error }` は固定** — モバイルが依存している。形だけ整えるリファクタでも変えない
2. **認証ミドルウェアの二重掛け禁止** — `requireAuth`（`req.userEmail`）と `requireCloudflareAccess`（`req.adminEmail`）を同じルートに重ねない
3. **モバイル → `/api/admin` は禁止** — ルートやクライアント整理で誤って繋げない
4. **DB スキーマ変更はマイグレーション必須** — 既存ユーザーデータが本番にある。SQLite の ALTER 制約に注意
5. **モバイルは RN コンポーネント描画テスト未導入** — UI 系リファクタは手動検証必須。型と単体テストでは UI 崩れを検出できない
6. **`stores/` を変えたら `__tests__/stores/` を更新**、サーバ service / route の変更も対応テスト更新
7. **ローカル管理画面の動作確認には `ADMIN_AUTH_DEV_BYPASS=1`** が必要（`server/.env`）

## テスト方針

- 監査フェーズ（本プラン）自体はコードを変更しないためテスト追加なし
- Phase 0 で薄い領域をリスト化するに留め、特性化テスト追加は個別プラン側で実施
- 個別リファクタプランでは、対象領域のテスト網羅状況を起票時に必ず明記する
- モバイル UI は手動検証手順を個別プランに記載

## 影響範囲

- 本プラン（監査）: コード変更なし。`docs/plans/refactoring.md` への追記と `TODO.md` 更新のみ
- 後続の個別プラン: 各プランで明記

## 完了条件

- [x] Phase 0: 一次データ（行数 / 変更頻度 / `any` 件数 / 未使用 export / 循環依存 / ESLint 警告 / 重複リテラル）が「Phase 0 一次データ」節に追記され、`web/admin/` の扱いが確定している
- [x] Phase 1: サーバ側候補リスト（証拠付き）が本ファイルに追記され、必須チェックがすべて消化されている
- [x] Phase 2: モバイル側候補リスト（証拠付き）が本ファイルに追記され、必須チェックがすべて消化されている
- [ ] Phase 3: 優先度付け済み上位候補が個別プランファイルとして起こされ、`TODO.md` に追加されている
- [ ] 本プランは `docs/plans/archive/` に移送されている（個別プランの完了は待たない）

## Phase 0 一次データ

スナップショット日: 2026-04-27（コード変更なし）。Phase 1/2 はこの節を参照する。

### 0.1 ガードレール確認

- 「リファクタリング全般の心得」「このプロジェクト固有の注意点」は本ファイル末尾の節にすでに整備済み。Phase 1/2 で候補抽出する際に、**心得 4（過剰抽象化禁止: 3 箇所重複から共通化）/ 心得 6（挙動を変えない）/ 注意点 1（API レスポンス形式固定）/ 注意点 2（認証ミドルウェア二重掛け禁止）/ 注意点 3（モバイルから `/api/admin` 禁止）** を必ずチェック項目として走らせる。
- 心得 11（未使用機能の削除）は本フェーズの「未使用 export」一覧と接続する。

### 0.2 テスト網羅範囲と薄い領域

- **server**: テストファイル 20（unit 9 / integration 10 / helpers 3）。`tests/setup.ts` が `/tmp/cb-test-<pid>.db` を強制し本体 DB を保護。
- **mobile**: テストファイル 11（api 2 / stores 4 / utils 2 / components 1 / config 1 / smoke 1）。RN コンポーネント描画テストは未導入（CLAUDE.md 明記）。

テストが薄い領域（個別プランで「特性化テスト → リファクタ → テスト維持」の対象）:

| 領域 | ファイル | LoC | 状況 |
| --- | --- | ---: | --- |
| server | `routes/docs.ts` | 418 | 専用テストなし。最大ファイル |
| server | `services/logs-service.ts` | 234 | 専用テストなし |
| server | `services/gemini-service.ts` | 15 | テストなし。ただし外部 API 薄ラッパなので mock 境界として妥当 |
| server | `middleware/cloudflare-access.ts` | 114 | `integration/admin-cloudflare-auth.test.ts` で間接カバーのみ |
| server | `middleware/error-handler.ts` | 17 | 専用テストなし |
| server | `middleware/rate-limit-ai.ts` | 64 | `integration/ai-quota.test.ts` で間接カバーのみ |
| server | `database.ts` / `index.ts` | 254 / 18 | integration 経由のみ |
| mobile | `api/dishes.ts` / `api/migrate.ts` / `api/saved-recipes.ts` | 59 / 48 / 34 | 専用テストなし |
| mobile | `utils/token.ts` | 15 | テストなし |
| mobile | `hooks/use-debounce.ts` | 12 | テストなし |
| mobile | `components/**/*` 全般 | — | RN 描画テスト未導入。UI 系リファクタは手動検証必須 |

### 0.3 `web/admin/` の取り扱い判定

- 構成: `app.js` 942 LoC（vanilla JS、`import`/`require` 無し）+ `style.css` 958 LoC + `index.html` 66 LoC。
- 通信先は `/api/admin` のみ（`const API = '/api/admin'`）。Cloudflare Access ＋ `requireCloudflareAccess` 系統で完全に独立。
- ロジック規模は無視できないが、技術スタック（vanilla JS）も認証経路（Cloudflare Access）もサーバ/モバイル本体と独立しているため、**本プランのスコープからは外す**。
- 必要なら Phase 3 で別プラン `refactoring-web-admin.md` を起こすか、TODO ストックに残すかを判定する。

### 0.4 行数（初期スクリーニング用）

server `src/` 上位:

| LoC | ファイル |
| ---: | --- |
| 418 | `routes/docs.ts` |
| 295 | `services/admin-service.ts` |
| 285 | `routes/admin.ts` |
| 254 | `database.ts` |
| 234 | `services/logs-service.ts` |
| 164 | `routes/dishes.ts` |
| 128 | `services/saved-recipe-service.ts` |
| 127 | `services/auth-service.ts` |
| 126 | `routes/migrate.ts` |
| 115 | `services/dish-service.ts` |
| 114 | `middleware/cloudflare-access.ts` |
| 100 | `app.ts` / `services/shopping-service.ts` |

mobile `src/` + `app/` 上位:

| LoC | ファイル |
| ---: | --- |
| 503 | `app/(tabs)/index.tsx` |
| 457 | `src/components/dishes/IngredientsScreen.tsx` |
| 399 | `src/stores/shopping-store.ts` |
| 341 | `src/components/ui/DraggableList.tsx` |
| 298 | `src/components/auth/AuthModal.tsx` |
| 257 | `src/components/shopping/AddModal.tsx` |
| 177 | `app/(tabs)/_layout.tsx` |
| 165 | `src/components/shopping/DishGroup.tsx` |
| 158 | `src/stores/auth-store.ts` |
| 136 | `src/components/recipes/RecipeListItem.tsx` |
| 133 | `src/stores/recipe-store.ts` |
| 131 | `src/components/dishes/RecipeCard.tsx` |
| 120 | `src/utils/migration.ts` |

### 0.5 変更頻度（直近 6 ヶ月、削除済みファイルは除外）

server 上位（コミット数）:

| 件 | ファイル |
| ---: | --- |
| 20 | `database.ts` |
| 19 | `index.ts` |
| 18 | `routes/dishes.ts` |
| 15 | `routes/admin.ts` |
| 13 | `services/admin-service.ts` |
| 10 | `services/saved-recipe-service.ts` |
| 10 | `services/dish-service.ts` |
| 9 | `services/shopping-service.ts` |
| 7 | `services/auth-service.ts` / `routes/shopping.ts` / `routes/saved-recipes.ts` / `app.ts` |
| 5 | `routes/docs.ts` |

mobile 上位（コミット数）:

| 件 | ファイル |
| ---: | --- |
| 16 | `app/(tabs)/index.tsx` |
| 14 | `src/components/dishes/IngredientsScreen.tsx` |
| 12 | `src/components/shopping/DishGroup.tsx` |
| 9 | `src/components/shopping/ShoppingItemRow.tsx` / `app/_layout.tsx` |
| 8 | `src/components/ui/DraggableList.tsx` / `app/(tabs)/_layout.tsx` |
| 7 | `src/stores/shopping-store.ts` |
| 6 | `src/stores/auth-store.ts` / `src/components/shopping/AddModal.tsx` / `app/(tabs)/recipes.tsx` |
| 5 | `src/components/auth/AuthModal.tsx` / `src/api/ai.ts` |

「LoC × 変更頻度」の重なりが厚い箇所（Phase 1/2 で優先評価する候補）:

- server: `routes/admin.ts`（285 / 15）、`services/admin-service.ts`（295 / 13）、`database.ts`（254 / 20）、`routes/dishes.ts`（164 / 18）、`services/saved-recipe-service.ts`（128 / 10）
- mobile: `app/(tabs)/index.tsx`（503 / 16）、`src/components/dishes/IngredientsScreen.tsx`（457 / 14）、`src/components/ui/DraggableList.tsx`（341 / 8）、`src/stores/shopping-store.ts`（399 / 7）

### 0.6 型の弱さ

- `any`: 計 10 件、**すべて `server/src/services/admin-service.ts`**。better-sqlite3 の `get()` 結果に対する `as any` キャスト（行 10–22 の COUNT 集計、行 77 の動的バインド配列、行 213 の集計結果、行 279 の `tableCounts` ループ）。→ Phase 1 候補（型付きヘルパ抽出 or 戻り値型を明示）。
- `as <Type>` キャスト合計: 36 件。トップは `services/shopping-service.ts`（5）、`services/auth-service.ts`（5）、`services/saved-recipe-service.ts`（4）、`services/dish-service.ts`（4）、`services/dish-ai.ts`（3）、`mobile/src/utils/device-id.ts`（3）。多くは DB 行 → ドメイン型のキャスト想定（要 Phase 1 確認）。
- `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`: **0 件**。
- mobile の `any` 使用: **0 件**。

### 0.7 未使用 export（`ts-prune`）

実質的に未使用と思われる候補（Phase 1/2 で「本当に未使用か」を確認した上で、心得 11 に従い削除候補に上げる）:

- server
  - `database.ts:21 closeDatabase`
  - `services/saved-recipe-service.ts:94 getSavedRecipeStates`
  - `services/saved-recipe-service.ts:105 autoSaveRecipes`
  - `services/shopping-service.ts:71 deleteAllItems`
  - `services/shopping-service.ts:77 getUncheckedItems`
  - `services/shopping-service.ts:82 getStats`
- mobile
  - `src/hooks/use-debounce.ts:3 useDebounce`（ファイル全体が未使用なら削除対象）
  - `src/types/models.ts:45 SuggestIngredientsResponse`
  - `src/components/ui/DraggableList.tsx:317 DragOverlay`
  - `src/components/ui/SuggestionsList.tsx:14 SuggestionsList`（モジュール自体が呼ばれているか要確認）

意図的に残す既知の偽陽性:

- server: `_resetCloudflareAccessJwksCacheForTest`, `_resetAiLimitsCacheForTest`（テストリセットフック）。`(used in module)` 付きの型定義は実装内利用で正常。
- mobile: ルートファイルの `default` export（Expo Router 規約）。

### 0.8 循環依存（`madge --circular`）

- server `src/`: **0 件**
- mobile `src/` + `app/`: **0 件**

### 0.9 ESLint

- server / mobile とも ESLint 設定・スクリプト未設定 → **該当なし**。本フェーズの観測点として記録。設定追加は本プランのスコープ外（必要なら別タスク）。

### 0.10 重複リテラル / エラーメッセージ

server で 3 回以上重複している `error: '...'` 文字列（候補: メッセージ定数化 / バリデーション層共通化）:

| 重複数 | メッセージ |
| ---: | --- |
| 4 | `'食材が見つかりません'` |
| 4 | `'料理が見つかりません'` |
| 4 | `'invalid_ai_limit'` |
| 3 | `'レシピが見つかりません'` |
| 3 | `'name は必須です'` |
| 3 | `'invalid_scope'` |

mobile はハードコード `throw new Error('...')` が 1 件のみ（`'料理が見つかりません'`）。重複なし。

### 0.11 Phase 0 から導かれる Phase 1/2 のフォーカス

- **server で重なり最大**: `services/admin-service.ts`（高 LoC + 高頻度 + `any` 集中）、`routes/admin.ts`（高 LoC + 高頻度）、`database.ts`（最高頻度・起動／DB 初期化の見通し）、`routes/dishes.ts`（高頻度・middle LoC）、`routes/docs.ts`（最大 LoC・テストなし）。
- **mobile で重なり最大**: `app/(tabs)/index.tsx`（最大 LoC + 最高頻度・画面ファイル肥大）、`components/dishes/IngredientsScreen.tsx`（高 LoC + 高頻度）、`stores/shopping-store.ts`（高 LoC・store 責務肥大の典型）、`components/ui/DraggableList.tsx`（高 LoC + 中頻度）。
- **横断テーマ**: server エラーメッセージ重複の整理、`admin-service.ts` の `any` 解消、未使用 export（特に `shopping-service.ts` の 3 関数）。

## 候補リスト

### サーバ

スナップショット日: 2026-04-27。Phase 0 一次データを参照しつつ、**必須チェックの結果**と**コード読解で得た証拠**を併記する。

#### 必須チェックの結果

| 必須チェック | 結果 |
| --- | --- |
| `requireAuth` と `requireCloudflareAccess` の二重掛け | **無し**。`app.ts:81–89` で disjoint にマウント。`auth.ts:82` の `requireAuth` 重ね掛けも `/api/auth` 系のみで `requireCloudflareAccess` とは別経路 |
| `{ success, data, error }` 形式からの逸脱 | **無し**。`/api` 配下は全て準拠（`ai.ts:31`, `migrate.ts:114` の複数行も同形式）。`/docs/*` の HTML レンダラ（`docs.ts`）は `/api` 配下ではないので対象外 |
| route 層での SQL 直叩き | **1 件ヒット**: `routes/migrate.ts:42–110`（候補 S2） |
| 外部 API（Gemini / Resend / Google OAuth）のサービス層境界 | **境界に閉じている**。Gemini は `services/gemini-service.ts` のみ、Resend / OAuth2Client は `services/auth-service.ts` のみで使用 |

#### 候補

##### S1: route 層のエラーハンドリング不統一 + `String(err)` の内部メッセージ漏洩

- **ファイル**: `routes/dishes.ts`, `routes/saved-recipes.ts`, `routes/migrate.ts`, `routes/shopping.ts`
- **観点**: エラーハンドリングの一貫性 + セキュリティ（情報漏洩）
- **証拠**:
  - `routes/dishes.ts` 全 8 ルートが `try { ... } catch (err) { res.status(500).json({ ..., error: String(err) }) }` パターン: 行 23 / 38 / 53 / 73 / 88 / 109 / 130 / 146 / 162
  - `routes/saved-recipes.ts` 全 5 ルート同パターン: 行 19 / 55 / 70 / 92 / 107
  - `routes/migrate.ts:124` 同パターン
  - `routes/shopping.ts:41` 部分的に同パターン（他のルートは try/catch 無し）
  - 一方、`routes/auth.ts:31`, `routes/ai.ts:39/65` は `next(err)` を呼び `middleware/error-handler.ts:11` に集約 → ロガーで記録しつつ `err.message || 'Internal Server Error'` を返す（`String(err)` のような raw な内部表現を直接漏らさない）
  - 既存 `errorHandler` ミドルウェアは `app.ts:93` で配線済み。route 側で `next(err)` を呼ぶだけで一貫した処理に寄せられる
- **想定工数**: 1〜2 日（パターン置換 + 既存テスト整合確認）
- **リスク**: 低（errorHandler は既存。`integration/dishes.test.ts` 等で 500 系のレスポンス body 形を検証している箇所があれば差分を吸収する必要あり）
- **メンテ性インパクト**: 高（一貫性 + セキュリティ）

##### S2: route 層からの SQL 直叩き（migrate.ts → service 抽出）

- **ファイル**: `routes/migrate.ts`
- **観点**: 必須チェック「route 層で SQL を直接叩いている箇所」のヒット
- **証拠**:
  - `routes/migrate.ts:2` `import { getDatabase } from '../database';`
  - `routes/migrate.ts:42` `const db = getDatabase();`
  - `routes/migrate.ts:47/50/53` で `db.prepare('INSERT INTO dishes ...')` / `'INSERT INTO shopping_items ...'` / `'INSERT INTO saved_recipes ...'` を route 内で構築
  - `routes/migrate.ts:57` で `db.transaction(() => {...})` を route 内で組み立てる
- **想定工数**: 半日（`services/migrate-service.ts` への抽出 + `routes/migrate.ts` を 30 行程度の薄いルートに）
- **リスク**: 低（ロジックそのままを service に移すだけ。既存 `tests/integration/migrate.test.ts` で挙動が固定されている前提で確認）
- **メンテ性インパクト**: 中（必須チェックを「全 routes が service 経由」に整える意義）

##### S3: `services/admin-service.ts` の責務肥大 + `any` 集中 + JST ヘルパ重複

- **ファイル**: `services/admin-service.ts`（295 LoC、Phase 0 で `any` 10 件すべてここに集中）
- **観点**: service 層の責務分離、型の弱さ、重複コード（心得 4）
- **証拠**:
  - 8 つの責務を `// ---` コメントで仕切って 1 ファイル化: Dashboard（行 6–33）/ Users（35–55）/ Shopping（57–94）/ Dishes（96–116）/ Purchase（118–129）/ SavedRecipes（131–147）/ AiQuota（149–255）/ SystemInfo（257–295）
  - `as any` キャストはすべて better-sqlite3 の `get()` 結果に対するもの: 行 10–22 の COUNT 集計 7 箇所、行 73 の `db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id)`、行 77 の `values: any[]` 動的バインド、行 213 の `todaySummary`、行 279 の `tableCounts` ループ
  - `getJstDate`（行 151–154）は `services/ai-quota-service.ts:12–16` と完全同一実装の重複（`getJstResetAtIso` 経由で `rate-limit-ai.ts` / `routes/ai.ts` が同モジュールを既に再利用しているのに、admin-service だけ独自定義）
  - `updateShoppingItem`（行 71–88）の動的 SQL 組み立て（`fields.push('updated_at = ...')` を `fields.length > 1` で分岐）は読みづらく、テスト未整備
- **想定工数**: 1〜2 日（責務別ファイル分割 + 型付き `getCount(sql)` ヘルパ抽出 + `getJstDate` を `ai-quota-service` から import に統一 + `updateShoppingItem` の特性化テスト先行）
- **リスク**: 中（`integration/admin-cloudflare-auth.test.ts` 等で間接カバーのみ。事前に特性化テスト追加が必要）
- **メンテ性インパクト**: 高（高 LoC × 高頻度 13 × `any` 集中の三重苦）

##### S4: `database.ts` のアドホック・マイグレーション群

- **ファイル**: `database.ts`（254 LoC、変更頻度 20 = サーバ最高）
- **観点**: 起動・DB 初期化の見通し、未使用コードの整理（心得 11）
- **証拠**:
  - 9 個の `try { database.exec(...) } catch {}` ブロック（行 134–228）— 「カラムが既に存在する場合は無視」「テーブルが既に存在する場合は無視」「既に消えている場合は無視」が並ぶ。明示的なバージョン管理から外れている
  - `SCHEMA_VERSION = 2`（行 6）— マルチユーザー対応以降に追加された ai_quota / app_settings / saved_recipes / liked / active / dish_id 等のマイグレーションはすべてバージョン外
  - 行 169–193 の `recipe_likes` ブロックがコメントで「いいね機能は廃止済み（app-simplification.md）。下記ブロックは履歴として残し、末尾の DROP TABLE マイグレーションで本番 DB から削除する」と明記。行 197 で DROP 済 → 心得 11 に従い CREATE / INSERT OR IGNORE 部分（行 172–193）は削除可
  - 行 209–228 の `dish_items` 統合マイグレーションも、本番が完了していれば不要（要本番状態の確認）
- **想定工数**: 1〜2 日（マイグレーション登録パターン化 + 完了済み移行ブロックの安全な除去）
- **リスク**: 中〜高（本番 DB がある。既存ユーザーデータを壊さないため、削除する移行ブロックは「本番にもう必要ない」ことを確認してから）
- **メンテ性インパクト**: 高（変更頻度トップ、起動経路）

##### S5: `routes/docs.ts` の HTML テンプレ＋CSS インライン

- **ファイル**: `routes/docs.ts`（418 LoC、サーバ最大）
- **観点**: 責務集中（ファイル走査 + Markdown 変換 + HTML レンダリング + 大量の CSS）、テスト不足、文字列の取り違え
- **証拠**:
  - `layoutHtml` 関数内に 245 行の CSS が文字列リテラルで埋め込み（行 184–411）
  - `layoutHtml` 行 183 のページタイトルが `<title>${escapeHtml(title)} - Life Stream</title>`。本プロジェクトは「お料理バスケット」で、`Life Stream` は他プロジェクトの名残（要修正）
  - 専用テストなし（Phase 0 確認）
  - `app.ts:90` で `app.use('/docs', docsRouter)` — 認証ミドルウェアが入っていない。本番でも公開状態。**スコープ外ながら**、認証要否は別タスクで検討要
- **想定工数**: 1 日（CSS を `web/docs.css` 等に外出し / タイトル文字列修正 / `layoutHtml` の薄化）
- **リスク**: 低（変更頻度 5 と低めだが、テストが薄いので手動確認必須）
- **メンテ性インパクト**: 中（ファイル長は劇的に減らせるが、変更頻度自体は低い）

##### S6: 未使用 export の削除（心得 11）

- **ファイル**: `services/shopping-service.ts`、`services/saved-recipe-service.ts`
- **観点**: 未使用機能の削除
- **証拠**（参照 0 件をリポジトリ全体で確認済み）:
  - `services/shopping-service.ts:71 deleteAllItems`
  - `services/shopping-service.ts:77 getUncheckedItems`
  - `services/shopping-service.ts:82 getStats`
  - `services/saved-recipe-service.ts:94 getSavedRecipeStates`
  - `services/saved-recipe-service.ts:105 autoSaveRecipes`
- **想定工数**: 半日（削除 + 既存テスト確認）
- **リスク**: 低（呼び出しなしを確認済み。Git 履歴に残るので必要なら復元可）
- **メンテ性インパクト**: 中（心得 11 を一度きちんと適用する）

##### S7: エラーメッセージリテラルの重複整理

- **ファイル**: `routes/admin.ts`, `routes/dishes.ts`, `routes/shopping.ts`, `routes/saved-recipes.ts`
- **観点**: 重複リテラル（心得 4: 3 箇所以上で共通化）
- **証拠**（Phase 0 集計の証拠付き再掲）:
  - `'食材が見つかりません'` × 4: `routes/admin.ts:77,88` / `routes/shopping.ts:56,67`
  - `'料理が見つかりません'` × 4: `routes/admin.ts:105` / `routes/dishes.ts:68,83,98`
  - `'invalid_ai_limit'` × 4: `routes/admin.ts:147,154,161,172`
  - `'レシピが見つかりません'` × 3: `routes/admin.ts:129` / `routes/saved-recipes.ts:65,102`
  - `'name は必須です'` × 3: `routes/shopping.ts:23` / `routes/dishes.ts:47,63`
  - `'invalid_scope'` × 3: `routes/admin.ts:188,194,216`
- **想定工数**: 半日（`server/src/lib/errors.ts` 等にメッセージ定数集約。S1 とまとめてやる方が効率的）
- **リスク**: 低
- **メンテ性インパクト**: 低〜中（単独より S1 と束ねる候補）

##### S8（任意・小粒）: `index.ts` cleanup interval のサイレント握り潰し

- **ファイル**: `server/src/index.ts`
- **観点**: エラーハンドリングの一貫性 / 運用可観測性
- **証拠**: `index.ts:13` `setInterval(() => { try { cleanupExpiredTokens(); } catch {} }, ...)` — 例外を完全に握り潰しており、本番で token クリーンアップが失敗していても気付けない
- **想定工数**: 30 分（catch ブロック内で `logger.error({ err }, 'cleanup_failed')` を入れるだけ）
- **リスク**: 低
- **メンテ性インパクト**: 低（運用品質の小改善）

#### 観点チェックの総括

| 観点 | 状況 |
| --- | --- |
| ルートとサービスの責務分離 | `routes/migrate.ts` で破綻（S2）。他は概ね分離済み |
| service 層の関数粒度 | `admin-service.ts` の `getAiQuotaStats`（行 199–255、サブクエリ 3 連発で 56 行）と `getSystemInfo`（行 266–295）は粒度が大きい。S3 の分割で改善 |
| 型定義の重複・`any` | `any` 10 件すべて `admin-service.ts`（S3）。型定義の重複は無し（Phase 0 確認） |
| 認証ミドルウェアの使い分け | OK（必須チェック合格） |
| エラーハンドリングの一貫性 | **不一致あり**（S1）。`String(err)` 漏洩と `next(err)` 経由が混在 |
| 起動・DB 初期化の見通し | `database.ts` のアドホック・マイグレーション（S4） |

### モバイル

スナップショット日: 2026-04-27。Phase 0 一次データを参照しつつ、**必須チェックの結果**と**コード読解で得た証拠**を併記する。

#### 必須チェックの結果

| 必須チェック | 結果 |
| --- | --- |
| `mobile/src/api/` から `/api/admin` を叩いていないか | **無し**。`grep "api/admin\|/admin/" mobile/src/api/` ヒット 0、`mobile/src/` 全体でも 0。CLAUDE.md 明記の禁止事項を遵守 |
| `mobile/src/types/models.ts` と各所のインライン型の重複 | **重複あり**（候補 M6）。`ApiResponse<T>` が `mobile/src/api/auth.ts:3` で再定義（他の API クライアントは `types/api.ts:1` から import）。`type ModalMode = 'item' \| 'dish' \| 'edit'` が `mobile/app/(tabs)/index.tsx:25` と `mobile/src/components/shopping/AddModal.tsx:16` の双方で定義。`stores/shopping-store.ts:18,341` の `recipeStates: { id: number }[]` は `types/models.ts:41 RecipeState` と等価ながら未参照（M7 と接続）。`api/saved-recipes.ts:21` / `api/migrate.ts:26` の `ingredients?: { name: string; category: string }[]` は `models.ts:29 Ingredient` と同形 |
| `stores/` の状態と `__tests__/stores/` の対応 | **概ね対応**。`stores/{ai,auth,recipe,shopping}-store.ts` ↔ `__tests__/stores/{同名}.test.ts` が 1:1（store 4 / test 4）。テスト LoC は auth 437 / shopping 316 / recipe 122 / ai 114 と十分。ただし `auth-store.test.ts` は `runLoginMigration` のフロー保証が中心で、`finishLogin` 内の 4 store 同期挙動（`useShoppingStore.setMode('server')` → `loadAll` → `useAiStore.loadQuota`）の検証は薄い |

#### 候補

##### M1: `shopping-store.ts` のローカル/サーバ二重実装と責務肥大

- **ファイル**: `mobile/src/stores/shopping-store.ts`（399 LoC、Phase 0 で行数 3 位）
- **観点**: store 責務肥大、心得 4（重複した if/else パターン）、心得 7（分割で見通しが良くなるか）
- **証拠**:
  - 1 ストアに 14 個の action（`loadAll` / `addItem` / `updateItemName` / `toggleCheck` / `deleteItem` / `deleteCheckedItems` / `reorderItems` / `addDish` / `updateDish` / `deleteDish` / `reorderDishes` / `reorderDishItems` / `suggestIngredients` / `linkItemToDish` / `unlinkItemFromDish`）が同居
  - `if (get().mode === 'local')` / `if (get().mode === 'server')` の **mode 分岐が 15 箇所**（行 107 / 124 / 150 / 166 / 179 / 192 / 206 / 220 / 241 / 252 / 265 / 278 / 333 / 360 / 372）。`recipe-store.ts` も同パターンで 3 箇所（行 69 / 80 / 91）
  - 各 action がローカル分岐で 10〜30 行のドメインロジック（local id 採番、`rebuildDishItems`、position 振り直し等）を抱えるため、サーバ側 API ラッパとして読みづらい
  - `suggestIngredients`（行 302–357）は **AI 提案 + ローカル state 更新 + サーバ AI キャッシュ更新 + 別 store (`useRecipeStore`) の `autoSaveRecipes` 連鎖呼出 + ai-store の残量反映** と 5 責務を 1 関数で扱う
  - 戻り値型 `SuggestIngredientsResult.recipeStates`（行 13–19, 341, 355）は **どこからも参照されていない**（M7 と接続）
- **想定工数**: 数日（local/server 戦略を分離した薄い `local-shopping.ts` / `server-shopping.ts` への切り出し、または注入。さらに `suggestIngredients` を画面側 (IngredientsScreen) と分担）
- **リスク**: 中（ローカルモードはログイン前体験の根幹。テストは `__tests__/stores/shopping-store.test.ts` 316 行で網羅されているので退行検出はしやすいが、現在 mode 切替や recipe-store 連鎖の境界条件まで含んでいるか先に確認が必要）
- **メンテ性インパクト**: 高（高 LoC × 中頻度（変更 7）× 二重実装 × 跨ぎ依存）

##### M2: `app/(tabs)/index.tsx` の画面ファイル肥大と store 内部直叩き

- **ファイル**: `mobile/app/(tabs)/index.tsx`（503 LoC、Phase 0 で **mobile 最大 LoC + 最高変更頻度 16**）
- **観点**: 画面ファイルへのロジック集中、store 抽象を貫通する `setState` 直書き
- **証拠**:
  - 503 LoC のうち styles 約 70 行を除く 430 行が 1 関数 `ShoppingListScreen` 内の処理。`useState` 11 個（行 31–41）、`useCallback` 14 個、`useRef` 2 個。
  - `useShoppingStore.setState({ ... })` を画面から直接呼ぶ箇所が 3 件: `index.tsx:156`（`reorderDishes` 楽観更新）、`165`（`reorderDishItems` 楽観更新）、`176`（ungrouped reorder の特殊操作）。store 側の reorder action は API のみ呼びローカル state を更新しないため、画面が補っている → 責務漏出
  - `dishesApi.unlinkItemFromDish` / `dishesApi.linkItemToDish` を画面から直接 import（行 15）。本来 `useShoppingStore` の link/unlink を経由できるはずだが、`handleUpdateItem`（123–141）と `handleItemDrop`（231–254）が `loadAll` を併用するために API を直叩きしている
  - 17 箇所の `try { ... } catch { Alert.alert('エラー', '<msg>に失敗しました') }` パターン（grep で 17）。
  - ドラッグ＆ドロップ周りの `dishGroupRefs` / `dishGroupLayouts` / `measureDishGroups` / `handleItemDragMove` / `handleItemDrop`（行 43–272）はカスタムフック化候補（テスト難易度も下がる）
- **想定工数**: 数日（カスタムフック分離 → store の reorder/link を楽観更新込みに昇格 → 画面コンポーネントを props 経由に薄化 → 手動 UI 検証）
- **リスク**: 中〜高（CLAUDE.md「RN 描画テスト未導入」のため UI 退行検出は手動。ドラッグ周りの順序依存が強く、分割でタイミング差が出やすい）
- **メンテ性インパクト**: 高（最大 LoC × 最高頻度の典型）

##### M3: `IngredientsScreen.tsx` の多責務化と複数 store 直接参照

- **ファイル**: `mobile/src/components/dishes/IngredientsScreen.tsx`（457 LoC、Phase 0 で行数 2 位、変更頻度 14）
- **観点**: 画面コンポーネント vs 状態管理の責務分離、エラーハンドリング一貫性
- **証拠**:
  - 1 コンポーネントが 4 つのストア／API を直接束ねる: `useShoppingStore`（28 行）、`useAiStore`（29）、`useAuthStore`（30）、`AiQuotaError`（17）
  - ローカル `useState` 6 個（行 32–37: `loading` / `ingredients` / `recipes` / `addedNames` / `dishName` / `editingName`）—— `ingredients` / `recipes` は store の `dish.ingredients_json` / `dish.recipes_json` キャッシュと並走しており、初期表示の `useEffect`（54–73）は **`dish.id` のみ依存に絞るため `eslint-disable-next-line react-hooks/exhaustive-deps`** が必要になっている。状態の一意な保持先が決まっていないサイン
  - `fetchSuggestions`（75–109）は AI 呼出 + クォータ超過検出 + 未認証時のログイン誘導 + 成功時のローカル state 反映 + アラート表示の **5 責務**
  - dish 名インライン編集（`handleSaveName` 158–172）は本機能から独立しているが同一コンポーネントに同居
  - エラーハンドリングは `Alert.alert('エラー', ...)` 直叩き（91–103, 102, 138 等で計 7 箇所、`Toast` 経由ではない）—— index.tsx と挙動が揃っていない
- **想定工数**: 1〜2 日（ヘッダ/dish 名編集を分離コンポーネントへ + AI 提案ロジックを `useDishSuggestions` フックへ。state 一意化を実現）
- **リスク**: 中（手動検証必須。ログイン誘導フロー (`requestLogin` の `onSuccess` コールバック) が壊れないこと）
- **メンテ性インパクト**: 高（変更頻度 14 で active な領域。M1 と分担次第で工数大きく変動）

##### M4: `DraggableList.tsx` のモジュールレベル可変状態と dead code

- **ファイル**: `mobile/src/components/ui/DraggableList.tsx`（341 LoC、Phase 0 で行数 4 位）
- **観点**: モジュール状態の散在、心得 11（dead code）
- **証拠**:
  - **モジュールレベルの mutable global**: 行 11 `let _dragActive = false;` と `export function isDragActive()` を `ShoppingItemRow.tsx:4,20,48` / `DishGroup.tsx:5,80,86,89` がインポートして「ドラッグ中はタップを無視」のために参照している。テストでリセットできない／同時並行ドラッグが破綻し得る形になっている
  - `setTimeout(() => { ... _dragActive = false; }, 300)`（行 99–102）でフラグを解除。300ms というマジックナンバーは race を内包
  - **明示された dead code**: 行 315 `// DragOverlay は不要になったが、互換性のためにエクスポート` → `export type DragOverlayState = null` / `export function DragOverlay(_props: { state: DragOverlayState }) { return null }`。Phase 0 / 本フェーズのリポジトリ全体 grep で参照ゼロを確認。心得 11 の典型例
  - 内側の `DraggableItem`（行 271–313）はファイル末尾に同居。コンポーネント本体 + サブコンポーネント + ジェスチャ計測 + dead export を 1 ファイルに抱える
- **想定工数**: 1〜2 日（`useDragGuard` フック等で global 撤去 → `DragOverlay` 削除 → サブコンポーネント分離）
- **リスク**: 中（タイミング依存のドラッグ動作。手動検証必須。CLAUDE.md「RN 描画テスト未導入」）
- **メンテ性インパクト**: 中〜高（global 撤去はバグ予防として効く）

##### M5: API クライアント層のボイラープレート（`if (!res.data.success) throw new Error(...)` × 26）

- **ファイル**: `mobile/src/api/{auth,shopping,dishes,ai,saved-recipes,migrate}.ts`
- **観点**: 心得 4（3 箇所以上の重複は共通化）、エラーハンドリング一貫性、注意点 1（API レスポンス形式固定）
- **証拠**:
  - 全 API 関数が同じ 3 行ボイラープレート: `const res = await client.X<ApiResponse<T>>(url, ...)` / `if (!res.data.success) throw new Error(res.data.error ?? '<日本語メッセージ>')` / `return res.data.data`。**該当行を grep すると 26 関数で出現**（`api/dishes.ts` 9 / `api/shopping.ts` 6 / `api/auth.ts` 3 / `api/saved-recipes.ts` 3 / `api/ai.ts` 2 / `api/migrate.ts` 1、AiQuotaError の特殊処理を含む箇所を除く）
  - `client.ts` が axios インスタンスでレスポンスインタセプタ（`error.message = serverMessage`）を持つので、共通化先として自然な位置にある
  - 共通化すれば「`success: false` 時のエラー文言の決め方」が 1 箇所に集約され、ユーザー向けメッセージ（`'追加に失敗しました'` 等）と内部ログのレイヤを切り分けられる
- **想定工数**: 半日（`client.ts` に `request<T>(method, url, data?, config?)` ヘルパを足し、各 API 関数を 1 行に薄化）
- **リスク**: 低（呼出側のシグネチャ不変。`__tests__/api/client.test.ts` 117 行と `__tests__/api/ai.test.ts` 119 行で挙動を抑え込みやすい）
- **メンテ性インパクト**: 中（API 追加の摩擦が大きく下がる）

##### M6: 型定義の重複整理

- **ファイル**: `mobile/src/api/auth.ts`、`mobile/app/(tabs)/index.tsx`、`mobile/src/components/shopping/AddModal.tsx`、`mobile/src/api/saved-recipes.ts`、`mobile/src/api/migrate.ts`、`mobile/src/stores/shopping-store.ts`
- **観点**: 注意点（インライン型の重複）、心得 4
- **証拠**:
  - `ApiResponse<T>` の重複: `mobile/src/types/api.ts:1` を 6 ファイルが import しているが、`mobile/src/api/auth.ts:3-7` だけは独自定義。`grep "ApiResponse<"` で確認
  - `type ModalMode = 'item' \| 'dish' \| 'edit'` の重複: `app/(tabs)/index.tsx:25` ↔ `components/shopping/AddModal.tsx:16` で同一定義
  - `stores/shopping-store.ts:18,341` の `recipeStates: { id: number }[]` は `types/models.ts:41 RecipeState` と等価ながら別定義
  - `api/saved-recipes.ts:21 BulkSavedRecipeInput.ingredients` と `api/migrate.ts:26 MigrateSavedRecipeInput.ingredients` の `{ name: string; category: string }[]` は `types/models.ts:29 Ingredient[]` と同形
- **想定工数**: 半日（型を `types/` に集約 → 各定義を `import type` に置き換え）
- **リスク**: 低
- **メンテ性インパクト**: 中（型のソース・オブ・トゥルース確立は将来の追加変更を確実に楽にする）

##### M7: 未使用 export / フィールドの削除（心得 11）

- **観点**: 未使用機能の削除
- **証拠**（参照 0 件をリポジトリ全体で確認済み）:
  - `mobile/src/components/ui/SuggestionsList.tsx`（55 LoC 全体）— 本体・テストどこからも import されない
  - `mobile/src/hooks/use-debounce.ts`（12 LoC 全体）— 同上
  - `mobile/src/components/ui/DraggableList.tsx:316-317 DragOverlay` / `DragOverlayState` — コメント「不要になったが、互換性のためにエクスポート」（M4 と接続）
  - `mobile/src/types/models.ts:45 SuggestIngredientsResponse` — 旧サーバレスポンス形。現行は `stores/shopping-store.ts:13 SuggestIngredientsResult` を使い、本型は参照ゼロ
  - `mobile/src/stores/shopping-store.ts:13–19 SuggestIngredientsResult.recipeStates` および 341–355 の生成ロジック — 戻り値の `recipeStates` を読む箇所がリポジトリ全体に存在しない（IngredientsScreen は `data.ingredients` / `data.recipes` のみ消費）
- **想定工数**: 半日（削除 + 既存テストの該当ケースも併せて整理）
- **リスク**: 低（呼出なしを確認済み。Git 履歴に残るので必要なら復元可）
- **メンテ性インパクト**: 中（読み手のノイズを減らし、`recipeStates` を消すことで shopping-store → recipe-store の不要結合も切れる）

##### M8（任意・小粒）: `app/(tabs)/_layout.tsx` の `TabIcon` 内 `require('react-native')`

- **ファイル**: `mobile/app/(tabs)/_layout.tsx`
- **観点**: 細かいコードの臭い（top-level import で済むものを内側で `require`）
- **証拠**: 行 110–117 `function TabIcon` 内で `const { Text } = require('react-native')`。同ファイル冒頭の行 2 で既に `Text` を ES import 済み。
- **想定工数**: 30 分
- **リスク**: 低
- **メンテ性インパクト**: 低

#### 観点チェックの総括

| 観点 | 状況 |
| --- | --- |
| 画面ファイルにロジック集中 | `app/(tabs)/index.tsx` で顕著（M2）。`recipes.tsx`（100 LoC）は適度 |
| Zustand store の責務肥大 | `shopping-store.ts` で顕著（M1）。`recipe-store.ts` は同パターンだが小規模、ai/auth は概ね適切 |
| API クライアント層の型・エラー処理の統一感 | ボイラープレート重複（M5）+ `auth.ts` の `ApiResponse` 再定義（M6） |
| コンポーネントの責務（表示 vs 状態管理） | `IngredientsScreen.tsx`（M3）、`DraggableList.tsx`（M4）。他は概ね役割が明確 |
| `mobile/src/utils/` 配下の凝集度 | `migration.ts`（120 LoC）はログイン直後の一回限りロジックで凝集している。延命要否は M1（shopping-store のローカル/サーバ分離）の結論次第 |
| `hooks/` `theme/` `config/` の利用状況 | `hooks/use-debounce.ts` は未使用（M7）。`theme/`・`config/` は薄く健全 |
