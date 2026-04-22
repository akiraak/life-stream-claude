/**
 * テスト用 認証ヘルパー。
 * - createTestUser: email でユーザーを作成して User を返す
 * - createAuthHeader: 指定 userId 用の Authorization ヘッダを返す
 */
import {
  findOrCreateUser,
  generateJwt,
} from '../../src/services/auth-service';

export interface TestUser {
  id: number;
  email: string;
}

export function createTestUser(email = 'test@example.com'): TestUser {
  const user = findOrCreateUser(email.trim().toLowerCase());
  return { id: user.id, email: user.email };
}

export function createAuthHeader(user: TestUser): { Authorization: string } {
  const token = generateJwt(user.id, user.email);
  return { Authorization: `Bearer ${token}` };
}

/**
 * ユーザー作成 + ヘッダ生成を 1 ステップで行うユーティリティ。
 */
export function createAuthedUser(
  email = 'test@example.com',
): { user: TestUser; headers: { Authorization: string } } {
  const user = createTestUser(email);
  return { user, headers: createAuthHeader(user) };
}
