# 管理画面の認証をアプリ認証から分離し Cloudflare Access に移行する

## 目的
管理画面（`/admin/*`, `/api/admin/*`）の認証を、エンドユーザ向けアプリの認証
（Magic Link / Google OAuth + JWT）から完全に切り離し、Cloudflare Access
（Cloudflare Zero Trust）でゲートする。

### なぜ分離するか
- 現状は admin もアプリと同じ JWT を使い、`requireAdmin`
  ([`server/src/middleware/auth.ts:14-21`](../../server/src/middleware/auth.ts))
  で `req.userEmail` を環境変数 `ADMIN_EMAILS` の許可リストと突き合わせている
- 結果として「アプリのユーザ DB に admin メールアドレスを登録しないと管理画面に
  入れない」「admin の JWT が漏れるとアプリ API にも全権でアクセスできてしまう」
  という、責務とリスクが混ざった状態になっている
- PWA 廃止（[`docs/plans/web-app-removal.md`](web-app-removal.md)）でブラウザ
  からのログイン UI が無くなったので、admin 用の UI 経路を新たに作るより
  Cloudflare 側で SSO ゲートを敷くほうが運用が楽
- 本番は既に Cloudflare で受けているので、Cloudflare Access を有効化するだけで
  Origin に到達する前段で MFA 付き Google SSO を強制できる

## 目標構成

### 認証フロー（本番）
```
Browser ──> Cloudflare Edge ──[Access policy: Google SSO]──> Origin (Express)
              │ 未認証なら IdP へリダイレクト
              │ 認証済なら CF_Authorization Cookie / CF-Access-Jwt-Assertion ヘッダ付与
              ▼
            Origin: /api/admin/*, /admin/*
              requireCloudflareAccess ミドルウェアで JWT 検証 → req.adminEmail セット
```

- IdP: Google（既存の管理者の Google アカウントを許可リストに登録）
- アプリケーション: `basket.chobi.me` の `/admin*` および `/api/admin/*` をカバー
- 受け取るヘッダ: `Cf-Access-Jwt-Assertion`（必須）、`Cf-Access-Authenticated-User-Email`（補助）
- 検証鍵: `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` の JWKS
- Audience (`aud`): Cloudflare Access が発行するアプリケーション固有の AUD タグ

### 認証フロー（ローカル開発）
- `npm run dev` ではローカルにそのまま到達するので、Cloudflare Access は通らない
- 開発時のみ `ADMIN_AUTH_DEV_BYPASS=1` で「全リクエストを admin として通す」
  バイパスを有効にする
  - 安全弁: **`NODE_ENV` が `'development'` または `'test'` のときだけ有効**
    （`'production'` 否定では `NODE_ENV` 未設定や `'staging'` で誤発火するため白リスト方式）
- dev 時の `req.userEmail` は `ADMIN_AUTH_DEV_EMAIL`（任意、デフォルト
  `dev-admin@local`）から埋める

## 廃止 / 残すもの

### 廃止対象
- `requireAdmin` ミドルウェア（[`server/src/middleware/auth.ts:14-21`](../../server/src/middleware/auth.ts)）
- 環境変数 `ADMIN_EMAILS`（`.env.example` および `tests/setup.ts` から削除）
- `web/admin/app.js` の `auth_token` / `auth_email` への依存
  （[`web/admin/app.js:6,16-18,847-849,2486-2491`](../../web/admin/app.js)）
- `/api/admin` ルート群への `requireAuth` 適用
  （[`server/src/app.ts:88`](../../server/src/app.ts)）

### 残すもの
- アプリ向け認証（`/api/auth/*` の Magic Link / Google OAuth + JWT、`requireAuth`）は
  そのまま。今回いじるのは admin だけ
- admin 操作のログに `req.userId` を出している箇所（[`admin.ts:203`](../../server/src/routes/admin.ts)）は、
  CF Access の email を `req.adminEmail` として記録するように差し替え（`userId` は
  admin にひもづく整数 ID が無くなるので削除）
- `web/admin/index.html` / `style.css` / `app.js` の UI 構造は基本そのまま。
  認証部分だけ書き換える

## 実装 Phase

