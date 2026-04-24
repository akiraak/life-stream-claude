# ログインなしで使えるようにする — 実装プラン（確定版）

`docs/plans/no-login-mode.md` の設計検討を受けた確定実装プラン。

> **注記（2026-04-24）**: 本プランで触れた Web 側の no-login UI は、その後の
> [Web アプリ削除プラン](../web-app-removal.md) によって PWA ごと削除済み。
> 現在 no-login モードはモバイルアプリのみで提供される。

## 確定事項

| 項目 | 決定 |
|------|------|
| 機能スコープ | **案A-3**: 買い物リスト/料理/自分のレシピ すべてローカル化。いいね・公開のみログイン必須 |
| AI API 設計 | **B-1**: 新設 `POST /api/ai/suggest` に一本化、dish 系 AI API・自動保存は廃止 |
| 端末 ID ハッシュ化 | **C-1**: サーバ側で `sha256(生ID + DEVICE_ID_SECRET)`、生 ID はログ保存禁止 |
| ログイン画面 | AuthModal をアプリ常設、`/(auth)/login` 画面は **完全廃止** |
| ローカルストレージ | AsyncStorage + zustand persist |
| マイグレスキップ時 | ローカルデータ破棄（警告付き） |
| ログアウト時 | ローカルストアから全クリア |
| 残回数 UI | `X-AI-Remaining` ヘッダ経由、呼出後のみ表示 |
| Web 対応 | 今回スコープ外（従来通りログイン必須のまま据え置き） |
| `/api/recipes/recommend` | **廃止** |
| `/api/claude` | **廃止** |
| `DEVICE_ID_SECRET` ローテ挙動 | 全未ログイン quota リセットを仕様として受容 |

## サーバ API 最終形

凡例: 🔓 未ログイン可 (optionalAuth) / 🔒 ログイン必須 / 🆕 新規 / ❌ 廃止 / 🔧 変更

### `/api/auth`（変更なし）
| Method | Path | 機能 | 認証 |
|--------|------|------|------|
| POST | `/api/auth/login` | メールアドレス受付→マジックコード送信 | 🔓 |
| POST | `/api/auth/verify-code` | 6 桁コード検証→JWT 発行 | 🔓 |
| POST | `/api/auth/google` | Google ID トークン検証→JWT 発行 | 🔓 |
| GET | `/api/auth/google-client-id` | Google Client ID 取得 | 🔓 |
| GET | `/api/auth/me` | 自分のユーザー情報取得 | 🔒 |

### `/api/ai` 🆕（新設）
| Method | Path | 機能 | 認証 |
|--------|------|------|------|
| POST | `/api/ai/suggest` | 料理名→具材・レシピ提案（ステートレス） | 🔓 + `rateLimitAi` |

- Body: `{ dishName: string, extraIngredients?: string[] }`
- Response: `{ ingredients, recipes }` + ヘッダ `X-AI-Remaining`
- 未ログイン: 3 回/日、`X-Device-Id` 必須
- ログイン: 20 回/日

### `/api/shopping`（既存、ログイン時の端末間同期用に残す）
| Method | Path | 機能 | 認証 |
|--------|------|------|------|
| GET | `/api/shopping` | 食材一覧取得 | 🔒 |
| POST | `/api/shopping` | 食材追加 | 🔒 |
| PUT | `/api/shopping/:id` | 食材更新 | 🔒 |
| DELETE | `/api/shopping/:id` | 食材削除 | 🔒 |
| DELETE | `/api/shopping/checked` | チェック済み一括削除 | 🔒 |
| PUT | `/api/shopping/reorder` | 並べ替え | 🔒 |
| GET | `/api/shopping/suggestions` | 食材名サジェスト | 🔒 |

