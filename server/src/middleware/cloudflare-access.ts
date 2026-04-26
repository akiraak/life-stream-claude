import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { logger } from '../lib/logger';

// Express Request 型を拡張（requireAuth の req.userEmail と分離して将来の混入を型で気づけるように）
declare global {
  namespace Express {
    interface Request {
      adminEmail?: string;
    }
  }
}

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;

let cachedJwks: RemoteJWKSet | null = null;
let cachedJwksKey: string | null = null;

function buildBaseUrl(teamDomain: string): string {
  // 本番では `akiraak.cloudflareaccess.com` のようなドメインを受け取り、
  // テストではスタブの `http://127.0.0.1:PORT` を直接受け取れるようにしておく
  return teamDomain.includes('://') ? teamDomain.replace(/\/$/, '') : `https://${teamDomain}`;
}

function getJwksFor(baseUrl: string): RemoteJWKSet {
  if (cachedJwks && cachedJwksKey === baseUrl) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(`${baseUrl}/cdn-cgi/access/certs`), {
    // CF Access の鍵ローテは滅多に起きないので 1h キャッシュ。
    // 取得失敗時は cooldownDuration の間キャッシュを使い続ける（stale-while-revalidate）。
    cacheMaxAge: 60 * 60 * 1000,
  });
  cachedJwksKey = baseUrl;
  return cachedJwks;
}

/**
 * テスト専用: モジュール内の JWKS キャッシュを破棄する。
 * 本番コードからは呼ばない。
 */
export function _resetCloudflareAccessJwksCacheForTest(): void {
  cachedJwks = null;
  cachedJwksKey = null;
}

function isDevBypassEnabled(): boolean {
  if (process.env.ADMIN_AUTH_DEV_BYPASS !== '1') return false;
  // `!== 'production'` 否定だと NODE_ENV 未設定 / 'staging' で誤発火するので白リストで判定
  const env = process.env.NODE_ENV;
  return env === 'development' || env === 'test';
}

function deny(res: Response): void {
  res.status(401).json({
    success: false,
    data: null,
    error: 'Cloudflare Access 認証が必要です',
  });
}

export async function requireCloudflareAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isDevBypassEnabled()) {
    req.adminEmail = process.env.ADMIN_AUTH_DEV_EMAIL ?? 'dev-admin@local';
    next();
    return;
  }

  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CF_ACCESS_AUD;
  if (!teamDomain || !audience) {
    logger.warn(
      { event: 'cf_access_misconfigured' },
      'CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD が未設定のため認証できません',
    );
    deny(res);
    return;
  }

  const token = req.header('Cf-Access-Jwt-Assertion');
  if (!token) {
    deny(res);
    return;
  }

  const baseUrl = buildBaseUrl(teamDomain);
  try {
    const jwks = getJwksFor(baseUrl);
    const { payload } = await jwtVerify(token, jwks, {
      audience,
      issuer: baseUrl,
      algorithms: ['RS256'],
    });
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    if (!email) {
      logger.warn({ event: 'cf_access_missing_email' }, 'CF Access JWT に email クレームが無い');
      deny(res);
      return;
    }
    req.adminEmail = email;
    next();
  } catch (err) {
    logger.warn(
      {
        event: 'cf_access_verify_failed',
        err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
      },
      'Cloudflare Access JWT 検証失敗',
    );
    deny(res);
  }
}
