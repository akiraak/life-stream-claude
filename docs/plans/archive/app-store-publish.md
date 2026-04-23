# アプリ公開手順 (App Store / Google Play)

Expo SDK 54 + EAS Build を使用した公開手順。

## 前提条件

| 項目 | 必要なもの |
|------|-----------|
| Apple Developer Program | 年額 $99（個人） https://developer.apple.com/programs/ |
| Google Play Console | 初回 $25 https://play.google.com/console/ |
| Expo アカウント | https://expo.dev （無料プランで可） |
| EAS CLI | `npm install -g eas-cli` |

---

## Step 1: EAS プロジェクト設定

```bash
cd mobile
npm install -g eas-cli
eas login          # Expo アカウントでログイン
eas init           # プロジェクトを Expo に紐付け
```

`eas.json` を作成:

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "YOUR_APPLE_ID",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

---

## Step 2: app.json の公開向け設定確認

現在の `app.json` に追加・確認が必要な項目:

```json
{
  "expo": {
    "version": "1.0.0",
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "updates": {
      "url": "https://u.expo.dev/YOUR_PROJECT_ID"
    },
    "ios": {
      "bundleIdentifier": "me.chobi.basket",
      "buildNumber": "1",
      "infoPlist": {
        "NSMicrophoneUsageDescription": "音声入力で食材を追加するためにマイクを使用します",
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "android": {
      "package": "me.chobi.basket",
      "versionCode": 1,
      "permissions": []
    }
  }
}
```

---

## Step 3: アプリアイコン・スクリーンショット準備

### アイコン
- `icon.png`: 1024x1024px（既存のものを使用）
- iOS: 角丸は自動適用。透過不可
- Android: `adaptive-icon.png` の foreground を確認（既に設定済み）

### スクリーンショット（審査に必須）

| プラットフォーム | サイズ | 枚数 |
|----------------|-------|------|
| iPhone 6.7" | 1290x2796 | 3枚以上 |
| iPhone 6.5" | 1284x2778 | 3枚以上（任意） |
| iPad 12.9" | 2048x2732 | supportsTablet: false なら不要 |
| Android | 16:9 推奨 | 4枚以上 |

撮影する画面:
1. 買い物リスト（料理グループ表示）
2. 食材追加モーダル
3. AI具材・レシピ提案画面
4. レシピブック画面

---

## Step 4: iOS ビルド & 公開

### 4.1 Apple Developer での準備

1. https://developer.apple.com にログイン
2. Certificates, Identifiers & Profiles で Bundle ID `me.chobi.basket` を登録
3. EAS が証明書とプロファイルを自動管理するので手動作成は不要

### 4.2 ビルド

```bash
# プレビュー（実機テスト用）
eas build --platform ios --profile preview

# 本番ビルド
eas build --platform ios --profile production
```

初回ビルド時に Apple Developer の認証情報を聞かれる。
EAS が署名証明書とプロビジョニングプロファイルを自動生成・管理する。

### 4.3 App Store Connect での設定

1. https://appstoreconnect.apple.com でアプリを新規作成
   - アプリ名: `お料理バスケット`
   - Bundle ID: `me.chobi.basket`
   - SKU: `cooking-basket`
   - 言語: 日本語
2. アプリ情報を入力:
   - カテゴリ: フード＆ドリンク
   - サブカテゴリ: なし
   - 年齢制限: 4+
   - 価格: 無料
3. スクリーンショットをアップロード
4. 説明文:

```
お料理バスケットは、料理ごとに食材をまとめて管理できる買い物リストアプリです。
登録不要・ログイン不要ですぐに使い始められます。

主な機能:
- 登録不要で即利用可能（買い物リスト・料理登録・AIレシピ提案すべてローカルで動作）
- 料理ごとに食材をグループ化
- AIが具材とレシピを自動提案（未ログインでも 1 日 3 回まで無料で試せる）
- ドラッグ&ドロップで並び替え
- みんなのレシピを共有・検索（閲覧はログイン不要）
- 音声入力で食材を追加
- ログインすれば複数デバイスでリストを同期、AI は 1 日 20 回まで利用可能
- ログイン時はローカルで作ったデータをアカウントに取り込み可能
```

