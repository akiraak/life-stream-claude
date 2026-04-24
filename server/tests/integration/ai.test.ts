import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Gemini 呼び出しを ES module 境界でモック
const askGeminiMock = vi.fn();
vi.mock('../../src/services/gemini-service', () => ({
  askGemini: (prompt: string) => askGeminiMock(prompt),
}));

import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { createAuthedUser } from '../helpers/auth';
import { setAiLimits, _resetAiLimitsCacheForTest } from '../../src/services/settings-service';

setupTestDatabase();

const SAMPLE_RESPONSE = JSON.stringify({
  recipes: [
    {
      title: '基本のカレー',
      summary: '家庭的な王道カレー',
      steps: ['野菜を切る', '肉を炒める', '煮込む'],
      ingredients: [
        { name: '玉ねぎ', category: '野菜' },
        { name: '牛肉', category: '肉類' },
      ],
    },
  ],
});

describe('POST /api/ai/suggest', () => {
  const app = createApp();

  beforeEach(() => {
    askGeminiMock.mockReset();
    askGeminiMock.mockResolvedValue(SAMPLE_RESPONSE);
    // app_settings は truncate されるが、メモリキャッシュも明示的にクリア
    _resetAiLimitsCacheForTest();
  });

  describe('guest (no auth)', () => {
    it('returns ingredients/recipes with X-AI-Remaining header', async () => {
      const res = await request(app)
        .post('/api/ai/suggest')
        .set('X-Device-Id', 'device-guest-1')
        .send({ dishName: 'カレー' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ingredients).toHaveLength(2);
      expect(res.body.data.recipes).toHaveLength(1);
      // 3 - 1 = 2 残
      expect(res.headers['x-ai-remaining']).toBe('2');
    });

    it('returns 400 when X-Device-Id is missing', async () => {
      const res = await request(app)
        .post('/api/ai/suggest')
        .send({ dishName: 'カレー' });
      expect(res.status).toBe(400);
      expect(askGeminiMock).not.toHaveBeenCalled();
    });

    it('returns 429 after exceeding AI_LIMIT_GUEST (3) for same device', async () => {
      const send = () => request(app)
        .post('/api/ai/suggest')
        .set('X-Device-Id', 'device-guest-limit')
        .send({ dishName: 'カレー' });

      await send().expect(200);
      await send().expect(200);
      await send().expect(200);
      const fourth = await send();
      expect(fourth.status).toBe(429);
      expect(fourth.body.error).toBe('ai_quota_exceeded');
      expect(fourth.body.resetAt).toEqual(expect.any(String));
    });

    it('counts quota per device (different devices are independent)', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app).post('/api/ai/suggest')
          .set('X-Device-Id', 'dev-a').send({ dishName: 'カレー' }).expect(200);
      }
      // dev-b は別カウント
      const res = await request(app).post('/api/ai/suggest')
        .set('X-Device-Id', 'dev-b').send({ dishName: 'カレー' });
      expect(res.status).toBe(200);
    });
  });

  describe('authenticated', () => {
    it('uses AI_LIMIT_USER (20) instead of guest limit', async () => {
      const { headers } = createAuthedUser('ai-user@example.com');
      const res = await request(app)
        .post('/api/ai/suggest')
        .set(headers)
        .send({ dishName: 'カレー' });
      expect(res.status).toBe(200);
      expect(res.headers['x-ai-remaining']).toBe('19');
    });
  });

  describe('limits driven by app_settings (DB)', () => {
    it('DB 値が env より優先される (guest を 1 に絞ると 2 回目で 429)', async () => {
      setAiLimits({ guest: 1 });
      const send = () => request(app)
        .post('/api/ai/suggest')
        .set('X-Device-Id', 'device-db-limited')
        .send({ dishName: 'カレー' });

      const first = await send();
      expect(first.status).toBe(200);
      expect(first.headers['x-ai-remaining']).toBe('0');

      const second = await send();
      expect(second.status).toBe(429);
      expect(second.body.error).toBe('ai_quota_exceeded');
    });

    it('user 上限を 1 にすると認証ユーザーも 2 回目で 429', async () => {
      setAiLimits({ user: 1 });
      const { headers } = createAuthedUser('limited-user@example.com');
      const send = () => request(app)
        .post('/api/ai/suggest')
        .set(headers)
        .send({ dishName: 'カレー' });

      await send().expect(200);
      const second = await send();
      expect(second.status).toBe(429);
    });

    it('limit を 0 にすると即 429 を返す (AI 機能の実質停止)', async () => {
      setAiLimits({ guest: 0 });
      const res = await request(app)
        .post('/api/ai/suggest')
        .set('X-Device-Id', 'device-zero-limit')
        .send({ dishName: 'カレー' });
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('ai_quota_exceeded');
    });
  });

  it('returns 400 when dishName is missing or blank', async () => {
    const missing = await request(app).post('/api/ai/suggest')
      .set('X-Device-Id', 'dev-validation').send({});
    expect(missing.status).toBe(400);

    const blank = await request(app).post('/api/ai/suggest')
      .set('X-Device-Id', 'dev-validation').send({ dishName: '   ' });
    expect(blank.status).toBe(400);
  });
});
