import { Router, Request, Response, NextFunction } from 'express';
import { jsonrepair } from 'jsonrepair';
import {
  getAllDishes,
  getDish,
  createDish,
  deleteDish,
  linkItemToDish,
  unlinkItemFromDish,
  getDishSuggestions,
  updateDish,
  updateDishInfo,
  reorderDishes,
  reorderDishItems,
} from '../services/dish-service';
import { askGemini } from '../services/gemini-service';
import { autoSaveRecipes, getSavedRecipeStates } from '../services/saved-recipe-service';

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

function buildDishInfoPrompt(dishName: string, extraIngredients?: string[]): string {
  const extraSection = extraIngredients && extraIngredients.length > 0
    ? `\nユーザーが以下の食材を必ず使いたいと指定しています：${extraIngredients.join('、')}
上記の食材は必ずレシピに含めてください。ただし上記以外の食材も自由に追加してください。上記の食材だけに限定せず、料理に必要な食材をすべて含めた本格的なレシピを提案してください。\n`
    : '';

  return `あなたは料理の専門家です。「${dishName}」について以下の情報をJSON形式で返してください。
${extraSection}
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
    const repaired = jsonrepair(cleaned);
    const parsed = JSON.parse(repaired);
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
dishesRouter.get('/', (req: Request, res: Response) => {
  try {
    const dishes = getAllDishes(req.userId!);
    res.json({ success: true, data: dishes, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理並べ替え (/:id より先に定義)
dishesRouter.put('/reorder', (req: Request, res: Response) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      res.status(400).json({ success: false, data: null, error: 'orderedIds は配列で指定してください' });
      return;
    }
    reorderDishes(req.userId!, orderedIds);
    res.json({ success: true, data: null, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理名サジェスト (/:id より先に定義)
dishesRouter.get('/suggestions', (req: Request, res: Response) => {
  const q = req.query.q;
  const query = (typeof q === 'string') ? q.trim() : '';
  const limit = query ? 10 : 3;
  const suggestions = getDishSuggestions(req.userId!, query, limit);
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
    const dish = createDish(req.userId!, name.trim());
    res.status(201).json({ success: true, data: dish, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理名更新
dishesRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ success: false, data: null, error: 'name は必須です' });
      return;
    }
    const dish = updateDish(req.userId!, id, name.trim());
    if (!dish) {
      res.status(404).json({ success: false, data: null, error: '料理が見つかりません' });
      return;
    }
    res.json({ success: true, data: dish, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理削除
dishesRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const deleted = deleteDish(req.userId!, id);
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
    const dish = getDish(req.userId!, id);
    if (!dish) {
      res.status(404).json({ success: false, data: null, error: '料理が見つかりません' });
      return;
    }

    // extraIngredients がある場合は強制再取得
    const extraIngredients: string[] = Array.isArray(req.body.extraIngredients) ? req.body.extraIngredients : [];
    const force = req.body.force === true || extraIngredients.length > 0;

    // DBにキャッシュがあればそれを返す（forceで再取得可能）
    if (!force && dish.ingredients_json) {
      const ingredients = JSON.parse(dish.ingredients_json);
      const recipes = dish.recipes_json ? JSON.parse(dish.recipes_json) : [];
      let recipeStates = getSavedRecipeStates(req.userId!, dish.id);
      // saved_recipes 未登録のレシピがあれば自動保存
      if (recipeStates.length === 0 && recipes.length > 0) {
        autoSaveRecipes(req.userId!, dish.name, dish.id, recipes, ingredients);
        recipeStates = getSavedRecipeStates(req.userId!, dish.id);
      }
      res.json({
        success: true,
        data: { dishId: dish.id, dishName: dish.name, ingredients, recipes, recipeStates },
        error: null,
      });
      return;
    }

    // Gemini呼び出し → DB保存
    const prompt = buildDishInfoPrompt(dish.name, extraIngredients.length > 0 ? extraIngredients : undefined);
    const raw = await askGemini(prompt);
    const info = parseDishInfo(raw);
    updateDishInfo(req.userId!, dish.id, info.ingredients, info.recipes);

    // レシピを自動保存
    if (info.recipes.length > 0) {
      autoSaveRecipes(req.userId!, dish.name, dish.id, info.recipes, info.ingredients);
    }

    const recipeStates = getSavedRecipeStates(req.userId!, dish.id);
    res.json({
      success: true,
      data: {
        dishId: dish.id,
        dishName: dish.name,
        ingredients: info.ingredients,
        recipes: info.recipes,
        recipeStates,
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
    const linked = linkItemToDish(req.userId!, dishId, Number(itemId));
    if (!linked) {
      res.status(400).json({ success: false, data: null, error: 'リンクに失敗しました' });
      return;
    }
    const dish = getDish(req.userId!, dishId);
    res.json({ success: true, data: dish, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理内アイテム並べ替え
dishesRouter.put('/:id/items/reorder', (req: Request, res: Response) => {
  try {
    const dishId = Number(req.params.id);
    const { orderedItemIds } = req.body;
    if (!Array.isArray(orderedItemIds)) {
      res.status(400).json({ success: false, data: null, error: 'orderedItemIds は配列で指定してください' });
      return;
    }
    reorderDishItems(req.userId!, dishId, orderedItemIds);
    res.json({ success: true, data: null, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});

// 料理から食材をリンク解除
dishesRouter.delete('/:id/items/:itemId', (req: Request, res: Response) => {
  try {
    const dishId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const unlinked = unlinkItemFromDish(req.userId!, dishId, itemId);
    if (!unlinked) {
      res.status(404).json({ success: false, data: null, error: 'リンクが見つかりません' });
      return;
    }
    res.json({ success: true, data: null, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
  }
});
