---
title: 開発用管理サーバ dev-admin
---

# 開発用管理サーバ dev-admin 計画

## 目的

現在の admin (`web/admin/`) は本番運用の管理（ユーザー / 料理 / 買い物食材 / 購入履歴 / システム情報）に特化している。
一方で、開発時に参照する仕様・計画ドキュメント（`docs/plans`, `docs/specs`）の閲覧機能も admin に同居している状態で、責務が混ざっている。

この計画では、開発ドキュメント閲覧を担う **`dev-admin`** を新規に切り出し、本番 admin の責務を明確化する。

## スコープ

### 含む

- `docs/plans/*.md` の一覧・markdown 閲覧
- `docs/specs/*.md` の一覧・markdown 閲覧
- `docs/specs/design/*.html` のデザインプレビュー閲覧（iframe または直接閲覧）
- ローカル開発時のみアクセス可能（`127.0.0.1` バインド）

### 含まない

- ユーザー管理・買い物食材・料理・購入履歴等の運用機能（既存 admin に残す）
- 本番デプロイ（ローカル専用ツール）
- 認証連携（Magic Link など） — ローカル限定アクセスで代替

## アーキテクチャ

プロジェクトルートに `dev-admin/` ディレクトリを新設し、独立した Express サーバとして動かす。

```
dev-admin/
├── package.json           # 依存 (express, marked)
├── tsconfig.json
└── src/
    ├── index.ts           # Express サーバ（ポート 3010）
    └── web/
        ├── index.html
        ├── app.js
        └── style.css
```

### ポート

- デフォルト `3010`（既存 server 3000 と競合しない）
- 環境変数 `DEV_ADMIN_PORT` で上書き可能
- `127.0.0.1` にバインドして外部アクセス不可

### 起動

- `dev-admin/` で `npm run dev`
- または、ルートに `dev-admin.sh` を配置して `./dev-admin.sh` で起動

## API 設計

本番 admin とは独立したエンドポイント。認証不要（ローカル限定）。

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/docs` | `{plans:[{file,title}], specs:[{file,title}], design:[{file,title}]}` を返す |
| GET | `/api/docs/:category/:file` | markdown → HTML 変換して `{title, html}` を返す |
| GET | `/api/design/:file` | `docs/specs/design/*.html` をそのまま返す |

レスポンス形式は既存規約に合わせて `{ success, data, error }`。

## 画面構成

- 左サイドバー: `plans`, `specs`, `design` の3カテゴリ、各カテゴリ配下に markdown / HTML のファイル一覧
- メインエリア:
  - markdown: HTML 変換結果を表示
  - design HTML: iframe でプレビュー

デザインは既存 `web/admin/style.css` を参考にしつつ、より簡素な独自スタイルで構築する。

## 既存コードの整理

dev-admin 公開後、以下を削除する:

1. `server/src/routes/admin.ts`
   - `/docs-files` エンドポイント（2つ）を削除
   - `extractTitle`, `DOCS_DIR`, `DOC_CATEGORIES` の関連コードを削除
2. `web/admin/app.js`
   - `renderDocs`, `renderDocFile` 関数を削除
   - `Pages` 定義から `docs` エントリを削除
   - `DOC_CATEGORY_LABELS` を削除
   - ルーターの `doc-file/...` ハンドリングを削除
3. `web/admin/index.html`
   - サイドバーから「企画ドキュメント」項目を削除

**注意**: admin 内の「アイコン候補 / アプリ名候補 / マネタイズ検討 / ネイティブアプリ技術検討 / リモート開発環境検討 / React Native 開発計画」は `app.js` 内にハードコードされた独立ページで、docs/plans, docs/specs とは別物。これらは admin に残すか別途検討する（本計画のスコープ外）。

`server/src/routes/docs.ts`（`/docs` で公開している Jekyll 風の仕様書ページ）は別用途のため残す。

## 実装ステップ

- [ ] Step1: `dev-admin/` ディレクトリ作成、`package.json` / `tsconfig.json` 作成
- [ ] Step2: `dev-admin/src/index.ts` で Express サーバ実装（API 3エンドポイント + 静的配信）
- [ ] Step3: `dev-admin/src/web/` に HTML / CSS / JS を作成
- [ ] Step4: ルートに `dev-admin.sh` 起動スクリプトを追加
- [ ] Step5: 動作確認（`http://localhost:3010` で plans / specs / design が閲覧できる）
- [ ] Step6: 既存 admin からドキュメント関連機能を削除（server / web / HTML）
- [ ] Step7: CLAUDE.md に dev-admin の起動方法を追記

## テスト方法

1. `dev-admin/` で `npm install && npm run dev`
2. ブラウザで `http://localhost:3010`
3. サイドバーから plans / specs の各 markdown が HTML 描画されることを確認
4. design/\*.html のプレビューが表示されることを確認
5. 既存 admin（`http://localhost:3000/admin/`）に「企画ドキュメント」項目が無いことを確認
6. 既存 admin の他の機能（ユーザー管理等）に影響が無いことを確認

## 将来拡張（必須ではない）

dev-admin は開発時のみ使うため、他の開発支援機能を足していける:

- 現在の DB スキーマ表示（テーブル / カラム / インデックス）
- 環境変数の表示（機密はマスク）
- サーバログの tail 表示
- API 一覧（OpenAPI / ルート一覧）
