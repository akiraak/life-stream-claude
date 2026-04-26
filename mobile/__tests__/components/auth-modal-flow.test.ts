// AuthModal.handleVerify が実際に呼ぶシーケンス
//   verify() → runLoginMigration() → finishLogin() / cancelLogin()
// を直接駆動し、stores 間の race condition を検出する結合テスト。
// RN コンポーネント描画ライブラリは未導入なので Modal は描画せず、
// handleVerify と同じ順序で stores のメソッドを呼んで end-state を検証する。

jest.mock('../../src/api/auth', () => ({
  requestLogin: jest.fn(),
  verifyCode: jest.fn(),
  getMe: jest.fn(),
}));

jest.mock('../../src/api/migrate', () => ({
  migrate: jest.fn(),
}));

jest.mock('../../src/api/shopping', () => ({
  getAllItems: jest.fn(async () => []),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  deleteCheckedItems: jest.fn(),
  reorderItems: jest.fn(),
}));

jest.mock('../../src/api/dishes', () => ({
  getAllDishes: jest.fn(async () => []),
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
  getSavedRecipes: jest.fn(async () => []),
  getSharedRecipes: jest.fn(async () => []),
  toggleLike: jest.fn(),
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
    getAiQuota: jest.fn(async () => ({ remaining: 5, limit: 10, resetAt: null })),
    AiQuotaError,
  };
});

import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as authApi from '../../src/api/auth';
import * as migrateApi from '../../src/api/migrate';
import { useAuthStore } from '../../src/stores/auth-store';
import { useShoppingStore } from '../../src/stores/shopping-store';
import { useRecipeStore } from '../../src/stores/recipe-store';
import { useAiStore } from '../../src/stores/ai-store';
import { runLoginMigration } from '../../src/utils/migration';

const auth = authApi as jest.Mocked<typeof authApi>;
const migrate = migrateApi.migrate as jest.Mock;
const secure = SecureStore as jest.Mocked<typeof SecureStore> & { __reset: () => void };

const TOKEN_KEY = 'auth_token';

type AlertButton = { text: string; style?: string; onPress?: () => void };

function pressAlertButton(label: string) {
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const list = (buttons ?? []) as AlertButton[];
    list.find((b) => b.text === label)?.onPress?.();
  });
}

function pressAlertButtonsInOrder(labels: string[]) {
  let i = 0;
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const list = (buttons ?? []) as AlertButton[];
    const label = labels[i] ?? labels[labels.length - 1];
    i += 1;
    list.find((b) => b.text === label)?.onPress?.();
  });
}

// AuthModal.handleVerify と同じ順序を再現するヘルパ。
// 本物の handleVerify は React コンポーネント内なので呼べないが、
// 呼ぶ API の順序と分岐は production と同一。
async function simulateHandleVerify(email: string, code: string) {
  await useAuthStore.getState().verify(email, code);
  const result = await runLoginMigration();
  if (result === 'cancelled') {
    await useAuthStore.getState().cancelLogin();
  } else {
    await useAuthStore.getState().finishLogin();
  }
  return result;
}

const sampleItem = {
  id: -1,
  name: 'にんじん',
  category: '野菜',
  checked: 0 as 0 | 1,
  dish_id: -10,
  position: 0,
  created_at: '',
  updated_at: '',
};

const sampleDish = {
  id: -10,
  name: 'カレー',
  ingredients_json: JSON.stringify([{ name: 'にんじん', category: '野菜' }]),
  recipes_json: null,
  items: [],
  created_at: '',
  updated_at: '',
};

const sampleSavedRecipe = {
  id: -100,
  user_id: 0,
  dish_name: 'カレー',
  title: '基本のカレー',
  summary: '',
  steps_json: JSON.stringify(['切る']),
  ingredients_json: JSON.stringify([]),
  source_dish_id: -10,
  created_at: '',
  like_count: 0,
  liked: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  secure.__reset();
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    email: null,
    userId: null,
    pendingEmail: null,
    authModalVisible: true,
    authModalReason: null,
    authModalOnSuccess: null,
  });
  useShoppingStore.setState({
    mode: 'local',
    items: [sampleItem],
    dishes: [sampleDish],
    loading: false,
    nextLocalId: -2,
  });
  useRecipeStore.setState({
    mode: 'local',
    savedRecipes: [sampleSavedRecipe],
    sharedRecipes: [],
    loading: false,
    nextLocalId: -101,
  });
  useAiStore.setState({ remaining: null, quotaExceeded: false, resetAt: null });

  auth.verifyCode.mockResolvedValue({ token: 'jwt-token', email: 'user@example.com' });
  auth.getMe.mockResolvedValue({ userId: 7, email: 'user@example.com' });
  migrate.mockResolvedValue({
    dishIdMap: { '-10': 100 },
    itemIdMap: { '-1': 1 },
    savedRecipeIdMap: { '-100': 1000 },
  });
});

