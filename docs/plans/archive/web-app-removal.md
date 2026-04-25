# Web アプリ（PWA）の削除

## 目的
モバイルアプリ（iOS / Android）が公開済みでメインの提供形態になったため、
**ユーザー向け PWA（`/`）を本リポジトリから削除する**。

狙い:
- PWA 用 Vanilla JS（`web/app.js` 1811 行 + `style.css` 1115 行 + `index.html`
  185 行 ≒ 3000 行強）の保守負担を解消する。今は機能追加のたびにモバイルと
  PWA の二重実装が必要で、近い変更（AI モード分岐、AI 使用回数表示、
  オンデマンド・レシピ生成など）の TODO が PWA 側だけ取り残しになっている。
- `basket.chobi.me` のドメイン直下を「アプリの紹介ページ（`/about`）」と
  「プライバシーポリシー（`/privacy`）」だけにし、流入経路をモバイルアプリの
  ストアリンクに集約する。
- PWA 経由の Magic Link / Google Sign-In 動線をメンテ対象から外し、認証は
  モバイルクライアントだけに絞る。

## 現状

### 配信構成（`server/src/app.ts`）
| ルート | 実体 | 削除後 |
|---|---|---|
| `GET /` | `web/index.html`（`__CACHE_VERSION__` 埋め込み）→ PWA 起動 | **削除し `/about` へ 301 リダイレクト** |
| `GET /about` | `web/about.html` | **変更なし**（ランディング兼アプリ紹介） |
| `GET /privacy` | `web/privacy.html` | **変更なし**（ストア要件で残す） |
| `app.use(express.static(webDir))` | `web/` 以下を静的配信（`/admin/`, `/img/`, アイコン類, manifest, app.js, style.css も含む） | **残す**（`/admin/` と `/img/` のため） |
| `GET /admin/*` | `web/admin/index.html` ほか | **変更なし**（本番管理画面） |

`CACHE_VERSION`（`app.ts:27`）は `index.html` の `__CACHE_VERSION__` 置換と
`/api/*` レスポンスの `X-App-Version` ヘッダのために存在する。`X-App-Version`
は PWA がリロード判定に使っていたもの（モバイルは未使用）。

### `web/` の中身

| パス | 用途 | 削除後 |
|---|---|---|
| `web/index.html` | PWA シェル（ログイン + アプリ） | **削除** |
| `web/app.js` | PWA 全ロジック（買い物リスト・料理・AI 呼び出し・モーダル等） | **削除** |
| `web/style.css` | PWA スタイル | **削除** |
| `web/manifest.json` | PWA マニフェスト | **削除** |
| `web/icon-192.png` / `web/icon-512.png` | PWA アイコン（manifest から参照） | **削除** |
| `web/icon_dish.png` | PWA 内で使用（`app.js` 内で参照あり） | **削除**（要 grep 確認） |
| `web/about.html` | アプリ紹介ページ | **残す**（`href="/" → ログイン` のリンクだけ削除/差し替え） |
| `web/privacy.html` | プライバシーポリシー | **残す** |
| `web/img/ogp.png` | OGP（about.html / index.html / privacy.html が参照） | **残す** |
| `web/img/qr.png` | about.html の QR コード | **残す** |
| `web/img/ss-*.png` | about.html のスクショ | **残す** |
| `web/img/ios-step*.png` | about.html の iOS インストール手順 | **残す** |
| `web/admin/` | 本番管理画面（HTML / CSS / JS） | **残す**（PWA 言及を一部更新） |

### 管理画面（`web/admin/app.js`）の web/PWA 言及
本番管理画面の中に PWA を前提とした記述が 2 箇所あるので、削除に合わせて
更新する。

- `renderAppName()`（`web/admin/app.js:967-`）の「変更対象の箇所」テーブル
  - `web/index.html` の `<title>` / 各 `<h1>`
  - `web/manifest.json` の `name` / `short_name`
  - → これらを **削除**。残るのは `web/admin/index.html` の `<title>` と
    `web/about.html` の `<title>`、モバイル側（`mobile/app.json` の `name`,
    `mobile/src/...` 内の表示テキスト）。
