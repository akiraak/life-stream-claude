# モバイル小粒整理（API ボイラープレート / 型重複 / 未使用 export / TabIcon require）

由来: [refactoring.md](archive/refactoring.md) Phase 2 候補 M5 + M6 + M7 + M8

複数の小粒な改善を 1 プランに束ねる。**各 Step は独立コミットで進める**（心得 3）。

## 目的・背景

監査で見つかった以下を片付ける:

- **M5**: `mobile/src/api/*` の全関数で同じ 3 行ボイラープレートが 26 関数で出現（`if (!res.data.success) throw new Error(...)`）
- **M6**: 型定義の重複
  - `ApiResponse<T>` が `mobile/src/api/auth.ts:3-7` だけ独自定義（他は `types/api.ts:1` から import）
  - `type ModalMode = 'item' | 'dish' | 'edit'` が `app/(tabs)/index.tsx:25` ↔ `components/shopping/AddModal.tsx:16` で重複
  - `api/saved-recipes.ts:21` / `api/migrate.ts:26` の `ingredients?: { name: string; category: string }[]` は `types/models.ts:29 Ingredient` と同形
- **M7**: 未使用 export / ファイル
  - `mobile/src/components/ui/SuggestionsList.tsx`（55 LoC 全体）— リポジトリ全体で参照ゼロ
  - `mobile/src/hooks/use-debounce.ts`（12 LoC 全体）— 同上
  - `mobile/src/types/models.ts:45 SuggestIngredientsResponse` — 旧サーバレスポンス形・現行未参照
  - `mobile/src/stores/shopping-store.ts:13–19 SuggestIngredientsResult.recipeStates` および 341–355 の生成ロジック — 戻り値の `recipeStates` を読む箇所がリポジトリ全体に存在しない
- **M8**: `mobile/app/(tabs)/_layout.tsx:110–117 TabIcon` 内で `const { Text } = require('react-native')` していて、ファイル冒頭で既に `Text` を ES import 済み

## 対応方針

### Step 1: 未使用 export / ファイルの削除（M7）
- 削除前に **リポジトリ全体で参照 0 件を再確認**:
  - `components/ui/SuggestionsList.tsx` ファイルごと削除
  - `hooks/use-debounce.ts` ファイルごと削除
  - `types/models.ts:45 SuggestIngredientsResponse` 型削除
  - `stores/shopping-store.ts` の `SuggestIngredientsResult.recipeStates` フィールドと 341–355 の生成ロジック削除
- `__tests__/stores/shopping-store.test.ts` で `recipeStates` を検証している箇所があれば併せて削除。
- 工数: 半日 / リスク: 低（心得 11・Git 履歴復元可能）/ インパクト: 中

### Step 2: 型定義の重複整理（M6）
- `api/auth.ts:3-7` の `ApiResponse<T>` 独自定義を削除し、`import type { ApiResponse } from '../types/api'` に統一。
- `type ModalMode = 'item' | 'dish' | 'edit'` を `mobile/src/types/ui.ts`（新規 or 既存 types ファイル）に集約し、
  `index.tsx` / `AddModal.tsx` 双方が import する形に。
- `api/saved-recipes.ts:21` / `api/migrate.ts:26` の `ingredients` フィールド型を `Ingredient[]`（`types/models.ts:29`）参照に置換。
- 工数: 半日 / リスク: 低 / インパクト: 中

### Step 3: API クライアント層のボイラープレート共通化（M5）
- `mobile/src/api/client.ts` に共通ヘルパを追加:
  ```ts
  export async function request<T>(method: 'get'|'post'|'put'|'delete', url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await client.request<ApiResponse<T>>({ method, url, data: body, ...config });
    if (!res.data.success) throw new Error(res.data.error ?? 'リクエストに失敗しました');
    return res.data.data!;
  }
  ```
  - `client.ts` 既存のレスポンスインタセプタは維持。
- 各 `api/*.ts` の関数を 1 行ヘルパ呼出に薄化（26 関数）。
  - 例: `export const getDishes = () => request<Dish[]>('get', '/dishes');`
- **AiQuotaError の特殊処理**（`api/ai.ts` 内）はヘルパ側に組み込まず、呼び元で `if (err instanceof AiQuotaError) ...` のままに留める（YAGNI）。
- 工数: 半日 / リスク: 低（テスト `__tests__/api/client.test.ts` 117 行 + `__tests__/api/ai.test.ts` 119 行で抑え込み可）/ インパクト: 中

### Step 4: TabIcon の `require` 削除（M8）
- `mobile/app/(tabs)/_layout.tsx:110–117` 内 `const { Text } = require('react-native')` を削除。冒頭の ES import 済 `Text` を使う。
- 工数: 30 分 / リスク: 低 / インパクト: 低

### 影響範囲
- `mobile/src/components/ui/SuggestionsList.tsx`（削除）
- `mobile/src/hooks/use-debounce.ts`（削除）
- `mobile/src/types/models.ts` / `mobile/src/types/api.ts` / `mobile/src/types/ui.ts`（新規 or 既存）
- `mobile/src/api/{auth,client,dishes,shopping,saved-recipes,migrate,ai}.ts`
- `mobile/src/stores/shopping-store.ts`
- `mobile/src/components/shopping/AddModal.tsx` / `mobile/app/(tabs)/index.tsx`
- `mobile/app/(tabs)/_layout.tsx`
- `mobile/__tests__/stores/shopping-store.test.ts`（recipeStates 検証があれば）

## テスト方針

- Step 1: 既存 `__tests__/stores/shopping-store.test.ts` が pass し続けることを必須条件に。
- Step 2: 型変更のみなのでビルドが通れば回帰なし。
- Step 3: `__tests__/api/client.test.ts` / `__tests__/api/ai.test.ts` を維持。新規 unit テストは追加しない（YAGNI）。
- Step 4: タブアイコンの表示確認のみ（手動）。

## 想定工数
合計: 1〜2 日（半日 + 半日 + 半日 + 30 分）

## リスク
- 全体的に低。最大は Step 1 の `recipeStates` 削除で何か気付かない参照が残っているケース → 着手時に再 grep で抑える。

## メンテ性インパクト
- 中（API 追加の摩擦低下 + 型の Source of Truth 確立 + 心得 11 の積み残し解消）

## 心得・注意点チェック
- 心得 4（重複共通化: 26 関数のボイラープレート）✓ / 心得 11（未使用削除）✓
- 注意点 1（API レスポンス形式維持）✓ — ヘルパ実装で `success/error` を見る形は同じ
