# モバイルアプリのローカルサーバ接続表示

## 目的
ローカルサーバに接続している開発アプリを、ハンバーガーメニュー（右上 `☰`）から
一目で識別できるようにする。本番接続のアプリと混同して操作する事故を防ぐ。

## 背景
- `mobile/src/config/api-endpoint.ts` で接続先を決めている:
  ```ts
  export const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL ?? 'https://basket.chobi.me';
  ```
- `mobile-build-local.sh` 経由で起動した Expo Go / dev build は
  `EXPO_PUBLIC_API_URL` に LAN IP（例: `http://192.168.x.x:3000`）が入る
- 一方 `mobile-build-prod.sh` 起動や TestFlight ビルドは本番 URL に向く
- 現状アプリ画面上から接続先を確認する手段がなく、ローカル DB を本番だと
  思い込んで操作するリスクがある（逆も同様）

## 対応方針
ハンバーガーメニュー（`mobile/app/(tabs)/_layout.tsx`）に
「ローカル接続中」を示す行を追加する。本番接続時は何も出さない（既存の見た目を変えない）。

### 判定ロジック
`API_BASE_URL` が本番 URL（`https://basket.chobi.me`）以外なら「ローカル接続」とみなす。

```ts
const PRODUCTION_API_URL = 'https://basket.chobi.me';
export const isLocalServer = API_BASE_URL !== PRODUCTION_API_URL;
```

- `__DEV__` ではなく URL ベースで判定する理由:
  - `mobile-build-prod.sh` は dev build でも本番 URL に向くので `__DEV__` だけでは誤検知する
  - 逆に dev build で本番に向ける／release ビルドでローカルに向ける、のどちらも
    URL を見れば正しく出る
- 配置: `mobile/src/config/api-endpoint.ts` に `isLocalServer` と `API_BASE_URL` 表示用の
  ホスト部分（例: `192.168.x.x:3000`）を export するヘルパを追加する。

### UI 表示
メニューの一番下（ログイン／ログアウト行のさらに下）に警告色付きの行を追加する。

```
┌──────────────────────┐
│ user@example.com      │
│ AI 残り 12 回         │
│ ログアウト            │
│ 🔧 ローカル: 192.168.1.10:3000 │ ← 新規（isLocalServer のときのみ）
└──────────────────────┘
```

- 文言: `🔧 ローカル: {hostname}:{port}`（プロトコル `http://` は省略してコンパクトに）
- 色: `colors.warning`（無ければ `colors.danger` でも可。テーマ側に追加）
- 上に区切り線を入れてログイン／ログアウト行と分離する（既存の email 行と同じ borderTop スタイル）
- 本番接続時はこの行ごと描画しない（既存メニューと完全に同じ見た目になる）

### ハンバーガーアイコン側のバッジ（採用）
メニューを開かなくても気づけるよう、`☰` 右上に小さな赤丸バッジを重ねる。
こちらも `isLocalServer` のときだけ表示する。

### 却下案
- **`__DEV__` での判定**: dev build × 本番接続を取りこぼすので不採用
- **タブバー全体の色変え**: 影響範囲が広く、スクショ撮影時にも紛れ込むのでやめる
- **バッジを出さずメニュー内のみ**: 開かないと気づけないので、最低限ドット 1 個は出す

## 影響範囲
- `mobile/src/config/api-endpoint.ts`: `isLocalServer` / 表示用ホスト名を export
- `mobile/app/(tabs)/_layout.tsx`: メニュー先頭行 + ハンバーガーバッジ追加
- `mobile/src/theme/`: 必要なら警告色を追加（既存 `colors.danger` で代用可なら不要）
- テスト: `mobile/__tests__/` に該当箇所のレンダリングテストは現状未整備のため、
  ロジック単体（`isLocalServer` の判定）だけ Jest で追加する

## テスト方針
1. **Jest（自動）**: `isLocalServer` の単体テストを `__tests__/config/` に追加
   - `EXPO_PUBLIC_API_URL` 未設定 → `false`
   - `https://basket.chobi.me` → `false`
   - `http://192.168.1.10:3000` → `true`
   - `http://localhost:3000` → `true`
2. **手動**:
   - `./mobile-build-local.sh` 起動 → メニュー先頭に `🔧 ローカル: ...` が出る／`☰` にバッジ
   - `./mobile-build-prod.sh` 起動 → メニューが従来どおり（行・バッジとも非表示）
   - 未ログイン状態でも同様に表示される

## 非スコープ
- 接続先を画面上から切り替える機能（環境変数で十分）
- web 管理画面側の同種表示
- TestFlight / 本番リリースビルドへの影響（本番 URL 固定なので何も変わらない）

## フェーズ

### Phase 1: 判定ヘルパとテスト
- [ ] `mobile/src/config/api-endpoint.ts` に `isLocalServer` / 表示用ホスト名を追加
- [ ] `mobile/__tests__/config/api-endpoint.test.ts` を追加

### Phase 2: UI 反映
- [ ] `mobile/app/(tabs)/_layout.tsx` のメニューに「ローカル接続」行を追加
- [ ] ハンバーガーアイコンに赤丸バッジを追加
- [ ] 手動確認（local / prod 双方の起動スクリプトで切り替えチェック）
