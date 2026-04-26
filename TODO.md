# TODO

> 作業が完了した項目を DONE.md に移動する。docs/plans/ にプランファイルがある場合は docs/plans/archive に移動させる。

## 機能開発
- [ ] expoでのクライアントアプリビルドスクリプトを作成。localサーバ接続と本番サーバ接続と、TextFlightアップの３種類 [plan](docs/plans/mobile-build-scripts.md)
  - [x] Phase 1: スクリプト追加と eas.json 整理
    - [x] `mobile-build-local.sh` を `expo start` ベースで作成し `chmod +x`
    - [x] `mobile-build-prod.sh` を `expo start` ベースで作成し `chmod +x`
    - [x] `mobile-submit-testflight.sh` を作成し `chmod +x`
    - [x] `mobile/eas.json` から preview/development の `EXPO_PUBLIC_API_URL` プレースホルダを削除
  - [ ] Phase 2: 動作確認
    - [ ] `./mobile-build-local.sh` で LAN サーバに Expo Go で接続できること
    - [ ] `./mobile-build-prod.sh` で本番サーバに Expo Go で接続できること
    - [ ] `./mobile-submit-testflight.sh` で TestFlight に提出できること
  - [ ] Phase 3: ドキュメント
    - [ ] README に 3 つのスクリプトの使い方を追記
- [ ] 料理追加 -> 具材を追加（春キャベツ） -> 料理画面 -> この素材でレシピをAI検索（残り X 回） -> 具材に「春キャベツ」と他の食材が表示されレシピも３つ表示される -> 「レシピをAI検索（残り X 回）」 -> 「春キャベツ」が追加素材（買い物リストから）に表示される。本来は具材の方に表示されるべき
- [ ] アプリ起動直後は右上ハンバーガーのAI使用回数が表示されない
- [ ] 自分のレシピに表示されるレシピの判定基準の調査
- [ ] ライトモードのデザイン追加
- [ ] passkeys認証対応
- [ ] オフラインの時にローカルで変更を保存しておきオンラインになったときに更新
- [ ] アイテム編集ダイアログから削除を削除
- [ ] basket@chobi.me を使えるようにする
- [ ] サービスの状況をメールで定期報告
- [ ] 料理レシピページの料理名をページの「買い物リスト」の表示の場所を差し替えて
- [ ] 買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを表示して
- [ ] 料理レシピページのステップを見るのなかのテキストが画面右端からはみ出てる
- [ ] ハートをフラットなイラストに
- [ ] Google認証を他のアカウントでチェック
- [ ] アプリアイコンのボールをバスケットに

## 開発管理画面
- [ ] plansでアーカイブにしたら即アーカイブに移動した表示に反映して
- [ ] 開発管理画面の機能だけど切り出して他のプロジェクトからもすぐ使えるようにする
