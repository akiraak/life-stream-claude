---
title: dev-admin を vibeboard として独立リポジトリに切り出す
---

# dev-admin を vibeboard として独立リポジトリに切り出す

## 目的・背景

`cooking-basket/dev-admin/` は、以下を満たすローカル開発専用ダッシュボード。

- `docs/plans/`・`docs/specs/`（Markdown / HTML）の閲覧
- `TODO.md`・`DONE.md` の編集（楽観ロック・SSE による外部変更通知）
- AI 駆動開発（Claude Code, Cursor 等）と並走するワークフロー（プラン作成 → TODO →
  実装 → DONE 移動 → プランをアーカイブ）に最適化された UI

同じ仕組みを既に 5 プロジェクトで個別実装しており、抽象化の軸は実証済み。
コピペ運用の限界が見えているので、**`vibeboard`** として独立リポジトリ化し、
`npx vibeboard` で任意のプロジェクト直下から起動できるようにする。

GitHub 側のリポジトリは既に作成済み（`akiraak/vibeboard`、初期コミットのみ）。
ローカルクローンは `/home/ubuntu/cooking-basket/vibeboard` に存在する。

## 完了条件

- [ ] GitHub の `akiraak/vibeboard` から直接 `npx -y github:akiraak/vibeboard`
  で起動でき、そのプロジェクトの `docs/plans`・`docs/specs`・`TODO.md`・`DONE.md`
  を扱える（npm レジストリへの公開はしない）
- [ ] `npx -y github:akiraak/vibeboard init` で親プロジェクトの `CLAUDE.md` に
  必要な規約スニペットを追記できる（AI エージェントが vibeboard 前提のワーク
  フローを守れるように）
- [ ] cooking-basket がこの vibeboard を使う形に置き換わり、現行 `dev-admin/` が
  廃止できる（`./dev-admin.sh` 互換は当面残す）
- [ ] `vibeboard/README.md` にインストール・起動・前提構造・設定・`init` コマンド・
  CLAUDE.md に追記すべきスニペットの全文 が載っており、別プロジェクトでも
  README 1 本読めば採用できる

## 対応方針（全体像）

```
cooking-basket/
├── dev-admin/   ← 廃止予定
├── dev-admin.sh ← `npx -y vibeboard` を呼ぶシェルに置き換え
└── ...

vibeboard/       ← 独立リポジトリ → GitHub 直接公開（npm は使わない）
├── src/
│   ├── cli.ts          ← #!/usr/bin/env node エントリ（serve / init を分岐）
│   ├── server.ts       ← Express アプリ（dev-admin/src/index.ts から派生）
│   ├── config.ts       ← CLI 引数 / 設定ファイル / 環境変数の解決
│   ├── init.ts         ← 親 CLAUDE.md への規約スニペット追記
│   ├── templates/
│   │   └── claude-md-snippet.md  ← 親 CLAUDE.md に追記するテンプレ
│   └── web/            ← フロント（dev-admin/src/web/ から派生、ブランド除去）
├── package.json        ← name=vibeboard, bin=vibeboard, prepare="npm run build"
└── README.md
```

### 設定モデル

優先順位は `CLI 引数 > 環境変数 > vibeboard.config.json > デフォルト`。

| 項目        | デフォルト          | CLI                | 環境変数            |
| ----------- | ------------------- | ------------------ | ------------------- |
| ルート      | `process.cwd()`     | `--root <path>`    | `VIBEBOARD_ROOT`    |
| ポート      | `3010`              | `--port <n>`       | `VIBEBOARD_PORT`    |
| ブランド名  | package.json `name` | `--title <s>`      | `VIBEBOARD_TITLE`   |
| 設定ファイル| `vibeboard.config.json` (任意) | `--config <path>` | -        |

v1 はカテゴリ（`plans` / `specs`）と編集対象（`TODO.md` / `DONE.md`）は固定。
v2 で `vibeboard.config.json` から差し替え可能にする（下記 Phase 7）。

UI 文言は日本語固定。i18n / 英語化は非ゴール。

### `vibeboard init` コマンド

vibeboard は親プロジェクトに以下の規約があることを前提に動く：

- ルートに `TODO.md` / `DONE.md` がある
- `docs/plans/<task-name>.md` にプランを置く
- 完了したタスクは `DONE.md` へ移動、対応プランは `docs/plans/archive/` へ移動

これらが守られていないと AI エージェント（Claude Code 等）が vibeboard 経由の
ワークフローを壊してしまうので、`npx vibeboard init` で**親プロジェクトの
`CLAUDE.md` に規約スニペットを追記**する機能を提供する。

