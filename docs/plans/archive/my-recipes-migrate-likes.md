# migrate API でローカル savedRecipes を「いいね済み」として取り込む

> **STATUS: 保留** — 採用見送り。`my-recipes-display-criteria.md` の検証 E-1
> （みんなのレシピ削除）/ E-2（自分のレシピ＝履歴化）の結論次第で、
> いいね機能自体が無くなる可能性があるため、本プランの実装には進まない。
> 検証完了後に「採用 / 廃止 / 改訂」を決める。

## 目的・背景

`docs/plans/my-recipes-display-criteria.md` の調査により、ログイン時に
「移す」を選択したユーザのローカル savedRecipes が `saved_recipes` テーブルには
入るが `recipe_likes` には入らないため、`recipes.tsx` の
`mode === 'server' ? savedRecipes.filter((r) => r.liked) : savedRecipes`
フィルタで非表示になる挙動が実機で確認された。

ユーザ目線では「移す」を選んだのにレシピが消えたように見える UX バグ。
本タスクで最小修正として **migrate API がローカル savedRecipes を取り込む際、
同時に `recipe_likes` にも自分の userId を INSERT する** 形に変更する。

## 対応方針

### サーバ修正

`server/src/routes/migrate.ts:91-109` の `rawSavedRecipes.forEach` 内で
`saved_recipes` への INSERT 後に `recipe_likes` にも INSERT する。

```ts
const insertLike = db.prepare(
  'INSERT OR IGNORE INTO recipe_likes (user_id, saved_recipe_id) VALUES (?, ?)',
);
// ...
const result = insertSaved.run(...);
insertLike.run(userId, result.lastInsertRowid);
```

- `INSERT OR IGNORE` を使い、万一同一行が既にあった場合に壊れないようにする
  （新規 INSERT 後なので実質常に成功するが、防御的に）
- ローカルで `liked: 0` だったレシピも全て「いいね済み」扱いになる
  - **意味付け**: local モードでは「自分のレシピ」タブ＝AI 生成済み全件表示。
    つまり今 UI に出ているもの＝ユーザがまだ手元に残しているもの。
    「移す」を選択 = 「今手元に見えているレシピを引き続き残したい」と解釈し、
    全件を `liked=1` として取り込むのが妥当
  - もしユーザがいくつかは消したかったとしても、サーバ側で個別にいいね解除すれば良い

### クライアント側

クライアントは無修正。`recipes.tsx:25` のフィルタはそのまま。
`auth-store.finishLogin` の `loadSavedRecipes()` でサーバから取り直した時点で
`liked=1` が付いた状態で返ってくるので、UI に表示される。

## 影響範囲

- `server/src/routes/migrate.ts`: insertLike 追加、forEach 内で呼出
- テスト:
  - `server/tests/integration/migrate.test.ts`:
    既存 `'imports items, dishes, savedRecipes and returns id maps'` のアサーションに
    「migrate 後、各 savedRecipe に対して `recipe_likes` 行が user_id 付きで存在する」
    「`getAllSavedRecipes` の結果で `liked === 1` が付く」を追加
  - 新規ケース: 「migrate 後に `getAllSavedRecipes` を呼ぶと全件 liked=1 で返る」

migrate されないレシピ（既存サーバレシピ）には影響しない。
他ユーザのいいね状態にも影響しない（user_id 一致での INSERT のみ）。

## テスト方針

1. `migrate.test.ts` で savedRecipes を含む migrate を実行後、
   - DB を直接読んで `recipe_likes` に行が入っていることを確認
   - `GET /api/saved-recipes` を呼んで全件 `liked=1` で返ることを確認
2. 既存テスト（id map / 空ボディ / ユーザ分離）は壊さない
3. 手元での挙動確認:
   - local モードで AI 生成 → ログイン → 「移す」 → 自分のレシピに同じ件数が残る
   - 「破棄する」 → 自分のレシピは過去サーバ分のみ（従来通り）

## 進捗

- [ ] migrate.ts 修正
- [ ] migrate.test.ts にいいね復元アサーション追加
- [ ] サーバテスト全体実行 (`npm test`)
- [ ] 実機（local → ログイン「移す」）で表示確認
- [ ] DONE.md へ移動 / 本プランを archive へ
