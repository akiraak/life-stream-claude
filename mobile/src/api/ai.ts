import client from './client';
import type { ApiResponse } from '../types/api';
import type { Ingredient, Recipe } from '../types/models';

export interface SuggestAiData {
  ingredients: Ingredient[];
  recipes: Recipe[];
}

export interface SuggestAiResult extends SuggestAiData {
  remaining: number | null;
}

export class AiQuotaError extends Error {
  remaining: number;
  resetAt: string | null;
  constructor(resetAt: string | null = null) {
    super('ai_quota_exceeded');
    this.name = 'AiQuotaError';
    this.remaining = 0;
    this.resetAt = resetAt;
  }
}

export interface AiQuota {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

export async function getAiQuota(): Promise<AiQuota> {
  const res = await client.get<ApiResponse<AiQuota>>('/api/ai/quota');
  if (!res.data.success) throw new Error(res.data.error ?? 'AI残量取得に失敗');
  return res.data.data;
}

export async function suggestAi(
  dishName: string,
  extraIngredients?: string[],
): Promise<SuggestAiResult> {
  try {
    const res = await client.post<ApiResponse<SuggestAiData>>('/api/ai/suggest', {
      dishName,
      extraIngredients,
    });
    if (!res.data.success) throw new Error(res.data.error ?? 'AI提案に失敗しました');
    const headerVal = (res.headers ?? {})['x-ai-remaining'];
    const parsed = headerVal != null ? Number(headerVal) : NaN;
    return {
      ingredients: res.data.data.ingredients,
      recipes: res.data.data.recipes,
      remaining: Number.isFinite(parsed) ? parsed : null,
    };
  } catch (e) {
    const err = e as {
      response?: {
        status?: number;
        data?: { error?: string; resetAt?: string | null };
      };
    };
    if (err?.response?.status === 429 && err.response?.data?.error === 'ai_quota_exceeded') {
      throw new AiQuotaError(err.response.data.resetAt ?? null);
    }
    throw e;
  }
}
