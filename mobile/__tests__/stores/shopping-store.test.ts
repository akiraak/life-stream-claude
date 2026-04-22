import type { Dish, ShoppingItem } from '../../src/types/models';

jest.mock('../../src/api/shopping', () => ({
  getAllItems: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  deleteCheckedItems: jest.fn(),
  reorderItems: jest.fn(),
  getItemSuggestions: jest.fn(),
}));

jest.mock('../../src/api/dishes', () => ({
  getAllDishes: jest.fn(),
  createDish: jest.fn(),
  updateDish: jest.fn(),
  deleteDish: jest.fn(),
  suggestIngredients: jest.fn(),
  linkItemToDish: jest.fn(),
  unlinkItemFromDish: jest.fn(),
  reorderDishes: jest.fn(),
  reorderDishItems: jest.fn(),
  getDishSuggestions: jest.fn(),
}));

import * as shoppingApi from '../../src/api/shopping';
import * as dishesApi from '../../src/api/dishes';
import { useShoppingStore } from '../../src/stores/shopping-store';

const shopping = shoppingApi as jest.Mocked<typeof shoppingApi>;
const dishes = dishesApi as jest.Mocked<typeof dishesApi>;

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

beforeEach(() => {
  jest.clearAllMocks();
  useShoppingStore.setState({ items: [], dishes: [], loading: false });
});

describe('shopping-store', () => {
  describe('addItem', () => {
    it('calls api and reloads state', async () => {
      const newItem = makeItem({ id: 1, name: 'にんじん' });
      shopping.createItem.mockResolvedValue(newItem);
      shopping.getAllItems.mockResolvedValue([newItem]);
      dishes.getAllDishes.mockResolvedValue([]);

      const result = await useShoppingStore.getState().addItem('にんじん', '野菜');

      expect(shopping.createItem).toHaveBeenCalledWith('にんじん', '野菜');
      expect(shopping.getAllItems).toHaveBeenCalled();
      expect(dishes.getAllDishes).toHaveBeenCalled();
      expect(result).toEqual(newItem);
      expect(useShoppingStore.getState().items).toEqual([newItem]);
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
        loading: false,
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
        dishes: [],
        loading: false,
      });

      await useShoppingStore.getState().toggleCheck(2, 1);

      const state = useShoppingStore.getState();
      expect(state.items[0].checked).toBe(0);
      expect(state.items[1].checked).toBe(1);
    });
  });

  describe('reorderItems', () => {
    it('forwards ordered ids to the api', async () => {
      shopping.reorderItems.mockResolvedValue(undefined);
      await useShoppingStore.getState().reorderItems([3, 1, 2]);
      expect(shopping.reorderItems).toHaveBeenCalledWith([3, 1, 2]);
    });
  });

  describe('deleteItem', () => {
    it('removes the item from state and nested dishes without reloading', async () => {
      shopping.deleteItem.mockResolvedValue(undefined);
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
        loading: false,
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
