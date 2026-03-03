import { getDatabase } from '../database';

export interface Dish {
  id: number;
  name: string;
  ingredients_json: string | null;
  recipes_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface DishWithItems extends Dish {
  items: DishItem[];
}

export interface DishItem {
  id: number;
  name: string;
  category: string;
  checked: number;
}

export function getAllDishes(userId: number): DishWithItems[] {
  const db = getDatabase();
  const dishes = db.prepare('SELECT * FROM dishes WHERE user_id = ? AND active = 1 ORDER BY position ASC, created_at DESC').all(userId) as Dish[];
  return dishes.map(dish => ({
    ...dish,
    items: getItemsForDish(userId, dish.id),
  }));
}

export function getDish(userId: number, id: number): DishWithItems | null {
  const db = getDatabase();
  const dish = db.prepare('SELECT * FROM dishes WHERE id = ? AND user_id = ?').get(id, userId) as Dish | undefined;
  if (!dish) return null;
  return { ...dish, items: getItemsForDish(userId, dish.id) };
}

export function createDish(userId: number, name: string): DishWithItems {
  const db = getDatabase();
  // 既存の position をシフト（先頭に追加するため）
  db.prepare('UPDATE dishes SET position = position + 1 WHERE user_id = ?').run(userId);

  // 同名の最新料理からAI情報を引き継ぐ
  const prev = db.prepare(
    'SELECT ingredients_json, recipes_json FROM dishes WHERE user_id = ? AND name = ? COLLATE NOCASE AND ingredients_json IS NOT NULL ORDER BY created_at DESC LIMIT 1'
  ).get(userId, name) as { ingredients_json: string; recipes_json: string } | undefined;

  if (prev) {
    const result = db.prepare(
      'INSERT INTO dishes (user_id, name, ingredients_json, recipes_json, position) VALUES (?, ?, ?, ?, 0)'
    ).run(userId, name, prev.ingredients_json, prev.recipes_json);
    const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get(result.lastInsertRowid) as Dish;

    return { ...dish, items: [] };
  } else {
    const result = db.prepare('INSERT INTO dishes (user_id, name, position) VALUES (?, ?, 0)').run(userId, name);
    const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get(result.lastInsertRowid) as Dish;

    return { ...dish, items: [] };
  }
}

export function deleteDish(userId: number, id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('UPDATE dishes SET active = 0 WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes > 0) {
    db.prepare('UPDATE shopping_items SET dish_id = NULL WHERE dish_id = ? AND user_id = ?').run(id, userId);
    return true;
  }
  return false;
}

export function getItemsForDish(userId: number, dishId: number): DishItem[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, name, category, checked
    FROM shopping_items
    WHERE dish_id = ? AND user_id = ?
    ORDER BY position ASC, created_at DESC
  `).all(dishId, userId) as DishItem[];
}

export function linkItemToDish(userId: number, dishId: number, itemId: number): boolean {
  const db = getDatabase();
  try {
    db.prepare('UPDATE shopping_items SET position = position + 1 WHERE dish_id = ? AND user_id = ?').run(dishId, userId);
    db.prepare('UPDATE shopping_items SET dish_id = ?, position = 0 WHERE id = ? AND user_id = ?').run(dishId, itemId, userId);
    return true;
  } catch {
    return false;
  }
}

export function unlinkItemFromDish(userId: number, dishId: number, itemId: number): boolean {
  const db = getDatabase();
  const result = db.prepare('UPDATE shopping_items SET dish_id = NULL WHERE id = ? AND dish_id = ? AND user_id = ?').run(itemId, dishId, userId);
  return result.changes > 0;
}

export function updateDish(userId: number, id: number, name: string): DishWithItems | null {
  const db = getDatabase();
  const result = db.prepare('UPDATE dishes SET name = ? WHERE id = ? AND user_id = ?').run(name, id, userId);
  if (result.changes === 0) return null;
  return getDish(userId, id);
}

export function updateDishInfo(userId: number, id: number, ingredients: unknown[], recipes: unknown[]): void {
  const db = getDatabase();
  db.prepare('UPDATE dishes SET ingredients_json = ?, recipes_json = ? WHERE id = ? AND user_id = ?')
    .run(JSON.stringify(ingredients), JSON.stringify(recipes), id, userId);
}

export function reorderDishes(userId: number, orderedIds: number[]): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE dishes SET position = ? WHERE id = ? AND user_id = ?');
  db.transaction(() => {
    orderedIds.forEach((id, index) => stmt.run(index, id, userId));
  })();
}

export function reorderDishItems(userId: number, dishId: number, orderedItemIds: number[]): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE shopping_items SET position = ? WHERE id = ? AND dish_id = ? AND user_id = ?');
  db.transaction(() => {
    orderedItemIds.forEach((itemId, index) => stmt.run(index, itemId, dishId, userId));
  })();
}

export interface DishSuggestion {
  name: string;
  count: number;
}

export function getDishSuggestions(userId: number, query: string, limit: number = 10): DishSuggestion[] {
  const db = getDatabase();
  if (!query) {
    return db.prepare(`
      SELECT name, COUNT(*) AS count
      FROM dishes
      WHERE user_id = ? AND active = 0
      GROUP BY name COLLATE NOCASE
      ORDER BY count DESC, MAX(created_at) DESC
      LIMIT ?
    `).all(userId, limit) as DishSuggestion[];
  }
  return db.prepare(`
    SELECT name, COUNT(*) AS count
    FROM dishes
    WHERE user_id = ? AND active = 0 AND name LIKE ? COLLATE NOCASE
    GROUP BY name COLLATE NOCASE
    ORDER BY count DESC, MAX(created_at) DESC
    LIMIT ?
  `).all(userId, `${query}%`, limit) as DishSuggestion[];
}
