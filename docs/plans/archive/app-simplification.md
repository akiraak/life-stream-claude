# アプリのシンプル化（買物リスト + レシピ履歴のみ、いいね廃止）

## 目的・背景

現在のアプリは 3 タブ構成（買い物リスト / 自分のレシピ / みんなのレシピ）で、
レシピ単位の「いいね」機能が両者をまたいで効いている。
[my-recipes-display-criteria.md](my-recipes-display-criteria.md) の調査により以下が判明している：

- 「みんなのレシピ」は dev DB 実測でクロスユーザいいねが 2 件、dish_name 重複ゼロと
  個人開発スケールでは事実上機能していない（E-1 結論）
- 「自分のレシピ」が server モードのみ `liked === 1` でフィルタされ、local モードと
  非対称になっている。migrate「移す」でレシピが消えるバグの根本原因（論点 B）
- いいね機能は両タブ間でしか効かないため、「みんなのレシピ」を撤去するなら
  いいねも一緒に廃止するのが筋

本タスクでは上記の **推奨案** を採用し、アプリを以下の構成に縮約する：

- **タブ**: 買い物リスト / 自分のレシピ（＝レシピ履歴）の 2 つだけ
- **「みんなのレシピ」タブ**: 削除
- **「いいね」機能**: モバイル UI / サーバ API / DB（`recipe_likes` テーブル）すべて削除
- **「自分のレシピ」のフィルタ**: `liked === 1` 条件を撤廃し、server / local モードとも
  保存済み全件を表示する（タブ名は「自分のレシピ」のまま、概念は履歴）

## スコープ外（ユーザ判断が必要な隣接論点）

以下は本プランでは **触らない**。気になる場合は別タスク化する。

- **`autoSaveRecipes` の上書き仕様**（`saved-recipe-service.ts:168-215`）：
  AI 再生成時に `source_dish_id` 単位で全削除→再 INSERT する仕様は維持する。
  従って「自分のレシピ」は厳密には「料理ごとに最新生成 3 件まで」となり、
  純粋な履歴ではない。完全な追記履歴化は本タスクのスコープを超える大改修
  （`my-recipes-display-criteria.md` E-2 結果参照）。
- **タブのリネーム**（「自分のレシピ」→「レシピ履歴」など）：
  必要なら別タスクで。本プランでは現状の文言を維持。
- **個別削除 UI の追加**：`DELETE /api/saved-recipes/:id` は既に存在するが、
  モバイル UI に削除ボタンは未実装。フィルタ撤廃で表示件数が増えるため
  将来的に必要だが、本タスクでは追加しない（ユーザは自然減で十分）。
- **`saved_recipes.liked` カラム自体のドロップ**：使用しなくなるが、SQLite で
  カラム削除は再構築が必要なため、コードからの参照を断つだけに留める。
- **migrate 経由の `recipe_likes` 同期** (`my-recipes-migrate-likes.md`)：
  いいね機能ごと廃止するため、この保留プランは廃止扱いとし archive 送り。

## 対応方針

5 つの Phase で削除する。Phase 間は前から順に進める（前提依存があるため）。

### リリース順序（後方互換性のため）

サーバを先にデプロイすると、App Store / Play Store に出回っている **旧アプリの
`PUT /:id/like` と `GET /shared` が 404** になる（`shared` タブ空表示・
いいねボタン無反応）。これを避けるため以下の順で進める：

1. Phase 2-3（モバイル）を実装 → EAS ビルド → ストア審査 → 配布
2. ストア配布から **数日〜1 週間** 待って自動更新がある程度行き渡るのを待つ
3. Phase 1（サーバ）デプロイ
4. Phase 4（DB マイグレーション）実行（直前に本番 DB をバックアップ）
5. Phase 5 動作確認・後片付け

ローカルでの実装作業順は Phase 1 → 2 → 3 → 4 で良い（テストが phase 内で閉じるため）。
リリース順だけ上記でずらす。

### Phase 1: サーバ — いいね / 共有レシピ機能の削除

**ルート / マウント**
- `server/src/routes/saved-recipes.ts`
  - `savedRecipesSharedRouter` 定義（14-24 行）を削除
  - `import { ..., getSharedRecipes, toggleLike }` から該当 import を削除
  - `PUT /:id/like` ハンドラ（111-124 行）を削除
