import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database';

function getJstDate(now: Date = new Date()): string {
  // JST = UTC+9。YYYY-MM-DD 形式で返す。
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10);
}

function getJstResetAtIso(now: Date = new Date()): string {
  // 翌日 00:00 JST を UTC の ISO 文字列で返す
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  const nextJstMidnight = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + 1,
    0, 0, 0, 0,
  );
  // JST 00:00 を UTC に戻す
  return new Date(nextJstMidnight - 9 * 60 * 60 * 1000).toISOString();
}

function hashDeviceId(rawId: string): string {
  const secret = process.env.DEVICE_ID_SECRET;
  if (!secret) {
    throw new Error('DEVICE_ID_SECRET が設定されていません');
  }
  return crypto
    .createHash('sha256')
    .update(rawId + secret)
    .digest('hex');
}

export function rateLimitAi(req: Request, res: Response, next: NextFunction): void {
  const limitUser = Number(process.env.AI_LIMIT_USER || 20);
  const limitGuest = Number(process.env.AI_LIMIT_GUEST || 3);

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
