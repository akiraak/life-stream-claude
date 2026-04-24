import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSystemInfo } from '../../src/services/admin-service';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

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
