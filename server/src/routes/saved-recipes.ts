import { Router, Request, Response } from 'express';
import {
  getAllSavedRecipes,
  getSavedRecipe,
  createSavedRecipe,
  deleteSavedRecipe,
  toggleLike,
} from '../services/saved-recipe-service';

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
    const liked = toggleLike(req.userId!, id);
    if (liked === null) {
      res.status(404).json({ success: false, data: null, error: 'レシピが見つかりません' });
      return;
    }
    res.json({ success: true, data: { liked }, error: null });
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
