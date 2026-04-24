# 料理レシピ AI 生成を自動で行わないように

> **注記（2026-04-24）**: 本プラン Phase 3「Web クライアント」で実装した
> `web/app.js` / `web/index.html` のオンデマンド・レシピ生成 UI は、その後の
> [Web アプリ削除プラン](../web-app-removal.md) によって PWA ごと削除済み。
> 本プランは履歴として残すが、Web 関連の記述は現状と一致しない。

## 目的
料理を追加した直後に走っている **レシピ AI 生成** を自動実行ではなくユーザー
操作起点（オンデマンド）に変える。具材 AI は今まで通り自動でよい。

狙い:
- Gemini 呼び出しコスト / AI クオータ（`AI_LIMIT_USER` / `AI_LIMIT_GUEST`）の
  浪費を抑える。今は料理を 1 個追加するだけで「具材 + レシピ 3 件」を 1 回の
  プロンプトで生成しており、レシピを見ないユーザーでも常時消費している。
- レシピが見たくないユーザーに対して `saved_recipes` が勝手に増えるのを止める
  （今は AI 結果から自動保存されている）。
- 「買い物に必要な具材だけ知りたい」ユースケースの応答を速くする。

## 現状

### サーバ
- `POST /api/ai/suggest`（`server/src/routes/ai.ts:8`）が `dishName` を受けて
  `buildDishInfoPrompt`（`server/src/services/dish-ai.ts:20`）を 1 回投げる
- このプロンプトは「おすすめレシピを 3 つ + 各レシピの具材」を要求し、
  `parseDishInfo` で全レシピの具材をマージして `{ ingredients, recipes }` を
  返している。**つまり具材リストはレシピから派生して作られている**
- レスポンスは `dishes.ingredients_json` / `dishes.recipes_json`
  （`server/src/database.ts:89`）にキャッシュされる
- 同名料理を再追加したときは
  `server/src/services/dish-service.ts:46-52` で前回のキャッシュ
  （ingredients_json + recipes_json）をコピーして再利用している

### モバイル
具材／レシピ画面（`IngredientsScreen`）周辺で AI を発火する箇所は **3 つだけ**:

| # | UI 起点 | 種別 | 現状の挙動 |
|---|---------|------|-----------|
| **1** | 料理名タップで画面を開いた瞬間（キャッシュ無し） | **自動** | `IngredientsScreen.tsx:114-119` の `useEffect` が `fetchSuggestions()` を発火し、具材+レシピを生成 |
| 2 | 画面下部の「再取得」ボタン | 手動 | `IngredientsScreen.tsx:330-336`（`handleRefresh`）。具材+レシピを再生成 |
| 3 | 「この素材でレシピを再検索」ボタン | 手動 | `IngredientsScreen.tsx:321-327`（`handleSearchWithExtras`）。買い物リスト上の追加素材を含めて具材+レシピを再生成 |

`fetchSuggestions` 内部の流れ（1〜3 共通）:
- `useShoppingStore.suggestIngredients`（`mobile/src/stores/shopping-store.ts:302-359`）が `/api/ai/suggest` を叩いて `{ ingredients, recipes }` を取得
- `dishes.ingredients_json` と `dishes.recipes_json` を更新
- 続けて `recipeStore.autoSaveRecipes(dish.name, recipes, dishId)`（`mobile/src/stores/recipe-store.ts:122-152`）が走り、レシピ 3 件を `POST /api/saved-recipes/bulk` で `saved_recipes` テーブルへ保存

具材チップ（`onPress={handleToggleIngredient}`）や、レシピ手順内の具材ハイライト（`HighlightedText`）のタップは AI を呼ばず、買い物リストへの追加／削除のみ。

### Web
モバイルと同じく **3 起点**:

| # | UI 起点 | 種別 | 現状の挙動 |
|---|---------|------|-----------|
| **1** | 料理を追加した瞬間（キャッシュ無し） | **自動** | `app.js:703-722` の `addDish()` が `fetchIngredientsInBackground()`（`app.js:976-998`）を発火し、具材+レシピを生成 |
| 2 | 具材モーダル下部の「レシピを再取得」ボタン（`#ingredients-refresh`） | 手動 | `fetchIngredientsForModal()`（`app.js:1001-`）。具材+レシピを再生成 |
| 3 | 「この素材でレシピを再検索」ボタン（`#extra-search-btn`） | 手動 | 同上、追加素材を含めて再生成 |

