# TODO

## 仕様・設計

## アプリ公開 (App Store / Google Play)
        docs/plans/app-store-publish.md
- [x] Step1: EAS セットアップ (eas-cli, eas login, eas init, eas.json作成)
- [x] Step2: app.json 公開向け設定 (runtimeVersion, permissions, infoPlist)
- [x] Step3: アイコン・スクリーンショット準備
- [x] Step4: プライバシーポリシーページ作成・公開
- [x] Step5: Apple Developer Program 登録 ($99/年)
- [x] Step6: iOS App Store 審査提出済み（TestFlight動作確認済み）
- [x] Step7: Google Play Console 登録 ($25)
- [ ] Step8: Android Google Play クローズドテスト → 製品版公開
  - [x] クローズドテストのトラック作成・AABアップロード・審査提出
  - [ ] ストアの掲載情報を完成（スクリーンショット・説明文・フィーチャーグラフィック）
  - [ ] アプリのコンテンツ設定（プライバシーポリシー、レーティング、データセーフティ）
  - [ ] テスター20人を集めてオプトイン
  - [ ] 14日間のテスト期間を経過
  - [ ] 製品版に昇格して公開

## ログインなしで使えるようにする
        docs/plans/no-login-mode.md（設計検討）
        docs/plans/no-login-mode-impl.md（実装プラン・確定版）
- [x] 変更プランを作成する

### Phase 1: サーバ側基盤
- [x] 1. `ai_quota` テーブル追加（`server/src/database.ts`）
- [x] 2. `.env` に `DEVICE_ID_SECRET` / `AI_LIMIT_USER=20` / `AI_LIMIT_GUEST=3` を追加
- [x] 3. `optionalAuth` ミドルウェア追加（`server/src/middleware/auth.ts`）
- [x] 4. `rateLimitAi` ミドルウェア新規作成（`server/src/middleware/rate-limit-ai.ts`、端末 ID ハッシュ化・日次カウント・`X-AI-Remaining` 付与）
- [x] 5. `POST /api/ai/suggest` 新規作成（`server/src/routes/ai.ts`、プロンプト/パース処理を `dishes.ts` から分離）
- [x] 6. `GET /api/saved-recipes/shared` を `optionalAuth` 化（`getSharedRecipes` の userId optional 対応）
- [x] 7. `POST /api/saved-recipes/bulk` 新規追加（一括保存）
- [x] 8. `PUT /api/dishes/:id/ai-cache` 新規追加（AI 結果キャッシュ保存）
- [x] 9. `POST /api/migrate` 新規作成（`server/src/routes/migrate.ts`、ローカル→サーバ一括取り込み）
- [x] 10. `POST /api/dishes/:id/suggest-ingredients` ハンドラ削除（`autoSaveRecipes` 呼出も除去）
- [x] 10. `server/src/routes/claude.ts` / `recipes.ts` / `services/claude-service.ts` 削除、`index.ts` のマウント整理
- [x] 10. `docs/specs/shopping-list.md` の廃止節に注記

### Phase 2: モバイル側認証 UI 差し替え
- [x] 11. `expo-application` 導入（`expo-crypto` も併せて導入）
- [x] 12. `mobile/src/utils/device-id.ts` 新規作成（iOS IDFV / Android SSAID、null fallback は UUID + secure-store）
- [x] 13. `mobile/src/api/client.ts` で未ログイン時に `X-Device-Id` ヘッダ自動付与
- [x] 14. `mobile/src/components/auth/AuthModal.tsx` 新規作成（メール→コードの 2 ステップ）
- [x] 15. `mobile/src/stores/auth-store.ts` 拡張（`requestLogin` / `closeAuthModal` / モーダル state、既存 `login` は `sendMagicCode` にリネーム）
- [x] 16. `mobile/app/_layout.tsx` から未認証リダイレクト削除、`<AuthModal>` 常設
- [x] 17. `mobile/app/(auth)/` 配下削除
- [x] 18. `mobile/app/(tabs)/_layout.tsx` メニュー改修（未ログイン時「ログイン」、ログイン時 `<email>` + 「ログアウト」）

