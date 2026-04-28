# 食材編集ダイアログのボタンを撤廃して暗黙保存・空欄削除に変更

## 目的・背景

買物リスト画面でアイテム名をタップすると開く編集ダイアログ（`AddModal` の `mode === 'edit'`）には「削除」「キャンセル」「保存」の 3 ボタンが並んでいる。

ユーザー要望（`TODO.md` 機能開発セクション）:
> アイテム編集ダイアログから削除を削除
> 食材編集ダイアログから「削除」「キャンセル」「保存」を削除
> ダイアログ外をタップしたら保存
> 食材名が空欄だったら削除

→ 編集モードはボタン無しの「軽い編集レイヤー」にする。
- ダイアログ外タップ＝保存（現行は単純クローズ）
- 食材名を空にして閉じる＝削除

これにより「削除」操作は「名前を消して閉じる」という連続的なジェスチャに統合され、UI の複雑さが下がる。

## 現状

- `AddModal`: `mobile/src/components/shopping/AddModal.tsx`
  - 削除ボタン: `:152-156`（`mode === 'edit'` のみ）
  - キャンセルボタン: `:157-159`
  - 追加 / 保存ボタン: `:160-166`（`mode === 'edit'` だと「保存」表示）
  - スタイル: `deleteBtn` / `deleteBtnText` `:225-234`、`cancelBtn` / `cancelText` `:235-244`、`submitBtn` / `submitText` `:245-255`、`buttons` 行 `:220-224`
  - オーバーレイのタップで `onClose` を呼ぶ: `:86-88`（`TouchableWithoutFeedback`）
  - props: `onClose`, `onSubmitItem`, `onSubmitDish`, `onUpdateItem`, `onDeleteItem`（`:23-27`）
  - 内部 `handleSubmit`（`:65-75`）は trim 後空なら no-op で early return
- 呼び出し側: `mobile/app/(tabs)/index.tsx`
  - `handleUpdateEditItem`（`:165-180` 付近、要再確認）: 名前と料理紐付けを更新
  - `handleDeleteEditItem`（`:182-192`）: `deleteItem` を呼び出し
  - `<AddModal>` の bind: `onClose`, `onSubmitItem`, `onSubmitDish`, `onUpdateItem`, `onDeleteItem`
- store: `mobile/src/stores/shopping-store.ts` の `deleteItem` / `updateItemName` / `moveItemToDish`
- backend / API / サーバ側 `DELETE /api/shopping/:id` は引き続き必要（空欄削除のために残す）

### 編集モード以外のモード（item 追加 / dish 追加）の扱い

**「ボタンを消す」のは `mode === 'edit'` のみ**。
- `mode === 'item'`（食材追加）と `mode === 'dish'`（料理追加）は引き続き「キャンセル」「追加」ボタンを残す
  - 理由: 新規追加は「空欄で閉じる＝何もしない」が自然な期待で、「外タップで追加」は誤操作（料理紐付けを選んだ後にうっかり外をタップして空アイテムが追加される等）になりやすい
  - 現状でも追加モードは「キャンセル」と「追加」の 2 ボタンで完結しているので動線を変える必要なし
- 結果として `AddModal` 内部で `mode === 'edit'` 専用の挙動分岐が増える

## 対応方針

### Step 1: `AddModal` の編集モード UI とイベント挙動を変更

`mobile/src/components/shopping/AddModal.tsx` を以下のように変更する。

1. **ボタン群（`:151-167`）を `mode !== 'edit'` のときだけレンダリング**
   - 編集モードでは「削除」「キャンセル」「保存」を全て出さない
   - 追加モード（`item` / `dish`）は従来通り「キャンセル」「追加」を出す
2. **オーバーレイタップ時の挙動を `mode` で分岐**
   - `mode === 'edit'`: 保存（または空欄なら削除）してから閉じる
   - それ以外: 従来通り `onClose`（破棄）
3. **新しいハンドラ `handleEditDismiss` を内部に追加**
   ```ts
   const handleEditDismiss = useCallback(() => {
     const trimmed = name.trim();
     if (!trimmed) {
       onDeleteItem?.();
     } else {
       onUpdateItem?.(trimmed, selectedDishId);
     }
   }, [name, selectedDishId, onUpdateItem, onDeleteItem]);
   ```
4. **`onSubmitEditing`（キーボードの確定キー）も編集モードでは `handleEditDismiss` を呼ぶ**
   - 確定キーで保存できる導線は残す（外タップが唯一の保存手段だと iPad / Android のキーボード確定ボタンユーザーが詰まる）
   - `mode === 'edit'` で空欄確定時は削除、文字あり確定時は保存
