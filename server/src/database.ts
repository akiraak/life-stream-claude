import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../shopping.db');

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDatabase(): void {
  const database = getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS shopping_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      checked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS dish_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dish_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES shopping_items(id) ON DELETE CASCADE,
      UNIQUE(dish_id, item_id)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS purchase_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      purchased_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_purchase_history_name
      ON purchase_history(item_name COLLATE NOCASE)
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS dish_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dish_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_dish_history_name
      ON dish_history(dish_name COLLATE NOCASE)
  `);

  // dishes テーブルに AI 情報カラムを追加（マイグレーション）
  const dishColumns = database.prepare("PRAGMA table_info(dishes)").all() as { name: string }[];
  const columnNames = dishColumns.map(c => c.name);
  if (!columnNames.includes('ingredients_json')) {
    database.exec('ALTER TABLE dishes ADD COLUMN ingredients_json TEXT');
  }
  if (!columnNames.includes('recipes_json')) {
    database.exec('ALTER TABLE dishes ADD COLUMN recipes_json TEXT');
  }

  // 既存の料理を料理履歴にシード（初回のみ）
  const dishHistoryCount = (database.prepare(
    'SELECT COUNT(*) as count FROM dish_history'
  ).get() as { count: number }).count;
  if (dishHistoryCount === 0) {
    database.exec(`
      INSERT INTO dish_history (dish_name, created_at)
      SELECT name, created_at FROM dishes
    `);
  }

  // 既存のチェック済みアイテムを購入履歴にシード（初回のみ）
  const historyCount = (database.prepare(
    'SELECT COUNT(*) as count FROM purchase_history'
  ).get() as { count: number }).count;
  if (historyCount === 0) {
    database.exec(`
      INSERT INTO purchase_history (item_name, purchased_at)
      SELECT name, updated_at FROM shopping_items WHERE checked = 1
    `);
  }

  console.log('Database initialized');
}