### Phase 0 — 前提確認（Origin 露出経路の特定） ✅ 確定 (2026-04-25)
- 本番 `basket.chobi.me` が **Cloudflare Tunnel 経由**か **Proxied DNS のみ**かを確認する
  - Proxied DNS のみの場合、Origin IP が露出しているとき CF Access を素通りで
    Origin に直アクセスできてしまう。Phase 5 で必ず封鎖する（cloudflared Tunnel 化、
    もしくは Cloudflare の Edge IP のみ許可するファイアウォール / IP allowlist）
- 既存の Cloudflare 設定（Zone / DNS レコードの Proxied 状態 / Firewall ルール）を
  ダッシュボードで確認しメモ

**確認結果: Cloudflare Tunnel 経由**
- 本番サーバ: g3plus（自宅 LAN 内 10.0.1.10、外部から直接到達不可）
- 経路: Cloudflare → cloudflared コンテナ（`cloudflare/cloudflared:latest`、172.18.0.2）
  → `n8n_default` Docker bridge → `cooking-basket:3002`（172.18.0.6）
- 出典: `g3plus-ops/CLAUDE.md` L40, 56 / `g3plus-ops/cooking-basket/docker-compose.yml`
- `docker network inspect n8n_default` で同一ブリッジ上に cloudflared と
  cooking-basket が同居していることを確認
- 先行実績: `news-generator`（autopilot.chobi.me）が同じ構成で Cloudflare Tunnel
  ＋ Cloudflare Access 認証付きで稼働中

→ **Phase 5-1 の追加封鎖対応は不要**（Origin IP は外部に露出していないため）

完了条件「Phase 5 で取るべき封鎖手段が確定」を満たした。

### Phase 1 — Cloudflare Access の設定（インフラ作業） ✅ 完了 (2026-04-25)
- Cloudflare Zero Trust → Access → Applications で Self-hosted application を新規作成
  - Application domain: `basket.chobi.me`
  - Path: `/admin` および `/api/admin`（2 アプリに分けるか、1 アプリで複数 path）
  - Identity provider: Google を有効化（既存テナントが無ければ作成）
  - Policy: Allow / Emails の許可リストに管理者の Gmail を登録
  - Session duration: 24h 程度
- 発行された **AUD タグ**, **チームドメイン**, **発行者 (`iss`) URL** をメモする
- 本番サーバの環境変数として `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` を投入する
  準備をする（実際の投入は Phase 5 のロールアウトと一緒）
- **検証**: ポリシーを最初は Bypass モードで作成しておき、コードデプロイ後に
  Enforce へ切り替える運用にする（Phase 5 のデプロイ順序と合わせる）
- このフェーズはコード変更なし。完了条件は「Cloudflare 側でアプリケーションが
  作成され AUD/team domain/iss が手元にあること」

**確認結果:**
- Application: `basket-admin`（Self-hosted, `basket.chobi.me` の `/admin` と `/api/admin` をカバー）
- IdP: Google（既存の Zero Trust テナント `akiraak` を流用）
- Team domain: `akiraak.cloudflareaccess.com`
- Issuer (`iss`): `https://akiraak.cloudflareaccess.com`
- JWKS: `https://akiraak.cloudflareaccess.com/cdn-cgi/access/certs` 疎通確認済み（RS256 鍵 2 本）
- AUD タグ: 取得済み（env var `CF_ACCESS_AUD` で本番投入予定。リポジトリには記録しない）
- Policy 構成:
  - `basket-admin-bypass-temp`（Action: Bypass / Include: Everyone）→ **現在 attach 中**
  - `basket-admin-allow`（Action: Allow / Include: 管理者 Gmail）→ Reusable Policy として作成済み、basket-admin から detach。Phase 5-2 ステップ 4 で再 attach
- 動作: 現状 `/admin/` は Bypass のため Google SSO を通らずにそのまま到達できる（旧 Bearer JWT で動作継続）

