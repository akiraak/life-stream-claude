# 管理画面にサーバのデプロイ日時を表示

## 目的
本番で動いているサーバが「いつデプロイされたコードか」を `/admin/` のシステム
情報タブから一目で確認できるようにする。リリース後に不具合が出たときに、
コンテナが本当に新しいイメージで立ち上がっているかを切り分けるための一次情報。

**方針：デプロイ日時はアプリが自動検知するのではなく、デプロイ側で `.env` に
書いた値を読むだけにする。複雑な機構は入れない。**

## 現状
- `/admin/` の「システム情報」ページは、サーバ稼働時間（`process.uptime()`）と
  Node バージョン、メモリ、DB サイズ、テーブル行数だけを表示する
  （`web/admin/app.js` `renderSystem()`, `server/src/services/admin-service.ts`
  `getSystemInfo()`）
- 「稼働時間」はコンテナ再起動で巻き戻るため、コンテナ再起動と新リリースの
  区別がつかない（再起動しただけでも uptime は 0 に戻る）
- 本番に載っているコード・Docker イメージの「リリース時刻」がどこにも出ない

## 選択肢と比較

### 案 A: `.env` の `DEPLOYED_AT` を読むだけ（本プラン採用）
- デプロイ側（CI / デプロイスクリプト）で `.env` の `DEPLOYED_AT` を
  現在時刻の文字列（フォーマットはデプロイ側で自由に決める。運用は太平洋時間）
  に書き換えてからコンテナを再起動
- サーバは起動時に `process.env.DEPLOYED_AT` を読むだけ
- 利点: 実装が最小（env 1 本 + 表示 1 行）、個人プロジェクトに見合う
- 欠点: デプロイフローが `.env` 更新を忘れると古い値のままになる
  → 更新漏れを防ぐため、デプロイ手順書（後述）に明記する

### 案 B: ビルド時に Git commit hash / 時刻を埋め込む
- `npm run build` 時に `src/build-info.ts` を自動生成し `commit` と
  `builtAt` を定数で埋める
- 利点: デプロイ側の手順に依存しない、commit hash も取れる
- 欠点: ビルドスクリプトに手が入る、Docker キャッシュの扱いが面倒
- → 将来 commit hash も欲しくなったら案 A と併用で追加する

### 案 C: コンテナの作成日時を Docker API 経由で取る
- 却下。admin サーバから Docker socket を触る構図は避けたい。

## 設計上の原則
1. **`DEPLOYED_AT` は任意項目**。未設定でも既存のシステム情報表示は壊さない
   （UI 側で「未設定」表示にフォールバック）。
2. **フォーマットはデプロイ側が決める**。サーバは文字列をそのまま返し、UI も
   そのまま表示する（`new Date(...)` にかけない）。運用は太平洋時間
   （例: `2026-04-24 05:34 PDT`）を想定する。
3. **空白だけの値は未設定扱い**。`trim()` して空なら `null` を返し、UI 側で
   「未設定」扱い。起動を止めない。

## フェーズ

### Phase 1: サーバ側
- [ ] `server/.env.example` に以下を追記
  ```
  # デプロイ日時（任意のフォーマット文字列。デプロイ側で更新する）
  # 管理画面にはこの文字列がそのまま表示される。太平洋時間で入れる想定。
  # 例: DEPLOYED_AT="2026-04-24 05:34 PDT"
  # DEPLOYED_AT=
  ```
- [ ] `server/src/services/admin-service.ts` `getSystemInfo()` の戻り値に
  `deployedAt: string | null` を追加
  - `process.env.DEPLOYED_AT` を読み、`trim()` して空になるときは `null`
  - それ以外は trim 後の文字列をそのまま返す（再整形しない）
- [ ] `server/tests/unit/admin-service.test.ts`（または既存のテスト）に
  - `DEPLOYED_AT` 未設定時は `deployedAt: null`
  - 値が入っていればそのまま返る
  - 空白だけ / 前後空白のケースをカバー
  の 3 ケースを追加

### Phase 2: 管理画面の表示
- [ ] `web/admin/app.js` `renderSystem()` の「サーバー」セクションに
  「デプロイ日時」の行を追加
  - `s.deployedAt` が truthy なら `escapeHtml(s.deployedAt)` でそのまま表示
  - falsy なら「未設定」表示（muted）
- [ ] 稼働時間の行の直下に置く（「いつデプロイされた／再起動後どれだけ経つか」を
  並べて見られるように）

### Phase 3: デプロイ手順に反映
- [ ] `.env` を管理しているデプロイスクリプト側で、コンテナ再起動前に
  `DEPLOYED_AT` を現在時刻（太平洋時間）に書き換える行を追加
  - 実装場所はこのリポジトリ外（デプロイ基盤側）。本プランでは、
    デプロイ手順書の該当箇所にコマンド例を追記するだけ
  - 例:
    ```
    # .env の DEPLOYED_AT 行を現在の太平洋時間に置換
    sed -i -E "s|^DEPLOYED_AT=.*|DEPLOYED_AT=\"$(TZ=America/Los_Angeles date '+%Y-%m-%d %H:%M %Z')\"|" .env
    ```
- [ ] 本番で 1 回デプロイして、`/admin/` の「デプロイ日時」がその時刻に
  なることを実機確認

## 非スコープ（やらないこと）
- Git commit hash / ブランチ名の表示（必要になったら案 B を別プランで）
- デプロイ履歴（過去 N 回分）の保持
- デプロイ日時のアラート・通知
- 複数コンテナ運用時の、コンテナ個別のデプロイ日時表示

## 影響ファイル
- `server/.env.example`（`DEPLOYED_AT` を追記）
- `server/src/services/admin-service.ts`（`getSystemInfo()` 戻り値に 1 項目）
- `server/tests/unit/admin-service.test.ts`（新規 or 追記）
- `web/admin/app.js`（`renderSystem()` に 1 行追加）
- デプロイスクリプト（本リポジトリ外。手順書のみ更新）

## 運用メモ
- `DEPLOYED_AT` はシークレットではないので、redact 対象に追加する必要はない。
- 値がずれて不安なときは、コンテナの `docker inspect --format '{{.Created}}'`
  で実際のコンテナ作成時刻と突き合わせて検証できる。
