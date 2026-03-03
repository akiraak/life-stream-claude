import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error-handler';
import { requireAuth } from './middleware/auth';
import { authRouter } from './routes/auth';
import { shoppingRouter } from './routes/shopping';
import { adminRouter } from './routes/admin';
import { claudeRouter } from './routes/claude';
import { recipesRouter } from './routes/recipes';
import { dishesRouter } from './routes/dishes';
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

// Magic Link 検証ページ（HTML）
app.get('/auth/verify', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ログイン中...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1c1c1c; color: #d4d4d4; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #242424; border-radius: 12px; padding: 32px; text-align: center; max-width: 360px; width: 90%; }
    .spinner { width: 32px; height: 32px; border: 3px solid #444; border-top-color: #fb923c; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { color: #f87171; }
    .message { font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" id="spinner"></div>
    <div class="message" id="message">ログイン中...</div>
  </div>
  <script>
    (async () => {
      const params = new URLSearchParams(location.search);
      const token = params.get('token');
      const msgEl = document.getElementById('message');
      const spinnerEl = document.getElementById('spinner');

      if (!token) {
        spinnerEl.style.display = 'none';
        msgEl.className = 'message error';
        msgEl.textContent = 'トークンが見つかりません';
        return;
      }

      try {
        const res = await fetch('/api/auth/verify?token=' + encodeURIComponent(token));
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('auth_token', data.data.token);
          localStorage.setItem('auth_email', data.data.email);
          msgEl.textContent = 'ログイン成功！リダイレクト中...';
          setTimeout(() => { location.href = '/'; }, 500);
        } else {
          spinnerEl.style.display = 'none';
          msgEl.className = 'message error';
          msgEl.textContent = data.error || 'リンクが無効または期限切れです';
        }
      } catch (err) {
        spinnerEl.style.display = 'none';
        msgEl.className = 'message error';
        msgEl.textContent = 'エラーが発生しました';
      }
    })();
  </script>
</body>
</html>`);
});

// 静的ファイル配信 (Web クライアント)
app.use(express.static(webDir));

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, error: null });
});

// 認証ルート（認証不要）
app.use('/api/auth', authRouter);

// 保護された API ルート
app.use('/api/shopping', requireAuth, shoppingRouter);
app.use('/api/admin', requireAuth, adminRouter);
app.use('/api/claude', requireAuth, claudeRouter);
app.use('/api/recipes', requireAuth, recipesRouter);
app.use('/api/dishes', requireAuth, dishesRouter);
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
