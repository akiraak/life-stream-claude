# AI 取得フローを「レシピ取得 1 系統」に統一する

## 目的
AI フロー周りで「2 系統あって複雑になっている」部分を整理して、サーバ /
クライアント / UI を 1 本道にする。**サーバ DB の AI キャッシュ
（`dishes.ingredients_json` / `recipes_json`）は引き続き使う**（料理画面を
再度開いたとき前回の AI 結果を復元するため）。

### 廃止対象

#### (1) 「具材のみ AI 取得」の系統と専用ボタン
- クライアント側「具材を AI で取得」ボタン（`IngredientsScreen` の empty
  状態に表示される唯一のボタン。AI 呼び出しの入口が 2 種類ある原因）
- `suggestAi(..., mode)` の `'ingredients' | 'recipes' | 'both'` 分岐
- サーバ `POST /api/ai/suggest` の `mode` 受け取りとプロンプト切替
- `buildIngredientsOnlyPrompt`（具材だけを要求するプロンプト）
- `parseDishInfo` の「具材のみ形式 `{ ingredients: [...] }`」を扱う分岐

呼び出し元は `IngredientsScreen` の empty 状態専用ボタンのみで、
`mode='recipes'` 経路は完全な dead code。具材は本来「レシピに必要な材料」
なので、レシピ取得と切り離して取得する意味がない。

#### (2) `createDish()` の同名再登録時キャッシュ継承
- [`dish-service.ts:44-52`](../../server/src/services/dish-service.ts) で、
  新規料理を `INSERT` する直前に同名の過去料理を `SELECT` し、
  `ingredients_json` / `recipes_json` をコピーして引き継いでいる
- 「料理を削除して同じ名前で再登録したのに、消したはずの AI 結果が復活して
  いる」という挙動になっており、ユーザの意思（= 削除）を裏切っている
- 同名は別物として扱う（料理ごとに `id` が一意なので、それで識別）

### 残すもの
- `dishes.ingredients_json` / `dishes.recipes_json` カラム … **キャッシュ
  として引き続き使う**
- `PUT /api/dishes/:id/ai-cache` エンドポイント … 残す
- `IngredientsScreen` の useEffect でのキャッシュ読み込み（54-74 行目）… 残す
- `suggestIngredients` の DB 書き戻し（Zustand + `updateDishAiCache`）… 残す
- `addDish` ローカル分岐の `ingredients_json: null` 初期化 … 残す
- `migrate.ts` の `LocalDish.ingredients` / `recipes` 受け取り … 残す
- `Dish` 型の `ingredients_json` / `recipes_json` フィールド … 残す

### 問題点まとめ
- 「具材だけ取得」と「レシピ取得（具材も派生）」の 2 系統があるため、
  `IngredientsScreen` の「empty 状態のときだけ別ボタン」という分岐が必要に
  なっていて読みにくい
- `mode='recipes'` は dead code、`mode='both'` は省略時のデフォルトで実質
  `mode='ingredients'` 以外の全パターン → mode 引数自体ほぼ意味なし
- `createDish` の隠れたデータ継承が、料理削除→同名再登録時の挙動を
  読みにくくしている。テストもユーザも気付きにくい
- ボタン文言が 4 種類（「具材を AI で取得」/「レシピを AI で取得」/
  「レシピを再検索」/「この素材でレシピを再検索」）あり、状態に応じた
  分岐ロジックが複雑

### 廃止後の UX ルール
1. **料理画面（`IngredientsScreen`）を開いたとき、`dish.ingredients_json` /
   `dish.recipes_json` に DB キャッシュがあれば読み込んで表示する**
   （現状の useEffect 仕様を維持）
2. **AI 呼び出しボタンは状態によって 2 通り**（押すと AI がレシピを生成し、
   各レシピに含まれる具材も同時に画面表示する。**結果は DB に保存され、
   次回画面を開いたときに復元される**）:
   - **(a) 何も独自具材を追加していない状態**で料理画面を開いた場合:
     - ボタン文言: **「レシピをAI検索（残り X 回）」**
   - **(b) 自分で独自の具材を追加した状態**（= `dish.items` に未チェックが
     ある）で料理画面を開いた場合:
     - **「追加素材」** セクションにユーザが追加した具材チップを表示
     - ボタン文言: **「この素材でレシピをAI検索（残り X 回）」**
     - 押すと、その追加素材を必ず使うようにレシピを AI 取得する
