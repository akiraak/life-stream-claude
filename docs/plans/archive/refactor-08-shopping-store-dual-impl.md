# リファクタリング 8: `shopping-store.ts` の local / server 二重実装の解消

> **ステータス**: ドラフト（設計判断要）
> **想定規模**: 数日（Phase 単位で着地可能）
> **関連 TODO**: 「リファクタリング 8（M1）」 / 後続 M2 = リファクタリング 9（`app/(tabs)/index.tsx` 責務漏出）

## 目的・背景

`mobile/src/stores/shopping-store.ts` のほぼ全アクション（`addItem` / `addDish` /
`toggleCheck` / `deleteItem` / `link*` / `reorder*` …）が
`if (get().mode === 'local') { ... pure state mutation ... } else { ... API + (loadAll | optimistic) ... }`
の二段構えで書かれている。同じ操作のセマンティクスが 2 か所に分散しているため:

- ロジックを変更するときに片方だけ直す事故が起きやすい（例: 並び替えの既知挙動
  — ローカルは items の `position` を更新するが、サーバモードはそもそも state を触らず
  呼び出し側で `useShoppingStore.setState(...)` する設計になっている。
  → 一見壊れているように見える非対称性を持つ）
- サーバモードの「API → `loadAll()` で全件再取得」と「API → 楽観更新で済ませる」が
  操作によってまちまち（`addItem` / `addDish` / `deleteCheckedItems` /
  `link*` / `unlink*` は loadAll、`toggleCheck` / `updateItemName` /
  `deleteItem` / `updateDish` は楽観）。レイテンシ・体感も操作で揺れる
- ローカルモードのテストとサーバモードのテストが完全に分かれており、本質的に
  同じセマンティクスのアサートが二重化している
- recipe-store も同型（local/server）の二段構えなので、解法を共通化できる

最終的に「アクションの本体は 1 通り。永続化先（in-memory only / server）だけ差し替える」
形にしたい。これは TODO 9（M2: `app/(tabs)/index.tsx` の責務漏出）の前提として効く
— ストア側の API が安定するほど画面側からの「ストアを迂回した直接 API 呼び出し」
（現状 `index.tsx` に複数あり）を畳みやすくなる。

## 現状の構造（要点）

- `Mode = 'local' | 'server'`。local モードは AsyncStorage に永続化、サーバモードは API に同期
- ID 採番:
  - local モードでは `nextLocalId` から負の連番で発行
  - 一度サーバに移行したアイテム/料理/レシピはサーバ ID（正の整数）になる
- ログアウトは `setMode('local')` ではなく `setState({ mode: 'local' })` を使う。
  画面に出ていたデータを残すための意図的迂回（auth-store.ts L39-49 のコメント参照）
- ログイン後の移行 (`utils/migration.ts`) は **local モードのまま** ローカル state を
  読み出し、`/api/migrate` に渡してから `setMode('server')` + `loadAll()` する流れ
- サーバモードでも CRUD は基本「楽観更新あり」のはずだが、`addItem` / `addDish` /
  `deleteCheckedItems` / `link*` / `unlink*` だけは `loadAll()` で再取得しており不揃い
- `reorder*` はサーバモードでは state を一切触らない。呼び出し側
  （`app/(tabs)/index.tsx` の `handleReorder*`）が `useShoppingStore.setState(...)`
  で先に並び替えてから `reorderXxx` を呼ぶ。失敗時は `loadAll()` でロールバック

## 設計案（要決定）

### 案 A: Backend (Repository) パターン

`ShoppingBackend` interface を切り、`LocalBackend`（no-op）と
`ServerBackend`（既存 `api/shopping`, `api/dishes`, `api/saved-recipes` を呼ぶ）を実装。
ストアのアクション本体は **state mutation 1 通り** にし、最後に `backend.xxx(...)` を
await する。`mode` フィールドの役割は backend 選択のためのフラグに退化する。

