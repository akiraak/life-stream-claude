/**
 * Vitest setup: テスト実行前に必ず test 用の環境変数をセットする。
 * src/ 側のモジュールが import されるより前に評価される必要があるので、
 * dotenv や DB_PATH はここで強制的に test 値に固定する。
 */
import path from 'node:path';
import fs from 'node:fs';

// 本番 .env を読み込まない（prod SECRET / API キーがテスト経路に混入するのを防ぐ）
process.env.NODE_ENV = 'test';

// 認証・外部 API は全てテスト用ダミーに固定
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-prod';
process.env.RESEND_API_KEY = 'test-dummy-resend-key';
process.env.EMAIL_FROM = 'noreply@test.local';
process.env.GOOGLE_CLIENT_ID = 'test-dummy-google-client-id';
process.env.GEMINI_API_KEY = 'test-dummy-gemini-key';
process.env.ADMIN_EMAILS = 'admin@test.local';
process.env.DEVICE_ID_SECRET = 'test-device-id-secret';
process.env.AI_LIMIT_USER = '20';
process.env.AI_LIMIT_GUEST = '3';

// テスト DB を per-process で /tmp に作る（並列実行時の WAL 競合を避ける）
const TEST_DB_PATH = path.join('/tmp', `cb-test-${process.pid}.db`);
process.env.DB_PATH = TEST_DB_PATH;

// 多重防御: 本体の shopping.db を絶対に指さない
const normalizedDbPath = path.resolve(process.env.DB_PATH);
const realDbPath = path.resolve(__dirname, '../shopping.db');
if (normalizedDbPath === realDbPath) {
  throw new Error(
    `Refusing to run tests against the real shopping.db (${realDbPath}). ` +
      `DB_PATH must point to a /tmp test database.`
  );
}

// プロセス開始前に古いテスト DB が残っていたら除去する
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(TEST_DB_PATH + suffix);
  } catch {
    // ファイルが無ければ無視
  }
}
