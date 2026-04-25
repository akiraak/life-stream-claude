import { Alert } from 'react-native';

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
  class AiQuotaError extends Error {}
  return { suggestAi: jest.fn(), AiQuotaError };
});

import * as migrateApi from '../../src/api/migrate';
import { runLoginMigration } from '../../src/utils/migration';
import { useShoppingStore } from '../../src/stores/shopping-store';
import { useRecipeStore } from '../../src/stores/recipe-store';

const migrate = migrateApi.migrate as jest.Mock;

type AlertButton = { text: string; style?: string; onPress?: () => void };

function mockAlertToPress(label: string) {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    const list = (buttons ?? []) as AlertButton[];
    const match = list.find((b) => b.text === label);
    match?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
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
    sharedRecipes: [],
    loading: false,
    nextLocalId: -1,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runLoginMigration', () => {
  it('switches to server mode without prompting when local data is empty', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const result = await runLoginMigration();

    expect(result).toBe('migrated');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
    expect(useShoppingStore.getState().mode).toBe('server');
    expect(useRecipeStore.getState().mode).toBe('server');
  });

  it('migrates items/dishes/savedRecipes on "移す"', async () => {
    useShoppingStore.setState({
      items: [
        {
          id: -1,
          name: 'にんじん',
          category: '野菜',
          checked: 0,
          dish_id: -10,
          position: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      dishes: [
        {
          id: -10,
          name: 'カレー',
          ingredients_json: JSON.stringify([{ name: 'にんじん', category: '野菜' }]),
          recipes_json: null,
          items: [],
          created_at: '',
          updated_at: '',
        },
      ],
    });
    useRecipeStore.setState({
      savedRecipes: [
        {
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
        },
      ],
    });
    migrate.mockResolvedValue({
      dishIdMap: { '-10': 100 },
      itemIdMap: { '-1': 1 },
      savedRecipeIdMap: { '-100': 1000 },
    });
    mockAlertToPress('移す');

    const result = await runLoginMigration();

    expect(result).toBe('migrated');
    expect(migrate).toHaveBeenCalledTimes(1);
    const payload = migrate.mock.calls[0][0];
    expect(payload.items[0]).toMatchObject({ localId: -1, name: 'にんじん', dishLocalId: -10 });
    expect(payload.dishes[0]).toMatchObject({ localId: -10, name: 'カレー', position: 0 });
    expect(payload.savedRecipes[0]).toMatchObject({
      localId: -100,
      title: '基本のカレー',
      sourceDishLocalId: -10,
    });
    expect(useShoppingStore.getState().mode).toBe('server');
    expect(useShoppingStore.getState().items).toHaveLength(0);
    expect(useRecipeStore.getState().mode).toBe('server');
  });

  it('clears local data and switches to server on confirmed discard', async () => {
    useShoppingStore.setState({
      items: [
        {
          id: -1,
          name: 'x',
          category: '',
          checked: 0,
          dish_id: null,
          position: 0,
          created_at: '',
          updated_at: '',
        },
      ],
    });

    let call = 0;
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const list = (buttons ?? []) as AlertButton[];
      const label = call === 0 ? '破棄' : '破棄する';
      call += 1;
      list.find((b) => b.text === label)?.onPress?.();
    });

    const result = await runLoginMigration();

    expect(result).toBe('discarded');
    expect(migrate).not.toHaveBeenCalled();
    expect(useShoppingStore.getState().mode).toBe('server');
    expect(useShoppingStore.getState().items).toHaveLength(0);
  });

  it('returns cancelled and keeps local state on cancel', async () => {
    useShoppingStore.setState({
      items: [
        {
          id: -1,
          name: 'x',
          category: '',
          checked: 0,
          dish_id: null,
          position: 0,
          created_at: '',
          updated_at: '',
        },
      ],
    });
    mockAlertToPress('キャンセル');

    const result = await runLoginMigration();

    expect(result).toBe('cancelled');
    expect(migrate).not.toHaveBeenCalled();
    expect(useShoppingStore.getState().mode).toBe('local');
    expect(useShoppingStore.getState().items).toHaveLength(1);
  });

  it('returns cancelled when migrate() throws', async () => {
    useShoppingStore.setState({
      items: [
        {
          id: -1,
          name: 'x',
          category: '',
          checked: 0,
          dish_id: null,
          position: 0,
          created_at: '',
          updated_at: '',
        },
      ],
    });
    migrate.mockRejectedValue(new Error('boom'));
    mockAlertToPress('移す');

    const result = await runLoginMigration();

    expect(result).toBe('cancelled');
    expect(useShoppingStore.getState().mode).toBe('local');
    expect(useShoppingStore.getState().items).toHaveLength(1);
  });
});
