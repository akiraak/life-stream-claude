# `DraggableList.tsx` のモジュール状態撤去と dead code 削除

由来: [refactoring.md](archive/refactoring.md) Phase 2 候補 M4 + M7（DragOverlay）

## 目的・背景

`mobile/src/components/ui/DraggableList.tsx`（341 LoC）は以下の問題を抱える:

- **モジュールレベルの mutable global**: 行 11 `let _dragActive = false;` と `export function isDragActive()` を
  `ShoppingItemRow.tsx:4,20,48` / `DishGroup.tsx:5,80,86,89` がインポートして「ドラッグ中はタップを無視」のために参照している。
  テストでリセットできず、同時並行ドラッグや race を内包する形になっている。
- `setTimeout(() => { _dragActive = false; }, 300)`（行 99–102）でフラグを解除。**300ms はマジックナンバーで race の余地**。
- **明示された dead code**: 行 315–317 `// DragOverlay は不要になったが、互換性のためにエクスポート` →
  `export type DragOverlayState = null` / `export function DragOverlay(_props: { state: DragOverlayState }) { return null }`。
  リポジトリ全体 grep で参照ゼロ。心得 11 に該当。
- 内側の `DraggableItem`（行 271–313）はファイル末尾に同居。本体 + サブコンポーネント + ジェスチャ計測 + dead export を 1 ファイル。

リファクタの目的は **モジュール状態を撤去してテスト可能にし、互換目的の死んだ export を消すこと**。

## 対応方針

### Step 1: `DragOverlay` / `DragOverlayState` 削除
- 行 315–317 の export を削除。
- リポジトリ全体で `DragOverlay` / `DragOverlayState` を grep して参照 0 件であることを着手前に再確認。
- 工数: 30 分

### Step 2: `_dragActive` global を React Context へ昇格
- `mobile/src/components/ui/drag-context.tsx`（新規）に:
  ```tsx
  const DragContext = createContext({ isDragging: false, setDragging: (_: boolean) => {} });
  export function DragProvider({ children }) { /* useState + useMemo */ }
  export function useIsDragging() { return useContext(DragContext).isDragging; }
  ```
- `DraggableList` を `DragProvider` でラップ（または `DraggableList` 内部に Provider を持つ）。
  - ドラッグ開始時: `setDragging(true)`
  - ドラッグ終了 / cancel 時: `setDragging(false)`（300ms タイムアウトは可能なら撤廃。難しければ `requestAnimationFrame` 1 フレーム遅延に）
- `ShoppingItemRow.tsx` / `DishGroup.tsx` の `isDragActive()` 呼出を `useIsDragging()` 呼出に置換。
- 工数: 1 日

### Step 3: 内側コンポーネント / ジェスチャ計測の整理（任意）
- `DraggableItem`（行 271–313）を別ファイルに移すと、本体 `DraggableList` の見通しが改善するなら分離。
- ただし「分離後のファイル数 > 改善した読みやすさ」になるなら見送る（心得 7）。
- 工数: 半日 / 任意

### 影響範囲
- `mobile/src/components/ui/DraggableList.tsx`
- `mobile/src/components/ui/drag-context.tsx`（新規）
- `mobile/src/components/shopping/ShoppingItemRow.tsx`
- `mobile/src/components/shopping/DishGroup.tsx`

## テスト方針

- 注意点 5: RN 描画テスト未導入。**手動検証必須**:
  - 買い物リスト画面で食材ドラッグ → 並び替え → ドラッグ中のタップ無効化が効くこと
  - 料理グループ間ドラッグ → 別グループへ移動できること
  - 料理グループ自体のドラッグで並び替え
  - ドラッグキャンセル（指離す前のキャンセルが起きるパターンがあれば）→ フラグが正しく false に戻ること
- Context 化後は `__tests__/components/drag-context.test.tsx` で `DragProvider` + `useIsDragging` の基礎挙動を unit テスト可能。

## 想定工数
1〜2 日

## リスク
- 中。タイミング依存のドラッグ動作。手動検証必須。

## メンテ性インパクト
- 中〜高（global 撤去は将来のバグ予防として効く・dead code は心得 11 直撃）

## 心得・注意点チェック
- 心得 11（dead code 削除）✓ Step 1
- 心得 9（型を弱めない: 撤去後の型は `useContext` で型推論される）✓
- 注意点 5（モバイル UI は手動検証必須）✓