サーバ側は旧エンドポイント `POST /api/dishes/:id/suggest-ingredients` を経由しており、最終的に `/api/ai/suggest` 相当の処理で具材+レシピ両方を返している。

## 変更スコープ

**変更するのは上記 #1（自動発火）だけ**。

| # | 起点 | 変更後 |
|---|------|--------|
| **1** | **画面を開いた瞬間 / 料理追加直後の自動発火** | **具材のみ生成（レシピは生成しない）。レシピは新規追加する「レシピを生成する」ボタンでオンデマンド生成** |
| 2 | 「再取得」ボタン | **変更なし**（具材+レシピ両方を再生成、`saved_recipes` も今まで通り更新） |
| 3 | 「この素材でレシピを再検索」ボタン | **変更なし**（同上） |

明示的なボタン（#2 / #3）は「ユーザーが意図して押した」操作なので、現状の「具材+レシピを一括生成」の挙動を維持する。自動で勝手に走るのは #1 だけなので、コスト浪費・意図しない `saved_recipes` 増加もここを止めれば解決する。

## 選択肢と比較

### 案 A: 1 エンドポイント + `mode` パラメータ（本プラン採用）
- `POST /api/ai/suggest` に `mode: 'ingredients' | 'recipes'`（省略時は
  互換のため `'both'`）を追加
- `mode='ingredients'` なら **具材だけ** を返す軽いプロンプトを投げる
- `mode='recipes'` なら **レシピ 3 件** を返す（今の prompt 相当）
- クライアントは「具材オンデマンド（=自動）」「レシピオンデマンド（=ボタン）」
  の 2 段にする
- 利点: ルーティング追加が最小、`mode='both'` を残せば既存 web の旧
  エンドポイント経由の挙動も壊さない、AI クオータの計上は middleware で
  共通のまま使える
- 欠点: プロンプトが内部で 2 系統になる

### 案 B: エンドポイントを 2 つに分ける（`/suggest-ingredients` と `/suggest-recipes`）
- 利点: REST 的にきれい
- 欠点: クライアント API ラッパとテストが 2 倍。`/api/ai/suggest` の互換
  維持のため結局両方残す羽目になる。今の規模に対してオーバー

### 案 C: 1 回のプロンプトのまま、クライアントでレシピ表示だけ隠す
- 既存プロンプトを変えず、UI で「レシピを生成する」ボタンを押すまでレシピ
  カードを描画しない
- 利点: サーバ変更ゼロ
- 欠点: **AI クオータも cost も全く減らない**（生成は走っている）。今回の
  目的（コスト削減）にミスマッチ。却下

## 設計上の原則
1. **変更するのは「自動発火」起点（#1）だけ**。「再取得」「この素材でレシピを再検索」
   など既存の手動ボタン（#2 / #3）は今まで通り具材+レシピ両方を生成する。
2. **#1 の自動生成はレシピを抜く**。料理を追加した／具材画面を開いた直後は
   具材だけを生成。レシピは追加する「レシピを生成する」ボタンを押した時だけ。
3. **具材生成は今まで通り自動でよい**。買い物リストアプリの主用途は具材を
   買うことで、ここで余計な 1 タップを増やすと UX が大きく劣化する。
4. **キャッシュは尊重する**。`dishes.recipes_json` に既にレシピがあれば
   それを表示するだけで、AI は呼ばない。同名料理の再利用
   （`dish-service.ts:46`）も今まで通り効く。
5. **AI クオータ計上単位は変えない**。1 リクエスト = 1 消費の現状を維持
   （`mode='ingredients'` でも `mode='recipes'` でも +1 ずつ）。レシピを
   生成しなければユーザーの 1 日のクオータ消費は減る方向に働く。
6. **`autoSaveRecipes` は recipes が返ってきた時だけ走る**。具材だけ取った
   時に空のレシピで `saved_recipes` を破壊しない。

## API 設計

### `POST /api/ai/suggest`
リクエスト:
```json
{
  "dishName": "肉じゃが",
  "mode": "ingredients" | "recipes" | "both",  // 省略時 "both"（後方互換）
  "extraIngredients": ["牛肉"]                   // 既存
}
```

