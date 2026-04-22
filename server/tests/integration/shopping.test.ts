import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { createAuthedUser } from '../helpers/auth';
import { recordPurchase } from '../../src/services/shopping-service';

setupTestDatabase();

describe('shopping routes', () => {
  const app = createApp();

  describe('authentication', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await request(app).get('/api/shopping');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for a malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/shopping')
        .set('Authorization', 'NotBearer xxx');
      expect(res.status).toBe(401);
    });

    it('returns 401 for a bad Bearer token', async () => {
      const res = await request(app)
        .get('/api/shopping')
        .set('Authorization', 'Bearer bogus.token');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/shopping', () => {
    it('creates an item and returns 201', async () => {
      const { headers } = createAuthedUser('create@example.com');
      const res = await request(app)
        .post('/api/shopping')
        .set(headers)
        .send({ name: '牛乳', category: '乳製品' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(Number),
          name: '牛乳',
          category: '乳製品',
          checked: 0,
        },
        error: null,
      });
    });

    it('returns 400 when name is missing or blank', async () => {
      const { headers } = createAuthedUser('blank@example.com');
      const missing = await request(app).post('/api/shopping').set(headers).send({});
      expect(missing.status).toBe(400);

      const blank = await request(app)
        .post('/api/shopping')
        .set(headers)
        .send({ name: '   ' });
      expect(blank.status).toBe(400);
    });

    it('trims whitespace in the name', async () => {
      const { headers } = createAuthedUser('trim@example.com');
      const res = await request(app)
        .post('/api/shopping')
        .set(headers)
        .send({ name: '  パン  ' });
      expect(res.body.data.name).toBe('パン');
    });
  });

  describe('GET /api/shopping', () => {
    it('returns only the current user items (no cross-user leakage)', async () => {
      const alice = createAuthedUser('alice@example.com');
      const bob = createAuthedUser('bob@example.com');

      await request(app).post('/api/shopping').set(alice.headers).send({ name: 'A' });
      await request(app).post('/api/shopping').set(bob.headers).send({ name: 'B' });

      const aliceRes = await request(app).get('/api/shopping').set(alice.headers);
      const bobRes = await request(app).get('/api/shopping').set(bob.headers);

      expect(aliceRes.body.data.map((i: { name: string }) => i.name)).toEqual(['A']);
      expect(bobRes.body.data.map((i: { name: string }) => i.name)).toEqual(['B']);
    });
  });

  describe('PUT /api/shopping/:id', () => {
    it('updates checked and returns the latest row', async () => {
      const { headers } = createAuthedUser('upd@example.com');
      const created = await request(app)
        .post('/api/shopping')
        .set(headers)
        .send({ name: 'バター' });
      const id = created.body.data.id;

      const res = await request(app)
        .put(`/api/shopping/${id}`)
        .set(headers)
        .send({ checked: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id, checked: 1, name: 'バター' });
    });

    it('returns 404 when the item does not exist', async () => {
      const { headers } = createAuthedUser('nf@example.com');
      const res = await request(app)
        .put('/api/shopping/999999')
        .set(headers)
        .send({ checked: 1 });
      expect(res.status).toBe(404);
    });

    it("returns 404 when updating another user's item", async () => {
      const alice = createAuthedUser('alice2@example.com');
      const bob = createAuthedUser('bob2@example.com');
      const aliceItem = await request(app)
        .post('/api/shopping')
        .set(alice.headers)
        .send({ name: 'secret' });

      const res = await request(app)
        .put(`/api/shopping/${aliceItem.body.data.id}`)
        .set(bob.headers)
        .send({ name: 'hijack' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/shopping/:id', () => {
    it('deletes the item', async () => {
      const { headers } = createAuthedUser('del@example.com');
      const created = await request(app)
        .post('/api/shopping')
        .set(headers)
        .send({ name: 'X' });

      const res = await request(app)
        .delete(`/api/shopping/${created.body.data.id}`)
        .set(headers);
      expect(res.status).toBe(200);

      const list = await request(app).get('/api/shopping').set(headers);
      expect(list.body.data).toHaveLength(0);
    });

    it('returns 404 when the item does not exist', async () => {
      const { headers } = createAuthedUser('del2@example.com');
      const res = await request(app).delete('/api/shopping/999999').set(headers);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/shopping/checked', () => {
    it('deletes all checked items and returns the count', async () => {
      const { headers } = createAuthedUser('bulk@example.com');
      const a = await request(app).post('/api/shopping').set(headers).send({ name: 'A' });
      const b = await request(app).post('/api/shopping').set(headers).send({ name: 'B' });
      await request(app).post('/api/shopping').set(headers).send({ name: 'C' });

      await request(app)
        .put(`/api/shopping/${a.body.data.id}`)
        .set(headers)
        .send({ checked: 1 });
      await request(app)
        .put(`/api/shopping/${b.body.data.id}`)
        .set(headers)
        .send({ checked: 1 });

      const res = await request(app).delete('/api/shopping/checked').set(headers);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: 2 });

      const list = await request(app).get('/api/shopping').set(headers);
      expect(list.body.data.map((i: { name: string }) => i.name)).toEqual(['C']);
    });
  });

  describe('PUT /api/shopping/reorder', () => {
    it('reorders items to match the provided id order', async () => {
      const { headers } = createAuthedUser('reorder@example.com');
      const a = await request(app).post('/api/shopping').set(headers).send({ name: 'A' });
      const b = await request(app).post('/api/shopping').set(headers).send({ name: 'B' });
      const c = await request(app).post('/api/shopping').set(headers).send({ name: 'C' });

      // 作成直後は C, B, A の並び（新しいほど先頭）
      // A, B, C の順に並べ替える
      const res = await request(app)
        .put('/api/shopping/reorder')
        .set(headers)
        .send({ orderedIds: [a.body.data.id, b.body.data.id, c.body.data.id] });
      expect(res.status).toBe(200);

      const list = await request(app).get('/api/shopping').set(headers);
      expect(list.body.data.map((i: { name: string }) => i.name)).toEqual(['A', 'B', 'C']);
    });

    it('returns 400 when orderedIds is not an array', async () => {
      const { headers } = createAuthedUser('reorder2@example.com');
      const res = await request(app)
        .put('/api/shopping/reorder')
        .set(headers)
        .send({ orderedIds: 'nope' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/shopping/suggestions', () => {
    it('returns purchase history excluding items already in the cart (unchecked)', async () => {
      const { user, headers } = createAuthedUser('sug@example.com');
      recordPurchase(user.id, '牛乳');
      recordPurchase(user.id, '牛乳');
      recordPurchase(user.id, 'パン');

      // 牛乳はカートにあるので除外される
      await request(app).post('/api/shopping').set(headers).send({ name: '牛乳' });

      const res = await request(app).get('/api/shopping/suggestions').set(headers);
      const names = res.body.data.map((s: { name: string }) => s.name);
      expect(names).toContain('パン');
      expect(names).not.toContain('牛乳');
    });

    it('filters by ?q= prefix', async () => {
      const { user, headers } = createAuthedUser('qfilter@example.com');
      recordPurchase(user.id, 'Apple');
      recordPurchase(user.id, 'avocado');
      recordPurchase(user.id, 'Banana');

      const res = await request(app).get('/api/shopping/suggestions?q=a').set(headers);
      const names = res.body.data.map((s: { name: string }) => s.name).sort();
      expect(names).toEqual(['Apple', 'avocado']);
    });
  });
});
