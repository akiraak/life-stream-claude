# dev-admin: Plans / Specs の右コンテンツを 2 ペイン化（左に見出し）

## 目的・背景

`dev-admin` の Plans / Specs タブでドキュメントを開いたとき、現状は右側のコンテンツ領域に
Markdown を縦長に流して表示している（`renderMarkdown` → `.content-area > .md-content`）。
プランファイルは見出し（H2/H3）が多く、長い場合はスクロールしないと全体構造が掴めず、
特定のセクションへ素早くジャンプする手段もない。

そこで、Plans / Specs ドキュメント表示時のみ、右側コンテンツ領域を 2 ペイン構成にし、
左ペインに本文の見出し（in-document TOC）を表示する。クリックで該当見出しに
スクロールし、本文のスクロールに合わせて TOC のアクティブ項目が追従するようにする。

## 対応方針

### スコープ
- **対象**: Plans / Specs カテゴリの Markdown 表示（`renderMarkdown(category, filePath)`）
- **対象外**:
  - TODO タブ（preview/edit 切替の独自ビュー）
  - design 配下の HTML（iframe レンダリング）
  - サーバ側 API（`/api/docs/:category/:file` のレスポンス形状は維持）

### レイアウト変更
`content-area` の中身を以下の構造に置き換える（plans/specs のときのみ）。

```
.content-area
├── .doc-toolbar           （既存。アーカイブボタン等。表示位置は従来どおり右上）
└── .doc-pane-layout       ← 新規 wrapper
    ├── .doc-toc            ← 新規。左ペイン（見出し一覧）
    │   └── ul.doc-toc-list
    │       └── li > a.doc-toc-link
    └── .doc-body           ← 既存の .md-content をここに収める
        └── .md-content
```

CSS:
- `.doc-pane-layout`: `display: flex; gap: 24px;`
- `.doc-toc`: 幅 220–260px、`position: sticky; top: 0; align-self: flex-start;`、内部スクロール可
- `.doc-body`: `flex: 1; min-width: 0;`
- 見出しが 0〜1 件、もしくはビューポート幅が狭い（例: < 900px）場合は `.doc-toc` を非表示にしてフルワイドに戻す

### TOC 構築（クライアント側で完結）
1. `renderMarkdown` 内で `data.html` を `.md-content` に挿入したあと、`.md-content` 直下の
   H1〜H4 を querySelectorAll で取得する
2. 各見出しに `id` が無ければ slugify して付与する（marked が ID を付けるかは要検証。
   付かない場合は最小 slugger を実装する。重複時は `-2`, `-3`… を suffix）
3. 見出しレベル（H1〜H4）でインデントを変えた `<ul>` を組み立て `.doc-toc` に挿入する
   - H1（タイトル）は通常 1 件。タイトル相当は TOC のヘッダにするか、最上位として並べるかは実装時に決定（基本は H2 以下のみを TOC に出す方向）
4. `.doc-toc-link` のクリックで `target.scrollIntoView({ behavior: 'smooth', block: 'start' })`
5. `IntersectionObserver` で各見出しを監視し、最も上に見えているものに `.doc-toc-link.active` を付ける
   - rootMargin はヘッダ（topbar）高さ分だけ上にオフセット
   - 初期状態（読み込み直後）は最初の見出しを active にする

### 既存の挙動への影響
- `.doc-toolbar`（アーカイブボタン）は従来どおり `.content-area` 直下に残す。2 ペイン領域の上に表示されるため、ボタン位置は変わらない
- Mermaid 図のレンダリング（`renderMermaidIn(div)`）は `.md-content` を `div` として渡しているので 2 ペイン内に入っても動作はそのまま
- SSE による外部変更検知後の再レンダリングは `renderMarkdown` を呼び直す経路のため、TOC も自動的に再構築される

## 影響範囲

- `dev-admin/src/web/app.js`
  - `renderMarkdown`（L278〜）に 2 ペインラッパー生成と TOC 構築ロジックを追加
  - TOC ヘルパー関数（`buildDocToc(mdContentEl)`、slugify、IntersectionObserver セットアップ）を新設
  - ルート切替時 / アンマウント時に IntersectionObserver を `disconnect()` する後始末
- `dev-admin/src/web/style.css`
  - `.doc-pane-layout`, `.doc-toc`, `.doc-toc-list`, `.doc-toc-link`, `.doc-toc-link.active` 等を追加
  - 既存の `.md-content` 規則は変更しない
- サーバ (`dev-admin/src/index.ts`): **変更なし**（API レスポンスは維持）

## Phase / Step

- [x] Phase 1: レイアウト変更（CSS + ラッパー HTML）
  - [x] `.doc-pane-layout` / `.doc-toc` / `.doc-body` の CSS を追加
  - [x] `renderMarkdown` 内で plans/specs のときに 2 ペインラッパーを組む（TOC は空のまま）
- [x] Phase 2: TOC 構築
  - [x] `.md-content` 内の見出しを走査し、必要なら id を付与
  - [x] 階層付き `<ul>` を生成して `.doc-toc` に挿入
  - [x] 見出しが 0〜1 件のときは TOC ペインを非表示
- [ ] Phase 3: クリック / アクティブ追従
  - [ ] クリックで該当見出しへスムーズスクロール
  - [ ] IntersectionObserver で active ハイライトを切替
  - [ ] ルート切替時に observer を disconnect
- [ ] Phase 4: 動作確認 / 微調整
  - [ ] 短いプラン / 長いプラン / Mermaid を含むプランで表示確認
  - [ ] 狭い幅（〜900px 程度）でレイアウト崩れがないか確認
  - [ ] アーカイブボタンの位置・動作が変わっていないこと
- [ ] Phase 5: 後片付け
  - [ ] `TODO.md` の該当項目を `DONE.md` に移動
  - [ ] 本プランファイルを `docs/plans/archive/` に移動

## テスト方針

`dev-admin` には自動テストが無いため、ブラウザでの手動確認で代替する。

- 短いドキュメント（見出しほぼ無し）: TOC ペインが非表示になりフルワイドで表示される
- 長いドキュメント（例: `docs/plans/my-recipes-display-criteria.md`）:
  - H2/H3 が階層表示される
  - クリックで該当セクションまで滑らかにスクロールする
  - 本文をスクロールするとアクティブな TOC 項目が追従する
- Mermaid を含むプラン: 図がレイアウトを壊さない
- アーカイブ可能なプラン直下ファイル: 「アーカイブする」ボタンが従来どおり機能する
- SSE による外部更新時: 再レンダリング後も TOC が再構築され壊れない
- `archive/` 配下のプラン: 同じ 2 ペインで表示される（アーカイブボタンは出ない、というのは現状仕様どおり）

## 未決事項 / 検討メモ

- H1（ドキュメントタイトル）を TOC に含めるかどうか
  - 案 A: H1 は topbar の `page-title` に既に出ているため TOC からは除外し、H2 以下のみ
  - 案 B: H1 を TOC のヘッダとして固定表示
  - → 実装時に短いプラン・長いプラン両方で見比べて決める（基本は案 A 想定）
- marked が heading に id を付与しているかの確認（`gfmHeadingId` プラグインは未導入のはず）
  - 付与されていなければ自前 slugify を実装する。日本語見出しは `encodeURIComponent` 経由か、英数字 + ハッシュ短縮にする
- 将来的に「他のプロジェクトに dev-admin を切り出す」TODO もあるため、今回の変更は dev-admin 内に閉じた汎用機能として実装する
