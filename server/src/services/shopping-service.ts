import { getDatabase } from '../database';

export interface ShoppingItem {
  id: number;
  name: string;
  quantity: number;
  category: string;
  checked: number;
  created_at: string;
  updated_at: string;
}

export interface CreateItemInput {
  name: string;
  quantity?: number;
  category?: string;
}

export interface UpdateItemInput {
  name?: string;
  quantity?: number;
  category?: string;
  checked?: number;
}

export function getAllItems(): ShoppingItem[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM shopping_items ORDER BY checked ASC, created_at DESC').all() as ShoppingItem[];
}

export function createItem(input: CreateItemInput): ShoppingItem {
  const db = getDatabase();
  const stmt = db.prepare(
    'INSERT INTO shopping_items (name, quantity, category) VALUES (?, ?, ?)'
  );
  const result = stmt.run(input.name, input.quantity ?? 1, input.category ?? '');
  return db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(result.lastInsertRowid) as ShoppingItem;
}

export function updateItem(id: number, input: UpdateItemInput): ShoppingItem | null {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id) as ShoppingItem | undefined;
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const quantity = input.quantity ?? existing.quantity;
  const category = input.category ?? existing.category;
  const checked = input.checked ?? existing.checked;

  db.prepare(
    "UPDATE shopping_items SET name = ?, quantity = ?, category = ?, checked = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, quantity, category, checked, id);

  return db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id) as ShoppingItem;
}

export function deleteItem(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteCheckedItems(): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM shopping_items WHERE checked = 1').run();
  return result.changes;
}

export function deleteAllItems(): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM shopping_items').run();
  return result.changes;
}

export function getStats(): { total: number; checked: number; unchecked: number } {
  const db = getDatabase();
  const total = (db.prepare('SELECT COUNT(*) as count FROM shopping_items').get() as { count: number }).count;
  const checked = (db.prepare('SELECT COUNT(*) as count FROM shopping_items WHERE checked = 1').get() as { count: number }).count;
  return { total, checked, unchecked: total - checked };
}
