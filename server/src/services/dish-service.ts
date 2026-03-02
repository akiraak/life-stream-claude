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

export function getAllDishes(): DishWithItems[] {
  const db = getDatabase();
  const dishes = db.prepare('SELECT * FROM dishes ORDER BY created_at DESC').all() as Dish[];
  return dishes.map(dish => ({
    ...dish,
    items: getItemsForDish(dish.id),
  }));
}

export function getDish(id: number): DishWithItems | null {
  const db = getDatabase();
  const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get(id) as Dish | undefined;
  if (!dish) return null;
  return { ...dish, items: getItemsForDish(dish.id) };
}

export function createDish(name: string): DishWithItems {
  const db = getDatabase();
  // 同名の最新料理からAI情報を引き継ぐ
  const prev = db.prepare(
    'SELECT ingredients_json, recipes_json FROM dishes WHERE name = ? COLLATE NOCASE AND ingredients_json IS NOT NULL ORDER BY created_at DESC LIMIT 1'
  ).get(name) as { ingredients_json: string; recipes_json: string } | undefined;

  if (prev) {
    const result = db.prepare(
      'INSERT INTO dishes (name, ingredients_json, recipes_json) VALUES (?, ?, ?)'
    ).run(name, prev.ingredients_json, prev.recipes_json);
    const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get(result.lastInsertRowid) as Dish;
    recordDishHistory(name);
    return { ...dish, items: [] };
  } else {
    const result = db.prepare('INSERT INTO dishes (name) VALUES (?)').run(name);
    const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get(result.lastInsertRowid) as Dish;
    recordDishHistory(name);
    return { ...dish, items: [] };
  }
}

export function deleteDish(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM dishes WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getItemsForDish(dishId: number): DishItem[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT si.id, si.name, si.category, si.checked
    FROM shopping_items si
    JOIN dish_items di ON di.item_id = si.id
    WHERE di.dish_id = ?
    ORDER BY si.created_at DESC
  `).all(dishId) as DishItem[];
}

export function linkItemToDish(dishId: number, itemId: number): boolean {
  const db = getDatabase();
  try {
    db.prepare('INSERT OR IGNORE INTO dish_items (dish_id, item_id) VALUES (?, ?)').run(dishId, itemId);
    return true;
  } catch {
    return false;
  }
}

export function unlinkItemFromDish(dishId: number, itemId: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM dish_items WHERE dish_id = ? AND item_id = ?').run(dishId, itemId);
  return result.changes > 0;
}

export function updateDishInfo(id: number, ingredients: unknown[], recipes: unknown[]): void {
  const db = getDatabase();
  db.prepare('UPDATE dishes SET ingredients_json = ?, recipes_json = ? WHERE id = ?')
    .run(JSON.stringify(ingredients), JSON.stringify(recipes), id);
}

export interface DishSuggestion {
  name: string;
  count: number;
}

export function recordDishHistory(dishName: string): void {
  const db = getDatabase();
  db.prepare('INSERT INTO dish_history (dish_name) VALUES (?)').run(dishName);
}

export function getDishSuggestions(query: string, limit: number = 10): DishSuggestion[] {
  const db = getDatabase();
  const excludeClause = 'AND dish_name COLLATE NOCASE NOT IN (SELECT name COLLATE NOCASE FROM dishes)';
  if (!query) {
    return db.prepare(`
      SELECT dish_name AS name, COUNT(*) AS count
      FROM dish_history
      WHERE 1=1 ${excludeClause}
      GROUP BY dish_name COLLATE NOCASE
      ORDER BY count DESC, MAX(created_at) DESC
      LIMIT ?
    `).all(limit) as DishSuggestion[];
  }
  return db.prepare(`
    SELECT dish_name AS name, COUNT(*) AS count
    FROM dish_history
    WHERE dish_name LIKE ? COLLATE NOCASE ${excludeClause}
    GROUP BY dish_name COLLATE NOCASE
    ORDER BY count DESC, MAX(created_at) DESC
    LIMIT ?
  `).all(`${query}%`, limit) as DishSuggestion[];
}
