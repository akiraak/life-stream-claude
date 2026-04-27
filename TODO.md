# TODO

> 作業が完了した項目を DONE.md に移動する。docs/plans/ にプランファイルがある場合は docs/plans/archive に移動させる。

## 機能開発
- [ ] リファクタリング 6: `IngredientsScreen.tsx` の責務分離 [plan](docs/plans/refactoring-mobile-ingredients-screen.md)
- [ ] リファクタリング 7: `database.ts` のマイグレーション整理 [plan](docs/plans/refactoring-server-database-migrations.md)
- [ ] リファクタリング 8（TODO ストック）: `shopping-store.ts` の local/server 二重実装の解消（数日規模・要設計判断・M1）
- [ ] リファクタリング 9（TODO ストック）: `app/(tabs)/index.tsx` の責務漏出整理（数日規模・M1 の上で M2 として進める）
- [ ] passkeys認証対応
- [ ] 料理レシピページの料理名をページの「買い物リスト」の表示の場所を差し替えて
- [ ] アイテム編集ダイアログから削除を削除
- [ ] basket@chobi.me を使えるようにする
- [ ] サービスの状況をメールで定期報告

- [ ] クライアントの画面下タブメニューの「買い物リスト」はアイコンは暗く「レシピノート」は明るくどちらが選択されているのか分かりにくい
- [ ] 買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを表示して
- [ ] ライトモードのデザイン追加
- [ ] 料理レシピページのステップを見るのなかのテキストが画面右端からはみ出てる

## 開発管理画面
- [ ] 開発管理画面の機能だけど切り出して他のプロジェクトからもすぐ使えるようにする
- [ ] plansでアーカイブにしたら即アーカイブに移動した表示に反映して

