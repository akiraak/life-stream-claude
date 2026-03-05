import { create } from 'zustand';
import type { ShoppingItem, Dish, SuggestIngredientsResponse } from '../types/models';
import * as shoppingApi from '../api/shopping';
import * as dishesApi from '../api/dishes';

interface ShoppingState {
  items: ShoppingItem[];
  dishes: Dish[];
  loading: boolean;

  loadAll: () => Promise<void>;

  // アイテム操作
  addItem: (name: string, category?: string) => Promise<ShoppingItem>;
  toggleCheck: (id: number, checked: number) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  deleteCheckedItems: () => Promise<number>;
  reorderItems: (orderedIds: number[]) => Promise<void>;

  // 料理操作
  addDish: (name: string) => Promise<Dish>;
  updateDish: (id: number, name: string) => Promise<void>;
  deleteDish: (id: number) => Promise<void>;
  reorderDishes: (orderedIds: number[]) => Promise<void>;
  reorderDishItems: (dishId: number, orderedItemIds: number[]) => Promise<void>;

  // AI
  suggestIngredients: (dishId: number, extraIngredients?: string[], force?: boolean) => Promise<SuggestIngredientsResponse>;

  // 料理⇔アイテム
  linkItemToDish: (dishId: number, itemId: number) => Promise<void>;
  unlinkItemFromDish: (dishId: number, itemId: number) => Promise<void>;
}

export const useShoppingStore = create<ShoppingState>((set, get) => ({
  items: [],
  dishes: [],
  loading: false,

  loadAll: async () => {
    set({ loading: true });
    try {
      const [items, dishes] = await Promise.all([
        shoppingApi.getAllItems(),
        dishesApi.getAllDishes(),
      ]);
      set({ items, dishes });
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (name, category) => {
    const item = await shoppingApi.createItem(name, category);
    await get().loadAll();
    return item;
  },

  toggleCheck: async (id, checked) => {
    await shoppingApi.updateItem(id, { checked });
    // 楽観的UI更新
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, checked } : i)),
      dishes: s.dishes.map((d) => ({
        ...d,
        items: d.items.map((i) => (i.id === id ? { ...i, checked } : i)),
      })),
    }));
  },

  deleteItem: async (id) => {
    await shoppingApi.deleteItem(id);
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      dishes: s.dishes.map((d) => ({
        ...d,
        items: d.items.filter((i) => i.id !== id),
      })),
    }));
  },

  deleteCheckedItems: async () => {
    const count = await shoppingApi.deleteCheckedItems();
    await get().loadAll();
    return count;
  },

  reorderItems: async (orderedIds) => {
    await shoppingApi.reorderItems(orderedIds);
  },

  addDish: async (name) => {
    const dish = await dishesApi.createDish(name);
    await get().loadAll();
    return dish;
  },

  updateDish: async (id, name) => {
    await dishesApi.updateDish(id, name);
    set((s) => ({
      dishes: s.dishes.map((d) => (d.id === id ? { ...d, name } : d)),
    }));
  },

  deleteDish: async (id) => {
    await dishesApi.deleteDish(id);
    await get().loadAll();
  },

  reorderDishes: async (orderedIds) => {
    await dishesApi.reorderDishes(orderedIds);
  },

  reorderDishItems: async (dishId, orderedItemIds) => {
    await dishesApi.reorderDishItems(dishId, orderedItemIds);
  },

  suggestIngredients: async (dishId, extraIngredients, force) => {
    return dishesApi.suggestIngredients(dishId, extraIngredients, force);
  },

  linkItemToDish: async (dishId, itemId) => {
    await dishesApi.linkItemToDish(dishId, itemId);
    await get().loadAll();
  },

  unlinkItemFromDish: async (dishId, itemId) => {
    await dishesApi.unlinkItemFromDish(dishId, itemId);
    await get().loadAll();
  },
}));
