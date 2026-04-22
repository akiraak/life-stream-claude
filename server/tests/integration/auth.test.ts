import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Resend は ES module 境界でモック（実際のメール送信を防ぐ）
const sendMock = vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { getDatabase } from '../../src/database';

setupTestDatabase();

describe('auth routes', () => {
  const app = createApp();

  beforeEach(() => {
    sendMock.mockClear();
  });

  describe('POST /api/auth/login → POST /api/auth/verify-code', () => {
    it('issues a code via email and returns a JWT on verification', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'flow@example.com' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body).toMatchObject({
        success: true,
        data: { message: expect.any(String) },
        error: null,
      });
      expect(sendMock).toHaveBeenCalledTimes(1);

      // メールに埋め込まれたコードを Resend モックの引数から取り出す
      const call = sendMock.mock.calls[0][0];
      expect(call.to).toBe('flow@example.com');
      const code = (call.text as string).match(/\d{6}/)?.[0];
      expect(code).toMatch(/^\d{6}$/);

      const verifyRes = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'flow@example.com', code });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body).toMatchObject({
        success: true,
        data: {
          token: expect.any(String),
          email: 'flow@example.com',
        },
        error: null,
      });
      // JWT 形式（header.payload.signature）
      expect(verifyRes.body.data.token.split('.')).toHaveLength(3);
    });

    it('lowercases and trims the email before lookup', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: '  MIXED@Example.COM  ' })
        .expect(200);

      const call = sendMock.mock.calls[0][0];
      const code = (call.text as string).match(/\d{6}/)?.[0]!;

      // 大小文字違いでも verify が通る
      const verifyRes = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'mixed@example.com', code });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.email).toBe('mixed@example.com');
    });
  });

  describe('POST /api/auth/login — validation', () => {
    it('returns 400 when email is missing', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeTruthy();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('returns 400 for an obviously invalid email (no @)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/verify-code — failures', () => {
    it('returns 400 when email or code is missing', async () => {
      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'only@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'nobody@example.com', code: '000000' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for a wrong code', async () => {
      await request(app).post('/api/auth/login').send({ email: 'wrong@example.com' });
      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'wrong@example.com', code: '999999' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when the code has expired', async () => {
      await request(app).post('/api/auth/login').send({ email: 'exp@example.com' });
      const call = sendMock.mock.calls[0][0];
      const code = (call.text as string).match(/\d{6}/)?.[0]!;

      // 有効期限を過去に書き換え（サービスと同じ ISO 文字列形式）
      const db = getDatabase();
      const pastIso = new Date(Date.now() - 3600_000).toISOString();
      db.prepare('UPDATE magic_link_tokens SET expires_at = ? WHERE used = 0').run(pastIso);

      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'exp@example.com', code });
      expect(res.status).toBe(401);
    });

    it('rejects re-use of a single-use code', async () => {
      await request(app).post('/api/auth/login').send({ email: 'once@example.com' });
      const call = sendMock.mock.calls[0][0];
      const code = (call.text as string).match(/\d{6}/)?.[0]!;

      await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'once@example.com', code })
        .expect(200);

      const second = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'once@example.com', code });
      expect(second.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns userId and email when given a valid JWT from verify-code', async () => {
      await request(app).post('/api/auth/login').send({ email: 'me@example.com' });
      const call = sendMock.mock.calls[0][0];
      const code = (call.text as string).match(/\d{6}/)?.[0]!;

      const verifyRes = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'me@example.com', code });
      const token = verifyRes.body.data.token as string;

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body).toMatchObject({
        success: true,
        data: { email: 'me@example.com', userId: expect.any(Number) },
        error: null,
      });
    });

    it('returns 401 for an obviously invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.real.jwt');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/google-client-id', () => {
    it('returns the configured Google client ID', async () => {
      const res = await request(app).get('/api/auth/google-client-id');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: { clientId: expect.any(String) },
        error: null,
      });
    });
  });
});