- `server/src/app.ts:84` の `savedRecipesSharedRouter` のマウントを削除

**サービス**
- `server/src/services/saved-recipe-service.ts`
  - `SavedRecipe` interface から `like_count` / `liked` フィールドを削除
  - `getAllSavedRecipes`: `recipe_likes` への subquery を削除、ORDER BY を
    `like_count DESC` から外す（`dish_name ASC, created_at DESC` に簡略化）
    → 引数 `userId` の重複渡しも削減
  - `getSharedRecipes` 関数を完全削除
  - `getSavedRecipe`: subquery を削除、引数 `userId` を 2 回渡す箇所を整理
  - `createSavedRecipe` / `createSavedRecipesBulk`: ハードコードの
    `0 as like_count, 0 as liked` を削除
  - `toggleLike` 関数を完全削除
  - `getSavedRecipeStates`: `liked` / `like_count` を返すのをやめ、
    `{ id: number }[]` のみ返す（呼び出し元 `shopping-store` への影響範囲を後段で確認）
  - `autoSaveRecipes`: 177-190 行（既存いいね収集）と 199 行 / 207-213 行
    （いいね復元）を削除。`source_dish_id` 単位の全削除→再 INSERT は維持。

**admin への波及**
- `server/src/services/admin-service.ts`
  - `getAllSavedRecipesAdmin`（137 行付近）の `like_count` subquery を削除
  - `getSystemInfo`（277 / 280 行付近）の集計対象テーブル一覧から
    `'recipe_likes'` を削除
- `web/admin/app.js`
  - `renderSavedRecipes` のテーブル列から `like_count`（443-445 行付近）を削除

**seed-demo（dev DB 生成スクリプト）**
- `server/seed-demo.ts`
  - 90-100 行: `CREATE TABLE recipe_likes` ＋ `idx_recipe_likes_*` インデックス 2 本を削除
  - 108 行: `const insertLike = db.prepare('INSERT INTO recipe_likes ...')` を削除
  - 336 行付近のコメント「ペペロンチーノ、豚汁: 0いいね」も削除
  - 344 行: `totalLikes` カウントクエリを削除
  - 351 行: 完了メッセージから `いいね: ${totalLikes.c}件` を削除
  - もし `insertLike.run(...)` 呼び出しがデモデータ生成中にあれば併せて削除
    （`grep -n insertLike server/seed-demo.ts` で確認）

**サーバテスト**
- `server/tests/unit/saved-recipe-service.test.ts`
  - `toggleLike` / `getSharedRecipes` の `describe` ブロック削除
  - 各レコードに対する `like_count: 0, liked: 0` アサーションを削除
- `server/tests/integration/saved-recipes.test.ts`
  - `PUT /api/saved-recipes/:id/like` の `describe` ブロック削除
  - `GET /api/saved-recipes/shared` の `describe` ブロック削除
  - 既存レスポンスから `like_count` / `liked` のアサーションを削除
  - 注意: `like_count: 0` / `liked: 0` のアサーションは削除する describe 内だけでなく
    **CRUD 系の他 describe にも散在**（POST 201 後のレスポンス確認、GET 一覧など）。
    `grep -n "like_count\|liked" tests/integration/saved-recipes.test.ts` で
    全件確認してから削除する
- `server/tests/helpers/db.ts`: 14 行のリセット対象テーブル一覧から
  `'recipe_likes'` を削除（Phase 4 で DROP するまでは存在するが、
  リセット側で参照を消しておくと Phase 4 のマイグレーション後にも壊れない）
- `npm test` がグリーンになるまで反復

### Phase 2: モバイル — `shared` タブ削除 + `recipes` フィルタ撤廃 + ハート UI 除去

**タブ削除**
- `mobile/app/(tabs)/_layout.tsx`
  - `<Tabs.Screen name="shared" ...>` ブロック（64-72 行）削除
  - `TabIcon` の `people: '👥'` エントリ（123 行）削除
- `mobile/app/(tabs)/shared.tsx` ファイルを削除