### `/api/dishes`（既存、AI 系サブルートのみ変更）
| Method | Path | 機能 | 認証 |
|--------|------|------|------|
| GET | `/api/dishes` | 料理一覧取得 | 🔒 |
| POST | `/api/dishes` | 料理追加 | 🔒 |
| PUT | `/api/dishes/:id` | 料理名更新 | 🔒 |
| DELETE | `/api/dishes/:id` | 料理削除 | 🔒 |
| PUT | `/api/dishes/reorder` | 料理並べ替え | 🔒 |
| POST | `/api/dishes/:id/items` | 食材リンク | 🔒 |
| DELETE | `/api/dishes/:id/items/:itemId` | 食材リンク解除 | 🔒 |
| PUT | `/api/dishes/:id/items/reorder` | 食材並べ替え | 🔒 |
| GET | `/api/dishes/suggestions` | 料理名サジェスト | 🔒 |
| PUT | `/api/dishes/:id/ai-cache` 🆕 | AI 結果キャッシュ保存 | 🔒 |
| POST | `/api/dishes/:id/suggest-ingredients` ❌ | 廃止（`/api/ai/suggest` に移行） | — |

### `/api/saved-recipes`
| Method | Path | 機能 | 認証 |
|--------|------|------|------|
| GET | `/api/saved-recipes` | 自分のレシピ一覧 | 🔒 |
| GET | `/api/saved-recipes/:id` | 個別取得 | 🔒 |
| POST | `/api/saved-recipes` | 保存（単体） | 🔒 |
| POST | `/api/saved-recipes/bulk` 🆕 | 一括保存（AI 結果の自動保存用） | 🔒 |
| DELETE | `/api/saved-recipes/:id` | 削除 | 🔒 |
| PUT | `/api/saved-recipes/:id/like` | いいねトグル | 🔒 |
| GET | `/api/saved-recipes/shared` 🔧 | みんなのレシピ一覧（未ログイン可、liked は常に 0） | 🔓 |

### `/api/migrate` 🆕
| Method | Path | 機能 | 認証 |
|--------|------|------|------|
| POST | `/api/migrate` | ローカルの items/dishes/savedRecipes を一括インポート | 🔒 |

### `/api/admin`（変更なし）
| Method | Path | 機能 | 認証 |
|--------|------|------|------|
| `*` | `/api/admin/*` | 管理画面用 API | 🔒 + admin |

### 廃止
- `/api/claude`（未使用）
- `/api/recipes/*`（未使用、Claude CLI 依存で本番動作不明）
- `server/src/services/claude-service.ts`（参照元が廃止されるため）

---

## 実装順序（Phase 分割）

### Phase 1: サーバ側基盤（未ログイン AI を動かす下地）

1. **DB スキーマ追加**: `server/src/database.ts` に `ai_quota` テーブルを追加
   ```sql
   CREATE TABLE ai_quota (
     key TEXT NOT NULL,        -- 'user:<id>' または 'device:<hash>'
     date TEXT NOT NULL,       -- 'YYYY-MM-DD' (JST)
     count INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (key, date)
   );
   ```
2. **環境変数追加**: `.env` に `DEVICE_ID_SECRET`, `AI_LIMIT_USER=20`, `AI_LIMIT_GUEST=3` を追加
3. **`optionalAuth` ミドルウェア**: `server/src/middleware/auth.ts` に追加
   - Authorization ヘッダがあれば検証・`req.userId`/`req.userEmail` をセット、無ければそのまま通す
4. **`rateLimitAi` ミドルウェア**: `server/src/middleware/rate-limit-ai.ts` を新規作成
   - `req.userId` があれば `key = 'user:<id>'`, `limit = AI_LIMIT_USER`
   - 無ければ `X-Device-Id` ヘッダ必須、受信直後に `sha256(raw + DEVICE_ID_SECRET)` でハッシュ化、`key = 'device:<hash>'`, `limit = AI_LIMIT_GUEST`
   - JST 日付で `ai_quota` を UPSERT、count++
   - 上限超過で `429 { error: 'ai_quota_exceeded', remaining: 0, resetAt }`
   - 成功時はレスポンスヘッダに `X-AI-Remaining` を追加
