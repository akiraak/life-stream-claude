# React Native モバイルアプリ実装プラン

## Context

お料理バスケット PWA を React Native (Expo) で iPhone/Android ネイティブアプリ化する。
既存バックエンド API (`basket.chobi.me`) はそのまま利用し、サーバ変更不要。
管理画面に技術選定・設計ドキュメントは作成済み。本プランはコード実装の具体的手順。

---

## 技術スタック

| 項目 | 選定 |
|------|------|
| Framework | Expo SDK 52+ (Managed Workflow) |
| Language | TypeScript |
| Routing | Expo Router v4 (file-based) |
| State | Zustand |
| HTTP | Axios + JWT interceptor |
| Token保存 | expo-secure-store |
| D&D | react-native-draggable-flatlist |
| Haptics | expo-haptics |
| テーマ | ダーク / ライト 両対応（OS設定に追従） |

---

## ディレクトリ構成

```
mobile/
├── app/
│   ├── _layout.tsx              # Root layout (認証ゲート)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx            # メール入力
│   │   └── verify-code.tsx      # OTPコード入力
│   └── (tabs)/
│       ├── _layout.tsx          # タブナビゲーション
│       ├── index.tsx            # 買い物リスト（メイン）
│       ├── recipes.tsx          # 自分のレシピ
│       └── shared.tsx           # みんなのレシピ
├── src/
│   ├── api/
│   │   ├── client.ts            # Axios + JWT interceptor
│   │   ├── auth.ts
│   │   ├── shopping.ts
│   │   ├── dishes.ts
│   │   └── saved-recipes.ts
│   ├── stores/
│   │   ├── auth-store.ts
│   │   ├── shopping-store.ts
│   │   └── recipe-store.ts
│   ├── types/
│   │   ├── api.ts               # ApiResponse<T>, レスポンス型
│   │   └── models.ts            # ShoppingItem, Dish, Recipe 等
│   ├── components/
│   │   ├── ui/                  # Button, Input, Modal, Toast, Chip, ConfirmDialog
│   │   ├── shopping/            # DishGroup, ShoppingItem, AddItemModal, AddDishModal, SuggestionsList
│   │   ├── dishes/              # IngredientsScreen, RecipeCard, HighlightedText
│   │   └── recipes/             # RecipeList, RecipeSearchBar
│   ├── theme/
│   │   ├── colors.ts            # ダーク/ライト両テーマの色定数
│   │   └── theme-provider.tsx   # OS設定に追従するテーマContext
│   ├── hooks/
│   │   └── use-debounce.ts
│   └── utils/
│       └── token.ts             # SecureStore ラッパー
├── assets/                      # アイコン、スプラッシュ
└── app.json
```

---

## Phase 1: プロジェクト初期化 & 認証 (2-3日)

### 1.1 Expo プロジェクト作成
```bash
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install expo-router expo-linking expo-constants expo-status-bar
npx expo install expo-secure-store axios zustand
npx expo install react-native-safe-area-context react-native-screens
npx expo install expo-haptics
```

### 1.2 テーマ定数 (`src/theme/`)

#### colors.ts
ダーク・ライト両テーマの色定数を定義:

```ts
const dark = {
  background: '#1c1c1c',
  surface: '#242424',
  surfaceHover: '#2a2a2a',
  border: '#444',
  primary: '#f97316',
  primaryLight: '#fb923c',
  text: '#d4d4d4',
  textMuted: '#888',
  checked: '#555',
  danger: '#ef4444',
};

const light = {
  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceHover: '#f0f0f0',
  border: '#ddd',
  primary: '#f97316',
  primaryLight: '#fb923c',
  text: '#1a1a1a',
  textMuted: '#666',
  checked: '#aaa',
  danger: '#dc2626',
};
```

#### theme-provider.tsx
- `useColorScheme()` で OS のダーク/ライト設定を取得
- React Context でテーマカラーをアプリ全体に配信
- OS 設定変更時にリアルタイムで切り替え

```ts
import { useColorScheme } from 'react-native';

export function useThemeColors() {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}
```

