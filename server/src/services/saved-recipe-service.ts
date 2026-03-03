import { getDatabase } from '../database';

export interface SavedRecipe {
  id: number;
  user_id: number;
  dish_name: string;
  title: string;
  summary: string;
  steps_json: string;
  ingredients_json: string;
  source_dish_id: number | null;
  created_at: string;
}

export interface SavedRecipeInput {
  dishName: string;
  title: string;
  summary: string;
  steps: string[];
  ingredients: { name: string; category: string }[];
  sourceDishId?: number;
}

export function getAllSavedRecipes(userId: number): SavedRecipe[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT * FROM saved_recipes WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as SavedRecipe[];
}

export function getSavedRecipe(userId: number, id: number): SavedRecipe | null {
  const db = getDatabase();
  return (db.prepare(
    'SELECT * FROM saved_recipes WHERE id = ? AND user_id = ?'
  ).get(id, userId) as SavedRecipe) || null;
}

export function createSavedRecipe(userId: number, input: SavedRecipeInput): SavedRecipe {
  const db = getDatabase();
  const result = db.prepare(
    `INSERT INTO saved_recipes (user_id, dish_name, title, summary, steps_json, ingredients_json, source_dish_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    input.dishName,
    input.title,
    input.summary,
    JSON.stringify(input.steps),
    JSON.stringify(input.ingredients),
    input.sourceDishId ?? null
  );
  return db.prepare('SELECT * FROM saved_recipes WHERE id = ?').get(result.lastInsertRowid) as SavedRecipe;
}

export function deleteSavedRecipe(userId: number, id: number): boolean {
  const db = getDatabase();
  const result = db.prepare(
    'DELETE FROM saved_recipes WHERE id = ? AND user_id = ?'
  ).run(id, userId);
  return result.changes > 0;
}

export function toggleLike(userId: number, id: number): number | null {
  const db = getDatabase();
  const recipe = db.prepare(
    'SELECT liked FROM saved_recipes WHERE id = ? AND user_id = ?'
  ).get(id, userId) as { liked: number } | undefined;
  if (!recipe) return null;
  const newLiked = recipe.liked ? 0 : 1;
  db.prepare('UPDATE saved_recipes SET liked = ? WHERE id = ?').run(newLiked, id);
  return newLiked;
}

export function getSavedRecipeStates(userId: number, dishId: number): { id: number; liked: number }[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT id, liked FROM saved_recipes WHERE user_id = ? AND source_dish_id = ? ORDER BY id ASC'
  ).all(userId, dishId) as { id: number; liked: number }[];
}

// AI レシピ取得時に自動保存（いいね状態を保持）
export function autoSaveRecipes(
  userId: number,
  dishName: string,
  dishId: number,
  recipes: { title: string; summary: string; steps: string[] }[],
  ingredients: { name: string; category: string }[]
): void {
  const db = getDatabase();
  // いいね済みタイトルを保存
  const likedTitles = new Set(
    (db.prepare(
      'SELECT title FROM saved_recipes WHERE user_id = ? AND source_dish_id = ? AND liked = 1'
    ).all(userId, dishId) as { title: string }[]).map(r => r.title)
  );
  // 既存を削除して再挿入
  db.prepare('DELETE FROM saved_recipes WHERE user_id = ? AND source_dish_id = ?').run(userId, dishId);
  const stmt = db.prepare(
    `INSERT INTO saved_recipes (user_id, dish_name, title, summary, steps_json, ingredients_json, source_dish_id, liked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const ingredientsJson = JSON.stringify(ingredients);
  for (const r of recipes) {
    const liked = likedTitles.has(r.title) ? 1 : 0;
    stmt.run(userId, dishName, r.title, r.summary || '', JSON.stringify(r.steps || []), ingredientsJson, dishId, liked);
  }
}
