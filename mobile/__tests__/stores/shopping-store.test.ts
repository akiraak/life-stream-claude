import type { Dish, ShoppingItem } from '../../src/types/models';

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
    AiQuotaError,
  };
});

import * as shoppingApi from '../../src/api/shopping';
import * as dishesApi from '../../src/api/dishes';
import * as aiApi from '../../src/api/ai';
import { useShoppingStore } from '../../src/stores/shopping-store';
import { useRecipeStore } from '../../src/stores/recipe-store';
import { useAiStore } from '../../src/stores/ai-store';

const shopping = shoppingApi as jest.Mocked<typeof shoppingApi>;
const dishes = dishesApi as jest.Mocked<typeof dishesApi>;
const ai = aiApi as jest.Mocked<typeof aiApi>;

function makeItem(partial: Partial<ShoppingItem> & { id: number; name: string }): ShoppingItem {
  return {
    id: partial.id,
    name: partial.name,
    category: partial.category ?? '',
    checked: partial.checked ?? 0,
    dish_id: partial.dish_id ?? null,
    position: partial.position ?? 0,
    created_at: partial.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00Z',
  };
}

function makeDish(partial: Partial<Dish> & { id: number; name: string }): Dish {
  return {
    id: partial.id,
    name: partial.name,
    ingredients_json: partial.ingredients_json ?? null,
    recipes_json: partial.recipes_json ?? null,
    items: partial.items ?? [],
    created_at: partial.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00Z',
  };
}