**recipes 画面のフィルタ撤廃**
- `mobile/app/(tabs)/recipes.tsx`
  - 25 行: `const base = mode === 'server' ? savedRecipes.filter((r) => r.liked) : savedRecipes;`
    を `const base = savedRecipes;` に置換
  - `toggleLike` の import / handler / `RecipeListItem` への `onToggleLike` prop を削除
  - 空状態のメッセージから「いいね」文言を一般的な「レシピがありません」に差し替え

**コンポーネントからハート UI 除去**
- `mobile/src/components/recipes/RecipeListItem.tsx`
  - `onToggleLike` prop と `recipe.liked` / `recipe.like_count` 表示部（30-34 行）を削除
  - 関連する `.heart` スタイル（100-102 行）も削除
- `mobile/src/components/dishes/RecipeCard.tsx`
  - `onToggleLike` prop と `recipeState.liked` 表示部（35-39 行）を削除
  - `.heart` スタイル（106-108 行）も削除
- `mobile/src/components/dishes/IngredientsScreen.tsx`
  - `recipe-store` からの `toggleLike` import を削除
  - `handleToggleLike` callback（145-162 行）を削除
  - `RecipeCard` に渡す `onToggleLike` prop を削除（349-350 行）

### Phase 3: モバイル — ストア / 型 / API クライアント / テストから likes 除去

**型定義**
- `mobile/src/types/models.ts`
  - `RecipeState`: `liked` / `like_count` フィールドを削除
  - `SavedRecipe`: `liked` / `like_count` フィールドを削除

**API クライアント**
- `mobile/src/api/saved-recipes.ts`
  - `getSharedRecipes()`（11-15 行）を削除
  - `toggleLike()`（17-21 行）を削除

**recipe-store**
- `mobile/src/stores/recipe-store.ts`
  - state: `sharedRecipes` フィールドを削除
  - actions: `loadSharedRecipes` / `toggleLike` を削除
  - `setMode` 内で `sharedRecipes: []` にリセットしている箇所を削除
  - `partialize`（永続化キー一覧）から `sharedRecipes` を除外
  - `deleteSavedRecipe`: `sharedRecipes` 側からの除去ロジックを削除
  - `buildLocalSavedRecipe`（50-53 行付近）の `like_count: 0, liked: 0` のデフォルト値を削除

**shopping-store**
- `mobile/src/stores/shopping-store.ts`
  - `recipeStates` の型から `liked` / `like_count` を削除（`{ id: number }[]` に簡略化）
  - 341-349 行付近の `liked` / `like_count` を組み立てている部分を削除

**モバイルテスト**
- `mobile/__tests__/stores/recipe-store.test.ts`
  - `getSharedRecipes` / `toggleLike` モック削除
  - "toggleLike updates saved and shared recipes" / "toggleLike triggers requestLogin" テスト削除
  - `sharedRecipes: []` 初期値アサーション削除
- `mobile/__tests__/stores/shopping-store.test.ts`: `recipeStates[0].liked` 系のアサーションを削除
- `mobile/__tests__/utils/migration.test.ts`: モックと `liked` / `like_count` / `sharedRecipes` を削除
- `mobile/__tests__/components/auth-modal-flow.test.ts`: 同上
- `mobile/__tests__/stores/auth-store.test.ts`: 同上
- `npm test` がグリーンになるまで反復

### Phase 4: DB マイグレーション — `recipe_likes` テーブル DROP

> ⚠️ **実行前に必ず本番 DB をバックアップする**（`cp shopping.db shopping.db.bak-YYYYMMDD`）。
> `DROP TABLE` は取り戻せないため、ロールバックはバックアップ復元しか手がない。

- `server/src/database.ts`
  - 169-191 行のマイグレーションブロックを **書き換え** ではなく **追加マイグレーション** にする：
    既存ブロックは残したまま（履歴として）末尾で `DROP TABLE IF EXISTS recipe_likes` を実行する
    新規ブロックを追加する。これで本番 DB から安全に消える。
    ```ts
    try {
      database.exec('DROP TABLE IF EXISTS recipe_likes');
    } catch {
      // 既に消えている場合は無視
    }
    ```
  - 162-167 行の `liked` カラム追加マイグレーションは残す（SQLite はカラム削除が
    重いので、コードから参照しなくなる時点で実害なし）。ただし将来の table 再構築
    でついでに消すなら別タスク。
- `server/tests/helpers/db.ts`: Phase 1 で参照を消しているので追加変更なし
- 起動時にマイグレーションが流れることを `npm run dev` で確認