### Phase 2 — サーバ側 Cloudflare Access JWT 検証ミドルウェア ✅ 完了 (2026-04-25)
- 新規ファイル: `server/src/middleware/cloudflare-access.ts`
  - `Cf-Access-Jwt-Assertion` ヘッダから JWT を取り出す
  - `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` の JWKS を取得して
    キャッシュし、`jose.jwtVerify` で検証する
    - `jose.createRemoteJWKSet` に渡す（内部で取得・キャッシュ・ローテーション処理）
    - 検証オプション: `{ audience: CF_ACCESS_AUD, issuer: 'https://<team>.cloudflareaccess.com', algorithms: ['RS256'] }`
    - JWKS の TTL は 1 時間以上（`createRemoteJWKSet` のデフォルト 10 分は短いので
      `cacheMaxAge: 60 * 60 * 1000` を明示）
    - JWKS 取得失敗時は古いキーで継続（stale-while-revalidate）し、`logger.warn`
      で記録。連続失敗のときは検証 401 にフォールバック
  - payload から `email` を **`req.adminEmail`** にセット
    （`requireAuth` の `req.userEmail` と分離。将来 admin に `requireAuth` が誤って
    再混入されたときに型／フィールド名で気づけるようにする）
  - 失敗時は 401（`error: 'Cloudflare Access 認証が必要です'`）
- `Express.Request` の型拡張: `auth.ts` の `declare global` に
  `adminEmail?: string` を追加（または cloudflare-access.ts 側で別途 `declare`）
- dev バイパス: `ADMIN_AUTH_DEV_BYPASS === '1'` かつ
  `NODE_ENV === 'development'` または `NODE_ENV === 'test'` のときだけ有効
  （`!== 'production'` 否定では `NODE_ENV` 未設定や `'staging'` で誤発火するため
  白リストで判定）。バイパス時は検証をスキップして
  `req.adminEmail = process.env.ADMIN_AUTH_DEV_EMAIL ?? 'dev-admin@local'` を埋める
- 依存追加: `jose`（既存に無ければ `server/package.json` に追加）
- 環境変数: `.env.example` に
  `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` / `ADMIN_AUTH_DEV_BYPASS` /
  `ADMIN_AUTH_DEV_EMAIL` を追記、`ADMIN_EMAILS` を削除
- **テスト**（`server/tests/integration/admin-cloudflare-auth.test.ts` 新規）:
  - テスト用ヘルパーは `tests/helpers/auth.ts` に
    **`createCfAccessHeaders(email)`** を追加
    - `jose.generateKeyPair('RS256')` で鍵ペアを生成
    - 公開鍵を `tests/setup.ts` から起動するスタブ HTTP サーバ（または `nock`）で
      JWKS として配信
    - `CF_ACCESS_TEAM_DOMAIN` をスタブ URL に向ける
    - 秘密鍵で `aud=CF_ACCESS_AUD, iss=<team>, email=<email>` を `RS256` 署名
    - 戻り値: `{ 'Cf-Access-Jwt-Assertion': '<jwt>' }`
  - JWKS をスタブして「正常 / aud 不一致 / iss 不一致 / 期限切れ / ヘッダ欠落 /
    署名不正 / alg=none 攻撃」を網羅
  - dev バイパスフラグが `NODE_ENV='production'` でも `NODE_ENV='staging'` でも
    `NODE_ENV` 未設定でも効かないことを確認
  - 既存 `admin.test.ts` の認証アサーション（401/403）は Phase 3 に合わせて書き換え
- 完了条件: `requireCloudflareAccess` を単独で呼ぶダミールートに対する単体／結合
  テストがすべて通る

**実装結果:**
- 追加: `server/src/middleware/cloudflare-access.ts`
  - `createRemoteJWKSet(url, { cacheMaxAge: 60 * 60 * 1000 })` で 1h JWKS キャッシュ
  - `jwtVerify` のオプション `{ audience, issuer, algorithms: ['RS256'] }`（alg=none も含めて非 RS256 を拒否）
  - `req.adminEmail` のみセット（`req.userEmail` とは分離）
  - dev バイパス: `ADMIN_AUTH_DEV_BYPASS === '1'` ＋ `NODE_ENV in {development, test}` の白リスト判定
  - エラーは `logger.warn` で event=`cf_access_*` を出して 401（`Cloudflare Access 認証が必要です`）
  - テスト用 `_resetCloudflareAccessJwksCacheForTest()` を export
