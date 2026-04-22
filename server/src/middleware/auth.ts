import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../services/auth-service';

// Express Request 型を拡張
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userEmail?: string;
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!req.userEmail || !adminEmails.includes(req.userEmail.toLowerCase())) {
    res.status(403).json({ success: false, data: null, error: '管理者権限が必要です' });
    return;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, data: null, error: '認証が必要です' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ success: false, data: null, error: 'トークンが無効または期限切れです' });
    return;
  }

  req.userId = payload.userId;
  req.userEmail = payload.email;
  next();
}

// Authorization ヘッダがあれば検証して userId/userEmail をセット、無ければそのまま通す
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const payload = verifyJwt(authHeader.slice(7));
    if (payload) {
      req.userId = payload.userId;
      req.userEmail = payload.email;
    }
  }
  next();
}