### Phase 5: 動作確認・後片付け

1. サーバ単体テスト（`server/ && npm test`）グリーン
2. モバイル単体テスト（`mobile/ && npm test`）グリーン
3. 実機 / Expo Go で動作確認：
   - 未ログイン: AI 生成 → 自分のレシピに 3 件並ぶ
   - ログイン → 「移す」: 自分のレシピが空にならない（migrate バグの自動解消）
   - ログイン状態で AI 再生成 → 同 dish の最新 3 件に置換される（既存仕様）
   - ヘッダ右側のメニュー / 残り回数表示は影響なし
   - みんなのレシピタブが消えていることを確認
4. リリースノート / アプリストア説明文に「みんなのレシピ廃止」を 1 行明記
   （ストア配布前のアプリ更新で行うのが望ましい）
5. プラン後片付け：
   - `TODO.md` 該当行を `DONE.md` に移動（完了日 `2026-04-26` 以降）
   - 本プラン `app-simplification.md` を `docs/plans/archive/` に移動
   - `my-recipes-display-criteria.md` も結論が確定するので archive 送り
   - `my-recipes-migrate-likes.md` は採用見送り→廃止として archive 送り
   - TODO.md のうち以下の関連項目も整理：
     - 「自分のレシピに表示されるレシピの判定基準の調査」→ 完了扱い
     - 「(保留) migrate API でローカル savedRecipes をいいね済みとして取り込む」→ 廃止
     - 「ハートをフラットなイラストに」→ 廃止（ハート UI 自体が無くなる）
6. バックアップ DB（`shopping.db.bak-YYYYMMDD`）の保管期間を決めて記録
   （目安: 1〜2 週間問題なければ削除）

## 影響範囲（要約）

### 削除されるもの
- モバイル: `app/(tabs)/shared.tsx`、`api/saved-recipes.ts` の 2 関数、
  recipe-store の `sharedRecipes` / `loadSharedRecipes` / `toggleLike`、
  RecipeCard / RecipeListItem / IngredientsScreen のハート関連、
  関連テスト群
- サーバ: `savedRecipesSharedRouter`、`getSharedRecipes`、`toggleLike`、
  `autoSaveRecipes` のいいね復元ロジック、`recipe_likes` テーブル、
  `seed-demo.ts` の recipe_likes 関連（CREATE / INSERT / カウント表示）
- 型: `SavedRecipe.liked` / `like_count`、`RecipeState.liked` / `like_count`
- admin: `like_count` 列表示、`recipe_likes` の集計

### 維持されるもの
- 「自分のレシピ」タブそのもの（フィルタだけ外す）
- `saved_recipes` テーブル本体（`liked` カラムはコードからは参照されなくなる）
- `autoSaveRecipes` の `source_dish_id` 単位上書き仕様
- 個別削除 API（`DELETE /api/saved-recipes/:id`）
- migrate API の挙動（`recipe_likes` を触らない現状仕様のまま）

## テスト方針

- サーバ: 既存 `saved-recipes.test.ts` / `saved-recipe-service.test.ts` を更新。
  shared / like 関連 describe を削除し、それ以外の既存ケース（CRUD / migrate /
  autoSave のタイトル維持など）はグリーンを保つ。新規テストは追加しない
  （削除のみのため）。
- モバイル: 既存 store テストから likes 関連を削除しグリーン化。
  `recipe-store.test.ts` の delete テストで `sharedRecipes` への影響を見ている
  アサーションがあれば、savedRecipes 側のみ確認するように変更。
- 手動: 実機で migrate「移す」のレシピ消失バグが直っていることを再確認
  （`my-recipes-display-criteria.md` の実機確認結果と対比）。

## 進捗

- [x] Phase 1: サーバ — likes / shared エンドポイント・サービス・admin 削除（テスト含む）
- [x] Phase 2: モバイル — `shared` タブ削除 / `recipes` フィルタ撤廃 / ハート UI 除去
- [x] Phase 3: モバイル — ストア / 型 / API クライアント / テストから likes 除去
- [x] Phase 4: DB マイグレーション — `recipe_likes` テーブル DROP
- [x] Phase 5: 実機動作確認 + プラン後片付け（DONE.md 移動 + archive 移動）