function resetStore(mode: 'local' | 'server') {
  useShoppingStore.setState({
    mode,
    items: [],
    dishes: [],
    loading: false,
    nextLocalId: -1,
  });
  useRecipeStore.setState({
    mode,
    savedRecipes: [],
    loading: false,
    nextLocalId: -1,
  });
  useAiStore.setState({ remaining: null, quotaExceeded: false, resetAt: null });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('shopping-store (server mode)', () => {
  beforeEach(() => resetStore('server'));

  describe('addItem', () => {
    it('optimistically prepends the api result without reloading', async () => {
      const existing = makeItem({ id: 1, name: 'たまねぎ' });
      const newItem = makeItem({ id: 2, name: 'にんじん', position: 0 });
      shopping.createItem.mockResolvedValue(newItem);
      useShoppingStore.setState({ items: [existing] });

      const result = await useShoppingStore.getState().addItem('にんじん', '野菜');

      expect(shopping.createItem).toHaveBeenCalledWith('にんじん', '野菜');
      expect(shopping.getAllItems).not.toHaveBeenCalled();
      expect(dishes.getAllDishes).not.toHaveBeenCalled();
      expect(result).toEqual(newItem);
      expect(useShoppingStore.getState().items.map((i) => i.id)).toEqual([2, 1]);
    });
  });

  describe('addDish', () => {
    it('optimistically prepends the api result without reloading', async () => {
      const existing = makeDish({ id: 10, name: 'カレー' });
      const newDish = makeDish({ id: 20, name: '豚汁' });
      dishes.createDish.mockResolvedValue(newDish);
      useShoppingStore.setState({ dishes: [existing] });

      const result = await useShoppingStore.getState().addDish('豚汁');

      expect(dishes.createDish).toHaveBeenCalledWith('豚汁');
      expect(dishes.getAllDishes).not.toHaveBeenCalled();
      expect(result).toEqual(newDish);
      expect(useShoppingStore.getState().dishes.map((d) => d.id)).toEqual([20, 10]);
    });
  });

  describe('deleteCheckedItems', () => {
    it('returns server count and filters checked items from state without reloading', async () => {
      shopping.deleteCheckedItems.mockResolvedValue(2);
      useShoppingStore.setState({
        items: [
          makeItem({ id: 1, name: 'A', checked: 1 }),
          makeItem({ id: 2, name: 'B', checked: 0 }),
          makeItem({ id: 3, name: 'C', checked: 1, dish_id: 10 }),
        ],
        dishes: [
          makeDish({
            id: 10,
            name: 'カレー',
            items: [{ id: 3, name: 'C', category: '', checked: 1 }],
          }),
        ],
      });

      const count = await useShoppingStore.getState().deleteCheckedItems();

      expect(shopping.deleteCheckedItems).toHaveBeenCalled();
      expect(shopping.getAllItems).not.toHaveBeenCalled();
      expect(count).toBe(2);
      const state = useShoppingStore.getState();
      expect(state.items.map((i) => i.id)).toEqual([2]);
      expect(state.dishes[0].items).toEqual([]);
    });
  });

  describe('deleteDish', () => {
    it('removes the dish and unlinks its items without reloading', async () => {
      dishes.deleteDish.mockResolvedValue(null);
      useShoppingStore.setState({
        items: [
          makeItem({ id: 1, name: 'にんじん', dish_id: 10 }),
          makeItem({ id: 2, name: 'たまねぎ', dish_id: null }),
        ],
        dishes: [
          makeDish({
            id: 10,
            name: 'カレー',
            items: [{ id: 1, name: 'にんじん', category: '', checked: 0 }],
          }),
        ],
      });

      await useShoppingStore.getState().deleteDish(10);

      expect(dishes.deleteDish).toHaveBeenCalledWith(10);
      expect(dishes.getAllDishes).not.toHaveBeenCalled();
      const state = useShoppingStore.getState();
      expect(state.dishes).toEqual([]);
      expect(state.items.find((i) => i.id === 1)?.dish_id).toBeNull();
    });
  });

  describe('linkItemToDish', () => {
    it('optimistically updates dish_id and rebuilds dish.items without reloading', async () => {
      dishes.linkItemToDish.mockResolvedValue(makeDish({ id: 10, name: 'カレー' }));
      useShoppingStore.setState({
        items: [makeItem({ id: 1, name: 'にんじん', dish_id: null })],
        dishes: [makeDish({ id: 10, name: 'カレー', items: [] })],
      });

      await useShoppingStore.getState().linkItemToDish(10, 1);

      expect(dishes.linkItemToDish).toHaveBeenCalledWith(10, 1);
      expect(dishes.getAllDishes).not.toHaveBeenCalled();
      const state = useShoppingStore.getState();
      expect(state.items[0].dish_id).toBe(10);
      expect(state.dishes[0].items.map((i) => i.id)).toEqual([1]);
    });
  });

  describe('unlinkItemFromDish', () => {
    it('optimistically clears dish_id and rebuilds dish.items without reloading', async () => {
      dishes.unlinkItemFromDish.mockResolvedValue(null);
      useShoppingStore.setState({
        items: [makeItem({ id: 1, name: 'にんじん', dish_id: 10 })],
        dishes: [
          makeDish({
            id: 10,
            name: 'カレー',
            items: [{ id: 1, name: 'にんじん', category: '', checked: 0 }],
          }),
        ],
      });

      await useShoppingStore.getState().unlinkItemFromDish(10, 1);

      expect(dishes.unlinkItemFromDish).toHaveBeenCalledWith(10, 1);
      expect(dishes.getAllDishes).not.toHaveBeenCalled();
      const state = useShoppingStore.getState();
      expect(state.items[0].dish_id).toBeNull();
      expect(state.dishes[0].items).toEqual([]);
    });
  });

  describe('toggleCheck', () => {
    it('optimistically flips checked in items and nested dish items', async () => {
      shopping.updateItem.mockResolvedValue(makeItem({ id: 1, name: 'にんじん', checked: 1 }));
      useShoppingStore.setState({
        items: [makeItem({ id: 1, name: 'にんじん', checked: 0 })],
        dishes: [
          makeDish({
            id: 10,
            name: 'カレー',
            items: [{ id: 1, name: 'にんじん', category: '', checked: 0 }],
          }),
        ],
      });

      await useShoppingStore.getState().toggleCheck(1, 1);

      expect(shopping.updateItem).toHaveBeenCalledWith(1, { checked: 1 });
      const state = useShoppingStore.getState();
      expect(state.items[0].checked).toBe(1);
      expect(state.dishes[0].items[0].checked).toBe(1);
    });

    it('does not touch unrelated items', async () => {
      shopping.updateItem.mockResolvedValue(makeItem({ id: 2, name: 'たまねぎ', checked: 1 }));
      useShoppingStore.setState({
        items: [
          makeItem({ id: 1, name: 'にんじん', checked: 0 }),
          makeItem({ id: 2, name: 'たまねぎ', checked: 0 }),
        ],
      });

      await useShoppingStore.getState().toggleCheck(2, 1);

      const state = useShoppingStore.getState();
      expect(state.items[0].checked).toBe(0);
      expect(state.items[1].checked).toBe(1);
    });
  });

  describe('reorderItems', () => {
    it('forwards ordered ids to the api', async () => {
      shopping.reorderItems.mockResolvedValue(null);
      await useShoppingStore.getState().reorderItems([3, 1, 2]);
      expect(shopping.reorderItems).toHaveBeenCalledWith([3, 1, 2]);
    });
  });

  describe('deleteItem', () => {
    it('removes the item from state and nested dishes without reloading', async () => {
      shopping.deleteItem.mockResolvedValue(null);
      useShoppingStore.setState({
        items: [
          makeItem({ id: 1, name: 'にんじん' }),
          makeItem({ id: 2, name: 'たまねぎ' }),
        ],
        dishes: [
          makeDish({
            id: 10,
            name: 'カレー',
            items: [
              { id: 1, name: 'にんじん', category: '', checked: 0 },
              { id: 2, name: 'たまねぎ', category: '', checked: 0 },
            ],
          }),
        ],
      });

      await useShoppingStore.getState().deleteItem(1);

      expect(shopping.deleteItem).toHaveBeenCalledWith(1);
      expect(shopping.getAllItems).not.toHaveBeenCalled();
      const state = useShoppingStore.getState();
      expect(state.items.map((i) => i.id)).toEqual([2]);
      expect(state.dishes[0].items.map((i) => i.id)).toEqual([2]);
    });
  });
});

describe('shopping-store (local mode)', () => {
  beforeEach(() => resetStore('local'));

  it('addItem stores locally with a negative id and does not call the api', async () => {
    const item = await useShoppingStore.getState().addItem('豚肉', '肉');

    expect(shopping.createItem).not.toHaveBeenCalled();
    expect(item.id).toBe(-1);
    expect(item.name).toBe('豚肉');
    expect(item.dish_id).toBeNull();
    const state = useShoppingStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.nextLocalId).toBe(-2);
  });

  it('addDish and linkItemToDish wire the item into the dish locally', async () => {
    const dish = await useShoppingStore.getState().addDish('豚汁');
    const item = await useShoppingStore.getState().addItem('豚肉', '肉');
    await useShoppingStore.getState().linkItemToDish(dish.id, item.id);

    const state = useShoppingStore.getState();
    expect(dishes.linkItemToDish).not.toHaveBeenCalled();
    expect(state.dishes[0].items.map((i) => i.id)).toEqual([item.id]);
    expect(state.items.find((i) => i.id === item.id)?.dish_id).toBe(dish.id);
  });

  it('toggleCheck and deleteItem work locally without api calls', async () => {
    const item = await useShoppingStore.getState().addItem('牛乳');
    await useShoppingStore.getState().toggleCheck(item.id, 1);
    expect(useShoppingStore.getState().items[0].checked).toBe(1);
    expect(shopping.updateItem).not.toHaveBeenCalled();

    await useShoppingStore.getState().deleteItem(item.id);
    expect(useShoppingStore.getState().items).toHaveLength(0);
    expect(shopping.deleteItem).not.toHaveBeenCalled();
  });

  it('deleteCheckedItems removes only checked items locally', async () => {
    const a = await useShoppingStore.getState().addItem('A');
    const b = await useShoppingStore.getState().addItem('B');
    await useShoppingStore.getState().toggleCheck(a.id, 1);

    const count = await useShoppingStore.getState().deleteCheckedItems();

    expect(count).toBe(1);
    expect(shopping.deleteCheckedItems).not.toHaveBeenCalled();
    const state = useShoppingStore.getState();
    expect(state.items.map((i) => i.id)).toEqual([b.id]);
  });

  it('suggestIngredients calls /api/ai/suggest, caches to dish, and auto-saves recipes locally', async () => {
    const dish = await useShoppingStore.getState().addDish('カレー');
    ai.suggestAi.mockResolvedValue({
      ingredients: [{ name: 'じゃがいも', category: '野菜' }],
      recipes: [
        {
          title: '基本のカレー',
          summary: 'おいしい',
          steps: ['切る', '煮る'],
          ingredients: [{ name: 'じゃがいも', category: '野菜' }],
        },
      ],
      remaining: 2,
    });

    const result = await useShoppingStore.getState().suggestIngredients(dish.id);

    expect(ai.suggestAi).toHaveBeenCalledWith('カレー', undefined);
    expect(dishes.updateDishAiCache).not.toHaveBeenCalled(); // local モードではサーバキャッシュ呼出しない
    expect(result.ingredients).toHaveLength(1);
    expect(result.recipes).toHaveLength(1);
    expect(useAiStore.getState().remaining).toBe(2);

    // dish のキャッシュ
    const updated = useShoppingStore.getState().dishes.find((d) => d.id === dish.id);
    expect(updated?.ingredients_json).toContain('じゃがいも');

    // ローカル保存レシピ
    const saved = useRecipeStore.getState().savedRecipes;
    expect(saved).toHaveLength(1);
    expect(saved[0].dish_name).toBe('カレー');
    expect(saved[0].id).toBeLessThan(0);
  });

  it('suggestIngredients marks quota exceeded when AiQuotaError is thrown', async () => {
    const dish = await useShoppingStore.getState().addDish('カレー');
    const resetAt = '2026-04-23T00:00:00+09:00';
    ai.suggestAi.mockRejectedValue(new aiApi.AiQuotaError(resetAt));

    await expect(useShoppingStore.getState().suggestIngredients(dish.id)).rejects.toBeInstanceOf(
      aiApi.AiQuotaError,
    );

    const aiState = useAiStore.getState();
    expect(aiState.quotaExceeded).toBe(true);
    expect(aiState.remaining).toBe(0);
    expect(aiState.resetAt).toBe(resetAt);
  });
});

