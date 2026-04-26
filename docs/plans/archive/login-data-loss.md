# ログインによる未ログインデータ消失の修正

## 目的・背景

ユーザー報告: **「ログインすると未ログインの時の食材と料理が消える。ログアウトしても食材と料理が戻らない」**

未ログイン状態で追加した食材・料理が、ログイン操作の直後に画面上から消える。
ログアウトしてローカルモードに戻っても、その消えたデータは復活しない。

### 根本原因

ログイン処理に **race condition** がある。

1. `AuthModal.tsx:75` で `await verify(email, code)` が呼ばれる
2. `auth-store.ts:72-79` の `verify()` が `isAuthenticated: true` をセット
3. その瞬間 `_layout.tsx:21-32` の effect が発火し、
   `useShoppingStore.getState().setMode('server')` を呼ぶ
4. `shopping-store.ts:97-100` の `setMode` は
   `set({ mode, items: [], dishes: [] })` でストア状態を **クリア**する
5. その直後 `AuthModal.tsx:83` で `runLoginMigration()` が呼ばれるが、
   `migration.ts:62-64` で読み出す `shopping.items` などは **既に空**
6. `runLoginMigration()` は「ローカルデータゼロ件」と判断し
   `switchStoresToServer()` だけ実行して終了 → ユーザーが入力したデータは
   サーバにも反映されないまま消滅する

加えて、Zustand `persist` の `partialize` が `server` モードでは
`items` / `dishes` / `savedRecipes` を保存対象から外す
(`shopping-store.ts:387-401`, `recipe-store.ts:154-167`)。
そのため AsyncStorage 上のデータも `setMode('server')` の直後に
上書きされ、復元できない。

ログアウト時は `auth-store.ts:34-41` の `resetLocalStores()` が
`clearLocalData()` → `setMode('local')` の順に呼ばれ、空配列が
AsyncStorage に書き戻される。よって「ログアウトしても戻らない」状態になる。

#### タイミングの補足

`runLoginMigration()` 冒頭で `localItems`/`localDishes`/`localSavedRecipes` は
const にキャプチャされる (`migration.ts:62-64`)。effect の発火が
このキャプチャより遅れた場合、migrate API には正しいデータが渡る経路もある。
ただし、いずれの場合も `setMode('server')` 直後の partialize が AsyncStorage を
空で上書きするため、**「キャンセル経路で復元できない」のは確定的に再現する**。
「常にデータが消える」のではなく「最悪ケースで migrate もスキップされ、
最良ケースでも AsyncStorage は不可逆に空になる」と整理する。

#### 代替案の検討と却下

「verify 前にローカルデータを const にスナップショットしてから verify を呼ぶ」
だけでも migrate 経路は救える。しかし「キャンセル時の AsyncStorage 上書き」
は防げないため、ユーザー報告の「ログアウトしても戻らない」は解消しない。
race そのものを断ち切る本プランの方針を採用する。

## 対応方針

`verify()` → `_layout.tsx` の自動 mode 切替 → migrate という
**暗黙の順序**を断ち切り、ログイン確定の直前まで `local` モードを維持する。

### 全体フロー（修正後）

```
[未ログイン: mode='local', ローカルにデータあり]
    ↓ ユーザーがコード入力 → AuthModal.handleVerify()
    ↓
[verify(email, code)]
  - token を保存
  - email / userId を保持
  - ★ isAuthenticated は false のまま ★
  - ★ mode は 'local' のまま ★
    ↓
[runLoginMigration()]
  - local モードのまま items/dishes/savedRecipes を読む  → 正しく取得できる
  - ユーザーに 移す / 破棄 / キャンセル を問う
  - 「移す」: migrate API を呼ぶ（token は既に保存済みなので認証は通る）
  - 「破棄」: 確認後ローカルデータ破棄
  - 「キャンセル」: 何もしない
    ↓
  ┌── 移す / 破棄 ──┐                  ┌── キャンセル ──┐
  ↓                                        ↓
[finishLogin()]                          [cancelLogin()]
  - setMode('server')                       - removeToken()
  - loadAll() / loadSavedRecipes()          - email/userId をクリア
  - loadQuota()                             - ★ ローカルデータは保持 ★
  - isAuthenticated = true                  - mode='local' のまま
  - 認証モーダルを閉じる
```