```ts
interface ShoppingBackend {
  loadAll(): Promise<{ items: ShoppingItem[]; dishes: Dish[] } | null>; // local は null
  createItem(name: string, category?: string): Promise<ShoppingItem | null>;
  // …各操作。local は no-op or null を返す
}
```

- 利点: 二重実装が文字通りなくなる。テストは「state の遷移」と「backend の呼び出し」を
  別々に検証できる。新モード（例: 端末間同期付きキャッシュ）を入れる余地が広がる
- 欠点: 抽象が 1 段増える。ID 採番（local は負の値、server は API 戻り値）の扱いは
  backend 側に逃がすことになるので、`createItem` 系は「サーバ ID で楽観更新」に揃える
  必要がある（後述の正規化と同時にやる）

### 案 B: 単一本体 + サーバ呼び出しゲート

mode 分岐を潰す代わりに backend 抽象は作らず、各アクションを
「state を更新する → server モードなら追加で API を叩く」の 2 ステップに揃える。

- 利点: 構造変更が最小。差分が読みやすい
- 欠点: アクションごとに `if (mode === 'server') await api.xxx(...)` が散在し続ける。
  「重複は減ったが分岐は残っている」状態。recipe-store にも同じことを書くので、
  共通化のうまみは案 A より小さい

### 案 C: local モード自体を廃止

サーバ必須にしてしまう案。ログイン前は read-only / モック。

- 利点: ストアは API 一本。最も単純
- 欠点: 「未ログインでも基本機能を使える」という既存の UX を壊す。スコープが大きすぎる
  ので **このリファクタの選択肢からは外す**（別タスクで意思決定するべき）

→ 第一候補は **案 A**。ただし案 A に進む前に「サーバモードの不揃いな挙動の正規化」
（Phase 2）を済ませておかないと、backend にロジックを切り出した瞬間に挙動が変わる
リスクがある。

## Phase / Step

### Phase 1: 監査とインベントリ作成（実装なし）

- [x] 全アクションについて `local` / `server` のセマンティクスを表で並べる
  （optimistic vs loadAll-after / state を触るか / 失敗時のロールバック有無）
- [x] 呼び出し側（`app/(tabs)/index.tsx`、`recipes.tsx`、`IngredientsScreen.tsx`、
  `use-dish-suggestions.ts`、`migration.ts`、`auth-store.ts`）からの依存表現を確認し、
  「ストアの API を変えると壊れるところ」を列挙
- [x] テスト一覧（`__tests__/stores/shopping-store.test.ts` ほか）から、
  どのケースが local 専用 / server 専用 / 共通かを仕分け

> 結果は本ファイル末尾「Phase 1 監査結果」に集約。

### Phase 2: サーバモードの挙動正規化（リファクタ準備）

意図: backend 抽象を入れる前に、サーバモードの「loadAll-after」と「楽観更新」の
混在を片寄せする。原則 **全部楽観更新** とする（不要な GET を消す → 体感も改善）。

- [x] `addItem` / `addDish`: API 戻り値の正規 ID で楽観 push、`loadAll()` を削除
- [x] `deleteCheckedItems`: 削除対象 ID をローカルで把握 → API → 該当 ID を state から削除
- [x] `linkItemToDish` / `unlinkItemFromDish`: API → state の `dish_id` 更新だけで済ませる
- [x] `deleteDish`: 既に楽観に近い（API → loadAll）。loadAll を消して `deleteItem` と
  揃える
- [x] テスト追加: 楽観更新後に state がどうなっているかを server モードでも assert
- [x] 失敗時の挙動を整理: 現状ほぼ throw → 呼び出し側 Alert。ロールバックは入れない方針
  （UX 上の決定としてプランに明記）

