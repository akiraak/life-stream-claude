# `admin-service.ts` の責務分割と `any` 解消

由来: [refactoring.md](archive/refactoring.md) Phase 1 候補 S3

## 目的・背景

`server/src/services/admin-service.ts`（295 LoC、変更頻度 13 = サーバ上位）は以下を 1 ファイルに抱えている:

- Dashboard 集計 / Users / Shopping / Dishes / Purchase / SavedRecipes / AiQuota / SystemInfo の 8 領域
- Phase 0 で確認した `any` 10 件すべてがこのファイルに集中（better-sqlite3 の `get()` 結果に対する `as any` キャスト）
- `getJstDate`（行 151–154）が `services/ai-quota-service.ts:12–16` と完全重複（他 2 箇所は既に `getJstResetAtIso` 経由で再利用しているのに admin-service だけ独自定義）
- `updateShoppingItem`（行 71–88）の動的 SQL 組み立てが読みづらく、特性化テストが薄い

リファクタの目的は **領域別ファイルへ分割して読みやすくし、`any` を型付きヘルパで撲滅すること**。

## 対応方針

### Step 1: 特性化テスト先行
- `__tests__/admin-service.test.ts` 相当が存在しない（integration 経由のみ）。挙動を固定するために
  以下の特性化テストを先に追加する:
  - `getDashboardStats` のカウント返却形（COUNT 集計 7 値が DTO に正しく入ること）
  - `updateShoppingItem`（`name` のみ / `checked` のみ / 両方 / undefined のみ → 何もしない）
  - `getAiQuotaStats`（todaySummary / 直近 7 日サマリ）
  - `getSystemInfo`（`tableCounts` ループ）
- これら 4 群が既存 integration（`integration/admin-cloudflare-auth.test.ts` 等）で十分カバーされているなら
  unit 追加は最小限で良い。Step 1 着手時点で既存テスト走査して判断する。

### Step 2: 型付きヘルパを抽出して `any` を撲滅
- `server/src/lib/db-helpers.ts`（新規 or `database.ts` 内に追加）に:
  ```ts
  export function getCount(sql: string, ...params: unknown[]): number {
    const row = getDatabase().prepare(sql).get(...params) as { count: number } | undefined;
    return row?.count ?? 0;
  }
  export function getOne<T>(sql: string, ...params: unknown[]): T | undefined {
    return getDatabase().prepare(sql).get(...params) as T | undefined;
  }
  ```
- `admin-service.ts` の `as any` 10 箇所をこのヘルパへ差し替え。
  - 行 10–22 の COUNT 集計 7 件 → `getCount(...)`
  - 行 73 の `SELECT * FROM shopping_items WHERE id = ?` → `getOne<ShoppingItem>(...)`
  - 行 213 の `todaySummary` → 型を明示した interface に
  - 行 279 の `tableCounts` ループ → 型付きで
- `updateShoppingItem` の動的 SQL 組み立ては、**条件付き SET 句のヘルパ**にせず素朴に `if (name !== undefined) ... if (checked !== undefined) ...` の素直な分岐へ書き直す（YAGNI / 心得 4）。

### Step 3: `getJstDate` の重複解消
- `admin-service.ts:151-154` の独自定義を削除し、`import { getJstDate } from './ai-quota-service'` に統一
  （同モジュールから export されていない場合は `services/ai-quota-service.ts` 側で export する小修正を含む）。

### Step 4: 領域別ファイルに分割（必要なら）
- まずは Step 1〜3 で実害（`any` 集中・重複・テスト薄）が解消する。
- 残った 295 LoC が読みづらいまま残るようなら、以下に分割を検討:
  - `services/admin/dashboard-service.ts`（Dashboard）
  - `services/admin/shopping-admin-service.ts`（Shopping + Dishes + Purchase）
  - `services/admin/ai-quota-admin-service.ts`（AiQuota）
  - `services/admin/system-info-service.ts`（SystemInfo + Users + SavedRecipes）
- ただし「LoC が減ったか」より「routes/admin.ts → service の流れが追いやすくなったか」で判断する（心得 7）。
  分割で副作用面（依存ループ・テスト書換量）が大きいなら Step 3 終了で打ち切り。

### 影響範囲
- `server/src/services/admin-service.ts`（または `services/admin/*`）
- `server/src/lib/db-helpers.ts`（新規）
- `server/src/services/ai-quota-service.ts`（`getJstDate` を export する変更のみ）
- `server/src/routes/admin.ts`（分割した場合 import path 更新）

## テスト方針

- Step 1 で特性化テストを先に追加して挙動を固定。
- 既存 integration（`integration/admin-cloudflare-auth.test.ts` 等）が pass し続けることを必須条件とする。
- `any` 解消は型エラーがコンパイル時に出るので、ビルドが通れば挙動回帰の可能性は低い。

## 想定工数
1〜2 日

## リスク
- 中（integration 経由のみのカバレッジ。Step 1 の特性化テストが薄いまま進むと退行検出が遅れる）

## メンテ性インパクト
- 高（高 LoC × 高頻度 13 × `any` 集中の三重苦）

## 心得・注意点チェック
- 心得 4（重複共通化: `getJstDate` 統一）✓ / 心得 9（型を弱めない: `any` 撲滅）✓ / 心得 7（分割は読みやすさで判断）✓
- 注意点 4（DB スキーマ変更なし）✓