- 追加: `jose@^6` を `server/package.json` の dependencies に追加
- 追加: `server/tests/helpers/auth.ts` に `startCfAccessStub`, `stopCfAccessStub`,
  `createCfAccessHeaders(email, overrides)` を追加
  - `generateKeyPair('RS256')` ＋ ローカル HTTP サーバで `/cdn-cgi/access/certs` を配信
  - `CF_ACCESS_TEAM_DOMAIN` をスタブの `http://127.0.0.1:PORT` に向ける（CF_ACCESS_AUD はテスト固定値）
  - overrides で aud/iss/exp/foreignKey/algNone/kid を切り替えられる
- 追加: `server/tests/integration/admin-cloudflare-auth.test.ts`（15 ケース）
  - 正常 / aud 不一致 / iss 不一致 / 期限切れ / ヘッダ欠落 / 署名不正（未公開鍵）/ alg=none /
    `CF_ACCESS_TEAM_DOMAIN` 未設定 / `CF_ACCESS_AUD` 未設定 / dev バイパス白リスト 6 ケース
- 更新: `server/.env.example`
  - `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ADMIN_AUTH_DEV_BYPASS`, `ADMIN_AUTH_DEV_EMAIL` を追記
  - `ADMIN_EMAILS` を削除
- 留意: `tests/setup.ts` の `ADMIN_EMAILS` および `requireAdmin` を使う既存 admin テストは
  Phase 3 で一括書き換えるため、Phase 2 では残置
- 確認: `npx vitest run` で 207 件全て green、`npm run build` も成功

### Phase 3 — `/api/admin` ルートの認証付け替え ✅ 完了 (2026-04-25)
- [`server/src/app.ts:88`](../../server/src/app.ts) を
  `app.use('/api/admin', requireCloudflareAccess, adminRouter);` に差し替え
- [`server/src/app.ts:7`](../../server/src/app.ts) の
  `import { requireAuth, requireAdmin, optionalAuth } from './middleware/auth';` から
  `requireAdmin` を外す
- `requireAdmin` を `auth.ts` から削除（エクスポート / 関数定義とも）
- `admin.ts` のログ出力で `adminUserId: req.userId` を `adminEmail: req.adminEmail` に
  差し替え（[`admin.ts:203`](../../server/src/routes/admin.ts)）
- `/api/admin` 限定で CORS を絞る:
  `app.use('/api/admin', cors({ origin: false }), requireCloudflareAccess, adminRouter);`
  （admin は同一オリジン専用。`Cf-Access-Jwt-Assertion` ヘッダ検証で実害は出ないが
  多層防御として）
- 新規エンドポイント `GET /api/admin/me` を追加し
  `{ email: req.adminEmail }` を返す（クライアント側のトップバー表示用）
- **テスト**: `admin.test.ts` を CF Access 経由に書き換え
  - `createAuthedUser('admin@test.local')` 呼び出しを
    `createCfAccessHeaders('admin@test.local')` に一括置換
    （現状 L24, 33, 239, 251, 274, 370, 403 など多数 — N 箇所の機械的置換）
  - 「`Authorization` ヘッダ無しで 401」のアサーションは
    「`Cf-Access-Jwt-Assertion` 無しで 401」に書き換え
  - 「非 admin ユーザーで 403」のアサーションは廃止（CF Access ポリシーで弾かれるので
    Origin 側に「authenticated だが admin ではない」ケースは原理的に存在しない）
- 完了条件: 既存の admin 結合テストが新ヘルパー経由で全部 green

**実装結果:**
- 更新: `server/src/app.ts`
  - import から `requireAdmin` を外し、`requireCloudflareAccess` を追加
  - `app.use('/api/admin', cors({ origin: false }), requireCloudflareAccess, adminRouter);` に切替
- 削除: `server/src/middleware/auth.ts` から `requireAdmin` を完全に削除
  - `Express.Request` 型拡張の `userId` / `userEmail` は `requireAuth` / `optionalAuth` で
    引き続き使うので残置
- 更新: `server/src/routes/admin.ts`
  - `ai_quota_reset` ログを `adminUserId: req.userId` から `adminEmail: req.adminEmail` に変更
  - 先頭に `GET /me` を追加し `{ success, data: { email: req.adminEmail }, error }` を返す
