import { getDatabase } from '../database';

// better-sqlite3 の `prepare(...).get()` は `unknown` 相当を返すので、
// COUNT 系・単一行 SELECT で頻出する `as any` を撲滅するための薄いラッパ。

export function getCount(sql: string, ...params: unknown[]): number {
  const row = getDatabase().prepare(sql).get(...params) as { c: number } | undefined;
  return row?.c ?? 0;
}

export function getOne<T>(sql: string, ...params: unknown[]): T | undefined {
  return getDatabase().prepare(sql).get(...params) as T | undefined;
}
