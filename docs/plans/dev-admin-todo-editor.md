# dev-admin に TODO.md の表示・編集機能を追加する

## 目的

- `TODO.md` を dev-admin（`http://localhost:3010`）で閲覧・編集できるようにする。
- Claude Code やエディタなど**外部での変更をリアルタイムで反映**する（手動リロード不要）。
- 同時に編集競合が起きたとき、ユーザーの未保存分を勝手に上書きしない。

## 前提

- dev-admin は **ローカル開発専用**（`127.0.0.1:3010`）。認証なし・単一ユーザー想定。
- 既存の dev-admin は `docs/plans` / `docs/specs` 配下のみ扱う。TODO.md はリポジトリルート直下なので、既存の `MD_CATEGORIES` フレームワークには乗せず、**専用エンドポイント**を用意する。
- `DONE.md` も対象に含める（運用上ペアで見たいことが多く、`TODO.md` のタスクが完了したら `DONE.md` に移す CLAUDE.md ルールがあるため）。

## スコープ

| 対象 | 今回 |
|------|------|
| TODO.md / DONE.md の **閲覧** | ✅ marked による HTML レンダリング |
| TODO.md / DONE.md の **編集** | ✅ textarea ベースの生 Markdown 編集 |
| 外部変更のリアルタイム反映 | ✅ SSE + `fs.watch` |
| チェックボックスのワンクリックトグル | ❌ 今回は見送り（テキスト編集のみ） |
| plans/specs の編集機能 | ❌ スコープ外（読み取り専用のまま） |
| 認証・排他制御 | ❌ 単一ユーザー想定のため不要 |

## 実装方針

### サーバ側（`dev-admin/src/index.ts`）

#### 1. 編集対象のホワイトリスト

リポジトリルート直下の特定ファイルだけを編集対象にする。パストラバーサル対策として**ファイル名 → 絶対パス**の固定マップを持つ。

```ts
const ROOT_DIR = path.join(__dirname, '../..');
const EDITABLE_FILES: Record<string, string> = {
  'TODO.md': path.join(ROOT_DIR, 'TODO.md'),
  'DONE.md': path.join(ROOT_DIR, 'DONE.md'),
};
```

#### 2. REST API

| Method | Path | 機能 |
|--------|------|------|
| GET | `/api/files/:name` | 生 Markdown と mtime を返す |
| PUT | `/api/files/:name` | 本文を保存（If-Unmodified-Since 相当の mtime チェック付き） |
| GET | `/api/files/:name/render` | marked で HTML 化した結果を返す（閲覧モード用） |

レスポンス形式は既存 API と合わせて `{ success, data, error }`。

- `GET /api/files/:name`: `{ content: string, mtime: number }`
- `PUT /api/files/:name` リクエスト: `{ content: string, baseMtime: number }`
- `PUT` 時に現在の mtime が `baseMtime` と一致しなければ `409 Conflict` で `{ error: '外部で更新されています', data: { currentMtime } }` を返す（楽観ロック）。一致すれば書き込み、新しい mtime を返す。

#### 3. SSE エンドポイント（`GET /api/files/watch`）

- `Content-Type: text/event-stream` で接続を保持。
- `fs.watch` で `TODO.md` / `DONE.md` を個別に監視し、変更があれば `event: change` + `data: { name, mtime }` を push。
- `fs.watch` はエディタ経由の atomic rename で発火しないことがあるため、**変更検知後に `fs.stat` で mtime を確認**してから send する（mtime が同じなら発火を捨てる）。Linux/WSL2 では `recursive: false` で十分。
- 接続切断時は watcher を解除。keep-alive のため 30 秒ごとに `: ping\n\n` を送る。

監視の robustness 注記:
- WSL2 で `fs.watch` が不安定な事例があるため、保険として**ポーリング 2 秒**のフォールバックを用意する（`setInterval` で mtime を stat し、最後の通知 mtime と違えば送る）。`fs.watch` と重複通知になってもクライアント側の mtime 比較で無害。

#### 4. 静的 docs-tree への追加

サイドバーから辿れるようにするため、`GET /api/docs` のレスポンスに新カテゴリ `root` を追加する案と、**topbar に「TODO」タブを追加する案**のどちらかを取る。後者のほうが既存ツリー構造を汚さず分かりやすいので **topbar タブ追加**で進める。

### クライアント側（`dev-admin/src/web/`）

#### 1. topbar タブに「TODO」を追加

- `index.html` の `#topbar-tabs` に `<button data-category="todo">TODO</button>` を追加。
- `CATEGORIES` に `'todo'` を追加。タブ切替時に専用ビュー（`renderTodoView`）を表示する。

#### 2. TODO ビューのレイアウト

- 左サイドバー: `TODO.md` / `DONE.md` を縦に並べたシンプルなリスト。
- メインエリア: 選択されたファイルについて**タブ切替 2 枚**
  - **プレビュー** (デフォルト): marked で HTML 化した内容を表示
  - **編集**: `<textarea>` 1 枚 + 「保存」ボタン + 「変更を破棄」ボタン

