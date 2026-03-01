import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error-handler';
import { shoppingRouter } from './routes/shopping';
import { adminRouter } from './routes/admin';
import { initDatabase } from './database';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(cors());
app.use(express.json());

// 静的ファイル配信 (Web クライアント)
app.use(express.static(path.join(__dirname, '../../web')));

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, error: null });
});

// API ルート
app.use('/api/shopping', shoppingRouter);
app.use('/api/admin', adminRouter);

// エラーハンドリング
app.use(errorHandler);

// DB 初期化 & サーバ起動
initDatabase();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