レスポンス（共通形）:
```json
{
  "success": true,
  "data": {
    "ingredients": [...],   // mode が "recipes" のときは []
    "recipes": [...]        // mode が "ingredients" のときは []
  }
}
```

`mode` ごとの挙動:
- `ingredients`: 軽量プロンプトで具材のみ返す。`recipes` は `[]`
- `recipes`: 既存プロンプトでレシピ 3 件を返す。`ingredients` も派生で
  返す（マージ済み具材リスト。クライアントが具材表示の更新にも使える）
- `both`: 既存プロンプトのまま。**新規クライアントは使わない**。
  Web の旧 `/api/dishes/:id/suggest-ingredients` 経由ルートが残っている
  間の保険として残置

### 新プロンプト（具材のみ）
`buildIngredientsOnlyPrompt(dishName, extras?)` を `dish-ai.ts` に追加。
出力形式は:
```json
{ "ingredients": [{ "name": "...", "category": "..." }] }
```
`parseDishInfo` の `recipes` 無しブランチで対応する。

## フェーズ

### Phase 1: サーバ — プロンプト / ルート分岐
- [ ] `server/src/services/dish-ai.ts`
  - `buildIngredientsOnlyPrompt(dishName, extras?)` を追加
  - `parseDishInfo` を `{ ingredients?, recipes? }` 両対応に整理
    （recipes が無い JSON でも壊れないように）
- [ ] `server/src/routes/ai.ts`
  - `mode` を受け取り、`'ingredients'` のとき具材プロンプト、
    `'recipes'` / `'both'` のとき従来プロンプトに切替
  - 不正な `mode` は 400 + `error: 'invalid_mode'`
- [ ] `server/tests/unit/dish-ai.test.ts`
  - 具材プロンプトのフォーマット
  - `parseDishInfo` の recipes-only / ingredients-only / 旧形式の 3 系統
- [ ] `server/tests/integration/ai.test.ts`
  - `mode='ingredients'` で recipes が `[]`
  - `mode='recipes'` で ingredients も recipes も入る
  - `mode='both'`（省略時）が現状互換
  - `mode='xxx'` は 400
  - クオータは mode に関わらず +1

### Phase 2: モバイルクライアント
**変更対象は #1（自動発火）と新規ボタンのみ。#2「再取得」・#3「この素材でレシピを再検索」は触らない。**

- [ ] `mobile/src/api/ai.ts` に `mode` 引数を追加（型は
  `'ingredients' | 'recipes'`、デフォルトは互換維持のため `'both'`）
- [ ] `mobile/src/stores/shopping-store.ts` の `suggestIngredients`
  - 引数 `mode` を受け取れるよう拡張
  - `mode='ingredients'` のときは `recipes_json` を上書きせず、
    `autoSaveRecipes` を呼ばない
  - `mode='recipes'` / `'both'` は従来通り `recipes_json` 更新 + autoSave
- [ ] `mobile/src/components/dishes/IngredientsScreen.tsx`
  - **#1 の自動 `useEffect`（`:114-119`）のみ** `mode='ingredients'` に変更
  - レシピセクションに **新規ボタン**「レシピを生成する」を追加
    - 押下で `mode='recipes'` で API を投げ、結果を `recipes` state に反映
    - クオータ・ログイン要求は具材取得時と同じハンドリング
  - `dish.recipes_json` に既にキャッシュがあるときはボタンを出さず
    従来通りレシピカードを表示
  - **#2 `handleRefresh`（`:147-149`）と #3 `handleSearchWithExtras`
    （`:151-153`）は変更しない**。今まで通り具材+レシピ両方を再生成する
- [ ] `mobile/__tests__/stores/shopping-store.test.ts` の AI 関連テストを
  ingredients-only / recipes 込みの 2 系統で追加
- [ ] `mobile/__tests__/api/ai.test.ts` で `mode` がリクエストに乗ることを確認
- [ ] `IngredientsScreen` のレンダリングテスト（あれば）に「レシピ未生成
  時にボタンが出る」「キャッシュ有り時はボタンが出ない」を追加

### Phase 3: Web クライアント
**変更対象は #1（`addDish` 直後のバックグラウンド取得）と新規ボタンのみ。#2「レシピを再取得」・#3「この素材でレシピを再検索」は触らない。**

