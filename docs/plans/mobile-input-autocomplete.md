# アプリの入力欄で入力補完機能を有効にする

## 目的
モバイルアプリの各 `TextInput` に対して、OS（iOS / Android）が提供する
入力補完・オートフィル機能を適切に有効化する。
特に **AuthModal の email / OTP コード** はパスワードマネージャや
メール OTP 連携が効くようにし、ログイン時のタイプ量をゼロに近づける。

「入力補完」の本タスクでのスコープは **OS 標準の autofill / 予測変換**
であり、過去にあった候補リスト UI（`SuggestionsList.tsx` ベースの履歴サジェスト）の
復活は対象外（[非スコープ](#非スコープ) 参照）。

## 背景

### 現状の `TextInput`

| 場所 | 用途 | 現在のプロパティ | 問題点 |
| --- | --- | --- | --- |
| `mobile/src/components/auth/AuthModal.tsx:115` | ログイン用 メール | `keyboardType="email-address"`, `autoCapitalize="none"`, `autoCorrect={false}` | iCloud Keychain / Google Password Manager のメール候補が出ない（`textContentType` / `autoComplete` 未指定） |
| `mobile/src/components/auth/AuthModal.tsx:145` | ログイン用 OTP コード | `keyboardType="number-pad"` のみ | iOS / Android がメール内 OTP を検出して自動入力するための `textContentType="oneTimeCode"` / `autoComplete="sms-otp"` が無い |
| `mobile/src/components/shopping/AddModal.tsx:101` | 食材名 / 料理名 | プロパティなし（既定値） | 既定値で iOS の予測変換は効くが、Android で `autoComplete="off"` / `importantForAutofill="no"` を明示しないと不要なフォーム履歴が混ざる可能性 |
| `mobile/src/components/dishes/IngredientsScreen.tsx:230` | 料理名インライン編集 | プロパティなし | 同上 |
| `mobile/app/(tabs)/recipes.tsx:65` | レシピ検索 | プロパティなし | `returnKeyType="search"` 未指定。`autoCorrect` 既定（true）のため日本語確定後の自動補完で誤確定の余地 |
| `mobile/app/(tabs)/shared.tsx:69` | みんなのレシピ検索 | プロパティなし | 同上 |

### React Native 0.81 / Expo SDK 54 でのオートフィル系プロパティ

- `textContentType` (iOS): iCloud Keychain / Quick Type バーが何を提案するかを決める。
  `emailAddress`, `oneTimeCode`, `username`, `password`, `none` など。
- `autoComplete` (Android & web): `email`, `sms-otp`, `off`, `username`, `password` など。
  Android 8+ の Autofill Framework を駆動する。
- `autoCorrect` / `spellCheck`: 日本語入力では予測変換のオン／オフに影響。
  日本語の食材名・料理名では基本 ON のままで OK。
- `returnKeyType`: 完了時のキーラベル（`search` / `done` / `next`）。
  入力補完そのものではないが、検索系で UX を底上げするため同時に整える。

## 対応方針

### Phase 1: `AuthModal` のオートフィル対応（最重要）

#### email 入力（`AuthModal.tsx:115`）
追加するプロパティ:
```tsx
textContentType="emailAddress"   // iOS: Keychain からメール候補
autoComplete="email"             // Android: 端末保存のメール候補
returnKeyType="send"             // 送信ボタンに遷移
```
既存の `keyboardType="email-address" / autoCapitalize="none" / autoCorrect={false}` は維持。

#### OTP コード入力（`AuthModal.tsx:145`）
追加するプロパティ:
```tsx
textContentType="oneTimeCode"    // iOS: メール / SMS から OTP を抽出して候補表示
autoComplete="sms-otp"           // Android: 同上
returnKeyType="done"
```
> **メモ:** お料理バスケットの Magic Link は **メール経由** の OTP だが、
> iOS の `oneTimeCode` は「メール本文中の OTP」も拾える（iOS 17+）。
> Android の `sms-otp` は SMS 限定なので効かない可能性があるが、
> 害は無いので両方付けておく。

### Phase 2: その他 `TextInput` の補完挙動を整える

#### `AddModal.tsx:101`（食材名 / 料理名）
- 食材名・料理名は機微情報ではないが、Android の Autofill Framework が
  「メール / 住所」と誤判定して候補を出すことがある。
- 追加:
  ```tsx
  autoComplete="off"
  importantForAutofill="no"      // Android: Autofill 対象から除外
  returnKeyType="done"
  ```
- 日本語の予測変換は OS デフォルト（`autoCorrect` 未指定 = true）で OK。

#### `IngredientsScreen.tsx:230`（料理名インライン編集）
- 同じく `autoComplete="off"` / `importantForAutofill="no"` / `returnKeyType="done"`。

#### `recipes.tsx:65` / `shared.tsx:69`（検索）
- 追加:
  ```tsx
  autoComplete="off"
  importantForAutofill="no"
  returnKeyType="search"
  clearButtonMode="while-editing"  // iOS のみ。空白化を 1 タップで
  ```
- 日本語の予測変換はそのまま活かす（`autoCorrect` には触らない）。

### Phase 3: 実機確認

Phase 1 / 2 のコード変更を 1 PR にまとめてもよいが、確認は分けた方が問題切り分けが楽。

1. **iOS 実機**（Expo Go ではメールアプリ連携が制限されることがあるので
   できれば Dev Client / TestFlight ビルド推奨）
   - email 欄: Keychain からメール候補が Quick Type バーに出るか
   - OTP 欄: テストアカウントで Magic Link を発行 → メール通知から
     OTP がワンタップ入力できるか
   - 食材追加ダイアログ: 連絡先メール等が候補として出ないか
2. **Android 実機**
   - email 欄: Google Password Manager のメール候補が出るか
   - OTP 欄: メール OTP の autofill は Android では限定的なので、
     最低でも候補が "邪魔をしない" ことを確認
   - 食材追加 / 検索: Autofill ヒントが出ないか

### 却下案

- **`SuggestionsList` を使った履歴サジェスト復活**:
  本 TODO のスコープ外。過去 commit `83ebd63` で意図的に外している
  （タップ範囲やモーダル UI の都合）。再導入するなら別タスクとして
  独立に検討する。
- **食材名フィールドにカスタム autocomplete API**:
  サーバ側に `GET /api/items/suggest` 等を作るのは過剰。OS 補完だけで
  日常入力は十分賄える。

## 影響範囲

### コード
- `mobile/src/components/auth/AuthModal.tsx` — 2 箇所の `TextInput`
- `mobile/src/components/shopping/AddModal.tsx` — 1 箇所
- `mobile/src/components/dishes/IngredientsScreen.tsx` — 1 箇所
- `mobile/app/(tabs)/recipes.tsx` — 1 箇所
- `mobile/app/(tabs)/shared.tsx` — 1 箇所

いずれも JSX 属性追加のみ。挙動分岐ロジックは追加しない。

### テスト
- 既存の Jest テスト（`mobile/__tests__/`）は `TextInput` を
  描画レベルでは検証していないため、`AuthModal` の `placeholder` /
  `value` を見るテストがあれば壊れない見込み。
- 念のため `npm test`（mobile）で全体回帰を確認。
- 入力補完は OS 機能なので **自動テストでは検証できない**。
  Phase 3 の実機確認が事実上のテスト。

### サーバ
- 影響なし。

## テスト方針

### 自動テスト
- `cd mobile && npm test` がパスすること。
- 新規テストは追加しない（OS 機能のため検証不能）。

### 手動確認（チェックリスト）
- [ ] iOS: ログイン画面でメール入力欄をタップ → Quick Type にメール候補
- [ ] iOS: メール OTP 受信通知から OTP 候補がコード欄上に出る
- [ ] iOS: 食材追加ダイアログで意図しないメール / 住所候補が出ない
- [ ] iOS: レシピ検索で「検索」キーが出る
- [ ] Android: メール欄で Google アカウント候補が出る
- [ ] Android: 食材追加・検索で `importantForAutofill="no"` が効いて
       Autofill ポップアップが出ない
- [ ] 既存のキーボード挙動（`autoFocus`、`onSubmitEditing` 等）に変化なし

## 非スコープ
- 過去にあった履歴ベースのサジェスト UI（`SuggestionsList.tsx`）の復活。
- パスキー / WebAuthn 連携（別 TODO「passkeys 認証対応」で扱う）。
- Web 版（`web/admin/*` 等）の入力補完。本タスクはモバイルアプリのみ。
- Magic Link メールテンプレートを iOS の OTP 検出フォーマットに最適化する作業
  （effect が大きい場合は別タスクで切る）。

## フェーズ

### Phase 1: AuthModal のオートフィル対応
- [ ] `AuthModal.tsx:115` に `textContentType` / `autoComplete` / `returnKeyType` を追加
- [ ] `AuthModal.tsx:145` に OTP 用プロパティを追加
- [ ] `cd mobile && npm test` パス確認

### Phase 2: その他入力欄のチューニング
- [ ] `AddModal.tsx:101` に `autoComplete="off"` / `importantForAutofill="no"` / `returnKeyType`
- [ ] `IngredientsScreen.tsx:230` に同上
- [ ] `recipes.tsx:65` / `shared.tsx:69` に検索用プロパティ
- [ ] `cd mobile && npm test` パス確認

### Phase 3: 実機確認
- [ ] iOS 実機（できれば Dev Client / TestFlight）でチェックリスト全項目
- [ ] Android 実機でチェックリスト全項目
- [ ] 問題なければ `TODO.md` の親項目を `DONE.md` に移動し、本プランを
      `docs/plans/archive/` に移動
