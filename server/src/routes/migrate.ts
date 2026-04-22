import { Router, Request, Response } from 'express';
import { getDatabase } from '../database';

// ローカル（未ログイン）で作成したデータをサーバへ一括インポートする。
// body: { items, dishes, savedRecipes } いずれも省略可。
// 返り値では「ローカル ID -> サーバ ID」対応表を返す。
export const migrateRouter = Router();

interface LocalItem {
  localId?: string | number;
  name: string;
  category?: string;
  checked?: number;
  dishLocalId?: string | number | null;
}

interface LocalDish {
  localId?: string | number;
  name: string;
  ingredients?: unknown[];
  recipes?: unknown[];
  position?: number;
}

interface LocalSavedRecipe {
  localId?: string | number;
  dishName: string;
  title: string;
  summary?: string;
  steps?: string[];
  ingredients?: { name: string; category: string }[];
  sourceDishLocalId?: string | number | null;
}

migrateRouter.post('/', (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const rawItems: LocalItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const rawDishes: LocalDish[] = Array.isArray(req.body?.dishes) ? req.body.dishes : [];
    const rawSavedRecipes: LocalSavedRecipe[] = Array.isArray(req.body?.savedRecipes) ? req.body.savedRecipes : [];

    const db = getDatabase();
    const dishIdMap = new Map<string, number>();
    const itemIdMap = new Map<string, number>();
    const savedRecipeIdMap = new Map<string, number>();

    const insertDish = db.prepare(
      'INSERT INTO dishes (user_id, name, ingredients_json, recipes_json, position) VALUES (?, ?, ?, ?, ?)',
    );
    const insertItem = db.prepare(
      'INSERT INTO shopping_items (user_id, name, category, checked, position, dish_id) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertSaved = db.prepare(
      `INSERT INTO saved_recipes (user_id, dish_name, title, summary, steps_json, ingredients_json, source_dish_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    const run = db.transaction(() => {
      rawDishes.forEach((dish, index) => {
        if (!dish || typeof dish.name !== 'string' || dish.name.trim() === '') return;
        const result = insertDish.run(
          userId,
          dish.name,
          dish.ingredients ? JSON.stringify(dish.ingredients) : null,
          dish.recipes ? JSON.stringify(dish.recipes) : null,
          typeof dish.position === 'number' ? dish.position : index,
        );
        if (dish.localId !== undefined && dish.localId !== null) {
          dishIdMap.set(String(dish.localId), Number(result.lastInsertRowid));
        }
      });

      rawItems.forEach((item, index) => {
        if (!item || typeof item.name !== 'string' || item.name.trim() === '') return;
        const mappedDishId = (item.dishLocalId !== undefined && item.dishLocalId !== null)
          ? dishIdMap.get(String(item.dishLocalId)) ?? null
          : null;
        const result = insertItem.run(
          userId,
          item.name,
          item.category ?? '',
          item.checked ?? 0,
          index,
          mappedDishId,
        );
        if (item.localId !== undefined && item.localId !== null) {
          itemIdMap.set(String(item.localId), Number(result.lastInsertRowid));
        }
      });

      rawSavedRecipes.forEach((r) => {
        if (!r || typeof r.dishName !== 'string' || typeof r.title !== 'string'
          || r.dishName.trim() === '' || r.title.trim() === '') return;
        const sourceDishId = (r.sourceDishLocalId !== undefined && r.sourceDishLocalId !== null)
          ? dishIdMap.get(String(r.sourceDishLocalId)) ?? null
          : null;
        const result = insertSaved.run(
          userId,
          r.dishName,
          r.title,
          r.summary ?? '',
          JSON.stringify(Array.isArray(r.steps) ? r.steps : []),
          JSON.stringify(Array.isArray(r.ingredients) ? r.ingredients : []),
          sourceDishId,
        );
        if (r.localId !== undefined && r.localId !== null) {
          savedRecipeIdMap.set(String(r.localId), Number(result.lastInsertRowid));
        }
      });
    });

    run();

    res.status(201).json({
      success: true,
      data: {
        dishIdMap: Object.fromEntries(dishIdMap),
        itemIdMap: Object.fromEntries(itemIdMap),
        savedRecipeIdMap: Object.fromEntries(savedRecipeIdMap),
      },
      error: null,
    });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});
