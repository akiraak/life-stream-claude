# 自分のレシピに表示されるレシピの判定基準の調査

## 目的・背景

「自分のレシピ」タブ（`mobile/app/(tabs)/recipes.tsx`）に表示されるレシピの判定基準が
モード（local / server）で非対称になっており、ユーザーから見て何が「自分の」レシピなのかが
直感と一致しているか不明。本タスクではコード上の現状の判定基準を整理し、想定される
ユーザー期待とのギャップ・潜在的な不具合を洗い出した上で、仕様を維持するか変更するかを
決める判断材料を揃える。

実装変更タスクではなく **調査タスク**。本プランの成果物は次のいずれか：

1. 「現状仕様で問題なし」と結論し、判断根拠を本プランに残してアーカイブする
2. 仕様変更が必要と判断し、フォロー実装プランを別ファイルとして起こす

## 現状の判定基準（コード調査の結果）

### `mobile/app/(tabs)/recipes.tsx:24-35`

```
const base = mode === 'server' ? savedRecipes.filter((r) => r.liked) : savedRecipes;
```

- **server モード**: `savedRecipes` のうち `liked === 1` のものだけ表示
- **local モード**: `savedRecipes` を全件表示（`liked` でのフィルタなし）

### `savedRecipes` の中身

`mobile/src/stores/recipe-store.ts:75-84` で `loadSavedRecipes()` が実行されるが、
local モードでは早期 return するため API は呼ばれない（local のデータは
`autoSaveRecipes` 経由で AsyncStorage に永続化されているものをそのまま使う）。

- **server モード**: `GET /api/saved-recipes` →
  `server/src/services/saved-recipe-service.ts:26-36` の `getAllSavedRecipes(userId)`。
  自ユーザー（`sr.user_id = ?`）の `saved_recipes` を全件返す。
  `like_count` と `liked` フィールドが各行に含まれる。
- **local モード**: `recipe-store` の `savedRecipes` 配列（`autoSaveRecipes` で
  `buildLocalSavedRecipe()` が組み立てたもの。常に `liked: 0`、`like_count: 0`）。

### `saved_recipes` への投入経路

| 経路 | 関数 | 起点 |
|------|------|------|
| AI 提案後の自動保存 | `saved-recipe-service.ts:168` `autoSaveRecipes` | `shopping-store.ts:344` の `suggestIngredients` 完了時 |
| 単体保存 | `POST /api/saved-recipes` | 現状アプリから呼ばれていない（`grep -r createSavedRecipe` で UI からの呼び出しなし） |
| バルク保存 | `POST /api/saved-recipes/bulk` | `recipe-store.ts:147` の server モード `autoSaveRecipes` |

つまり実質的にレシピが `saved_recipes` に入る経路は **AI 提案実行のみ**。

### `autoSaveRecipes` の挙動（重要）

`saved-recipe-service.ts:168-215`:

1. `WHERE user_id = ? AND source_dish_id = ?` で既存の保存レシピを全件取得し、
   いいねユーザーをタイトル単位で記録
2. **既存を全削除**（`recipe_likes` も CASCADE で消える）
3. 新しい AI 結果を再 INSERT
4. タイトル一致するものだけ `recipe_likes` を復元

→ **AI を再生成すると、その料理のレシピ ID は毎回変わる**。  
→ **タイトルが変わったレシピのいいねは失われる**（仕様としては既知。
   `dish-item-demoted-on-ai-refresh.md` のアーカイブ参照）。

### 「みんなのレシピ」との対比

`saved-recipe-service.ts:38-59` `getSharedRecipes`:
`(SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) > 0`
→ **誰か 1 人でもいいねしているレシピ全件**。投稿者は自分でなくてもよい。

## 論点（要判断）

### 論点 A: server モードの「いいね済みのみ表示」は妥当か

- **現状の意図（推測）**: `saved_recipes` には自分が一度でも AI 生成した料理の
  全レシピ（普通は 1 料理 3 件）が溜まる。すべて表示すると「自分のレシピ」が
  一気に膨れ上がるため、明示的にいいねしたものだけ「お気に入り」として残す UX。