- 削除: `server/tests/setup.ts` から `process.env.ADMIN_EMAILS` を削除
- 書き換え: `server/tests/integration/admin.test.ts`
  - `createAuthedUser` import を削除し `createCfAccessHeaders / startCfAccessStub / stopCfAccessStub` に置換
  - top-level `beforeAll` / `afterAll` で 1 つの JWKS スタブを全 describe で共有
  - `createAdminHeaders = () => createCfAccessHeaders('admin@test.local')` で機械的に置換
  - 旧「403 for a non-admin user」(logs / ai-limits / SSE / ai-quota-reset) を全削除
  - 旧「401 without Authorization header」を「401 without Cf-Access-Jwt-Assertion header」に
    リネーム（assertion はいずれも 401 のままで挙動同じ）
  - SSE 結合テストの低レベル `http.request` も `Authorization` から
    `Cf-Access-Jwt-Assertion` に切替
  - 新規 `describe('GET /api/admin/me')` で正常系（adminEmail 返却）と認証失敗（401）を追加
- 確認: `npx vitest run` で 18 ファイル / 206 件 green、`npm run build` も成功
  - 件数の差分: -4（旧 403 ケース） +2（`/api/admin/me` × 2 ケース）= 元 207 → 206 で整合

### Phase 4 — `web/admin` クライアントの改修 ✅ 完了 (2026-04-25)
- `web/admin/app.js`
  - `getAuthToken` / `Authorization: Bearer` の付与を撤去（[L6, L10-11](../../web/admin/app.js)）
  - 401 時は `location.href = '/cdn-cgi/access/logout?returnTo=' + encodeURIComponent('/admin/')`
    に遷移（dev バイパス時に 401 が出たら単に再読み込みでよい）
  - `localStorage.removeItem('auth_token' / 'auth_email')` の呼び出しを削除
    （L16-18, L847-848）
  - SSE ストリーム部（[L827, L836](../../web/admin/app.js)）でも `Authorization`
    ヘッダ付与を削除し `fetch(url, { signal })` のみに（Cookie は同一オリジンで
    自動送出される）
  - 起動時の `if (!getAuthToken())` ガードを削除
    （[L2486-2491](../../web/admin/app.js)）
  - 代わりに `GET /api/admin/me` を叩いて `email` をトップバーに表示
- **SSE 再接続時の検証**: `connectStream` の再接続ループ（`scheduleReconnect`）が
  CF Access セッション切れ（24h 経過）でどう振る舞うか手動確認
  - 期待: 401 → `/cdn-cgi/access/logout?returnTo=...` に遷移
  - 現実装は `res.status === 401` で localStorage クリアして `/` に飛ぶ枝があるので
    上記書き換えで自然に対応される
- `web/admin/index.html` の「アプリへ戻る」リンクは残す（用途的に Cloudflare ログアウトとは別）
- 静的ファイル `/admin/*` 配信は edge では Cloudflare Access が守るが、
  Origin 直アクセスでは `express.static` が `index.html` を返してしまう
  （UI シェルだけなので致命ではないが、Phase 5 の Origin 封鎖と組で守る）

**実装結果:**
- 更新: `web/admin/app.js`
  - `getAuthToken()` 関数を削除し、`api()` から `Authorization: Bearer` の付与を撤去
  - `api()` の 401 ハンドラを
    `location.href = '/cdn-cgi/access/logout?returnTo=' + encodeURIComponent('/admin/')`
    に変更（`localStorage.removeItem('auth_token'/'auth_email')` も削除）
  - `api()` の `fetch` に `credentials: 'same-origin'` を明示（CF Access の
    `CF_Authorization` Cookie が同一オリジンで自動送出されるよう保険）
  - SSE `connectStream()` でも `Authorization` ヘッダ付与を削除し、401 時の
    `localStorage` クリア＋`/` 遷移を `/cdn-cgi/access/logout?returnTo=/admin/`
    遷移に置換
  - 起動部の `if (!getAuthToken())` ガードを削除。代わりに新規 `initAdmin()` で
    `GET /api/admin/me` を叩き、`res.data.email` をトップバーに反映してから
    `Router.init()` を呼ぶ。401 は `api()` 内で既に CF Access ログアウトへ遷移するので
    `initAdmin` 側では何もしない
- `web/admin/index.html` は無変更（「アプリへ戻る」リンクは残置）
- 残課題: 静的ファイル `/admin/*` の Origin 直アクセス問題は Phase 5 の
  Tunnel 封鎖（既に Phase 0 の確認で Tunnel 経由のため対応不要）と組で解消
