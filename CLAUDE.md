# CLAUDE.md - プロジェクト開発ガイド

## プロジェクト概要

お料理バスケット — 料理買物リストアプリ（iOS / Android / Web PWA）。
料理を登録すると Gemini AI が具材とレシピを提案し、買い物リストに一括追加できる。
Magic Link 認証で複数ユーザー対応。

## 開発コマンド

### サーバ (server/)
```bash
npm run dev          # 開発サーバ起動 (ts-node + nodemon)
npm run build        # TypeScript ビルド
npm start            # プロダクション起動
```

### モバイル (mobile/)
```bash
npx expo start       # 開発サーバ起動 (Expo Go で確認)
eas build -p ios --profile production    # iOS 本番ビルド
eas build -p android --profile production # Android 本番ビルド
eas submit -p ios    # App Store 提出
```

## Git ルール

- `git push` はユーザーから明示的に指示があった場合のみ実行する（勝手に push しない）

## コーディング規約

### 共通
- コミットメッセージは英語で記述
- 変数名・関数名は英語、コメントは日本語可

### TypeScript (サーバ)
- strict モードを使用
- async/await を使用 (コールバック不可)
- エラーハンドリングは try-catch で明示的に行う
- ファイル命名: kebab-case (`claude-service.ts`)

### Web クライアント
- フレームワークなしの Vanilla JS（モバイルファースト）
- PWA 対応（manifest.json、Service Worker）

### モバイル (React Native / Expo)
- Expo SDK 54, React Native 0.81
- TypeScript strict モード
- 状態管理: Zustand
- ファイル命名: kebab-case (コンポーネントは PascalCase.tsx)

## アーキテクチャ上の注意

- サーバと Claude Code の連携は `claude --print` (非対話モード) を使用する
- Web → サーバ間の通信は JSON over HTTPS (REST API)
- API のレスポンスは `{ "success": bool, "data": any, "error": string? }` の形式で統一
- 認証は Magic Link (OTP) + JWT
- メール送信は Resend (noreply@chobi.me)
- 環境変数は `.env` ファイルで管理 (Git にコミットしない)

## タスク管理ルール

- タスクは `TODO.md` で管理する
- タスクが完了したら `TODO.md` から該当項目を削除し、`DONE.md` に移動する
- `DONE.md` には完了日を `YYYY-MM-DD` 形式で付けて記録する
- 新しいタスクが発生したら `TODO.md` の適切なセクションに追加する
- タスクの実施前に `TODO.md` を確認し、優先度の高いものから着手する
- コミット時に `TODO.md` を確認し、実装した機能に対応するタスクがあれば `DONE.md` に移動する

## ファイル構成のルール

- サーバのソースは `server/src/` 配下に置く
- Web クライアントは `web/` 配下に置く
- モバイルアプリは `mobile/` 配下に置く (Expo Router, `mobile/src/` にソース)
- 設定ファイルは各プロジェクトルートに置く