- [ ] `web/app.js`
  - **#1 `fetchIngredientsInBackground`（`:976-998`）のみ** 具材取得に切替
    （`mode='ingredients'` を渡す）
  - 具材モーダルのレシピ欄に **新規ボタン**「レシピを生成する」を追加し、
    押下で `mode='recipes'` を呼んで `recipes` をキャッシュ・描画
  - 既に `recipes_json` がある料理ではボタンを出さず即表示
  - **#2 `fetchIngredientsForModal`（`:1001-`、`#ingredients-refresh`
    から呼ばれる）と #3 `#extra-search-btn` のハンドラは変更しない**
- [ ] レシピ未生成の状態を伝えるプレースホルダ（「レシピは生成されて
  いません」+ ボタン）を `index.html`/`app.js` の `#ingredients-recipes`
  に追加

### Phase 4: 動作確認
- [ ] dev サーバで **#1（自動発火）の挙動変更** を確認
  - 料理「肉じゃが」を追加 → 具材だけ自動で出る、レシピ欄は「レシピを
    生成する」ボタンが出ている、`saved_recipes` には新規行が増えない
  - 「レシピを生成する」を押す → レシピ 3 件が出て `saved_recipes` に
    3 行追加される
  - 同名料理を再追加 → 前回のレシピがあればキャッシュ表示、ボタン非表示
  - 未ログインかつ `AI_LIMIT_GUEST` 上限到達時に「レシピを生成する」を
    押すと 429 → 既存のログイン誘導/警告が出る
- [ ] **#2 / #3 が変わっていない** ことを確認（リグレッション防止）
  - 具材モーダルの「再取得」ボタン → 具材+レシピ両方が再生成される
  - 「この素材でレシピを再検索」ボタン → 追加素材を含めて
    具材+レシピ両方が再生成される
- [ ] 旧 web エンドポイント `/api/dishes/:id/suggest-ingredients` が
  `mode='both'` 互換で動く（壊していないことの確認）
- [ ] 1 日のクオータ消費が「具材のみ」では減っていることを admin の AI
  利用状況タブで確認

## 非スコープ（やらないこと）
- **#2「再取得」ボタン・#3「この素材でレシピを再検索」ボタンの挙動変更**。
  既存どおり具材+レシピ両方を再生成する。
- 「具材生成も明示ボタンに」する変更（買い物リストの主機能なので自動の
  まま）
- レシピ件数（3 件）を変える、レシピを 1 件ずつ追加生成する UI
- レシピ生成のキャンセル・部分再試行
- `saved_recipes` の自動保存ロジックそのものの再設計
  （recipes が返ってきた時のみ走る、というガードだけ追加）
- 旧 `/api/dishes/:id/suggest-ingredients` の廃止（別タスク）
- ユーザー設定で「レシピも自動」を選べるオプトイン（要望が出てから）

## 影響ファイル
- `server/src/services/dish-ai.ts`（具材プロンプト追加 / parser 整理）
- `server/src/routes/ai.ts`（`mode` 分岐）
- `server/tests/unit/dish-ai.test.ts`（更新）
- `server/tests/integration/ai.test.ts`（mode ケース追加）
- `mobile/src/api/ai.ts`（`mode` 引数）
- `mobile/src/stores/shopping-store.ts`（`suggestIngredients` 二系統化）
- `mobile/src/components/dishes/IngredientsScreen.tsx`（自動具材のみ /
  レシピボタン）
- `mobile/__tests__/stores/shopping-store.test.ts`（追記）
- `mobile/__tests__/api/ai.test.ts`（追記）
- `web/app.js`（`fetchIngredientsInBackground` の mode 化 / レシピ
  ボタン追加）

## 運用メモ
- 既存ユーザーの `dishes.recipes_json` は触らない。既に持っている
  ユーザーは今まで通りキャッシュからレシピが見える。
- `AI_LIMIT_*` の上限はそのまま。「具材のみ」呼び出しも +1 として
  数えるので、クオータの実消費は「ユーザーがレシピを見たい料理の数」に
  比例するようになる（現状: 追加した料理の数）。
- もし将来「自動でも生成したい」要望が来たら、`mode='both'` を残して
  あるので設定 1 つで戻せる。
