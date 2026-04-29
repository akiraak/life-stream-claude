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

- [ ] npm に公開済みで、任意のプロジェクト直下で `npx vibeboard` を打てば、
  そのプロジェクトの `docs/plans`・`docs/specs`・`TODO.md`・`DONE.md` を扱える
- [ ] `npx vibeboard init` で親プロジェクトの `CLAUDE.md` に必要な規約スニペット
  を追記できる（AI エージェントが vibeboard 前提のワークフローを守れるように）
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

vibeboard/       ← 独立リポジトリ → npm 公開
├── src/
│   ├── cli.ts          ← #!/usr/bin/env node エントリ（serve / init を分岐）
│   ├── server.ts       ← Express アプリ（dev-admin/src/index.ts から派生）
│   ├── config.ts       ← CLI 引数 / 設定ファイル / 環境変数の解決
│   ├── init.ts         ← 親 CLAUDE.md への規約スニペット追記
│   ├── templates/
│   │   └── claude-md-snippet.md  ← 親 CLAUDE.md に追記するテンプレ
│   └── web/            ← フロント（dev-admin/src/web/ から派生、ブランド除去）
├── package.json        ← name=vibeboard, bin=vibeboard, files=[dist, src/web, src/templates]
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
- [ ] 4-1. `vibeboard/README.md` を以下の構成で書く：
  - 1) これは何か（AI 駆動開発のためのローカル管理画面）
  - 2) 必要な前提構造（`docs/plans/`・`docs/specs/`・`TODO.md`・`DONE.md`）
  - 3) Quick start（`npx vibeboard` / `npx vibeboard init`）
  - 4) CLI 引数 / 環境変数 / 設定ファイル
  - 5) 親プロジェクトの `CLAUDE.md` に追記すべきスニペット全文（手動コピペ用）
  - 6) 非ゴール（i18n、GitHub Issues 連携、prompt 履歴ビューア 等）
  - 7) トラブルシュート（ポート衝突・WSL2 で fs.watch が効かない場合 等）
- [ ] 4-2. 動作スクリーンショット 1〜2 枚（任意・後回し可）

### Phase 5: npm 公開
- [ ] 5-1. パッケージ名の空き確認（`npm view vibeboard`）。空いていなければ
  `@akiraak/vibeboard` に切り替え、`package.json` を修正
- [ ] 5-2. `npm pack` でローカルに tarball を作り、別ディレクトリで
  `npx ./vibeboard-0.1.0.tgz --help` が動くことを確認（dist 同梱・bin 解決の検証）
- [ ] 5-3. `0.1.0` を `npm publish`（必要なら `--access public`）
- [ ] 5-4. 別ディレクトリで `npx -y vibeboard` がそのまま起動することを確認

### Phase 6: cooking-basket 側の置き換え
- [ ] 6-1. `dev-admin.sh` を `exec npx -y vibeboard --root "$(dirname "$0")" "$@"`
  に書き換え
- [ ] 6-2. cooking-basket で `./dev-admin.sh` 起動 → 現行と同じ操作ができることを
  目視確認（TODO 編集 / SSE 自動反映 / アーカイブ操作）
- [ ] 6-3. cooking-basket の `CLAUDE.md` の「開発用管理サーバ」節を vibeboard
  前提に書き換え（規約スニペットと整合する形で手動編集）
- [ ] 6-4. `dev-admin/` を削除

### Phase 7: 設定ファイル対応（任意・後回し可）
- [ ] 7-1. `vibeboard.config.json` のスキーマを定義（categories / editable / port
  / title）
- [ ] 7-2. 設定ファイル読み込み + バリデーション
- [ ] 7-3. README に設定例を追加

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
- 配布は npm のみ。`npx github:akiraak/vibeboard` 経由は採用しない（dist 同梱や
  prepare ビルドの手間とトレードオフが見合わない）
