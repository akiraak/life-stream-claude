import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Dish, DishItem, Ingredient, Recipe, ShoppingItem } from '../types/models';
import * as shoppingApi from '../api/shopping';
import * as dishesApi from '../api/dishes';
import { suggestAi, AiQuotaError } from '../api/ai';
import { useAiStore } from './ai-store';
import { useRecipeStore } from './recipe-store';

export type Mode = 'local' | 'server';

export interface SuggestIngredientsResult {
  dishId: number;
  dishName: string;
  ingredients: Ingredient[];
  recipes: Recipe[];
  recipeStates: { id: number; liked: number; like_count: number }[];
}

interface ShoppingState {
  mode: Mode;
  items: ShoppingItem[];
  dishes: Dish[];
  loading: boolean;
  nextLocalId: number;

  setMode: (mode: Mode) => void;
  clearLocalData: () => void;

  loadAll: () => Promise<void>;

  // 食材
  addItem: (name: string, category?: string) => Promise<ShoppingItem>;
  updateItemName: (id: number, name: string) => Promise<void>;
  toggleCheck: (id: number, checked: number) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  deleteCheckedItems: () => Promise<number>;
  reorderItems: (orderedIds: number[]) => Promise<void>;

  // 料理
  addDish: (name: string) => Promise<Dish>;
  updateDish: (id: number, name: string) => Promise<void>;
  deleteDish: (id: number) => Promise<void>;
  reorderDishes: (orderedIds: number[]) => Promise<void>;
  reorderDishItems: (dishId: number, orderedItemIds: number[]) => Promise<void>;

  // AI
  suggestIngredients: (
    dishId: number,
    extraIngredients?: string[],
  ) => Promise<SuggestIngredientsResult>;

  // 料理⇔食材
  linkItemToDish: (dishId: number, itemId: number) => Promise<void>;
  unlinkItemFromDish: (dishId: number, itemId: number) => Promise<void>;
}

function allocLocalId(get: () => ShoppingState, set: (fn: (s: ShoppingState) => Partial<ShoppingState>) => void): number {
  const id = get().nextLocalId;
  set((s) => ({ nextLocalId: s.nextLocalId - 1 }));
  return id;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toDishItem(item: ShoppingItem): DishItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    checked: item.checked,
  };
}