### Phase 3: モバイル側ローカルストア化
- [x] 19. `@react-native-async-storage/async-storage` 導入
- [x] 20. `mobile/src/stores/shopping-store.ts` に `mode: 'local' | 'server'` 切替追加（zustand persist / クライアント UUID / 全メソッド分岐）
- [x] 21. `mobile/src/stores/recipe-store.ts` に mode 切替追加、いいねは `requestLogin()` で誘導
- [x] 22. `mobile/src/api/ai.ts` 新規作成（`suggestAi({ dishName, extraIngredients })` ラッパ）
- [x] 22. `suggestIngredients` フロー書き換え（`/api/ai/suggest` 呼出 → local: ローカルキャッシュ / server: `PUT /api/dishes/:id/ai-cache`、自動保存も local / `POST /api/saved-recipes/bulk` で分岐）
- [x] 23. `mobile/src/stores/ai-store.ts` 新規作成（残回数 state、`X-AI-Remaining` 受信・エラー 429 ハンドリング）
- [x] 24. 料理詳細画面に残回数表示 + 上限到達時のゲート（未ログイン→`requestLogin`、ログイン済→トースト）
- [x] 25. `mobile/app/(tabs)/shared.tsx` 未ログイン対応（ハート抜き固定、押下で `requestLogin`）
- [x] 26. `mobile/app/(tabs)/recipes.tsx` 未ログイン対応（ローカルデータ表示、いいね操作で `requestLogin`）
- [ ] (動作確認) 新規起動→買い物リスト追加→料理追加→AI 提案→自分のレシピ表示 の全フローがローカルで動作することを実機確認

### Phase 4: マイグレーション
- [x] 27. `mobile/src/api/migrate.ts` 新規作成（`POST /api/migrate` ラッパ）
- [x] 28. ログイン成功フックで確認ダイアログ表示（「ローカルの X 件をアカウントに移しますか？」[移す / 破棄]）
- [x] 28. 「移す」: `migrate()` → ID 置換 → `mode: 'server'` 切替 → `loadAll()`
- [x] 28. 「破棄」: 警告ダイアログ「ローカルデータは削除されます」→ ローカルクリア → server 切替
- [x] 28. キャンセル時はトークン削除でログインもロールバック
- [x] 29. `useAuthStore.logout` でローカルストア全クリア + mode を local に戻す
- [ ] (動作確認) 未ログイン→作成→ログインで取り込み、ログアウトで空状態、の往復を実機確認

### Phase 5: 仕上げ
- [x] 30. メニュー内に残 AI 回数表示（任意）
- [x] 31. `web/privacy.html` に端末 ID ハッシュ化利用の記載追加
- [x] 32. 管理画面に `ai_quota` 閲覧ビュー追加（任意、運用モニタ用）
- [x] 33. 回帰テスト（server 11 files / 119 tests、mobile 9 files / 56 tests）
- [x] 34. App Store / Google Play 提出用説明に「登録不要で試せる」訴求を反映

## 機能開発
- [ ] ライトモードのデザイン追加
- [ ] passkeys認証対応
- [ ] オフラインの時にローカルで変更を保存しておきオンラインになったときに更新
- [ ] アイテム編集ダイアログから削除を削除
- [ ] basket@chobi.me を使えるようにする
- [ ] サービスの状況をメールで定期報告

## テストの導入
        docs/plans/testing.md
- [ ] 初回 PR で GitHub Actions が両プロジェクト緑になることを確認

## 小修整
- [ ] 料理レシピページの料理名をページの「買い物リスト」の表示の場所を差し替えて
- [ ] 買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを表示して
- [ ] 料理レシピページのステップを見るのなかのテキストが画面右端からはみ出てる
- [ ] ハートをフラットなイラストに

## バグ
- [ ] Google認証を他のアカウントでチェック