- 確認: 該当ファイルから `auth_token` / `getAuthToken` / `Authorization` /
  `Bearer` 参照が全て消えていることを `grep -n` で検証済み

### Phase 5 — ロールアウト / 本番デプロイ

#### 5-1. Origin 直アクセス封鎖 — **対応不要（Phase 0 で確定）**
Phase 0 の確認結果より、本番は既に Cloudflare Tunnel 経由で公開されており
Origin IP が外部に露出していないため、追加対応は不要。

参考（将来構成変更時のため残置）:
- **Cloudflare Tunnel 経由**（現状）: Origin IP が外に出ていないので追加対応なし
- **Proxied DNS のみへ移行する場合**: 以下のいずれかが必要
  - cloudflared Tunnel 化（推奨・現状の構成）
  - Origin 側ファイアウォールで [Cloudflare の Edge IP リスト](https://www.cloudflare.com/ips/)
    のみを許可
  - mTLS (Cloudflare Authenticated Origin Pulls) を有効化

#### 5-2. デプロイ順序（原子的に切り替える）
1. **Cloudflare Access ポリシーは Bypass のまま** にしておく（Phase 1 で作成済）
2. 新環境変数（`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`）を本番に投入
3. 新コードをデプロイしてサーバ再起動
   - この時点では CF Access が Bypass なので JWT が付かず、
     `requireCloudflareAccess` は 401 を返す。**admin 画面は一時的に使えない**
4. **CF Access ポリシーを Enforce に切り替え**
5. ブラウザで `/admin/` にアクセスし Google SSO → 管理画面が表示されることを確認
6. `Cf-Access-Jwt-Assertion` を空にした curl で 401 になることを確認
7. Origin 直アクセス（Edge IP 以外）が 5-1 の封鎖で拒否されることを確認
8. 旧環境変数 `ADMIN_EMAILS` を削除

ステップ 3〜4 の間は admin が使えない短いダウンタイムが発生するが、
ポリシー切替は CF ダッシュボードから即時反映されるので分単位で済む。

#### 5-3. ロールバック手段
**重要**: 旧コードに revert しても、PWA 廃止により JWT を取得する UI が無いため
admin 画面はそのままでは復旧しない。ロールバック手順は以下:

1. CF Access ポリシーを Bypass に切り替え
2. 旧コードのコミット SHA に revert（事前に控えておく）
3. 暫定処置として `.env` に `ADMIN_EMAILS` を復活
4. 管理者は **Magic Link を発行できる経路**（モバイルアプリでログインしてから
   JWT を localStorage に手動挿入、または手元の curl で `/api/auth/magic-link`
   を叩いて取得）で JWT を取得し、ブラウザの localStorage に
   `auth_token` / `auth_email` を入れて `/admin/` にアクセス
5. 上記が現実的に困難なため、**実質的なロールバック手段は「新コードのバグを
   修正して再デプロイ」**であることを認識しておく

#### 5-4. 監視
- 新規追加: `/api/admin/*` の 401 件数を pino ログから集計してアラート
- JWKS 取得失敗（`logger.warn`）が連続したら通知
- 初回デプロイ後 24 時間は 401 ログを目視確認

### Phase 6 — ドキュメントと CLAUDE.md 反映
- `README.md` に「管理画面は Cloudflare Access の Google SSO 経由」と
  必要な環境変数（`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`）を追記
- `CLAUDE.md` の「アーキテクチャ上の注意」に admin 認証の扱いを追記
  - アプリ認証（Magic Link / Google OAuth + JWT）と admin 認証（CF Access）は別系統
  - モバイルアプリは `/api/admin` には到達しない（誤改修防止のため明記）
- ローカル開発で admin 画面を触るときの手順（`ADMIN_AUTH_DEV_BYPASS=1` を
  `.env` に書く）を `dev-admin/README.md` か CLAUDE.md に明記
- `TODO.md` から本タスク行を `DONE.md` に移動

## オープンクエスチョン
- Cloudflare Access の Free プランで足りるか（管理者は数名想定なので Free の
  50 ユーザ枠で十分の見込み）
- ~~Phase 0 で確認すべき項目: 本番が Cloudflare Tunnel 経由か Proxied DNS のみか~~
  → **Phase 0 で Tunnel 経由と確定（2026-04-25）**
