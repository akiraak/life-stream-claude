import client from './client';
import type { ApiResponse } from '../types/api';
import type { SavedRecipe } from '../types/models';

export async function getSavedRecipes(): Promise<SavedRecipe[]> {
  const res = await client.get<ApiResponse<SavedRecipe[]>>('/api/saved-recipes');
  if (!res.data.success) throw new Error(res.data.error ?? '取得に失敗しました');
  return res.data.data;
}

export async function deleteSavedRecipe(id: number): Promise<void> {
  const res = await client.delete<ApiResponse<null>>(`/api/saved-recipes/${id}`);
  if (!res.data.success) throw new Error(res.data.error ?? '削除に失敗しました');
}

export interface BulkSavedRecipeInput {
  dishName: string;
  title: string;
  summary?: string;
  steps?: string[];
  ingredients?: { name: string; category: string }[];
  sourceDishId?: number;
}

export async function createSavedRecipesBulk(
  recipes: BulkSavedRecipeInput[],
): Promise<SavedRecipe[]> {
  const res = await client.post<ApiResponse<SavedRecipe[]>>(
    '/api/saved-recipes/bulk',
    { recipes },
  );
  if (!res.data.success) throw new Error(res.data.error ?? '保存に失敗しました');
  return res.data.data;
}