5. **「保存処理が走らない条件」を整理**
   - 名前も料理紐付けも変更されていない場合でも、`handleEditDismiss` は無条件に呼んで OK
     - `handleUpdateEditItem`（呼び出し側）が `name !== editItem.name` を見て差分があるときだけ `updateItemName` を叩いている
     - `moveItemToDish` は同じ dishId でもサーバ側でエラーにはならない想定だが念のため要確認 → なる場合は呼び出し側で「変更なしならスキップ」のガードを追加する
6. **未使用スタイルを削除**: `deleteBtn` / `deleteBtnText`（`:225-234`）
   - `cancelBtn` / `cancelText`、`submitBtn` / `submitText` は追加モードで使うので残す

### Step 2: 呼び出し側 `index.tsx` の調整

`mobile/app/(tabs)/index.tsx`:

1. **`handleDeleteEditItem` は残す**
   - Step 1 で追加した `AddModal` 内部の `handleEditDismiss` から `onDeleteItem` 経由で呼ばれる
   - 既存実装（`:182-192`）はそのままでよい
2. **`handleUpdateEditItem`（`:165-180`）の挙動確認**
   - 「外タップ＝保存」になることで、ユーザーが何も変更せずに開いて閉じただけでも `onUpdateItem` が呼ばれる可能性がある
   - 現行コードで `name !== editItem.name` のガードはあるが `moveItemToDish` は無条件呼び出しなので、`dishId === editItem.dishId` のときはスキップするガードを追加する（不要な API 呼び出しと不要な toast を防ぐ）
3. **「変更なしで閉じた」場合の toast 抑止**
   - 現行の `setToast(\`${name} を更新しました\`)` は名前変更 / 料理移動どちらかが起きていれば妥当だが、何も変わっていないときに出すのは煩い
   - `name === editItem.name && dishId === editItem.dishId` のとき早期 return し toast も出さない

### Step 3: 動作確認とエッジケース

確認したいケース（実機 / Expo Go）:

- ✅ 名前を変えて外タップ → 保存される（toast 「○○ を更新しました」）
- ✅ 料理紐付けだけ変えて外タップ → 保存される
- ✅ 何も変えず外タップ → 何も起きない（toast なし、API 呼び出しなし）
- ✅ 名前を空にして外タップ → 削除される（toast 「○○ を削除しました」）
- ✅ 名前を空にしてキーボード確定 → 削除される
- ✅ 名前を変えてキーボード確定 → 保存される（ダイアログも閉じる）
- ✅ 食材追加モード → 「キャンセル」「追加」ボタンは引き続き存在し、外タップは破棄
- ✅ 料理追加モード → 「キャンセル」「追加」ボタンは引き続き存在し、外タップは破棄

エッジケース:

- ⚠️ 編集モードでオーバーレイ＋キーボード表示中に外タップした場合、フォーカスが外れて IME 確定が走るタイミングで保存が二重に動かないか
  - `handleEditDismiss` が冪等であることと、呼び出し側のガードで防ぐ
- ⚠️ 削除確認ダイアログは出さない（ユーザー要望どおり「空欄＝削除」を即時実行）
  - 誤操作リスクは残るが、要望どおり

## 影響範囲

- **UI**: 編集ダイアログのボタン列が消える。代わりに「外タップで閉じる＝保存または削除」という新しいインタラクションになる
- **モバイル**: `AddModal.tsx`、`index.tsx` の `handleUpdateEditItem` のみ
- **サーバ / API**: 変更なし（`DELETE /api/shopping/:id` は空欄削除で引き続き使う）
- **テスト**: モバイル `__tests__/` の AddModal / index 系テスト（描画テストは現状ないが、store / backend のテストには影響しない見込み）
- **既存データ**: 影響なし

## テスト方針

- `cd mobile && npm test` で Jest 全件パス（`shopping-store` / `shopping-backend` のテストは挙動変更なしで素通り想定）
- `npx expo start` で Expo Go 実機確認
  - 上記 Step 3 のシナリオを順に実施
  - 特に「何もせず外タップで閉じる」ケースは現行と挙動が同じ（API 呼び出し無し / toast 無し）であること
- `cd server && npm test` も流す（API 側に変更はないが念のため）

## 完了後の後片付け

- `TODO.md` の該当項目を `DONE.md` に移動（完了日: 移動した日）
- このプランファイルを `docs/plans/archive/` に移動

## 作業着手前のユーザー確認事項

1. 「空欄で閉じる＝確認なしで即削除」で OK か？（要望からは即削除と読めるが、念のため）
2. 編集モードで「外タップ＝保存」を採用しつつ、追加モード（item / dish）はボタンを残す方針で OK か？