- `renderNativeApp()`（`web/admin/app.js:1395-`）の「現状の整理」テーブル
  - 「アプリ形態: PWA（Vanilla JS）」「manifest.json: あり」「Service Worker:
    未実装」の行が古くなる
  - → モバイル前提の現状記述に置き換える（または「ネイティブアプリ化検討」
    タブごと不要なので外すかを判断）

### モバイル（`mobile/`）への影響
- API ベース URL は `basket.chobi.me`、`/api/*` のみを使う（`web/app.js` を
  経由しない）。**PWA 削除の影響なし**。
- `apple-mobile-web-app-capable` などのメタタグは `web/index.html` 固有で、
  iOS ネイティブアプリには無関係。

### docs / TODO の言及
- `docs/plans/recipe-ai-on-demand.md` Phase 3「Web クライアント」、
  `docs/plans/no-login-mode-impl.md`、`docs/plans/server-log-viewer.md`
  などに PWA 前提の記述あり。実装済みのプランは `archive/` への移動でなく
  **追記で「PWA は削除済み」と明記**するに留める（履歴として残す）。
- `TODO.md` の「アプリ起動直後は右上ハンバーガーの AI 使用回数が表示されない」
  「ライトモードのデザイン追加」「料理レシピページの料理名を…」「料理レシピ
  ページのステップを見るのなかのテキストが画面右端からはみ出てる」など、
  **PWA だけで起きていた項目は本タスクで一緒に削除する**（モバイルにも
  該当するなら残す。実機確認）。
- `CLAUDE.md` の「Web クライアントは `web/` 配下に置く」「フレームワーク
  なしの Vanilla JS（モバイルファースト）」のくだりを「ランディング
  （`web/about.html` / `web/privacy.html`）と本番管理画面（`web/admin/`）
  のみ」に書き換える。
- `README.md` 70 行目あたりのディレクトリ構成図と「管理画面: http://localhost:3000/admin/」周辺の記述を更新。

### ストア配信物との整合
- App Store / Google Play のサポート URL や説明文に `basket.chobi.me/` を
  PWA として案内している箇所がないか要確認。あれば `basket.chobi.me/about`
  に差し替える（外部設定なのでこのリポジトリでは扱わない）。

## 選択肢と比較

### 案 A: PWA を削除し `/` を `/about` へ 301 リダイレクト（本プラン採用）
- 既存ユーザーの `basket.chobi.me/` ブックマークがアプリ紹介に着地する
- ストア掲載 URL が `/` のままでも生きる
- 利点: 旧 PWA をホーム画面に追加していた人も「アプリストアからインストール
  してください」というメッセージに導線できる
- 欠点: ホーム画面 PWA のアイコンタップ時に紹介ページが開く（白画面より良い）

### 案 B: `/` で `about.html` をそのまま 200 で返す
- リダイレクトせず `/` に about を直配置
- 利点: 1 ホップ少ない
- 欠点: `/about` と `/` の重複ページが生まれ SEO 上不利。OGP `og:url` も
  どちらに揃えるか面倒

### 案 C: `/` を 410 Gone で返す
- 利点: 「PWA は終了した」が機械的に伝わる
- 欠点: 一般ユーザーには不親切。導線にならない。却下

## 設計上の原則
1. **モバイルアプリの動作には一切影響を出さない**。`/api/*` の挙動・レス
   ポンス形式・認証フロー・`X-App-Version` の付与は変えない（モバイルが
   将来読む可能性も残す。ヘッダだけは残置コストが低い）。
2. **`/admin/` と `/about` / `/privacy` は壊さない**。`express.static(webDir)`
   は残し、`web/` 配下の HTML/PNG のうち PWA 用ファイルだけを物理削除する。