5. プライバシーポリシー URL を設定（必須）
6. サポート URL を設定

### 4.4 提出

```bash
# ビルド済みの場合、自動提出
eas submit --platform ios --profile production

# または App Store Connect から手動で「審査に提出」
```

### 4.5 審査のポイント

- ログイン機能がある場合、テスト用アカウントを審査チームに提供する（App Review Information に記入）
- Magic Link 認証の場合、審査担当がメールを受信できるテスト用メアドを用意
- 初回審査は通常 24-48 時間

---

## Step 5: Android ビルド & 公開

### 5.1 Google Play Console での準備

1. https://play.google.com/console でアプリを新規作成
   - アプリ名: `お料理バスケット`
   - デフォルト言語: 日本語
   - アプリ/ゲーム: アプリ
   - 無料/有料: 無料
2. ストア掲載情報を入力:
   - 簡単な説明（80字以内）: `登録不要で使える買い物リスト。料理ごとに食材をまとめ、AIがレシピと具材を提案。`
   - 詳しい説明: (iOS と同様)
   - カテゴリ: フード＆ドリンク
3. スクリーンショット・フィーチャーグラフィックをアップロード

### 5.2 サービスアカウントキー作成（自動提出用）

1. Google Cloud Console で Play Developer API を有効化
2. サービスアカウントを作成し JSON キーをダウンロード
3. Google Play Console > API アクセス でサービスアカウントを招待（リリース管理者）
4. JSON キーを `mobile/google-play-service-account.json` に配置（.gitignore に追加）

### 5.3 ビルド

```bash
# プレビュー（内部テスト用 APK）
eas build --platform android --profile preview

# 本番ビルド（AAB）
eas build --platform android --profile production
```

### 5.4 提出

```bash
# 内部テストトラックに提出
eas submit --platform android --profile production
```

または Google Play Console から手動で AAB をアップロード。

### 5.5 リリーストラック

1. **内部テスト** — まずここに配布（最大100人、即時配布）
2. **クローズドテスト** — 招待制ベータ
3. **オープンテスト** — 公開ベータ
4. **製品版** — 一般公開

初回は内部テスト → 製品版の順を推奨。
Google Play の審査は通常数時間〜数日。

---

## Step 6: 公開前チェックリスト

### 必須

- [ ] プライバシーポリシーページを作成・公開（URL が必要）
- [ ] Apple Developer Program に登録（$99/年）
- [ ] Google Play Console に登録（$25）
- [ ] EAS CLI セットアップ (`eas login`, `eas init`)
- [ ] `eas.json` を作成
- [ ] アプリアイコン最終確認（1024x1024）
- [ ] スクリーンショット撮影（iOS: 3枚以上、Android: 4枚以上）
- [ ] ストア説明文（日本語）
- [ ] テスト用アカウント準備（Apple 審査用）
- [ ] `google-play-service-account.json` を `.gitignore` に追加

### 推奨

- [ ] OTA アップデート設定（`expo-updates`）
- [ ] クラッシュレポート（Sentry or EAS Insights）
- [ ] アプリ内のバージョン表示

---

## Step 7: アップデート運用

### OTA アップデート（JS のみの変更）

```bash
eas update --branch production --message "説明"
```

ネイティブコードの変更がない場合、ストア審査なしで即時配布可能。

### ネイティブビルドが必要な場合

- 新しいネイティブモジュール追加時
- Expo SDK アップグレード時
- `app.json` の `version` を上げて再ビルド → ストア提出

```bash
eas build --platform all --profile production
eas submit --platform all --profile production
```

---

## 費用まとめ

| 項目 | 費用 | 頻度 |
|------|------|------|
| Apple Developer Program | $99 | 年額 |
| Google Play Console | $25 | 初回のみ |
| EAS Build (無料枠) | $0 | 月30回まで |
| EAS Build (有料) | $99/月〜 | 無料枠超過時 |

無料枠で十分運用可能。ビルドは月数回程度なら無料。
