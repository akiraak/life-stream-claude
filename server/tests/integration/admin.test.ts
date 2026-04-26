import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import {
  createCfAccessHeaders,
  startCfAccessStub,
  stopCfAccessStub,
} from '../helpers/auth';
import { _resetAiLimitsCacheForTest } from '../../src/services/settings-service';
import { getDatabase } from '../../src/database';

function jstDate(now: Date = new Date()): string {
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10);
}

setupTestDatabase();

// Cloudflare Access JWKS スタブを全テストで共有する
beforeAll(async () => {
  await startCfAccessStub();
});

afterAll(async () => {
  await stopCfAccessStub();
});

const createAdminHeaders = () => createCfAccessHeaders('admin@test.local');

describe('admin logs routes', () => {
  const app = createApp();

  describe('authorization', () => {
    it('returns 401 without Cf-Access-Jwt-Assertion header', async () => {
      const res = await request(app).get('/api/admin/logs');
      expect(res.status).toBe(401);
    });
  });

  describe('with a log file', () => {
    let logDir: string;
    let logFile: string;
    const prevLogPath = process.env.LOG_FILE_PATH;

    beforeEach(() => {
      logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-logs-test-'));
      logFile = path.join(logDir, 'server.log');
      process.env.LOG_FILE_PATH = logFile;
    });

    afterEach(() => {
      if (prevLogPath === undefined) {
        delete process.env.LOG_FILE_PATH;
      } else {
        process.env.LOG_FILE_PATH = prevLogPath;
      }
      try {
        fs.rmSync(logDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    const writeLines = (entries: object[]) => {
      fs.writeFileSync(
        logFile,
        entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
      );
    };

    describe('GET /api/admin/logs', () => {
      it('returns recent log entries in order', async () => {
        const headers = await createAdminHeaders();
        writeLines([
          { level: 30, time: 1, msg: 'first' },
          { level: 30, time: 2, msg: 'second' },
          { level: 40, time: 3, msg: 'third' },
        ]);

        const res = await request(app).get('/api/admin/logs').set(headers);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.map((e: { msg: string }) => e.msg)).toEqual([
          'first',
          'second',
          'third',
        ]);
      });

      it('limits by ?lines= and returns the last N', async () => {
        const headers = await createAdminHeaders();
        writeLines([
          { level: 30, msg: 'a' },
          { level: 30, msg: 'b' },
          { level: 30, msg: 'c' },
        ]);

        const res = await request(app).get('/api/admin/logs?lines=2').set(headers);
        expect(res.body.data.map((e: { msg: string }) => e.msg)).toEqual(['b', 'c']);
      });

      it('filters by ?level= (warn and above)', async () => {
        const headers = await createAdminHeaders();
        writeLines([
          { level: 30, msg: 'info-msg' },
          { level: 40, msg: 'warn-msg' },
          { level: 50, msg: 'error-msg' },
        ]);

        const res = await request(app)
          .get('/api/admin/logs?level=warn')
          .set(headers);
        expect(res.body.data.map((e: { msg: string }) => e.msg)).toEqual([
          'warn-msg',
          'error-msg',
        ]);
      });

      it('filters by ?q= case-insensitively', async () => {
        const headers = await createAdminHeaders();
        writeLines([
          { level: 30, msg: 'apple' },
          { level: 30, msg: 'Banana' },
        ]);

        const res = await request(app).get('/api/admin/logs?q=BAN').set(headers);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].msg).toBe('Banana');
      });

      it('skips non-JSON lines silently', async () => {
        const headers = await createAdminHeaders();
        fs.writeFileSync(
          logFile,
          'not json\n' + JSON.stringify({ level: 30, msg: 'ok' }) + '\n',
        );

        const res = await request(app).get('/api/admin/logs').set(headers);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].msg).toBe('ok');
      });

      it('resolves pino-roll dated filenames when base file does not exist', async () => {
        const headers = await createAdminHeaders();
        // pino-roll は `server.log` を `server.YYYY-MM-DD.N.log` に展開するのでそれを再現
        fs.writeFileSync(
          path.join(logDir, 'server.2026-04-23.1.log'),
          JSON.stringify({ level: 30, msg: 'from-rotated' }) + '\n',
        );

        const res = await request(app).get('/api/admin/logs').set(headers);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].msg).toBe('from-rotated');
      });

      it('returns an empty array when LOG_FILE_PATH is unset', async () => {
        const headers = await createAdminHeaders();
        delete process.env.LOG_FILE_PATH;
        const res = await request(app).get('/api/admin/logs').set(headers);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual([]);
      });
    });

    describe('GET /api/admin/logs/stream', () => {
      it('streams initial entries and tails new lines as SSE', async () => {
        const headers = await createAdminHeaders();
        writeLines([{ level: 30, msg: 'preexisting' }]);

        const server = app.listen(0);
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        const port = (server.address() as { port: number }).port;

        try {
          const received = await new Promise<string>((resolve, reject) => {
            const req = http.request(
              {
                hostname: '127.0.0.1',
                port,
                path: '/api/admin/logs/stream',
                method: 'GET',
                headers: {
                  'Cf-Access-Jwt-Assertion': headers['Cf-Access-Jwt-Assertion'],
                },
              },
              (res) => {
                try {
                  expect(res.statusCode).toBe(200);
                  expect(res.headers['content-type']).toMatch(/text\/event-stream/);
                } catch (err) {
                  reject(err);
                  return;
                }

                let buf = '';
                let appended = false;
                const timeout = setTimeout(() => {
                  req.destroy();
                  reject(new Error(`SSE timeout; received so far: ${buf}`));
                }, 5000);

                res.on('data', (chunk: Buffer) => {
                  buf += chunk.toString('utf-8');
                  // 初期バーストで preexisting を受けたら tail の検証用に 1 行追記する
                  if (!appended && buf.includes('preexisting')) {
                    appended = true;
                    fs.appendFileSync(
                      logFile,
                      JSON.stringify({ level: 30, msg: 'appended' }) + '\n',
                    );
                  }
                  if (buf.includes('appended')) {
                    clearTimeout(timeout);
                    req.destroy();
                    resolve(buf);
                  }
                });
                res.on('error', (err) => {
                  clearTimeout(timeout);
                  reject(err);
                });
              },
            );
            req.on('error', (err) => {
              // クライアント主導の destroy で出る ECONNRESET は無視
              if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
              reject(err);
            });
            req.end();
          });

          expect(received).toContain('preexisting');
          expect(received).toContain('appended');
          // SSE の 1 イベント = `data: ...\n\n`
          expect(received).toMatch(/^data: /m);
        } finally {
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
      }, 10000);

      it('returns 401 without Cf-Access-Jwt-Assertion on SSE connection', async () => {
        const res = await request(app).get('/api/admin/logs/stream');
        expect(res.status).toBe(401);
      });
    });
  });
});

