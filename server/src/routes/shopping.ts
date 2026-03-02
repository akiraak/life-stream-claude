import { Router, Request, Response } from 'express';
import {
  getAllItems,
  createItem,
  updateItem,
  deleteItem,
  deleteCheckedItems,
  getSuggestions,
} from '../services/shopping-service';

export const shoppingRouter = Router();

// 全アイテム取得
shoppingRouter.get('/', (_req: Request, res: Response) => {
  const items = getAllItems();
  res.json({ success: true, data: items, error: null });
});

// アイテム追加
shoppingRouter.post('/', (req: Request, res: Response) => {
  const { name, category } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ success: false, data: null, error: 'name は必須です' });
    return;
  }
  const item = createItem({ name: name.trim(), category });
  res.status(201).json({ success: true, data: item, error: null });
});

// アイテム名サジェスト (/:id より先に定義)
shoppingRouter.get('/suggestions', (req: Request, res: Response) => {
  const q = req.query.q;
  const query = (typeof q === 'string') ? q.trim() : '';
  const limit = query ? 10 : 3;
  const suggestions = getSuggestions(query, limit);
  res.json({ success: true, data: suggestions, error: null });
});

// チェック済み一括削除 (/:id より先に定義)
shoppingRouter.delete('/checked', (_req: Request, res: Response) => {
  const count = deleteCheckedItems();
  res.json({ success: true, data: { deleted: count }, error: null });
});

// アイテム更新
shoppingRouter.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = updateItem(id, req.body);
  if (!item) {
    res.status(404).json({ success: false, data: null, error: 'アイテムが見つかりません' });
    return;
  }
  res.json({ success: true, data: item, error: null });
});

// アイテム削除
shoppingRouter.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = deleteItem(id);
  if (!deleted) {
    res.status(404).json({ success: false, data: null, error: 'アイテムが見つかりません' });
    return;
  }
  res.json({ success: true, data: null, error: null });
});
