# サーバ小粒整理（migrate.ts service 抽出 / docs.ts タイトル + CSS 外出し / 未使用 export 削除 / cleanup interval ロギング）

由来: [refactoring.md](archive/refactoring.md) Phase 1 候補 S2 + S5 + S6 + S8

複数の小粒な改善を 1 プランに束ねる。**各 Step は独立コミットで進める**（心得 3: 1 PR = 1 目的）。

## 目的・背景

監査で見つかった以下を片付ける:

- **S2**: `routes/migrate.ts` が SQL を route 内で直接組み立てている（必須チェック「route 層で SQL 直叩き禁止」のヒット）
- **S5**: `routes/docs.ts` の `<title>` が `Life Stream` のまま（他プロジェクトの名残・本プロジェクトは「お料理バスケット」）。245 行の CSS が文字列リテラルでテンプレ内にインライン
- **S6**: 未使用 export（`shopping-service.ts` の 3 関数、`saved-recipe-service.ts` の 2 関数、`database.ts:21 closeDatabase`）が呼出 0 件のまま残っている
- **S8**: `index.ts:13` の cleanup interval が `try { cleanupExpiredTokens(); } catch {}` で例外を完全握り潰し、本番障害が観測不能

## 対応方針

### Step 1: `routes/migrate.ts` → `services/migrate-service.ts` 抽出（S2）
- `routes/migrate.ts:42–110` の SQL 組み立て + `db.transaction(...)` を `services/migrate-service.ts` に移動。
- ルート側は 30 行程度の薄いハンドラに（バリデーション + service 呼出 + レスポンス）。
- 既存 `tests/integration/migrate.test.ts` で挙動を抑える（追加テストは不要なら省略）。
- 工数: 半日 / リスク: 低 / インパクト: 中

### Step 2: `routes/docs.ts` のタイトル修正と CSS 外出し（S5）
- 行 183 `<title>${escapeHtml(title)} - Life Stream</title>` → `<title>${escapeHtml(title)} - お料理バスケット</title>`
- 245 行のインライン CSS を `web/docs.css`（新規）に外出し、`layoutHtml` で `<link rel="stylesheet" href="/docs.css">` 参照に。
  - `app.ts` の `express.static('web')` 経由で配信できることを確認
  - 既存の `docs/*` 表示が崩れないこと（管理者向け文書ビューアなので手動確認）
- 工数: 1 日 / リスク: 低（テスト薄なので手動確認必須）/ インパクト: 中
- **注**: `app.ts:90` で `app.use('/docs', docsRouter)` が認証なしマウントされている件は本プランのスコープ外（必要なら別プラン `docs-route-auth.md` を起こす）

### Step 3: 未使用 export の削除（S6）
- リポジトリ全体で参照 0 件を再確認した上で削除:
  - `services/shopping-service.ts:71 deleteAllItems`
  - `services/shopping-service.ts:77 getUncheckedItems`
  - `services/shopping-service.ts:82 getStats`
  - `services/saved-recipe-service.ts:94 getSavedRecipeStates`
  - `services/saved-recipe-service.ts:105 autoSaveRecipes`
  - `database.ts:21 closeDatabase`
- 既存テストファイルが直接呼んでいる場合は削除できないので、削除前に再 grep。
- 工数: 半日 / リスク: 低（Git 履歴に残る・心得 11）/ インパクト: 中

### Step 4: cleanup interval のロギング（S8）
- `server/src/index.ts:13` の `try { cleanupExpiredTokens(); } catch {}` を
  `try { cleanupExpiredTokens(); } catch (err) { logger.error({ err }, 'cleanup_failed'); }` に。
- ロガーは既存利用先（`middleware/error-handler.ts` 等）と同じ pino を使う。
- 工数: 30 分 / リスク: 低 / インパクト: 低（運用品質）

## 影響範囲
- `server/src/routes/migrate.ts` / `server/src/services/migrate-service.ts`（新規）
- `server/src/routes/docs.ts` / `web/docs.css`（新規）
- `server/src/services/shopping-service.ts` / `server/src/services/saved-recipe-service.ts` / `server/src/database.ts`
- `server/src/index.ts`

## テスト方針
- Step 1: `tests/integration/migrate.test.ts` 既存で十分。新規テストは追加しない（YAGNI）。
- Step 2: 手動確認（`/docs` 配下を表示してスタイル崩れと title バー文字列を確認）。
- Step 3: 既存テストで関数呼出が無いことを確認 → ビルドが通れば回帰なし。
- Step 4: ロガーは既存利用箇所と同じ初期化を使うので追加テスト不要。

## 想定工数
合計: 2 日（半日 + 1 日 + 半日 + 30 分）

## リスク
- 全体的に低。最大は Step 2 の CSS 外出しで `/docs` 表示が壊れるケース。手動確認で押さえる。

## メンテ性インパクト
- 中（小粒の積み上げ。S2 は必須チェック合格化、S5 は文字列バグ修正、S6/S8 は心得 11 と運用品質）

## 心得・注意点チェック
- 心得 3（小さく刻む: Step ごとにコミット分離）✓
- 心得 11（未使用コード削除）✓ Step 3
- 必須チェック「route 層で SQL 直叩き禁止」✓ Step 1 で解消
