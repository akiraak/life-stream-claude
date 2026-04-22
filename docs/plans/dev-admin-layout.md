---
title: dev-admin レイアウト変更
---

# dev-admin レイアウト変更 計画

## 目的

現在の dev-admin は左サイドバーに `Plans` / `Specs` / `Design` の3カテゴリを縦に並べ、各カテゴリ配下のファイルをフラットに列挙している。
カテゴリ数やファイル数が増えるとサイドバーが長くなり、目的のドキュメントを探しにくい。

この計画では、カテゴリ切替をサイドバーから **トップバーのタブ** に移し、サイドバーには **選択中カテゴリのファイルだけを階層表示** する構成に変更する。
`docs/specs/design/` のようなサブディレクトリはツリー化して、折りたたみ可能にする。

## スコープ

### 含む

- トップバーに `Plans` / `Specs` のタブを追加し、クリックでカテゴリを切替
- サイドバーは選択中カテゴリのファイルだけを表示
- サブディレクトリがある場合はツリー表示し、ディレクトリ単位で折りたたみ可能にする
- 選択中カテゴリ・折りたたみ状態を localStorage に保存して、再訪時に復元
- URL ハッシュで直接カテゴリ / ファイルを開けるようにする（既存リンク互換）

### 含まない

- `Design` カテゴリの独立タブ化（`specs/design/` のサブディレクトリとして `Specs` 配下に統合する）
- 全文検索 / サイドバーのフィルター入力（将来拡張）
- markdown 本文内の見出しアウトライン表示

## 現状と変更後の比較

### 現状

- サイドバー: `Plans` / `Specs` / `Design` を縦積み、各カテゴリの下にファイル名をフラット列挙
- トップバー: ページタイトル + ファイルパスのみ
- URL: `#plans/xxx.md` / `#specs/xxx.md` / `#design/xxx.html`

### 変更後

- トップバー: カテゴリタブ `Plans` / `Specs` + ページタイトル + ファイルパス
- サイドバー: 選択タブのツリー
  - `Plans`: `.md` ファイル（フラット）
  - `Specs`:
    - `.md` ファイル
    - `design/` ディレクトリ（折りたたみ可、中に `.html` を列挙）
- URL: `#plans/xxx.md` / `#specs/xxx.md` / `#specs/design/xxx.html`
  - 旧 `#design/xxx.html` は `#specs/design/xxx.html` にリダイレクト

## API 設計

`/api/docs` のレスポンスを、カテゴリごとのツリー構造に変える。

```json
{
  "success": true,
  "data": {
    "plans": {
      "files": [{ "name": "xxx.md", "path": "xxx.md", "title": "..." }],
      "dirs": []
    },
    "specs": {
      "files": [{ "name": "xxx.md", "path": "xxx.md", "title": "..." }],
      "dirs": [
        {
          "name": "design",
          "files": [{ "name": "design-01.html", "path": "design/design-01.html", "title": "..." }],
          "dirs": []
        }
      ]
    }
  }
}
```

ファイル取得・design プレビュー用エンドポイントは現状どおり:

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/docs` | ツリー構造を返す（上記） |
| GET | `/api/docs/:category/:file` | markdown を HTML に変換して返す（既存） |
| GET | `/api/design/:file` | `docs/specs/design/*.html` を返す（既存） |

`path` はカテゴリルートからの相対パスで、`/` 区切り。API の file パラメータは引き続き `specs/design/xxx.html` 全体ではなくファイル名のみ（安全のため `..` / `/` を拒否）を受け取る。design HTML は `/api/design/:file` に引き続き委譲。

## 画面仕様

### トップバー

```
┌────────────────────────────────────────────────────────┐
│ [Plans] [Specs]   ページタイトル        specs/xxx.md    │
└────────────────────────────────────────────────────────┘
```

- タブはアクティブ時に下線 + 強調色
- タブの幅は内容に合わせて可変

### サイドバー（例: Specs 選択時）

```
dev-admin
─────────────
▼ design          ← クリックで折りたたみ
  design-01.html
  design-02.html
  ...
ai-features.md
shopping-list.md
```

- ディレクトリは `▼` / `▶` で展開状態を示す
- インデントで階層を表現（1階層 = 16px）
- ファイルはタイトル + ファイル名の2行表示（現行踏襲）
- 折りたたみ状態はカテゴリごとに localStorage に保存

### 状態の永続化

- `localStorage['dev-admin.activeCategory']`: 最後に開いたタブ
- `localStorage['dev-admin.expanded']`: `{"specs/design": true, ...}` 形式

URL ハッシュが指定されていればそちらを優先。

## 実装ステップ

- [ ] Step1: サーバ `dev-admin/src/index.ts` を改修
  - `listMdFiles` / `listDesignFiles` をツリー再帰版 `listTree` に置き換え
  - `/api/docs` のレスポンスを新形式に変更
  - `/api/docs/:category/:file` の category 許可リストから `design` を外し、ファイル検索を `specs/design/` に拡張（HTML ではなく md のみ対象）
- [ ] Step2: クライアント HTML (`dev-admin/src/web/index.html`) にトップタブの DOM を追加
- [ ] Step3: クライアント JS (`app.js`) を改修
  - カテゴリタブの切替ロジック
  - ツリーレンダリング（再帰）と折りたたみ
  - localStorage 連携
  - 旧 `#design/xxx.html` 形式のハッシュを新形式へリダイレクト
- [ ] Step4: CSS (`style.css`) を調整
  - トップタブのスタイル
  - ツリーのインデント / トグルアイコン
  - 折りたたみアニメーション（省略可）
- [ ] Step5: 動作確認
  - タブ切替でサイドバーが差し替わる
  - `specs/design/` が折りたためる
  - リロードしてもタブ・折りたたみ状態が復元される
  - 既存 URL (`#plans/xxx.md` 等) が今までどおり動く
  - 旧 `#design/xxx.html` が `#specs/design/xxx.html` にリダイレクトされる

## テスト方法

1. `./dev-admin.sh` で起動
2. `http://localhost:3010` を開き、初期表示で `Plans` タブがアクティブ、サイドバーに plans の md が並ぶことを確認
3. `Specs` タブをクリック、md ファイルと `design/` ディレクトリが表示される
4. `design/` をクリックして折りたたみ / 展開できる
5. `design/design-01.html` をクリックして iframe プレビューが表示される
6. リロードして最後のタブ・折りたたみ状態が復元される
7. `http://localhost:3010/#plans/app-store-publish.md` を直接開いて正しく表示される
8. `http://localhost:3010/#design/design-01.html` を開くと `#specs/design/design-01.html` にリダイレクトされ表示される

## 将来拡張

- サイドバー上部に検索 / フィルター入力
- markdown 本文内見出しのアウトライン表示（右ペイン）
- サイドバー自体を折りたたむトグル（モバイル対応）