### 設計の中心

1. **`verify()` は `isAuthenticated: true` をセットしない**。
   token 保存と内部 state（pending email）の保持のみ。
   ※ `verifyCode` API は `{ token, email }` しか返さないため、
   `userId` の取得は `finishLogin()` で `getMe()` を呼んで埋める。
2. **`finishLogin()` を mode 切替の正規ルートにする**。
   migration 成功後に明示的に
   `getMe()` → `setMode('server')` → `loadAll` / `loadSavedRecipes` /
   `loadQuota` → `isAuthenticated = true` の順で進める。
   非同期処理を含むため戻り型は `Promise<void>`。
3. **`cancelLogin()` はローカルデータに手を付けない**。
   token を消し、認証フラグを倒すだけ。
4. **`_layout.tsx` の effect は「アプリ起動時のセッション復元」専用**にする。
   ログイン操作で発火する経路は AuthModal フローに一本化し、
   effect は `useRef` で初回判定し起動時に 1 回だけ mode を同期する
   （StrictMode/再マウント耐性、`checkAuth` 再呼び出しでの誤発火を避けるため
   `isLoading` 依存を絞るより `useRef` 方式を採る）。
5. **`logout()` で `loadQuota()` を明示的に呼ぶ**。
   現状は `_layout.tsx` の effect が `isAuthenticated: true → false` で
   `loadQuota()` を再実行しゲスト枠を取り直しているが、effect を起動時専用に
   絞るとログアウト時に AI 残量表示が古いまま残る。`logout()` 側で補う。

### 影響範囲

- `mobile/src/stores/auth-store.ts` — `verify` / `finishLogin` / `cancelLogin` / `logout`
- `mobile/src/components/auth/AuthModal.tsx` — `handleVerify` の手順整理
- `mobile/src/utils/migration.ts` — `switchStoresToServer` の責務再確認
  （成功/破棄でサーバモードへ切り替え、キャンセルではそのまま、を維持）
- `mobile/app/_layout.tsx` — auth state 同期 effect を起動時専用に絞る
- `mobile/__tests__/stores/auth-store.test.ts` — 新フローのテスト追加

直接変更しないが挙動を確認するもの:
- `shopping-store.ts` の `setMode` / `partialize` （現行の挙動を維持しつつ、
  呼ばれるタイミングが変わることで race が解消する）
- `recipe-store.ts` 同上

### テスト方針

#### 単体テスト（Jest）
- `auth-store.test.ts`
  - **既存 line 73-78 のテスト（verify 直後に isAuthenticated=true を期待）
    を書き換える**。新しい挙動に合わせ「verify 直後は isAuthenticated=false」
    を assertion する
  - `verify()` 完了直後は `isAuthenticated === false` のまま
  - `verify()` 後でも `useShoppingStore.getState().mode === 'local'` を維持
  - `verify()` 後に `useShoppingStore.getState().items` が保持される
  - `finishLogin()` 呼び出しで `getMe()` が呼ばれ `userId` が埋まる
  - `finishLogin()` 呼び出しで初めて `isAuthenticated === true` になる
  - `finishLogin()` 内で `setMode('server')` と `loadAll` が呼ばれる
  - `finishLogin()` 内で `loadAll` が reject した場合でも token は保持される
    （isAuthenticated は true のまま、Toast 用の状態だけ立てる想定）
  - `cancelLogin()` で token は消えるが `useShoppingStore.getState().items`
    が保持される
  - `logout()` で `clearLocalData` + `setMode('local')` + `loadQuota` が
    呼ばれる
- AuthModal 結合テスト（新規）
  - `handleVerify` を駆動し、migration 経路ごと（migrated / discarded /
    cancelled）の最終状態（`mode`, `items`, `isAuthenticated`, token 有無）
    を検証する。stores 間の race を検出する数少ない手段

#### 手動確認シナリオ

1. **「移す」経路の幸せパス**
   - 未ログインで食材2個・料理1個・AI 具材+レシピを生成
   - ログイン → 「移す」を選択
   - サーバに反映され、画面にも引き続き表示されること
