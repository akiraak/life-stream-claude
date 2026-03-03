import { Router, Request, Response, NextFunction } from 'express';
import {
  findOrCreateUser,
  createMagicLinkToken,
  verifyMagicLinkToken,
  generateJwt,
  getMagicLinkUrl,
  sendMagicLinkEmail,
} from '../services/auth-service';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

// POST /api/auth/login - Magic Link 送信
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ success: false, data: null, error: '有効なメールアドレスを入力してください' });
      return;
    }

    const user = findOrCreateUser(email.trim().toLowerCase());
    const token = createMagicLinkToken(user.id);
    const url = getMagicLinkUrl(token);

    await sendMagicLinkEmail(email.trim(), url);

    res.json({ success: true, data: { message: 'ログインリンクを送信しました' }, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verify?token=xxx - トークン検証 → JWT 返却
authRouter.get('/verify', (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ success: false, data: null, error: 'トークンが必要です' });
    return;
  }

  const user = verifyMagicLinkToken(token);
  if (!user) {
    res.status(401).json({ success: false, data: null, error: 'リンクが無効または期限切れです' });
    return;
  }

  const jwt = generateJwt(user.id, user.email);
  res.json({ success: true, data: { token: jwt, email: user.email }, error: null });
});

// GET /api/auth/me - 現在のユーザー情報
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ success: true, data: { userId: req.userId, email: req.userEmail }, error: null });
});
