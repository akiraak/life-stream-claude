# サービス状況の定期メール報告

## 目的・背景

実ユーザーが少ない初期段階で、運営者（`akiraak@gmail.com`）が「今日どれくらい使われたか / エラーが出ていないか」を毎日メールで把握できるようにする。
管理画面（`/admin/`）は Cloudflare Access 越しで日々開きに行く運用は重く、見逃すと数日エラーに気付かない。1 日 1 回サマリがメールで届けば、異常時だけ管理画面を開けばよくなる。

ユーザー要望（`TODO.md` 機能開発セクション）:
> サービスの状況をメールで定期報告

## 現状の使えるブロック

- **ダッシュボード集計**: `server/src/services/admin-service.ts:10-26` の `getDashboardStats()` が
  `totalUsers` / `totalItems` / `totalDishes` / `totalPurchases` / `recentUsersCount`(7d) /
  `recentItemsCount`(7d) / `activeUsersToday`(24h) を返す。
- **AI クォータ集計**: `admin-service.ts:213-272` の `getAiQuotaStats()` が
  `todaySummary`（total / unique_keys / user_calls / guest_calls / user_keys / guest_keys）と
  `daily`（直近 14 日）と `limits` を返す。
- **メール送信**: `server/src/services/auth-service.ts:86-107` の `getResend()` / `sendOtpEmail()` が Resend
  クライアントの確立済みパターンを示している。`from = process.env.EMAIL_FROM || 'noreply@chobi.me'`、API キーは `RESEND_API_KEY`。
- **定期実行**: `server/src/index.ts:15-22` で `setInterval` による `cleanupExpiredTokens` が既に動いている。同じ場所に追加すれば動作する。
- **ログ読出し**: `server/src/services/logs-service.ts` が pino-roll の JSON Lines を読む API を持っており、`level` と `q` でフィルタできる。エラー件数集計に流用可能。

## 対応方針（Phase 構成）

### Phase 1: 集計サービスを 1 関数に集約

`server/src/services/status-report-service.ts`（新規）に `getStatusReport(): StatusReport` を切り出す。
中身は既存集計関数の薄いラッパー＋エラー件数を足したもので、メール本文に必要な値をひとまとめにする。

```ts
interface StatusReport {
  generatedAt: string;          // PT ISO 文字列
  dateLabel: string;            // 'YYYY-MM-DD'（PT、本文のタイトル用）
  dashboard: ReturnType<typeof getDashboardStats>;
  ai: {
    previousJstDay: AiQuotaTodaySummary; // 直近完了している JST 1 日（PT 12:00 送信時点で JST は翌日 4-5 時頃で「今日」がほぼ空なので 1 日前を採る）
    last7DaysTotalCalls: number;         // daily(14日) を 7 件に切って sum
    limits: { user: number; guest: number };
  };
  errors: {
    last24hCount: number;        // ERROR / FATAL の本数
    last24hSamples: string[];    // 直近 5 件の msg を抜粋（個人情報は含まない pino msg のみ）
  };
  system: {
    deployedAt: string | null;
    nodeVersion: string;
  };
}
```

- エラー件数は新規 `logs-service.ts` に `countErrorsInWindow(sinceMs: number)` を追加して集計。pino-roll の現在ファイルだけ読み、`time >= sinceMs && level >= 50` を数える（日跨ぎでファイルが切り替わった瞬間のスキマは無視で実用十分）。
- **AI クォータの「today」と PT 12:00 送信の関係**: `getAiQuotaStats().todaySummary` は JST 基準の `getJstDate()`（`ai-quota-service.ts`）で集計される。PT 12:00 は JST だと翌日 4:00〜5:00（夏時間で前後）あたりで、JST の「今日」が始まって数時間しか経っていない時点。つまりメール送信時点で JST today の数字はほぼゼロのままで、運営者が知りたいのは **昨日の JST 全日** の値になる。
- そこで `ai.today` ではなく `ai.previousJstDay` として `getJstDate(-1)` 相当を返す形にする。`ai-quota-service.ts` に `getJstDateOffset(daysAgo: number): string` を追加し、`status-report-service.ts` 側で 1 日前の `summary` を組み立てる（`admin-service.ts:217` の SQL を切り出して再利用するか、新規 `getAiQuotaSummaryForDate(date)` を export する）。
- `last24hSamples` は msg 文字列のみ拾う。`err.stack` / クエリパラメータ / ユーザーメール等は **入れない**（メール経由で漏らさない）。

