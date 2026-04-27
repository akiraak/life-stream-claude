jest.mock('../../src/api/auth', () => ({
  requestLogin: jest.fn(),
  verifyCode: jest.fn(),
  getMe: jest.fn(),
}));

jest.mock('../../src/api/shopping', () => ({
  getAllItems: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  deleteCheckedItems: jest.fn(),
  reorderItems: jest.fn(),
}));

jest.mock('../../src/api/dishes', () => ({
  getAllDishes: jest.fn(),
  createDish: jest.fn(),
  updateDish: jest.fn(),
  deleteDish: jest.fn(),
  updateDishAiCache: jest.fn(),
  linkItemToDish: jest.fn(),
  unlinkItemFromDish: jest.fn(),
  reorderDishes: jest.fn(),
  reorderDishItems: jest.fn(),
}));

jest.mock('../../src/api/saved-recipes', () => ({
  getSavedRecipes: jest.fn(),
  deleteSavedRecipe: jest.fn(),
  createSavedRecipesBulk: jest.fn(),
}));

jest.mock('../../src/api/ai', () => {
  class AiQuotaError extends Error {
    remaining = 0;
    resetAt: string | null;
    constructor(resetAt: string | null = null) {
      super('ai_quota_exceeded');
      this.name = 'AiQuotaError';
      this.resetAt = resetAt;
    }
  }
  return {
    suggestAi: jest.fn(),
    getAiQuota: jest.fn(),
    AiQuotaError,
  };
});

import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as authApi from '../../src/api/auth';
import * as shoppingApi from '../../src/api/shopping';
import * as dishesApi from '../../src/api/dishes';
import * as savedRecipesApi from '../../src/api/saved-recipes';
import * as aiApi from '../../src/api/ai';
import { useAuthStore } from '../../src/stores/auth-store';
import { useShoppingStore } from '../../src/stores/shopping-store';
import { useRecipeStore } from '../../src/stores/recipe-store';
import { useAiStore } from '../../src/stores/ai-store';

const auth = authApi as jest.Mocked<typeof authApi>;
const shopping = shoppingApi as jest.Mocked<typeof shoppingApi>;
const dishes = dishesApi as jest.Mocked<typeof dishesApi>;
const savedRecipes = savedRecipesApi as jest.Mocked<typeof savedRecipesApi>;
const ai = aiApi as jest.Mocked<typeof aiApi>;
const secure = SecureStore as jest.Mocked<typeof SecureStore> & { __reset: () => void };

const TOKEN_KEY = 'auth_token';

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  secure.__reset();
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: true,
    email: null,
    userId: null,
    pendingEmail: null,
    authModalVisible: false,
    authModalReason: null,
    authModalOnSuccess: null,
  });
  useShoppingStore.setState({
    mode: 'local',
    items: [],
    dishes: [],
    loading: false,
    nextLocalId: -1,
  });
  useRecipeStore.setState({
    mode: 'local',
    savedRecipes: [],
    loading: false,
    nextLocalId: -1,
  });
  useAiStore.setState({
    remaining: null,
    quotaExceeded: false,
    resetAt: null,
  });
});