- スニペット本体は `vibeboard/src/templates/claude-md-snippet.md` にテンプレ化
- マーカー（`<!-- vibeboard:begin -->` ～ `<!-- vibeboard:end -->`）で囲み、
  既存マーカーがあれば置換、無ければ末尾に追記
- `CLAUDE.md` が存在しなければ新規作成
- `--dry-run` で差分プレビューだけ表示（書き込まない）

## 影響範囲

### vibeboard リポジトリ

- 新規ファイル群：上記ツリー
- 公開先：npm（パッケージ名 `vibeboard` を第一候補、衝突時は `@akiraak/vibeboard`）
- ビルド済み `dist/` は npm tarball にのみ含める（`files` で制御、git には乗せない）

### cooking-basket リポジトリ

- `dev-admin/` を削除
- `dev-admin.sh` を `exec npx -y vibeboard "$@"` に変更
- `CLAUDE.md` の「開発用管理サーバ」節を vibeboard 前提に書き換え

## Phase / Step

### Phase 1: vibeboard 環境構築（足場）
- [x] 1-1. `dev-admin/src/` を vibeboard 側にコピー（コミットせず作業のみ）
- [x] 1-2. `package.json` を整備
  - `name=vibeboard`（npm で衝突したら `@akiraak/vibeboard`）
  - `bin: { vibeboard: "dist/cli.js" }`
  - `files: ["dist", "src/web", "src/templates"]`
  - `prepublishOnly: "npm run build"`
  - `engines.node: ">=18"`
  - 依存（express, marked, etc.）を移植
- [x] 1-3. `tsconfig.json` を移植（出力先 `dist/`、`src/web` と `src/templates` は
  TS 対象外＝そのまま配布）
- [x] 1-4. `src/cli.ts` を新設（shebang + 引数パースして `server.ts` 起動）
- [x] 1-5. `npm install && npm run build && node dist/cli.js --help` まで通す
- [x] 1-6. `.gitignore` を整備（`node_modules/`, `dist/`）

### Phase 2: 汎用化（ハードコード除去）
- [x] 2-1. `ROOT_DIR` を CLI/環境変数で受け取れるようにする
- [x] 2-2. `<title>` から `Cooking Basket: dev-admin` を除き、起動時にブランド名を
  HTML へ inject する仕組み（package.json `name` 由来 / `--title` で上書き）
- [x] 2-3. `app.js` / `index.html` から cooking-basket 固有の文言を点検（タブ名・
  見出しレベルで残るブランド痕跡を削る）。UI 文言自体は日本語のまま
- [x] 2-4. `/api/design/:file`（specs/design 専用の後方互換エンドポイント）は削除
- [x] 2-5. `findFileUnder` のシンボリックリンク扱いを確認（`fs.realpath` で ROOT
  外へ出ないことを保証）
- [x] 2-6. cooking-basket のローカル `vibeboard/` で `node dist/cli.js --root
  /home/ubuntu/cooking-basket` を起動し、現行 dev-admin と同等に動くことを確認

### Phase 3: `vibeboard init` で親 CLAUDE.md にスニペット注入
- [x] 3-1. `src/templates/claude-md-snippet.md` を起こす（規約本文：
  TODO.md / DONE.md / docs/plans / archive のフロー、`vibeboard` 起動コマンド）
- [x] 3-2. `src/init.ts` を実装（マーカー間の置換 / 新規作成 / `--dry-run`）
- [x] 3-3. `cli.ts` のサブコマンド分岐：`vibeboard` / `vibeboard init`
- [x] 3-4. cooking-basket では実際には `init` を流さない（既存 CLAUDE.md と
  内容が衝突するため）。代わりに Phase 6-3 で手動で必要部分を追記する
  → 動作確認は `--dry-run` で「末尾に追記」プレビューが出ることまで確認済み

### Phase 4: README.md の整備
- [x] 4-1. `vibeboard/README.md` を以下の構成で書く：
  - 1) これは何か（AI 駆動開発のためのローカル管理画面）
  - 2) 必要な前提構造（`docs/plans/`・`docs/specs/`・`TODO.md`・`DONE.md`）
  - 3) Quick start（`npx vibeboard` / `npx vibeboard init`）
  - 4) CLI 引数 / 環境変数 / 設定ファイル
  - 5) 親プロジェクトの `CLAUDE.md` に追記すべきスニペット全文（手動コピペ用）
  - 6) 非ゴール（i18n、GitHub Issues 連携、prompt 履歴ビューア 等）
  - 7) トラブルシュート（ポート衝突・WSL2 で fs.watch が効かない場合 等）
