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
- [ ] Phase 3 動作確認: 新規起動→買い物リスト追加→料理追加→AI 提案→自分のレシピ表示 の全フローがローカルで動作することを実機確認
- [ ] Phase 4 動作確認: 未ログイン→作成→ログインで取り込み、ログアウトで空状態、の往復を実機確認

## 機能開発
- [ ] ライトモードのデザイン追加
- [ ] passkeys認証対応
- [ ] オフラインの時にローカルで変更を保存しておきオンラインになったときに更新
- [ ] アイテム編集ダイアログから削除を削除
- [ ] basket@chobi.me を使えるようにする
- [ ] サービスの状況をメールで定期報告

## 管理画面にサーバのデプロイ日時を表示
        docs/plans/admin-deploy-timestamp.md
- [ ] Phase 3: デプロイ手順に `.env` 更新コマンドを反映、本番で実機確認

## 本番サーバログを外部から安全に閲覧
        docs/plans/server-log-viewer.md
- [x] Phase 1: 構造化ロガー（pino）導入と redact 設定、既存 console.* 置換
- [x] Phase 2: ログファイル出力とローテーション（pino-roll）
- [x] Phase 3: 管理 API `/api/admin/logs` と SSE `/api/admin/logs/stream` 追加
- [x] Phase 4: `/admin/` 管理画面にログタブ追加
- [ ] Phase 5: 動作確認（redact 効果、本番実機からの閲覧、SSE の長時間接続）

## 実機アプリの接続先サーバ切り替え
        docs/plans/api-endpoint-switch.md
- [ ] Phase 3: 動作確認（`.env` でローカル接続／未設定で本番接続／production ビルドが本番接続）

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