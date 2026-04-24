import { getDatabase } from '../database';

/**
 * admin から書き換え可能なランタイム設定 (app_settings テーブル) を扱う。
 * 値は DB → env → default の優先順位で解決する。
 *
 * リクエスト毎に DB を叩かないよう、プロセス内でメモリキャッシュする。
 * 更新時は invalidate して次回読み込みで再構築する。
 */

const DEFAULT_AI_LIMIT_USER = 20;
const DEFAULT_AI_LIMIT_GUEST = 3;
const MAX_AI_LIMIT = 100000;

const KEY_AI_LIMIT_USER = 'ai_limit_user';
const KEY_AI_LIMIT_GUEST = 'ai_limit_guest';

export interface AiLimits {
  user: number;
  guest: number;
}

let aiLimitsCache: AiLimits | null = null;

function readSetting(key: string): string | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

function writeSetting(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value);
}

function parseNonNegativeIntOr(raw: string | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function validateLimit(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`invalid_ai_limit:${field}`);
  }
  if (value < 0 || value > MAX_AI_LIMIT) {
    throw new Error(`invalid_ai_limit:${field}`);
  }
  return value;
}

export function getAiLimits(): AiLimits {
  if (aiLimitsCache) return aiLimitsCache;

  const dbUser = readSetting(KEY_AI_LIMIT_USER);
  const dbGuest = readSetting(KEY_AI_LIMIT_GUEST);

  const envUserFallback = parseNonNegativeIntOr(process.env.AI_LIMIT_USER, DEFAULT_AI_LIMIT_USER);
  const envGuestFallback = parseNonNegativeIntOr(process.env.AI_LIMIT_GUEST, DEFAULT_AI_LIMIT_GUEST);

  const user = parseNonNegativeIntOr(dbUser, envUserFallback);
  const guest = parseNonNegativeIntOr(dbGuest, envGuestFallback);

  aiLimitsCache = { user, guest };
  return aiLimitsCache;
}

export function setAiLimits(values: { user?: number; guest?: number }): AiLimits {
  if (values.user !== undefined) {
    const user = validateLimit(values.user, 'user');
    writeSetting(KEY_AI_LIMIT_USER, String(user));
  }
  if (values.guest !== undefined) {
    const guest = validateLimit(values.guest, 'guest');
    writeSetting(KEY_AI_LIMIT_GUEST, String(guest));
  }
  aiLimitsCache = null;
  return getAiLimits();
}

/** テスト用: メモリキャッシュをクリアする。 */
export function _resetAiLimitsCacheForTest(): void {
  aiLimitsCache = null;
}