> 完了メモ（2026-04-27）:
> - 6 アクション（`addItem` / `addDish` / `deleteCheckedItems` / `deleteDish` /
>   `linkItemToDish` / `unlinkItemFromDish`）の `loadAll-after` を削除し、API → 共有
>   `set` で state mutation する形に統一した。**local モードと server モードの本体が
>   ほぼ揃った**ので Phase 3 で backend interface に切り出す土台が整った
> - `addItem` / `addDish` は **両モードとも先頭挿入**（`[item, ...s.items]` /
>   `[dish, ...s.dishes]`）に変更した。理由はサーバ側 `createItem` / `createDish` が
>   `position=0` を採番して既存を +1 する仕様で、これまで loadAll 後に「新着が先頭」と
>   見えていた UX を維持するため。**local モードはこれまで末尾追加だったので UX が変わる**
>   が、（a）pre-login の一時 UI、（b）migration は array 順をそのまま `position` に
>   写すので login 後の見え方と整合、の 2 点で許容と判断
> - 失敗時のロールバックは入れず、API 例外をそのまま throw する方針を維持
>   （呼び出し側で Alert する既存パターンを温存）。Phase 3 で backend 抽象を入れる際に
>   再検討
> - 既存の server `addItem` テスト（loadAll 呼出を assert）を「prepend されたか」を見る
>   形に書き換え、`addDish` / `deleteCheckedItems` / `deleteDish` /
>   `linkItemToDish` / `unlinkItemFromDish` の server モード楽観テストを追加
>   （計 5 件）。`npm test` 全 79 件グリーン

### Phase 3: `ShoppingBackend` 抽象の導入

- [x] `mobile/src/stores/backends/shopping-backend.ts` を新設し、interface と
  `LocalShoppingBackend` / `ServerShoppingBackend` を実装
- [x] ストアは `mode` から backend を選び、アクション本体は単一に
- [x] ID 採番（local の `nextLocalId`）は LocalBackend 内に閉じ込める
- [x] `setMode` の役割は「保持データを切る + backend 切替」になるよう整理。
  ログアウト時の「データを残しつつ mode だけ戻す」迂回は引き続きサポート（テスト追加）

> 完了メモ（2026-04-27）:
> - `shopping-backend.ts` に `ShoppingBackend` interface と
>   `createLocalShoppingBackend(allocator)` / `createServerShoppingBackend()` を実装。
>   factory 形式にして `class` を避け、ID allocator は注入。LocalBackend は loadAll で
>   `null` を返す規約にし、その他 update / delete / link / unlink / reorder / cache 系は
>   no-op、createItem / createDish のみ負 ID で record を組み立てて返す
> - `shopping-store.ts` の各アクションから `if (mode === 'local') ... else ...` 分岐を
>   排除し、`backend = backendFor()` → `await backend.xxx(...)` → 共通 `set(...)` に統一。
>   backend インスタンスは store 構築時に 1 度だけ生成し、`backendFor()` が
>   `get().mode` を毎回読み直すので、`setState({ mode: 'local' })` 迂回でも次のアクションが
>   正しく local backend を選ぶ（auth-store.logout 経路の温存）
> - `nextLocalId` の採番は `LocalShoppingBackend` の allocator closure に閉じ込め、
>   store の `set/get` に委譲する形にした。永続化スキーマ（`partialize`）は変更なし
> - reorder 系（`reorderItems` / `reorderDishes` / `reorderDishItems`）は本タスクの
>   非スコープのため、現状の非対称（server は state を呼び出し側に任せる）を保つ。
>   `if (mode === 'local')` の早期 state 更新だけは残し、その後 `backend.reorder*` を呼ぶ
>   （local backend は no-op、server backend は API 呼出）。完全な単一化は refactor-09 で
>   `index.tsx` の `setState` 直書きと一緒に整理する
> - `loadAll` の `loading` フラグはサーバモード時だけ立てる従前挙動を保つために
>   `if (mode === 'local')` の早期 return を残した（local の loadAll は dish.items 派生
>   再構築のみで瞬時に終わるため、loading フラグを立てるとフリッカーになる）
> - 新規テスト 2 件追加: `setState({ mode: 'local' })` で items/dishes が残ること、
>   迂回後の `addItem` が local backend を選んで負 ID を採番し API を叩かないこと。
>   `npm test` 全 81 件グリーン（既存 79 + 新規 2）。`tsc --noEmit` もクリーン

