import crypto from 'crypto';
import { getDatabase } from '../database';

/**
 * AI 利用回数（日次クォータ）の集計ユーティリティ。
 *
 * `rate-limit-ai` ミドルウェアが書き込み（カウント加算）を担当し、
 * 当モジュールは「現在の残量を読み取る」共通処理を提供する。
 * `GET /api/ai/quota` のような副作用なしの参照系で使う。
 */

export function getJstDate(now: Date = new Date()): string {
  // JST = UTC+9。YYYY-MM-DD 形式で返す。
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10);
}

export function getJstResetAtIso(now: Date = new Date()): string {
  // 翌日 00:00 JST を UTC の ISO 文字列で返す
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  const nextJstMidnight = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + 1,
    0, 0, 0, 0,
  );
  // JST 00:00 を UTC に戻す
  return new Date(nextJstMidnight - 9 * 60 * 60 * 1000).toISOString();
}

export function hashDeviceId(rawId: string): string {
  const secret = process.env.DEVICE_ID_SECRET;
  if (!secret) {
    throw new Error('DEVICE_ID_SECRET が設定されていません');
  }
  return crypto
    .createHash('sha256')
    .update(rawId + secret)
    .digest('hex');
}

export interface AiQuotaSnapshot {
  remaining: number;
  limit: number;
  resetAt: string;
}

/**
 * 指定キー / 上限に対する当日の残量を返す（読み取り専用、INSERT/UPDATE しない）。
 */
export function getAiQuotaSnapshot(key: string, limit: number): AiQuotaSnapshot {
  const db = getDatabase();
  const date = getJstDate();
  const row = db
    .prepare('SELECT count FROM ai_quota WHERE key = ? AND date = ?')
    .get(key, date) as { count: number } | undefined;
  const used = row?.count ?? 0;
  const remaining = Math.max(0, limit - used);
  return { remaining, limit, resetAt: getJstResetAtIso() };
}