- **問題点**:
  - ユーザー視点で「自分のレシピ＝自分が作った／提案された全レシピ」と
    解釈する余地があり、いいねしないと消える挙動は驚きになりうる
  - server モードのユーザーは「自分のレシピ」タブを「お気に入り」として
    使っているのか、「履歴」として使っているのかが不明
  - サーバ側で full list を返してクライアントで `liked` フィルタしているのは
    無駄（通信量・パース）。サーバで絞るべき

### 論点 B: local / server のモード非対称は妥当か

- local モードは AsyncStorage に保存済みの全 AI レシピを表示
- server モードは `liked === 1` のみ表示
- 同じ「自分のレシピ」というラベルで挙動が異なる → 移行時（local → server ログイン）に
  突然レシピが消えたように見える可能性
- `auth-store.ts` のログイン時マージ挙動は別途確認が必要（local の savedRecipes が
  server に同期されるかどうか）

### 論点 C: AI 再生成での全削除＆再挿入 + タイトル一致いいね復元

- タイトルが微妙に変わる（句読点・表記ゆれ）といいねが消失
- ID が毎回変わるため、外部から `saved_recipes.id` を参照していた場合に壊れる
  （現状は ID 参照は `toggleLike` / `delete` のみで、いずれもセッション内で
   有効な ID なので影響は軽微）
- 「自分のレシピ」表示には直接影響しないが、いいね消失と密接に絡む

### 論点 D: 「みんなのレシピ」との重複

- 自分がいいねしたレシピは「自分のレシピ」にも「みんなのレシピ」にも出る
- 現在 UI 上はそれが意図的か明示されていない

## 調査の進め方

1. **挙動の実機確認**
   - server モードで AI 生成 → 「自分のレシピ」が空のまま → いいねすると現れる、を確認
   - local モードで AI 生成 → 「自分のレシピ」に 3 件並ぶ、を確認
   - local → ログイン → 「自分のレシピ」の中身が変わるかを確認
2. **過去設計意図の確認**
   - `docs/plans/archive/no-login-mode-impl.md` および
     `docs/plans/archive/react-native-implementation.md:237-240`
     を読み、`liked === 1` フィルタが意図的か再確認
3. **判断**
   - 現状仕様維持で OK → 本プランに結論を追記してアーカイブ
   - 仕様変更が必要 → 候補：
     - (a) server モードでも全件表示（いいねは並び替えに使う）
     - (b) ラベルを「お気に入り」に変更し、いいねフィルタを明示
     - (c) サーバ側で `liked = 1` を WHERE に入れて通信を減らす
     - (d) local も「明示的に保存ボタンを押したもの」だけにする（autoSave をやめる）

## 影響範囲（仕様変更となった場合の参考）

- `mobile/app/(tabs)/recipes.tsx`: フィルタ条件
- `mobile/src/stores/recipe-store.ts`: `loadSavedRecipes` の挙動、`autoSaveRecipes`
- `server/src/services/saved-recipe-service.ts`:
  `getAllSavedRecipes` の WHERE / `autoSaveRecipes` の挙動
- `server/src/routes/saved-recipes.ts`: クエリパラメータ追加の余地
- 関連テスト: `server/tests/integration/saved-recipes.test.ts`,
  `mobile/__tests__/stores/recipe-store.test.ts`

## テスト方針（仕様変更時）

- server: `getAllSavedRecipes` の WHERE 条件変更時は integration テストを更新
- mobile: `recipes.tsx` のフィルタロジックを recipe-store のセレクタに移すなら
  store テストでカバー
- 既存いいね復元の挙動は壊さないこと（`autoSaveRecipes` の既存テストを維持）

## コード調査による追加事実（2026-04-26 確認）

### ログイン時 migrate のいいね欠落（論点 B の決定的論拠）

`mobile/src/utils/migration.ts:88-114` で「移す」が選ばれると、local モードの
`savedRecipes` を `POST /api/migrate` で送信する。サーバ側
`server/src/routes/migrate.ts:91-109` の `rawSavedRecipes.forEach` は
`saved_recipes` テーブルに INSERT するだけで、**`recipe_likes` への INSERT は
一切行わない**。