### Phase 4: recipe-store にも同じパターンを適用

- [x] `RecipeBackend` 抽象を切る or `ShoppingBackend` を一般化して再利用
- [x] `autoSaveRecipes` / `deleteSavedRecipe` / `loadSavedRecipes` を一本化

> 完了メモ（2026-04-27）:
> - `mobile/src/stores/backends/recipe-backend.ts` に `RecipeBackend` interface と
>   `createLocalRecipeBackend(allocator)` / `createServerRecipeBackend()` を実装。
>   `ShoppingBackend` の一般化ではなく、データ型 (`SavedRecipe`) が違うので **専用 interface**
>   を切った。`LocalIdAllocator` は構造的に同型のため両ファイルで同名 interface を持つが、
>   3 行の trivial type なので shared 化はせず重複を許容
> - `recipe-store.ts` の `loadSavedRecipes` / `deleteSavedRecipe` / `autoSaveRecipes` から
>   `if (mode === 'local') ... else ...` 分岐を排除し、`backend = backendFor()` →
>   `await backend.xxx(...)` → 共通 `set(...)` に統一。backend インスタンスは store 構築時に
>   1 度だけ生成し、`backendFor()` が `get().mode` を毎回読み直すので、`setState({ mode: 'local' })`
>   迂回（`auth-store.logout`）でも次のアクションが正しく local backend を選ぶ
> - `nextLocalId` の採番は `LocalRecipeBackend` の allocator closure に閉じ込め、store の
>   `set/get` に委譲する形にした。永続化スキーマ（`partialize`）は変更なし
> - `loadSavedRecipes` の `loading` フラグはサーバモード時だけ立てる従前挙動を保つために
>   `if (mode === 'local')` の早期 return を残した（local backend は no-op で瞬時に終わる
>   ため、loading フラグを立てるとフリッカーになる）
> - 既存テストは API 形が変わらないためそのままグリーン。新規テスト 4 件追加:
>   server モード `deleteSavedRecipe` の楽観テスト 1 件、`setState({ mode: 'local' })` 迂回の
>   ガード 3 件（savedRecipes 保持 / 後続 autoSaveRecipes が local backend / 後続 deleteSavedRecipe
>   が local backend）。`npm test` 全 85 件グリーン（既存 81 + 新規 4）。`tsc --noEmit` もクリーン

### Phase 5: テスト整理 & 動作確認

- [x] `shopping-store.test.ts` を「state mutation のテスト」「backend 呼び出しのテスト」に
  再構成（mode 別の重複を削減）
- [x] `migration.test.ts` が依然グリーンであることを確認（local→server の入口）
- [x] Expo Go で実機/シミュレータ動作確認（**ユーザー手元で実施 — 2026-04-27 完了**）
  - 未ログイン状態の追加・編集・削除・並び替え
  - ログイン後（`/api/migrate` 経由）でデータが残っているか
  - ログアウト後にデータが画面に残るか（auth-store の意図的迂回が引き続き効くか）
  - AI 具材提案 → `dishes/<id>/ai-cache` への保存

