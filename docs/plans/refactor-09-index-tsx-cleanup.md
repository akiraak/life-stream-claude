# リファクタリング 9: `app/(tabs)/index.tsx` の責務漏出整理

> **ステータス**: 設計確定（2026-04-27）— 実装着手可
> **想定規模**: 数日（Phase 単位で着地可能）
> **前提**: refactor-08（`shopping-store.ts` の local/server 二重実装解消）が
> 完了済み（2026-04-27）。本タスクはその上で進める **M2**

## 確定方針（2026-04-27）

ユーザーとの設計レビューで以下を確定。Phase 2 以降の実装はこの方針に従う。

1. **案 A を採用**: `shopping-store` に合成アクション `moveItemToDish` を追加し、
   reorder 系も両モードで state を触る形に対称化、ドラッグ協調は専用 hook に抽出する。
   → 画面は「store API と専用 hook しか叩かない」契約に到達する。
2. **失敗時は snapshot / restore でロールバック**: refactor-08 で温存した
   「失敗は throw のみ・ロールバックなし」方針を本タスクの **`moveItemToDish` と
   reorder 3 アクションに限り変更する**。
   - 操作前に対象 state（items / dishes 等）のスナップショットを取り、backend 失敗時に
     `set(snapshot)` で復元してから throw を再送出
   - 画面側の `loadAll()` 経由ロールバックを撤去できる
   - move は link/unlink の 2 段呼び出しなのでロールバックがそもそも必須
   - 他のアクション（addItem 等）の方針は触らない（refactor-08 の決定を尊重）
3. **ドラッグ協調は「純関数 + 薄 hook」で組む**: 判定ロジックは
   `pickTargetDishId(layouts, pageY)` 等の純関数に切り出し、`useDishDragCoordinator`
   は ref / state 配線のみを持つ薄 hook にする。
   - テストは純関数を直接叩くスタイルに揃え、RN hook 用のテストハーネスは導入しない
   - 薄 hook 側のテストは Phase 6 では必須にしない（純関数で機能カバレッジを確保する）

## 目的・背景

`mobile/app/(tabs)/index.tsx` は買い物リスト画面のコンテナ兼プレゼンテーションだが、
本来 store / hook / 子コンポーネントへ預けるべき責務が混在している。

特に refactor-08 では「ストア側を整える」ところまでで止め、画面側に残った以下の漏出は
スコープ外として持ち越した。

1. **store を迂回した API 直叩き**（2 か所）
   - L131-135 (`handleUpdateItem`): 食材編集ダイアログで料理を変えたとき、
     `dishesApi.unlinkItemFromDish` → `dishesApi.linkItemToDish` → `loadAll()` を画面側で実行。
     refactor-08 で store の `linkItemToDish` / `unlinkItemFromDish` が楽観更新に揃ったので、
     **store 経由に置き換えて `loadAll()` を消せる** はずだが、現状は手付かず
   - L240-246 (`handleItemDrop`): 食材を別の料理にドラッグしたとき、同じく
     `dishesApi.unlinkItemFromDish` → `dishesApi.linkItemToDish` → `loadAll()`
2. **store の state を画面が直接書き換える迂回**（reorder 系 3 か所）
   - L155-186 の `handleReorderDishes` / `handleReorderDishItems` /
     `handleReorderUngroupedItems` が `useShoppingStore.setState({...})` で先に並びを反映し、
     その後 store の `reorderXxx(...)` を呼ぶ。
   - これは server モードで store が state を触らない設計に合わせた苦肉の策で、
     失敗時のロールバックも `loadAll()` 任せ。refactor-08 の Phase 1 監査でも
     「reorder の "state は呼び出し側" 前提は refactor-09 で吸収」と明記されている
3. **料理間ドラッグ協調ロジックの肥大化**
   - `dishGroupRefs` / `dishGroupLayouts` / `measureDishGroups` /
     `dropTargetDishId` / `draggingFromDishId` / `handleItemDragStart` /
     `handleItemDragMove` / `handleItemDragEnd` / `handleItemDrop` /
     `handleUngroupedDragStart` / `handleUngroupedDragEnd` /
     `handleUngroupedDrop` が L41-272 にわたり散在。これは **「ドロップ先を計測して
     視覚フィードバック + リンク張り替え」** という単一の関心事だが、コンテナの
     ローカル state として宣言されているせいで画面ロジック全体が見通しづらい
4. **チェック済みアイテムのページネーション state**
   - `checkedExpanded` / `checkedLimit` / `CHECKED_PAGE_SIZE` と L362-391 の描画は
     セクション内で完結する関心事。コンテナに置く必然性なし
