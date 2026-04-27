# `IngredientsScreen.tsx` の責務分離

由来: [refactoring.md](archive/refactoring.md) Phase 2 候補 M3

## 目的・背景

`mobile/src/components/dishes/IngredientsScreen.tsx`（457 LoC、変更頻度 14 = mobile 上位）は、
1 コンポーネントで 4 ストア / API・5 責務の処理を抱えている:

- ストア/API: `useShoppingStore` / `useAiStore` / `useAuthStore` / `AiQuotaError`
- ローカル `useState` 6 個（`loading` / `ingredients` / `recipes` / `addedNames` / `dishName` / `editingName`）
  - `ingredients` / `recipes` は store の `dish.ingredients_json` / `dish.recipes_json` キャッシュと並走しており、
    初期表示の `useEffect`（行 54–73）が `eslint-disable-next-line react-hooks/exhaustive-deps` を必要としている
    （状態の一意な保持先が決まっていないサイン）
- `fetchSuggestions`（行 75–109）が **AI 呼出 / クォータ超過検出 / 未認証時のログイン誘導 / 成功時のローカル state 反映 / アラート表示** の 5 責務
- dish 名インライン編集（`handleSaveName` 行 158–172）は AI 提案機能から独立しているが同居
- `Alert.alert('エラー', ...)` 直叩きが 7 箇所（`index.tsx` の Toast 経由とは流儀が違う）

リファクタの目的は **状態の保持先を一意化し、AI 提案と dish 名編集を別責務として切り出すこと**。

## 対応方針

### Step 1: 状態の一意化
- `ingredients` / `recipes` を **store のキャッシュ（`dish.ingredients_json` / `dish.recipes_json`）からのみ読む** 形に変える。
- AI 提案後の更新は store の action（`useShoppingStore.suggestIngredients`）が dish キャッシュを更新する流れを徹底する。
- ローカル state は `loading` / `addedNames`（既追加マーク）/ `editingName` / 編集中の `dishNameDraft` だけに絞る。
- `eslint-disable react-hooks/exhaustive-deps` を消せることをゴールとする。

### Step 2: AI 提案ロジックを `useDishSuggestions` フックに切り出し
- 新規 `mobile/src/hooks/use-dish-suggestions.ts`:
  - 入力: `dish` / `requestLogin`（auth-store の action）
  - 出力: `{ loading, ingredients, recipes, fetch: () => Promise<void> }`
  - 内部で `useShoppingStore.suggestIngredients` 呼出 → AiQuotaError ハンドリング → 未認証時のログイン誘導
  - エラー表示は呼び元に渡す（`Alert.alert` の方針はコンポーネント側に残す）
- IngredientsScreen は `const { loading, ingredients, recipes, fetch } = useDishSuggestions(dish);` の 1 行で済むように。

### Step 3: dish 名編集を分離コンポーネントへ
- `mobile/src/components/dishes/DishNameHeader.tsx`（新規）に:
  - `editingName` / `dishNameDraft` のローカル state
  - `handleSaveName` 相当のロジック
- IngredientsScreen の冒頭に `<DishNameHeader dish={dish} />` を配置する形に。

### Step 4: エラー表示の流儀統一（Toast or Alert）
- `Alert.alert('エラー', ...)` × 7 箇所を、**現状アプリ全体で多数派の流儀に揃える**
  （`index.tsx` の Toast を使うか、`Alert.alert` のままにするか）。
- 統一が `index.tsx` 側との整合に大きく波及するなら、**この Step だけ別 PR / 別プランへ後送**。
- まず IngredientsScreen 内で `showError(message)` のような小ヘルパに集約してから判断する。

### 影響範囲
- `mobile/src/components/dishes/IngredientsScreen.tsx`
- `mobile/src/hooks/use-dish-suggestions.ts`（新規）
- `mobile/src/components/dishes/DishNameHeader.tsx`（新規）
- store 側（`shopping-store.ts`）の API 変更は最小限に留める（M1 スコープと干渉しないように）

## テスト方針

- CLAUDE.md「RN コンポーネント描画テスト未導入」のため、**手動検証手順を明記**:
  - dish タップ → 詳細画面表示（既存キャッシュ表示）
  - 「具材を提案」ボタン → ローディング → 提案表示
  - クォータ超過 → エラー表示
  - 未ログイン → ログイン誘導モーダル
  - dish 名編集 → 保存 → 反映
  - 提案された具材を「追加」→ 買い物リスト追加 → 既追加マーク表示
- 単体テスト追加:
  - `use-dish-suggestions.ts` フックを `@testing-library/react-hooks`（Expo SDK 54 互換）で薄く検証可能なら
    クォータ超過分岐 1 本。難しければ手動検証のみ。
- 既存 `__tests__/stores/shopping-store.test.ts` `__tests__/api/ai.test.ts` は無変更で pass を維持。

## 想定工数
1〜2 日

## リスク
- 中。手動検証必須（注意点 5）。ログイン誘導フロー（`requestLogin` の `onSuccess` コールバック）が壊れないことを必ず確認。

## メンテ性インパクト
- 高（変更頻度 14 で active な領域。AI 機能はプロダクトの中核機能）

## 心得・注意点チェック
- 心得 4（5 責務 → 切出し）✓ / 心得 7（分割で見通しが良くなるか）✓ — Step 4 で「波及するなら後送」を明示
- 注意点 5（モバイル UI は手動検証必須）✓
