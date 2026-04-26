import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database';
import { getAiLimits } from '../services/settings-service';
import {
  getJstDate,
  getJstResetAtIso,
  hashDeviceId,
} from '../services/ai-quota-service';

export function rateLimitAi(req: Request, res: Response, next: NextFunction): void {
  const { user: limitUser, guest: limitGuest } = getAiLimits();

  let key: string;
  let limit: number;

  if (req.userId) {
    key = `user:${req.userId}`;
    limit = limitUser;
  } else {
    const raw = req.headers['x-device-id'];
    const rawDeviceId = Array.isArray(raw) ? raw[0] : raw;
    if (!rawDeviceId || typeof rawDeviceId !== 'string' || rawDeviceId.trim() === '') {
      res.status(400).json({
        success: false,
        data: null,
        error: 'X-Device-Id ヘッダが必要です',
      });
      return;
    }
    const hashed = hashDeviceId(rawDeviceId.trim());
    key = `device:${hashed}`;
    limit = limitGuest;
  }

  const date = getJstDate();
  const db = getDatabase();

  // 現在の count を取得
  const existing = db
    .prepare('SELECT count FROM ai_quota WHERE key = ? AND date = ?')
    .get(key, date) as { count: number } | undefined;
  const currentCount = existing?.count ?? 0;

  if (currentCount >= limit) {
    res.status(429).json({
      success: false,
      data: null,
      error: 'ai_quota_exceeded',
      remaining: 0,
      resetAt: getJstResetAtIso(),
    });
    return;
  }

  // UPSERT
  db.prepare(
    `INSERT INTO ai_quota (key, date, count) VALUES (?, ?, 1)
     ON CONFLICT(key, date) DO UPDATE SET count = count + 1`,
  ).run(key, date);

  const remaining = Math.max(0, limit - (currentCount + 1));
  res.setHeader('X-AI-Remaining', String(remaining));
  next();
}