5. **AddModal フローの分散**
   - `handleSubmitItem` / `handleSubmitDish` / `handleUpdateItem` /
     `handleDeleteEditItem` がコンテナにぶら下がり、Alert / Toast / Haptics /
     loading リフレッシュを毎回手書きしている。これは中スコープなので **本タスクの主目的
     ではない**（後述「非スコープ」参照）

最終ゴールは「画面コンポーネントは描画と props 配線、状態は store / 専用 hook /
セクション component が持つ」状態に寄せること。少なくとも (1)(2)(3) を畳めば、
今後の機能追加（料理ドラッグの onLongPress 化、複数選択削除など）が局所修正で済む。

## 現状の構造（要点）

- `app/(tabs)/index.tsx` 505 行（うち styles 約 70 行）
- `useShoppingStore` から 11 アクション + 3 state を直接 destructure
- `dishesApi` を import して 2 か所で直叩き（store 経由ではない）
- `ConfirmDialog` / `Toast` / `AddModal` の表示制御をすべてコンテナで集約管理
- ドラッグ系の中継ロジック（refs + 計測 + ヒット判定 + ドロップ処理）がコンテナの
  useCallback 群として並ぶ

## 設計（採用 = 案 A）

> 採用に至った経緯と却下案は本セクション末尾「却下した代替案」を参照。

### 採用案: ストア側に「合成アクション」を生やす + reorder 対称化 + 純関数 hook

1. `shopping-store` に
   `moveItemToDish(itemId: number, toDishId: number | null): Promise<void>` を追加
   - 移動元 `dish_id` は store の現在 state から推定（`from === to` は no-op）
   - 操作前に items / dishes スナップショットを保存
   - 楽観更新で state を反映 → backend.unlinkItemFromDish + backend.linkItemToDish の
     合成（必要なものだけ呼ぶ）
   - 失敗時は `set(snapshot)` で復元してから throw 再送出
2. reorder 系（`reorderItems` / `reorderDishes` / `reorderDishItems`）を **両モードで
   state を触る** ように変更し、同様に snapshot → 失敗時 restore で揃える
3. ドラッグ協調は **純関数 `pickTargetDishId(layouts, pageY)` + 薄 hook
   `useDishDragCoordinator`** の 2 階建てで切り出す。判定ロジックは純関数のテストで
   カバーし、薄 hook は画面に refs/state を配線するだけ
4. 画面側は `dishesApi` import / `useShoppingStore.setState(...)` 直書き /
   失敗時 `loadAll()` ロールバックを **すべて撤去**

利点:
- 画面が `dishesApi` / `loadAll` / `setState` を一切触らなくなり、
  「画面はストアの API しか叩かない」契約に到達
- 失敗時のリカバリがネットワーク往復不要（snapshot 復元はローカル完結）
- 段階着地が可能（Phase 2 → 3 → 4 → 5 のいずれの段階で打ち切っても価値が残る）

注意点 / トレードオフ:
- ストアにロールバック機構が増える。refactor-08 の「ロールバックなし」方針からの
  部分的方針転換になるので、対象を **本タスクで触る 4 アクションに限定** する
- 複数 await の中間失敗（unlink 成功 / link 失敗）はサーバ側の整合性に依存。
  store はあくまでローカル state を元に戻すまでが責務、と Phase 2 のテストで明示する

### 却下した代替案

- **案 B（直叩きだけ畳む）**: refactor-08 で残った「reorder の非対称」が片付かず、
  画面側の認知負荷もそのまま。投資効率が悪いので却下
- **案 C（hook のみ）**: ストアと画面の契約のねじれを温存し、`useShoppingStore.setState`
  直書きを hook に逃がすだけになる。再利用性も低いので却下

## Phase / Step

> 各 Phase は単独で commit / 着地できる粒度。`npm test` と `tsc --noEmit` を Phase ごとに
> グリーンに保つ。Expo Go 確認は Phase 5 (テスト整理) 後にユーザーが手元で行う。

### Phase 1: 監査と漏出インベントリ作成（実装なし）

- [ ] `app/(tabs)/index.tsx` の各責務を「描画 / 画面状態 / store 配線 / API 直叩き /
  drag 協調 / モーダル workflow / セクション固有 state」に分類し、本ファイル末尾の
  「Phase 1 監査結果」に表で集約
- [ ] 影響を受ける呼び出し側（DishGroup / DraggableList / IngredientsScreen /
  recipes.tsx）が、画面側のどの props に依存しているか確認
- [ ] テスト不在領域の洗い出し: 現状 `index.tsx` のロジックを直接アサートする
  テストはゼロ（store 単体 / api 単体しかない）。Phase 4 / Phase 5 で何をユニット化
  できるか棚卸し