その後 `mobile/src/stores/auth-store.ts:92-119` の `finishLogin` で
`useRecipeStore.setMode('server')` → `loadSavedRecipes()` の順で実行され、
サーバから `getAllSavedRecipes(userId)` の結果を取得する。
取得結果には移行レシピも含まれるが全て `liked = 0` で返ってくる。

`mobile/app/(tabs)/recipes.tsx:25` の
`mode === 'server' ? savedRecipes.filter((r) => r.liked) : savedRecipes`
により、**「移す」を選択した直後は「自分のレシピ」タブが空に見える**。
データ自体はサーバに存在しているが UI から到達不能。

これは「自分のレシピが移行で消えた」という UX バグであり、
意図した仕様とは考えにくい（少なくとも仕様として明示されていない）。

### server モードでサーバが返す全件は ORDER BY で並べ済

`server/src/services/saved-recipe-service.ts:26-36` の `getAllSavedRecipes` は
`ORDER BY like_count DESC, dish_name ASC, created_at DESC` で全件返している。
クライアントで `liked === 1` フィルタしているため、転送量・パース量の無駄。
WHERE で絞るなら `EXISTS(SELECT 1 FROM recipe_likes WHERE saved_recipe_id = sr.id AND user_id = ?)` を AND 追加すれば足りる。

### local モードと server モードの「自分のレシピ」の意味のズレ

| モード | 「自分のレシピ」に出るもの | 残し方 |
|--------|---------------------------|--------|
| local | AI 提案で生成された全レシピ | AI 再生成すると上書き（タイトル一致以外消える） |
| server | 自分がいいねした自分の保存レシピのみ | いいねしないと UI に残らない（DB には残る） |

ラベルが同じ「自分のレシピ」だが、local は「履歴」的、server は「お気に入り」的に
振る舞っている。この非対称は意図的な設計記述が見当たらず、
段階的な実装（先に server、後で local 対応）の結果と推測される。

### 過去設計意図の確認結果

- `docs/plans/archive/no-login-mode-impl.md:78` には
  `GET /api/saved-recipes` を「自分のレシピ一覧」と定義しているが、
  「いいね済みのみ表示」という UI フィルタについての記述はない
  （つまりサーバ仕様は「全件返す」想定で、UI フィルタは後付け）
- `docs/plans/archive/recipe-ai-on-demand.md:16` で
  「レシピが見たくないユーザに対して `saved_recipes` が勝手に増えるのを止める」
  という意図のもと「レシピを生成する」ボタンを用意している。
  → 現在は AI 提案実行 = ユーザが意図的にレシピ生成を発火、と捉えられる

## 論点ごとの結論

### 論点 A: server モードの「いいね済みのみ表示」

- 意図は理解できる（saved_recipes に勝手に溜まるので絞り込む）
- ただしラベル「自分のレシピ」と挙動「お気に入りのみ」がズレている
- **判断は実機確認後にユーザに委ねる**。仕様変更するなら以下の候補：
  - (a) サーバで `liked = 1` を WHERE に入れて通信量も減らす（現状仕様維持）
  - (b) 全件表示 + いいね順ソート（履歴 UX に寄せる）
  - (c) ラベルを「お気に入り」に変更（フィルタを明示）

### 論点 B: local / server のモード非対称（要対応）

- **migrate 経由でローカルレシピを移すと UI から消えるのは確実なバグ**。
- 修正方針の候補：
  - **(α) migrate API で受け取った savedRecipes を `recipe_likes` にも INSERT する**
    （ユーザが「移す」を選んだ = それらを残したい意思表示と解釈）
    → 最小変更、recipes.tsx は触らない
  - (β) recipes.tsx のフィルタを外し、server モードでも全件表示にする
    → 論点 A の結論と整合する必要あり
  - (γ) migrate UI に「移すと、いいねを付けないレシピは"自分のレシピ"から消える」
    旨の説明を出す（仕様維持の方向）
