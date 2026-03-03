import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { getDatabase } from '../database';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '30d';
const MAGIC_LINK_EXPIRES_MINUTES = 15;

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

interface User {
  id: number;
  email: string;
  created_at: string;
  last_login_at: string;
}

interface JwtPayload {
  userId: number;
  email: string;
}

export function findOrCreateUser(email: string): User {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
  if (existing) return existing;

  const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
}

export function createMagicLinkToken(userId: number): string {
  const db = getDatabase();
  // 既存の未使用トークンを無効化
  db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(userId);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRES_MINUTES * 60 * 1000).toISOString();

  db.prepare('INSERT INTO magic_link_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expiresAt);
  return token;
}

export function verifyMagicLinkToken(token: string): User | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT mlt.*, u.email, u.created_at as user_created_at
    FROM magic_link_tokens mlt
    JOIN users u ON u.id = mlt.user_id
    WHERE mlt.token = ? AND mlt.used = 0
  `).get(token) as { user_id: number; expires_at: string; email: string } | undefined;

  if (!row) return null;

  // 有効期限チェック
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE token = ?').run(token);
    return null;
  }

  // トークンを使用済みに
  db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE token = ?').run(token);

  // last_login_at を更新
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(row.user_id);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as User;
}

export function generateJwt(userId: number, email: string): string {
  const payload: JwtPayload = { userId, email };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function getMagicLinkUrl(token: string): string {
  return `${APP_URL}/auth/verify?token=${token}`;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  const transport = getTransporter();
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: '料理買い物リスト - ログインリンク',
    text: `以下のリンクをクリックしてログインしてください。\n\n${url}\n\nこのリンクは15分間有効です。\nこのメールに心当たりがない場合は無視してください。`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">料理買い物リスト</h2>
        <p>以下のボタンをクリックしてログインしてください。</p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #f97316; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">ログイン</a>
        <p style="color: #888; font-size: 14px; margin-top: 20px;">このリンクは15分間有効です。<br>このメールに心当たりがない場合は無視してください。</p>
      </div>
    `,
  });
}

export function cleanupExpiredTokens(): void {
  const db = getDatabase();
  db.prepare("DELETE FROM magic_link_tokens WHERE used = 1 OR expires_at < datetime('now')").run();
}
