import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

describe('GET /api/health', () => {
  const app = createApp();

  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok' },
      error: null,
    });
  });

  it('attaches X-App-Version header on /api responses', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-app-version']).toBeDefined();
  });
});