編集モード時は textarea に直接生 Markdown を表示。フォント等幅、縦いっぱいに広げる。

#### 3. 保存処理

- textarea の値と `baseMtime` を `PUT /api/files/TODO.md` に送る。
- `409` が返ったら **「外部で更新されました。リロードして再編集しますか？」** ダイアログで

  - [リロードする]: 最新内容で textarea を上書き（編集内容は破棄、その旨警告）
  - [手元の内容を維持]: そのまま編集継続（次の保存時も同じ衝突が起きうる）
  - [強制上書き]: `baseMtime` を現在値に差し替えて再 PUT

- 保存成功時は新しい `mtime` を state に保持し、「保存しました」トーストを 2 秒表示。

#### 4. SSE でのリアルタイム反映と競合表示

- ページ読み込み時に `new EventSource('/api/files/watch')` を開く。
- `change` イベントを受信したら、現在表示中のファイルと一致するものだけ処理する。

##### モードごとの挙動

  **プレビューモード**:
  - 即座に再取得してレンダリング更新（`fetch /api/files/:name/render`）。視覚的に差分が出ないよう、更新直後に画面右上に「外部で更新されました」バッジを 1.5 秒点灯。

  **編集モード（textarea 未変更 = clean）**:
  - そのまま内容と mtime を差し替える（ユーザー編集中ではないので破壊しない）。
  - その際、画面上部に**情報バー**（青系・低コントラスト）を一定時間表示し「外部で更新されたため、最新内容に差し替えました」と通知する。サイレント更新で気付かないことを防ぐのが目的。

  **編集モード（textarea に未保存変更あり = dirty）= 競合状態**:
  - 内容は**置き換えない**。代わりに画面上部に**警告バー**（黄色・常時表示）を出し、明確に競合中であることを示す:
    - 文言: **「⚠ 競合: 外部で TODO.md が更新されています（YYYY-MM-DD HH:mm:ss）。保存すると外部の変更を上書きします」**
    - 操作ボタン: `[差分を見る]` `[外部版を読み込む（手元の変更を破棄）]` `[このまま編集を続ける]`（バーを閉じる）
  - 加えて以下の**多層的な視覚サイン**で「気付かない」を防ぐ:
    - サイドバーの該当ファイル名の右に **● バッジ**（赤）を付け、競合中であることを残す。
    - ブラウザタブのタイトルに `(!) ` を prepend（`(!) Cooking Basket: dev-admin`）。
    - favicon を一時的に競合状態色に差し替え（任意）。
  - 競合解消の条件:
    - `[外部版を読み込む]` で破棄解消、または保存成功（強制上書き含む）で解消、または `isDirty` が false に戻った時点で解消。
    - 解消したらバー・バッジ・タイトル装飾を全て消す。

##### 接続状態の表示

- `EventSource.onerror` 発火 → 自動再接続中は topbar に小さく「●リアルタイム同期: 切断中（再接続を試行中）」を表示。再接続成功で消す。
- 接続切断中はファイルが古い可能性があるため、後述の手動更新ボタンを目立たせる（色を強調）。

#### 5. 手動再取得（リフレッシュ）ボタン

SSE が万一死んでいる、外部更新を取りこぼした疑いがある、あるいはユーザーが単純に「最新で再取得したい」と思った時のためのエスケープハッチ。

- TODO ビューのツールバー（プレビュー/編集サブタブの右側）に **「↻ 再取得」ボタン**を常設する。
- 押下時の挙動:
  - **プレビューモード時**: `GET /api/files/:name/render` を呼んで内容と mtime を更新。「最新を読み込みました」トーストを 1.5 秒。
  - **編集モード（clean）時**: `GET /api/files/:name` を呼んで textarea と mtime を差し替え。同様のトースト。
  - **編集モード（dirty）時**: 「未保存の変更があります。再取得すると失われます。続行しますか？」を `confirm` で確認 → OK で破棄して取得、キャンセルで何もしない。
- ボタンには現在の mtime を tooltip で表示（例: `最終取得: 2026-04-22 09:15:03`）。直近に外部更新通知を受けたが未反映な状況では、ボタンの色をオレンジに強調する。
- キーボードショートカット **`Cmd/Ctrl + R` を奪わない**（ブラウザリロードと衝突するため）。代わりに **`R` 単独キー**（textarea にフォーカスがない時のみ）でショートカット可能に。

#### 6. 編集中フラグと離脱警告

- textarea の `input` で `isDirty = true` にする。
- `window.addEventListener('beforeunload', ...)` で `isDirty` 時に離脱確認を出す。

### セキュリティ / 安全策

