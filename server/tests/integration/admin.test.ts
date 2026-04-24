import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import request from 'supertest';
import { createApp } from '../helpers/app';
import { setupTestDatabase } from '../helpers/db';
import { createAuthedUser } from '../helpers/auth';

setupTestDatabase();

describe('admin logs routes', () => {
  const app = createApp();

  // tests/setup.ts: ADMIN_EMAILS = 'admin@test.local'
  const createAdmin = () => createAuthedUser('admin@test.local');

  describe('authorization', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await request(app).get('/api/admin/logs');
      expect(res.status).toBe(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const { headers } = createAuthedUser('not-admin@example.com');
      const res = await request(app).get('/api/admin/logs').set(headers);
      expect(res.status).toBe(403);
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
        const { headers } = createAdmin();
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
        const { headers } = createAdmin();
        writeLines([
          { level: 30, msg: 'a' },
          { level: 30, msg: 'b' },
          { level: 30, msg: 'c' },
        ]);

        const res = await request(app).get('/api/admin/logs?lines=2').set(headers);
        expect(res.body.data.map((e: { msg: string }) => e.msg)).toEqual(['b', 'c']);
      });

      it('filters by ?level= (warn and above)', async () => {
        const { headers } = createAdmin();
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
        const { headers } = createAdmin();
        writeLines([
          { level: 30, msg: 'apple' },
          { level: 30, msg: 'Banana' },
        ]);

        const res = await request(app).get('/api/admin/logs?q=BAN').set(headers);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].msg).toBe('Banana');
      });

      it('skips non-JSON lines silently', async () => {
        const { headers } = createAdmin();
        fs.writeFileSync(
          logFile,
          'not json\n' + JSON.stringify({ level: 30, msg: 'ok' }) + '\n',
        );

        const res = await request(app).get('/api/admin/logs').set(headers);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].msg).toBe('ok');
      });

      it('resolves pino-roll dated filenames when base file does not exist', async () => {
        const { headers } = createAdmin();
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
        const { headers } = createAdmin();
        delete process.env.LOG_FILE_PATH;
        const res = await request(app).get('/api/admin/logs').set(headers);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual([]);
      });
    });

    describe('GET /api/admin/logs/stream', () => {
      it('streams initial entries and tails new lines as SSE', async () => {
        const { headers } = createAdmin();
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
                headers: { Authorization: headers.Authorization },
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

      it('returns 403 for a non-admin SSE connection', async () => {
        const { headers } = createAuthedUser('stream-not-admin@example.com');
        const res = await request(app)
          .get('/api/admin/logs/stream')
          .set(headers);
        expect(res.status).toBe(403);
      });
    });
  });
});
