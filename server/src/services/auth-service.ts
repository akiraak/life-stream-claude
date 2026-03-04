import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { OAuth2Client } from 'google-auth-library';
import { getDatabase } from '../database';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '30d';
const MAGIC_LINK_EXPIRES_MINUTES = 15;


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

export function createMagicLinkToken(userId: number): { token: string; code: string } {
  const db = getDatabase();
  // 既存の未使用トークンを無効化
  db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(userId);

  const token = crypto.randomBytes(32).toString('hex');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRES_MINUTES * 60 * 1000).toISOString();

  db.prepare('INSERT INTO magic_link_tokens (user_id, token, expires_at, code) VALUES (?, ?, ?, ?)').run(userId, token, expiresAt, code);
  return { token, code };
}

export function verifyOtpCode(email: string, code: string): User | null {
  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as User | undefined;
  if (!user) return null;

  const row = db.prepare(`
    SELECT * FROM magic_link_tokens
    WHERE user_id = ? AND code = ? AND used = 0
  `).get(user.id, code) as { id: number; expires_at: string } | undefined;

  if (!row) return null;

  // 有効期限チェック
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE id = ?').run(row.id);
    return null;
  }

  // トークンを使用済みに
  db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE id = ?').run(row.id);

  // last_login_at を更新
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as User;
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

let resend: InstanceType<typeof Resend> | null = null;
function getResend(): InstanceType<typeof Resend> {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  await getResend().emails.send({
    from: process.env.EMAIL_FROM || 'noreply@chobi.me',
    to: email,
    subject: '料理買物List - ログインコード',
    text: `ログインコード: ${code}\n\nアプリ画面でこのコードを入力してください。\n\nこのコードは15分間有効です。\nこのメールに心当たりがない場合は無視してください。`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">料理買物List</h2>
        <p>以下のコードをアプリ画面で入力してください。</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; background: #f5f5f5; border-radius: 8px; margin: 16px 0; color: #333;">${code}</div>
        <p style="color: #888; font-size: 14px; margin-top: 20px;">このコードは15分間有効です。<br>このメールに心当たりがない場合は無視してください。</p>
      </div>
    `,
  });
}

// Google認証トークン検証
export async function verifyGoogleToken(idToken: string): Promise<{ email: string; name: string | undefined }> {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Google認証に失敗しました');
  }
  return { email: payload.email, name: payload.name };
}

export function cleanupExpiredTokens(): void {
  const db = getDatabase();
  db.prepare("DELETE FROM magic_link_tokens WHERE used = 1 OR expires_at < datetime('now')").run();
}