3. **PWA を「ホーム画面に追加」していたユーザーが起動した時の体験を
   設計する**。manifest.json が消えた状態で `/` を叩くと、サーバから返る
   レスポンスは `/about` への 301。インストール済み PWA はリダイレクト先を
   別タブで開く挙動になることが多いので「アプリストアでインストールして
   ください」のバナーを about.html 上部に出すのが望ましい（任意・別タスク
   候補）。
4. **削除は段階的でなく一括**。PWA は半端な状態で残すと「Web では動かない
   のに使える風」になり混乱を招く。フィーチャーフラグや段階ロールアウトは
   行わない。
5. **テストは「壊していない」確認に集中**。`/about` `/privacy` `/admin`
   `/api/health` `/api/*` がすべて 200 を返すこと、`/` が 301 → `/about`
   になることだけ確認する。

## フェーズ

### Phase 1: サーバ — ルート整理 & PWA ファイル削除
- [ ] `server/src/app.ts`
  - `GET /` を `res.redirect(301, '/about')` に変更
  - `indexHtml` 読み込み（`fs.readFileSync('index.html')`）を削除
  - `CACHE_VERSION` は `X-App-Version` でしか使われなくなる。**残置**
    （モバイルが将来見る可能性 + コスト無し。ただし `__CACHE_VERSION__`
    置換ロジックは消す）
  - `aboutHtml` / `privacyHtml` の読み込みは残す
- [ ] `web/index.html`、`web/app.js`、`web/style.css`、`web/manifest.json`、
  `web/icon-192.png`、`web/icon-512.png`、`web/icon_dish.png` を削除
  - 事前に `grep -rn "icon_dish\|icon-192\|icon-512\|manifest.json" web/`
    で about.html / privacy.html / admin/ から参照されていないことを再確認
- [ ] `Dockerfile` の `COPY web ./web` は **そのまま**（about / privacy /
  admin / img を引き続き同梱するため）
- [ ] `server/tests/integration/`（必要なら新規 `app-routing.test.ts`）
  - `GET /` が 301 で `Location: /about` を返す
  - `GET /about` `GET /privacy` `GET /admin/` が 200
  - `GET /index.html` `GET /app.js` `GET /manifest.json` が 404
  - `GET /api/health` が 200 で `X-App-Version` ヘッダを持つ

### Phase 2: 管理画面の PWA 言及更新
- [ ] `web/admin/app.js` `renderAppName()` の `targets` から
  `web/index.html` / `web/manifest.json` の行を削除し、`web/about.html`
  の `<title>` を追加
- [ ] `web/admin/app.js` `renderNativeApp()` の「現状の整理」テーブルを
  「現状: モバイル（Expo SDK 54）公開済み、Web は紹介ページのみ」に書き
  換える。タブ自体（`'native-app'` キー）を残すか外すかは admin 利用者
  （= ユーザー）の好みに合わせて要確認 — 残す前提で本プランは記述する
- [ ] 管理画面のテストは無いので動作確認は手動（`/admin/` で「アプリ名
  候補」「ネイティブアプリ」タブを開いて表示確認）

### Phase 3: ドキュメント / TODO 整理
- [ ] `CLAUDE.md` の「Web クライアント」セクションを「ランディング
  （`web/about.html` / `web/privacy.html`）と本番管理画面（`web/admin/`）」
  に書き換え。「フレームワークなしの Vanilla JS（モバイルファースト）」の
  記述を削除
- [ ] `README.md` のディレクトリ構成図から PWA 用の `index.html` /
  `app.js` / `style.css` / `manifest.json` を除く
