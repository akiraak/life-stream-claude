# 起動直後のハンバーガーメニューに AI 残り回数を表示

## 目的
モバイルアプリの右上ハンバーガーメニューで、アプリ起動直後から
「AI 残り N 回」を表示する。現状は AI を一度実行するまで表示されない。

## 背景
- メニューは `mobile/app/(tabs)/_layout.tsx:86` で `aiRemaining !== null`
  のときだけ「AI 残り N 回」を描画する
- `useAiStore` (`mobile/src/stores/ai-store.ts`) の `remaining` 初期値は `null`
- `remaining` を更新する箇所は `mobile/src/stores/shopping-store.ts:316` の
  `suggestAi` 呼び出し成功時のみ。`/api/ai/suggest` のレスポンスヘッダ
  `X-AI-Remaining` を読み取って store に詰めている
  (`mobile/src/api/ai.ts:35`)
- つまり「アプリ起動 → AI 提案を一度も叩いていない」状態では
  `remaining` が `null` のままで、メニューにも `IngredientsScreen` の
  ボタン文言（`mobile/src/components/dishes/IngredientsScreen.tsx:200`）にも
  残り回数が出ない

ユーザー視点では、ログイン状態であっても今日あと何回 AI を回せるか
分からないため、メニューを開いたときに必ず数字が見える状態にしたい。

## 対応方針

### サーバ: 残り回数だけを返す read-only エンドポイントを追加
`POST /api/ai/suggest` は副作用（カウント加算）込みなので、起動時に呼ぶには重い。
別エンドポイントを新設する。

- ルート: `GET /api/ai/quota`
- ミドルウェア: `optionalAuth` のみ（rateLimitAi はカウント加算するので付けない）
- 識別キー:
  - ログイン済み: `user:${req.userId}` / 上限 `getAiLimits().user`
  - 未ログイン: `device:${hashDeviceId(req.headers['x-device-id'])}` / 上限 `getAiLimits().guest`
  - `X-Device-Id` が無いゲストは 400 にせず、`remaining: null` を返す
    （`/api/ai/suggest` 側は必須にしているが、こちらは表示専用なので寛容に扱う）
- 処理: `ai_quota` テーブルから当日の `count` を SELECT するだけ。INSERT/UPDATE しない
- レスポンス:
  ```json
  { "success": true, "data": { "remaining": 12, "limit": 15, "resetAt": "2026-04-27T15:00:00.000Z" }, "error": null }
  ```
- `getJstDate` / `getJstResetAtIso` / `hashDeviceId` は
  `server/src/middleware/rate-limit-ai.ts` の private 関数なので、
  共通モジュールに切り出す（候補: `server/src/services/ai-quota-service.ts`）。
  middleware 側もそこから import するように差し替える。

### モバイル: 起動時と認証状態変化時にフェッチ

#### `mobile/src/api/ai.ts`
`getAiQuota()` を追加。

```ts
export interface AiQuota {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

export async function getAiQuota(): Promise<AiQuota> {
  const res = await client.get<ApiResponse<AiQuota>>('/api/ai/quota');
  if (!res.data.success) throw new Error(res.data.error ?? 'AI残量取得に失敗');
  return res.data.data;
}
```

`X-Device-Id` ヘッダは既存の `client` 共通設定で付いているはずなので、
そこは触らない（必要なら確認して plan を追記する）。

#### `mobile/src/stores/ai-store.ts`
`loadQuota` アクションを追加。失敗しても既存の値は壊さず、
`remaining: null` のまま据え置く（メニュー非表示で fail-soft）。

```ts
loadQuota: async () => {
  try {
    const q = await getAiQuota();
    set({ remaining: q.remaining, quotaExceeded: q.remaining === 0, resetAt: q.resetAt });
  } catch {
    /* noop */
  }
}
```

#### `mobile/app/_layout.tsx`
`checkAuth` の後で `useAiStore.getState().loadQuota()` を呼ぶ。
さらに `isAuthenticated` 切り替わり時にも再取得する（ユーザー上限と
ゲスト上限が違う／別ユーザーで前回の値が残るのを避けるため）。

```ts
useEffect(() => {
  if (isLoading) return;
  // 既存の mode 同期に加えて
  useAiStore.getState().loadQuota();
}, [isAuthenticated, isLoading]);
```

ログアウトする `auth-store.ts` の `logout` でも `useAiStore.getState().reset()`
してから上の effect で再取得する流れになる。`reset` は既存実装を流用。

