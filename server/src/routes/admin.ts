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
import { setAiLimits } from '../services/settings-service';
import {
  readRecentLogs,
  tailLogFile,
  type LogEntry,
  type LogFilter,
} from '../services/logs-service';

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

// AI 上限の更新
adminRouter.put('/ai-limits', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const { user, guest } = body;

  if (user === undefined && guest === undefined) {
    res.status(400).json({ success: false, data: null, error: 'invalid_ai_limit' });
    return;
  }

  const values: { user?: number; guest?: number } = {};
  if (user !== undefined) {
    if (typeof user !== 'number' || !Number.isInteger(user)) {
      res.status(400).json({ success: false, data: null, error: 'invalid_ai_limit' });
      return;
    }
    values.user = user;
  }
  if (guest !== undefined) {
    if (typeof guest !== 'number' || !Number.isInteger(guest)) {
      res.status(400).json({ success: false, data: null, error: 'invalid_ai_limit' });
      return;
    }
    values.guest = guest;
  }

  try {
    const limits = setAiLimits(values);
    res.json({ success: true, data: limits, error: null });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('invalid_ai_limit')) {
      res.status(400).json({ success: false, data: null, error: 'invalid_ai_limit' });
      return;
    }
    throw err;
  }
});

// システム情報
adminRouter.get('/system', (_req: Request, res: Response) => {
  const info = getSystemInfo();
  res.json({ success: true, data: info, error: null });
});

// ログ閲覧（末尾 N 件）
adminRouter.get('/logs', (req: Request, res: Response) => {
  const linesParam = Number(req.query.lines);
  const lines = Number.isFinite(linesParam) && linesParam > 0
    ? Math.min(Math.floor(linesParam), 2000)
    : 200;
  const filter: LogFilter = {};
  if (typeof req.query.level === 'string' && req.query.level) {
    filter.level = req.query.level;
  }
  if (typeof req.query.q === 'string' && req.query.q) {
    filter.q = req.query.q;
  }
  const entries = readRecentLogs(lines, filter);
  res.json({ success: true, data: entries, error: null });
});

// ログ閲覧（SSE tail）
adminRouter.get('/logs/stream', (req: Request, res: Response) => {
  const filter: LogFilter = {};
  if (typeof req.query.level === 'string' && req.query.level) {
    filter.level = req.query.level;
  }
  if (typeof req.query.q === 'string' && req.query.q) {
    filter.q = req.query.q;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // nginx / 他の逆プロキシでバッファされると SSE が届かないので無効化を明示
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const write = (entry: LogEntry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  // 接続直後に直近 50 件を送る
  for (const entry of readRecentLogs(50, filter)) {
    write(entry);
  }

  const unwatch = tailLogFile(filter, write);

  // プロキシのアイドルタイムアウト対策のハートビート
  const heartbeat = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 30000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unwatch();
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
});