### Phase 2: メール送信

新規 `server/src/services/status-report-mailer.ts`（または `status-report-service.ts` 内に同居）に
`sendStatusReport(to: string, report: StatusReport): Promise<void>` を追加。

- Resend クライアントは `auth-service.ts` の `getResend()` を流用したいが import 循環を避けるため、軽量なヘルパ `lib/resend-client.ts` を切り出して両方から使う形を **検討**（やらない選択肢: いまは循環していないので `auth-service` から `getResend` だけ named export して reuse でも可。プラン時点ではどちらでもよく、実装時に短い方を採る）。
- 件名: `[お料理バスケット] サービス状況 ${dateLabel}`（異常時はプレフィックスに `[ERROR ${n}]` を足す）。`dateLabel` は PT のその日（送信タイミングの「今日」）を `YYYY-MM-DD` で表示
- `text` と `html` 両方を作る（既存メールの慣習に合わせる）。HTML はテーブル 2〜3 個 + エラーサンプル箇条書き程度の素朴なもの、CSS は inline。
- 失敗時は `throw` し、呼び出し側でログに落とす。

### Phase 3: 定期実行のスケジュール

`server/src/index.ts` に `scheduleDailyStatusReport()` を追加し、起動時に呼ぶ。

- 実行タイミング: **毎日 PT 12:00（America/Los_Angeles）**。Dockerfile が `TZ=America/Los_Angeles` を設定しているのでコンテナ内では PT がローカル時刻になる（夏時間の切替も OS 任せで自動追従）。
- 実装: `setTimeout(<次の PT 12:00 までの ms>, async () => { await runOnce(); setInterval(runOnce, 24h); })` の素朴な 2 段構え。次の 12:00 までの ms は `new Date()` で現在ローカル時刻（コンテナ内 = PT）を取り、当日 12:00 を過ぎていれば翌日 12:00 を採る。
- 夏時間（DST）跨ぎの 24h interval ずれ: 春は 23h / 秋は 25h で 1 日だけ送信時刻が ±1h ずれるが、運営者向けで秒単位の正確性は要らないので許容（厳密に守りたいなら毎回 setTimeout で次の 12:00 を計算し直す形に変えられるが、当面は YAGNI）。
- `runOnce()`:
  1. `OPERATOR_EMAIL` 未設定なら `logger.info('status_report_skipped_no_recipient')` で skip
  2. `RESEND_API_KEY` 未設定なら同様に skip（dev 環境でも自動で安全側に倒れる）
  3. `getStatusReport()` → `sendStatusReport(to, report)`、try-catch で `logger.error({ err }, 'status_report_failed')`
- 起動直後の 1 回目は **送らない**（再起動連打で重複メールを避けるため）。次の PT 12:00（America/Los_Angeles） を最初の発火タイミングにする。

### Phase 4: 手動トリガ（debug 用、admin only）

`server/src/routes/admin.ts` に `POST /api/admin/status-report/send` を追加。
本番は Cloudflare Access、ローカルは `ADMIN_AUTH_DEV_BYPASS=1` でガード。

- リクエストボディ: なし（あるいは `{ to?: string }` で送り先を上書き可）
- 動作: `getStatusReport()` を集計し、`OPERATOR_EMAIL`（または body.to）に送る。
- 用途: メール本文のフォーマット確認、Phase 3 の cron 待たずに動作確認したいとき。

`web/admin/app.js` への UI 追加は **やらない**（admin の機能拡張は別プラン候補）。curl / Cloudflare Access 経由 fetch で叩くだけで十分。

### Phase 5: テスト

- `server/tests/unit/status-report-service.test.ts`（新規）
  - DB に user / shopping_items / ai_quota を仕込み、`getStatusReport()` の各フィールドが期待値になることを確認（既存 `admin-service.test.ts` のパターンを踏襲）
  - エラー件数集計は `logs-service` に投げるので、`logs-service.countErrorsInWindow` を `vi.spyOn` で固定化
- `server/tests/unit/status-report-mailer.test.ts`（新規）
  - `vi.mock('resend', ...)` で `emails.send` を spy にし、件名 / `to` / `text` / `html` が期待通り組み立てられることを確認（`auth-service.test.ts` と同じやり方）
  - 異常件数 0 のケースと N>0 のケースで件名プレフィックスが切り替わること
