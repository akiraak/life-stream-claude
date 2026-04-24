/**
 * テスト用 DB ヘルパー。
 *
 * - DB_PATH は tests/setup.ts で /tmp/cb-test-<pid>.db に固定済み
 * - 各テストの beforeEach で user データ系テーブルを truncate する
 * - 各ファイル終了時に DB ハンドルを閉じて一時ファイルを削除する
 */
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { closeDatabase, getDatabase, initDatabase } from '../../src/database';

// 外部キー制約を守るために依存関係の子→親の順で消す
const TRUNCATE_TABLES = [
  'recipe_likes',
  'saved_recipes',
  'shopping_items',
  'purchase_history',
  'dishes',
  'magic_link_tokens',
  'users',
  'ai_quota',
  'app_settings',
] as const;

export function truncateAllTables(): void {
  const db = getDatabase();
  const stmt = db.transaction(() => {
    for (const table of TRUNCATE_TABLES) {
      db.exec(`DELETE FROM ${table}`);
    }
    // AUTOINCREMENT の連番も戻しておくと assertion が読みやすい
    db.exec(
      `DELETE FROM sqlite_sequence WHERE name IN (${TRUNCATE_TABLES.map(() => '?').join(',')})`,
    );
  });
  try {
    stmt();
  } catch {
    // sqlite_sequence が無い初回は失敗することがある → 無視して次回に任せる
    for (const table of TRUNCATE_TABLES) {
      db.exec(`DELETE FROM ${table}`);
    }
  }
}

/**
 * テストファイルの先頭で呼ぶだけで DB の初期化と per-test truncate をセットアップする。
 */
export function setupTestDatabase(): void {
  beforeAll(() => {
    initDatabase();
  });

  beforeEach(() => {
    truncateAllTables();
  });

  afterAll(() => {
    closeDatabase();
    if (process.env.DB_PATH) {
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(process.env.DB_PATH + suffix);
        } catch {
          // ファイルが無ければ無視
        }
      }
    }
  });
}
