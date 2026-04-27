# Cooking Basket

[![test](https://github.com/akiraak/cooking-basket/actions/workflows/test.yml/badge.svg)](https://github.com/akiraak/cooking-basket/actions/workflows/test.yml)

スマホ向けの買い物リストアプリ（iOS / Android）。料理を登録すると AI が具材とレシピを提案してくれます。

**iOS**: App Store (審査中)
**Android**: Google Play (クローズドテスト中)
**アプリ紹介**: https://basket.chobi.me/about

## 主な機能

- **買い物リスト** — 食材の追加・チェック・並べ替え（ドラッグ&ドロップ）
- **料理管理** — 料理を追加して食材をグループ化、料理間のドラッグ移動
- **AI 具材提案** — 料理名から Gemini AI がレシピごとの具材を自動提案、タップでリストに追加
- **AI レシピ表示** — 料理ごとにおすすめレシピ3件を表示（手順・食材付き）
- **レシピノート** — 生成したレシピを自動保存・検索（無限スクロール対応）
- **リストに追加** — レシピカードから食材を一括で買い物リストに追加
- **サジェスト** — 過去の購入頻度をもとに食材名・料理名を補完
- **AI データ引き継ぎ** — 同じ料理名なら前回の AI データを再利用、AI 再取得も可能
- **Magic Link 認証** — メールアドレスでログイン（OTP）、複数ユーザー対応
- **管理画面** — ユーザー管理・データ一覧・サーバ統計

## アーキテクチャ

```
┌─────────────┐                         ┌──────────────────┐
│ Mobile App  │  <──────────────────>    │  Server (Node.js) │
│ (React      │       HTTPS/REST        │  Express + SQLite  │
│  Native)    │       JSON + JWT        │                    │
└─────────────┘                         ├──────────────────┤
                                        │  Gemini API       │ ← AI 具材・レシピ提案
                                        │  Resend           │ ← Magic Link メール送信
                                        │  Claude Code CLI  │ ← レシピ推薦
                                        └──────────────────┘
```

`basket.chobi.me` ドメイン直下にはアプリ紹介ページ（`/about`）と
プライバシーポリシー（`/privacy`）、本番管理画面（`/admin/`）のみを配信する。

## 技術スタック

| レイヤ | 技術 |
|--------|------|
| サーバ | Node.js 20+, Express.js, TypeScript |
| DB | SQLite (better-sqlite3, WAL モード) |
| 認証 | Magic Link (OTP) + JWT |
| メール | Resend |
| AI | Google Gemini API (具材・レシピ), Claude Code CLI (レシピ推薦) |
| Web | HTML / CSS（紹介ページ + 管理画面のみ） |
| モバイル | React Native (Expo SDK 54), TypeScript, Zustand |
| ビルド | EAS Build / EAS Submit |

## ディレクトリ構成

```
cooking-basket/
├── server/                 # サーバサイド (Node.js / Express / TypeScript)
│   ├── src/
│   │   ├── index.ts        # エントリポイント
│   │   ├── database.ts     # SQLite 初期化・マイグレーション
│   │   ├── routes/
│   │   │   ├── auth.ts           # 認証 API (Magic Link)
│   │   │   ├── shopping.ts      # 買い物リスト API
│   │   │   ├── dishes.ts        # 料理 API + AI 具材提案
│   │   │   ├── saved-recipes.ts  # レシピ保存 API
│   │   │   ├── recipes.ts       # レシピ推薦 API
│   │   │   ├── claude.ts        # Claude Code 汎用 API
│   │   │   ├── admin.ts         # 管理用 API
│   │   │   └── docs.ts          # ドキュメント表示
│   │   ├── services/
│   │   │   ├── auth-service.ts         # 認証・JWT・OTP・メール送信
│   │   │   ├── shopping-service.ts     # 買い物リスト CRUD
│   │   │   ├── dish-service.ts         # 料理 CRUD + AI データ管理
│   │   │   ├── saved-recipe-service.ts # レシピ保存管理
│   │   │   ├── gemini-service.ts       # Gemini API 呼び出し
│   │   │   ├── claude-service.ts       # Claude CLI 呼び出し
│   │   │   └── admin-service.ts        # 管理機能
│   │   └── middleware/
│   │       ├── auth.ts             # JWT 認証ミドルウェア
│   │       └── error-handler.ts
│   ├── package.json
│   └── tsconfig.json
├── web/                    # 静的ファイル
│   ├── about.html          # アプリ紹介ページ
│   ├── privacy.html        # プライバシーポリシー
│   ├── img/                # 紹介ページ用画像（OGP / QR / スクリーンショット / アイコン）
│   └── admin/              # 本番管理画面
├── mobile/                 # モバイルアプリ (React Native / Expo)
│   ├── app/                # Expo Router ページ
│   ├── src/
│   │   ├── components/     # UIコンポーネント
│   │   ├── stores/         # Zustand ストア
│   │   ├── services/       # API クライアント
│   │   ├── theme/          # テーマ・カラー定義
│   │   └── types/          # 型定義
│   ├── assets/             # アイコン・スプラッシュ画像
│   ├── app.json            # Expo 設定
│   └── eas.json            # EAS Build/Submit 設定
├── docs/                   # 仕様書・設計ドキュメント
├── CLAUDE.md               # Claude Code 開発ガイド
├── TODO.md / DONE.md       # タスク管理
└── LICENSE                 # MIT
```

## セットアップ

### 前提条件

- Node.js 20+
- npm
- Google Gemini API キー
- Resend API キー（メール認証用）

### インストール

```bash
cd server
npm install
```

### 環境変数

```bash
cp server/.env.example server/.env
```

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PORT` | `3000` | サーバのリッスンポート |
| `JWT_SECRET` | — | JWT 署名用シークレット（32文字以上）。アプリ向け Magic Link / Google OAuth 用 |
| `APP_URL` | — | アプリの URL（例: `https://your-domain.com`） |
| `RESEND_API_KEY` | — | Resend API キー |
| `EMAIL_FROM` | — | 送信元メールアドレス |
| `CF_ACCESS_TEAM_DOMAIN` | — | 管理画面用 Cloudflare Access のチームドメイン（例: `akiraak.cloudflareaccess.com`） |
| `CF_ACCESS_AUD` | — | 管理画面用 Cloudflare Access アプリケーションの AUD タグ |
| `ADMIN_AUTH_DEV_BYPASS` | `0` | ローカル開発で `/admin` の Cloudflare Access 検証をバイパスするフラグ。`NODE_ENV` が `development` / `test` のときだけ有効 |
| `ADMIN_AUTH_DEV_EMAIL` | `dev-admin@local` | バイパス時に `req.adminEmail` に入れるメールアドレス |

管理画面（`/admin/*` および `/api/admin/*`）はアプリ認証とは独立しており、本番では
Cloudflare Access の Google SSO で前段ゲートしたうえで Origin が JWT
（`Cf-Access-Jwt-Assertion`）を検証する。`CF_ACCESS_TEAM_DOMAIN` /
`CF_ACCESS_AUD` の取得手順とポリシー設定は
[docs/plans/admin-auth-cloudflare.md](docs/plans/admin-auth-cloudflare.md) を参照。

### 起動

```bash
# 開発 (ホットリロード)
cd server
npm run dev

# プロダクション
cd server
npm run build
npm start
```

サーバ起動後:
- アプリ紹介ページ: http://localhost:3000/about （`/` にアクセスするとここへ 301 リダイレクト）
- 管理画面: http://localhost:3000/admin/

## モバイルアプリ

リポジトリルートに 3 つのスクリプトを置いており、Expo Go での実機確認と TestFlight 提出を一発で実行できる。

```bash
# LAN 上の npm run dev サーバに接続して Expo Go 起動（QR 表示）
./mobile-build-local.sh

# 本番サーバ (https://basket.chobi.me) に接続して Expo Go 起動
./mobile-build-prod.sh

# production ビルド + TestFlight 提出（eas build --auto-submit）
./mobile-submit-testflight.sh
```

LAN の device discovery が不安定なときは `--tunnel` を付けると ngrok 経由で接続できる（追加引数は `expo start` に透過渡しされる）:

```bash
./mobile-build-local.sh --tunnel
./mobile-build-local.sh --tunnel --port 8088   # ポートも併用可
```

詳細は [docs/plans/archive/mobile-build-scripts.md](docs/plans/archive/mobile-build-scripts.md) と
[docs/plans/archive/mobile-tunnel-toggle.md](docs/plans/archive/mobile-tunnel-toggle.md) を参照。

## API エンドポイント

### 認証

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/login` | Magic Link 送信 `{ email }` |
| POST | `/api/auth/verify-code` | OTP 検証 `{ email, code }` |
| GET | `/api/auth/me` | ログインユーザー情報 |

### 買い物リスト

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/shopping` | 一覧取得 |
| POST | `/api/shopping` | 食材追加 `{ name, category? }` |
| PUT | `/api/shopping/:id` | 食材更新 |
| DELETE | `/api/shopping/:id` | 食材削除 |
| PUT | `/api/shopping/reorder` | 並べ替え |
| DELETE | `/api/shopping/checked` | チェック済み一括削除 |
| GET | `/api/shopping/suggestions?q=` | サジェスト |

### 料理

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/dishes` | 全料理取得 |
| POST | `/api/dishes` | 料理追加 |
| PUT | `/api/dishes/:id` | 料理名更新 |
| DELETE | `/api/dishes/:id` | 料理削除（ソフトデリート） |
| PUT | `/api/dishes/reorder` | 並べ替え |
| GET | `/api/dishes/suggestions?q=` | 料理名サジェスト |
| POST | `/api/dishes/:id/suggest-ingredients` | AI 具材・レシピ提案 |
| POST | `/api/dishes/:id/items` | 食材リンク |
| PUT | `/api/dishes/:id/items/reorder` | リンク内並べ替え |
| DELETE | `/api/dishes/:id/items/:itemId` | リンク解除 |

### レシピ

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/saved-recipes` | レシピノート一覧 |
| GET | `/api/saved-recipes/:id` | レシピ詳細 |
| POST | `/api/saved-recipes` | レシピ保存 |
| POST | `/api/saved-recipes/bulk` | レシピ一括保存（AI 結果の自動保存用） |
| DELETE | `/api/saved-recipes/:id` | レシピ削除 |

### レスポンス形式

すべての API は共通の形式で返します:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

## テスト

```bash
# サーバ (Vitest + supertest)
cd server && npm test

# モバイル (Jest + jest-expo)
cd mobile && npm test
```

`push` / `pull_request` で GitHub Actions (`.github/workflows/test.yml`) が `server` と `mobile` を並列で実行します。テスト追加時のガイドは [docs/plans/testing.md](docs/plans/testing.md) を参照。

### pre-commit フック（任意）

commit 前にローカルで全テストを走らせるフックを `.husky/pre-commit` に用意しています。clone 後に一度だけ以下を実行すると有効化されます:

```bash
git config core.hooksPath .husky
```

緊急時は `git commit --no-verify` でスキップ可。

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照。
