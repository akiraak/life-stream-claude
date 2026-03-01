# Life Stream Claude

iPhone アプリとサーバが連携し、Claude Code による AI 処理を提供するアプリケーション。

## アーキテクチャ

```
┌─────────────┐       HTTPS/REST        ┌─────────────────┐      CLI      ┌─────────────┐
│  iOS App    │  ◄──────────────────►    │  Server (Node)  │  ◄────────►   │ Claude Code │
│  (SwiftUI)  │       JSON               │  Express + SQLite│              │  (claude     │
├─────────────┤                          ├─────────────────┤              │   --print)   │
│  Web Client │  ◄──────────────────►    │  Static Files   │              └─────────────┘
│  (HTML/JS)  │                          │  /web            │
└─────────────┘                          └─────────────────┘
```

## ディレクトリ構成

```
life-stream-claude/
├── server/                 # サーバサイド (Node.js / Express / TypeScript)
│   ├── src/
│   │   ├── index.ts        # エントリポイント
│   │   ├── database.ts     # SQLite (better-sqlite3) 初期化
│   │   ├── routes/
│   │   │   ├── shopping.ts # 買い物リスト API
│   │   │   ├── recipes.ts  # レシピ推薦 API
│   │   │   ├── claude.ts   # Claude Code 汎用 API
│   │   │   └── admin.ts    # 管理用 API
│   │   ├── services/
│   │   │   ├── shopping-service.ts  # 買い物リスト CRUD
│   │   │   └── claude-service.ts    # Claude CLI 呼び出し
│   │   └── middleware/
│   │       └── error-handler.ts
│   ├── package.json
│   └── tsconfig.json
├── web/                    # Web クライアント (静的ファイル)
│   ├── index.html          # 買い物リスト画面
│   ├── app.js
│   ├── style.css
│   └── admin/              # 管理画面
│       ├── index.html
│       ├── app.js
│       └── style.css
├── CLAUDE.md               # Claude Code 開発ガイド
├── TODO.md / DONE.md       # タスク管理
└── LICENSE                 # MIT
```

## 技術スタック

| レイヤ | 技術 |
|--------|------|
| サーバ | Node.js 20+, Express.js, TypeScript |
| DB | SQLite (better-sqlite3, WAL モード) |
| AI | Claude Code CLI (`claude --print`) |
| Web | HTML / CSS / JavaScript (フレームワークなし) |
| iOS | SwiftUI, Swift, iOS 17+ |

## セットアップ

### 前提条件

- Node.js 20+
- npm
- Claude Code CLI (`claude` コマンドにパスが通っていること)

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
- 買い物リスト: http://localhost:3000/
- 管理画面: http://localhost:3000/admin/
- ヘルスチェック: http://localhost:3000/api/health

## API エンドポイント

### 買い物リスト

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/shopping` | 一覧取得 (未購入→購入済の順) |
| POST | `/api/shopping` | アイテム追加 `{ name, category? }` |
| PUT | `/api/shopping/:id` | アイテム更新 `{ name?, category?, checked? }` |
| DELETE | `/api/shopping/:id` | アイテム削除 |
| DELETE | `/api/shopping/checked` | 購入済みを一括削除 |

### レシピ推薦

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/recipes/recommend` | 未購入食材からレシピ3件を提案 |

### Claude Code

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/claude` | 任意のプロンプトを送信 `{ prompt }` |

### 管理

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/admin/stats` | 統計情報 (合計/未購入/購入済) |
| GET | `/api/admin/shopping` | 全アイテム取得 |
| PUT | `/api/admin/shopping/:id` | アイテム更新 |
| DELETE | `/api/admin/shopping/:id` | アイテム削除 |
| DELETE | `/api/admin/shopping` | 全件削除 |

### 共通

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/health` | ヘルスチェック |

### レスポンス形式

すべての API は共通の形式で返します:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

## 公開サーバでの運用

### systemd サービス (例)

```ini
# /etc/systemd/system/life-stream.service
[Unit]
Description=Life Stream Claude Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/life-stream-claude/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now life-stream.service
```

### リバースプロキシ (nginx 例)

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 本番デプロイ手順

```bash
cd server
npm install --production
npm run build
npm start
```

### セキュリティに関する注意

- `/api/claude` と `/api/admin/*` は認証なしで公開されています。公開サーバでは認証ミドルウェアの追加を推奨します
- SQLite DB ファイル (`shopping.db`) はサーバルートに作成されます。バックアップを検討してください
- Claude Code CLI がサーバ上にインストールされ、認証済みである必要があります

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照。