### 1.3 API クライアント (`src/api/client.ts`)
- Axios インスタンス (`baseURL: https://basket.chobi.me`)
- Request interceptor: SecureStore から JWT 取得 → `Authorization: Bearer` ヘッダ付与
- Response interceptor: 401 → トークン削除 → ログアウト

### 1.4 トークン管理 (`src/utils/token.ts`)
- `getToken()`, `setToken()`, `removeToken()` — expo-secure-store ラッパー

### 1.5 Auth Store (`src/stores/auth-store.ts`)
- `login(email)` → `POST /api/auth/login`
- `verifyCode(code)` → `POST /api/auth/verify-code` → JWT保存
- `checkAuth()` → `GET /api/auth/me`
- `logout()` → トークン削除

### 1.6 認証画面
- **login.tsx**: メール入力、「ログインコードを送信」ボタン
- **verify-code.tsx**: 6桁OTP入力、「ログイン」ボタン、「別のメールアドレスで試す」リンク
- **_layout.tsx (root)**: 認証状態で (auth) / (tabs) を切り替え

### 1.7 Google/Apple Sign-In
- 初期リリースでは Magic Link OTP のみ実装
- Google/Apple Sign-In は Phase 7 で追加（Apple Sign-In にはサーバ側エンドポイント追加が必要）

---

## Phase 2: API関数 & 型定義 (1-2日)

### 2.1 型定義 (`src/types/`)
サーバのデータモデルを完全に再現:
- `ApiResponse<T>` — `{ success, data, error }`
- `ShoppingItem` — id, name, category, checked, dish_id, position
- `Dish` — id, name, ingredients_json, recipes_json, items[]
- `Ingredient`, `Recipe`, `SuggestIngredientsResponse`
- `SavedRecipe`, `RecipeState`, `Suggestion`

参照: `server/src/services/dish-service.ts`, `server/src/services/shopping-service.ts`

### 2.2 API関数 (`src/api/`)
各エンドポイントに対応する関数を作成。レスポンスを `ApiResponse<T>` でアンラップし、`!success` 時は throw。

### 2.3 Shopping Store (`src/stores/shopping-store.ts`)
- `items[]`, `dishes[]`, `ingredientsCache` (Map)
- `loadAll()`, `addItem()`, `toggleCheck()`, `deleteItem()`
- `addDish()`, `deleteDish()`, `suggestIngredients()`
- `reorderDishes()`, `reorderDishItems()`

### 2.4 Recipe Store (`src/stores/recipe-store.ts`)
- `savedRecipes[]`, `sharedRecipes[]`
- `loadSavedRecipes()`, `loadSharedRecipes()`, `toggleLike()`

---

## Phase 3: 買い物リスト画面 (3-4日)

### 3.1 タブナビゲーション (`app/(tabs)/_layout.tsx`)
- 買い物リスト / 自分のレシピ / みんなのレシピ
- Tab bar: bg `surface`, active `primaryLight`, inactive テーマに応じた `textMuted`

### 3.2 メイン画面 (`app/(tabs)/index.tsx`)
- ScrollView: 料理グループ → 未分類アイテム の順
- FAB 2つ (料理追加 / アイテム追加)
- Pull to refresh

### 3.3 コンポーネント
- **DishGroup**: 左ボーダーオレンジ、料理名、+ボタン、×ボタン、アイテムリスト
- **ShoppingItem**: 丸チェックボックス、アイテム名、スワイプ削除
- **AddItemModal**: テキスト入力 + サジェスト + 料理選択
- **AddDishModal**: テキスト入力 + サジェスト
- **SuggestionsList**: デバウンスAPI呼び出し、頻度表示
- **ConfirmDialog**: 削除確認ダイアログ
- **Toast**: 上部中央、3秒で自動消去

---

## Phase 4: AI具材提案 & レシピ表示 (3-4日)

### 4.1 IngredientsScreen (フルスクリーンモーダル)
- ローディング状態: スピナー + 「具材を検索中...」
- 具材チップ: タップで買い物リストに追加/削除
  - 未選択: border `rgba(251,146,60,0.3)`, bg `surfaceHover`
  - 選択済: bg `primary`, text白(ダーク)/text白(ライト)
- 追加素材セクション: 手動追加分を破線チップで表示
- 「この素材でレシピを再検索」ボタン
- レシピカード×3

