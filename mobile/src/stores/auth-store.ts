import { Alert } from 'react-native';
import { create } from 'zustand';
import { requestLogin as apiRequestMagicCode, verifyCode, getMe } from '../api/auth';
import { getToken, setToken, removeToken } from '../utils/token';
import { useShoppingStore } from './shopping-store';
import { useRecipeStore } from './recipe-store';
import { useAiStore } from './ai-store';

interface RequestLoginOptions {
  reason?: string | null;
  onSuccess?: (() => void) | null;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  email: string | null;
  userId: number | null;
  // verify 直後〜finishLogin 完了までの一時的なメール保持。
  // isAuthenticated を立てる前にローカルデータの移行可否をユーザに問うため、
  // この間 email / userId は意図的に空のままにする。
  pendingEmail: string | null;

  authModalVisible: boolean;
  authModalReason: string | null;
  authModalOnSuccess: (() => void) | null;

  checkAuth: () => Promise<void>;
  sendMagicCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<void>;
  finishLogin: () => Promise<void>;
  cancelLogin: () => Promise<void>;
  logout: () => Promise<void>;

  requestLogin: (options?: RequestLoginOptions) => void;
  closeAuthModal: () => void;
}

function resetLocalStores() {
  // ログアウト後も画面に出ていた食材・料理・レシピを残す。
  // setMode('local') 経由だと items/dishes/savedRecipes が空配列でクリアされ、
  // ユーザーから「ログアウトで急にデータが消えた」体験になるため、
  // setState で mode だけ書き換える。
  // 持っているのはサーバ ID だが、local モードの操作は全て id 一致で in-memory に書くので動作する。
  useShoppingStore.setState({ mode: 'local' });
  useRecipeStore.setState({ mode: 'local' });
  // ユーザー枠の残量を引き継がず、後段の loadQuota でゲスト枠を取り直す
  useAiStore.getState().reset();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  email: null,
  userId: null,
  pendingEmail: null,

  authModalVisible: false,
  authModalReason: null,
  authModalOnSuccess: null,

  checkAuth: async () => {
    try {
      const token = await getToken();
      if (!token) {
        set({ isAuthenticated: false, isLoading: false });
        return;
      }
      const user = await getMe();
      set({ isAuthenticated: true, email: user.email, userId: user.userId, isLoading: false });
    } catch {
      await removeToken();
      set({ isAuthenticated: false, email: null, userId: null, isLoading: false });
    }
  },

  sendMagicCode: async (email: string) => {
    await apiRequestMagicCode(email);
  },

  // token を保存して pendingEmail に控えるだけ。isAuthenticated は立てない。
  // ここで isAuthenticated=true にすると _layout の effect が setMode('server') を呼んで
  // ローカルデータを空配列で潰してしまうため、認証フラグの反転は finishLogin に集約する。
  verify: async (email: string, code: string) => {
    const result = await verifyCode(email, code);
    await setToken(result.token);
    set({ pendingEmail: result.email });
  },

  // 移行/破棄が確定した後に呼ばれ、サーバモードへの切替・データロード・認証フラグ反転を一括で行う。
  // verifyCode の戻り値には userId が含まれないため、ここで getMe() を呼んで補う。
  finishLogin: async () => {
    const me = await getMe();
    useShoppingStore.getState().setMode('server');
    useRecipeStore.getState().setMode('server');
    try {
      await Promise.all([
        useShoppingStore.getState().loadAll(),
        useRecipeStore.getState().loadSavedRecipes(),
      ]);
      await useAiStore.getState().loadQuota();
    } catch (e: unknown) {
      // migrate API は既に成功しているのでログイン自体はロールバックしない。
      // ユーザーが下に引いて再試行できる旨だけ伝える。
      const message = e instanceof Error ? e.message : 'データの読み込みに失敗しました';
      Alert.alert('エラー', `${message}\n下に引いて再試行してください`);
    }
    const onSuccess = get().authModalOnSuccess;
    set({
      isAuthenticated: true,
      email: me.email,
      userId: me.userId,
      pendingEmail: null,
      authModalVisible: false,
      authModalReason: null,
      authModalOnSuccess: null,
    });
    if (onSuccess) onSuccess();
  },

  // ローカルデータには触れない。token を消して認証フラグを倒すだけ。
  cancelLogin: async () => {
    await removeToken();
    set({
      isAuthenticated: false,
      email: null,
      userId: null,
      pendingEmail: null,
      authModalVisible: false,
      authModalReason: null,
      authModalOnSuccess: null,
    });
  },

  logout: async () => {
    await removeToken();
    resetLocalStores();
    set({ isAuthenticated: false, email: null, userId: null, pendingEmail: null });
    // _layout の effect を起動時専用に絞った後でも AI 残量がゲスト枠に切り替わるよう、ここで明示的に取り直す。
    await useAiStore.getState().loadQuota();
  },

  requestLogin: (options) => {
    set({
      authModalVisible: true,
      authModalReason: options?.reason ?? null,
      authModalOnSuccess: options?.onSuccess ?? null,
    });
  },

  closeAuthModal: () => {
    set({
      authModalVisible: false,
      authModalReason: null,
      authModalOnSuccess: null,
    });
  },
}));
