import { Router, Request, Response } from 'express';
import {
  getDashboardStats,
  getAllUsers,
  deleteUser,
  getAllShoppingItems,
  updateShoppingItem,
  deleteShoppingItem,
  getAllDishes,
  deleteDish,
  getAllPurchaseHistory,
  getAllSavedRecipesAdmin,
  deleteSavedRecipeAdmin,
  getAiQuotaStats,
  getSystemInfo,
} from '../services/admin-service';

export const adminRouter = Router();

// ダッシュボード統計
adminRouter.get('/dashboard', (_req: Request, res: Response) => {
  const stats = getDashboardStats();
  res.json({ success: true, data: stats, error: null });
});

// ユーザー一覧
adminRouter.get('/users', (_req: Request, res: Response) => {
  const users = getAllUsers();
  res.json({ success: true, data: users, error: null });
});

// ユーザー削除
adminRouter.delete('/users/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = deleteUser(id);
  if (!deleted) {
    res.status(404).json({ success: false, data: null, error: 'ユーザーが見つかりません' });
    return;
  }
  res.json({ success: true, data: null, error: null });
});

// 買い物食材一覧（全ユーザー）
adminRouter.get('/shopping', (_req: Request, res: Response) => {
  const items = getAllShoppingItems();
  res.json({ success: true, data: items, error: null });
});

// 買い物食材更新
adminRouter.put('/shopping/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = updateShoppingItem(id, req.body);
  if (!item) {
    res.status(404).json({ success: false, data: null, error: '食材が見つかりません' });
    return;
  }
  res.json({ success: true, data: item, error: null });
});

// 買い物食材削除
adminRouter.delete('/shopping/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = deleteShoppingItem(id);
  if (!deleted) {
    res.status(404).json({ success: false, data: null, error: '食材が見つかりません' });
    return;
  }
  res.json({ success: true, data: null, error: null });
});

// 料理一覧（全ユーザー）
adminRouter.get('/dishes', (_req: Request, res: Response) => {
  const dishes = getAllDishes();
  res.json({ success: true, data: dishes, error: null });
});

// 料理削除
adminRouter.delete('/dishes/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = deleteDish(id);
  if (!deleted) {
    res.status(404).json({ success: false, data: null, error: '料理が見つかりません' });
    return;
  }
  res.json({ success: true, data: null, error: null });
});

// 購入履歴
adminRouter.get('/purchase-history', (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 500;
  const history = getAllPurchaseHistory(limit);
  res.json({ success: true, data: history, error: null });
});

// 料理レシピ一覧
adminRouter.get('/saved-recipes', (_req: Request, res: Response) => {
  const recipes = getAllSavedRecipesAdmin();
  res.json({ success: true, data: recipes, error: null });
});

// 料理レシピ削除
adminRouter.delete('/saved-recipes/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = deleteSavedRecipeAdmin(id);
  if (!deleted) {
    res.status(404).json({ success: false, data: null, error: 'レシピが見つかりません' });
    return;
  }
  res.json({ success: true, data: null, error: null });
});

// AI 利用状況
adminRouter.get('/ai-quota', (_req: Request, res: Response) => {
  const stats = getAiQuotaStats();
  res.json({ success: true, data: stats, error: null });
});

// システム情報
adminRouter.get('/system', (_req: Request, res: Response) => {
  const info = getSystemInfo();
  res.json({ success: true, data: info, error: null });
});