> 完了メモ（2026-04-27）:
> - **backend 単体テストを新設**: `mobile/__tests__/stores/backends/shopping-backend.test.ts`
>   を追加し、`createLocalShoppingBackend` の ID 採番 / no-op 性 / loadAll=null と、
>   `createServerShoppingBackend` の API 転送をすべて直接アサート（13 件）。
>   ID allocator は注入式なので backend 単体でテストできる
> - **store テストを再構成**: `__tests__/stores/shopping-store.test.ts` の構成を
>   「state mutations / backend selection / reorder asymmetry / suggestIngredients /
>   setMode / logout pathway」の 6 ブロックに整理。state 遷移は backend 抽象化により
>   mode 非依存になっているので、**state mutation テストは server モード一択** に揃え、
>   local 用に重複していたアサートを削除。代わりに backend selection で「mode フラグが
>   正しい backend を選ぶ」ことだけを検証
> - **抜け落ちていたカバレッジを補完**: `updateItemName` / `updateDish` / `loadAll` /
>   server モードの reorderItems（state 非触り）/ server モードの suggestIngredients
>   ベストエフォート cache 書込・失敗 swallow を新たに追加
> - reorder 系の意図的非対称（server は store が state を触らない、refactor-09 に持ち越し）
>   を「reorder asymmetry」セクションに明記し、local/server 両モードで挙動を assert する形に
>   移行。`index.tsx` 側の `setState` 直書きとの噛み合わせは refactor-09 で吸収する
> - 結果: shopping-store 関連は 19 → 27 件（+ backend テスト 13 件新設）。`npm test` 全 105 件
>   グリーン（既存 85 + 新規 20）。`tsc --noEmit` クリーン。`migration.test.ts` も無修正で通過
> - **Expo Go 実機確認**は本セッションでは未実施。ユーザー側で `npx expo start` から
>   no-login / login / logout の 3 シナリオを通したうえで、本タスクを完了扱いに移すこと

## 影響範囲

- `mobile/src/stores/shopping-store.ts` （主対象）
- `mobile/src/stores/recipe-store.ts` （Phase 4）
- `mobile/src/stores/auth-store.ts` （`setState({ mode: 'local' })` の迂回が引き続き効く確認）
- `mobile/src/utils/migration.ts` （ローカル state 読み出しの API 形が変わらないか確認）
- `mobile/__tests__/stores/shopping-store.test.ts`
- `mobile/__tests__/stores/recipe-store.test.ts`
- `mobile/__tests__/utils/migration.test.ts`
- 副次的に `app/(tabs)/index.tsx` / `recipes.tsx` / `IngredientsScreen.tsx` でストア API
  シグネチャ変更があれば追従

## 非スコープ

- `app/(tabs)/index.tsx` の責務漏出整理（リファクタリング 9 / M2）。本タスクは
  **ストア側の整理に限定** し、画面が直接 API を叩いている箇所の畳み込みはやらない
- 認証フロー変更（passkeys 等）
- サーバ側 API の変更
- `local` モードを廃止するかどうかの戦略判断

## テスト方針

- 単体: `mobile/__tests__/stores/shopping-store.test.ts` を Phase 単位で更新。
  `LocalShoppingBackend` を直接インスタンス化してテストできるようにする
- 結合: `__tests__/utils/migration.test.ts` がそのままグリーンであることが
  「local→server 切替境界が壊れていない」ことの主要シグナル
- 手動: Expo Go で no-login / login / logout の 3 シナリオを通す

## 決定が必要な点

1. **抽象方針**（案 A / 案 B）— 第一候補は案 A。承認 or 別案でやり直し
2. **サーバモードを全部楽観に揃える方針**（Phase 2）の是非
   — 体感は良くなるが、API レスポンスを信用しなくなるので、サーバ側で
   生成されたフィールド（`created_at` 等）の楽観値が一時的にずれる
3. **失敗時にロールバックを入れるか**（現状ほぼ throw のみ）
   — 入れるなら抽象化のついでに各アクションでスナップショット → 失敗時 restore

## Phase 1 監査結果（2026-04-27）

### A. アクション別セマンティクス一覧

凡例:
- **書込パターン**: A = 「API → 共有 state mutation」 / B = 「API → loadAll() 全件再取得」 / C = 「API only, state は呼び出し側」
- **store が state を触るか**: server モード時の挙動。○=触る / ×=触らない
- **ロールバック**: 失敗時に store 側で復元するか