3. **AI 取得後にレシピが既に表示されている状態**でも、上記 (a)/(b) と
   同じ「もう一度 AI 取得」のボタンを出す（既存仕様の踏襲）。文言は
   `(a)` / `(b)` と同じものを使い、「再検索」という別文言は使わない
4. **同名再登録は別の料理として扱う**: 料理を削除して同じ名前で再登録
   した場合、新しい料理として作成され、削除した料理の AI 結果は引き継が
   ない（DB キャッシュが空の状態で開く）

## 現状

### サーバ側
- **AI 呼び出し**（[`ai.ts`](../../server/src/routes/ai.ts)）
  - `POST /api/ai/suggest` はステートレス。結果を DB に保存せず返すだけ
  - body の `mode` で 3 通りに分岐:
    - `SuggestMode = 'ingredients' | 'recipes' | 'both'`（11-12 行目）
    - `mode='ingredients'` → `buildIngredientsOnlyPrompt`、それ以外
      （`'recipes'` / `'both'` / 省略）→ `buildDishInfoPrompt`（36-38 行目）
    - `mode='recipes'` 経路はクライアントから呼ばれていない（dead code）
- **AI プロンプト**（[`dish-ai.ts`](../../server/src/services/dish-ai.ts)）
  - `buildIngredientsOnlyPrompt(dishName, extras?)`（46-63 行目）… 具材のみ要求
  - `parseDishInfo` の 98-103 行目に「`{ ingredients: [...] }` 形式」を扱う
    分岐があり、`mode='ingredients'` のレスポンス専用
- **`dish-service.ts` の `createDish`**（[`dish-service.ts:39-62`](../../server/src/services/dish-service.ts)）
  - 同名最新料理を `SELECT` し、`ingredients_json` / `recipes_json` をコピー
    継承して `INSERT`（44-52 行目）
  - 該当データが無いときは単純な `INSERT INTO dishes (user_id, name, position)
    VALUES (?, ?, 0)`（57 行目）

### クライアント側
- **AI API**（[`ai.ts:14-37`](../../mobile/src/api/ai.ts)）
  - `SuggestAiMode = 'ingredients' | 'recipes' | 'both'` を export（14 行目）
  - `suggestAi(dishName, extraIngredients?, mode = 'both')` がリクエスト
    body に `mode` を積む（30, 36 行目）
- **ストア**（[`shopping-store.ts:303-346`](../../mobile/src/stores/shopping-store.ts)）
  - `suggestIngredients(dishId, extras?, mode = 'both')` が API を呼んだあと、
    `mode === 'ingredients'` の枝（320 行目）では `recipes_json` を温存し、
    それ以外では両方を Zustand `dishes[]` に書き戻し + `updateDishAiCache`
    でサーバ DB へ書き込む
- **画面**（[`IngredientsScreen.tsx`](../../mobile/src/components/dishes/IngredientsScreen.tsx)）
  - `useEffect` で初回マウント時に `dish.ingredients_json` / `dish.recipes_json`
    を `JSON.parse` して state に流し込む（54-74 行目、= キャッシュ復元）
  - `ingredients.length === 0` のときは empty section と「具材を AI で取得」
    ボタン（314-320 行目）。`handleFetchIngredients`（142-144 行目）が
    `fetchSuggestions(undefined, 'ingredients')` を呼ぶ
  - `refreshLabel`（216-220 行目）は `extraIngredients` / `recipes` の長さ
    で 3 分岐（「この素材でレシピを再検索」「レシピを AI で取得」
    「レシピを再検索」）

