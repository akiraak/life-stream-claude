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
  const dishes = db.prepare('SELECT * FROM dishes WHERE user_id = ? ORDER BY position ASC, created_at DESC').all(userId) as Dish[];
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
    recordDishHistory(userId, name);
    return { ...dish, items: [] };
  } else {
    const result = db.prepare('INSERT INTO dishes (user_id, name, position) VALUES (?, ?, 0)').run(userId, name);
    const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get(result.lastInsertRowid) as Dish;
    recordDishHistory(userId, name);
    return { ...dish, items: [] };
  }
}

export function deleteDish(userId: number, id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM dishes WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

export function getItemsForDish(userId: number, dishId: number): DishItem[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT si.id, si.name, si.category, si.checked
    FROM shopping_items si
    JOIN dish_items di ON di.item_id = si.id
    WHERE di.dish_id = ? AND di.user_id = ?
    ORDER BY di.position ASC, si.created_at DESC
  `).all(dishId, userId) as DishItem[];
}

export function linkItemToDish(userId: number, dishId: number, itemId: number): boolean {
  const db = getDatabase();
  try {
    db.prepare('UPDATE dish_items SET position = position + 1 WHERE dish_id = ? AND user_id = ?').run(dishId, userId);
    db.prepare('INSERT OR IGNORE INTO dish_items (user_id, dish_id, item_id, position) VALUES (?, ?, ?, 0)').run(userId, dishId, itemId);
    return true;
  } catch {
    return false;
  }
}

export function unlinkItemFromDish(userId: number, dishId: number, itemId: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM dish_items WHERE dish_id = ? AND item_id = ? AND user_id = ?').run(dishId, itemId, userId);
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
  const stmt = db.prepare('UPDATE dish_items SET position = ? WHERE dish_id = ? AND item_id = ? AND user_id = ?');
  db.transaction(() => {
    orderedItemIds.forEach((itemId, index) => stmt.run(index, dishId, itemId, userId));
  })();
}

export interface DishSuggestion {
  name: string;
  count: number;
}

export function recordDishHistory(userId: number, dishName: string): void {
  const db = getDatabase();
  db.prepare('INSERT INTO dish_history (user_id, dish_name) VALUES (?, ?)').run(userId, dishName);
}

export function getDishSuggestions(userId: number, query: string, limit: number = 10): DishSuggestion[] {
  const db = getDatabase();
  const excludeClause = 'AND dish_name COLLATE NOCASE NOT IN (SELECT name COLLATE NOCASE FROM dishes WHERE user_id = ?)';
  if (!query) {
    return db.prepare(`
      SELECT dish_name AS name, COUNT(*) AS count
      FROM dish_history
      WHERE user_id = ? ${excludeClause}
      GROUP BY dish_name COLLATE NOCASE
      ORDER BY count DESC, MAX(created_at) DESC
      LIMIT ?
    `).all(userId, userId, limit) as DishSuggestion[];
  }
  return db.prepare(`
    SELECT dish_name AS name, COUNT(*) AS count
    FROM dish_history
    WHERE user_id = ? AND dish_name LIKE ? COLLATE NOCASE ${excludeClause}
    GROUP BY dish_name COLLATE NOCASE
    ORDER BY count DESC, MAX(created_at) DESC
    LIMIT ?
  `).all(userId, `${query}%`, userId, limit) as DishSuggestion[];
}