- [ ] `TODO.md` の以下項目はモバイルでも該当するか実機確認し、PWA だけの
  問題なら削除（本タスクと同時にクローズ）:
  - 「アプリ起動直後は右上ハンバーガーの AI 使用回数が表示されない」
  - 「ライトモードのデザイン追加」（モバイルにも該当しそう → 残す）
  - 「料理レシピページの料理名をページの『買い物リスト』の表示の場所を
    差し替えて」
  - 「買い物リスト画面でレシピ料理を生成中は読み込みのアニメーションを
    表示して」
  - 「料理レシピページのステップを見るのなかのテキストが画面右端から
    はみ出てる」
  - 「ハートをフラットなイラストに」
  - 「Google認証を他のアカウントでチェック」（モバイル側にも Google
    Sign-In がある → 残す）
- [ ] `docs/plans/recipe-ai-on-demand.md` Phase 3 等、実施済み or 廃止
  プランに「Web は削除済み（`docs/plans/web-app-removal.md` 参照）」の
  脚注を追記。プランファイル自体は履歴として残す
- [ ] `DONE.md` に「Web アプリ（PWA）削除」を `YYYY-MM-DD` 付きで追加

### Phase 4: 動作確認
- [ ] dev サーバ（`npm run dev`）で:
  - `curl -I http://localhost:3000/` が `301` + `Location: /about`
  - `http://localhost:3000/about` がブラウザで表示される
  - `http://localhost:3000/privacy` がブラウザで表示される
  - `http://localhost:3000/admin/` でログイン → 各タブが正常表示
    （特に「アプリ名候補」「ネイティブアプリ」タブ）
  - `http://localhost:3000/api/health` が `{"success":true,...}`
  - `http://localhost:3000/manifest.json` `app.js` `index.html` が 404
- [ ] モバイル（Expo Go）から本番相当のサーバに接続し、買い物リスト追加・
  AI 具材取得・レシピ生成・ログイン・ログアウトが動く（リグレッション
  防止）
- [ ] Docker イメージビルド（`docker build .`）が通り、コンテナ起動後に
  `/about` が表示される

## 非スコープ（やらないこと）
- `web/admin/`（本番管理画面）の削除や置き換え。本プランは「ユーザー向け
  PWA の削除」だけを扱う
- `dev-admin/`（ローカル開発用管理サーバ）への変更
- `about.html` / `privacy.html` のリブランド・デザイン刷新
- `/about` をモバイル本体（Expo Web 出力）に差し替えるなどの統合
- ストア掲載文（App Store Connect / Play Console）の更新（リポジトリ外）
- 既存 PWA インストール済みユーザー向けの「ストアへ誘導」バナー追加
  （別 TODO 候補）
- `mobile/` の挙動変更
- Service Worker / プッシュ通知の検討（PWA 無くなるので無関係化）

## 影響ファイル

### 削除
- `web/index.html`
- `web/app.js`
- `web/style.css`
- `web/manifest.json`
- `web/icon-192.png`
- `web/icon-512.png`
- `web/icon_dish.png`

### 変更
- `server/src/app.ts`（`GET /` を 301、`__CACHE_VERSION__` 置換除去）
- `web/admin/app.js`（`renderAppName` / `renderNativeApp` の表記更新）
- `web/about.html`（`href="/" → ログイン` の差し替え／削除）
- `CLAUDE.md`（Web クライアント記述）
- `README.md`（ディレクトリ構成）
- `TODO.md`（PWA だけの項目を削除、本プラン項目を `done`）
- `DONE.md`（完了日付き追加）

### 追加
- `server/tests/integration/app-routing.test.ts`（新規、ルート挙動の
  リグレッションテスト）

## 運用メモ
- ホーム画面に PWA を追加していたユーザーがアイコンを開くと、`manifest.json`
  が無いため「ブラウザ的な」起動になり、`/` → `/about` リダイレクトで紹介
  ページが開く。アプリストアへの導線は about.html に既に書かれている
  （iOS / Android 各ステップ）ので追加導線は最低限あり。
- `X-App-Version` ヘッダはモバイルが現状利用していないが、将来「強制
  アップデート」用途に使える可能性があるので残置する。
- 削除はリバート可能（git 履歴に残る）。PWA 復活が必要になったら commit を
  cherry-pick で戻せる。
