import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from '../../src/database';
import {
  getAiQuotaStats,
  getDashboardStats,
  getSystemInfo,
  resetAiQuota,
  updateShoppingItem,
} from '../../src/services/admin-service';
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

describe('admin-service / getDashboardStats', () => {
  it('returns zero counts for an empty database', () => {
    expect(getDashboardStats()).toEqual({
      totalUsers: 0,
      totalItems: 0,
      totalDishes: 0,
      totalPurchases: 0,
      recentUsersCount: 0,
      recentItemsCount: 0,
      activeUsersToday: 0,
    });
  });

  it('counts users / items / dishes / purchases including the recent / active subsets', () => {
    const db = getDatabase();
    const userId = Number(
      db.prepare("INSERT INTO users (email, created_at, last_login_at) VALUES (?, datetime('now'), datetime('now'))").run('a@test').lastInsertRowid,
    );
    db.prepare("INSERT INTO users (email, created_at, last_login_at) VALUES (?, datetime('now', '-30 days'), datetime('now', '-30 days'))").run('b@test');
    db.prepare("INSERT INTO shopping_items (user_id, name, created_at) VALUES (?, ?, datetime('now'))").run(userId, 'milk');
    db.prepare("INSERT INTO shopping_items (user_id, name, created_at) VALUES (?, ?, datetime('now', '-30 days'))").run(userId, 'old');
    db.prepare("INSERT INTO dishes (user_id, name) VALUES (?, ?)").run(userId, 'curry');
    db.prepare("INSERT INTO purchase_history (user_id, item_name) VALUES (?, ?)").run(userId, 'milk');

    expect(getDashboardStats()).toEqual({
      totalUsers: 2,
      totalItems: 2,
      totalDishes: 1,
      totalPurchases: 1,
      recentUsersCount: 1,
      recentItemsCount: 1,
      activeUsersToday: 1,
    });
  });
});

describe('admin-service / updateShoppingItem', () => {
  function seedItem(overrides: { name?: string; category?: string; checked?: number } = {}): number {
    const db = getDatabase();
    const userId = Number(
      db.prepare("INSERT INTO users (email) VALUES (?)").run('owner@test').lastInsertRowid,
    );
    const result = db
      .prepare('INSERT INTO shopping_items (user_id, name, category, checked) VALUES (?, ?, ?, ?)')
      .run(userId, overrides.name ?? 'milk', overrides.category ?? '飲料', overrides.checked ?? 0);
    return Number(result.lastInsertRowid);
  }

  it('returns null when the item does not exist', () => {
    expect(updateShoppingItem(999, { name: 'x' })).toBeNull();
  });

  it('updates only name when name is provided', () => {
    const id = seedItem();
    const updated = updateShoppingItem(id, { name: 'soy milk' });
    expect(updated?.name).toBe('soy milk');
    expect(updated?.category).toBe('飲料');
    expect(updated?.checked).toBe(0);
  });

  it('updates only checked when checked is provided', () => {
    const id = seedItem();
    const updated = updateShoppingItem(id, { checked: 1 });
    expect(updated?.checked).toBe(1);
    expect(updated?.name).toBe('milk');
  });

  it('updates name and checked together', () => {
    const id = seedItem();
    const updated = updateShoppingItem(id, { name: 'oat milk', checked: 1 });
    expect(updated?.name).toBe('oat milk');
    expect(updated?.checked).toBe(1);
  });

  it('returns the row unchanged when no fields are provided', () => {
    const id = seedItem();
    const updated = updateShoppingItem(id, {});
    expect(updated?.name).toBe('milk');
    expect(updated?.category).toBe('飲料');
    expect(updated?.checked).toBe(0);
  });
});

describe('admin-service / getAiQuotaStats', () => {
  const today = jstDate();
  const deviceHash = 'a'.repeat(64);

  beforeEach(() => {
    const db = getDatabase();
    const insert = db.prepare('INSERT INTO ai_quota (key, date, count) VALUES (?, ?, ?)');
    insert.run('user:1', today, 5);
    insert.run('user:2', today, 3);
    insert.run(`device:${deviceHash}`, today, 2);
  });

  it("aggregates today's calls split by user / guest", () => {
    const stats = getAiQuotaStats();
    expect(stats.today).toBe(today);
    expect(stats.todaySummary).toEqual({
      total_calls: 10,
      unique_keys: 3,
      user_calls: 8,
      guest_calls: 2,
      user_keys: 2,
      guest_keys: 1,
    });
  });
});

describe('admin-service / getSystemInfo tableCounts', () => {
  it('returns COUNT(*) for every tracked table', () => {
    const db = getDatabase();
    const userId = Number(
      db.prepare("INSERT INTO users (email) VALUES (?)").run('a@test').lastInsertRowid,
    );
    db.prepare("INSERT INTO users (email) VALUES (?)").run('b@test');
    db.prepare("INSERT INTO shopping_items (user_id, name) VALUES (?, ?)").run(userId, 'milk');
    db.prepare("INSERT INTO dishes (user_id, name) VALUES (?, ?)").run(userId, 'curry');

    const info = getSystemInfo();
    expect(info.tableCounts).toMatchObject({
      users: 2,
      shopping_items: 1,
      dishes: 1,
      magic_link_tokens: 0,
      purchase_history: 0,
      saved_recipes: 0,
      ai_quota: 0,
    });
  });
});
