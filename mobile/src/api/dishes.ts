import client from './client';
import type { ApiResponse } from '../types/api';
import type { Dish, SuggestIngredientsResponse } from '../types/models';

export async function getAllDishes(): Promise<Dish[]> {
  const res = await client.get<ApiResponse<Dish[]>>('/api/dishes');
  if (!res.data.success) throw new Error(res.data.error ?? '取得に失敗しました');
  return res.data.data;
}

export async function createDish(name: string): Promise<Dish> {
  const res = await client.post<ApiResponse<Dish>>('/api/dishes', { name });
  if (!res.data.success) throw new Error(res.data.error ?? '追加に失敗しました');
  return res.data.data;
}

export async function updateDish(id: number, name: string): Promise<Dish> {
  const res = await client.put<ApiResponse<Dish>>(`/api/dishes/${id}`, { name });
  if (!res.data.success) throw new Error(res.data.error ?? '更新に失敗しました');
  return res.data.data;
}

export async function deleteDish(id: number): Promise<void> {
  const res = await client.delete<ApiResponse<null>>(`/api/dishes/${id}`);
  if (!res.data.success) throw new Error(res.data.error ?? '削除に失敗しました');
}

export async function suggestIngredients(
  dishId: number,
  extraIngredients?: string[],
  force?: boolean,
): Promise<SuggestIngredientsResponse> {
  const res = await client.post<ApiResponse<SuggestIngredientsResponse>>(
    `/api/dishes/${dishId}/suggest-ingredients`,
    { extraIngredients, force },
  );
  if (!res.data.success) throw new Error(res.data.error ?? 'AI提案に失敗しました');
  return res.data.data;
}

export async function linkItemToDish(dishId: number, itemId: number): Promise<Dish> {
  const res = await client.post<ApiResponse<Dish>>(`/api/dishes/${dishId}/items`, { itemId });
  if (!res.data.success) throw new Error(res.data.error ?? 'リンクに失敗しました');
  return res.data.data;
}

export async function unlinkItemFromDish(dishId: number, itemId: number): Promise<void> {
  const res = await client.delete<ApiResponse<null>>(`/api/dishes/${dishId}/items/${itemId}`);
  if (!res.data.success) throw new Error(res.data.error ?? '解除に失敗しました');
}

export async function reorderDishes(orderedIds: number[]): Promise<void> {
  const res = await client.put<ApiResponse<null>>('/api/dishes/reorder', { orderedIds });
  if (!res.data.success) throw new Error(res.data.error ?? '並び替えに失敗しました');
}

export async function reorderDishItems(dishId: number, orderedItemIds: number[]): Promise<void> {
  const res = await client.put<ApiResponse<null>>(`/api/dishes/${dishId}/items/reorder`, { orderedItemIds });
  if (!res.data.success) throw new Error(res.data.error ?? '並び替えに失敗しました');
}

export async function getDishSuggestions(q?: string): Promise<string[]> {
  const params = q ? { q } : {};
  const res = await client.get<ApiResponse<string[]>>('/api/dishes/suggestions', { params });
  if (!res.data.success) throw new Error(res.data.error ?? '取得に失敗しました');
  return res.data.data;
}
