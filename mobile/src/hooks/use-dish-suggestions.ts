import { useCallback, useState } from 'react';
import { useShoppingStore } from '../stores/shopping-store';
import { useAuthStore } from '../stores/auth-store';
import { AiQuotaError } from '../api/ai';

export interface UseDishSuggestionsOptions {
  dishId: number;
  // 表示は呼び元に任せる（Alert / Toast などコンポーネント側の流儀に揃えるため）
  onError: (title: string, message: string) => void;
}

export interface UseDishSuggestionsResult {
  loading: boolean;
  fetchSuggestions: (extras?: string[]) => Promise<void>;
}

export function useDishSuggestions({
  dishId,
  onError,
}: UseDishSuggestionsOptions): UseDishSuggestionsResult {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const requestLogin = useAuthStore((s) => s.requestLogin);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = useCallback(
    async (extras?: string[]) => {
      setLoading(true);
      try {
        await useShoppingStore
          .getState()
          .suggestIngredients(dishId, extras && extras.length > 0 ? extras : undefined);
      } catch (e: unknown) {
        if (e instanceof AiQuotaError) {
          if (!isAuthenticated) {
            requestLogin({
              reason: 'AI 提案の残り回数を増やすにはログインしてください',
              onSuccess: () => {
                void fetchSuggestions(extras);
              },
            });
          } else {
            onError('本日の上限に達しました', '明日また使えます');
          }
        } else {
          const message = e instanceof Error ? e.message : 'AI提案に失敗しました';
          onError('エラー', message);
        }
      } finally {
        setLoading(false);
      }
    },
    [dishId, isAuthenticated, requestLogin, onError],
  );

  return { loading, fetchSuggestions };
}
