import { getDatabase } from '../database';

export interface ShoppingItem {
  id: number;
  name: string;
  category: string;
  checked: number;
  created_at: string;
  updated_at: string;
}

export interface CreateItemInput {
  name: string;
  category?: string;
}

export interface UpdateItemInput {
  name?: string;
  category?: string;
  checked?: number;
}

export interface PurchaseSuggestion {
  name: string;
  count: number;
}

export function getAllItems(userId: number): ShoppingItem[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM shopping_items WHERE user_id = ? ORDER BY checked ASC, position ASC, created_at DESC').all(userId) as ShoppingItem[];
}

export function createItem(userId: number, input: CreateItemInput): ShoppingItem {
  const db = getDatabase();
  db.prepare('UPDATE shopping_items SET position = position + 1 WHERE user_id = ? AND checked = 0').run(userId);
  const stmt = db.prepare(
    'INSERT INTO shopping_items (user_id, name, category, position) VALUES (?, ?, ?, 0)'
  );
  const result = stmt.run(userId, input.name, input.category ?? '');
  return db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(result.lastInsertRowid) as ShoppingItem;
}

export function updateItem(userId: number, id: number, input: UpdateItemInput): ShoppingItem | null {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM shopping_items WHERE id = ? AND user_id = ?').get(id, userId) as ShoppingItem | undefined;
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const category = input.category ?? existing.category;
  const checked = input.checked ?? existing.checked;

  db.prepare(
    "UPDATE shopping_items SET name = ?, category = ?, checked = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(name, category, checked, id, userId);

  // チェック時に購入履歴を記録
  if (input.checked === 1 && existing.checked === 0) {
    recordPurchase(userId, name);
  }

  return db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id) as ShoppingItem;
}

export function deleteItem(userId: number, id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM shopping_items WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

export function deleteCheckedItems(userId: number): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM shopping_items WHERE user_id = ? AND checked = 1').run(userId);
  return result.changes;
}

export function deleteAllItems(userId: number): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM shopping_items WHERE user_id = ?').run(userId);
  return result.changes;
}

export function getUncheckedItems(userId: number): ShoppingItem[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM shopping_items WHERE user_id = ? AND checked = 0 ORDER BY created_at DESC').all(userId) as ShoppingItem[];
}

export function getStats(userId: number): { total: number; checked: number; unchecked: number } {
  const db = getDatabase();
  const total = (db.prepare('SELECT COUNT(*) as count FROM shopping_items WHERE user_id = ?').get(userId) as { count: number }).count;
  const checked = (db.prepare('SELECT COUNT(*) as count FROM shopping_items WHERE user_id = ? AND checked = 1').get(userId) as { count: number }).count;
  return { total, checked, unchecked: total - checked };
}

export function reorderItems(userId: number, orderedIds: number[]): void {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE shopping_items SET position = ? WHERE id = ? AND user_id = ?');
  db.transaction(() => {
    orderedIds.forEach((id, index) => stmt.run(index, id, userId));
  })();
}

export function recordPurchase(userId: number, itemName: string): void {
  const db = getDatabase();
  db.prepare('INSERT INTO purchase_history (user_id, item_name) VALUES (?, ?)').run(userId, itemName);
}

export function getSuggestions(userId: number, query: string, limit: number = 10): PurchaseSuggestion[] {
  const db = getDatabase();
  const excludeClause = 'AND item_name COLLATE NOCASE NOT IN (SELECT name COLLATE NOCASE FROM shopping_items WHERE user_id = ? AND checked = 0)';
  if (!query) {
    return db.prepare(`
      SELECT item_name AS name, COUNT(*) AS count
      FROM purchase_history
      WHERE user_id = ? ${excludeClause}
      GROUP BY item_name COLLATE NOCASE
      ORDER BY count DESC, MAX(purchased_at) DESC
      LIMIT ?
    `).all(userId, userId, limit) as PurchaseSuggestion[];
  }
  return db.prepare(`
    SELECT item_name AS name, COUNT(*) AS count
    FROM purchase_history
    WHERE user_id = ? AND item_name LIKE ? COLLATE NOCASE ${excludeClause}
    GROUP BY item_name COLLATE NOCASE
    ORDER BY count DESC, MAX(purchased_at) DESC
    LIMIT ?
  `).all(userId, `${query}%`, userId, limit) as PurchaseSuggestion[];
}
