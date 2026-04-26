import { describe, expect, it } from 'vitest';
import { getDatabase } from '../../src/database';
import {
  getAiQuotaSnapshot,
  getJstDate,
  getJstResetAtIso,
  hashDeviceId,
} from '../../src/services/ai-quota-service';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

describe('ai-quota-service', () => {
  describe('getJstDate', () => {
    it('returns YYYY-MM-DD in JST (UTC+9)', () => {
      // 2026-04-26 23:00 UTC = 2026-04-27 08:00 JST
      const t = new Date('2026-04-26T23:00:00.000Z');
      expect(getJstDate(t)).toBe('2026-04-27');
    });

    it('handles UTC midnight as already next-JST-day', () => {
      // 2026-04-26 00:00 UTC = 2026-04-26 09:00 JST
      const t = new Date('2026-04-26T00:00:00.000Z');
      expect(getJstDate(t)).toBe('2026-04-26');
    });

    it('rolls over at 15:00 UTC = 00:00 JST', () => {
      const before = new Date('2026-04-26T14:59:59.000Z');
      const after = new Date('2026-04-26T15:00:00.000Z');
      expect(getJstDate(before)).toBe('2026-04-26');
      expect(getJstDate(after)).toBe('2026-04-27');
    });
  });

  describe('getJstResetAtIso', () => {
    it('returns next JST midnight as UTC ISO string', () => {
      // 2026-04-26 09:00 JST → next reset is 2026-04-27 00:00 JST = 2026-04-26 15:00 UTC
      const t = new Date('2026-04-26T00:00:00.000Z');
      expect(getJstResetAtIso(t)).toBe('2026-04-26T15:00:00.000Z');
    });

    it('after JST midnight, points to the following day', () => {
      // 2026-04-26 15:00 UTC = 2026-04-27 00:00 JST → next reset is 2026-04-28 00:00 JST = 2026-04-27 15:00 UTC
      const t = new Date('2026-04-26T15:00:00.000Z');
      expect(getJstResetAtIso(t)).toBe('2026-04-27T15:00:00.000Z');
    });
  });

  describe('hashDeviceId', () => {
    it('is deterministic for the same input', () => {
      expect(hashDeviceId('device-a')).toBe(hashDeviceId('device-a'));
    });

    it('produces different hashes for different inputs', () => {
      expect(hashDeviceId('device-a')).not.toBe(hashDeviceId('device-b'));
    });

    it('throws when DEVICE_ID_SECRET is missing', () => {
      const original = process.env.DEVICE_ID_SECRET;
      try {
        delete process.env.DEVICE_ID_SECRET;
        expect(() => hashDeviceId('device-a')).toThrow(/DEVICE_ID_SECRET/);
      } finally {
        process.env.DEVICE_ID_SECRET = original;
      }
    });
  });

  describe('getAiQuotaSnapshot', () => {
    it('returns full limit when no row exists for today', () => {
      const snap = getAiQuotaSnapshot('user:999', 20);
      expect(snap.remaining).toBe(20);
      expect(snap.limit).toBe(20);
      expect(snap.resetAt).toEqual(expect.any(String));
    });

    it('reflects existing count for today', () => {
      const db = getDatabase();
      const date = getJstDate();
      db.prepare(
        'INSERT INTO ai_quota (key, date, count) VALUES (?, ?, ?)',
      ).run('user:1', date, 5);

      const snap = getAiQuotaSnapshot('user:1', 20);
      expect(snap.remaining).toBe(15);
      expect(snap.limit).toBe(20);
    });

    it('clamps remaining at 0 even if count exceeds limit', () => {
      const db = getDatabase();
      const date = getJstDate();
      db.prepare(
        'INSERT INTO ai_quota (key, date, count) VALUES (?, ?, ?)',
      ).run('user:2', date, 100);

      const snap = getAiQuotaSnapshot('user:2', 20);
      expect(snap.remaining).toBe(0);
    });

    it('does not insert or update any row (read-only)', () => {
      const db = getDatabase();
      const before = db.prepare('SELECT COUNT(*) as n FROM ai_quota').get() as { n: number };
      getAiQuotaSnapshot('user:does-not-exist', 20);
      getAiQuotaSnapshot('user:does-not-exist', 20);
      const after = db.prepare('SELECT COUNT(*) as n FROM ai_quota').get() as { n: number };
      expect(after.n).toBe(before.n);
    });

    it('ignores rows for other dates', () => {
      const db = getDatabase();
      db.prepare(
        'INSERT INTO ai_quota (key, date, count) VALUES (?, ?, ?)',
      ).run('user:3', '2000-01-01', 10);

      const snap = getAiQuotaSnapshot('user:3', 20);
      expect(snap.remaining).toBe(20);
    });
  });
});
