import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { createAuthedUser } from '../helpers/auth';

setupTestDatabase();

// Gemini 呼び出しを含む /:id/suggest-ingredients は Phase 3 対象外（no-login 移行で廃止予定）。
// ここでは CRUD / 食材リンク / reorder のみカバーする。

describe('dishes routes', () => {
  const app = createApp();

  describe('authentication', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await request(app).get('/api/dishes');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/dishes', () => {
    it('creates a dish and returns 201', async () => {
      const { headers } = createAuthedUser('dish-create@example.com');
      const res = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: 'カレー' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(Number),
          name: 'カレー',
          items: [],
        },
        error: null,
      });
    });

    it('returns 400 when name is missing or blank', async () => {
      const { headers } = createAuthedUser('dish-blank@example.com');
      const missing = await request(app).post('/api/dishes').set(headers).send({});
      expect(missing.status).toBe(400);

      const blank = await request(app).post('/api/dishes').set(headers).send({ name: '   ' });
      expect(blank.status).toBe(400);
    });
  });

  describe('GET /api/dishes', () => {
    it('returns only the current user dishes', async () => {
      const alice = createAuthedUser('dish-alice@example.com');
      const bob = createAuthedUser('dish-bob@example.com');

      await request(app).post('/api/dishes').set(alice.headers).send({ name: 'アリスの料理' });
      await request(app).post('/api/dishes').set(bob.headers).send({ name: 'ボブの料理' });

      const aliceRes = await request(app).get('/api/dishes').set(alice.headers);
      const bobRes = await request(app).get('/api/dishes').set(bob.headers);

      expect(aliceRes.body.data.map((d: { name: string }) => d.name)).toEqual(['アリスの料理']);
      expect(bobRes.body.data.map((d: { name: string }) => d.name)).toEqual(['ボブの料理']);
    });
  });

  describe('PUT /api/dishes/:id', () => {
    it('renames a dish', async () => {
      const { headers } = createAuthedUser('dish-rename@example.com');
      const created = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: '旧名' });

      const res = await request(app)
        .put(`/api/dishes/${created.body.data.id}`)
        .set(headers)
        .send({ name: '新名' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('新名');
    });

    it('returns 400 when new name is blank', async () => {
      const { headers } = createAuthedUser('dish-rename2@example.com');
      const created = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: 'A' });

      const res = await request(app)
        .put(`/api/dishes/${created.body.data.id}`)
        .set(headers)
        .send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for a non-existent dish', async () => {
      const { headers } = createAuthedUser('dish-rename3@example.com');
      const res = await request(app)
        .put('/api/dishes/999999')
        .set(headers)
        .send({ name: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/dishes/:id', () => {
    it('soft-deletes the dish (it disappears from GET /api/dishes)', async () => {
      const { headers } = createAuthedUser('dish-del@example.com');
      const created = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: 'delete-me' });

      const del = await request(app)
        .delete(`/api/dishes/${created.body.data.id}`)
        .set(headers);
      expect(del.status).toBe(200);

      const list = await request(app).get('/api/dishes').set(headers);
      expect(list.body.data).toHaveLength(0);
    });

    it('returns 404 for a non-existent dish', async () => {
      const { headers } = createAuthedUser('dish-del2@example.com');
      const res = await request(app).delete('/api/dishes/999999').set(headers);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/dishes/:id/items (link) and DELETE /api/dishes/:id/items/:itemId (unlink)', () => {
    it('links an existing shopping item to a dish, then unlinks it', async () => {
      const { headers } = createAuthedUser('dish-link@example.com');
      const dish = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: '肉じゃが' });
      const item = await request(app)
        .post('/api/shopping')
        .set(headers)
        .send({ name: 'じゃがいも' });

      const linkRes = await request(app)
        .post(`/api/dishes/${dish.body.data.id}/items`)
        .set(headers)
        .send({ itemId: item.body.data.id });
      expect(linkRes.status).toBe(200);
      expect(linkRes.body.data.items.map((i: { name: string }) => i.name)).toEqual(['じゃがいも']);

      const unlinkRes = await request(app)
        .delete(`/api/dishes/${dish.body.data.id}/items/${item.body.data.id}`)
        .set(headers);
      expect(unlinkRes.status).toBe(200);

      const listed = await request(app).get('/api/dishes').set(headers);
      const target = listed.body.data.find((d: { id: number }) => d.id === dish.body.data.id);
      expect(target.items).toEqual([]);
    });

    it('returns 400 when itemId is missing on link', async () => {
      const { headers } = createAuthedUser('dish-link2@example.com');
      const dish = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: 'a' });
      const res = await request(app)
        .post(`/api/dishes/${dish.body.data.id}/items`)
        .set(headers)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 when unlinking a non-linked item', async () => {
      const { headers } = createAuthedUser('dish-unlink@example.com');
      const dish = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: 'a' });
      const res = await request(app)
        .delete(`/api/dishes/${dish.body.data.id}/items/999999`)
        .set(headers);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/dishes/reorder', () => {
    it('reorders dishes to match the provided id order', async () => {
      const { headers } = createAuthedUser('dish-reorder@example.com');
      const a = await request(app).post('/api/dishes').set(headers).send({ name: 'A' });
      const b = await request(app).post('/api/dishes').set(headers).send({ name: 'B' });
      const c = await request(app).post('/api/dishes').set(headers).send({ name: 'C' });

      const res = await request(app)
        .put('/api/dishes/reorder')
        .set(headers)
        .send({ orderedIds: [a.body.data.id, b.body.data.id, c.body.data.id] });
      expect(res.status).toBe(200);

      const list = await request(app).get('/api/dishes').set(headers);
      expect(list.body.data.map((d: { name: string }) => d.name)).toEqual(['A', 'B', 'C']);
    });

    it('returns 400 when orderedIds is not an array', async () => {
      const { headers } = createAuthedUser('dish-reorder2@example.com');
      const res = await request(app)
        .put('/api/dishes/reorder')
        .set(headers)
        .send({ orderedIds: 'nope' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/dishes/:id/items/reorder', () => {
    it('reorders items within a dish', async () => {
      const { headers } = createAuthedUser('dish-items-reorder@example.com');
      const dish = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: 'サラダ' });
      const i1 = await request(app).post('/api/shopping').set(headers).send({ name: 'レタス' });
      const i2 = await request(app).post('/api/shopping').set(headers).send({ name: 'トマト' });
      const i3 = await request(app).post('/api/shopping').set(headers).send({ name: 'きゅうり' });

      for (const item of [i1, i2, i3]) {
        await request(app)
          .post(`/api/dishes/${dish.body.data.id}/items`)
          .set(headers)
          .send({ itemId: item.body.data.id });
      }

      // 明示的に i1 → i2 → i3 の順に並べ替える
      const res = await request(app)
        .put(`/api/dishes/${dish.body.data.id}/items/reorder`)
        .set(headers)
        .send({
          orderedItemIds: [i1.body.data.id, i2.body.data.id, i3.body.data.id],
        });
      expect(res.status).toBe(200);

      const list = await request(app).get('/api/dishes').set(headers);
      const target = list.body.data.find(
        (d: { id: number }) => d.id === dish.body.data.id,
      );
      expect(target.items.map((i: { name: string }) => i.name)).toEqual([
        'レタス',
        'トマト',
        'きゅうり',
      ]);
    });

    it('returns 400 when orderedItemIds is not an array', async () => {
      const { headers } = createAuthedUser('dish-items-reorder2@example.com');
      const dish = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: 'a' });
      const res = await request(app)
        .put(`/api/dishes/${dish.body.data.id}/items/reorder`)
        .set(headers)
        .send({ orderedItemIds: 'nope' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/dishes/suggestions', () => {
    it('returns previously used dish names from inactive (deleted) dishes', async () => {
      const { headers } = createAuthedUser('dish-sug@example.com');
      const created = await request(app)
        .post('/api/dishes')
        .set(headers)
        .send({ name: 'カレー' });
      // 削除するとサジェスト候補に回る
      await request(app).delete(`/api/dishes/${created.body.data.id}`).set(headers);

      const res = await request(app).get('/api/dishes/suggestions').set(headers);
      expect(res.status).toBe(200);
      expect(res.body.data.map((s: { name: string }) => s.name)).toContain('カレー');
    });
  });
});