2. **「破棄」経路**
   - 同じく未ログインデータを用意 → 「破棄」を選択 → 確認ダイアログで OK
   - 画面が空になり、AsyncStorage 上のローカルデータも空になっていること
3. **「キャンセル」経路**
   - 未ログインデータを用意 → 認証コード入力 → 「キャンセル」を選択
   - 未ログイン状態へ戻り、ローカルデータがそのまま残っていること
4. **既存ログイン状態でアプリ再起動**
   - token 保存済みの状態でアプリを起動 → サーバデータがロードされること
   - `_layout.tsx` の起動時 effect が正しく動くことを確認
5. **ログアウト後の再ログイン**
   - 1 で移行したデータがサーバ側に残っており、再ログインで復元されること
6. **ローカルデータ無しでのログイン**
   - 全て空の状態でログインしても何もエラーが出ないこと
   - 移行ダイアログが表示されず、そのまま finishLogin に進むこと

## Phase 構成

### Phase 1: auth-store の責務再構成
- `verify()` から `set({ isAuthenticated: true, ... })` を外す
  - token 保存 + 内部 state に `pendingEmail` を保持するだけにする
  - `userId` は verify では埋まらない（API 仕様）
- `AuthState` インターフェースの `finishLogin: () => void` を
  `finishLogin: () => Promise<void>` に変更する
- `finishLogin()` を以下の順序で再実装:
  1. `const me = await getMe()` で `userId` / `email` を取得
  2. `useShoppingStore.getState().setMode('server')`
  3. `useRecipeStore.getState().setMode('server')`
  4. `await Promise.all([shopping.loadAll(), recipe.loadSavedRecipes()])`
  5. `await useAiStore.getState().loadQuota()`
  6. `set({ isAuthenticated: true, email: me.email, userId: me.userId,
     authModalVisible: false, ... })`
  7. `authModalOnSuccess` を呼ぶ
- `loadAll` / `loadSavedRecipes` が失敗した場合の方針:
  - migrate API は既に成功しているため token は保持する
  - `set({ isAuthenticated: true, ... })` まで進めたうえで Toast で
    「データの読み込みに失敗しました。引き下げて再試行してください」を出す
  - cancelLogin に倒さない（ユーザーから見ると「ログイン失敗 → 次回見たら
    データがある」という不思議な体験になるため）
- `cancelLogin()` から「ローカルデータに触れる」処理を取り除き、
  `removeToken()` + auth state リセットだけにする
- `logout()` の挙動更新:
  - 既存の `removeToken()` + `resetLocalStores()` に加え、
    `useAiStore.getState().loadQuota()` を呼んでゲスト枠を取り直す
  - `_layout.tsx` の effect が再発火しなくなるため、ここで明示的に補う

### Phase 2: _layout.tsx の effect を起動専用に絞る
- 既存の `useEffect(..., [isAuthenticated, isLoading])` を、
  **`useRef` で「起動時に 1 回だけ実行」する形に変更**する
  （`isLoading` のみ依存に絞る方式は `checkAuth` 再呼び出しや
  StrictMode の二重実行で誤発火するため、`useRef` 方式を採る）
- 起動時に `isAuthenticated === true` だった場合は
  `setMode('server')` + `loadAll` + `loadSavedRecipes` + `loadQuota` を実行
- 起動時に `isAuthenticated === false` だった場合は
  `setMode('local')` + `loadQuota` を実行
- ログイン/ログアウト操作で再発火しないようにする
  （`auth-store` 側で明示的に処理するため不要）

### Phase 3: AuthModal と migration.ts の確認・微調整
- `AuthModal.tsx:69-96` の `handleVerify` の流れを再確認:
  ```
  await verify(email, code);            // token 保存のみ
  const result = await runLoginMigration();
  if (result === 'cancelled') await cancelLogin();
  else await finishLogin();             // ★ Promise<void> に変わるので await
  ```
  `finishLogin()` の戻り型変更に伴い、呼び出し側を `await` に揃える。
  手順コメントを追加。
