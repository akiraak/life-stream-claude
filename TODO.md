# TODO

> 作業が完了した項目を DONE.md に移動する。docs/plans/ にプランファイルがある場合は docs/plans/archive に移動させる。

## 機能開発
- [ ] アプリのシンプル化。買物リスト、レシピ履歴のみ。いいねの廃止 [plan](docs/plans/app-simplification.md)
  - 参考: [my-recipes-display-criteria.md](docs/plans/my-recipes-display-criteria.md), [my-recipes-migrate-likes.md](docs/plans/my-recipes-migrate-likes.md)
  - [x] Phase 1: サーバ — likes / shared エンドポイント・サービス・admin 削除（テスト含む）
  - [x] Phase 2: モバイル — `shared` タブ削除 / `recipes` フィルタ撤廃 / ハート UI 除去
  - [x] Phase 3: モバイル — ストア / 型 / API クライアント / テストから likes 除去
  - [ ] Phase 4: DB マイグレーション — `recipe_likes` テーブル DROP
  - [ ] Phase 5: 実機動作確認 + プラン後片付け（DONE.md 移動 + archive 移動）
- [ ] 自分のレシピに表示されるレシピの判定基準の調査 [plan](docs/plans/my-recipes-display-criteria.md)
  - [x] 現状仕様の整理（コード調査）
  - [x] 実機での挙動確認（local → ログイン「移す」でレシピ消失を再現）
  - [x] 論点 A〜D の整理と (α) プラン作成
  - [x] 検証 E-1: みんなのレシピ機能の削除案
  - [x] 検証 E-2: AI レシピ全件を「自分のレシピ」に履歴として残す案
  - [ ] **ユーザ判断**: 推奨案 / 代替案 / 再考案 のいずれを採用するか
  - [ ] 採用案に基づき実装プラン更新 or 新規作成 → 実装 → アーカイブ
- [ ] (保留) migrate API でローカル savedRecipes を「いいね済み」として取り込む [plan](docs/plans/my-recipes-migrate-likes.md)
  - 上記検証 E-1 / E-2 の結論待ち。いいね機能自体が無くなる場合は本タスク廃止

- [ ] 買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを表示して
- [ ] 料理レシピページの料理名をページの「買い物リスト」の表示の場所を差し替えて
- [ ] アプリアイコンのボールをバスケットに
- [ ] passkeys認証対応
- [ ] アイテム編集ダイアログから削除を削除
- [ ] ライトモードのデザイン追加
- [ ] basket@chobi.me を使えるようにする
- [ ] サービスの状況をメールで定期報告
- [ ] 料理レシピページのステップを見るのなかのテキストが画面右端からはみ出てる
- [ ] ハートをフラットなイラストに
- [ ] Google認証を他のアカウントでチェック

## 開発管理画面
- [ ] plansでアーカイブにしたら即アーカイブに移動した表示に反映して
- [ ] 開発管理画面の機能だけど切り出して他のプロジェクトからもすぐ使えるようにする

