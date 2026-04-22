import { Router, Request, Response, NextFunction } from 'express';
import { askGemini } from '../services/gemini-service';
import { buildDishInfoPrompt, parseDishInfo } from '../services/dish-ai';

export const aiRouter = Router();

// POST /api/ai/suggest — 料理名から具材とレシピを生成（ステートレス）
aiRouter.post('/suggest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dishName, extraIngredients } = req.body;
    if (!dishName || typeof dishName !== 'string' || dishName.trim() === '') {
      res.status(400).json({ success: false, data: null, error: 'dishName は必須です' });
      return;
    }
    const extras = Array.isArray(extraIngredients)
      ? (extraIngredients as unknown[]).filter((e): e is string => typeof e === 'string' && e.trim() !== '')
      : [];

    const prompt = buildDishInfoPrompt(dishName.trim(), extras.length > 0 ? extras : undefined);
    const raw = await askGemini(prompt);
    const info = parseDishInfo(raw);

    res.json({
      success: true,
      data: { ingredients: info.ingredients, recipes: info.recipes },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});
