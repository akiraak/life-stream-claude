# Life Stream Claude

iPhone アプリとサーバが連携し、Claude Code による AI 処理を提供するアプリケーション。

## アーキテクチャ

```
┌─────────────┐       HTTPS/REST        ┌─────────────────┐      CLI/SDK      ┌─────────────┐
│  iOS App    │  ◄──────────────────►    │  Server (Node)  │  ◄────────────►   │ Claude Code │
│  (SwiftUI)  │       JSON               │  Express.js     │                   │             │
└─────────────┘                          └─────────────────┘                   └─────────────┘
```

## ディレクトリ構成

```
life-stream-claude/
├── server/                 # サーバサイド (Node.js / Express)
│   ├── src/
│   │   ├── index.ts        # エントリポイント
│   │   ├── routes/         # API ルート定義
│   │   ├── services/       # Claude Code 連携などのビジネスロジック
│   │   └── middleware/     # 認証・ログなどのミドルウェア
│   ├── package.json
│   └── tsconfig.json
├── ios/                    # iOS アプリ (SwiftUI)
│   └── LifeStream/
│       ├── App/            # アプリエントリポイント
│       ├── Views/          # SwiftUI ビュー
│       ├── Models/         # データモデル
│       ├── Services/       # API クライアント
│       └── LifeStream.xcodeproj
├── CLAUDE.md
├── README.md
└── LICENSE
```

## 技術スタック

### サーバ
- **ランタイム**: Node.js 20+
- **フレームワーク**: Express.js
- **言語**: TypeScript
- **AI 処理**: Claude Code CLI (`claude` コマンド)
- **ホスト**: Ubuntu (WSL2)

### iOS アプリ
- **UI**: SwiftUI
- **最小対応**: iOS 17+
- **言語**: Swift
- **通信**: URLSession

## セットアップ

### サーバ

```bash
cd server
npm install
npm run dev
```

### iOS アプリ

Xcode で `ios/LifeStream/LifeStream.xcodeproj` を開いてビルド。

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/chat` | Claude Code にメッセージを送信し応答を取得 |
| GET | `/api/health` | サーバのヘルスチェック |

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照。