describe('auth-store', () => {
  describe('sendMagicCode', () => {
    it('calls the auth API and does not flip isAuthenticated', async () => {
      auth.requestLogin.mockResolvedValue({ message: 'sent' });

      await useAuthStore.getState().sendMagicCode('user@example.com');

      expect(auth.requestLogin).toHaveBeenCalledWith('user@example.com');
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('verify', () => {
    it('persists token but leaves isAuthenticated false and keeps mode=local', async () => {
      auth.verifyCode.mockResolvedValue({ token: 'jwt-token', email: 'user@example.com' });
      const onSuccess = jest.fn();
      useShoppingStore.setState({
        mode: 'local',
        items: [
          {
            id: -1,
            name: 'にんじん',
            category: '',
            checked: 0,
            dish_id: null,
            position: 0,
            created_at: '',
            updated_at: '',
          },
        ],
        dishes: [],
      });
      useAuthStore.setState({
        authModalVisible: true,
        authModalReason: 'AI 回数を増やす',
        authModalOnSuccess: onSuccess,
      });

      await useAuthStore.getState().verify('user@example.com', '123456');

      expect(auth.verifyCode).toHaveBeenCalledWith('user@example.com', '123456');
      expect(secure.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, 'jwt-token');
      const state = useAuthStore.getState();
      // race condition 防止: verify では isAuthenticated を立てない
      expect(state.isAuthenticated).toBe(false);
      expect(state.email).toBeNull();
      expect(state.userId).toBeNull();
      expect(state.pendingEmail).toBe('user@example.com');
      // モーダルや onSuccess は finishLogin まで保持
      expect(state.authModalVisible).toBe(true);
      expect(state.authModalOnSuccess).toBe(onSuccess);
      expect(onSuccess).not.toHaveBeenCalled();
      // ローカルストアはそのまま
      expect(useShoppingStore.getState().mode).toBe('local');
      expect(useShoppingStore.getState().items).toHaveLength(1);
    });
  });

  describe('finishLogin', () => {
    it('hydrates user via getMe, switches stores to server, loads data, and flips isAuthenticated', async () => {
      auth.getMe.mockResolvedValue({ userId: 7, email: 'user@example.com' });
      shopping.getAllItems.mockResolvedValue([]);
      dishes.getAllDishes.mockResolvedValue([]);
      savedRecipes.getSavedRecipes.mockResolvedValue([]);
      ai.getAiQuota.mockResolvedValue({ remaining: 5, limit: 10, resetAt: null });

      const onSuccess = jest.fn();
      useAuthStore.setState({
        pendingEmail: 'user@example.com',
        authModalVisible: true,
        authModalReason: 'reason',
        authModalOnSuccess: onSuccess,
      });

      await useAuthStore.getState().finishLogin();

      expect(auth.getMe).toHaveBeenCalled();
      expect(shopping.getAllItems).toHaveBeenCalled();
      expect(dishes.getAllDishes).toHaveBeenCalled();
      expect(savedRecipes.getSavedRecipes).toHaveBeenCalled();
      expect(ai.getAiQuota).toHaveBeenCalled();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.email).toBe('user@example.com');
      expect(state.userId).toBe(7);
      expect(state.pendingEmail).toBeNull();
      expect(state.authModalVisible).toBe(false);
      expect(state.authModalReason).toBeNull();
      expect(state.authModalOnSuccess).toBeNull();
      expect(useShoppingStore.getState().mode).toBe('server');
      expect(useRecipeStore.getState().mode).toBe('server');
      expect(useAiStore.getState().remaining).toBe(5);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('keeps isAuthenticated=true and shows an alert when data load fails', async () => {
      auth.getMe.mockResolvedValue({ userId: 7, email: 'user@example.com' });
      shopping.getAllItems.mockRejectedValue(new Error('network down'));
      dishes.getAllDishes.mockResolvedValue([]);
      savedRecipes.getSavedRecipes.mockResolvedValue([]);
      ai.getAiQuota.mockResolvedValue({ remaining: 5, limit: 10, resetAt: null });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const onSuccess = jest.fn();
      useAuthStore.setState({
        pendingEmail: 'user@example.com',
        authModalVisible: true,
        authModalOnSuccess: onSuccess,
      });

      await useAuthStore.getState().finishLogin();

      expect(alertSpy).toHaveBeenCalled();
      const state = useAuthStore.getState();
      // migrate は既に成功しているのでロールバックせずログイン状態を維持する
      expect(state.isAuthenticated).toBe(true);
      expect(state.userId).toBe(7);
      expect(state.email).toBe('user@example.com');
      expect(state.pendingEmail).toBeNull();
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(useShoppingStore.getState().mode).toBe('server');
    });

    it('rejects without flipping isAuthenticated when getMe fails', async () => {
      auth.getMe.mockRejectedValue(new Error('me failed'));
      const onSuccess = jest.fn();
      useAuthStore.setState({
        pendingEmail: 'user@example.com',
        authModalVisible: true,
        authModalOnSuccess: onSuccess,
      });

      await expect(useAuthStore.getState().finishLogin()).rejects.toThrow('me failed');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.email).toBeNull();
      expect(state.userId).toBeNull();
      // pendingEmail は残しておき、呼び出し側 (AuthModal) が cancelLogin で消す
      expect(state.pendingEmail).toBe('user@example.com');
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('cancelLogin', () => {
    it('removes token, clears auth+pendingEmail, and preserves local data', async () => {
      await secure.setItemAsync(TOKEN_KEY, 'jwt-token');
      const onSuccess = jest.fn();
      useAuthStore.setState({
        pendingEmail: 'user@example.com',
        authModalVisible: true,
        authModalReason: 'reason',
        authModalOnSuccess: onSuccess,
      });
      useShoppingStore.setState({
        mode: 'local',
        items: [
          {
            id: -1,
            name: 'にんじん',
            category: '',
            checked: 0,
            dish_id: null,
            position: 0,
            created_at: '',
            updated_at: '',
          },
        ],
        dishes: [],
      });

      await useAuthStore.getState().cancelLogin();

      expect(secure.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.email).toBeNull();
      expect(state.userId).toBeNull();
      expect(state.pendingEmail).toBeNull();
      expect(state.authModalVisible).toBe(false);
      expect(state.authModalOnSuccess).toBeNull();
      expect(onSuccess).not.toHaveBeenCalled();
      // ローカルデータには手を付けない
      expect(useShoppingStore.getState().mode).toBe('local');
      expect(useShoppingStore.getState().items).toHaveLength(1);
    });
  });

  describe('logout', () => {
    it('removes token, switches to local mode while keeping items, and reloads guest AI quota', async () => {
      await secure.setItemAsync(TOKEN_KEY, 'existing-token');
      ai.getAiQuota.mockResolvedValue({ remaining: 1, limit: 3, resetAt: null });
      useAuthStore.setState({
        isAuthenticated: true,
        email: 'user@example.com',
        userId: 42,
        isLoading: false,
      });
      useShoppingStore.setState({
        mode: 'server',
        items: [
          {
            id: 1,
            name: 'x',
            category: '',
            checked: 0,
            dish_id: null,
            position: 0,
            created_at: '',
            updated_at: '',
          },
        ],
        dishes: [],
      });
      useRecipeStore.setState({
        mode: 'server',
        savedRecipes: [
          {
            id: 1,
            user_id: 1,
            dish_name: 'd',
            title: 't',
            summary: '',
            steps_json: '[]',
            ingredients_json: '[]',
            source_dish_id: null,
            created_at: '',
          },
        ],
      });
      useAiStore.setState({ remaining: 99, quotaExceeded: false, resetAt: null });

      await useAuthStore.getState().logout();

      expect(secure.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
      expect(await secure.getItemAsync(TOKEN_KEY)).toBeNull();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.email).toBeNull();
      expect(state.userId).toBeNull();
      expect(state.pendingEmail).toBeNull();
      expect(useShoppingStore.getState().mode).toBe('local');
      // ログアウトで画面表示が消えないよう、items/dishes/savedRecipes は保持する。
      // 持っているのはサーバ ID（正の数）だが、local モードの操作は id 一致で in-memory に書くので動作する。
      expect(useShoppingStore.getState().items).toHaveLength(1);
      expect(useShoppingStore.getState().items[0].id).toBe(1);
      expect(useRecipeStore.getState().mode).toBe('local');
      expect(useRecipeStore.getState().savedRecipes).toHaveLength(1);
      expect(useRecipeStore.getState().savedRecipes[0].id).toBe(1);
      // ゲスト枠の取り直しが行われる
      expect(ai.getAiQuota).toHaveBeenCalled();
      expect(useAiStore.getState().remaining).toBe(1);
    });
  });

  describe('checkAuth', () => {
    it('marks unauthenticated when no token is stored', async () => {
      await useAuthStore.getState().checkAuth();

      expect(auth.getMe).not.toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('hydrates user info when token is valid', async () => {
      await secure.setItemAsync(TOKEN_KEY, 'jwt-token');
      auth.getMe.mockResolvedValue({ userId: 7, email: 'user@example.com' });

      await useAuthStore.getState().checkAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.userId).toBe(7);
      expect(state.email).toBe('user@example.com');
      expect(state.isLoading).toBe(false);
    });

    it('clears token when /me fails', async () => {
      await secure.setItemAsync(TOKEN_KEY, 'bad-token');
      auth.getMe.mockRejectedValue(new Error('401'));

      await useAuthStore.getState().checkAuth();

      expect(secure.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.email).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('requestLogin / closeAuthModal', () => {
    it('opens the modal with optional reason and onSuccess', () => {
      const onSuccess = jest.fn();

      useAuthStore.getState().requestLogin({ reason: 'いいねする', onSuccess });

      const state = useAuthStore.getState();
      expect(state.authModalVisible).toBe(true);
      expect(state.authModalReason).toBe('いいねする');
      expect(state.authModalOnSuccess).toBe(onSuccess);
    });

    it('opens the modal without arguments', () => {
      useAuthStore.getState().requestLogin();

      const state = useAuthStore.getState();
      expect(state.authModalVisible).toBe(true);
      expect(state.authModalReason).toBeNull();
      expect(state.authModalOnSuccess).toBeNull();
    });

    it('closeAuthModal clears modal state without firing onSuccess', () => {
      const onSuccess = jest.fn();
      useAuthStore.setState({
        authModalVisible: true,
        authModalReason: 'reason',
        authModalOnSuccess: onSuccess,
      });

      useAuthStore.getState().closeAuthModal();

      const state = useAuthStore.getState();
      expect(state.authModalVisible).toBe(false);
      expect(state.authModalReason).toBeNull();
      expect(state.authModalOnSuccess).toBeNull();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