### テスト
- サーバ:
  - [`tests/integration/ai.test.ts:162-240`](../../server/tests/integration/ai.test.ts)
    の `describe('mode parameter', ...)` ブロックが `mode='ingredients'` /
    `'recipes'` / `'both'` / `invalid_mode` / mode 切替時のクォータ消費を検証
  - [`tests/unit/dish-ai.test.ts:28-46`](../../server/tests/unit/dish-ai.test.ts)
    の `describe('buildIngredientsOnlyPrompt', ...)` ブロックがプロンプト
    生成を検証
  - 同名再登録時のキャッシュ継承を直接検証するテストは見当たらない
    （要再 grep: `grep -rn "ingredients_json.*name\|同名" server/tests`）
- モバイル:
  - [`__tests__/stores/shopping-store.test.ts`](../../mobile/__tests__/stores/shopping-store.test.ts)
    に `mode='ingredients'` で `recipes_json` を温存する枝のテストや、
    `suggestIngredients(..., mode)` 呼び出しシグネチャを使ったテストが存在

## 設計上の原則

1. **AI 呼び出しの入口は 1 つに統一する**。`POST /api/ai/suggest` は
   ステートレスのまま残すが、`mode` パラメータは廃止して常にレシピ
   （+ 各レシピに含まれる具材）を返す。クライアント側のボタンも 2 種類
   の文言だけにする
2. **`mode` パラメータの後方互換は作らない**。サーバ側で受け取っても
   無視するのではなく、`POST /api/ai/suggest` のリクエスト型 / バリデーション
   から完全に外す。同時リリース前提で、旧クライアントから `mode` 付きで
   POST されても無害（無視されて従来の `'both'` 相当が動く）
3. **DB キャッシュは残す**。`dishes.ingredients_json` / `recipes_json` /
   `PUT /api/dishes/:id/ai-cache` / クライアント useEffect 読込 /
   `updateDishAiCache` 書き戻しはすべて維持する。今回のスコープは
   「AI フローの入口の整理」と「同名キャッシュ継承の廃止」だけ
4. **`createDish` は『料理を作る』だけに専念**。過去の同名料理を見に行か
   ない。料理 ID で識別する以上、同名再登録は別物として扱うのが自然
5. **ボタン文言は 2 種類だけ**:
   - extras なし: 「レシピをAI検索（残り X 回）」
   - extras あり: 「この素材でレシピをAI検索（残り X 回）」
   - 「再検索」という文言は廃止し、AI 取得後でも同じ文言で出す
6. **`dish.items` が存在するときの UI**:
   - `ingredients.length === 0`（= AI 未取得）かつ `dish.items.length > 0`
     の場合、**「追加素材」セクションを既存と同じ見た目で表示**（チップは
     `+ name` 形式、破線ボーダー）。AI 取得済みのときと同じ枠を使い回す
   - そのときボタン文言は **「この素材でレシピをAI検索（残り X 回）」**、
     `handleSearchWithExtras`（= AI に extras 付きで叩く）を呼ぶ
   - AI を叩いたあとは従来通り、`dish.items` のうち AI 具材に含まれない
     ものが引き続き「追加素材」セクションに残る（ボタン文言も同じ）
7. **型の下位互換は作らない**。`SuggestAiMode` を optional として残さない。
   完全に消す（参照が消えれば型エラーで検出できる）

## 選択肢と比較

### 案 A: `mode` パラメータごと API から削除し、ボタンも消す（採用）
- サーバ `POST /api/ai/suggest` のリクエストから `mode` を読まない
- `buildIngredientsOnlyPrompt` も削除
- クライアント `suggestAi` / `suggestIngredients` / `fetchSuggestions` の
  `mode` 引数を全廃。empty 状態のボタンは「レシピをAI検索」に統合
- 利点:
  - AI 呼び出しの入口がサーバ・クライアント両方で 1 本になり、
    「どのボタンが何を呼ぶか」を読む側が迷わなくて済む
  - dead code（`mode='recipes'` 経路、`SuggestAiMode` 型）も同時に消える
  - プロンプトが 1 種類だけになるので、品質改善のとき 1 箇所だけ触ればよい
- 欠点:
  - 「具材だけ欲しい（レシピは要らない）」というユースケースを切り捨てる。
    ただし現状、それを意図した UI は存在せず、機能としても露出していない

