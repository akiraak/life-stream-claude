/**
 * テスト用 認証ヘルパー。
 * - createTestUser: email でユーザーを作成して User を返す
 * - createAuthHeader: 指定 userId 用の Authorization ヘッダを返す
 * - createCfAccessHeaders: Cloudflare Access JWT を含むヘッダを生成（要 startCfAccessStub）
 */
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import {
  type JWK,
  type KeyLike,
  SignJWT,
  exportJWK,
  generateKeyPair,
} from 'jose';
import {
  findOrCreateUser,
  generateJwt,
} from '../../src/services/auth-service';
import { _resetCloudflareAccessJwksCacheForTest } from '../../src/middleware/cloudflare-access';

export interface TestUser {
  id: number;
  email: string;
}

export function createTestUser(email = 'test@example.com'): TestUser {
  const user = findOrCreateUser(email.trim().toLowerCase());
  return { id: user.id, email: user.email };
}

export function createAuthHeader(user: TestUser): { Authorization: string } {
  const token = generateJwt(user.id, user.email);
  return { Authorization: `Bearer ${token}` };
}

/**
 * ユーザー作成 + ヘッダ生成を 1 ステップで行うユーティリティ。
 */
export function createAuthedUser(
  email = 'test@example.com',
): { user: TestUser; headers: { Authorization: string } } {
  const user = createTestUser(email);
  return { user, headers: createAuthHeader(user) };
}

// ---- Cloudflare Access テストヘルパー ----------------------------------

interface CfAccessStub {
  baseUrl: string;
  audience: string;
  privateKey: KeyLike;
  publicJwk: JWK;
  /** 別の鍵（公開鍵を JWKS に載せていない）— 署名不正シナリオに使う */
  foreignPrivateKey: KeyLike;
  server: Server;
}

let activeStub: CfAccessStub | null = null;
const KID = 'test-kid';

/**
 * JWKS スタブ HTTP サーバを立ち上げ、CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD を
 * テスト用に上書きする。afterAll で stopCfAccessStub() を呼ぶこと。
 */
export async function startCfAccessStub(audience = 'cf-access-test-aud'): Promise<void> {
  if (activeStub) return;
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  const { privateKey: foreignPrivateKey } = await generateKeyPair('RS256');

  const server = createServer((req, res) => {
    if (req.url === '/cdn-cgi/access/certs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  process.env.CF_ACCESS_TEAM_DOMAIN = baseUrl;
  process.env.CF_ACCESS_AUD = audience;
  // 既に他テストで JWKS を別 URL でキャッシュしている可能性があるのでクリア
  _resetCloudflareAccessJwksCacheForTest();

  activeStub = { baseUrl, audience, privateKey, publicJwk, foreignPrivateKey, server };
}

export async function stopCfAccessStub(): Promise<void> {
  if (!activeStub) return;
  await new Promise<void>((resolve, reject) => {
    activeStub!.server.close((err) => (err ? reject(err) : resolve()));
  });
  activeStub = null;
  _resetCloudflareAccessJwksCacheForTest();
}

export interface CfAccessTokenOverrides {
  audience?: string;
  issuer?: string;
  /** 既定は 1 時間後。負値や過去 epoch を渡すと expired トークンを作れる */
  expSeconds?: number;
  /** 鍵を別物に差し替える（署名不正シナリオ用） */
  useForeignKey?: boolean;
  /** alg=none 攻撃シナリオ用（手動で unsigned JWT を組み立てる） */
  algNone?: boolean;
  /** kid を消す／差し替える */
  kid?: string | null;
  email?: string;
}

export async function createCfAccessHeaders(
  email = 'admin@test.local',
  overrides: CfAccessTokenOverrides = {},
): Promise<{ 'Cf-Access-Jwt-Assertion': string }> {
  if (!activeStub) {
    throw new Error('startCfAccessStub() を beforeAll で呼んでください');
  }
  const issuer = overrides.issuer ?? activeStub.baseUrl;
  const audience = overrides.audience ?? activeStub.audience;
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = overrides.expSeconds ?? nowSec + 3600;
  const subjectEmail = overrides.email ?? email;

  if (overrides.algNone) {
    const header = { alg: 'none', typ: 'JWT', kid: KID };
    const payload = { iss: issuer, aud: audience, email: subjectEmail, iat: nowSec, exp };
    const enc = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');
    return { 'Cf-Access-Jwt-Assertion': `${enc(header)}.${enc(payload)}.` };
  }

  const protectedHeader: { alg: string; kid?: string } = { alg: 'RS256' };
  if (overrides.kid !== null) {
    protectedHeader.kid = overrides.kid ?? KID;
  }

  const key = overrides.useForeignKey ? activeStub.foreignPrivateKey : activeStub.privateKey;
  const jwt = await new SignJWT({ email: subjectEmail })
    .setProtectedHeader(protectedHeader)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(nowSec)
    .setExpirationTime(exp)
    .sign(key);

  return { 'Cf-Access-Jwt-Assertion': jwt };
}