- 編集対象は `EDITABLE_FILES` ホワイトリストに限定。クエリやパスパラメータから任意のパスに到達できないようにする。
- dev-admin は既に `127.0.0.1` バインド。外部公開を避ける現状運用を維持（変更なし）。
- `PUT` 時は **一時ファイル書き込み → rename** のアトミック書き込み（`fs.writeFile` + `fs.renameSync`）で半端な状態を作らない。`fs.watch` ループを避けるため、自前書き込み直後の mtime をクライアントに返してそのまま使わせる。

## 作業ステップ

### Phase 1: サーバ側 API
- [ ] 1. `dev-admin/src/index.ts` に `EDITABLE_FILES` ホワイトリストを追加
- [ ] 2. `GET /api/files/:name` / `GET /api/files/:name/render` / `PUT /api/files/:name` を実装（mtime ベースの楽観ロック付き）
- [ ] 3. アトミック書き込み（tmp → rename）を `PUT` で採用
- [ ] 4. (動作確認) curl で GET/PUT 動作確認（正常系・mtime 不一致で 409・ホワイトリスト外で 400）

### Phase 2: SSE 変更通知
- [x] 5. `GET /api/files/watch` を `text/event-stream` で実装
- [x] 6. `fs.watch` で `TODO.md` / `DONE.md` を監視し、`stat` で mtime 確認後に `event: change` を送る
- [x] 7. 2 秒ポーリングのフォールバックを追加（WSL2 保険）
- [x] 8. 接続切断時の watcher 解除と keep-alive ping（30 秒）を実装
- [x] 9. (動作確認) `curl -N http://localhost:3010/api/files/watch` を開いた状態で別端末から `echo >> TODO.md` して通知が届くか確認

### Phase 3: クライアント UI（閲覧）
- [x] 10. `index.html` の `#topbar-tabs` に「TODO」タブを追加、`CATEGORIES` に `'todo'` 追加
- [x] 11. `app.js` に `renderTodoView()` を追加。左に TODO.md / DONE.md リンク、右にプレビュー領域を表示
- [x] 12. プレビューは `GET /api/files/:name/render` の HTML を挿入
- [x] 13. (動作確認) TODO タブで TODO.md / DONE.md が整形表示されること

### Phase 4: クライアント UI（編集）
- [x] 14. プレビュー/編集のサブタブを追加、編集モードは `<textarea>` + 保存 / 破棄ボタン
- [x] 15. 保存処理（`PUT` + baseMtime）と 409 時のダイアログ（リロード / 維持 / 強制上書き）を実装
- [x] 16. `isDirty` 管理と `beforeunload` 離脱警告を追加
- [x] 17. 保存成功トーストを追加
- [x] 18. (動作確認) 編集 → 保存で実ファイルが書き換わること、他で更新されたときの 409 ダイアログ挙動

### Phase 5: リアルタイム反映と競合表示
- [x] 19. `EventSource('/api/files/watch')` を init で接続、切断時自動再接続を確認
- [x] 20. プレビューモード時: `change` 受信で自動リフレッシュ + 「外部で更新されました」バッジ表示
- [x] 21. 編集モード（clean）時: 内容と mtime を差し替え + 情報バーで通知
- [x] 22. 編集モード（dirty）時: 黄色警告バー + [差分を見る] モーダル + [外部版を読み込む] + [編集を続ける]
- [x] 23. 競合中の多層サイン（サイドバー赤●バッジ、タブタイトル `(!) ` prepend）を実装
- [x] 24. SSE 切断中インジケータを topbar に表示
- [x] (動作確認) Claude Code / エディタで TODO.md を外部編集 → 反映確認（プレビュー / clean 編集 / dirty 編集 / SSE 切断中の 4 パターン）

### Phase 5b: 手動再取得
- [x] 25. TODO ビューのツールバーに「↻ 再取得」ボタンを常設、tooltip に最終取得時刻を表示
- [x] 26. プレビュー/clean 編集時はトースト付きで再取得、dirty 時は confirm で破棄確認
- [x] 27. 直近の外部更新通知が未反映の場合はボタンを色強調
- [x] 28. `R` 単独キーショートカット（textarea 非フォーカス時のみ）
- [x] (動作確認) SSE を意図的に切った状態でも再取得ボタンで最新内容が取得できること

### Phase 6: 仕上げ
- [x] 24. style.css に TODO ビュー用スタイル（textarea 等幅、トースト、警告バー、バッジ）を追加
- [x] 25. README / CLAUDE.md の dev-admin セクションに TODO 編集機能を追記
- [x] 26. (動作確認) 回帰: Plans / Specs タブが既存通り動くこと、アーカイブボタンが壊れていないこと

## 想定しないケース / 将来拡張

- チェックボックス `- [ ]` / `- [x]` のワンクリックトグル: 今回は textarea 編集のみ。将来の拡張余地。
- 複数ユーザー同時編集: dev-admin はローカル専用なので考慮しない。
- git 連携（自動コミット）: 手動運用のまま。
- plans/specs 配下の編集: 今回は TODO.md / DONE.md のみ。必要が出たら同じ仕組みを拡張する。