- 推奨は **(α)**（最小変更でユーザ期待に沿う）。
  ただし論点 A で (b) を採るなら (α) は不要になる。

### 論点 C: AI 再生成での全削除＆再挿入

- 既知の仕様（`docs/plans/archive/dish-item-demoted-on-ai-refresh.md` 参照）
- 「自分のレシピ」表示そのものには直接影響しないため本タスクのスコープ外
- ただしいいね消失リスクは UX として残る（別タスクで議論）

### 論点 D: みんなのレシピとの重複

- 自分がいいねしたレシピは両方に出るが、これは仕様として説明可能
- 本タスクのスコープでは変更不要

## 推奨される次アクション

1. **ユーザによる実機確認**（プランの「調査の進め方 1.」）
   - 特に `local モードでレシピ生成 → ログイン → 「移す」選択 → 自分のレシピが空になる`
     の再現確認
2. 上記が再現すれば、論点 B (α) を最小修正としてフォロー実装プラン
   `docs/plans/my-recipes-migrate-likes.md`（仮）を起こす
3. 論点 A は実機での体感を踏まえ別途判断。直ちに変更する必然性は薄い
   （現状仕様で破綻はしていない）

## 実機確認結果（2026-04-26）

- 未ログインで AI レシピ生成 → 「自分のレシピ」に表示される ✔
- ログイン時のダイアログで「移す」を選択 → **未ログイン時のレシピが消える** ✔（バグ再現）
- 過去にログイン中に作っていたいいね済みレシピは表示される ✔

→ 論点 B の予測通り、`migrate` API が `recipe_likes` に何も入れないため
`recipes.tsx` のフィルタで全消しされていることが確定。

## 暫定結論（判断保留・追加検証中）

- **論点 B のバグ事実は確定**しているが、修正方針 (α)（migrate で
  recipe_likes に INSERT）はいったん **採用見送り**。
  → `my-recipes-migrate-likes.md` は保留（冒頭に STATUS 明記済）。
- 代わりに、より大きな仕様変更の方向性として以下の 2 案を検証してから
  最終判断する：
  - **検証 E-1**: 「みんなのレシピ」機能そのものを削除する案
  - **検証 E-2**: AI 検索したレシピを **すべて履歴として「自分のレシピ」に残す**
    案（liked フィルタ廃止）
- 論点 C / D の判断は E-1 / E-2 の結果に従属するので、ここでは保留。

## 確認済みの事実（実機・コード調査）

- 実機: 未ログインで AI 生成 → ログインで「移す」を選択 → 「自分のレシピ」が
  空になる。過去にいいね済みのサーバ保存分のみ表示される（再現済 2026-04-26）
- コード: `server/src/routes/migrate.ts:91-109` は `saved_recipes` に
  INSERT するが `recipe_likes` には何もしない
- コード: `mobile/app/(tabs)/recipes.tsx:25` は server モードで
  `liked === 1` のみ表示する
- コード: `auth-store.finishLogin` は setMode('server') → loadSavedRecipes
  の順で実行する。setMode('server') 時に savedRecipes を `[]` にクリア
  （`mobile/src/stores/recipe-store.ts:67-69`）
- `autoSaveRecipes`（`server/src/services/saved-recipe-service.ts:168-215`）は
  AI 再生成時に `source_dish_id` 単位で全削除→再 INSERT、タイトル一致のみ
  いいね復元。ID は毎回変わる（既知仕様、論点 C）
- 「みんなのレシピ」未ログイン閲覧可（`saved-recipes.ts:14-24`、
  `optionalAuth`）

## 検証で読むべき主要ファイル

