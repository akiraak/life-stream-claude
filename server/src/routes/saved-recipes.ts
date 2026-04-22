import { Router, Request, Response } from 'express';
import { optionalAuth } from '../middleware/auth';
import {
  getAllSavedRecipes,
  getSharedRecipes,
  getSavedRecipe,
  createSavedRecipe,
  createSavedRecipesBulk,
  deleteSavedRecipe,
  toggleLike,
  SavedRecipeInput,
} from '../services/saved-recipe-service';

// みんなのレシピは未ログインでも閲覧可。認証必須ルータとは別に用意する
// （/api/saved-recipes は requireAuth が先にかかるため、shared は個別マウント）
export const savedRecipesSharedRouter = Router();
savedRecipesSharedRouter.get('/', optionalAuth, (req: Request, res: Response) => {
  try {
    const recipes = getSharedRecipes(req.userId);
    res.json({ success: true, data: recipes, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

export const savedRecipesRouter = Router();

// GET /api/saved-recipes — 全料理レシピ取得
savedRecipesRouter.get('/', (req: Request, res: Response) => {
  try {
    const recipes = getAllSavedRecipes(req.userId!);
    res.json({ success: true, data: recipes, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// POST /api/saved-recipes/bulk — 一括保存（AI 結果の自動保存用）
savedRecipesRouter.post('/bulk', (req: Request, res: Response) => {
  try {
    const { recipes } = req.body;
    if (!Array.isArray(recipes)) {
      res.status(400).json({ success: false, data: null, error: 'recipes は配列で指定してください' });
      return;
    }
    const inputs: SavedRecipeInput[] = [];
    for (const r of recipes as unknown[]) {
      if (!r || typeof r !== 'object') {
        res.status(400).json({ success: false, data: null, error: 'recipes の要素が不正です' });
        return;
      }
      const obj = r as Record<string, unknown>;
      if (typeof obj.dishName !== 'string' || typeof obj.title !== 'string'
        || obj.dishName.trim() === '' || obj.title.trim() === '') {
        res.status(400).json({ success: false, data: null, error: 'dishName と title は必須です' });
        return;
      }
      inputs.push({
        dishName: obj.dishName,
        title: obj.title,
        summary: typeof obj.summary === 'string' ? obj.summary : '',
        steps: Array.isArray(obj.steps) ? (obj.steps as string[]) : [],
        ingredients: Array.isArray(obj.ingredients) ? (obj.ingredients as { name: string; category: string }[]) : [],
        sourceDishId: typeof obj.sourceDishId === 'number' ? obj.sourceDishId : undefined,
      });
    }
    const created = createSavedRecipesBulk(req.userId!, inputs);
    res.status(201).json({ success: true, data: created, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// GET /api/saved-recipes/:id — 料理レシピ個別取得
savedRecipesRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const recipe = getSavedRecipe(req.userId!, id);
    if (!recipe) {
      res.status(404).json({ success: false, data: null, error: 'レシピが見つかりません' });
      return;
    }
    res.json({ success: true, data: recipe, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// POST /api/saved-recipes — 料理レシピ保存
savedRecipesRouter.post('/', (req: Request, res: Response) => {
  try {
    const { dishName, title, summary, steps, ingredients, sourceDishId } = req.body;
    if (!title || !dishName) {
      res.status(400).json({ success: false, data: null, error: 'dishName と title は必須です' });
      return;
    }
    const recipe = createSavedRecipe(req.userId!, {
      dishName,
      title,
      summary: summary || '',
      steps: Array.isArray(steps) ? steps : [],
      ingredients: Array.isArray(ingredients) ? ingredients : [],
      sourceDishId: sourceDishId ? Number(sourceDishId) : undefined,
    });
    res.status(201).json({ success: true, data: recipe, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// PUT /api/saved-recipes/:id/like — いいねトグル
savedRecipesRouter.put('/:id/like', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const result = toggleLike(req.userId!, id);
    if (result === null) {
      res.status(404).json({ success: false, data: null, error: 'レシピが見つかりません' });
      return;
    }
    res.json({ success: true, data: result, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// DELETE /api/saved-recipes/:id — 料理レシピ削除
savedRecipesRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const deleted = deleteSavedRecipe(req.userId!, id);
    if (!deleted) {
      res.status(404).json({ success: false, data: null, error: 'レシピが見つかりません' });
      return;
    }
    res.json({ success: true, data: null, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});