5. **新ルート `POST /api/ai/suggest`**: `server/src/routes/ai.ts` を新規作成
   - body `{ dishName, extraIngredients? }` を受けて Gemini 呼出、`{ ingredients, recipes }` を返す
   - 既存の `buildDishInfoPrompt` / `parseDishInfo`（現 `routes/dishes.ts` 内）をヘルパーに切り出し再利用
6. **`GET /api/saved-recipes/shared` を `optionalAuth` に変更**: `server/src/index.ts` のマウント修正
   - サービス側 `getSharedRecipes` の userId を optional に、未ログイン時は `liked = 0` を返すバリアントを用意
7. **`POST /api/saved-recipes/bulk` 新設**: `server/src/routes/saved-recipes.ts` に追加
   - body `{ recipes: SavedRecipeInput[] }` を一括 INSERT
8. **`PUT /api/dishes/:id/ai-cache` 新設**: `server/src/routes/dishes.ts` に追加
   - body `{ ingredients, recipes }` を受けて既存の `updateDishInfo` を呼ぶだけ
9. **`POST /api/migrate` 新設**: `server/src/routes/migrate.ts` を新規作成
   - body `{ items, dishes, savedRecipes }` をトランザクションで一括 INSERT、新 ID を返す
   - `server/src/index.ts` でマウント
10. **廃止ルートとサービスの削除**
    - 削除: `server/src/routes/claude.ts`, `server/src/routes/recipes.ts`, `server/src/services/claude-service.ts`
    - `server/src/routes/dishes.ts` から `POST /:id/suggest-ingredients` ハンドラを削除、`autoSaveRecipes` 呼び出しも削除
    - `server/src/index.ts` のインポートとマウント削除
    - `docs/specs/shopping-list.md` の該当節に廃止注記

**動作確認**: Node サーバ単体で curl で叩く。未ログイン `/api/ai/suggest`、ログイン `/api/saved-recipes/shared`、`/api/migrate` のハッピーパスと上限エラー。

### Phase 2: モバイル側認証 UI の差し替え

11. **`expo-application` 導入**: `npx expo install expo-application`
12. **`src/utils/device-id.ts` 新規作成**
    - iOS: `Application.getIosIdForVendorAsync()`
    - Android: `Application.getAndroidId()`
    - null fallback: `expo-crypto` で UUID 発行 → `expo-secure-store` にキャッシュ
    - 生 ID をそのまま返す（ハッシュ化はサーバ側）
13. **`src/api/client.ts` に `X-Device-Id` ヘッダ自動付与**
    - JWT が無いリクエスト時は `X-Device-Id` を付与
14. **`AuthModal` 実装**: `src/components/auth/AuthModal.tsx` を新規作成
    - 2 ステップ: メール入力 → コード入力
    - `useAuthStore` の state で開閉管理
    - 成功時に `onSuccess` を呼んでクローズ
    - キャンセル時はクローズのみ
15. **`useAuthStore` 拡張**: `src/stores/auth-store.ts`
    - `authModalVisible`, `authModalReason`, `authModalOnSuccess`
    - `requestLogin({ reason, onSuccess? })`, `closeAuthModal()`
16. **`app/_layout.tsx` 修正**
    - 未認証リダイレクト (`router.replace('/(auth)/login')`) を削除
    - `<AuthModal>` を Slot の兄弟として常設
17. **`/(auth)` グループ削除**
    - `mobile/app/(auth)/login.tsx` 等を削除、関連ナビゲーション参照を整理
18. **`(tabs)/_layout.tsx` のメニュー**
    - 未ログイン時は「ログイン」エントリ、ログイン時は `<email>` + 「ログアウト」

**動作確認**: 新規起動でタブが開けること、☰メニューの「ログイン」でモーダルが出ること、認証成功でモーダルが閉じること。

### Phase 3: モバイル側ローカルストア化

19. **AsyncStorage 導入**: `npx expo install @react-native-async-storage/async-storage`
20. **`shopping-store` にモード切替追加**: `src/stores/shopping-store.ts`
    - `mode: 'local' | 'server'`
    - `local` 時は AsyncStorage 経由（zustand persist middleware）、ID はクライアント側 UUID
    - `server` 時は既存通り `shoppingApi` / `dishesApi` 経由
    - `loadAll`, `addItem`, `updateItemName`, `toggleCheck`, `deleteItem`, `deleteCheckedItems`, `reorderItems`, 料理系メソッドすべてに分岐
