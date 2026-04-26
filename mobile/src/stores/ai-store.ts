import { create } from 'zustand';
import { getAiQuota } from '../api/ai';

interface AiState {
  remaining: number | null;
  quotaExceeded: boolean;
  resetAt: string | null;

  setRemaining: (n: number | null) => void;
  markQuotaExceeded: (resetAt: string | null) => void;
  loadQuota: () => Promise<void>;
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

  // 起動時／認証切替時に呼ぶ。失敗しても既存値を壊さない（fail-soft）。
  loadQuota: async () => {
    try {
      const q = await getAiQuota();
      set({
        remaining: q.remaining,
        quotaExceeded: q.remaining === 0,
        resetAt: q.resetAt,
      });
    } catch {
      // ネットワーク／サーバ不調時はメニュー非表示のまま据え置く
    }
  },

  reset: () =>
    set({
      remaining: null,
      quotaExceeded: false,
      resetAt: null,
    }),
}));