### 案 B: ボタンだけ消して、サーバ `mode` パラメータは残す
- 利点: サーバ側を触らないのでテスト変更が小さい
- 欠点: 呼び出し元のないパラメータがサーバに残り続ける。プロンプト 2 種類
  も残る。「シンプル化」目的に合わない。却下

### 案 C: ボタンは消すが `suggestAi(mode)` API シグネチャは残す
- 利点: 将来「具材だけ取得モード」を再導入したくなったときに API 互換
- 欠点: YAGNI。型と引数だけ残しても呼び出し元がいないので、エディタの
  補完にゴミが出るだけ。却下

### 案 D: `createDish` 同名キャッシュ継承を残す
- 利点: 「同じ料理を繰り返し作る」ユーザにとって AI 呼び出し回数が減る
- 欠点: 「削除した料理の AI 結果が、新しく作った料理に勝手に紐付く」
  挙動はユーザの意思（= 削除）に反する。料理 ID と関係ない隠れた状態継承
  は読みづらく、同名異物のときに誤った結果を見せるリスクもある。却下

## API 設計

### 変更
- `POST /api/ai/suggest`
  - `mode` パラメータを廃止。リクエスト body から `mode` を読まない、
    `VALID_MODES` バリデーションも消す
  - 常に `buildDishInfoPrompt` でレシピ + 具材を生成して返す
  - レスポンス形 `{ ingredients, recipes }` は変更なし
  - 旧クライアントから `mode` 付きで POST されても無視（バリデーション
    エラーにはしない）

### 変更なし
- `PUT /api/dishes/:id/ai-cache` … キャッシュ書き戻しエンドポイント、
  そのまま残す
- `POST /api/dishes` … エンドポイントは変えないが、サーバ側 `createDish`
  サービスから「同名キャッシュ継承」処理を削除する（API 表面の挙動は
  「新規料理作成時にキャッシュは空」に変わる）
- `GET /api/dishes` / `GET /api/dishes/:id` … 変更なし
- `POST /api/migrate` … 変更なし

## フェーズ

### Phase 1: サーバ側 service / route の変更
- [ ] [`server/src/routes/ai.ts`](../../server/src/routes/ai.ts)
  - `SuggestMode` 型と `VALID_MODES` 定数（11-12 行目）を削除
  - リクエスト body から `mode` を読まない。`requestedMode` のチェック
    （26-30 行目）も削除
  - プロンプト分岐（36-38 行目）を `buildDishInfoPrompt` 直呼びに単純化
  - `buildIngredientsOnlyPrompt` の import（5 行目）を削除
  - 冒頭コメント（14-17 行目）の `mode` 説明も削除
- [ ] [`server/src/services/dish-ai.ts`](../../server/src/services/dish-ai.ts)
  - `buildIngredientsOnlyPrompt()` 関数（46-63 行目）を削除
  - `parseDishInfo` の「具材のみ形式 `{ ingredients: [...] }`」分岐
    （98-103 行目）を削除。レシピ形式と旧配列形式の分岐のみ残す
- [ ] [`server/src/services/dish-service.ts`](../../server/src/services/dish-service.ts)
  - `createDish()` の「同名過去料理からキャッシュ継承」ロジック（44-55
    行目）を削除。`UPDATE position` のあとは `INSERT INTO dishes (user_id,
    name, position) VALUES (?, ?, 0)` の単純版だけ残す（57-60 行目相当）
  - `Dish` 型 / `updateDishInfo` / 他の `ingredients_json` / `recipes_json`
    参照は触らない（キャッシュ機能は維持）

### Phase 2: サーバ側テストの更新
- [ ] [`server/tests/integration/ai.test.ts`](../../server/tests/integration/ai.test.ts)
  - `describe('mode parameter', ...)` ブロック（162-240 行目付近）を
    丸ごと削除
  - 他のテストで `.send({ ..., mode })` を渡している箇所が残っていないか
    `grep -n "mode" server/tests/integration/ai.test.ts` で確認し、あれば
    削除