| 観点 | ファイル / 行 |
|------|--------------|
| 「自分のレシピ」表示フィルタ | `mobile/app/(tabs)/recipes.tsx:25` |
| 自分のレシピ取得 (サーバ) | `server/src/services/saved-recipe-service.ts:26-36` |
| みんなのレシピ取得 | `server/src/services/saved-recipe-service.ts:38-59` |
| みんなのレシピ画面 | `mobile/app/(tabs)/shared.tsx`, `_layout.tsx` |
| みんなのレシピ ルート | `server/src/routes/saved-recipes.ts:14-24` |
| AI 再生成時の上書き | `server/src/services/saved-recipe-service.ts:168-215` |
| migrate API | `server/src/routes/migrate.ts:91-109` |
| migrate UI（移す/破棄） | `mobile/src/utils/migration.ts:88-114` |
| ログイン後フロー | `mobile/src/stores/auth-store.ts:92-119` |
| recipe_likes スキーマ | `server/src/database.ts`（CREATE TABLE 箇所） |
| 関連テスト | `server/tests/integration/{migrate,saved-recipes}.test.ts`,<br>`mobile/__tests__/stores/recipe-store.test.ts` |

## 関連ファイルの状態

- `mobile-build-local.sh` の WSL2 NAT 回避は本タスクと無関係に commit 済
  （76d06bb）。検証作業の前提条件が変わるものではない。
- `my-recipes-migrate-likes.md` は STATUS: 保留。E-1 / E-2 が結論次第で
  廃止される可能性あり。間違って実装に進まないこと。

## 検証 E-1: 「みんなのレシピ」機能の削除

### 検証したいこと

- 機能を削除した場合の影響範囲（コード・データ・UX）の洗い出し
- 削除に踏み切る根拠（利用度・運用コスト・「自分のレシピ」との重複感）と
  残す根拠（発見性・他ユーザ体験）の比較
- 削除した場合、`recipe_likes` テーブル自体を残すか（自分のレシピを
  並び順に使うためだけに維持する選択肢もある）廃止するか

### 影響範囲（削除する場合のコードリスト）

- サーバ
  - `server/src/routes/saved-recipes.ts:14-24` の `savedRecipesSharedRouter`
  - `server/src/services/saved-recipe-service.ts:38-59` の `getSharedRecipes`
  - `server/src/index.ts` のマウント箇所
  - 関連テスト: `server/tests/integration/saved-recipes.test.ts` のうち
    shared 関連
- モバイル
  - `mobile/app/(tabs)/shared.tsx`（タブ画面そのもの）
  - `mobile/app/(tabs)/_layout.tsx` のタブ登録
  - `mobile/src/api/saved-recipes.ts` の `getSharedRecipes`
  - `mobile/src/stores/recipe-store.ts` の `sharedRecipes` / `loadSharedRecipes`
  - `__tests__/stores/recipe-store.test.ts` のうち shared 関連
- DB
  - `recipe_likes` テーブル＋外部キー（残すか削除するかは別決定）

### 評価軸

- **+ 削除メリット**: コード簡素化（特にサーバ）、UX の単純化、
  「自分のレシピ＝自分のもの」という素直なモデル
- **- 削除デメリット**: 他ユーザのレシピを参考にできる動線が失われる、
  既にいいねされている既存データの扱い
- **判断材料**:
  - 利用ログがあれば shared 画面の閲覧頻度
  - 自分以外のレシピが本当に参考になっているか（dish_name の重複度合い）

### 検証アクション

- [ ] 削除した場合の差分規模をざっと見積もる（行数・テスト数）
  - 起点: 「検証で読むべき主要ファイル」表の shared 系を grep
  - `grep -rn "shared\|getSharedRecipes\|sharedRecipes" server/src mobile/src mobile/app | wc -l`
- [ ] `admin/` 側にみんなのレシピ集計があるかチェック（依存があれば追加コスト）
  - `grep -rn "shared\|recipe_likes\|getSharedRecipes" server/src/routes/admin.ts server/src/services/admin-service.ts web/admin/`
- [ ] DB の `recipe_likes` 利用実態を確認
  - 開発 DB はリポジトリルートの `shopping.db`（`server/src/database.ts:5`、
    `DB_PATH` 未指定時のデフォルト）。本番は docker volume 配下の同名ファイル。
  - `sqlite3 shopping.db "SELECT user_id, COUNT(*) FROM recipe_likes GROUP BY user_id;"`
  - 自分以外のユーザがいいねを実際に付けているか（投稿者 ≠ いいね者の行があるか）：
    `SELECT rl.user_id, sr.user_id FROM recipe_likes rl JOIN saved_recipes sr ON sr.id = rl.saved_recipe_id WHERE rl.user_id != sr.user_id LIMIT 20;`
