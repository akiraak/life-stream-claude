import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from '../../src/database';
import { getSystemInfo, resetAiQuota } from '../../src/services/admin-service';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

function jstDate(now: Date = new Date()): string {
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10);
}

function jstYesterday(): string {
  return jstDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

describe('admin-service / getSystemInfo deployedAt', () => {
  const prev = process.env.DEPLOYED_AT;

  beforeEach(() => {
    delete process.env.DEPLOYED_AT;
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.DEPLOYED_AT;
    } else {
      process.env.DEPLOYED_AT = prev;
    }
  });

  it('returns null when DEPLOYED_AT is unset', () => {
    expect(getSystemInfo().deployedAt).toBeNull();
  });

  it('returns the raw string as-is', () => {
    process.env.DEPLOYED_AT = '2026-04-24 05:34 PDT';
    expect(getSystemInfo().deployedAt).toBe('2026-04-24 05:34 PDT');
  });

  it('trims surrounding whitespace and returns null for whitespace-only', () => {
    process.env.DEPLOYED_AT = '  ';
    expect(getSystemInfo().deployedAt).toBeNull();

    process.env.DEPLOYED_AT = '  2026-04-24 05:34 PDT  ';
    expect(getSystemInfo().deployedAt).toBe('2026-04-24 05:34 PDT');
  });
});

describe('admin-service / resetAiQuota', () => {
  const today = jstDate();
  const yesterday = jstYesterday();
  const deviceHash = 'a'.repeat(64);

  beforeEach(() => {
    const db = getDatabase();
    const insert = db.prepare(
      'INSERT INTO ai_quota (key, date, count) VALUES (?, ?, ?)',
    );
    insert.run('user:1', today, 5);
    insert.run('user:2', today, 3);
    insert.run(`device:${deviceHash}`, today, 2);
    insert.run('user:1', yesterday, 9);
  });

  function snapshot() {
    const db = getDatabase();
    return db
      .prepare('SELECT key, date, count FROM ai_quota ORDER BY date, key')
      .all();
  }

  it("scope='user' deletes today's user:% rows only", () => {
    const result = resetAiQuota('user');
    expect(result).toEqual({ scope: 'user', deleted: 2 });

    const rows = snapshot();
    expect(rows).toEqual([
      { key: 'user:1', date: yesterday, count: 9 },
      { key: `device:${deviceHash}`, date: today, count: 2 },
    ]);
  });

  it("scope='guest' deletes today's device:% rows only", () => {
    const result = resetAiQuota('guest');
    expect(result).toEqual({ scope: 'guest', deleted: 1 });

    const rows = snapshot();
    expect(rows).toEqual([
      { key: 'user:1', date: yesterday, count: 9 },
      { key: 'user:1', date: today, count: 5 },
      { key: 'user:2', date: today, count: 3 },
    ]);
  });

  it("scope='all' deletes all of today's rows but keeps past days", () => {
    const result = resetAiQuota('all');
    expect(result).toEqual({ scope: 'all', deleted: 3 });

    const rows = snapshot();
    expect(rows).toEqual([{ key: 'user:1', date: yesterday, count: 9 }]);
  });

  it("scope='key' deletes only the specified key for today", () => {
    const result = resetAiQuota('key', { key: 'user:1' });
    expect(result).toEqual({ scope: 'key', deleted: 1 });

    const rows = snapshot();
    expect(rows).toEqual([
      { key: 'user:1', date: yesterday, count: 9 },
      { key: `device:${deviceHash}`, date: today, count: 2 },
      { key: 'user:2', date: today, count: 3 },
    ]);
  });

  it("scope='key' does not touch past days even if the key matches", () => {
    const result = resetAiQuota('key', { key: 'user:1' });
    expect(result.deleted).toBe(1);

    const db = getDatabase();
    const yesterdayRow = db
      .prepare('SELECT count FROM ai_quota WHERE key = ? AND date = ?')
      .get('user:1', yesterday) as { count: number } | undefined;
    expect(yesterdayRow?.count).toBe(9);
  });

  it('is idempotent: a second call returns deleted: 0', () => {
    expect(resetAiQuota('all').deleted).toBe(3);
    expect(resetAiQuota('all').deleted).toBe(0);
  });

  it('throws invalid_scope for unknown scopes', () => {
    expect(() => resetAiQuota('bogus' as never)).toThrow('invalid_scope');
  });

  it("throws invalid_scope when scope='key' but key is missing", () => {
    expect(() => resetAiQuota('key')).toThrow('invalid_scope');
    expect(() => resetAiQuota('key', {})).toThrow('invalid_scope');
    expect(() => resetAiQuota('key', { key: '' })).toThrow('invalid_scope');
  });
});
