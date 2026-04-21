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
- [ ] 変更プランを作成する

## 機能開発
- [ ] ライトモードのデザイン追加
- [ ] passkeys認証対応
- [ ] オフラインの時にローカルで変更を保存しておきオンラインになったときに更新
- [ ] アイテム編集ダイアログから削除を削除
- [ ] basket@chobi.me を使えるようにする
- [ ] サービスの状況をメールで定期報告
- [ ] テストの導入

## 開発用管理サーバ dev-admin
        docs/plans/dev-admin.md
- [x] Step1: dev-admin/ ディレクトリ作成、package.json / tsconfig.json 作成
- [x] Step2: dev-admin/src/index.ts で Express サーバ実装（API + 静的配信、ポート 3010）
- [x] Step3: dev-admin/src/web/ に HTML / CSS / JS を作成
- [x] Step4: ルートに dev-admin.sh 起動スクリプトを追加
- [ ] Step6: 既存 admin からドキュメント関連機能を削除
- [ ] Step7: CLAUDE.md に dev-admin の起動方法を追記

## 小修整
- [ ] 料理レシピページの料理名をページの「買い物リスト」の表示の場所を差し替えて
- [ ] 買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを表示して
- [ ] 料理レシピページのステップを見るのなかのテキストが画面右端からはみ出てる
- [ ] ハートをフラットなイラストに


## 管理画面

## バグ
- [ ] Google認証を他のアカウントでチェック