### 4.2 RecipeCard
- タイトル + いいねボタン (ハート)
- サマリ（具材ハイライト付き）
- 「＋リストに追加」ボタン
- 展開式ステップ表示

### 4.3 HighlightedText
- RN には innerHTML がないため Text ネストで実装
- 具材名を長い順にソート → 正規表現で分割 → タップ可能なハイライトSpan
- 未追加: `color textMuted`, 破線下線
- 追加済: `color primaryLight`

### 4.4 料理名編集
- ヘッダの料理名タップ → インライン TextInput → API更新 → キャッシュクリア

---

## Phase 5: レシピブック (1-2日)

### 5.1 自分のレシピ (`app/(tabs)/recipes.tsx`)
- `GET /api/saved-recipes` → `liked === 1` でフィルタ
- 検索バー (クライアントサイド: title, dish_name, summary, steps)
- FlatList + 無限スクロール (20件/ページ)

### 5.2 みんなのレシピ (`app/(tabs)/shared.tsx`)
- `GET /api/saved-recipes/shared`
- 同様のレイアウト

### 5.3 レシピからリストに追加
- 料理を新規作成 → レシピの具材をアイテムとして追加 → 料理にリンク

---

## Phase 6: ポリッシュ (2-3日)

### 6.1 ドラッグ & ドロップ
```bash
npx expo install react-native-draggable-flatlist react-native-gesture-handler react-native-reanimated
```
- 料理グループの並び替え (長押し)
- 料理内アイテムの並び替え (長押し)
- 料理間移動はアイテム編集モーダルの料理ピッカーで対応（クロスリストD&Dは複雑すぎるため）

### 6.2 アニメーション (react-native-reanimated)
- チェック: 右スライド + フェードアウト (300ms)
- 削除: スケール0 (300ms)
- モーダル: フェード + スライドアップ

### 6.3 Haptic フィードバック
- チェックボックス: Light impact
- ドラッグ開始: Medium impact
- アイテム追加: Success
- 削除確認: Warning

### 6.4 その他
- Pull to refresh
- KeyboardAvoidingView
- エラーハンドリング (ネットワークエラー、API エラー)
- アプリアイコン (`icon.png` 流用)、スプラッシュスクリーン
- Portrait ロック

---

## app.json 設定

```json
{
  "expo": {
    "name": "お料理バスケット",
    "slug": "cooking-basket",
    "scheme": "cooking-basket",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": { "backgroundColor": "#1c1c1c" },
    "userInterfaceStyle": "automatic",
    "ios": {
      "bundleIdentifier": "me.chobi.basket",
      "supportsTablet": false,
      "userInterfaceStyle": "automatic"
    },
    "android": {
      "package": "me.chobi.basket",
      "adaptiveIcon": { "backgroundColor": "#1c1c1c" },
      "userInterfaceStyle": "automatic"
    }
  }
}
```

---

## 参照すべき既存ファイル

| ファイル | 用途 |
|---------|------|
| `web/app.js` | 全クライアントロジックの参照実装 |
| `web/style.css` | 色・スペーシング・アニメーション仕様 |
| `server/src/routes/dishes.ts` | AI具材API の契約 |
| `server/src/services/dish-service.ts` | Dish データモデル |
| `server/src/services/shopping-service.ts` | ShoppingItem データモデル |
| `server/src/middleware/auth.ts` | 認証ミドルウェア (Bearer token) |
| `icon.png` | アプリアイコン素材 |

---

## 検証方法

各フェーズ完了時:
1. `npx expo start` でアプリ起動
2. Expo Go (または Dev Client) で実機/シミュレータ確認
3. 全API連携の動作確認 (ログイン → リスト操作 → AI具材 → レシピ)
4. Web版と同じデータがリアルタイムで同期されることを確認

---

## 見積り

| Phase | 内容 | 期間 |
|-------|------|------|
| 1 | 初期化 & 認証 | 2-3日 |
| 2 | API & State | 1-2日 |
| 3 | 買い物リスト | 3-4日 |
| 4 | AI具材 & レシピ | 3-4日 |
| 5 | レシピブック | 1-2日 |
| 6 | ポリッシュ | 2-3日 |
| **合計** | | **12-18日** |