function rebuildDishItems(dishes: Dish[], items: ShoppingItem[]): Dish[] {
  return dishes.map((d) => ({
    ...d,
    items: items
      .filter((i) => i.dish_id === d.id)
      .sort((a, b) => a.position - b.position)
      .map(toDishItem),
  }));
}

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set, get) => ({
      mode: 'local',
      items: [],
      dishes: [],
      loading: false,
      nextLocalId: -1,

      setMode: (mode) => {
        if (get().mode === mode) return;
        set({ mode, items: [], dishes: [] });
      },

      clearLocalData: () => {
        set({ items: [], dishes: [], nextLocalId: -1 });
      },

      loadAll: async () => {
        if (get().mode === 'local') {
          set((s) => ({ dishes: rebuildDishItems(s.dishes, s.items) }));
          return;
        }
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
        if (get().mode === 'local') {
          const id = allocLocalId(get, set);
          const ts = nowIso();
          const position = get().items.length;
          const item: ShoppingItem = {
            id,
            name,
            category: category ?? '',
            checked: 0,
            dish_id: null,
            position,
            created_at: ts,
            updated_at: ts,
          };
          set((s) => {
            const items = [...s.items, item];
            return { items, dishes: rebuildDishItems(s.dishes, items) };
          });
          return item;
        }
        const item = await shoppingApi.createItem(name, category);
        await get().loadAll();
        return item;
      },

      updateItemName: async (id, name) => {
        if (get().mode === 'server') {
          await shoppingApi.updateItem(id, { name });
        }
        set((s) => {
          const items = s.items.map((i) => (i.id === id ? { ...i, name, updated_at: nowIso() } : i));
          return {
            items,
            dishes: s.dishes.map((d) => ({
              ...d,
              items: d.items.map((i) => (i.id === id ? { ...i, name } : i)),
            })),
          };
        });
      },

      toggleCheck: async (id, checked) => {
        if (get().mode === 'server') {
          await shoppingApi.updateItem(id, { checked });
        }
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, checked, updated_at: nowIso() } : i)),
          dishes: s.dishes.map((d) => ({
            ...d,
            items: d.items.map((i) => (i.id === id ? { ...i, checked } : i)),
          })),
        }));
      },

      deleteItem: async (id) => {
        if (get().mode === 'server') {
          await shoppingApi.deleteItem(id);
        }
        set((s) => ({
          items: s.items.filter((i) => i.id !== id),
          dishes: s.dishes.map((d) => ({
            ...d,
            items: d.items.filter((i) => i.id !== id),
          })),
        }));
      },

      deleteCheckedItems: async () => {
        if (get().mode === 'local') {
          const checkedIds = new Set(get().items.filter((i) => i.checked).map((i) => i.id));
          set((s) => {
            const items = s.items.filter((i) => !checkedIds.has(i.id));
            return { items, dishes: rebuildDishItems(s.dishes, items) };
          });
          return checkedIds.size;
        }
        const count = await shoppingApi.deleteCheckedItems();
        await get().loadAll();
        return count;
      },

      reorderItems: async (orderedIds) => {
        if (get().mode === 'local') {
          const order = new Map(orderedIds.map((id, idx) => [id, idx]));
          set((s) => ({
            items: s.items.map((i) => ({
              ...i,
              position: order.has(i.id) ? (order.get(i.id) as number) : i.position,
            })),
          }));
          return;
        }
        await shoppingApi.reorderItems(orderedIds);
      },

      addDish: async (name) => {
        if (get().mode === 'local') {
          const id = allocLocalId(get, set);
          const ts = nowIso();
          const dish: Dish = {
            id,
            name,
            ingredients_json: null,
            recipes_json: null,
            items: [],
            created_at: ts,
            updated_at: ts,
          };
          set((s) => ({ dishes: [...s.dishes, dish] }));
          return dish;
        }
        const dish = await dishesApi.createDish(name);
        await get().loadAll();
        return dish;
      },

      updateDish: async (id, name) => {
        if (get().mode === 'server') {
          await dishesApi.updateDish(id, name);
        }
        set((s) => ({
          dishes: s.dishes.map((d) =>
            d.id === id ? { ...d, name, updated_at: nowIso() } : d,
          ),
        }));
      },

      deleteDish: async (id) => {
        if (get().mode === 'local') {
          set((s) => {
            const items = s.items.map((i) => (i.dish_id === id ? { ...i, dish_id: null } : i));
            const dishes = s.dishes.filter((d) => d.id !== id);
            return { items, dishes: rebuildDishItems(dishes, items) };
          });
          return;
        }
        await dishesApi.deleteDish(id);
        await get().loadAll();
      },

      reorderDishes: async (orderedIds) => {
        if (get().mode === 'local') {
          const order = new Map(orderedIds.map((id, idx) => [id, idx]));
          set((s) => ({
            dishes: [...s.dishes].sort(
              (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
            ),
          }));
          return;
        }
        await dishesApi.reorderDishes(orderedIds);
      },

      reorderDishItems: async (dishId, orderedItemIds) => {
        if (get().mode === 'local') {
          const order = new Map(orderedItemIds.map((id, idx) => [id, idx]));
          set((s) => ({
            items: s.items.map((i) =>
              i.dish_id === dishId && order.has(i.id)
                ? { ...i, position: order.get(i.id) as number }
                : i,
            ),
            dishes: s.dishes.map((d) =>
              d.id === dishId
                ? {
                    ...d,
                    items: [...d.items].sort(
                      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
                    ),
                  }
                : d,
            ),
          }));
          return;
        }
        await dishesApi.reorderDishItems(dishId, orderedItemIds);
      },

      suggestIngredients: async (dishId, extraIngredients) => {
        const state = get();
        const dish = state.dishes.find((d) => d.id === dishId);
        if (!dish) throw new Error('料理が見つかりません');

        let result;
        try {
          result = await suggestAi(dish.name, extraIngredients);
        } catch (e) {
          if (e instanceof AiQuotaError) {
            useAiStore.getState().markQuotaExceeded(e.resetAt);
          }
          throw e;
        }
        useAiStore.getState().setRemaining(result.remaining);

        const { ingredients, recipes } = result;

        // dish にキャッシュ反映
        set((s) => ({
          dishes: s.dishes.map((d) =>
            d.id === dishId
              ? {
                  ...d,
                  ingredients_json: JSON.stringify(ingredients),
                  recipes_json: JSON.stringify(recipes),
                  updated_at: nowIso(),
                }
              : d,
          ),
        }));

        if (state.mode === 'server') {
          // サーバ側にもキャッシュ保存（失敗しても致命ではないのでログのみ）
          try {
            await dishesApi.updateDishAiCache(dishId, ingredients, recipes);
          } catch {
            /* noop */
          }
        }

        // レシピ自動保存
        const recipeStore = useRecipeStore.getState();
        const saved = await recipeStore.autoSaveRecipes(dish.name, recipes, dishId);
        const recipeStates = saved.map((r) => ({
          id: r.id,
          liked: r.liked,
          like_count: r.like_count,
        }));

        return {
          dishId,
          dishName: dish.name,
          ingredients,
          recipes,
          recipeStates,
        };
      },

      linkItemToDish: async (dishId, itemId) => {
        if (get().mode === 'local') {
          set((s) => {
            const items = s.items.map((i) => (i.id === itemId ? { ...i, dish_id: dishId } : i));
            return { items, dishes: rebuildDishItems(s.dishes, items) };
          });
          return;
        }
        await dishesApi.linkItemToDish(dishId, itemId);
        await get().loadAll();
      },

      unlinkItemFromDish: async (dishId, itemId) => {
        if (get().mode === 'local') {
          set((s) => {
            const items = s.items.map((i) =>
              i.id === itemId && i.dish_id === dishId ? { ...i, dish_id: null } : i,
            );
            return { items, dishes: rebuildDishItems(s.dishes, items) };
          });
          return;
        }
        await dishesApi.unlinkItemFromDish(dishId, itemId);
        await get().loadAll();
      },
    }),
    {
      name: 'cb-shopping-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) =>
        state.mode === 'local'
          ? {
              mode: state.mode,
              items: state.items,
              dishes: state.dishes,
              nextLocalId: state.nextLocalId,
            }
          : { mode: state.mode, nextLocalId: state.nextLocalId },
    },
  ),
);
