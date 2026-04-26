# AI 提案 API のタイムアウト延長

## 目的・背景

ローカルサーバ接続時に「AI レシピ検索でタイムアウトエラー」が発生する。

調査結果（同会話内）:
- `mobile/src/api/client.ts:8` の axios 既定タイムアウトは 30 秒、AI 専用の延長なし
- ローカルサーバ経由の `POST /api/ai/suggest` は 6 連続で 8.7〜13.5 秒
- 使用モデルが `gemini-3-flash-preview`（thinking 系の preview）で tail latency が伸びうる
- そこに WSL2 ↔ 実機のネットワーク経路と Wi-Fi のジッタが乗ると 30 秒を簡単に超える

操作系（POST shopping/dishes 等）の 30 秒タイムアウトは UX 上維持し、AI 系だけ 60 秒に延ばす。

## 対応方針

- `mobile/src/api/ai.ts` の `suggestAi` で `client.post` の第 3 引数に
  `{ timeout: 60000 }` を渡し、AI 提案の単発呼び出しだけ 60 秒に延長する
- `getAiQuota` は軽量な GET なのでデフォルト（30 秒）のまま

サーバ側の `askGemini` タイムアウト追加は別タスクとして残す（今回はクライアント側のみ）。

## 影響範囲

- `mobile/src/api/ai.ts` — `suggestAi` の 1 行
- `mobile/__tests__/api/ai.test.ts` — `client.post` の引数 assertion を更新

## テスト方針

- 既存の `ai.test.ts` を更新し、`post` が `{ timeout: 60000 }` で呼ばれることを assert
- mobile の `npm test` 全パス
- 実機での AI レシピ検索動作は引き続きローカルサーバ環境で確認