- [ ] ユーザ実機での「みんなのレシピ」タブの実体験
  （いま自分が出しているデータがどう見えるか）

## 検証 E-2: AI 検索したレシピを全て「自分のレシピ」に履歴として残す

### 検証したいこと

- `recipes.tsx` の `mode === 'server' ? savedRecipes.filter((r) => r.liked) : ...`
  フィルタを撤廃し、server モードでも全件表示にする案の妥当性
- いいね機能を残すか廃止するか（E-1 とセットで決まる）
- AI 再生成時に既存レシピを破壊する `autoSaveRecipes` の挙動
  （`saved-recipe-service.ts:168-215`、論点 C）との整合性
  - 「履歴」を名乗るなら、再生成しても過去レシピが残るほうが自然？
  - それとも「source_dish_id 単位で最新 3 件」を維持する？

### 影響範囲

- サーバ
  - `getAllSavedRecipes` の返り値はそのまま使えるが、
    `like_count` / `liked` カラムは E-1 次第で不要
  - `autoSaveRecipes` を「履歴として追記」に変えるなら大改修
- モバイル
  - `mobile/app/(tabs)/recipes.tsx:25` のフィルタ撤廃
  - `loadSavedRecipes` の挙動はそのまま
  - empty state の文言を「履歴がありません」相当に
  - いいねボタン UI（RecipeListItem）の出し分け
- 既存ユーザへの影響
  - 既に saved_recipes に溜まっているデータが全部表示されるため、
    「いきなりレシピが大量に出る」体験になる可能性
  - 古いいいね非該当レシピの整理動線が必要かも

### 評価軸

- **+ メリット**: モード非対称が解消（local と同じく全件表示）、
  論点 B の migrate バグも自動的に解決する（liked フィルタ自体が無くなる）
- **- デメリット**: 自動保存で勝手に履歴が膨らむ、
  「いらないレシピが残り続ける」削除導線が必要、
  AI 再生成の上書き仕様（論点 C）と「履歴」名乗りの矛盾
- **判断材料**:
  - 1 ユーザあたりの saved_recipes 件数の実測（現プロダクションデータ）
  - 削除/整理 UI を入れる必要性

### 検証アクション

- [ ] 既存ユーザの saved_recipes 件数分布を確認
  - DB: `sqlite3 shopping.db "SELECT user_id, COUNT(*) AS n FROM saved_recipes GROUP BY user_id ORDER BY n DESC LIMIT 20;"`
  - admin: 「ユーザ」ページに件数列があるか確認（無ければ追加要否を判断）
- [ ] フィルタ撤廃した場合の表示件数（いま手元のテストアカウントで）
  - 手元の自アカウントの全件数: 同 SQL を WHERE で絞る
  - 実機で `recipes.tsx:25` のフィルタを一時的に外して目視確認
    （まだ commit はしない、検証用）
- [ ] AI 再生成時に過去 3 件をどう扱うか（上書き / 追記 / 履歴として別行）
  - 関連: `dish-item-demoted-on-ai-refresh.md`（archive 済）の判断経緯
  - 「履歴」名乗りなら追記が自然だが、`source_dish_id` の意味付けが
    変わるので影響範囲を再評価する
- [ ] 履歴削除の UX 設計（一括削除 / source_dish_id 単位削除 / 個別削除）
  - 既存 `DELETE /api/saved-recipes/:id`（`saved-recipes.ts:127-139`）が
    個別削除には流用可能

## 検証 E-1 結果（2026-04-26）

### 影響範囲（削除する場合の実コード）