- [ ] [`server/tests/unit/dish-ai.test.ts`](../../server/tests/unit/dish-ai.test.ts)
  - `buildIngredientsOnlyPrompt` の import（4 行目）を削除
  - `describe('buildIngredientsOnlyPrompt', ...)` ブロック（28-46 行目付近）
    を丸ごと削除
  - `parseDishInfo` の「具材のみ形式」を扱うテストがあれば削除
- [ ] [`server/tests/unit/dish-service.test.ts`](../../server/tests/unit/dish-service.test.ts)
  （ファイル有無は `ls server/tests/unit/` で確認）に、
  「同名再登録時に新しい料理は `ingredients_json = NULL` で作られる
  （= 過去のキャッシュを継承しない）」テストを追加。なければ
  `tests/integration/dishes.test.ts` に同等のテストを追加
- [ ] `npm test` がサーバ側で通ることを確認

### Phase 3: クライアント側 API / ストア
- [ ] [`mobile/src/api/ai.ts`](../../mobile/src/api/ai.ts)
  - `SuggestAiMode` 型（14 行目）を削除
  - `suggestAi(dishName, extraIngredients?, mode = 'both')` から `mode`
    引数を削除（30 行目）
  - `client.post(..., { dishName, extraIngredients, mode })` の `mode`
    フィールドも除外（36 行目）
- [ ] [`mobile/src/stores/shopping-store.ts`](../../mobile/src/stores/shopping-store.ts)
  - 冒頭の `import { suggestAi, AiQuotaError, type SuggestAiMode }`
    から `SuggestAiMode` を外す（7 行目）
  - `suggestIngredients` 型シグネチャ（49-52 行目）と本体（303 行目）
    から `mode` 引数を削除
  - `const ingredientsOnly = mode === 'ingredients'`（320 行目）と
    それを使う分岐をすべて削除。常に「ingredients + recipes 両方を Zustand
    に書き戻し、サーバ DB にも `updateDishAiCache` する」1 ルートに統合
  - キャッシュ書き戻し（323-346 行目）はそのまま残す（DB 保存は維持）
- [ ] `mobile/src/api/dishes.ts` の `updateDishAiCache` は触らない（残す）

### Phase 4: `IngredientsScreen` の表示ロジック
- [ ] [`mobile/src/components/dishes/IngredientsScreen.tsx`](../../mobile/src/components/dishes/IngredientsScreen.tsx)
  - **キャッシュ読み取りの useEffect（54-74 行目）はそのまま残す**
    （DB キャッシュ復元仕様は維持）
  - **「具材を AI で取得」専用ボタン関連を削除**:
    - `handleFetchIngredients`（142-144 行目）を削除
    - `fetchIngredientsLabel`（211-214 行目）を削除
    - empty section の `<TouchableOpacity onPress={handleFetchIngredients}>`
      （314-320 行目）を削除（empty 状態のボタンは `handleRefresh` 1 本に
      統合）
  - **`fetchSuggestions` の `mode` 引数を削除**（76-114 行目）:
    - 第 2 引数 `mode: SuggestAiMode = 'both'` を消す
    - `if (mode !== 'ingredients') { setRecipes(...) }`（86-89 行目）を
      無条件 `setRecipes(...)` + `setRecipeStates(...)` に
    - 冒頭の `import { AiQuotaError, type SuggestAiMode }`（18 行目）から
      `SuggestAiMode` を外す
    - `useShoppingStore.getState().suggestIngredients(dish.id, extras, mode)`
      （80-84 行目）の第 3 引数を削除
  - **`refreshLabel` の文言を 2 種類だけにする**（216-220 行目を書き換え）:
    ```ts
    const refreshLabel = useMemo(
      () =>
        extraIngredients.length > 0
          ? withRemaining('この素材でレシピをAI検索')
          : withRemaining('レシピをAI検索'),
      [extraIngredients.length, withRemaining],
    );
    ```
    旧 3 分岐（`extraIngredients` あり → 「再検索」、`recipes` 空 → 「AI で
    取得」、それ以外 → 「再検索」）はすべて廃止。`recipes.length` を見ない
  - **表示ロジックを以下に変更**:
    - `ingredients.length === 0` のとき:
      - `extraIngredients.length > 0`（= ユーザが料理に独自具材を追加済み）
        なら **「追加素材」セクションを表示**（既存 322-350 行目の
        `extraSection` レンダリングをそのまま流用。`+ name` 形式の破線
        チップ + ボタン）。ボタンは `handleSearchWithExtras` を呼ぶ
      - そうでなければ **ボタンのみ**（`handleRefresh` を呼ぶ。
        emptySection の説明文「この料理の具材はまだ取得していません。」は
        不要なので削除する）
    - `ingredients.length > 0` のときは従来通り「具材」セクション +
      （`extraIngredients` があれば）「追加素材」セクション + `refreshLabel`
      ボタン
    - `recipes.length > 0` のときも従来通り（フッターの再検索ボタンも
      新しい `refreshLabel` 文言になる）
  - 結果として AI 呼び出しの onPress は `handleRefresh`（extras なし）と
    `handleSearchWithExtras`（extras あり）の 2 種類だけになる
  - **削除する文字列リテラル**: `'具材を AI で取得'`、`'レシピを AI で取得'`、
    `'レシピを再検索'`、`'この素材でレシピを再検索'`、
    `'この料理の具材はまだ取得していません。'`

