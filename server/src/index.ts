import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error-handler';
import { requireAuth, requireAdmin } from './middleware/auth';
import { authRouter } from './routes/auth';
import { shoppingRouter } from './routes/shopping';
import { adminRouter } from './routes/admin';
import { claudeRouter } from './routes/claude';
import { recipesRouter } from './routes/recipes';
import { dishesRouter } from './routes/dishes';
import { savedRecipesRouter } from './routes/saved-recipes';
import { docsRouter } from './routes/docs';
import { initDatabase } from './database';
import { cleanupExpiredTokens } from './services/auth-service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_VERSION = Date.now().toString();

// ミドルウェア
app.use(cors());
app.use(express.json());

// index.html にキャッシュバージョンを埋め込んで返す
const webDir = path.join(__dirname, '../../web');
const indexHtml = fs.readFileSync(path.join(webDir, 'index.html'), 'utf-8')
  .replace(/__CACHE_VERSION__/g, CACHE_VERSION);

app.get('/', (_req, res) => {
  res.type('html').send(indexHtml);
});

// /about ページ
const aboutHtml = fs.readFileSync(path.join(webDir, 'about.html'), 'utf-8');
app.get('/about', (_req, res) => {
  res.type('html').send(aboutHtml);
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

// 保護された API ルート
app.use('/api/shopping', requireAuth, shoppingRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);
app.use('/api/claude', requireAuth, claudeRouter);
app.use('/api/recipes', requireAuth, recipesRouter);
app.use('/api/dishes', requireAuth, dishesRouter);
app.use('/api/saved-recipes', requireAuth, savedRecipesRouter);
app.use('/docs', docsRouter);

// エラーハンドリング
app.use(errorHandler);

// DB 初期化 & サーバ起動
initDatabase();

// 期限切れトークンの定期クリーンアップ（1時間ごと）
setInterval(() => {
  try { cleanupExpiredTokens(); } catch {}
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
