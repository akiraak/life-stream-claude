import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../shopping.db');
const SCHEMA_VERSION = 2; // バージョン1→2: マルチユーザー対応

let db: Database.Database | undefined;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// テスト用: DB ハンドルを閉じてモジュールキャッシュをリセットする。
// 次回 getDatabase() 呼出で再度開き直される。
export function closeDatabase(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // 既に閉じている等は無視
    }
    db = undefined;
  }
}

export function initDatabase(): void {
  const database = getDatabase();

  // スキーマバージョン管理テーブル
  database.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const row = database.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  const currentVersion = row ? Number(row.value) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    // 旧テーブルを全て削除して再作成
    database.exec(`
      DROP TABLE IF EXISTS dish_items;
      DROP TABLE IF EXISTS dishes;
      DROP TABLE IF EXISTS shopping_items;
      DROP TABLE IF EXISTS purchase_history;
      DROP TABLE IF EXISTS dish_history;
      DROP TABLE IF EXISTS magic_link_tokens;
      DROP TABLE IF EXISTS users;
    `);

    // users テーブル
    database.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT DEFAULT (datetime('now')),
        last_login_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // magic_link_tokens テーブル
    database.exec(`
      CREATE TABLE magic_link_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    database.exec('CREATE INDEX idx_magic_link_tokens_token ON magic_link_tokens(token)');

    // dishes テーブル（user_id 追加）
    database.exec(`
      CREATE TABLE dishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        ingredients_json TEXT,
        recipes_json TEXT,
        position INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    database.exec('CREATE INDEX idx_dishes_user ON dishes(user_id)');

    // shopping_items テーブル（dish_id で料理にリンク）
    database.exec(`
      CREATE TABLE shopping_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT DEFAULT '',
        checked INTEGER DEFAULT 0,
        position INTEGER,
        dish_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE SET NULL
      )
    `);
    database.exec('CREATE INDEX idx_shopping_items_user ON shopping_items(user_id)');
    database.exec('CREATE INDEX idx_shopping_items_dish ON shopping_items(dish_id)');

    // purchase_history テーブル（user_id 追加）
    database.exec(`
      CREATE TABLE purchase_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        purchased_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    database.exec('CREATE INDEX idx_purchase_history_user ON purchase_history(user_id)');
    database.exec('CREATE INDEX idx_purchase_history_name ON purchase_history(item_name COLLATE NOCASE)');

    // スキーマバージョンを更新
    database.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
  }

  // マイグレーション: OTPコード用カラム追加
  try {
    database.exec('ALTER TABLE magic_link_tokens ADD COLUMN code TEXT');
  } catch {
    // カラムが既に存在する場合は無視
  }

  // マイグレーション: saved_recipes テーブル追加
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS saved_recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        dish_name TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        ingredients_json TEXT NOT NULL,
        source_dish_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_saved_recipes_user ON saved_recipes(user_id)');
  } catch {
    // テーブルが既に存在する場合は無視
  }

  // マイグレーション: saved_recipes に liked カラム追加
  try {
    database.exec('ALTER TABLE saved_recipes ADD COLUMN liked INTEGER DEFAULT 0');
  } catch {
    // カラムが既に存在する場合は無視
  }

  // マイグレーション: recipe_likes テーブル追加（複数ユーザーいいね対応）
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS recipe_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        saved_recipe_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (saved_recipe_id) REFERENCES saved_recipes(id) ON DELETE CASCADE,
        UNIQUE(user_id, saved_recipe_id)
      )
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_recipe_likes_recipe ON recipe_likes(saved_recipe_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_recipe_likes_user ON recipe_likes(user_id)');
    // 既存の liked=1 データを recipe_likes に移行
    database.exec(`
      INSERT OR IGNORE INTO recipe_likes (user_id, saved_recipe_id)
        SELECT user_id, id FROM saved_recipes WHERE liked = 1
    `);
  } catch {
    // テーブルが既に存在する場合は無視
  }

  // マイグレーション: dishes に active カラム追加（ソフトデリート対応）
  try {
    database.exec('ALTER TABLE dishes ADD COLUMN active INTEGER DEFAULT 1');
  } catch {
    // カラムが既に存在する場合は無視
  }

  // マイグレーション: dish_items を shopping_items.dish_id に統合
  try {
    database.exec('ALTER TABLE shopping_items ADD COLUMN dish_id INTEGER');
  } catch {
    // カラムが既に存在する場合は無視
  }
  try {
    database.exec(`
      UPDATE shopping_items SET
        dish_id = (SELECT di.dish_id FROM dish_items di WHERE di.item_id = shopping_items.id LIMIT 1),
        position = COALESCE(
          (SELECT di.position FROM dish_items di WHERE di.item_id = shopping_items.id LIMIT 1),
          shopping_items.position
        )
      WHERE id IN (SELECT item_id FROM dish_items)
    `);
    database.exec('DROP TABLE IF EXISTS dish_items');
  } catch {
    // dish_items テーブルが既に削除されている場合は無視
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_shopping_items_dish ON shopping_items(dish_id)');

  // マイグレーション: dish_history テーブル削除（dishes テーブルで代替）
  database.exec('DROP TABLE IF EXISTS dish_history');

  console.log('Database initialized');
}