### Phase 5: クライアント側テストの更新
- [ ] [`mobile/__tests__/stores/shopping-store.test.ts`](../../mobile/__tests__/stores/shopping-store.test.ts)
  - `suggestIngredients(..., mode)` の第 3 引数を渡しているテストを修正
    （`mode` 引数自体が消えるので呼び出しシグネチャが変わる）
  - `mode='ingredients'` で `recipes_json` を温存する枝のテストを削除
    （常に両方を書き戻すように挙動が変わる）
  - `updateDishAiCache` 呼び出しのテスト・モック・assertion はそのまま
    残す（書き戻し挙動は維持）
  - `ingredients_json` / `recipes_json` を assert する箇所もそのまま残す
- [ ] `mobile/__tests__/api/ai.test.ts` 相当があれば、`suggestAi(..., mode)`
  を呼ぶテストの第 3 引数を削除し、`SuggestAiMode` import も外す
  （ファイル有無は要確認: `ls mobile/__tests__/api/`）
- [ ] `SuggestAiMode` を参照しているテストが残っていないか
  `grep -rn "SuggestAiMode" mobile/` で確認
- [ ] `npm test` がモバイル側で通ることを確認

### Phase 6: 動作確認
- [ ] サーバを dev 起動し、モバイルを Expo Go で接続
- [ ] **(a) 何も具材を追加していない料理**を新規登録 → `IngredientsScreen`
  を開く:
  - セクション類は何も出ず、「**レシピをAI検索（残り X 回）**」ボタン
    のみが画面中央に出る（旧「具材を AI で取得」ボタンは存在しないこと）
  - ボタン押下で AI レシピ + 各レシピの具材が同時に出る
  - 画面を戻って再度開くと、**今度は DB キャッシュから復元されてレシピ
    と具材が即座に表示される**（キャッシュ仕様維持の確認）
- [ ] **(b) ホーム画面で先に料理に独自具材を追加** → `IngredientsScreen`
  を開く:
  - 「**追加素材**」セクションに `+ name` 形式の破線チップで user-added
    items が出る（「具材」セクションではなく「追加素材」セクションを
    使うこと）
  - ボタン文言は「**この素材でレシピをAI検索（残り X 回）**」になっている
  - ボタンを押すと AI レシピが出て、追加した素材を含めたレシピが返る。
    画面上では「具材」セクション + 「追加素材」セクション（AI 具材に
    含まれない user-added items）+ 同じ「この素材でレシピをAI検索」
    ボタンの構成になる
- [ ] AI 取得済み状態で「この素材でレシピをAI検索」 / 「レシピをAI検索」
  ボタンを押し直すと、レシピが再生成される（旧「再検索」文言のボタンが
  存在しないこと）