### 却下案
- **既存 `POST /api/ai/suggest` のドライラン引数**: API の意味が混ざるのでやめる
- **クライアント側に独自カウンタ**: サーバ側で日次集計しているので二重管理になる
- **起動時に `POST /api/ai/suggest` を空打ち**: カウントを 1 消費してしまうので不可

## 影響範囲

### サーバ
- 新規: `server/src/services/ai-quota-service.ts`（`getAiQuotaSnapshot(key, limit)` と
  ヘルパ関数 `getJstDate` / `getJstResetAtIso` / `hashDeviceId` を集約）
- 修正: `server/src/middleware/rate-limit-ai.ts`（上記サービスを利用する形に）
- 新規: `server/src/routes/ai.ts` に `GET /quota` を追加
- 新規/修正: `server/tests/unit/ai-quota-service.test.ts`
- 新規: `server/tests/integration/ai-quota.test.ts`
  （`GET /api/ai/quota` のログイン／ゲスト／device-id 欠落ケース）

### モバイル
- 修正: `mobile/src/api/ai.ts`（`getAiQuota` 追加）
- 修正: `mobile/src/stores/ai-store.ts`（`loadQuota` アクション追加）
- 修正: `mobile/app/_layout.tsx`（起動時 / 認証切替時に `loadQuota` 呼び出し）
- 修正: `mobile/__tests__/stores/ai-store.test.ts`（あれば。なければ追加検討）
- 修正: `mobile/__tests__/api/ai.test.ts`（あれば。なければ追加検討）

### 動作上の影響
- `/api/ai/quota` を起動毎に 1 回叩く → サーバ負荷増。SQLite SELECT 1 本なので無視可
- 未ログイン × `X-Device-Id` 未送信 のときは `remaining: null` で返るので、
  既存の「未表示」挙動と一致する（regression なし）

## テスト方針

### 自動テスト
- サーバ unit: 切り出した `ai-quota-service` の純関数（JST 日付、リセット時刻、
  hash）と `getAiQuotaSnapshot` の SELECT 結果を Vitest で検証
- サーバ integration: `supertest` で `GET /api/ai/quota` の以下を確認
  - 未ログイン + `X-Device-Id` 付き → 当日のゲスト残量
  - 未ログイン + `X-Device-Id` 無し → `remaining: null`
  - ログイン済 → 当日のユーザー残量
  - 連続して呼び出してもカウントが増えない（`ai_quota` テーブル件数不変）
- モバイル: `__tests__/api/ai.test.ts` に `getAiQuota` のモックテスト

### 手動確認
1. ログイン状態でアプリ再起動 → 起動直後にメニューを開く → 「AI 残り N 回」が出る
2. 未ログイン状態で再起動 → ゲスト上限の残量が出る
3. AI を実行 → 残量が即座に減って表示が更新される（既存の `setRemaining` 経由）
4. ログイン → ログアウト → 残量がゲスト上限の値に切り替わる
5. オフライン起動 → エラーで落ちず、メニューには残量が出ないだけ（fail-soft）

## 非スコープ
- 残量を CTA としてプッシュ通知 / バッジ表示する
- 残量がゼロの時の UI 強調（既存 `quotaExceeded` フラグの扱いは変えない）
- 管理画面側の影響（`/api/admin/*` 経由のクォータ操作はそのまま）

## フェーズ

### Phase 1: サーバ側エンドポイント
- [ ] `server/src/services/ai-quota-service.ts` を新設してヘルパを集約
- [ ] `server/src/middleware/rate-limit-ai.ts` をサービス利用に書き換え
- [ ] `server/src/routes/ai.ts` に `GET /quota` 追加（`optionalAuth` のみ）
- [ ] unit / integration テスト追加
- [ ] `npm test` パス確認

### Phase 2: モバイル側ストア & API
- [ ] `mobile/src/api/ai.ts` に `getAiQuota` 追加
- [ ] `mobile/src/stores/ai-store.ts` に `loadQuota` 追加
- [ ] 既存 Jest テストの更新／追加
- [ ] `npm test`（mobile）パス確認

### Phase 3: 起動時フックと手動確認
- [ ] `mobile/app/_layout.tsx` で起動／認証切替時に `loadQuota` を呼ぶ
- [ ] Expo Go で実機確認（ログイン／未ログイン／ログイン→ログアウト）
- [ ] `IngredientsScreen` のボタン文言にも残り回数が即出ることを確認
