import type { Dish, Ingredient, Recipe, ShoppingItem } from '../../types/models';
import * as shoppingApi from '../../api/shopping';
import * as dishesApi from '../../api/dishes';

export interface LoadAllResult {
  items: ShoppingItem[];
  dishes: Dish[];
}

export interface ShoppingItemUpdate {
  name?: string;
  category?: string;
  checked?: number;
}

// 永続化先（in-memory only / server）の差分を吸収するインターフェース。
// store 側のアクション本体は「state mutation 1 通り」になり、ここでだけモードに応じた
// 副作用が発生する。
//
// 戻り値の規約:
// - loadAll は `null` を返したら「リモートに取りに行かない」を意味する
//   （= local backend）。null 以外なら items/dishes を上書きする
// - createItem / createDish は新規レコードを返す（local は負 ID を採番、
//   server は API 戻り値）
// - update / delete / link / unlink / reorder / cache 系は副作用のみで戻り値なし。
//   local backend では基本 no-op
export interface ShoppingBackend {
  loadAll(): Promise<LoadAllResult | null>;

  createItem(name: string, category?: string): Promise<ShoppingItem>;
  updateItem(id: number, data: ShoppingItemUpdate): Promise<void>;
  deleteItem(id: number): Promise<void>;
  deleteCheckedItems(checkedIds: number[]): Promise<number>;
  reorderItems(orderedIds: number[]): Promise<void>;

  createDish(name: string): Promise<Dish>;
  updateDish(id: number, name: string): Promise<void>;
  deleteDish(id: number): Promise<void>;
  reorderDishes(orderedIds: number[]): Promise<void>;
  reorderDishItems(dishId: number, orderedItemIds: number[]): Promise<void>;

  linkItemToDish(dishId: number, itemId: number): Promise<void>;
  unlinkItemFromDish(dishId: number, itemId: number): Promise<void>;

  updateDishAiCache(
    dishId: number,
    ingredients: Ingredient[],
    recipes: Recipe[],
  ): Promise<void>;
}

// ID 採番の責務だけを LocalShoppingBackend に注入する。`nextLocalId` は
// store 側で永続化される値なので、allocator は store の get/set 経由で値を読み書きする
// 関数として渡される（shopping-store.ts 内で組み立て）。
export interface LocalIdAllocator {
  next(): number;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createLocalShoppingBackend(
  allocator: LocalIdAllocator,
): ShoppingBackend {
  return {
    async loadAll() {
      // ローカルは AsyncStorage に永続化されており、リモートから取り直さない。
      // 呼び出し側 (store.loadAll) は null を見て dish.items の再構築だけ行う。
      return null;
    },

    async createItem(name, category) {
      const id = allocator.next();
      const ts = nowIso();
      return {
        id,
        name,
        category: category ?? '',
        checked: 0,
        dish_id: null,
        position: 0,
        created_at: ts,
        updated_at: ts,
      };
    },

    async updateItem() {
      // local モードでは state mutation を呼び出し側で行うため副作用なし
    },

    async deleteItem() {
      // 同上
    },

    async deleteCheckedItems(checkedIds) {
      return checkedIds.length;
    },

    async reorderItems() {
      // 同上
    },

    async createDish(name) {
      const id = allocator.next();
      const ts = nowIso();
      return {
        id,
        name,
        ingredients_json: null,
        recipes_json: null,
        items: [],
        created_at: ts,
        updated_at: ts,
      };
    },

    async updateDish() {},
    async deleteDish() {},
    async reorderDishes() {},
    async reorderDishItems() {},
    async linkItemToDish() {},
    async unlinkItemFromDish() {},
    async updateDishAiCache() {},
  };
}

export function createServerShoppingBackend(): ShoppingBackend {
  return {
    async loadAll() {
      const [items, dishes] = await Promise.all([
        shoppingApi.getAllItems(),
        dishesApi.getAllDishes(),
      ]);
      return { items, dishes };
    },

    async createItem(name, category) {
      return shoppingApi.createItem(name, category);
    },

    async updateItem(id, data) {
      await shoppingApi.updateItem(id, data);
    },

    async deleteItem(id) {
      await shoppingApi.deleteItem(id);
    },

    async deleteCheckedItems() {
      // サーバ側で「checked が立っているもの」を一括削除し、件数を返す。
      // checkedIds は使わない（ローカル側の楽観更新で利用）。
      return shoppingApi.deleteCheckedItems();
    },

    async reorderItems(orderedIds) {
      await shoppingApi.reorderItems(orderedIds);
    },

    async createDish(name) {
      return dishesApi.createDish(name);
    },

    async updateDish(id, name) {
      await dishesApi.updateDish(id, name);
    },

    async deleteDish(id) {
      await dishesApi.deleteDish(id);
    },

    async reorderDishes(orderedIds) {
      await dishesApi.reorderDishes(orderedIds);
    },

    async reorderDishItems(dishId, orderedItemIds) {
      await dishesApi.reorderDishItems(dishId, orderedItemIds);
    },

    async linkItemToDish(dishId, itemId) {
      await dishesApi.linkItemToDish(dishId, itemId);
    },

    async unlinkItemFromDish(dishId, itemId) {
      await dishesApi.unlinkItemFromDish(dishId, itemId);
    },

    async updateDishAiCache(dishId, ingredients, recipes) {
      await dishesApi.updateDishAiCache(dishId, ingredients, recipes);
    },
  };
}