describe('GET /api/admin/me', () => {
  const app = createApp();

  it('returns the admin email from the verified CF Access JWT', async () => {
    const headers = await createCfAccessHeaders('me-admin@test.local');
    const res = await request(app).get('/api/admin/me').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { email: 'me-admin@test.local' },
      error: null,
    });
  });

  it('returns 401 without Cf-Access-Jwt-Assertion header', async () => {
    const res = await request(app).get('/api/admin/me');
    expect(res.status).toBe(401);
  });
});

describe('admin AI limits routes', () => {
  const app = createApp();

  beforeEach(() => {
    _resetAiLimitsCacheForTest();
  });

  describe('GET /api/admin/ai-quota', () => {
    it('includes current limits in response', async () => {
      const headers = await createAdminHeaders();
      const res = await request(app).get('/api/admin/ai-quota').set(headers);
      expect(res.status).toBe(200);
      // tests/setup.ts: AI_LIMIT_USER=20, AI_LIMIT_GUEST=3 (DB 未設定なら env)
      expect(res.body.data.limits).toEqual({ user: 20, guest: 3 });
    });
  });

  describe('PUT /api/admin/ai-limits', () => {
    it('returns 401 without Cf-Access-Jwt-Assertion header', async () => {
      const res = await request(app).put('/api/admin/ai-limits').send({ user: 10 });
      expect(res.status).toBe(401);
    });

    it('updates limits and reflects new values in subsequent ai-quota GET', async () => {
      const headers = await createAdminHeaders();
      const put = await request(app)
        .put('/api/admin/ai-limits')
        .set(headers)
        .send({ user: 50, guest: 5 });
      expect(put.status).toBe(200);
      expect(put.body.data).toEqual({ user: 50, guest: 5 });

      const get = await request(app).get('/api/admin/ai-quota').set(headers);
      expect(get.body.data.limits).toEqual({ user: 50, guest: 5 });
    });

    it('allows partial update (only user)', async () => {
      const headers = await createAdminHeaders();
      const put = await request(app)
        .put('/api/admin/ai-limits')
        .set(headers)
        .send({ user: 99 });
      expect(put.status).toBe(200);
      expect(put.body.data.user).toBe(99);
      expect(put.body.data.guest).toBe(3); // env fallback unchanged
    });

    it('allows 0 (effectively disables AI)', async () => {
      const headers = await createAdminHeaders();
      const put = await request(app)
        .put('/api/admin/ai-limits')
        .set(headers)
        .send({ user: 0, guest: 0 });
      expect(put.status).toBe(200);
      expect(put.body.data).toEqual({ user: 0, guest: 0 });
    });

    it('returns 400 with invalid_ai_limit for negative numbers', async () => {
      const headers = await createAdminHeaders();
      const res = await request(app)
        .put('/api/admin/ai-limits')
        .set(headers)
        .send({ user: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_ai_limit');
    });

    it('returns 400 for non-integer values', async () => {
      const headers = await createAdminHeaders();
      const res = await request(app)
        .put('/api/admin/ai-limits')
        .set(headers)
        .send({ user: 1.5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_ai_limit');
    });

    it('returns 400 for string values', async () => {
      const headers = await createAdminHeaders();
      const res = await request(app)
        .put('/api/admin/ai-limits')
        .set(headers)
        .send({ user: '10' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_ai_limit');
    });

    it('returns 400 for values exceeding the cap', async () => {
      const headers = await createAdminHeaders();
      const res = await request(app)
        .put('/api/admin/ai-limits')
        .set(headers)
        .send({ user: 100001 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_ai_limit');
    });

    it('returns 400 when neither user nor guest is provided', async () => {
      const headers = await createAdminHeaders();
      const res = await request(app)
        .put('/api/admin/ai-limits')
        .set(headers)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_ai_limit');
    });
  });
});

describe('POST /api/admin/ai-quota/reset', () => {
  const app = createApp();
  const today = jstDate();
  const yesterday = jstDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const deviceHash = 'a'.repeat(64);

  function seed() {
    const db = getDatabase();
    const insert = db.prepare(
      'INSERT INTO ai_quota (key, date, count) VALUES (?, ?, ?)',
    );
    insert.run('user:1', today, 5);
    insert.run('user:2', today, 3);
    insert.run(`device:${deviceHash}`, today, 2);
    insert.run('user:1', yesterday, 9);
  }

  function todayKeys(): string[] {
    const db = getDatabase();
    return (
      db
        .prepare('SELECT key FROM ai_quota WHERE date = ? ORDER BY key')
        .all(today) as Array<{ key: string }>
    ).map((r) => r.key);
  }

  it('returns 401 without Cf-Access-Jwt-Assertion header', async () => {
    const res = await request(app)
      .post('/api/admin/ai-quota/reset')
      .send({ scope: 'all' });
    expect(res.status).toBe(401);
  });

  it("scope='all' clears today's todaySummary.total_calls", async () => {
    const headers = await createAdminHeaders();
    seed();

    const post = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'all' });
    expect(post.status).toBe(200);
    expect(post.body.data).toEqual({ scope: 'all', deleted: 3 });

    const get = await request(app).get('/api/admin/ai-quota').set(headers);
    expect(get.body.data.todaySummary.total_calls).toBe(0);
  });

  it("scope='user' leaves guest rows intact", async () => {
    const headers = await createAdminHeaders();
    seed();

    const post = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'user' });
    expect(post.status).toBe(200);
    expect(post.body.data).toEqual({ scope: 'user', deleted: 2 });
    expect(todayKeys()).toEqual([`device:${deviceHash}`]);
  });

  it("scope='guest' leaves user rows intact", async () => {
    const headers = await createAdminHeaders();
    seed();

    const post = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'guest' });
    expect(post.status).toBe(200);
    expect(post.body.data).toEqual({ scope: 'guest', deleted: 1 });
    expect(todayKeys()).toEqual(['user:1', 'user:2']);
  });

  it("scope='key' deletes only the specified key for today", async () => {
    const headers = await createAdminHeaders();
    seed();

    const post = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'key', key: 'user:1' });
    expect(post.status).toBe(200);
    expect(post.body.data).toEqual({ scope: 'key', deleted: 1 });
    expect(todayKeys()).toEqual([`device:${deviceHash}`, 'user:2']);
  });

  it('is idempotent: a second call returns deleted: 0 with 200', async () => {
    const headers = await createAdminHeaders();
    seed();

    const first = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'all' });
    expect(first.body.data.deleted).toBe(3);

    const second = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'all' });
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({ scope: 'all', deleted: 0 });
  });

  it("returns 400 invalid_scope for unknown scopes", async () => {
    const headers = await createAdminHeaders();
    const res = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'unknown' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_scope');
  });

  it("returns 400 invalid_scope when scope is missing", async () => {
    const headers = await createAdminHeaders();
    const res = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_scope');
  });

  it("returns 400 when scope='key' but key is missing", async () => {
    const headers = await createAdminHeaders();
    const res = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'key' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_scope');
  });

  it("returns 400 when scope='key' has malformed key", async () => {
    const headers = await createAdminHeaders();
    const res = await request(app)
      .post('/api/admin/ai-quota/reset')
      .set(headers)
      .send({ scope: 'key', key: 'foo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_scope');
  });
});