- [ ] **同名再登録の動作確認**: 料理を AI 取得まで実行 → 削除 → 同じ名前
  で再登録 → `IngredientsScreen` を開いても、削除前の AI 結果は復元
  されない。empty 状態で開く（**今回の挙動変化点**）
- [ ] `saved_recipes` の「自分のレシピ」はそのまま閲覧・いいね可
- [ ] `POST /api/ai/suggest` に
  `{ "dishName": "カレー", "mode": "ingredients" }` で curl を投げて、
  `mode` が無視されてレシピ + 具材の通常レスポンスが返ることを確認
  （旧クライアント互換）

## 非スコープ（やらないこと）
- **DB スキーマ変更**: `dishes.ingredients_json` / `recipes_json` は
  そのまま残す
- **`PUT /api/dishes/:id/ai-cache` の廃止**: 残す
- **`updateDishAiCache` クライアント関数の廃止**: 残す
- `POST /api/ai/suggest` の**ステートレス性**自体は変更しない（DB 保存
  しない、外部副作用なし。`mode` 除去はあくまで入力 API の整理）
- `saved_recipes` テーブルの変更（ユーザ明示保存なのでキャッシュではない）
- `shopping_items.dish_id` 経由の料理-食材リンクの変更
- マイグレーション API（`migrate.ts` / `mobile/src/utils/migration.ts`）の
  変更。ローカルから持ち込まれた `ingredients_json` / `recipes_json` は
  引き続きサーバへ受け渡す
- 管理画面（`web/admin/`）の関連 UI 変更
- 旧バージョンのモバイルクライアントとの完全な後方互換（同時リリース
  前提だが、`mode` 付きで POST されても無害なので致命ではない）

## 影響ファイル

### 変更
- `server/src/services/dish-service.ts` … `createDish` の同名キャッシュ
  継承削除
- `server/src/services/dish-ai.ts` … `buildIngredientsOnlyPrompt` 削除、
  `parseDishInfo` の「具材のみ形式」分岐削除
- `server/src/routes/ai.ts` … `mode` パラメータ廃止、`buildDishInfoPrompt`
  直呼びに単純化
- `mobile/src/api/ai.ts` … `SuggestAiMode` 型削除、`suggestAi` から `mode`
  引数削除
- `mobile/src/stores/shopping-store.ts` … `suggestIngredients` の `mode`
  引数削除、`ingredientsOnly` 分岐削除（書き戻しロジックは維持）
- `mobile/src/components/dishes/IngredientsScreen.tsx` …
  `handleFetchIngredients` / 専用ボタン削除、`fetchSuggestions` の `mode`
  引数削除、`refreshLabel` 文言を 2 種類に統合（キャッシュ読み込み
  useEffect は残す）
- `server/tests/integration/ai.test.ts` … `mode parameter` describe
  ブロック削除
- `server/tests/unit/dish-ai.test.ts` … `buildIngredientsOnlyPrompt`
  describe ブロック削除
- `mobile/__tests__/stores/shopping-store.test.ts` … `mode` 引数 /
  `ingredientsOnly` 関連テスト整理（`updateDishAiCache` 関連はそのまま）

### 追加
- `server/tests/unit/dish-service.test.ts` または同等の場所に「同名再登録
  時にキャッシュが継承されないこと」を検証するテストを追加

### 削除
- なし（関数 / ルート単位での削除はあるがファイル単位は残る）

## 運用メモ
- 反映は「サーバ + モバイル」を同時リリースする前提。旧クライアントが
  `POST /api/ai/suggest` に `mode='ingredients'` 付きで POST してきても、
  新サーバはバリデーションせず無視するので 200 で「レシピ + 具材」が
  返る。旧クライアントは `mode='ingredients'` で叩いた場合 `recipes` を
  表示しない実装なので、ユーザから見ると挙動は従来通り（具材のみ表示）。
  新クライアントへ更新後はレシピも見える
- 同名再登録時のキャッシュ継承削除は**ユーザに見える挙動変化**:
  「料理を消して同じ名前で作り直したら AI 結果が消えた」体験になる。
  意図通り（削除した料理は別物）
- DB スキーマ変更がないのでマイグレーションのリスクなし
