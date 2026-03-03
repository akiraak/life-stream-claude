import { getDatabase } from '../database';
import fs from 'fs';
import path from 'path';

// --- Dashboard ---

export function getDashboardStats() {
  const db = getDatabase();
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  const totalItems = (db.prepare('SELECT COUNT(*) as c FROM shopping_items').get() as any).c;
  const totalDishes = (db.prepare('SELECT COUNT(*) as c FROM dishes').get() as any).c;
  const totalPurchases = (db.prepare('SELECT COUNT(*) as c FROM purchase_history').get() as any).c;
  const recentUsersCount = (db.prepare(
    "SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')"
  ).get() as any).c;
  const recentItemsCount = (db.prepare(
    "SELECT COUNT(*) as c FROM shopping_items WHERE created_at >= datetime('now', '-7 days')"
  ).get() as any).c;
  const activeUsersToday = (db.prepare(
    "SELECT COUNT(*) as c FROM users WHERE last_login_at >= datetime('now', '-1 day')"
  ).get() as any).c;

  return {
    totalUsers,
    totalItems,
    totalDishes,
    totalPurchases,
    recentUsersCount,
    recentItemsCount,
    activeUsersToday,
  };
}

// --- Users ---

export function getAllUsers() {
  const db = getDatabase();
  const users = db.prepare(`
    SELECT
      u.id, u.email, u.created_at, u.last_login_at,
      (SELECT COUNT(*) FROM shopping_items WHERE user_id = u.id) as shopping_count,
      (SELECT COUNT(*) FROM dishes WHERE user_id = u.id) as dish_count,
      (SELECT COUNT(*) FROM purchase_history WHERE user_id = u.id) as purchase_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  return users;
}

export function deleteUser(userId: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return result.changes > 0;
}

// --- Shopping Items (all users) ---

export function getAllShoppingItems() {
  const db = getDatabase();
  return db.prepare(`
    SELECT si.*, u.email,
      d.name as dish_names
    FROM shopping_items si
    JOIN users u ON si.user_id = u.id
    LEFT JOIN dishes d ON si.dish_id = d.id AND d.active = 1
    ORDER BY si.created_at DESC
  `).all();
}

export function updateShoppingItem(id: number, data: { name?: string; category?: string; checked?: number }) {
  const db = getDatabase();
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!item) return null;

  const fields: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.checked !== undefined) { fields.push('checked = ?'); values.push(data.checked); }
  fields.push("updated_at = datetime('now')");

  if (fields.length > 1) {
    values.push(id);
    db.prepare(`UPDATE shopping_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  return db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
}

export function deleteShoppingItem(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Dishes (all users) ---

export function getAllDishes() {
  const db = getDatabase();
  return db.prepare(`
    SELECT d.*, u.email
    FROM dishes d
    JOIN users u ON d.user_id = u.id
    ORDER BY d.created_at DESC
  `).all();
}

export function deleteDish(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM dishes WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Purchase History ---

export function getAllPurchaseHistory(limit: number = 500) {
  const db = getDatabase();
  return db.prepare(`
    SELECT ph.*, u.email
    FROM purchase_history ph
    JOIN users u ON ph.user_id = u.id
    ORDER BY ph.purchased_at DESC
    LIMIT ?
  `).all(limit);
}

// --- Cooking Recipes (all users) ---

export function getAllSavedRecipesAdmin() {
  const db = getDatabase();
  return db.prepare(`
    SELECT sr.*, u.email,
      (SELECT COUNT(*) FROM recipe_likes WHERE saved_recipe_id = sr.id) as like_count
    FROM saved_recipes sr
    JOIN users u ON sr.user_id = u.id
    ORDER BY sr.created_at DESC
  `).all();
}

export function deleteSavedRecipeAdmin(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM saved_recipes WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- System Info ---

export function getSystemInfo() {
  const db = getDatabase();
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../shopping.db');

  let dbSizeBytes = 0;
  try {
    const stat = fs.statSync(dbPath);
    dbSizeBytes = stat.size;
  } catch {}

  const tables = ['users', 'shopping_items', 'dishes', 'magic_link_tokens', 'purchase_history', 'saved_recipes', 'recipe_likes'];
  const tableCounts: Record<string, number> = {};
  for (const table of tables) {
    tableCounts[table] = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as any).c;
  }

  const mem = process.memoryUsage();
  return {
    dbSizeBytes,
    memoryUsage: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
    },
    uptime: process.uptime(),
    nodeVersion: process.version,
    tableCounts,
  };
}