| # | アクション | local モード | server モード | 書込 | state 触るか | rollback | 備考 |
|---|---|---|---|---|---|---|---|
| 1 | `loadAll` | `rebuildDishItems` で派生 dish.items を再構築 | `getAllItems` + `getAllDishes` 並列取得 → set | — | ○ | × | `loading` フラグはここのみで立つ |
| 2 | `addItem` | 負 ID 採番 → push → rebuild | `createItem` → `loadAll()` | **B** | ○ (loadAll) | × | 不揃い |
| 3 | `updateItemName` | 共通の `set` 経由で name 差替 | `updateItem(name)` → 共通 set | A | ○ | × | mode 分岐は API 呼出有無のみで、state 更新は両モード共通 |
| 4 | `toggleCheck` | 共通 set で checked 差替 | `updateItem(checked)` → 共通 set | A | ○ | × | 同上 |
| 5 | `deleteItem` | 共通 set で filter | `deleteItem(id)` → 共通 set | A | ○ | × | 同上 |
| 6 | `deleteCheckedItems` | local で checked id を集めて filter | `deleteCheckedItems()` → `loadAll()` | **B** | ○ (loadAll) | × | 戻り値は server 側カウント |
| 7 | `reorderItems` | items の `position` 更新 | `reorderItems(ids)` のみ。state は触らない | **C** | × | × | `index.tsx` 側で先に `setState` する設計 |
| 8 | `addDish` | 負 ID 採番 → push | `createDish` → `loadAll()` | **B** | ○ (loadAll) | × | 不揃い |
| 9 | `updateDish` | 共通 set で name 差替 | `updateDish(name)` → 共通 set | A | ○ | × | |
| 10 | `deleteDish` | items の `dish_id` を null 化 → dish 削除 → rebuild | `deleteDish(id)` → `loadAll()` | **B** | ○ (loadAll) | × | local では unlink を内部で行うが、server は loadAll に任せる |
| 11 | `reorderDishes` | dishes を ordered Ids でソート | `reorderDishes(ids)` のみ | **C** | × | × | 同上 |
| 12 | `reorderDishItems` | items.position 更新 + dish.items ソート | `reorderDishItems(...)` のみ | **C** | × | × | 同上 |
| 13 | `suggestIngredients` | AI 呼出 → dish の `ingredients_json/recipes_json` 更新 → recipe-store.autoSave | 同上 + best-effort `updateDishAiCache` | A 派生 | ○ | × | server cache 失敗は noop で潰す唯一の挙動 |
| 14 | `linkItemToDish` | items の dish_id 更新 → rebuild | `linkItemToDish` → `loadAll()` | **B** | ○ (loadAll) | × | 不揃い |
| 15 | `unlinkItemFromDish` | items の dish_id null 化 → rebuild | `unlinkItemFromDish` → `loadAll()` | **B** | ○ (loadAll) | × | 不揃い |

要点:
- パターン B（loadAll-after）は **6 アクション**: `addItem` / `addDish` / `deleteCheckedItems` / `deleteDish` / `linkItemToDish` / `unlinkItemFromDish`。Phase 2 で全部 A に揃えるのが目標
- パターン C（state 非触り）は **3 つの reorder*** だけ。呼び出し側 (`index.tsx` の `handleReorder*`) が `useShoppingStore.setState(...)` を先に行う前提で動く
- store 側のロールバックは現状ゼロ。失敗時はほぼ throw → 呼び出し側 Alert。reorder の rollback は呼び出し側で `loadAll()` に任せている

### B. 呼び出し側依存マップ

