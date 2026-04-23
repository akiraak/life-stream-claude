import { create } from 'zustand';

interface AiState {
  remaining: number | null;
  quotaExceeded: boolean;
  resetAt: string | null;

  setRemaining: (n: number | null) => void;
  markQuotaExceeded: (resetAt: string | null) => void;
  reset: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  remaining: null,
  quotaExceeded: false,
  resetAt: null,

  setRemaining: (n) =>
    set(() => ({
      remaining: n,
      quotaExceeded: n !== null && n <= 0,
      // 有効な残数が付いたら過去の resetAt は無効化
      resetAt: n !== null && n > 0 ? null : null,
    })),

  markQuotaExceeded: (resetAt) =>
    set({
      remaining: 0,
      quotaExceeded: true,
      resetAt,
    }),

  reset: () =>
    set({
      remaining: null,
      quotaExceeded: false,
      resetAt: null,
    }),
}));
