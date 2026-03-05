import client from './client';
import type { ApiResponse } from '../types/api';
import type { ShoppingItem } from '../types/models';

export async function getAllItems(): Promise<ShoppingItem[]> {
  const res = await client.get<ApiResponse<ShoppingItem[]>>('/api/shopping');
  if (!res.data.success) throw new Error(res.data.error ?? '取得に失敗しました');
  return res.data.data;
}

export async function createItem(name: string, category?: string): Promise<ShoppingItem> {
  const res = await client.post<ApiResponse<ShoppingItem>>('/api/shopping', { name, category });
  if (!res.data.success) throw new Error(res.data.error ?? '追加に失敗しました');
  return res.data.data;
}

export async function updateItem(id: number, data: { name?: string; category?: string; checked?: number }): Promise<ShoppingItem> {
  const res = await client.put<ApiResponse<ShoppingItem>>(`/api/shopping/${id}`, data);
  if (!res.data.success) throw new Error(res.data.error ?? '更新に失敗しました');
  return res.data.data;
}

export async function deleteItem(id: number): Promise<void> {
  const res = await client.delete<ApiResponse<null>>(`/api/shopping/${id}`);
  if (!res.data.success) throw new Error(res.data.error ?? '削除に失敗しました');
}

export async function deleteCheckedItems(): Promise<number> {
  const res = await client.delete<ApiResponse<{ deleted: number }>>('/api/shopping/checked');
  if (!res.data.success) throw new Error(res.data.error ?? '削除に失敗しました');
  return res.data.data.deleted;
}

export async function reorderItems(orderedIds: number[]): Promise<void> {
  const res = await client.put<ApiResponse<null>>('/api/shopping/reorder', { orderedIds });
  if (!res.data.success) throw new Error(res.data.error ?? '並び替えに失敗しました');
}

export async function getItemSuggestions(q?: string): Promise<string[]> {
  const params = q ? { q } : {};
  const res = await client.get<ApiResponse<string[]>>('/api/shopping/suggestions', { params });
  if (!res.data.success) throw new Error(res.data.error ?? '取得に失敗しました');
  return res.data.data;
}
