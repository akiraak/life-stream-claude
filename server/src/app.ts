import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import pinoHttp from 'pino-http';
import { errorHandler } from './middleware/error-handler';
import { requireAuth, optionalAuth } from './middleware/auth';
import { requireCloudflareAccess } from './middleware/cloudflare-access';
import { authRouter } from './routes/auth';
import { shoppingRouter } from './routes/shopping';
import { adminRouter } from './routes/admin';
import { aiRouter } from './routes/ai';
import { dishesRouter } from './routes/dishes';
import { savedRecipesRouter } from './routes/saved-recipes';
import { migrateRouter } from './routes/migrate';
import { docsRouter } from './routes/docs';
import { logger } from './lib/logger';

// DB の初期化／マイグレーションは呼び出し側（index.ts / テスト helper）の責務にする。
// createApp 自体は Express アプリの組み立てだけを行う純粋な関数として保つ。
export interface CreateAppOptions {
  // /api/migrate のリクエストボディ上限。ログイン時のデータ移行は数 MB に達することがあるため
  // 全 API より緩めに設定する。テストで 413 を検証するために小さい値で上書きできるようにしている。
  migrateBodyLimit?: string;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const { migrateBodyLimit = '10mb' } = options;
  const app = express();
  const CACHE_VERSION = Date.now().toString();

  // ミドルウェア
  app.use(cors());
  // /api/migrate だけは大きめのボディ（ログイン時のローカルデータ一括投入）を許す。
  // body-parser は req._body が既に立っていると no-op になるため、グローバルより前に
  // パス限定のパーサを挟むことで「migrate は大きめ・他は小さめ」を両立させる。
  app.use('/api/migrate', express.json({ limit: migrateBodyLimit }));
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

  // AI（未ログイン可。レート制限は /suggest 側で個別適用、/quota は読み取り専用なので除外）
  app.use('/api/ai', optionalAuth, aiRouter);

  // 保護された API ルート
  app.use('/api/shopping', requireAuth, shoppingRouter);
  // 管理 API は Cloudflare Access で守る。CORS は同一オリジン専用に絞る（多層防御）
  app.use('/api/admin', cors({ origin: false }), requireCloudflareAccess, adminRouter);
  app.use('/api/dishes', requireAuth, dishesRouter);
  app.use('/api/saved-recipes', requireAuth, savedRecipesRouter);
  app.use('/api/migrate', requireAuth, migrateRouter);
  app.use('/docs', docsRouter);

  // エラーハンドリング
  app.use(errorHandler);

  return app;
}