- [ ] 4-2. 動作スクリーンショット 1〜2 枚（任意・後回し可）

### Phase 5: GitHub 経由で直接実行できる状態にする
配布は GitHub のみ。npm レジストリへの公開はしない。`npx -y github:akiraak/vibeboard`
で git clone → `npm install`（devDeps 込み）→ `prepare` で build → `bin` 起動、
の流れで動くように構成する。
- [x] 5a. プランを GitHub 配布方式に書き換え（このファイル）
- [x] 5b. `package.json` に `prepare: "npm run build"` を追加（`prepublishOnly`
  は不要なら削除）。`files` は git 配布なので意味を持たないが残しても害なし
- [x] 5c. README.md と `src/templates/claude-md-snippet.md` の `npx -y vibeboard`
  を `npx -y github:akiraak/vibeboard` に置換。バージョン固定方法
  （`#v0.1.0` / コミットハッシュ）も README に追記
- [x] 5d. ローカル検証：`git+file://` 経由で install すると `prepare` が走って
  `node_modules/vibeboard/dist/` が生え、`vibeboard --help` / サーバ起動 /
  `init --dry-run` まで通ることを確認
- [x] 5e. vibeboard リポジトリに commit & GitHub に push
  （remote を SSH に切り替えてから push）
- [x] 5f. `/home/ubuntu/photorans` から `npx -y github:akiraak/vibeboard --help`
  / `--root <photorans> --port 3914` 起動（HTTP 200）/ `init --dry-run` が
  動くことを確認

### Phase 6: cooking-basket 側の置き換え
方針変更: `npx -y github:akiraak/vibeboard` で外から呼ぶのではなく、`degit` で
`cooking-basket/vibeboard/` にコピーして vendor し、cooking-basket の git で管理する。
カスタマイズ前提（UI / ロジックを cooking-basket 用に手を入れる可能性が高い）の
ため、コピーを自分のものにする方が素直なため。
- [x] 6-1. `dev-admin.sh` を最小シェルに書き換え。`vibeboard/dist/cli.js` を
  `node` で叩くだけ。未セットアップ時は初回手順（`npx -y degit
  akiraak/vibeboard vibeboard` + `cd vibeboard && npm install`）を案内して exit 1
- [x] 6-2. `./dev-admin.sh` で起動 → `/`, `/api/docs`, `/api/files/TODO.md`,
  `/api/files/TODO.md/render`, `/api/files/watch` (SSE) が応答することを確認
- [x] 6-3. `CLAUDE.md` の「開発用管理サーバ」節を vibeboard 前提に書き換え
  （degit による初回 setup と vibeboard 本体側の改善ループも明記）
- [x] 6-4. `dev-admin/` を削除（`vibeboard/` 側に Phase 1〜4 の差分はすべて取り
  込まれており、内容差分は Phase 2 の汎用化のみ。dev-admin に未コミットの変更
  なしを確認したうえで削除）

### Phase 7: 設定ファイル対応（任意・後回し可）
- [x] 7-1. `vibeboard.config.json` のスキーマを定義（categories / editable / port
  / title）
- [x] 7-2. 設定ファイル読み込み + バリデーション
- [x] 7-3. README に設定例を追加

## テスト方針

個人ツールなので最小限。Phase 1〜6 通しで `./dev-admin.sh` 起動 → TODO 編集 / SSE
自動反映 / アーカイブ操作の目視確認をもって受け入れとする。`init` は破壊的なので
`--dry-run` を必ず通してから書き込みを実行する運用にする（テストコードは書かない）。

## メモ

- v1 では cooking-basket の構造（`docs/plans` / `docs/specs` / `TODO.md` /
  `DONE.md`）をそのままデフォルトとして固定する。既存 5 プロジェクトでも同じ
  構造を採用しているので、これが「すぐ使える」の最短経路
- 「アーカイブにしたら即反映されない」課題（TODO.md 16 行目）は本切り出しの後に
  vibeboard 側で対応する（移植先で解決した方が綺麗）
- 配布は GitHub のみ。当初は npm 公開を検討したが、(1) npm アカウント認証や
  publish 手順を増やしたくない、(2) 個人ツールに名前空間を確保し続ける運用が
  重い、(3) `npx -y github:akiraak/vibeboard` で十分実用速度が出る、という
  理由で GitHub 直接配布に切り替えた。`dist/` は git に乗せず、`prepare` スクリプト
  で初回 install 時にビルドする。バージョン固定が必要な場合は
  `npx -y github:akiraak/vibeboard#<tag-or-sha>` を使う