### Phase 2: 合成アクション `moveItemToDish` の導入と直叩き解消

- [ ] `shopping-store.ts` に `moveItemToDish(itemId, toDishId | null)` を追加
  - 内部で現在 state から `fromDishId` を推定
  - **state スナップショット**を取って楽観更新 → backend 呼び出し →
    失敗時に `set(snapshot)` で復元 → throw を再送出
  - 移動元・移動先がどちらか null なら片方だけ呼ぶ
  - 同一料理（`from === to`）は no-op
- [ ] backend interface の変更は不要（既存の `linkItemToDish` /
  `unlinkItemFromDish` を内部で順番に呼ぶ）
- [ ] `index.tsx` `handleUpdateItem` (L131-135) と `handleItemDrop` (L240-246) を
  `moveItemToDish` 呼び出しに置換し、`dishesApi` import を削除。`loadAll()` も削除
- [ ] テスト追加: server モードで
  (a) null→dishId (b) dishId→null (c) dishId→otherDishId (d) 失敗時の state 復元
  と throw を assert
- [ ] (b)(c) の中間失敗（unlink 成功 / link 失敗）はテストで「state は復元される」ことを
  保証するが、サーバ側の整合性はサーバが担保する前提（プランに明記）

### Phase 3: reorder 系の対称化

- [ ] `shopping-store.ts` の `reorderItems` / `reorderDishes` / `reorderDishItems` を
  **両モードで state を触る** ように変更
  - 楽観更新で並び替えた後 backend を呼ぶ
  - 失敗時はスナップショット復元 → throw 再送出
  - local backend は no-op のままで挙動不変
- [ ] `index.tsx` の `handleReorderDishes` / `handleReorderDishItems` /
  `handleReorderUngroupedItems` から `useShoppingStore.setState(...)` 直書きと
  失敗時の `loadAll()` ロールバックを撤去（store の throw を Alert で受けるだけに）
- [ ] テスト書き換え: shopping-store.test.ts の「reorder asymmetry」セクションを
  **対称な前提に再構成**。server モードでも store が並びを反映することを assert。
  `loadAll` を呼んでロールバックする経路は消える
- [ ] `useShoppingStore.setState({ mode: 'local' })` の意図的迂回ガード（auth-store
  logout 経路）はそのまま温存。reorder 用の setState 直書きとは別物

### Phase 4: ドラッグ協調を純関数 + 薄 hook に分離

- [ ] 新規 `mobile/src/hooks/dish-drag-helpers.ts` (or `.../use-dish-drag-coordinator.ts`
  と同居) に **純関数** を切り出す:
  - `pickTargetDishId(layouts: Map<number, { pageY: number; height: number }>,
    pageY: number): number | null` — pageY を含む layout の dishId を返す（0 = ungrouped）
  - 必要に応じて helper を追加（layouts の clear / set などはコンポーネント側でいい）
- [ ] 新規 `mobile/src/hooks/use-dish-drag-coordinator.ts` を作成（純関数を呼ぶ薄 hook）
  - 内部 state: `dropTargetDishId` / `draggingFromDishId` / `scrollEnabled`
  - 内部 ref: `dishGroupRefs` / `dishGroupLayouts`
  - `measureDishGroups` を内部関数化（`measureInWindow` 呼び出し）
  - 公開 API:
    - `scrollEnabled` (boolean)
    - `dropTargetDishId` / `draggingFromDishId` (state)
    - `registerDishGroup(id): (ref) => void` — refs Map に登録するコールバック
    - `dishGroupHandlers`: { onDragStart, onDragEnd, onItemDragStart,
      onItemDragMove, onItemDrop } — DishGroup に渡す束
    - `ungroupedHandlers`: { onDragStart, onDragEnd, onDragMoveY, onDragDrop } —
      ungrouped DraggableList に渡す束
    - `outerDragHandlers`: { onDragStart, onDragEnd } — 料理リスト並び替え用
  - drop 時は内部で `useShoppingStore.getState().moveItemToDish(...)` を呼ぶ
    （Phase 2 で導入済み）。Alert / Toast は呼び出し側に渡す callback で受ける
- [ ] `index.tsx` を hook 利用に書き換え。drag 系の useCallback / useState / ref を
  すべて hook へ移譲し、画面側の見通しを大幅に縮める（推定 -120 行）
- [ ] テスト: `__tests__/hooks/dish-drag-helpers.test.ts` で `pickTargetDishId` を
  境界条件（layout 完全外 / 上端 / 下端 / 重なり）で確認。**hook 自体のテストは
  本 Phase では書かない**（純関数で機能カバレッジを確保し、配線部分は手動 Expo Go で確認）