describe('AuthModal handleVerify flow', () => {
  it('migrated path: migrate sees local data, then switches to server and authenticates', async () => {
    pressAlertButton('移す');

    const result = await simulateHandleVerify('user@example.com', '123456');

    expect(result).toBe('migrated');

    // race condition の本丸: migrate API は local データが入った状態で呼ばれる。
    expect(migrate).toHaveBeenCalledTimes(1);
    const payload = migrate.mock.calls[0][0];
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({ localId: -1, name: 'にんじん', dishLocalId: -10 });
    expect(payload.dishes).toHaveLength(1);
    expect(payload.dishes[0]).toMatchObject({ localId: -10, name: 'カレー', position: 0 });
    expect(payload.savedRecipes).toHaveLength(1);
    expect(payload.savedRecipes[0]).toMatchObject({ localId: -100, title: '基本のカレー' });

    const authState = useAuthStore.getState();
    expect(authState.isAuthenticated).toBe(true);
    expect(authState.userId).toBe(7);
    expect(authState.email).toBe('user@example.com');
    expect(authState.pendingEmail).toBeNull();
    expect(authState.authModalVisible).toBe(false);

    expect(useShoppingStore.getState().mode).toBe('server');
    expect(useRecipeStore.getState().mode).toBe('server');

    // token は SecureStore に残ったまま
    expect(await secure.getItemAsync(TOKEN_KEY)).toBe('jwt-token');
  });

  it('discarded path: skips migrate, switches to server, keeps token, isAuthenticated=true', async () => {
    pressAlertButtonsInOrder(['破棄', '破棄する']);

    const result = await simulateHandleVerify('user@example.com', '123456');

    expect(result).toBe('discarded');
    expect(migrate).not.toHaveBeenCalled();

    const authState = useAuthStore.getState();
    expect(authState.isAuthenticated).toBe(true);
    expect(authState.userId).toBe(7);

    expect(useShoppingStore.getState().mode).toBe('server');
    expect(useRecipeStore.getState().mode).toBe('server');

    expect(await secure.getItemAsync(TOKEN_KEY)).toBe('jwt-token');
  });

  it('cancelled path: keeps local data and mode=local, removes token, isAuthenticated=false', async () => {
    pressAlertButton('キャンセル');

    const result = await simulateHandleVerify('user@example.com', '123456');

    expect(result).toBe('cancelled');
    expect(migrate).not.toHaveBeenCalled();

    const authState = useAuthStore.getState();
    expect(authState.isAuthenticated).toBe(false);
    expect(authState.email).toBeNull();
    expect(authState.userId).toBeNull();
    expect(authState.pendingEmail).toBeNull();
    expect(authState.authModalVisible).toBe(false);

    // ローカルデータは保持される — ユーザー報告の「ログアウトしても戻らない」の救済
    expect(useShoppingStore.getState().mode).toBe('local');
    expect(useShoppingStore.getState().items).toHaveLength(1);
    expect(useShoppingStore.getState().dishes).toHaveLength(1);
    expect(useRecipeStore.getState().mode).toBe('local');
    expect(useRecipeStore.getState().savedRecipes).toHaveLength(1);

    // token は消えている
    expect(await secure.getItemAsync(TOKEN_KEY)).toBeNull();
  });

  it('empty local data: skips prompt and finishes login directly', async () => {
    useShoppingStore.setState({ items: [], dishes: [] });
    useRecipeStore.setState({ savedRecipes: [] });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const result = await simulateHandleVerify('user@example.com', '123456');

    expect(result).toBe('migrated');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useShoppingStore.getState().mode).toBe('server');
  });
});
