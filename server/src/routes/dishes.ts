import { Router, Request, Response } from 'express';
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

// AI 結果キャッシュ保存（クライアントから {ingredients, recipes} を書き戻す）
dishesRouter.put('/:id/ai-cache', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const dish = getDish(req.userId!, id);
    if (!dish) {
      res.status(404).json({ success: false, data: null, error: '料理が見つかりません' });
      return;
    }
    const { ingredients, recipes } = req.body;
    if (!Array.isArray(ingredients) || !Array.isArray(recipes)) {
      res.status(400).json({ success: false, data: null, error: 'ingredients と recipes は配列で指定してください' });
      return;
    }
    updateDishInfo(req.userId!, id, ingredients, recipes);
    res.json({ success: true, data: null, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: String(err) });
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

// 料理内食材並べ替え
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
