import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { createAuthedUser } from '../helpers/auth';

setupTestDatabase();

describe('POST /api/migrate', () => {
  const app = createApp();

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).post('/api/migrate').send({});
    expect(res.status).toBe(401);
  });

  it('imports items, dishes, savedRecipes and returns id maps', async () => {
    const { headers } = createAuthedUser('migrate@example.com');

    const body = {
      dishes: [
        { localId: 'd1', name: 'カレー', ingredients: [{ name: '玉ねぎ', category: '野菜' }], recipes: [] },
        { localId: 'd2', name: 'サラダ' },
      ],
      items: [
        { localId: 'i1', name: '玉ねぎ', category: '野菜', dishLocalId: 'd1' },
        { localId: 'i2', name: 'トマト', category: '野菜', dishLocalId: 'd2' },
        { localId: 'i3', name: 'パン' },
      ],
      savedRecipes: [
        {
          localId: 'r1',
          dishName: 'カレー',
          title: '基本のカレー',
          summary: '王道',
          steps: ['切る', '煮る'],
          ingredients: [{ name: '玉ねぎ', category: '野菜' }],
          sourceDishLocalId: 'd1',
        },
      ],
    };

    const res = await request(app).post('/api/migrate').set(headers).send(body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body.data.dishIdMap)).toEqual(['d1', 'd2']);
    expect(Object.keys(res.body.data.itemIdMap)).toEqual(['i1', 'i2', 'i3']);
    expect(Object.keys(res.body.data.savedRecipeIdMap)).toEqual(['r1']);

    // サーバ側に反映されている
    const dishes = await request(app).get('/api/dishes').set(headers);
    expect(dishes.body.data.map((d: { name: string }) => d.name).sort()).toEqual(['カレー', 'サラダ']);

    const recipes = await request(app).get('/api/saved-recipes').set(headers);
    expect(recipes.body.data).toHaveLength(1);
    expect(recipes.body.data[0].title).toBe('基本のカレー');

    // dishLocalId → dish_id で item が正しくリンクされている
    const carryDishId = res.body.data.dishIdMap['d1'];
    const carry = dishes.body.data.find((d: { id: number }) => d.id === carryDishId);
    expect(carry.items.map((i: { name: string }) => i.name)).toEqual(['玉ねぎ']);
  });

  it('accepts empty body and returns empty maps', async () => {
    const { headers } = createAuthedUser('migrate-empty@example.com');
    const res = await request(app).post('/api/migrate').set(headers).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.dishIdMap).toEqual({});
    expect(res.body.data.itemIdMap).toEqual({});
    expect(res.body.data.savedRecipeIdMap).toEqual({});
  });

  it('isolates imported data per user', async () => {
    const alice = createAuthedUser('migrate-a@example.com');
    const bob = createAuthedUser('migrate-b@example.com');

    await request(app).post('/api/migrate').set(alice.headers).send({
      dishes: [{ localId: 'd1', name: 'アリス料理' }],
    }).expect(201);

    const bobDishes = await request(app).get('/api/dishes').set(bob.headers);
    expect(bobDishes.body.data).toEqual([]);
  });
});
