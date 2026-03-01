# CLAUDE.md - プロジェクト開発ガイド

## プロジェクト概要

Life Stream Claude は iPhone アプリ + サーバ構成のアプリケーション。
サーバ側で Claude Code を実行し、AI 処理結果を iOS アプリに返す。

## 開発コマンド

### サーバ (server/)
```bash
npm run dev          # 開発サーバ起動 (ts-node + watch)
npm run build        # TypeScript ビルド
npm run start        # プロダクション起動
npm test             # テスト実行
npm run lint         # ESLint 実行
```

### iOS (ios/)
```bash
xcodebuild -scheme LifeStream -destination 'platform=iOS Simulator,name=iPhone 16' build
xcodebuild test -scheme LifeStream -destination 'platform=iOS Simulator,name=iPhone 16'
```

## コーディング規約

### 共通
- コミットメッセージは英語で記述
- 変数名・関数名は英語、コメントは日本語可

### TypeScript (サーバ)
- strict モードを使用
- async/await を使用 (コールバック不可)
- エラーハンドリングは try-catch で明示的に行う
- ファイル命名: kebab-case (`claude-service.ts`)

### Swift (iOS)
- SwiftUI を使用 (UIKit は使わない)
- MVVM パターンに従う
- ファイル命名: PascalCase (`ChatView.swift`)
- `@Observable` マクロを使用 (iOS 17+)

## アーキテクチャ上の注意

- サーバと Claude Code の連携は `claude --print` (非対話モード) を使用する
- iOS → サーバ間の通信は JSON over HTTPS
- API のレスポンスは `{ "success": bool, "data": any, "error": string? }` の形式で統一
- 環境変数は `.env` ファイルで管理 (Git にコミットしない)

## タスク管理ルール

- タスクは `TODO.md` で管理する
- タスクが完了したら `TODO.md` から該当項目を削除し、`DONE.md` に移動する
- `DONE.md` には完了日を `YYYY-MM-DD` 形式で付けて記録する
- 新しいタスクが発生したら `TODO.md` の適切なセクションに追加する
- タスクの実施前に `TODO.md` を確認し、優先度の高いものから着手する

## ファイル構成のルール

- サーバのソースは `server/src/` 配下に置く
- iOS のソースは `ios/LifeStream/` 配下に置く
- 設定ファイルはそれぞれのルート (`server/`, `ios/`) に置く
