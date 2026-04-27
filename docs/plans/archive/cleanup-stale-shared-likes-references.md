# 「みんなのレシピ」「いいね」残存記述の整理

## 目的・背景

アプリシンプル化で「レシピ共有（みんなのレシピ）」「いいね」機能を撤去したが、
以下のドキュメント／補助ファイルに過去機能の記述が残っており、現状と乖離している。

- `README.md` — 機能一覧／ディレクトリ構成／API 一覧表に旧 API・旧機能が残存
- `web/about.html` — 「レシピを保存・共有」フィーチャーカード＋「みんなのレシピ画面」スクショ
- `web/admin/app.js` — 管理画面の旧プランニングページ群（icon-preview / monetization /
  react-native-plan）に「みんな」「いいね」前提の記述が残存

実コード側の確認結果（実装上は既に整理済み）:

- `server/src/routes/saved-recipes.ts` の現存エンドポイントは
  `GET /`, `POST /`, `POST /bulk`, `GET /:id`, `DELETE /:id` のみ。
  `/shared`, `/:id/like`, `/recipes/liked`, `/recipes/all-liked` は **存在しない**
- `mobile/` 配下にも `みんな` / `いいね` / `like` / `shared` の参照は無い
- 管理画面サイドバー (`web/admin/index.html`) からは
  `icon-preview` / `app-name` / `monetization` / `native-app` /
  `remote-dev` / `react-native-plan` への導線は既に外されており、
  `app.js` 内のオーファン状態（直接ハッシュで踏まないと到達不可）

## 対応方針

ドキュメント／紹介ページの正確性回復が目的なので、**実機能と一致する状態**へ書き換える。

### Phase 1: README.md の整理
- 「主な機能」から `レシピ保存・いいね — レシピにいいねを付けて保存、複数ユーザー間で共有` を削除
  - 直前項目の `AI レシピ表示` と直後項目の `レシピノート — 生成したレシピを自動保存・検索` で
    保存系の文脈は十分カバーされる
- ディレクトリ構成のコメントを修正
  - `saved-recipes.ts  # レシピ保存・いいね API` → `saved-recipes.ts  # レシピ保存 API`
  - `saved-recipe-service.ts # レシピ保存・いいね管理` → `saved-recipe-service.ts # レシピ保存管理`
- API 表（### レシピ）を実装に合わせて差し替え
  - 残す: `GET /api/saved-recipes` (一覧), `GET /api/saved-recipes/:id` (詳細),
    `POST /api/saved-recipes` (保存), `DELETE /api/saved-recipes/:id` (削除)
  - 追加: `POST /api/saved-recipes/bulk` (一括保存／AI 結果の自動保存用)
  - 削除: `GET /api/saved-recipes/shared`, `PUT /api/saved-recipes/:id/like`

### Phase 2: web/about.html の整理
- 「レシピを保存・共有」フィーチャーカード（396〜412 行付近）を、共有機能を消した
  「レシピを保存」に書き換える
  - `feature-name`: `レシピを保存`
  - `feature-desc`: `気になるレシピを保存して、食材をそのまま買い物リストへ`
  - スクショ行: `feature-screenshot-row` を `feature-screenshot` に戻し
    `img/ss-recipe.png` 1 枚のみに。`img/ss-shared.png` の参照を削除
- `web/img/ss-shared.png` 自体は **本プランでは削除しない**（他環境でリンクされる
  可能性に備え、別タスクで掃除する）。残置確認のみ。

### Phase 3: web/admin/app.js の旧プランページの整理
オーファン状態でメンテ対象でもないため、**ページ群ごと丸ごと削除する**のが
最も実情に沿う。

- 削除対象:
  - `Pages` 定義から `icon-preview` / `app-name` / `monetization` /
    `native-app` / `remote-dev` / `react-native-plan` の 6 行（201〜206 行）
  - 対応する `function renderIconPreview()` (934〜) /
    `renderAppName()` (1004〜) / `renderMonetization()` (1193〜) /
    `renderNativeApp()` (1431〜) / `renderRemoteDev()` (1800〜) /
    `renderReactNativePlan()` (2189〜) 関数の本体
- 削除前に念のため `web/admin/index.html` のサイドバーに
  これらのハッシュリンクが無いことを再確認（調査済 = 無し）
- 削除後、`#dashboard` 〜 `#logs` の正規ナビが従来どおり動くことだけ
  ブラウザで開いて目視確認

### Phase 4: 親タスク後片付け
- `TODO.md` の該当行を `DONE.md` に移動（完了日 `2026-04-26`）
- 本プランファイルを `docs/plans/archive/` に移動

## 影響範囲

- README.md: 機能紹介セクション、ディレクトリ構成コメント、API 表の 3 箇所
- web/about.html: フィーチャーカード 1 枚（共有機能の宣伝を削除）
- web/admin/app.js: 旧プランニングページ 6 セクション分の純粋なコード削減
  （実機能・サイドバー導線・他ページには影響なし）
- 実コード（server / mobile）には変更を加えない
- DB スキーマ・マイグレーション・テスト：変更なし

## テスト方針

- **README**: Markdown プレビューで表崩れが無いか目視確認
- **about.html**: 開発サーバ or Cloudflare Pages プレビューで紹介ページを
  開き、フィーチャーカード列のレイアウトが崩れないことを確認
  （スクショ 1 枚レイアウトに戻すので `feature-screenshot-row` の CSS が
   宙に浮かないかも併せて確認。他カードでも `feature-screenshot` を
   使っているので問題ない見込み）
- **admin/app.js**: `dev-admin.sh` で起動した本番管理画面プレビュー
  （または `web/admin/index.html` を直接ブラウザで開く）で
  サイドバーの全項目（ダッシュボード／ユーザー／料理／料理レシピ／
  買い物食材／購入履歴／AI 利用状況／システム情報／ログ）に遷移できることを
  目視確認。ハッシュ直打ちで `#monetization` などが「ページが見つかりません」
  系で安全に処理されること（`Router.navigate` の挙動）も確認
- 自動テスト追加は不要（純粋にドキュメント／オーファンページ削除のため）

## メモ：今回スコープ外

- `web/img/ss-shared.png` の物理削除（参照が完全に切れた段階で別タスク）
- 「アプリシンプル化以降のズレ」が他に潜んでいないかの全文監査
  （別途 `みんな` / `いいね` / `shared` / `like` のリポジトリ全体 grep を
   定期的に走らせるなどの仕組みは今回入れない）
