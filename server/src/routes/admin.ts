import { Router, Request, Response } from 'express';
import {
  getAllItems,
  updateItem,
  deleteItem,
  deleteAllItems,
  getStats,
} from '../services/shopping-service';

export const adminRouter = Router();

// 統計情報
adminRouter.get('/stats', (_req: Request, res: Response) => {
  const stats = getStats();
  res.json({ success: true, data: stats, error: null });
});

// 全アイテム取得
adminRouter.get('/shopping', (_req: Request, res: Response) => {
  const items = getAllItems();
  res.json({ success: true, data: items, error: null });
});

// アイテム更新
adminRouter.put('/shopping/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = updateItem(id, req.body);
  if (!item) {
    res.status(404).json({ success: false, data: null, error: 'アイテムが見つかりません' });
    return;
  }
  res.json({ success: true, data: item, error: null });
});

// アイテム個別削除
adminRouter.delete('/shopping/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = deleteItem(id);
  if (!deleted) {
    res.status(404).json({ success: false, data: null, error: 'アイテムが見つかりません' });
    return;
  }
  res.json({ success: true, data: null, error: null });
});

// 全アイテム一括削除
adminRouter.delete('/shopping', (_req: Request, res: Response) => {
  const count = deleteAllItems();
  res.json({ success: true, data: { deleted: count }, error: null });
});
