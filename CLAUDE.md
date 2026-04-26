# CLAUDE.md - プロジェクト開発ガイド

## プロジェクト概要

お料理バスケット — 料理買物リストアプリ（iOS / Android）。
料理を登録すると Gemini AI が具材とレシピを提案し、買い物リストに一括追加できる。
Magic Link 認証で複数ユーザー対応。`basket.chobi.me` には紹介ページ（`/about`）と
プライバシーポリシー（`/privacy`）のみを置き、ユーザー向け PWA は廃止済み。

## 開発コマンド

### サーバ (server/)
```bash
npm run dev          # 開発サーバ起動 (ts-node + nodemon)
npm run build        # TypeScript ビルド
npm start            # プロダクション起動
npm test             # Vitest 実行 (tests/unit + tests/integration)
npm run test:watch   # watch モード
```

### モバイル (mobile/)
```bash
npx expo start       # 開発サーバ起動 (Expo Go で確認)
npm test             # Jest 実行 (__tests__/ 配下)
eas build -p ios --profile production    # iOS 本番ビルド
eas build -p android --profile production # Android 本番ビルド
eas submit -p ios    # App Store 提出
```

### 開発用管理サーバ (dev-admin/)
```bash
./dev-admin.sh       # ルートから起動 (ポート 3010、127.0.0.1 バインド)
# または
cd dev-admin && npm run dev
```
- `http://localhost:3010` で `docs/plans`, `docs/specs`, `docs/specs/design` を閲覧できる
- `TODO` タブで `TODO.md` / `DONE.md` をプレビュー表示・編集できる
  - 編集は楽観ロック（mtime チェック）付き。外部で先に更新されていた場合は保存時に 409 を返し、リロード / 手元維持 / 強制上書き を選べる
  - `fs.watch` + 2 秒ポーリングで外部変更を検知し、SSE (`/api/files/watch`) でクライアントへ即時反映する（プレビュー自動更新／clean 編集は差し替え＋情報バー／dirty 編集は競合警告バー＋差分モーダル）
  - ツールバーの `↻ 再取得` ボタンまたは `R` 単独キーで手動再取得できる
- ローカル開発専用（本番 admin とは独立）
- ポート変更は `DEV_ADMIN_PORT` 環境変数で指定可能

## Git ルール

- `git push` はユーザーから明示的に指示があった場合のみ実行する（勝手に push しない）
- clone 直後に `git config core.hooksPath .husky` を実行して pre-commit フックを有効化する（`.husky/pre-commit` が server/mobile のテストを流す）
- `--no-verify` / `--no-gpg-sign` 等のフックスキップは、ユーザーからの明示指示があった時のみ使う

## コーディング規約

### 共通
- コミットメッセージは英語で記述
- 変数名・関数名は英語、コメントは日本語可

### テスト
- サーバ: Vitest + supertest (`server/tests/unit/`, `server/tests/integration/`)
  - service 層の関数を追加・変更したら対応する `*-service.test.ts` を更新する
  - ルートを追加・変更したら `integration/` に supertest ベースのテストを追加する
  - 外部 API (Gemini / Resend / Google OAuth) は必ずモジュール境界でモックする
  - テスト DB は `tests/setup.ts` が `/tmp/cb-test-<pid>.db` を強制するので本体 `shopping.db` は触らない
- モバイル: Jest + jest-expo (`mobile/__tests__/`)
  - `stores/` を変更したら `__tests__/stores/` の対応テストを更新する
  - API クライアント層の変更は `__tests__/api/` でカバーする
  - RN コンポーネント描画テストは未導入（no-login 移行後に検討）
- 詳細は `docs/plans/testing.md` を参照

### TypeScript (サーバ)
- strict モードを使用
- async/await を使用 (コールバック不可)
- エラーハンドリングは try-catch で明示的に行う
- ファイル命名: kebab-case (`claude-service.ts`)

### Web (`web/`)
- ランディング（`web/about.html`）とプライバシーポリシー（`web/privacy.html`）、本番管理画面（`web/admin/`）のみ
- ユーザー向け PWA は廃止済み（[docs/plans/web-app-removal.md](docs/plans/web-app-removal.md) 参照）