describe('shopping-store (setMode)', () => {
  beforeEach(() => resetStore('local'));

  it('clears items/dishes when switching modes', async () => {
    await useShoppingStore.getState().addItem('A');
    expect(useShoppingStore.getState().items).toHaveLength(1);

    useShoppingStore.getState().setMode('server');

    const state = useShoppingStore.getState();
    expect(state.mode).toBe('server');
    expect(state.items).toHaveLength(0);
    expect(state.dishes).toHaveLength(0);
  });

  it('is a no-op when the mode is unchanged', async () => {
    await useShoppingStore.getState().addItem('A');
    useShoppingStore.getState().setMode('local');
    expect(useShoppingStore.getState().items).toHaveLength(1);
  });
});

// auth-store.logout は items/dishes を画面に残すため、`setMode('local')` ではなく
// `useShoppingStore.setState({ mode: 'local' })` を直接呼ぶ意図的迂回を持つ。
// Phase 3 で backend 抽象を入れた後も、この迂回が正しく機能すること
// （= mode 切替後のアクションが local backend を選ぶこと）を担保する。
describe('shopping-store (logout pathway: setState mode bypass)', () => {
  it('keeps items/dishes when mode is flipped via setState', async () => {
    resetStore('server');
    useShoppingStore.setState({
      items: [makeItem({ id: 1, name: 'A' })],
      dishes: [makeDish({ id: 10, name: 'カレー' })],
    });

    useShoppingStore.setState({ mode: 'local' });

    const state = useShoppingStore.getState();
    expect(state.mode).toBe('local');
    expect(state.items).toHaveLength(1);
    expect(state.dishes).toHaveLength(1);
  });

  it('routes subsequent actions through the local backend after setState bypass', async () => {
    resetStore('server');
    useShoppingStore.setState({
      items: [makeItem({ id: 1, name: 'A' })],
      dishes: [],
      nextLocalId: -1,
    });

    useShoppingStore.setState({ mode: 'local' });
    const item = await useShoppingStore.getState().addItem('B');

    expect(shopping.createItem).not.toHaveBeenCalled();
    expect(item.id).toBe(-1);
    expect(useShoppingStore.getState().items.map((i) => i.id)).toEqual([-1, 1]);
    expect(useShoppingStore.getState().nextLocalId).toBe(-2);
  });
});