21. **`recipe-store` にモード切替追加**: `src/stores/recipe-store.ts`
    - `local` / `server` モード分岐
    - `local` 時はいいね関連は `requestLogin()` を呼んで誘導
22. **AI 提案フロー変更**
    - 新 API ラッパ `src/api/ai.ts` を作成: `suggestAi({ dishName, extraIngredients })` → `POST /api/ai/suggest`
    - `suggestIngredients(dishId, ...)` を新フロー化:
      1. `suggestAi()` を呼ぶ（ステートレス）
      2. レスポンスの `{ ingredients, recipes }` をローカル dish にキャッシュ（local モード）、または `PUT /api/dishes/:id/ai-cache` でサーバ保存（server モード）
      3. レシピ自動保存: local モードではローカル saved-recipes に追加、server モードでは `POST /api/saved-recipes/bulk` を叩く
    - レスポンスヘッダ `X-AI-Remaining` を読んで `useAiStore.remaining` に保存
23. **`useAiStore` 新規**: `src/stores/ai-store.ts`
    - `remaining: number | null`, `setRemaining(n)`, `consumeQuotaError(error)` 等
24. **料理詳細画面で残回数表示 + 上限到達時のモーダル**
    - ボタン文言「AI 提案（残り X 回）」
    - 429 を受けたら未ログインは `requestLogin({ reason: 'AI 回数を増やす' })`、ログイン済みは「明日また使えます」トースト
25. **みんなのレシピ画面の未ログイン対応**: `app/(tabs)/shared.tsx`
    - 未ログイン時も閲覧可、ハートは常に抜き表示
    - いいね押下で `requestLogin({ reason: 'レシピにいいね', onSuccess: retry })`
26. **自分のレシピ画面の未ログイン対応**: `app/(tabs)/recipes.tsx`
    - local モードのデータを表示、いいね操作は `requestLogin()`

**動作確認**: 新規起動（未ログイン）で買い物リスト追加・料理追加・AI 提案（残数表示）・自分のレシピ表示が全てローカルで動くこと。

### Phase 4: マイグレーション

27. **マイグレーション API ラッパ**: `src/api/migrate.ts` を新規作成
    - `migrate({ items, dishes, savedRecipes })` → `POST /api/migrate`
28. **ログイン成功時のフック**: `AuthModal` の `onSuccess` の直前 or `useAuthStore.verify` の後
    - ローカル非空判定
    - 確認ダイアログ「ローカルの X 件をアカウントに移しますか？」[移す / 破棄]
    - 「移す」: `migrate()` → 返ってきた ID でローカル置換 → `mode: 'server'` に切替 → `loadAll()`
    - 「破棄」: 警告ダイアログ「ローカルデータは削除されます。本当によいですか？」[破棄する / キャンセル] → ローカルクリア → `mode: 'server'` 切替 → `loadAll()`
    - キャンセル時: ログイン成功自体もロールバック（トークン削除）して元のローカル状態維持
29. **ログアウト時のローカルクリア**: `useAuthStore.logout`
    - `mode: 'server'` から `'local'` へ切替、ストアのデータは全クリア（ログアウト時に前ユーザーのサーバデータが残らないように）

**動作確認**: 未ログインでデータを作る → ログイン → 移行確認 → 「移す」でサーバに取り込まれることを確認。「破棄」の警告が出ることも確認。ログアウトで空状態に戻ることを確認。

### Phase 5: 仕上げ

