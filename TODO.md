# TODO

> 作業が完了した項目を DONE.md に移動する。docs/plans/ にプランファイルがある場合は docs/plans/archive に移動させる。

## 機能開発
- [ ] AI のトークン使用量を記録して料金集計できるようにする（`gemini-service.ts` で `usageMetadata` を取り出して `ai_usage` テーブルに保存、モデル別単価表で円換算。preview モデルは無料扱い。完了後にステータス報告メールに `cost` 行を追加）
- [ ] 未ログイン/ログイン/有料の機能分けユーザー視点も考慮しながら明確にする

- [ ] ログインコードをサービスのメアドから送る
- [ ] ログイン中でオフライン状態の時の挙動のチェック
- [ ] クライアントの画面下タブメニューの「買い物リスト」はアイコンは暗く「レシピノート」は明るくどちらが選択されているのか分かりにくい
- [ ] 買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを表示して
- [ ] ライトモードのデザイン追加
- [ ] 料理レシピページのステップを見るのなかのテキストが画面右端からはみ出てる

## 開発管理画面
- [ ] 開発管理画面の機能を切り出して他のプロジェクトからもすぐ使えるようにする（vibeboard として独立リポジトリ化） [plan](docs/plans/vibeboard-extraction.md)
  - [x] Phase 1: vibeboard 環境構築（足場・CLI エントリ・ビルド通し）
  - [x] Phase 2: 汎用化（ROOT_DIR / ブランド名のハードコード除去）
  - [x] Phase 3: `vibeboard init` で親 CLAUDE.md にスニペット注入
  - [ ] Phase 4: README.md の整備（前提・Quick start・スニペット全文）
  - [ ] Phase 5: npm 公開（`npx -y vibeboard` で起動できる状態にする）
  - [ ] Phase 6: cooking-basket 側を vibeboard に置き換え（dev-admin/ 削除）
  - [ ] Phase 7: `vibeboard.config.json` 対応（任意・カテゴリ / 編集対象を可変化）
- [ ] plansでアーカイブにしたら即アーカイブに移動した表示に反映して

