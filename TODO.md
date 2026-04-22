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

## dev-admin レイアウト変更
        docs/plans/dev-admin-layout.md
- [x] Step1: サーバ `/api/docs` をツリー構造レスポンスに変更
- [x] Step2: トップタブ DOM を `index.html` に追加
- [x] Step3: `app.js` にタブ切替・ツリー描画・折りたたみ・localStorage 連携を実装
- [ ] Step4: `style.css` にタブ・ツリーのスタイルを追加
- [ ] Step5: 動作確認（タブ切替 / 折りたたみ / 状態復元 / 既存 URL 互換）

## 小修整
- [ ] 料理レシピページの料理名をページの「買い物リスト」の表示の場所を差し替えて
- [ ] 買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを表示して
- [ ] 料理レシピページのステップを見るのなかのテキストが画面右端からはみ出てる
- [ ] ハートをフラットなイラストに


## 管理画面

## バグ
- [ ] Google認証を他のアカウントでチェック