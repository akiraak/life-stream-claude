import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getAiLimits,
  setAiLimits,
  _resetAiLimitsCacheForTest,
} from '../../src/services/settings-service';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

describe('settings-service', () => {
  // tests/setup.ts: AI_LIMIT_USER=20, AI_LIMIT_GUEST=3
  const originalUserEnv = process.env.AI_LIMIT_USER;
  const originalGuestEnv = process.env.AI_LIMIT_GUEST;

  beforeEach(() => {
    _resetAiLimitsCacheForTest();
  });

  afterEach(() => {
    process.env.AI_LIMIT_USER = originalUserEnv;
    process.env.AI_LIMIT_GUEST = originalGuestEnv;
    _resetAiLimitsCacheForTest();
  });

  describe('getAiLimits', () => {
    it('falls back to env when DB has no values', () => {
      const limits = getAiLimits();
      expect(limits).toEqual({ user: 20, guest: 3 });
    });

    it('falls back to default when neither DB nor env have values', () => {
      delete process.env.AI_LIMIT_USER;
      delete process.env.AI_LIMIT_GUEST;
      _resetAiLimitsCacheForTest();
      const limits = getAiLimits();
      expect(limits).toEqual({ user: 20, guest: 3 });
    });

    it('prefers DB over env when both are set', () => {
      process.env.AI_LIMIT_USER = '50';
      process.env.AI_LIMIT_GUEST = '10';
      setAiLimits({ user: 7, guest: 2 });
      const limits = getAiLimits();
      expect(limits).toEqual({ user: 7, guest: 2 });
    });

    it('caches the result on repeated calls', () => {
      const a = getAiLimits();
      const b = getAiLimits();
      expect(a).toBe(b);
    });

    it('ignores invalid env values and falls back to default', () => {
      process.env.AI_LIMIT_USER = 'abc';
      process.env.AI_LIMIT_GUEST = '-5';
      _resetAiLimitsCacheForTest();
      const limits = getAiLimits();
      expect(limits).toEqual({ user: 20, guest: 3 });
    });
  });

  describe('setAiLimits', () => {
    it('persists values and reflects them on next getAiLimits()', () => {
      setAiLimits({ user: 100, guest: 5 });
      expect(getAiLimits()).toEqual({ user: 100, guest: 5 });
    });

    it('updates only the field provided', () => {
      setAiLimits({ user: 100, guest: 5 });
      setAiLimits({ guest: 8 });
      expect(getAiLimits()).toEqual({ user: 100, guest: 8 });
    });

    it('allows 0 (effectively disables AI)', () => {
      setAiLimits({ user: 0, guest: 0 });
      expect(getAiLimits()).toEqual({ user: 0, guest: 0 });
    });

    it('rejects negative numbers', () => {
      expect(() => setAiLimits({ user: -1 })).toThrow(/invalid_ai_limit/);
      expect(() => setAiLimits({ guest: -1 })).toThrow(/invalid_ai_limit/);
    });

    it('rejects non-integer values', () => {
      expect(() => setAiLimits({ user: 1.5 })).toThrow(/invalid_ai_limit/);
    });

    it('rejects NaN / non-number', () => {
      expect(() => setAiLimits({ user: NaN })).toThrow(/invalid_ai_limit/);
      expect(() => setAiLimits({ user: 'abc' as unknown as number })).toThrow(/invalid_ai_limit/);
    });

    it('rejects values exceeding the sanity cap (100000)', () => {
      expect(() => setAiLimits({ user: 100001 })).toThrow(/invalid_ai_limit/);
    });

    it('returns the resolved limits', () => {
      const result = setAiLimits({ user: 42, guest: 1 });
      expect(result).toEqual({ user: 42, guest: 1 });
    });

    it('invalidates the cache so a new value is read', () => {
      const before = getAiLimits();
      setAiLimits({ user: before.user + 1 });
      const after = getAiLimits();
      expect(after.user).toBe(before.user + 1);
    });
  });
});
