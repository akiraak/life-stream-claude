# アイテム編集ダイアログから「削除」ボタンを除去

## 目的・背景

買物リスト画面でアイテム名をタップすると開く編集ダイアログ（`AddModal` の `mode === 'edit'`）には「削除」ボタンがある。誤タップで意図せず単品削除が走るリスクと、ダイアログが「名前と料理紐付けの編集」と「削除」という性質の違う操作を一画面で同居させているのを整理したい。

ユーザー要望（`TODO.md` 機能開発セクション）:
> アイテム編集ダイアログから削除を削除

## 現状

- 削除ボタン本体: `mobile/src/components/shopping/AddModal.tsx:152-156`（`mode === 'edit'` のときだけ表示）
  - スタイル: `AddModal.tsx:225-234`（`deleteBtn` / `deleteBtnText`）
  - props: `onDeleteItem?: () => void`（`AddModal.tsx:27, 40`）
- 呼び出し側ハンドラ: `mobile/app/(tabs)/index.tsx:182-192`（`handleDeleteEditItem`）
  - `AddModal` への bind: `index.tsx:326`（`onDeleteItem={handleDeleteEditItem}`）
  - store action 取り出し: `index.tsx:33` の destructure に含まれる `deleteItem`
- store: `mobile/src/stores/shopping-store.ts:39, 176-185` の `deleteItem`
- backend: `mobile/src/stores/backends/shopping-backend.ts:32, 92-94, 146-148`
- API クライアント: `mobile/src/api/shopping.ts:14` の `deleteItem`
- サーバ: `server/src/routes/shopping.ts:66` の `DELETE /api/shopping/:id` → `server/src/services/shopping-service.ts:59` の `deleteItem`

### 単品削除の他の入り口の有無
調査の結果、ユーザーが個別アイテムを削除できるのは **このダイアログの「削除」ボタンのみ**。スワイプ削除やコンテキストメニューは存在しない。
- ✅ 「チェック済み」セクション → 一括削除（`deleteCheckedItems`）はあり、ボタン除去後はこれが主な削除導線になる
- ⚠️ 料理（dish）削除（`ConfirmDialog`）は **食材を残す** 仕様なので、単品削除の代替にはならない（`index.tsx:332` 「食材はリストに残ります」）

→ **削除ボタン除去後、個別アイテムを削除するには「チェックを入れる → チェック済みセクションで一括削除」という流れになる**。これが UX として許容されるかをユーザー確認したい。

## 対応方針

### Phase 1: UI からの除去（必須）

`AddModal` の編集モード UI から削除ボタンを取り除き、それに連なる UI 配線（呼び出し側ハンドラ、props、store からの destructure）を整理する。

1. `mobile/src/components/shopping/AddModal.tsx`
   - 152-156 行の `{mode === 'edit' && (<TouchableOpacity ...>削除...)}` を削除
   - `onDeleteItem?: () => void` prop（27 行）と分割代入（40 行）を削除
   - 未使用になる `deleteBtn` / `deleteBtnText` スタイル（225-234 行）を削除
2. `mobile/app/(tabs)/index.tsx`
   - `handleDeleteEditItem`（182-192 行）を削除
   - `<AddModal>` の `onDeleteItem={handleDeleteEditItem}`（326 行）を削除
   - `useShoppingStore()` の destructure（33 行）から `deleteItem` を外す（Phase 2 で store から消す前提なら同時、残す前提でも未使用なので外す）

### Phase 2: 不要になった配管の整理（要相談）

Phase 1 完了時点で `deleteItem`（単品削除）はモバイルアプリから呼ばれなくなる。残すか消すかをユーザーに確認したうえで、消す場合は以下を一括で削除する。

- mobile
  - `mobile/src/stores/shopping-store.ts` の `deleteItem` 型定義（39 行）と実装（176-185 行）
  - `mobile/src/stores/backends/shopping-backend.ts` の `deleteItem`（32, 92-94, 146-148 行）
  - `mobile/src/api/shopping.ts:14` の `deleteItem` export
  - 関連テスト
    - `mobile/__tests__/stores/shopping-store.test.ts`（194-216 行 / 359-365 行）
    - `mobile/__tests__/stores/backends/shopping-backend.test.ts`（85-160 行付近）
    - `mobile/__tests__/components/auth-modal-flow.test.ts:21` などのモックから `deleteItem` を外す
- server
  - `server/src/routes/shopping.ts` の `DELETE /api/shopping/:id` ルート
  - `server/src/services/shopping-service.ts:59` の `deleteItem`
  - `server/tests/` で該当ルート / サービスを叩いているテストを削除

**残す選択肢の理由**: 将来別の UI（例: スワイプ削除）を入れるときに API ごとあると便利。ただし CLAUDE.md の方針（「未使用と確信できるなら完全に消す」）からするとデフォルトは削除側。

→ **デフォルトは Phase 2 まで実施。ユーザーから「API は残しておいて」の指示があれば Phase 1 のみで止める。**

## 影響範囲

- 機能面: 個別アイテムの 1 タップ削除導線が失われ、代替は「チェック → 一括削除」のみになる
- データ面: 既存データに影響なし（マイグレーションも不要）
- 互換性: Phase 2 まで進める場合、サーバの `DELETE /api/shopping/:id` を叩いている古いクライアント（PWA 廃止済みなので実質ない想定）が 404 になる

## テスト方針

### Phase 1
- `mobile/__tests__/` で `AddModal` / 編集ダイアログを参照するテストがあれば `削除` ボタンを期待していないか確認（現状は描画テストなし）
- `npx expo start` で実機 / Expo Go 起動し、編集ダイアログから削除ボタンが消えていること、保存・キャンセルが従来通り機能することを確認
- 保存・キャンセル経路に影響していないか `mobile/__tests__/` の Jest 全件を流す

### Phase 2
- `cd mobile && npm test` で `deleteItem` のモック / アサーションを削除した状態で全件パス
- `cd server && npm test` で `DELETE /api/shopping/:id` 関連テスト削除後に全件パス
- 一括削除（`deleteCheckedItems`）が引き続き動くことを Expo Go で確認

## 作業着手前のユーザー確認事項

1. 「個別削除導線がチェック → 一括削除のみになる」UX は OK か？
2. Phase 2（`deleteItem` API/サーバまで撤去）まで一気に進めて良いか、Phase 1 のみで止めるか？

## 完了後の後片付け

- `TODO.md` の該当項目を `DONE.md` に移動（完了日: 移動した日）
- このプランファイルを `docs/plans/archive/` に移動
