jest.mock('../../src/api/ai', () => ({
  __esModule: true,
  getAiQuota: jest.fn(),
}));

import { useAiStore } from '../../src/stores/ai-store';
import { getAiQuota } from '../../src/api/ai';

const mockGetAiQuota = getAiQuota as jest.MockedFunction<typeof getAiQuota>;

beforeEach(() => {
  useAiStore.setState({ remaining: null, quotaExceeded: false, resetAt: null });
  mockGetAiQuota.mockReset();
});

describe('ai-store', () => {
  it('setRemaining(n) updates remaining and flips quotaExceeded only when n <= 0', () => {
    useAiStore.getState().setRemaining(5);
    expect(useAiStore.getState()).toMatchObject({ remaining: 5, quotaExceeded: false });

    useAiStore.getState().setRemaining(0);
    expect(useAiStore.getState()).toMatchObject({ remaining: 0, quotaExceeded: true });
  });

  it('setRemaining(null) clears remaining without marking quota exceeded', () => {
    useAiStore.getState().setRemaining(null);
    expect(useAiStore.getState()).toMatchObject({ remaining: null, quotaExceeded: false });
  });

  it('markQuotaExceeded records resetAt and sets remaining to 0', () => {
    useAiStore.getState().markQuotaExceeded('2026-04-23T00:00:00+09:00');
    expect(useAiStore.getState()).toMatchObject({
      remaining: 0,
      quotaExceeded: true,
      resetAt: '2026-04-23T00:00:00+09:00',
    });
  });

  it('reset clears every field', () => {
    useAiStore.setState({ remaining: 1, quotaExceeded: true, resetAt: 'x' });
    useAiStore.getState().reset();
    expect(useAiStore.getState()).toEqual({
      remaining: null,
      quotaExceeded: false,
      resetAt: null,
      setRemaining: expect.any(Function),
      markQuotaExceeded: expect.any(Function),
      loadQuota: expect.any(Function),
      reset: expect.any(Function),
    });
  });

  describe('loadQuota', () => {
    it('populates remaining/resetAt from server response', async () => {
      mockGetAiQuota.mockResolvedValue({
        remaining: 12,
        limit: 20,
        resetAt: '2026-04-27T15:00:00.000Z',
      });

      await useAiStore.getState().loadQuota();

      expect(useAiStore.getState()).toMatchObject({
        remaining: 12,
        quotaExceeded: false,
        resetAt: '2026-04-27T15:00:00.000Z',
      });
    });

    it('flips quotaExceeded when remaining is 0', async () => {
      mockGetAiQuota.mockResolvedValue({
        remaining: 0,
        limit: 20,
        resetAt: '2026-04-27T15:00:00.000Z',
      });

      await useAiStore.getState().loadQuota();

      expect(useAiStore.getState()).toMatchObject({
        remaining: 0,
        quotaExceeded: true,
        resetAt: '2026-04-27T15:00:00.000Z',
      });
    });

    it('stores remaining: null without marking quota exceeded', async () => {
      mockGetAiQuota.mockResolvedValue({
        remaining: null,
        limit: null,
        resetAt: '2026-04-27T15:00:00.000Z',
      });

      await useAiStore.getState().loadQuota();

      expect(useAiStore.getState()).toMatchObject({
        remaining: null,
        quotaExceeded: false,
      });
    });

    it('does not throw and keeps existing state on network failure', async () => {
      useAiStore.setState({ remaining: 7, quotaExceeded: false, resetAt: null });
      mockGetAiQuota.mockRejectedValue(new Error('network down'));

      await expect(useAiStore.getState().loadQuota()).resolves.toBeUndefined();

      expect(useAiStore.getState()).toMatchObject({
        remaining: 7,
        quotaExceeded: false,
        resetAt: null,
      });
    });
  });
});
