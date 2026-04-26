import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// /suggest 経路で Gemini を叩かないようモックしておく（カウント加算検証で使う）
const askGeminiMock = vi.fn();
vi.mock('../../src/services/gemini-service', () => ({
  askGemini: (prompt: string) => askGeminiMock(prompt),
}));

import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { createAuthedUser } from '../helpers/auth';
import { getDatabase } from '../../src/database';
import { _resetAiLimitsCacheForTest } from '../../src/services/settings-service';

setupTestDatabase();

const SAMPLE_RESPONSE = JSON.stringify({
  recipes: [
    {
      title: '基本のカレー',
      summary: '家庭的な王道カレー',
      steps: ['野菜を切る', '肉を炒める', '煮込む'],
      ingredients: [{ name: '玉ねぎ', category: '野菜' }],
    },
  ],
});

describe('GET /api/ai/quota', () => {
  const app = createApp();

  beforeEach(() => {
    askGeminiMock.mockReset();
    askGeminiMock.mockResolvedValue(SAMPLE_RESPONSE);
    _resetAiLimitsCacheForTest();
  });

  describe('guest (no auth)', () => {
    it('returns guest limit and remaining when X-Device-Id is sent and no quota used', async () => {
      const res = await request(app)
        .get('/api/ai/quota')
        .set('X-Device-Id', 'device-fresh');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        remaining: 3,
        limit: 3,
      });
      expect(res.body.data.resetAt).toEqual(expect.any(String));
    });

    it('reflects consumption from POST /api/ai/suggest', async () => {
      // 1 回 suggest を叩く → ゲスト上限 3 のうち 1 消費
      await request(app)
        .post('/api/ai/suggest')
        .set('X-Device-Id', 'device-consumed')
        .send({ dishName: 'カレー' })
        .expect(200);

      const res = await request(app)
        .get('/api/ai/quota')
        .set('X-Device-Id', 'device-consumed');

      expect(res.status).toBe(200);
      expect(res.body.data.remaining).toBe(2);
      expect(res.body.data.limit).toBe(3);
    });

    it('returns remaining: null when X-Device-Id header is missing', async () => {
      const res = await request(app).get('/api/ai/quota');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.remaining).toBeNull();
      expect(res.body.data.limit).toBeNull();
      expect(res.body.data.resetAt).toEqual(expect.any(String));
    });

    it('does not increment ai_quota count (read-only)', async () => {
      // 先に 1 回 suggest を叩いて行を作っておく
      await request(app)
        .post('/api/ai/suggest')
        .set('X-Device-Id', 'device-readonly')
        .send({ dishName: 'カレー' })
        .expect(200);

      const db = getDatabase();
      const beforeCount = db
        .prepare('SELECT count FROM ai_quota')
        .all() as { count: number }[];
      const beforeRows = db
        .prepare('SELECT COUNT(*) as n FROM ai_quota')
        .get() as { n: number };

      // /quota を 5 連打 → カウントは増えてはいけない
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/api/ai/quota')
          .set('X-Device-Id', 'device-readonly')
          .expect(200);
      }

      const afterCount = db
        .prepare('SELECT count FROM ai_quota')
        .all() as { count: number }[];
      const afterRows = db
        .prepare('SELECT COUNT(*) as n FROM ai_quota')
        .get() as { n: number };

      expect(afterRows.n).toBe(beforeRows.n);
      expect(afterCount).toEqual(beforeCount);
    });

    it('counts quota per device (different devices are independent)', async () => {
      await request(app)
        .post('/api/ai/suggest')
        .set('X-Device-Id', 'dev-A')
        .send({ dishName: 'カレー' })
        .expect(200);

      const a = await request(app)
        .get('/api/ai/quota')
        .set('X-Device-Id', 'dev-A');
      const b = await request(app)
        .get('/api/ai/quota')
        .set('X-Device-Id', 'dev-B');

      expect(a.body.data.remaining).toBe(2);
      expect(b.body.data.remaining).toBe(3);
    });
  });

  describe('authenticated', () => {
    it('returns user limit when no quota used', async () => {
      const { headers } = createAuthedUser('quota-user@example.com');
      const res = await request(app).get('/api/ai/quota').set(headers);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        remaining: 20,
        limit: 20,
      });
    });

    it('reflects consumption from POST /api/ai/suggest', async () => {
      const { headers } = createAuthedUser('quota-user-2@example.com');
      await request(app)
        .post('/api/ai/suggest')
        .set(headers)
        .send({ dishName: 'カレー' })
        .expect(200);

      const res = await request(app).get('/api/ai/quota').set(headers);
      expect(res.body.data.remaining).toBe(19);
      expect(res.body.data.limit).toBe(20);
    });

    it('uses user key independently of any device-id sent', async () => {
      // 同一デバイス ID で先にゲスト枠を 1 消費
      await request(app)
        .post('/api/ai/suggest')
        .set('X-Device-Id', 'shared-device')
        .send({ dishName: 'カレー' })
        .expect(200);

      const { headers } = createAuthedUser('quota-user-3@example.com');
      const res = await request(app)
        .get('/api/ai/quota')
        .set(headers)
        .set('X-Device-Id', 'shared-device');

      // ログイン済みなのでユーザー枠（20、未消費）が返るべき
      expect(res.body.data.remaining).toBe(20);
      expect(res.body.data.limit).toBe(20);
    });
  });
});