### モバイル (React Native / Expo)
- Expo SDK 54, React Native 0.81
- TypeScript strict モード
- 状態管理: Zustand
- ファイル命名: kebab-case (コンポーネントは PascalCase.tsx)

## アーキテクチャ上の注意

- サーバと Claude Code の連携は `claude --print` (非対話モード) を使用する
- Web → サーバ間の通信は JSON over HTTPS (REST API)
- API のレスポンスは `{ "success": bool, "data": any, "error": string? }` の形式で統一
- アプリ向け認証は Magic Link (OTP) / Google OAuth + JWT（`requireAuth` ミドルウェア、`req.userId` / `req.userEmail`）
- 管理画面（`/admin/*` および `/api/admin/*`）の認証はアプリ認証と完全に別系統で、本番は Cloudflare Access の Google SSO で前段ゲートしたうえで Origin が `Cf-Access-Jwt-Assertion` を検証する（`requireCloudflareAccess` ミドルウェア、`req.adminEmail`）。詳細は [docs/plans/admin-auth-cloudflare.md](docs/plans/admin-auth-cloudflare.md) 参照
  - **モバイルアプリは `/api/admin` には到達しない**。誤って `mobile/src/api/` から admin エンドポイントを叩く実装を入れないこと
  - `requireAuth` と `requireCloudflareAccess` を同じルートに重ね掛けしないこと（フィールド名が `req.userEmail` と `req.adminEmail` で分かれているのは、混入時に型で気づくため）
- メール送信は Resend (noreply@chobi.me)
- 環境変数は `.env` ファイルで管理 (Git にコミットしない)

### ローカルで管理画面を触るとき
本番は Cloudflare Access が前段ゲートになっているので、ローカル `npm run dev` では
`Cf-Access-Jwt-Assertion` ヘッダが付かず管理画面 API は 401 になる。手元で触るときは
`server/.env` に以下を追加する（バイパスは `NODE_ENV` が `development` / `test` のときだけ効く）。

```
ADMIN_AUTH_DEV_BYPASS=1
ADMIN_AUTH_DEV_EMAIL=dev-admin@local   # 任意。省略時は dev-admin@local
```

## タスク管理ルール

- タスクは `TODO.md` で管理する
- タスクが完了したら `TODO.md` から該当項目を削除し、`DONE.md` に移動する
- `DONE.md` には完了日を `YYYY-MM-DD` 形式で付けて記録する
- 新しいタスクが発生したら `TODO.md` の適切なセクションに追加する
- タスクの実施前に `TODO.md` を確認し、優先度の高いものから着手する
- コミット時に `TODO.md` を確認し、実装した機能に対応するタスクがあれば `DONE.md` に移動する

## 作業着手ルール

作業（実装・調査いずれも）を始めるときは、コードに手を入れる前に以下を行う。

1. **プランファイルを作成する**: `docs/plans/<task-name>.md` に実装プラン or 調査プランを作成する
   - 目的・背景、対応方針、影響範囲、テスト方針を最低限記載する
   - 複数 Phase / Step に分かれる場合はファイル内でも Phase / Step を明示する
2. **`TODO.md` に該当項目があるか確認する**
   - 無ければ適切なセクションに追加する
   - 既存項目があれば、その項目に作成したプランファイルへのリンクを追記する（例: `[plan](docs/plans/<task-name>.md)`）
3. **複数 Phase / Step がある場合は `TODO.md` に子タスクとして追加する**
   - 親項目の下にインデントしたチェックボックスで Phase / Step を列挙する
   - Phase / Step が完了するごとにチェックを入れ、全完了で親項目を `DONE.md` に移す
4. **作業完了時の後片付け**
   - 親タスクを `DONE.md` に移動する
   - 対応するプランファイルは `docs/plans/archive/` に移動する

## ファイル構成のルール

- サーバのソースは `server/src/` 配下に置く
- Web のランディング/管理画面は `web/` 配下に置く（`about.html`, `privacy.html`, `admin/`, `img/`）
- モバイルアプリは `mobile/` 配下に置く (Expo Router, `mobile/src/` にソース)
- 設定ファイルは各プロジェクトルートに置く