30. **メニュー UI 微調整**: 残 AI 回数表示を `(tabs)/_layout.tsx` のメニュー内に追加（任意）
31. **プライバシーポリシー更新**: `web/privacy.html` に「端末 ID（IDFV/SSAID）をハッシュ化して利用回数管理に用いる」旨を追記
32. **管理画面に ai_quota ビュー追加**: `server/src/routes/admin.ts` / `web/admin/app.js`（任意、運用モニタ用）
33. **回帰テスト**
    - ログインユーザーで従来機能（買い物リスト、AI 提案、自分のレシピ、いいね、みんなのレシピ）が動作
    - 未ログインで上記の閲覧・ローカル操作・AI 提案 3 回までが動作
    - ログイン→ローカル→サーバマイグレーションの往復
34. **App Store / Google Play の提出用説明更新**: 「登録不要で中身を試せる」旨の訴求を反映

---

## 変更ファイル一覧（概算）

### 新規作成
- `server/src/middleware/rate-limit-ai.ts`
- `server/src/routes/ai.ts`
- `server/src/routes/migrate.ts`
- `mobile/src/utils/device-id.ts`
- `mobile/src/api/ai.ts`
- `mobile/src/api/migrate.ts`
- `mobile/src/stores/ai-store.ts`
- `mobile/src/components/auth/AuthModal.tsx`

### 変更
- `server/src/database.ts` (ai_quota テーブル)
- `server/src/middleware/auth.ts` (optionalAuth 追加)
- `server/src/routes/dishes.ts` (AI サブルート削除、ai-cache 追加)
- `server/src/routes/saved-recipes.ts` (bulk 追加、shared の optionalAuth 化)
- `server/src/services/saved-recipe-service.ts` (getSharedRecipes の userId optional 化)
- `server/src/index.ts` (ルーティング整理)
- `server/.env.example`（もしあれば）に DEVICE_ID_SECRET 追加
- `mobile/src/stores/auth-store.ts`
- `mobile/src/stores/shopping-store.ts`
- `mobile/src/stores/recipe-store.ts`
- `mobile/src/api/client.ts` (X-Device-Id 付与)
- `mobile/app/_layout.tsx` (リダイレクト撤廃、AuthModal 常設)
- `mobile/app/(tabs)/_layout.tsx` (メニューのログインエントリ)
- `mobile/app/(tabs)/shared.tsx`, `recipes.tsx`, `index.tsx` (ゲート調整)
- `web/privacy.html` (プライバシーポリシー)

### 削除
- `server/src/routes/claude.ts`
- `server/src/routes/recipes.ts`
- `server/src/services/claude-service.ts`
- `mobile/app/(auth)/` 配下すべて

---

## リスク / 注意事項

- **AI コスト上限の実効性**: サーバ側の `ai_quota` は SQLite の単一 key で管理するため、同時並列 POST で race condition が起きて上限+1 程度オーバーする可能性あり。実害が小さいので初版は許容、必要ならトランザクション内で `count < limit` を check するロックに変更
- **iOS 同 vendor ID**: 同じ開発者の他アプリを全部消すと IDFV が変わる → 同一ユーザーが別端末扱いになる（quota が増える方向なので緩い方へのズレ、許容）
- **Android Factory Reset**: SSAID が変わる → 同様に quota リセット、許容
- **マイグレーション競合**: 2 台目の端末で既存アカウントにログインしてローカルデータをマージするとサーバ側に重複が発生し得る。初版は単純追加で許容、ユーザーが不要データを手動削除
- **device_id 付与忘れ**: 未ログイン API 呼出で `X-Device-Id` が無いと 400 を返す。モバイル API ラッパでの自動付与を徹底

---

## 着手順の推奨

Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 の直列実施を推奨。
- Phase 1 単体でサーバは新 API を返せる状態になり、旧クライアントも壊れない（dish 系削除は最終段階）
- Phase 2 でログイン導線が新しくなるが、画面自体は既存機能のまま動く（API はまだ旧形式を向いている）
- Phase 3 でローカルストア化とともに API 呼び出し先を切り替える
- Phase 4 でマイグレーションを仕上げ、初めて "ログインして戻る" 体験が完成
- Phase 5 は仕上げ

各 Phase 完了時点でコミットして、途中断した場合もサーバ/クライアントが整合する状態を保てるようにする。