- **`migration.ts` の `switchStoresToServer()` は削除する**（決定）。
  - サーバモードへの遷移は `finishLogin()` に集約し、責務を一元化する
  - `runLoginMigration()` は戻り値で結果を返すだけにし、
    mode 切替の判断は呼び出し側（AuthModal → finishLogin）で行う
  - migration 内の `await switchStoresToServer()` を全て削除
- `runLoginMigration()` 自体は「ローカルデータの読み出しと API 呼び出し」
  だけにする。

### Phase 4: テストと実機確認
- `mobile/__tests__/stores/auth-store.test.ts` を更新（新規追加）
  - 既存の auth-store テストがあれば適宜書き換え
  - shopping-store / recipe-store のモック方針を確認
- 実機（Expo Go）で前述の手動シナリオ 1〜6 を確認
- `npm test` (mobile) と `npm test` (server) が通ることを確認
- 必要なら `docs/plans/testing.md` の関連箇所を更新

### Phase 5: ログアウトでローカル表示が消える問題の修正

Phase 4 の実機確認で発見:「移す」経路でログイン → ログアウトすると、未ログイン時に
追加し migrate でサーバ側に移したはずの食材・料理が画面から消える。原因は `logout()` →
`resetLocalStores()` が `clearLocalData()` を呼んで items/dishes/savedRecipes を空にしていること。
ユーザー視点では「画面に出ていたものが急に消える」体験になる。

#### 対応方針（option A）
- `resetLocalStores()` から `clearLocalData()` 呼び出しを外す
- `setMode('local')` 自体も `set({ mode, items: [], dishes: [] })` でクリアするので、
  代わりに `useShoppingStore.setState({ mode: 'local' })` / `useRecipeStore.setState({ mode: 'local' })`
  と直接 setState で mode だけ書き換える
- 結果: ログアウト後も items/dishes/savedRecipes は画面に残る（持っているのはサーバ ID だが、
  local モードの操作はすべて id 一致で in-memory に書くので動作する）
- `partialize` は local モードで items/dishes/savedRecipes を AsyncStorage に永続化するので、
  アプリ再起動後も残る

#### 既知のトレードオフ
- ログアウト後のデータを「移す」で再ログインすると、サーバに重複登録される可能性がある
  （local 側のサーバ ID が migrate の `localId` として渡るため）。発生頻度は低いと判断し、
  必要になったら option B（サーバ ID をローカル ID に振り直す）に切り替える

#### 影響範囲
- `mobile/src/stores/auth-store.ts` — `resetLocalStores()` の中身
- `mobile/__tests__/stores/auth-store.test.ts` — logout テストで items/savedRecipes が保持される
  ことを assert するように書き換え

## 注意点・リスク

- `verify()` の戻り値や副作用を変えるため、他に呼んでいる箇所がないか
  grep で確認する（現状 `AuthModal.tsx` のみのはず）。
- `_layout.tsx` の effect を 1 回だけ実行する形に変えると、
  「他経路で `isAuthenticated` が書き換わったとき」に追従しなくなる。
  ただし現状そのような経路は `verify()` / `cancelLogin()` / `logout()`
  しかなく、すべて auth-store 側で完結させるので問題なし。
- migrate API は `requireAuth` ミドルウェアで保護されており、
  `verify()` で token を保存した直後なら認証ヘッダが付く。
  api クライアント (`mobile/src/api/client.ts:11-23`) が token を
  リクエストごとに `getToken()` で読み出す実装であることを確認済み。
- 既存の `shopping-store` の `partialize` の挙動（server モードでは
  items/dishes を保存しない）はそのまま残す。これは「サーバが
  source of truth、ローカルは UI cache」という設計を維持するため。
- **未マイグレートデータの起動時消失リスク**（スコープ外）:
  `verify()` 成功 → `finishLogin()` 前にアプリがクラッシュした場合、
  token は SecureStore に残るが未マイグレートのローカルデータも残る。
  次回起動時 `checkAuth` 成功 → effect が `setMode('server')` を呼ぶと
  ローカルデータが AsyncStorage から消える。発生確率は低いため本プランの
  スコープ外とし、別途「未マイグレートフラグを persist する」等で
  救済するかは将来検討。
