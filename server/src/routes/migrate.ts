import { Router, Request, Response } from 'express';
import {
  migrateLocalData,
  type LocalDish,
  type LocalItem,
  type LocalSavedRecipe,
} from '../services/migrate-service';

// ローカル（未ログイン）で作成したデータをサーバへ一括インポートする。
// body: { items, dishes, savedRecipes } いずれも省略可。
// 返り値では「ローカル ID -> サーバ ID」対応表を返す。
export const migrateRouter = Router();

migrateRouter.post('/', (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const items: LocalItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const dishes: LocalDish[] = Array.isArray(req.body?.dishes) ? req.body.dishes : [];
    const savedRecipes: LocalSavedRecipe[] = Array.isArray(req.body?.savedRecipes) ? req.body.savedRecipes : [];

    const data = migrateLocalData(userId, { items, dishes, savedRecipes });

    res.status(201).json({ success: true, data, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});
