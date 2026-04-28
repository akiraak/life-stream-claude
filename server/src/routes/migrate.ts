import { Router, Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import {
  migrateLocalData,
  type LocalDish,
  type LocalItem,
  type LocalSavedRecipe,
} from '../services/migrate-service';

// ローカル（未ログイン）で作成したデータをサーバへ一括インポートする。
// body: { items, dishes, savedRecipes } いずれも省略可。
// 返り値では「ローカル ID -> サーバ ID」対応表を返す。
export const migrateRouter = Router();

migrateRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const items: LocalItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const dishes: LocalDish[] = Array.isArray(req.body?.dishes) ? req.body.dishes : [];
    const savedRecipes: LocalSavedRecipe[] = Array.isArray(req.body?.savedRecipes) ? req.body.savedRecipes : [];

    const data = migrateLocalData(userId, { items, dishes, savedRecipes });

    res.status(201).json({ success: true, data, error: null });
  } catch (err) {
    next(err);
  }
});

// body-parser の PayloadTooLargeError を 413 + 日本語メッセージで返す。
// 汎用 errorHandler に流すと 'request entity too large' の生メッセージが
// モバイル側 Alert にそのまま出てしまうため、migrate スコープでだけ塗り潰す。
// migrateRouter ではなく app.use('/api/migrate', bodyParser, このハンドラ) として
// マウントする必要がある（body parser は app レベルで走るので、
// router 内の error middleware では捕捉できない）。
export const migratePayloadTooLargeHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      data: null,
      error: 'データが多すぎて移行できませんでした。一部を削除してから再度お試しください。',
    });
    return;
  }
  next(err);
};