| 呼出元 | 購読する state | 呼ぶアクション | API 直叩き / setState 迂回 |
|---|---|---|---|
| `app/_layout.tsx` | `useAuthStore` | `setMode`, `loadAll`, `loadSavedRecipes` | — (起動時 1 回限定) |
| `app/(tabs)/index.tsx` | `items`, `dishes`, `loading` | `loadAll` `addItem` `updateItemName` `toggleCheck` `deleteItem` `addDish` `deleteDish` `linkItemToDish` `reorderItems` `reorderDishes` `reorderDishItems` | **直叩き**: L132-134 の `dishesApi.unlinkItemFromDish/linkItemToDish` + `loadAll()`、L240-246 のドラッグ移動も同じ。**setState 迂回**: `handleReorderDishes/DishItems/UngroupedItems` で先に `useShoppingStore.setState(...)` |
| `app/(tabs)/recipes.tsx` | `savedRecipes`, `loading` (recipe-store) | `loadSavedRecipes`、shopping-store の `addDish` `addItem` `linkItemToDish` | — |
| `src/components/dishes/IngredientsScreen.tsx` | `dishes`（liveDish セレクタ） | `addItem` `linkItemToDish` `loadAll` | — |
| `src/components/dishes/DishNameHeader.tsx` | — | `updateDish` | — |
| `src/hooks/use-dish-suggestions.ts` | — | `suggestIngredients`（`getState()` 経由） | — |
| `src/utils/migration.ts` | `items` `dishes`（local）、`savedRecipes`（recipe-store） | 読み出しのみ。store の mutation は呼ばない | — |
| `src/stores/auth-store.ts` | — | `finishLogin`: `setMode('server')` + `loadAll` + `loadSavedRecipes`。`logout`: **`useShoppingStore.setState({ mode: 'local' })` 直書き** で items/dishes を残す | 意図的迂回（`auth-store.ts` L39-49 のコメント参照） |

「ストアの API を変えると壊れるところ」:
- **アクションのシグネチャ**（戻り値含む）: `addItem` は `Promise<ShoppingItem>` を返し、`index.tsx` `handleSubmitItem` と `IngredientsScreen.handleToggleIngredient` が戻り値の `id` を `linkItemToDish` に渡す。`addDish` も `Promise<Dish>` で `recipes.tsx` `handleAddToList` が `dish.id` を後段で使う。**Phase 2 で `loadAll()` を消す際、必ず API 戻り値の正規 ID を含む `ShoppingItem`/`Dish` を返し続けること**
- **`reorder*` の "store は state を触らない" 前提**: `index.tsx` の `handleReorderXxx` が先に `setState` してから `reorder*` を呼ぶ。Phase 2 で reorder も store が state を持つようにする場合、呼び出し側の事前 `setState` は冗長になるが結果は変わらない（後から store 側の更新が上書き）。Phase 3 で抽象化したあとに `index.tsx` 側を整理するのは **M2 / refactor-09 のスコープ**
- **`useShoppingStore.setState({ mode: 'local' })` の意図的迂回**: `auth-store.logout` の挙動。`setMode` を呼ぶと items/dishes が空配列でクリアされてしまうため、**Phase 3 で `setMode` の役割を変える際もこの抜け道を残すこと**（`auth-store.test.ts > logout` がガード）
- **`linkItemToDish/unlinkItemFromDish` を `index.tsx` が API 直叩きしている件**（L132-134, L240-246）: 本タスクの非スコープ（refactor-09 で畳む）。Phase 2 で store 側の link/unlink を楽観に揃えると、refactor-09 で「直叩き → store 経由」に置換するのが容易になる、という関係

### C. テスト分類

`mobile/__tests__/stores/shopping-store.test.ts`（全 11 ケース）:
- **server 専用**（mode='server' で resetStore）
  - `addItem`: API 呼出 + loadAll 後の state を assert → **Phase 2 で loadAll を消すため書き換え必要**
  - `toggleCheck > optimistically flips ...`: 楽観更新の assert（維持）
  - `toggleCheck > does not touch unrelated items`（維持）
  - `reorderItems > forwards ordered ids to the api`: state 非触りを暗黙に確認（維持。Phase 2/3 で store が state も持つ方針にするなら追記）
  - `deleteItem > removes the item from state and nested dishes without reloading`（維持。すでに楽観）
- **local 専用**（mode='local'）
  - `addItem stores locally with a negative id`
  - `addDish and linkItemToDish wire the item into the dish locally`
  - `toggleCheck and deleteItem work locally without api calls`
  - `deleteCheckedItems removes only checked items locally`
  - `suggestIngredients calls /api/ai/suggest, caches to dish, and auto-saves recipes locally`
  - `suggestIngredients marks quota exceeded when AiQuotaError is thrown`
