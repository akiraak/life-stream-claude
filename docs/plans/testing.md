# テストの導入プラン

ログインなし版（`docs/plans/no-login-mode-impl.md`）への大規模改修に入る前に、自動テストの土台を整え、リグレッションを検知できる状態を作る。

## 目的

- 未ログイン版移行で破壊されやすい **サーバ API 契約** と **モバイル store のロジック** を守る安全網を用意する。
- 「手動で叩いて確認」→「コマンド一発で確認」に置き換え、Phase ごとの動作確認を高速化する。
- 将来の機能追加（passkeys、オフラインモード等）でも使える共通の足場を作る。

## スコープ

| 対象 | 今回 | 後回し |
|------|------|--------|
| server (Express + SQLite + TS) | ✅ ユニット + 統合 | — |
| mobile (Zustand store / API クライアント) | ✅ ユニットのみ | RN コンポーネント描画テスト |
| web (Vanilla JS PWA) | — | 手動維持 |
| dev-admin | — | ローカル専用ツールのため対象外 |

**E2E（Detox / Playwright）は今回やらない。** コストに対して保守負荷が高く、no-login 移行のリグレッション検知には `supertest` ベースの API 統合テストで十分と判断。

## ツール選定

| レイヤ | ツール | 選定理由 |
|--------|--------|----------|
| サーバ runner | **Vitest** | TS ネイティブ、`ts-node` なしで動く、Jest 互換 API、watch が速い。`better-sqlite3` との相性良し |
| サーバ HTTP | **supertest** | Express app を listen せずに叩ける定番 |
| モバイル runner | **Jest + jest-expo preset** | Expo 公式サポート。RN のトランスフォーマ対応込み |
| アサーション | Vitest / Jest 組込み `expect` | 外部依存を増やさない |
| モック | Vitest `vi.mock` / Jest `jest.mock` | 外部 API（Gemini, Resend, Google OAuth）を差し替え |
| カバレッジ | `@vitest/coverage-v8` / Jest 組込み | 最低ライン設定はせず、可視化のみ |

→ **サーバは Vitest、モバイルは Jest** の二本立て。共通化しない理由: モバイルは Expo の Babel 変換が必須で Vitest だと設定が重くなる。

## ディレクトリ構成

```
server/
├── src/
├── tests/                    # 新規
│   ├── setup.ts              # beforeEach で DB 初期化
│   ├── helpers/
│   │   ├── db.ts             # テスト用 DB_PATH 生成・クリーンアップ
│   │   ├── auth.ts           # テスト用 JWT 発行ヘルパ
│   │   └── app.ts            # express app 生成（listen しない）
│   ├── unit/
│   │   ├── shopping-service.test.ts
│   │   ├── dish-service.test.ts
│   │   ├── saved-recipe-service.test.ts
│   │   └── auth-service.test.ts
│   └── integration/
│       ├── shopping.test.ts
│       ├── dishes.test.ts
│       ├── saved-recipes.test.ts
│       └── auth.test.ts
├── vitest.config.ts          # 新規
└── package.json

mobile/
├── src/
├── __tests__/                # 新規
│   ├── stores/
│   │   ├── shopping-store.test.ts
│   │   ├── recipe-store.test.ts
│   │   └── auth-store.test.ts
│   └── api/
│       └── client.test.ts
├── jest.config.js            # 新規
├── jest.setup.ts             # 新規
└── package.json

.github/workflows/
└── test.yml                  # 新規
```

## Phase 分割

### Phase 1: サーバ側テスト基盤

1. `server/` で依存追加
   ```bash
   cd server && npm i -D vitest @vitest/coverage-v8 supertest @types/supertest
   ```
2. `server/vitest.config.ts` 作成（`environment: 'node'`、`setupFiles: ['./tests/setup.ts']`、`pool: 'forks'` で DB ファイル競合回避）
3. `server/package.json` に scripts 追加
   ```json
   "test": "vitest run",
   "test:watch": "vitest",
   "test:coverage": "vitest run --coverage"
   ```
4. `tests/helpers/db.ts`: `beforeEach` で `DB_PATH=/tmp/cb-test-<pid>.db` を設定し `initDatabase()` 呼び出し、`afterEach` で削除
   - `database.ts` は `DB_PATH` 既対応のため本体変更不要
5. `tests/helpers/auth.ts`: `createTestUser(email)` と `createAuthHeader(userId)`（テスト用 `JWT_SECRET` で署名）
6. `tests/helpers/app.ts`: `index.ts` から `app.listen` を切り出し、`createApp()` を export できるよう最小リファクタ
7. スモークテスト 1 本（`GET /api/health` が 200）を追加し CI でも走る状態にする

**(動作確認)** `npm test` で 1 本通る。`shopping.db` 本体に影響しないことを確認。

### Phase 2: サーバ service 層ユニットテスト

既存のコア CRUD ロジックを最優先でカバーする。**API 仕様が no-login 移行で大きく変わらない層** を先に固めて、土台として使う。