- `server/tests/integration/admin-status-report-route.test.ts`（新規）
  - `POST /api/admin/status-report/send` が認証必須であること（401）
  - 認証通過時に Resend モックが 1 回呼ばれること
- スケジューラ自体（Phase 3）はテストしない。`setTimeout`/`setInterval` の薄いラッパでロジックを持たないため。

## 設定 / 環境変数

`.env.example` に追記:

```
# 運営者向け定期メール（未設定なら送信を skip）
OPERATOR_EMAIL=akiraak@gmail.com
```

- `OPERATOR_EMAIL` 未設定 → 機能丸ごと無効。dev 環境で誤送信しないための gate。
- `RESEND_API_KEY` 未設定 → 同様に skip（既存 `sendOtpEmail` と挙動を揃える）。

## 影響範囲

- 新規ファイル: `services/status-report-service.ts`, `services/status-report-mailer.ts`（または 1 ファイルに同居）, テスト 3 本
- 変更ファイル: `index.ts`（スケジューラ起動）, `routes/admin.ts`（手動トリガ）, `services/logs-service.ts`（エラー件数集計関数）, `.env.example`
- DB スキーマ変更: なし
- 既存機能への副作用: なし。`OPERATOR_EMAIL` 未設定な間は何も走らないので、dev / 既存 prod の両方に対して無害でデプロイできる

## 設計上の判断（記録）

1. **node-cron 等を入れない**: 依存追加は最小限に。`setTimeout` + `setInterval` の 2 段で十分。
2. **起動直後の 1 発目は送らない**: コンテナが何度か再起動した日に同じ内容のメールが連発する事故を避けるため。
3. **集計は SQL を新規で書かない**: `getDashboardStats()` / `getAiQuotaStats()` を流用するだけ。重複を増やさない。
4. **エラー本文の中身は出さない**: msg のみ・stack や req body は除外（メール経由の情報漏洩リスク回避）。
5. **送信失敗時のリトライは入れない**: 24h 後にまた送るので 1 日抜けても運営に大きな実害はない。リトライは複雑度の割にリターンが小さい。
6. **頻度は固定で日次のみ**: 設定可能にする要望が出てから対応。YAGNI。
7. **HTML は inline CSS の素朴なテーブル**: メールクライアントの互換性を考えると素朴が安全。`sendOtpEmail` と同じスタイル系統に揃える。

## テスト方針（受け入れ）

- ユニット: 上記 Phase 5 の 3 本 → `cd server && npm test` で全件緑
- 結合: ローカル `npm run dev` + `ADMIN_AUTH_DEV_BYPASS=1` で `POST /api/admin/status-report/send` を叩き、`OPERATOR_EMAIL` を自分の Gmail に設定したうえで実際に届くこと、件名 / 本文 / エラー件数表示が正しいことを確認
- 本番投入後の確認: 翌日 PT 12:00（America/Los_Angeles） にメールが届くこと、Cloudflare Access のリダイレクトに巻き込まれないこと（`/api/admin` ではなく Resend 経由なので大丈夫なはず、要 Phase 3 着地後に観察）

## 完了後の後片付け

- `TODO.md` の該当項目を `DONE.md` に移動（完了日: 移動した日）
- このプランファイルを `docs/plans/archive/` に移動

## 確定事項（ユーザー確認済み 2026-04-28）

1. **頻度・送信時刻**: 毎日 PT 12:00（America/Los_Angeles）。Dockerfile の `TZ=America/Los_Angeles` でコンテナ内ローカル時刻 = PT。
2. **AI クォータの集計対象日**: 直近完了している JST 1 日（前日 JST）。`ai.previousJstDay` フィールドに格納。
3. **エラー本文の含め方**: 件数 + msg 上位 5 件（`msg` 文字列のみ。`err.stack` / `req.body` / その他フィールドは載せない）。
4. **手動トリガ admin endpoint**: あり（Phase 4 で `POST /api/admin/status-report/send` を実装）。UI は追加しない。
5. **送信元 email アドレス**: 既存 `EMAIL_FROM`（`noreply@chobi.me`）を流用。
6. **AI トークン使用量・料金**: 本プランには含めない。`gemini-service.ts` がトークン数を保存していないため、計装＋スキーマ追加（`ai_usage` テーブル）が必要で本プランの範囲を超える。別 TODO「AI のトークン使用量を記録して料金集計できるようにする」として切り出し済み。完了後にメール本文へ `cost` 行を追記する。