### Phase 5: `CheckedItemsSection` の component 化（小さめ）

- [ ] 新規 `mobile/src/components/shopping/CheckedItemsSection.tsx`。props:
  - `items: ShoppingItem[]`
  - `onToggleCheck: (id, checked) => void`
  - `onPressItemName?: (id, name) => void`
- [ ] 内部 state として `expanded` / `limit` を保持（コンテナから state を引き上げる）
- [ ] `index.tsx` の L362-391 を `<CheckedItemsSection ... />` に置換
- [ ] スナップショットでなくロジックテスト: 「閉じている時は子を描画しない」
  「閾値超えで `さらに N 件を表示` が出る」「タップで limit が伸びる」の 3 件

### Phase 6: テスト整理 & Expo Go 動作確認

- [ ] `__tests__/stores/shopping-store.test.ts` を再構成
  - reorder セクションを「対称」前提に書き換え（local/server 両方で state 反映）
  - `moveItemToDish` セクション新設
- [ ] `__tests__/hooks/use-dish-drag-coordinator.test.ts`（or 純関数版）
- [ ] `__tests__/components/CheckedItemsSection.test.tsx`
- [ ] `tsc --noEmit` クリーン
- [ ] Expo Go でユーザー手元確認（** ユーザー側で実施 **）
  - 食材ダイアログから料理を変える
  - 食材を料理間 / その他へドラッグ
  - 料理リスト・料理内・その他リストの並び替え
  - 並び替え API がエラーになる状況での挙動（オフライン化など）

## 影響範囲

- `mobile/app/(tabs)/index.tsx` （主対象）
- `mobile/src/stores/shopping-store.ts` （Phase 2 / 3 で `moveItemToDish` 追加 +
  reorder 対称化）
- `mobile/src/hooks/use-dish-drag-coordinator.ts` （Phase 4 で新設）
- `mobile/src/components/shopping/CheckedItemsSection.tsx` （Phase 5 で新設）
- `mobile/__tests__/stores/shopping-store.test.ts`
- `mobile/__tests__/hooks/dish-drag-helpers.test.ts` （新設・純関数）
- `mobile/__tests__/components/CheckedItemsSection.test.tsx` （新設）
- `mobile/src/components/shopping/DishGroup.tsx` （ドラッグ協調 hook の API に合わせて
  props 名を変える可能性あり。挙動変更なし）

## 非スコープ

- **AddModal workflow の整理**（`handleSubmitItem` / `handleSubmitDish` /
  `handleUpdateItem` / `handleDeleteEditItem`）。これも責務漏出だが、
  Alert / Toast / Haptics の扱いを揃えるのは別タスクで進める方が変更範囲を絞れる
- **`IngredientsScreen` のオーバーレイ表示方式**（L426-430）。Modal 化や
  `expo-router` の screen 化は本タスクで決めない
- **DraggableList 自体の API 改修**。drag 協調 hook 側で吸収する
- **light mode 対応**（別 TODO）
- **passkeys 認証**（別 TODO）

## テスト方針

- 単体: `shopping-store` の `moveItemToDish` と reorder 対称化を server モードで
  state mutation + rollback の両面から assert
- 単体: 純関数 `pickTargetDishId(layouts, pageY)` を境界条件で確認。
  `useDishDragCoordinator` 自体のテストは書かない（手動 Expo Go で確認）
- 単体: `CheckedItemsSection` の expand / 「さらに N 件」挙動
- 結合: 既存の `__tests__/utils/migration.test.ts` がそのままグリーンであること
  （local→server 入口の境界）
- 手動: Expo Go で「food add → 移動 → 並び替え → ログアウト → 再ログイン」を一周

## 残課題（着手時に判断）

確定方針セクションで主要な設計判断は片付いた。Phase 着手時に確認するのは以下のみ。

1. **`reorderItems` のセマンティクス**: 現状は「ungrouped 部分だけ並び替え」
   （items 配列全体の `position` を更新せず一部だけ更新する）。Phase 3 で対称化する際、
   「呼び出し側がどの subset を渡すか」は呼び出し側に任せる現方針を維持する想定。
   破綻があれば Phase 3 着手時に再検討
2. **DishGroup の props 名変更**: `useDishDragCoordinator` が返す handler 束を
   そのまま渡せる形に揃えると、DishGroup 側の prop 名を整理したくなる可能性あり。
   挙動変更を伴わない範囲で Phase 4 で判断

## Phase 1 監査結果

> 着手時に埋める。

