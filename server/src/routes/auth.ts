import { Router, Request, Response, NextFunction } from 'express';
import {
  findOrCreateUser,
  createMagicLinkToken,
  verifyOtpCode,
  generateJwt,
  sendOtpEmail,
  verifyGoogleToken,
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
    const { code } = createMagicLinkToken(user.id);

    await sendOtpEmail(email.trim(), code);

    res.json({ success: true, data: { message: 'ログインリンクを送信しました' }, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-code - OTPコード検証 → JWT 返却
authRouter.post('/verify-code', (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
    res.status(400).json({ success: false, data: null, error: 'メールアドレスとコードが必要です' });
    return;
  }

  const user = verifyOtpCode(email.trim().toLowerCase(), code.trim());
  if (!user) {
    res.status(401).json({ success: false, data: null, error: 'コードが無効または期限切れです' });
    return;
  }

  const jwt = generateJwt(user.id, user.email);
  res.json({ success: true, data: { token: jwt, email: user.email }, error: null });
});

// POST /api/auth/google - Google認証
authRouter.post('/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ success: false, data: null, error: 'IDトークンが必要です' });
      return;
    }

    const { email } = await verifyGoogleToken(idToken);
    const user = findOrCreateUser(email.trim().toLowerCase());

    const jwt = generateJwt(user.id, user.email);
    res.json({ success: true, data: { token: jwt, email: user.email }, error: null });
  } catch (err) {
    console.error('Google認証エラー:', err);

    res.status(401).json({ success: false, data: null, error: 'Google認証に失敗しました' });
  }
});

// GET /api/auth/google-client-id - Google Client ID を返す
authRouter.get('/google-client-id', (_req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  res.json({ success: true, data: { clientId }, error: null });
});

// GET /api/auth/me - 現在のユーザー情報
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ success: true, data: { userId: req.userId, email: req.userEmail }, error: null });
});
