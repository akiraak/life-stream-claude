import { useAiStore } from '../../src/stores/ai-store';

beforeEach(() => {
  useAiStore.setState({ remaining: null, quotaExceeded: false, resetAt: null });
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
      reset: expect.any(Function),
    });
  });
});