| 区分 | 箇所 | 規模 |
|------|------|------|
| サーバ ルート | `server/src/routes/saved-recipes.ts:14-24`（`savedRecipesSharedRouter`） | 約 12 行 |
| サーバ サービス | `server/src/services/saved-recipe-service.ts:38-59`（`getSharedRecipes`） | 約 22 行 |
| サーバ マウント | `server/src/app.ts:84` | 1 行 |
| サーバ テスト | `server/tests/integration/saved-recipes.test.ts:208-264`（`describe('GET /api/saved-recipes/shared')`） | 3 ケース |
| モバイル 画面 | `mobile/app/(tabs)/shared.tsx`（全削除） | 120 行 |
| モバイル タブ登録 | `mobile/app/(tabs)/_layout.tsx:64-72`、`TabIcon.people` | 約 10 行 |
| モバイル API | `mobile/src/api/saved-recipes.ts:11-14`（`getSharedRecipes`） | 4 行 |
| モバイル ストア | `mobile/src/stores/recipe-store.ts` の `sharedRecipes` / `loadSharedRecipes` / `toggleLike` 内の `sharedRecipes.map` / `setMode` 時の `sharedRecipes: []` / `partialize` の sharedRecipes 除外 | 散在 |
| モバイル テスト | `mobile/__tests__/stores/recipe-store.test.ts:5,30,60-76` の sharedRecipes 関連 | 数 assertion |

→ 機械的削除で済む部分が大半。新規ロジック追加は不要。

### 削除しても残せる/残るもの

- **`recipe_likes` テーブル**: `getAllSavedRecipes` の `like_count` 並び順
  （`saved-recipe-service.ts:34` の `ORDER BY like_count DESC, ...`）と
  `admin-service.ts:137` の集計に使われているため、テーブル自体は残す方が安全。
  → DB スキーマ変更不要、マイグレーション不要。
- **「いいね」ボタン UI** (`RecipeListItem`): 「自分のレシピ」内の並び順制御
  （お気に入り上位）として継続利用できる。撤去するかは E-2 と合わせて決める。

### 利用実態（dev DB `shopping.db` 計測 2026-04-26）

```
users: 2
saved_recipes per user: user1=93, user2=6
recipe_likes per liker:  user1=13, user2=2
cross-user likes (liker != recipe owner): 2 件のみ（user2 → user1 の 2 件）
saved_recipes liked at least once: 13 件 ← 「みんなのレシピ」に出る件数
dish_name で他ユーザと重複している料理: 0 件
```

→ 「みんな」と言える同時利用がそもそも発生していない。
　 dev DB なので断定はできないが、本番でも個人開発スケールであるため、
　 「他人のレシピを参考にする」UX は仮説のまま検証されていない可能性が高い。

### admin への影響

- `web/admin/app.js` の `shared` 文字列は SVG アイコン名（icon library）であり、
  「みんなのレシピ」機能とは無関係（grep 確認済）
- `admin-service.ts:277` の cleanup 対象テーブル列に `recipe_likes` が含まれるが、
  テーブルを残す方針なら無修正
- 上記より admin への変更は不要

### E-1 評価

- **メリット**: コード量削減（モバイル 120 行 + ストア/API/テスト群 + サーバ 約 35 行）。
  「自分のレシピ」だけになることで論点 D（重複感）も解消。
- **デメリット**: 将来ユーザが増えた時に「他人のレシピを参考にする」動線を失う。
  ただし削除の前段階として「メニューから非表示」だけにする選択肢もある。
- **結論**: 個人開発スケール（dev DB で他ユーザいいね 2 件、dish_name 重複ゼロ）を
  踏まえると **削除する方向は十分妥当**。判断はユーザの意思（将来構想）次第。

## 検証 E-2 結果（2026-04-26）

### フィルタ撤廃時の表示件数

dev DB の user1 の場合: **93 件** 全件が「自分のレシピ」に並ぶことになる。
1 料理 = 3 レシピなので約 31 料理分の蓄積。AI 生成のたびに 3 件追加（ただし
`autoSaveRecipes` は `source_dish_id` 単位で上書きするので同一料理は最大 3 件）。

### 「履歴」名乗りと `autoSaveRecipes` の上書き仕様の矛盾

- `autoSaveRecipes`（`saved-recipe-service.ts:168-215`）は AI 再生成時に
  `source_dish_id` 単位で **既存全削除 → 再挿入**、タイトル一致のみ いいね復元
