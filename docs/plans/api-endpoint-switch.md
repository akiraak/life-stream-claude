# 実機アプリの接続先サーバ切り替え

## 目的
開発中の実機テストで、自宅 LAN のローカルサーバ（例: `http://192.168.x.x:3000`）に
接続できるようにする。本番ビルドは従来どおり `https://basket.chobi.me` に向ける。

**方針：ランタイム切替はしない。設定ファイルを変更して再ビルドするだけで接続先が変わる、程度のシンプルさに留める。**

## 現状
- `mobile/src/api/client.ts` で `baseURL: 'https://basket.chobi.me'` をハードコード。
- `eas.json` にビルドプロファイル別の env は未設定。

## 実装方針
Expo の `EXPO_PUBLIC_*` 環境変数機構を使う。
- ソース側では `process.env.EXPO_PUBLIC_API_URL` を読む（未設定なら本番 URL にフォールバック）。
- ビルド時に `eas.json` の各プロファイルで env を指定、または `mobile/.env` を書いて
  `npx expo start` / `eas build` を実行すれば切り替わる。

## フェーズ

### Phase 1: API URL を環境変数化
- [x] `mobile/src/config/api-endpoint.ts` を新規作成
  ```ts
  export const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL ?? 'https://basket.chobi.me';
  ```
- [x] `mobile/src/api/client.ts` の `baseURL` を `API_BASE_URL` に差し替え
- [x] 既存の Jest テスト（`__tests__/api/`）が通ることを確認

### Phase 2: eas.json にビルドプロファイル別の env を追加
- [ ] `development` / `preview` プロファイルに
      `"env": { "EXPO_PUBLIC_API_URL": "http://192.168.x.x:3000" }` を追加
      （実 IP は開発機に合わせて適宜書き換える前提）
- [ ] `production` は env 未指定のまま（フォールバックで本番 URL）
- [ ] 開発用ローカル HTTP 許可のための Info.plist / AndroidManifest 設定は
      **preview / development プロファイルのみ**に限定する
  - iOS: `NSAppTransportSecurity.NSAllowsArbitraryLoads = true`
  - Android: `usesCleartextTraffic = true`
  - → `app.config.ts` に移行し、`process.env.EAS_BUILD_PROFILE` で分岐するか、
     production ビルド前に `app.json` から外す運用にする（シンプル優先なら後者）

### Phase 3: 動作確認
- [ ] `mobile/.env` に `EXPO_PUBLIC_API_URL=http://192.168.x.x:3000` を書き、
      `npx expo start` → 実機（Expo Go / 開発ビルド）で自宅サーバに接続できること
- [ ] `.env` を消す / 空にする → `https://basket.chobi.me` に繋がること
- [ ] `eas build --profile production` で作ったビルドが本番サーバに接続すること
- [ ] ログイン（Magic Link）、買い物リスト取得、AI 具材提案が一通り動くこと

## 非スコープ（やらないこと）
- アプリ内からの接続先切替 UI
- ランタイム上書き・AsyncStorage 永続化
- トークンや device-id のエンドポイント別スコープ化
- カスタム URL 入力ダイアログ

## 影響ファイル
- `mobile/src/api/client.ts`（baseURL 差し替え）
- `mobile/src/config/api-endpoint.ts`（新規）
- `mobile/eas.json`（env 追加）
- `mobile/app.json` もしくは `mobile/app.config.ts`（ローカル HTTP 許可、必要な場合のみ）
- `mobile/.env.example`（新規、`EXPO_PUBLIC_API_URL` の記述例）
