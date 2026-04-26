import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { requireCloudflareAccess } from '../../src/middleware/cloudflare-access';
import {
  createCfAccessHeaders,
  startCfAccessStub,
  stopCfAccessStub,
} from '../helpers/auth';

/**
 * `requireCloudflareAccess` を単独で当てたダミー Express アプリ。
 * Phase 3 で実ルートに付け替える前に、ミドルウェア単体の振る舞いを検証する。
 */
function buildApp(): Express {
  const app = express();
  app.get('/__test/admin', requireCloudflareAccess, (req, res) => {
    res.json({ adminEmail: req.adminEmail ?? null });
  });
  return app;
}

describe('requireCloudflareAccess middleware', () => {
  const ORIGINAL_ENV = {
    NODE_ENV: process.env.NODE_ENV,
    CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
    CF_ACCESS_AUD: process.env.CF_ACCESS_AUD,
    ADMIN_AUTH_DEV_BYPASS: process.env.ADMIN_AUTH_DEV_BYPASS,
    ADMIN_AUTH_DEV_EMAIL: process.env.ADMIN_AUTH_DEV_EMAIL,
  };

  beforeAll(async () => {
    await startCfAccessStub('cf-access-test-aud');
  });

  afterAll(async () => {
    await stopCfAccessStub();
    // 環境変数を元に戻す
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => {
    delete process.env.ADMIN_AUTH_DEV_BYPASS;
    delete process.env.ADMIN_AUTH_DEV_EMAIL;
    process.env.NODE_ENV = 'test';
  });

  describe('正常系', () => {
    it('有効な JWT を受理し req.adminEmail を埋める', async () => {
      const headers = await createCfAccessHeaders('admin@test.local');
      const res = await request(buildApp()).get('/__test/admin').set(headers);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ adminEmail: 'admin@test.local' });
    });
  });

  describe('検証失敗', () => {
    it('Cf-Access-Jwt-Assertion ヘッダが無いと 401', async () => {
      const res = await request(buildApp()).get('/__test/admin');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false });
    });

    it('aud が一致しないと 401', async () => {
      const headers = await createCfAccessHeaders('admin@test.local', {
        audience: 'wrong-aud',
      });
      const res = await request(buildApp()).get('/__test/admin').set(headers);
      expect(res.status).toBe(401);
    });

    it('iss が一致しないと 401', async () => {
      const headers = await createCfAccessHeaders('admin@test.local', {
        issuer: 'https://attacker.example.com',
      });
      const res = await request(buildApp()).get('/__test/admin').set(headers);
      expect(res.status).toBe(401);
    });

    it('期限切れトークンは 401', async () => {
      const past = Math.floor(Date.now() / 1000) - 60;
      const headers = await createCfAccessHeaders('admin@test.local', {
        expSeconds: past,
      });
      const res = await request(buildApp()).get('/__test/admin').set(headers);
      expect(res.status).toBe(401);
    });

    it('JWKS に無い別の鍵で署名されたトークンは 401', async () => {
      const headers = await createCfAccessHeaders('admin@test.local', {
        useForeignKey: true,
      });
      const res = await request(buildApp()).get('/__test/admin').set(headers);
      expect(res.status).toBe(401);
    });

    it('alg=none を含む unsigned JWT は 401', async () => {
      const headers = await createCfAccessHeaders('admin@test.local', {
        algNone: true,
      });
      const res = await request(buildApp()).get('/__test/admin').set(headers);
      expect(res.status).toBe(401);
    });

    it('CF_ACCESS_TEAM_DOMAIN が未設定だと 401', async () => {
      const saved = process.env.CF_ACCESS_TEAM_DOMAIN;
      delete process.env.CF_ACCESS_TEAM_DOMAIN;
      try {
        const headers = await createCfAccessHeaders('admin@test.local');
        const res = await request(buildApp()).get('/__test/admin').set(headers);
        expect(res.status).toBe(401);
      } finally {
        process.env.CF_ACCESS_TEAM_DOMAIN = saved;
      }
    });

    it('CF_ACCESS_AUD が未設定だと 401', async () => {
      const saved = process.env.CF_ACCESS_AUD;
      delete process.env.CF_ACCESS_AUD;
      try {
        const headers = await createCfAccessHeaders('admin@test.local');
        const res = await request(buildApp()).get('/__test/admin').set(headers);
        expect(res.status).toBe(401);
      } finally {
        process.env.CF_ACCESS_AUD = saved;
      }
    });
  });

  describe('dev バイパス（白リスト判定）', () => {
    afterEach(() => {
      process.env.NODE_ENV = 'test';
      delete process.env.ADMIN_AUTH_DEV_BYPASS;
      delete process.env.ADMIN_AUTH_DEV_EMAIL;
    });

    it("NODE_ENV='development' + ADMIN_AUTH_DEV_BYPASS=1 でバイパスが効く", async () => {
      process.env.NODE_ENV = 'development';
      process.env.ADMIN_AUTH_DEV_BYPASS = '1';
      const res = await request(buildApp()).get('/__test/admin');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ adminEmail: 'dev-admin@local' });
    });

    it("NODE_ENV='test' + ADMIN_AUTH_DEV_BYPASS=1 でバイパスが効く（ADMIN_AUTH_DEV_EMAIL も反映）", async () => {
      process.env.NODE_ENV = 'test';
      process.env.ADMIN_AUTH_DEV_BYPASS = '1';
      process.env.ADMIN_AUTH_DEV_EMAIL = 'override@example.com';
      const res = await request(buildApp()).get('/__test/admin');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ adminEmail: 'override@example.com' });
    });

    it("NODE_ENV='production' では ADMIN_AUTH_DEV_BYPASS=1 でも効かない", async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_AUTH_DEV_BYPASS = '1';
      const res = await request(buildApp()).get('/__test/admin');
      expect(res.status).toBe(401);
    });

    it("NODE_ENV='staging' では ADMIN_AUTH_DEV_BYPASS=1 でも効かない", async () => {
      process.env.NODE_ENV = 'staging';
      process.env.ADMIN_AUTH_DEV_BYPASS = '1';
      const res = await request(buildApp()).get('/__test/admin');
      expect(res.status).toBe(401);
    });

    it('NODE_ENV 未設定では ADMIN_AUTH_DEV_BYPASS=1 でも効かない', async () => {
      delete process.env.NODE_ENV;
      process.env.ADMIN_AUTH_DEV_BYPASS = '1';
      const res = await request(buildApp()).get('/__test/admin');
      expect(res.status).toBe(401);
    });

    it("ADMIN_AUTH_DEV_BYPASS が '1' 以外（例: 'true'）では効かない", async () => {
      process.env.NODE_ENV = 'development';
      process.env.ADMIN_AUTH_DEV_BYPASS = 'true';
      const res = await request(buildApp()).get('/__test/admin');
      expect(res.status).toBe(401);
    });
  });
});