- 「履歴」を名乗るなら **追記** が自然だが、追記化は影響範囲が大きい：
  - `source_dish_id` の意味付け（料理 1:N レシピ）が変わる
  - 「最新の AI レシピ 3 件」を返している買物リスト連携
    （`recipes_per_dish` 取得経路）の挙動見直しが必要
  - DB の溜まり方が予測困難になり、削除 UI が事実上必須になる
- → **E-2 を真に「履歴化」する場合、論点 C（AI 再生成の上書き）まで巻き込む大改修**
- フィルタだけ外して `autoSaveRecipes` の上書きは維持する案だと、
  「履歴」とは名ばかりで「最新生成 3 件 × 料理数」が表示されるだけ。
  ラベル「自分のレシピ」とも依然として整合しない（ユーザは履歴を期待する）。

### 削除/整理 UI の必要性

- 個別削除 API は既に存在: `DELETE /api/saved-recipes/:id`（`saved-recipes.ts:127-139`）
- ただしモバイル UI に削除ボタンは無い（`RecipeListItem` に削除ボタン未実装）
- フィルタ撤廃 = 不要レシピが残り続けるので **削除 UI 追加が事実上必須**

### E-2 評価

- **メリット**: モード非対称が消え、論点 B（migrate バグ）も自動解決。
- **デメリット**: `autoSaveRecipes` の上書き仕様と齟齬、削除 UI 追加必須、
  既存ユーザに突然 90+ 件並ぶ UX ショック。
- **結論**: **そのままの「フィルタ撤廃」だけでは UX が破綻しやすい**。
  真に履歴化するなら autoSaveRecipes 改修も含めた大改修になり、
  本タスクのスコープを大きく超える。

## 最終結論案（要ユーザ判断）

### 推奨: 「みんなのレシピ削除」+ 「自分のレシピ＝お気に入り」明示化

ロジックを最小限に整理し、論点 A〜D を一気に解消する案：

1. **E-1 採用**: みんなのレシピ機能削除（タブ/サーバルート/サービス/テスト）
   - 利用実態が無く、コード簡素化のメリット大
   - `recipe_likes` テーブルは並び順のために残す
2. **論点 B (α) 採用**: migrate API で `recipe_likes` にも INSERT
   （`my-recipes-migrate-likes.md` を再採用、STATUS を「実装」に変更）
   - これでログイン時「移す」でレシピが消えるバグが解消
3. **論点 A**: ラベル変更を検討（「自分のレシピ」→「お気に入り」 / 「マイレシピ」など）
   - フィルタ仕様は維持（liked のみ表示）
   - サーバ側で `liked = 1` を WHERE に入れる最適化は将来やる
4. **E-2 不採用**: 「全件履歴化」は autoSaveRecipes 改修まで巻き込むため見送り
5. **論点 C / D**: 既存仕様維持（D は E-1 採用で自動解消）

### 代替案: みんなのレシピ残置 + 論点 B (α) のみ実施

将来ユーザ増を見据えて「みんなのレシピ」を温存する場合：

1. E-1 不採用（現状維持）
2. 論点 B (α) のみ実装（migrate バグ修正）
3. 論点 A は実機体験を踏まえ別途判断

### 再考案: 全部やめてシンプル化

「自分のレシピ」タブも撤廃し、**料理詳細画面でのみ AI レシピを参照** する案。
本質的に「自分のレシピ」の概念自体を疑う方向で、別タスク扱い。

## 進捗

- [x] 現状仕様の整理
- [x] コード調査の追加（migrate / auth-store / 過去プラン確認）
- [x] 実機での挙動確認（local → ログイン「移す」でレシピ消失を再現）
- [x] 論点 B の事実確定 + (α) プラン作成
- [x] 検証 E-1: みんなのレシピ削除案の妥当性
- [x] 検証 E-2: AI レシピ全件履歴化案の妥当性
- [ ] **ユーザ判断**: 推奨案 / 代替案 / 再考案 のいずれを採用するか
- [ ] 採用案に基づき実装プラン更新 or 新規作成
- [ ] 本プランのアーカイブ（実装完了後）
