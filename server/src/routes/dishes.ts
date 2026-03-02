import { Router, Request, Response, NextFunction } from 'express';
import {
  getAllDishes,
  getDish,
  createDish,
  deleteDish,
  linkItemToDish,
  unlinkItemFromDish,
  getDishSuggestions,
  updateDishInfo,
} from '../services/dish-service';
import { askGemini } from '../services/gemini-service';

interface Ingredient {
  name: string;
  category: string;
}

interface Recipe {
  title: string;
  summary: string;
  steps: string[];
}

interface DishInfo {
  ingredients: Ingredient[];
  recipes: Recipe[];
}

function buildDishInfoPrompt(dishName: string): string {
  return `あなたは料理の専門家です。「${dishName}」について以下の情報をJSON形式で返してください。

1. 必要な具材リスト（一般的な調味料は含めない、主要な食材のみ）
2. おすすめレシピを3つ（タイトル、概要、手順）

回答は以下のJSON形式のみで返してください。JSON以外のテキストは含めないでください:

{
  "ingredients": [
    { "name": "具材名", "category": "野菜|肉類|魚介類|乳製品|穀類|その他" }
  ],
  "recipes": [
    {
      "title": "レシピ名",
      "summary": "一行の概要説明",
      "steps": ["手順1", "手順2", "手順3"]
    }
  ]
}`;
}

function parseDishInfo(raw: string): DishInfo {
  try {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    // 新形式: { ingredients, recipes }
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.ingredients)) {
      return {
        ingredients: parsed.ingredients as Ingredient[],
        recipes: Array.isArray(parsed.recipes) ? parsed.recipes as Recipe[] : [],
      };
    }
    // 旧形式: 配列のみ（後方互換）
    if (Array.isArray(parsed)) {
      return { ingredients: parsed as Ingredient[], recipes: [] };
    }
    return { ingredients: [], recipes: [] };
  } catch {
    return { ingredients: [], recipes: [] };
  }
}

export const dishesRouter = Router();

// 全料理取得
dishesRouter.get('/', (_req: Request, res: Response) => {
  try {
    const dishes = getAllDishes();
    res.json({ success: true, data: dishes, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理名サジェスト (/:id より先に定義)
dishesRouter.get('/suggestions', (req: Request, res: Response) => {
  const q = req.query.q;
  const query = (typeof q === 'string') ? q.trim() : '';
  const limit = query ? 10 : 3;
  const suggestions = getDishSuggestions(query, limit);
  res.json({ success: true, data: suggestions, error: null });
});

// 料理追加
dishesRouter.post('/', (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ success: false, data: null, error: 'name は必須です' });
      return;
    }
    const dish = createDish(name.trim());
    res.status(201).json({ success: true, data: dish, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理削除
dishesRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const deleted = deleteDish(id);
    if (!deleted) {
      res.status(404).json({ success: false, data: null, error: '料理が見つかりません' });
      return;
    }
    res.json({ success: true, data: null, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// AI 具材提案
dishesRouter.post('/:id/suggest-ingredients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const dish = getDish(id);
    if (!dish) {
      res.status(404).json({ success: false, data: null, error: '料理が見つかりません' });
      return;
    }

    // DBにキャッシュがあればそれを返す
    if (dish.ingredients_json) {
      const ingredients = JSON.parse(dish.ingredients_json);
      const recipes = dish.recipes_json ? JSON.parse(dish.recipes_json) : [];
      res.json({
        success: true,
        data: { dishId: dish.id, dishName: dish.name, ingredients, recipes },
        error: null,
      });
      return;
    }

    // Gemini呼び出し → DB保存
    const prompt = buildDishInfoPrompt(dish.name);
    const raw = await askGemini(prompt);
    const info = parseDishInfo(raw);
    updateDishInfo(dish.id, info.ingredients, info.recipes);

    res.json({
      success: true,
      data: {
        dishId: dish.id,
        dishName: dish.name,
        ingredients: info.ingredients,
        recipes: info.recipes,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// 料理に食材をリンク
dishesRouter.post('/:id/items', (req: Request, res: Response) => {
  try {
    const dishId = Number(req.params.id);
    const { itemId } = req.body;
    if (!itemId) {
      res.status(400).json({ success: false, data: null, error: 'itemId は必須です' });
      return;
    }
    const linked = linkItemToDish(dishId, Number(itemId));
    if (!linked) {
      res.status(400).json({ success: false, data: null, error: 'リンクに失敗しました' });
      return;
    }
    const dish = getDish(dishId);
    res.json({ success: true, data: dish, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理から食材をリンク解除
dishesRouter.delete('/:id/items/:itemId', (req: Request, res: Response) => {
  try {
    const dishId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const unlinked = unlinkItemFromDish(dishId, itemId);
    if (!unlinked) {
      res.status(404).json({ success: false, data: null, error: 'リンクが見つかりません' });
      return;
    }
    res.json({ success: true, data: null, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});