1. `shopping-service.test.ts`
   - `createItem` / `getAllItems` が userId でスコープされる（別ユーザーの item が見えない）
   - `updateItem` で `checked: 1` に変えると `purchase_history` が記録される
   - `deleteCheckedItems` の件数返却
   - `getSuggestions` が `shopping_items` 既存分を除外する
2. `dish-service.test.ts`
   - 料理追加 → 食材リンク → リンク解除 → 削除（cascade）
   - `reorder` が position を 0 起点で振り直す
3. `saved-recipe-service.test.ts`
   - 保存・一覧・削除
   - `like` トグル
   - `shared` 一覧がユーザー横断で並び、自分のは `liked` 反映（後の Phase 3 で optional 版に差し替え予定）
4. `auth-service.test.ts`
   - マジックコード発行 → 検証 → JWT 発行
   - 期限切れトークンのクリーンアップ
   - Resend 送信は `vi.mock('resend', ...)` で差し替え

**(動作確認)** `npm test` で全 service テストが通る。

### Phase 3: サーバ route 層の統合テスト

Express app に supertest でリクエストを投げ、エンドポイント契約を固定する。ここが **no-login 移行の安全網本体**。

1. `auth.test.ts`: `/api/auth/login` → `/api/auth/verify-code` の 2 ステップが動く（メール送信はモック）
2. `shopping.test.ts`: 認証ヘッダ無しは 401、あれば CRUD 一通り
3. `dishes.test.ts`: 料理 CRUD + 食材リンク + reorder
4. `saved-recipes.test.ts`: 保存 / 一覧 / いいね / shared

Gemini 呼出を含むエンドポイント（`/api/dishes/:id/suggest-ingredients`）は no-login 実装で **廃止予定** のため、今回はテストを書かない。代わりに Phase 4（下記）で新設される `/api/ai/suggest` のテストを、no-login 実装と同時に追加する段取りにする。

**(動作確認)** 全 route テストが通る。カバレッジを確認して抜けを把握。

### Phase 4: モバイル側テスト基盤

1. `mobile/` で依存追加
   ```bash
   cd mobile && npm i -D jest jest-expo @types/jest ts-jest
   ```
2. `mobile/jest.config.js`: `preset: 'jest-expo'`、`testMatch: ['**/__tests__/**/*.test.ts']`、`transformIgnorePatterns` は jest-expo のデフォルトを踏襲
3. `mobile/package.json` に `"test": "jest"` を追加
4. `__tests__/stores/shopping-store.test.ts`: `vi.mock`/`jest.mock` で `../../src/api/shopping` と `../../src/api/dishes` を差し替え、`addItem` / `toggleCheck` / `reorderItems` の state 変化を検証
5. `__tests__/stores/auth-store.test.ts`: `expo-secure-store` をモックし、`login` / `logout` / token 永続化を検証
6. `__tests__/api/client.test.ts`: axios interceptor が JWT を Authorization ヘッダに付与するか

RN コンポーネント描画（`@testing-library/react-native`）は **Phase 5 以降に保留**。理由: no-login 移行での UI 差し替え規模が大きく、今書くと手戻りになる。

**(動作確認)** `npm test` がモバイル側でも通る。

### Phase 5: CI 連携

1. `.github/workflows/test.yml` 作成
   - `push` / `pull_request` トリガ
   - matrix で `server` と `mobile` を並列実行
   - Node 20 / キャッシュ `~/.npm` / `npm ci` → `npm test`
2. README に CI バッジを追加（任意）
3. 初回 PR を立てて全テストが緑になることを確認

## 決め事・注意点

- **テスト DB は `/tmp` に per-process で作る**: 並列テスト時の WAL ファイル競合を避けるため、`vitest` は `pool: 'forks'` + `singleFork: false` で、ファイル名に `process.pid` を含める。
- **本物の外部 API を叩かない**: Gemini, Resend, Google OAuth は必ずモジュール境界でモックする。`.env.test` に `GEMINI_API_KEY=dummy` 等を置く。
- **`JWT_SECRET` はテスト用に固定値を設定**: `tests/setup.ts` で `process.env.JWT_SECRET = 'test-secret'`。本番 `.env` は読まない。
- **既存の `shopping.db` に触らない**: `DB_PATH` を必ず上書きする。`setup.ts` の冒頭で `if (process.env.NODE_ENV !== 'test') throw` を入れるのも可。
- **CommonJS / ESM の扱い**: サーバは CommonJS のまま（tsconfig `module: "commonjs"`）。Vitest は CommonJS TS も問題なく動く。
- **`better-sqlite3` の native モジュール**: CI で `npm ci` 時にビルドされる。Node バージョンを 20 に固定する。
- **no-login 移行との接続**: Phase 1〜3 が完了した時点で `no-login-mode-impl.md` の Phase 1（サーバ側基盤）に着手可能。Phase 4 は並行でよい。

## 完了基準

- [ ] `cd server && npm test` で 全テストが通る
- [ ] `cd mobile && npm test` で 全テストが通る
- [ ] GitHub Actions で両方が緑
- [ ] 新規ルート追加時のテスト書き方が README（または本ドキュメント）で辿れる
