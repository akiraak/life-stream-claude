import client from './client';
import type { ApiResponse } from '../types/api';

export interface MigrateItemInput {
  localId: number;
  name: string;
  category?: string;
  checked?: number;
  dishLocalId?: number | null;
}

export interface MigrateDishInput {
  localId: number;
  name: string;
  ingredients?: unknown[];
  recipes?: unknown[];
  position?: number;
}

export interface MigrateSavedRecipeInput {
  localId: number;
  dishName: string;
  title: string;
  summary?: string;
  steps?: string[];
  ingredients?: { name: string; category: string }[];
  sourceDishLocalId?: number | null;
}

export interface MigratePayload {
  items?: MigrateItemInput[];
  dishes?: MigrateDishInput[];
  savedRecipes?: MigrateSavedRecipeInput[];
}

export interface MigrateResult {
  dishIdMap: Record<string, number>;
  itemIdMap: Record<string, number>;
  savedRecipeIdMap: Record<string, number>;
}

export async function migrate(payload: MigratePayload): Promise<MigrateResult> {
  const res = await client.post<ApiResponse<MigrateResult>>('/api/migrate', payload);
  if (!res.data.success) {
    throw new Error(res.data.error ?? 'マイグレーションに失敗しました');
  }
  return res.data.data;
}
