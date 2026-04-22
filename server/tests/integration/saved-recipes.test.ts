import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { createAuthedUser } from '../helpers/auth';

setupTestDatabase();

const samplePayload = {
  dishName: 'カレー',
  title: '基本のビーフカレー',
  summary: '家庭的な王道カレー',
  steps: ['玉ねぎを炒める', '肉を加える', '煮込む'],
  ingredients: [
    { name: '玉ねぎ', category: '野菜' },
    { name: '牛肉', category: '肉類' },
  ],
};

describe('saved-recipes routes', () => {
  const app = createApp();

  describe('authentication', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await request(app).get('/api/saved-recipes');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/saved-recipes', () => {
    it('creates a saved recipe and returns 201', async () => {
      const { headers } = createAuthedUser('sr-create@example.com');
      const res = await request(app)
        .post('/api/saved-recipes')
        .set(headers)
        .send(samplePayload);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(Number),
          dish_name: 'カレー',
          title: '基本のビーフカレー',
          like_count: 0,
          liked: 0,
        },
        error: null,
      });
      // steps / ingredients は JSON 文字列として保存される
      expect(JSON.parse(res.body.data.steps_json)).toEqual(samplePayload.steps);
      expect(JSON.parse(res.body.data.ingredients_json)).toEqual(samplePayload.ingredients);
    });

    it('returns 400 when dishName or title is missing', async () => {
      const { headers } = createAuthedUser('sr-bad@example.com');
      const noTitle = await request(app)
        .post('/api/saved-recipes')
        .set(headers)
        .send({ ...samplePayload, title: '' });
      expect(noTitle.status).toBe(400);

      const noDish = await request(app)
        .post('/api/saved-recipes')
        .set(headers)
        .send({ ...samplePayload, dishName: '' });
      expect(noDish.status).toBe(400);
    });
  });

  describe('GET /api/saved-recipes', () => {
    it('returns only the current user recipes', async () => {
      const alice = createAuthedUser('sr-alice@example.com');
      const bob = createAuthedUser('sr-bob@example.com');

      await request(app)
        .post('/api/saved-recipes')
        .set(alice.headers)
        .send({ ...samplePayload, title: 'Aliceの' });
      await request(app)
        .post('/api/saved-recipes')
        .set(bob.headers)
        .send({ ...samplePayload, title: 'Bobの' });

      const aliceRes = await request(app).get('/api/saved-recipes').set(alice.headers);
      expect(aliceRes.body.data.map((r: { title: string }) => r.title)).toEqual(['Aliceの']);
    });
  });

  describe('GET /api/saved-recipes/:id', () => {
    it('returns the recipe by id', async () => {
      const { headers } = createAuthedUser('sr-get@example.com');
      const created = await request(app)
        .post('/api/saved-recipes')
        .set(headers)
        .send(samplePayload);

      const res = await request(app)
        .get(`/api/saved-recipes/${created.body.data.id}`)
        .set(headers);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(created.body.data.id);
    });

    it('returns 404 for a non-existent recipe', async () => {
      const { headers } = createAuthedUser('sr-404@example.com');
      const res = await request(app).get('/api/saved-recipes/999999').set(headers);
      expect(res.status).toBe(404);
    });

    it("returns 404 when fetching another user's recipe", async () => {
      const alice = createAuthedUser('sr-scope-a@example.com');
      const bob = createAuthedUser('sr-scope-b@example.com');
      const aliceRecipe = await request(app)
        .post('/api/saved-recipes')
        .set(alice.headers)
        .send(samplePayload);

      const res = await request(app)
        .get(`/api/saved-recipes/${aliceRecipe.body.data.id}`)
        .set(bob.headers);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/saved-recipes/:id/like', () => {
    it('toggles like on and off, updating like_count', async () => {
      const { headers } = createAuthedUser('sr-like@example.com');
      const created = await request(app)
        .post('/api/saved-recipes')
        .set(headers)
        .send(samplePayload);
      const id = created.body.data.id;

      const on = await request(app).put(`/api/saved-recipes/${id}/like`).set(headers);
      expect(on.status).toBe(200);
      expect(on.body.data).toEqual({ liked: 1, like_count: 1 });

      const off = await request(app).put(`/api/saved-recipes/${id}/like`).set(headers);
      expect(off.body.data).toEqual({ liked: 0, like_count: 0 });
    });

    it('returns 404 for a non-existent recipe', async () => {
      const { headers } = createAuthedUser('sr-like-404@example.com');
      const res = await request(app).put('/api/saved-recipes/999999/like').set(headers);
      expect(res.status).toBe(404);
    });

    it('aggregates likes from multiple users', async () => {
      const alice = createAuthedUser('sr-multi-a@example.com');
      const bob = createAuthedUser('sr-multi-b@example.com');
      const carol = createAuthedUser('sr-multi-c@example.com');

      const recipe = await request(app)
        .post('/api/saved-recipes')
        .set(alice.headers)
        .send(samplePayload);
      const id = recipe.body.data.id;

      await request(app).put(`/api/saved-recipes/${id}/like`).set(alice.headers);
      await request(app).put(`/api/saved-recipes/${id}/like`).set(bob.headers);
      const last = await request(app)
        .put(`/api/saved-recipes/${id}/like`)
        .set(carol.headers);
      expect(last.body.data.like_count).toBe(3);
    });
  });

  describe('GET /api/saved-recipes/shared', () => {
    it('returns recipes that have at least one like, across users, with liked reflecting the caller', async () => {
      const alice = createAuthedUser('sr-shared-a@example.com');
      const bob = createAuthedUser('sr-shared-b@example.com');

      // Alice の 2 件: liked と unliked
      const liked = await request(app)
        .post('/api/saved-recipes')
        .set(alice.headers)
        .send({ ...samplePayload, title: 'liked-one' });
      await request(app)
        .post('/api/saved-recipes')
        .set(alice.headers)
        .send({ ...samplePayload, title: 'unliked-one' });

      // Bob が liked に "いいね"
      await request(app).put(`/api/saved-recipes/${liked.body.data.id}/like`).set(bob.headers);

      // Alice 視点の shared 一覧
      const aliceShared = await request(app).get('/api/saved-recipes/shared').set(alice.headers);
      expect(aliceShared.status).toBe(200);
      expect(aliceShared.body.data).toHaveLength(1);
      expect(aliceShared.body.data[0]).toMatchObject({
        title: 'liked-one',
        like_count: 1,
        liked: 0, // Alice 自身はいいねしていない
      });

      // Bob 視点: liked=1 に切り替わる
      const bobShared = await request(app).get('/api/saved-recipes/shared').set(bob.headers);
      expect(bobShared.body.data[0].liked).toBe(1);
    });

    it('returns an empty list when nothing has been liked', async () => {
      const { headers } = createAuthedUser('sr-shared-empty@example.com');
      await request(app).post('/api/saved-recipes').set(headers).send(samplePayload);
      const res = await request(app).get('/api/saved-recipes/shared').set(headers);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('DELETE /api/saved-recipes/:id', () => {
    it('deletes the recipe', async () => {
      const { headers } = createAuthedUser('sr-del@example.com');
      const created = await request(app)
        .post('/api/saved-recipes')
        .set(headers)
        .send(samplePayload);

      const res = await request(app)
        .delete(`/api/saved-recipes/${created.body.data.id}`)
        .set(headers);
      expect(res.status).toBe(200);

      const get = await request(app)
        .get(`/api/saved-recipes/${created.body.data.id}`)
        .set(headers);
      expect(get.status).toBe(404);
    });

    it('returns 404 for a non-existent recipe', async () => {
      const { headers } = createAuthedUser('sr-del-404@example.com');
      const res = await request(app).delete('/api/saved-recipes/999999').set(headers);
      expect(res.status).toBe(404);
    });
  });
});