- **mode 切替**
  - `setMode > clears items/dishes when switching modes`
  - `setMode > is a no-op when the mode is unchanged`
- **本来共通であるべき**（現状 local だけにある or 片方だけにあるが、両モードで効くべき）
  - `suggestIngredients` の cache 書き戻し → server モード版が無い（Phase 5 で追加検討）
  - `linkItemToDish` の楽観更新後の state 形 → server モードでは存在しない（Phase 2 後に追加）
  - `addDish` の戻り値が dish オブジェクトとして使える → server モードで未検証
  - `deleteCheckedItems` の戻り値カウント → server モードで未検証

`mobile/__tests__/stores/recipe-store.test.ts`（全 6 ケース）:
- **server 専用**: `loadSavedRecipes fetches`、`autoSaveRecipes posts bulk and prepends`
- **local 専用**: `loadSavedRecipes is a no-op`、`autoSaveRecipes assigns negative ids`、`deleteSavedRecipe removes locally only`
- **mode 切替**: `setMode clears state`
- 共通化候補: server 版 `deleteSavedRecipe` の楽観テストが無い（local 側にしか存在しない）

`mobile/__tests__/utils/migration.test.ts`（全 5 ケース）:
- 全て **mode 横断のシナリオ**（local→server 入口の境界テスト）。Phase 3 以降で抽象化を入れるとき、ここがグリーンであることが「local→server の橋が壊れていない」主要シグナル

`mobile/__tests__/stores/auth-store.test.ts`（要点）:
- `finishLogin` 系: **`setMode('server')` + `loadAll()` + `loadSavedRecipes()` の流れに依存**。Phase 3 で `setMode` の役割が変わっても、この呼出シーケンスは維持する必要あり
- `logout` 系: **`useShoppingStore.setState({ mode: 'local' })` 直書きで items/savedRecipes が残ることを assert**。Phase 3 抽象化時に backend 切替と state 保持を独立させること
- `cancelLogin` / `verify`: ローカルデータが消えないことを assert

### D. Phase 1 結論（次フェーズへの申し送り）

1. **Phase 2 で潰すべき不揃いは 6 アクション**（addItem / addDish / deleteCheckedItems / deleteDish / linkItemToDish / unlinkItemFromDish）。全て「API → loadAll」を「API → 楽観 set」に変える。`addItem`/`addDish` は API 戻り値の正規 ID をそのまま push する形が必要
2. **reorder 系の "state は呼び出し側"** は本タスクのスコープでは触らず Phase 2/3 で現状維持。store が state も持つように寄せるかは設計判断が必要だが、寄せると `index.tsx` 側の `setState` 直書きと衝突しないので将来的に refactor-09 で吸収できる
3. **抽象化（Phase 3）で守るべき抜け道**:
   - `auth-store.logout` の `setState({ mode: 'local' })` 経由の "mode だけ変えてデータ残す" 迂回
   - `addItem`/`addDish` の戻り値（呼び出し側が `id` を後段で使う）
   - `migration.ts` がローカル state を **直接読み出す** ので、`items`/`dishes`/`savedRecipes` のフィールド形は変えない
4. **Phase 5 で追加すべき server-mode テスト**:
   - `addItem` / `addDish` の楽観 push（loadAll が消えた後の state shape）
   - `linkItemToDish` / `unlinkItemFromDish` の楽観反映
   - `deleteCheckedItems` の戻り値 + state filter
   - `suggestIngredients` server モードの cache 書き戻し（`updateDishAiCache` 失敗が swallow されること）
   - `deleteSavedRecipe` server モード（recipe-store）

→ 設計案 A（Backend 抽象）への進行は妥当。先に Phase 2 で server モードを楽観に揃えてから抽象化すれば、`LocalBackend` は no-op に近く、`ServerBackend` は ID 採番だけが本質的な分岐になる見込み。
