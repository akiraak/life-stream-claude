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
  like_count: number;
  liked: number;
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
  return db.prepare(`
    SELECT sr.*,
      (SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) as like_count,
      EXISTS(SELECT 1 FROM recipe_likes WHERE saved_recipe_id = sr.id AND user_id = ?) as liked
    FROM saved_recipes sr
    WHERE sr.user_id = ?
    ORDER BY like_count DESC, sr.dish_name ASC, sr.created_at DESC
  `).all(userId, userId) as SavedRecipe[];
}

export function getSharedRecipes(userId?: number): SavedRecipe[] {
  const db = getDatabase();
  if (typeof userId === 'number') {
    return db.prepare(`
      SELECT sr.*,
        (SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) as like_count,
        EXISTS(SELECT 1 FROM recipe_likes WHERE saved_recipe_id = sr.id AND user_id = ?) as liked
      FROM saved_recipes sr
      WHERE (SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) > 0
      ORDER BY like_count DESC, sr.dish_name ASC, sr.created_at DESC
    `).all(userId) as SavedRecipe[];
  }
  // 未ログイン: liked は常に 0
  return db.prepare(`
    SELECT sr.*,
      (SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) as like_count,
      0 as liked
    FROM saved_recipes sr
    WHERE (SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) > 0
    ORDER BY like_count DESC, sr.dish_name ASC, sr.created_at DESC
  `).all() as SavedRecipe[];
}

export function getSavedRecipe(userId: number, id: number): SavedRecipe | null {
  const db = getDatabase();
  return (db.prepare(`
    SELECT sr.*,
      (SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) as like_count,
      EXISTS(SELECT 1 FROM recipe_likes WHERE saved_recipe_id = sr.id AND user_id = ?) as liked
    FROM saved_recipes sr
    WHERE sr.id = ? AND sr.user_id = ?
  `).get(userId, id, userId) as SavedRecipe) || null;
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
  return db.prepare(`
    SELECT sr.*,
      0 as like_count,
      0 as liked
    FROM saved_recipes sr WHERE sr.id = ?
  `).get(result.lastInsertRowid) as SavedRecipe;
}

export function createSavedRecipesBulk(userId: number, inputs: SavedRecipeInput[]): SavedRecipe[] {
  const db = getDatabase();
  const insert = db.prepare(
    `INSERT INTO saved_recipes (user_id, dish_name, title, summary, steps_json, ingredients_json, source_dish_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const selectOne = db.prepare(`
    SELECT sr.*, 0 as like_count, 0 as liked
    FROM saved_recipes sr WHERE sr.id = ?
  `);
  const created: SavedRecipe[] = [];
  const runAll = db.transaction((items: SavedRecipeInput[]) => {
    for (const input of items) {
      const result = insert.run(
        userId,
        input.dishName,
        input.title,
        input.summary,
        JSON.stringify(input.steps),
        JSON.stringify(input.ingredients),
        input.sourceDishId ?? null,
      );
      created.push(selectOne.get(result.lastInsertRowid) as SavedRecipe);
    }
  });
  runAll(inputs);
  return created;
}

export function deleteSavedRecipe(userId: number, id: number): boolean {
  const db = getDatabase();
  const result = db.prepare(
    'DELETE FROM saved_recipes WHERE id = ? AND user_id = ?'
  ).run(id, userId);
  return result.changes > 0;
}

export function toggleLike(userId: number, recipeId: number): { liked: number; like_count: number } | null {
  const db = getDatabase();
  // レシピの存在確認
  const recipe = db.prepare('SELECT id FROM saved_recipes WHERE id = ?').get(recipeId) as { id: number } | undefined;
  if (!recipe) return null;

  // 既存のいいねをチェック
  const existing = db.prepare(
    'SELECT id FROM recipe_likes WHERE user_id = ? AND saved_recipe_id = ?'
  ).get(userId, recipeId) as { id: number } | undefined;

  if (existing) {
    db.prepare('DELETE FROM recipe_likes WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO recipe_likes (user_id, saved_recipe_id) VALUES (?, ?)').run(userId, recipeId);
  }

  const likeCount = (db.prepare(
    'SELECT COUNT(*) as cnt FROM recipe_likes WHERE saved_recipe_id = ?'
  ).get(recipeId) as { cnt: number }).cnt;

  return { liked: existing ? 0 : 1, like_count: likeCount };
}

export function getSavedRecipeStates(userId: number, dishId: number): { id: number; liked: number; like_count: number }[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT sr.id,
      EXISTS(SELECT 1 FROM recipe_likes WHERE saved_recipe_id = sr.id AND user_id = ?) as liked,
      (SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) as like_count
    FROM saved_recipes sr
    WHERE sr.user_id = ? AND sr.source_dish_id = ?
    ORDER BY sr.id ASC
  `).all(userId, userId, dishId) as { id: number; liked: number; like_count: number }[];
}

// AI レシピ取得時に自動保存（いいね状態を保持）
export function autoSaveRecipes(
  userId: number,
  dishName: string,
  dishId: number,
  recipes: { title: string; summary: string; steps: string[]; ingredients?: { name: string; category: string }[] }[],
  ingredients: { name: string; category: string }[]
): void {
  const db = getDatabase();

  // いいね済みタイトルとそのいいねユーザーを保存
  const oldRecipes = db.prepare(
    'SELECT id, title FROM saved_recipes WHERE user_id = ? AND source_dish_id = ?'
  ).all(userId, dishId) as { id: number; title: string }[];

  const likesByTitle = new Map<string, number[]>();
  for (const r of oldRecipes) {
    const likers = db.prepare(
      'SELECT user_id FROM recipe_likes WHERE saved_recipe_id = ?'
    ).all(r.id) as { user_id: number }[];
    if (likers.length > 0) {
      likesByTitle.set(r.title, likers.map(l => l.user_id));
    }
  }

  // 既存を削除して再挿入（recipe_likes は CASCADE で自動削除）
  db.prepare('DELETE FROM saved_recipes WHERE user_id = ? AND source_dish_id = ?').run(userId, dishId);

  const stmt = db.prepare(
    `INSERT INTO saved_recipes (user_id, dish_name, title, summary, steps_json, ingredients_json, source_dish_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const likeStmt = db.prepare('INSERT OR IGNORE INTO recipe_likes (user_id, saved_recipe_id) VALUES (?, ?)');
  const fallbackIngredientsJson = JSON.stringify(ingredients);

  for (const r of recipes) {
    const recipeIngredientsJson = r.ingredients && r.ingredients.length > 0
      ? JSON.stringify(r.ingredients)
      : fallbackIngredientsJson;
    const result = stmt.run(userId, dishName, r.title, r.summary || '', JSON.stringify(r.steps || []), recipeIngredientsJson, dishId);
    // タイトルマッチでいいねを復元
    const likers = likesByTitle.get(r.title);
    if (likers) {
      for (const likerId of likers) {
        likeStmt.run(likerId, result.lastInsertRowid);
      }
    }
  }
}
