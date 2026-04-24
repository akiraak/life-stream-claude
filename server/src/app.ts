import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import pinoHttp from 'pino-http';
import { errorHandler } from './middleware/error-handler';
import { requireAuth, requireAdmin, optionalAuth } from './middleware/auth';
import { rateLimitAi } from './middleware/rate-limit-ai';
import { authRouter } from './routes/auth';
import { shoppingRouter } from './routes/shopping';
import { adminRouter } from './routes/admin';
import { aiRouter } from './routes/ai';
import { dishesRouter } from './routes/dishes';
import { savedRecipesRouter, savedRecipesSharedRouter } from './routes/saved-recipes';
import { migrateRouter } from './routes/migrate';
import { docsRouter } from './routes/docs';
import { initDatabase } from './database';
import { logger } from './lib/logger';

export interface CreateAppOptions {
  /** DB 初期化をスキップする場合（既に初期化済み・テスト内で独自管理する場合に使用） */
  skipDbInit?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const CACHE_VERSION = Date.now().toString();

  // ミドルウェア
  app.use(cors());
  app.use(express.json());

  // 構造化ロギング（リクエスト毎に req.id を採番し、レスポンス終了時に 1 行出す）
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ reqId: (req as { id?: string }).id }),
    })
  );
  app.use((req, res, next) => {
    const id = (req as { id?: string }).id;
    if (id) res.setHeader('X-Request-Id', id);
    next();
  });

  const webDir = path.join(__dirname, '../../web');

  // PWA は廃止（docs/plans/web-app-removal.md）。ルートは紹介ページへ誘導する
  app.get('/', (_req, res) => {
    res.redirect(301, '/about');
  });

  const aboutHtml = fs.readFileSync(path.join(webDir, 'about.html'), 'utf-8');
  app.get('/about', (_req, res) => {
    res.type('html').send(aboutHtml);
  });

  const privacyHtml = fs.readFileSync(path.join(webDir, 'privacy.html'), 'utf-8');
  app.get('/privacy', (_req, res) => {
    res.type('html').send(privacyHtml);
  });

  // 静的ファイル配信 (Web クライアント)
  app.use(express.static(webDir));

  // 全APIレスポンスにバージョンヘッダーを付与
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-App-Version', CACHE_VERSION);
    next();
  });

  // ヘルスチェック
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' }, error: null });
  });

  // 認証ルート（認証不要）
  app.use('/api/auth', authRouter);

  // AI（未ログイン可、端末 ID or ユーザー ID でレート制限）
  app.use('/api/ai', optionalAuth, rateLimitAi, aiRouter);

  // みんなのレシピは未ログイン可（/api/saved-recipes より先にマウント）
  app.use('/api/saved-recipes/shared', savedRecipesSharedRouter);

  // 保護された API ルート
  app.use('/api/shopping', requireAuth, shoppingRouter);
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter);
  app.use('/api/dishes', requireAuth, dishesRouter);
  app.use('/api/saved-recipes', requireAuth, savedRecipesRouter);
  app.use('/api/migrate', requireAuth, migrateRouter);
  app.use('/docs', docsRouter);

  // エラーハンドリング
  app.use(errorHandler);

  if (!options.skipDbInit) {
    initDatabase();
  }

  return app;
}
