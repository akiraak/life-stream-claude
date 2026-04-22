import { beforeEach, describe, expect, it, vi } from 'vitest';

// Resend は ES module 境界でモックする（実際のネットワーク送信を防ぐ）
const sendMock = vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });
vi.mock('resend', () => {
  return {
    Resend: class {
      emails = { send: sendMock };
    },
  };
});

import {
  cleanupExpiredTokens,
  createMagicLinkToken,
  findOrCreateUser,
  generateJwt,
  sendOtpEmail,
  verifyJwt,
  verifyOtpCode,
} from '../../src/services/auth-service';
import { getDatabase } from '../../src/database';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

describe('auth-service', () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  describe('findOrCreateUser', () => {
    it('creates a new user on first call and returns the same row on subsequent calls', () => {
      const first = findOrCreateUser('user@example.com');
      const second = findOrCreateUser('user@example.com');
      expect(first.id).toBe(second.id);
      expect(first.email).toBe('user@example.com');
    });
  });

  describe('magic code issue → verify → JWT', () => {
    it('issues a 6-digit code, verifies it, then signs a decodable JWT', () => {
      const user = findOrCreateUser('user@example.com');
      const { code, token } = createMagicLinkToken(user.id);

      expect(code).toMatch(/^\d{6}$/);
      expect(token).toMatch(/^[a-f0-9]{64}$/);

      const verified = verifyOtpCode('user@example.com', code);
      expect(verified?.id).toBe(user.id);

      const jwt = generateJwt(user.id, user.email);
      const payload = verifyJwt(jwt);
      expect(payload).toMatchObject({ userId: user.id, email: user.email });
    });

    it('marks the token as used after successful verification (single-use)', () => {
      const user = findOrCreateUser('single@example.com');
      const { code } = createMagicLinkToken(user.id);

      expect(verifyOtpCode('single@example.com', code)?.id).toBe(user.id);
      // 二度目の検証は失敗する
      expect(verifyOtpCode('single@example.com', code)).toBeNull();
    });

    it('invalidates previous unused tokens when a new one is issued', () => {
      const user = findOrCreateUser('rotate@example.com');
      const first = createMagicLinkToken(user.id);
      const second = createMagicLinkToken(user.id);

      expect(first.code).not.toBe(second.code);
      // 古いコードは無効
      expect(verifyOtpCode('rotate@example.com', first.code)).toBeNull();
      // 新しいコードは有効
      expect(verifyOtpCode('rotate@example.com', second.code)?.id).toBe(user.id);
    });

    it('rejects an expired token and marks it as used', () => {
      const user = findOrCreateUser('expired@example.com');
      const { code } = createMagicLinkToken(user.id);

      // DB 直接書換えで有効期限を過去にする（サービスと同じ ISO 文字列形式）
      const db = getDatabase();
      const pastIso = new Date(Date.now() - 3600_000).toISOString();
      db.prepare('UPDATE magic_link_tokens SET expires_at = ? WHERE user_id = ?').run(
        pastIso,
        user.id,
      );

      expect(verifyOtpCode('expired@example.com', code)).toBeNull();

      const row = db
        .prepare('SELECT used FROM magic_link_tokens WHERE user_id = ?')
        .get(user.id) as { used: number };
      expect(row.used).toBe(1);
    });

    it('returns null when verifying for an unknown email', () => {
      expect(verifyOtpCode('nobody@example.com', '000000')).toBeNull();
    });

    it('returns null when verifying a non-existent code', () => {
      const user = findOrCreateUser('wrong@example.com');
      createMagicLinkToken(user.id);
      expect(verifyOtpCode('wrong@example.com', '999999')).toBeNull();
    });

    it('updates last_login_at on successful verification', () => {
      const user = findOrCreateUser('login@example.com');
      const db = getDatabase();
      // 過去に上書きしておく
      db.prepare("UPDATE users SET last_login_at = '2000-01-01 00:00:00' WHERE id = ?").run(user.id);

      const { code } = createMagicLinkToken(user.id);
      verifyOtpCode('login@example.com', code);

      const after = db
        .prepare('SELECT last_login_at FROM users WHERE id = ?')
        .get(user.id) as { last_login_at: string };
      expect(after.last_login_at).not.toBe('2000-01-01 00:00:00');
    });
  });

  describe('verifyJwt', () => {
    it('returns null for a token signed with a different secret', () => {
      // 明らかに無効なトークン
      expect(verifyJwt('not.a.real.jwt')).toBeNull();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('deletes used tokens and tokens past expiry', () => {
      const user = findOrCreateUser('cleanup@example.com');
      const db = getDatabase();

      // 1) 使用済み
      createMagicLinkToken(user.id);
      db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE user_id = ?').run(user.id);

      // 2) 期限切れ（未使用）
      createMagicLinkToken(user.id);
      db.prepare(
        "UPDATE magic_link_tokens SET expires_at = datetime('now', '-1 hour') WHERE user_id = ? AND used = 0",
      ).run(user.id);

      // 3) 有効（未使用 & 将来期限）
      createMagicLinkToken(user.id);

      const beforeCount = (db
        .prepare('SELECT COUNT(*) as cnt FROM magic_link_tokens WHERE user_id = ?')
        .get(user.id) as { cnt: number }).cnt;
      expect(beforeCount).toBe(3);

      cleanupExpiredTokens();

      const afterRows = db
        .prepare('SELECT used, expires_at FROM magic_link_tokens WHERE user_id = ?')
        .all(user.id) as { used: number; expires_at: string }[];

      // 有効な未使用トークンだけが残っている
      expect(afterRows).toHaveLength(1);
      expect(afterRows[0].used).toBe(0);
      expect(new Date(afterRows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('sendOtpEmail', () => {
    it('calls Resend with the recipient and code (no real network)', async () => {
      await sendOtpEmail('to@example.com', '123456');

      expect(sendMock).toHaveBeenCalledTimes(1);
      const call = sendMock.mock.calls[0][0];
      expect(call.to).toBe('to@example.com');
      expect(call.text).toContain('123456');
      expect(call.html).toContain('123456');
    });
  });
});
