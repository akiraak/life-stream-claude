import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

describe('App routing (post PWA removal)', () => {
  const app = createApp();

  it('redirects GET / to /about with 301', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/about');
  });

  it('serves /about as HTML', async () => {
    const res = await request(app).get('/about');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('serves /privacy as HTML', async () => {
    const res = await request(app).get('/privacy');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('returns 404 for removed PWA assets', async () => {
    for (const p of ['/index.html', '/app.js', '/style.css', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon_dish.png']) {
      const res = await request(app).get(p);
      expect(res.status).toBe(404);
    }
  });

  it('still serves /img/ assets used by about.html', async () => {
    const res = await request(app).get('/img/icon-192.png');
    expect(res.status).toBe(200);
  });

  it('keeps X-App-Version header on /api responses', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-app-version']).toBeDefined();
  });
});
