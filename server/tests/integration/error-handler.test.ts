import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { createAuthedUser } from '../helpers/auth';
import * as dishService from '../../src/services/dish-service';
import { errorHandler } from '../../src/middleware/error-handler';

setupTestDatabase();

describe('errorHandler fallback', () => {
  const app = createApp();

  it('masks 500-class Error messages so internal details do not leak', async () => {
    const { headers } = createAuthedUser('error-handler@example.com');
    const spy = vi.spyOn(dishService, 'getAllDishes').mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app).get('/api/dishes').set(headers);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('Internal Server Error');

    spy.mockRestore();
  });

  it('falls back to "Internal Server Error" when thrown Error has no message', async () => {
    const { headers } = createAuthedUser('error-handler-blank@example.com');
    const spy = vi.spyOn(dishService, 'getAllDishes').mockImplementation(() => {
      throw new Error('');
    });

    const res = await request(app).get('/api/dishes').set(headers);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: 'Internal Server Error',
    });

    spy.mockRestore();
  });

  // err.status / err.expose を尊重する分岐は実 API を介さず最小構成で検証する。
  // body-parser の PayloadTooLargeError や http-errors 互換ライブラリが
  // 同じ形のエラーを投げてくる前提。
  it('respects err.status and exposes message when err.expose is true', async () => {
    const miniApp = express();
    miniApp.get('/boom', (_req, _res, next) => {
      const err = Object.assign(new Error('bad input from client'), {
        status: 400,
        expose: true,
      });
      next(err);
    });
    miniApp.use(errorHandler);

    const res = await request(miniApp).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: 'bad input from client',
    });
  });

  it('uses err.status but still masks message when err.expose is not true', async () => {
    const miniApp = express();
    miniApp.get('/boom', (_req, _res, next) => {
      // status だけ付いて expose が無い系（自前で投げた未分類エラー）。
      // クライアントには文言を出さず、ステータスだけ尊重する。
      const err = Object.assign(new Error('internal detail'), { status: 503 });
      next(err);
    });
    miniApp.use(errorHandler);

    const res = await request(miniApp).get('/boom');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Internal Server Error');
  });
});
