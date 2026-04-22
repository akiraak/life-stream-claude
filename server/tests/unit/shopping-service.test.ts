import { describe, expect, it } from 'vitest';
import {
  createItem,
  deleteCheckedItems,
  getAllItems,
  getSuggestions,
  recordPurchase,
  updateItem,
} from '../../src/services/shopping-service';
import { getDatabase } from '../../src/database';
import { createTestUser } from '../helpers/auth';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

describe('shopping-service', () => {
  describe('createItem / getAllItems', () => {
    it('scopes items by userId (other users cannot see them)', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');

      createItem(alice.id, { name: '牛乳' });
      createItem(alice.id, { name: 'パン', category: '食品' });
      createItem(bob.id, { name: '卵' });

      const aliceItems = getAllItems(alice.id);
      const bobItems = getAllItems(bob.id);

      expect(aliceItems.map((i) => i.name).sort()).toEqual(['パン', '牛乳']);
      expect(bobItems.map((i) => i.name)).toEqual(['卵']);
    });

    it('stores category (defaults to empty string when omitted)', () => {
      const user = createTestUser();
      const withCategory = createItem(user.id, { name: 'りんご', category: '果物' });
      const withoutCategory = createItem(user.id, { name: '醤油' });

      expect(withCategory.category).toBe('果物');
      expect(withoutCategory.category).toBe('');
    });

    it('inserts new items at position 0 and shifts existing unchecked items', () => {
      const user = createTestUser();
      const first = createItem(user.id, { name: 'A' });
      const second = createItem(user.id, { name: 'B' });
      const third = createItem(user.id, { name: 'C' });

      const db = getDatabase();
      const positions = db
        .prepare('SELECT id, name, position FROM shopping_items WHERE user_id = ? ORDER BY id ASC')
        .all(user.id) as { id: number; name: string; position: number }[];

      const byName = Object.fromEntries(positions.map((p) => [p.name, p.position]));
      // 新しいものほど先頭 (position=0)、古いものほど後ろにシフト
      expect(byName['C']).toBe(0);
      expect(byName['B']).toBe(1);
      expect(byName['A']).toBe(2);

      // 参照の一貫性
      expect(first.id).not.toBe(second.id);
      expect(second.id).not.toBe(third.id);
    });
  });

  describe('updateItem', () => {
    it('records a purchase_history row when checked is flipped from 0 to 1', () => {
      const user = createTestUser();
      const item = createItem(user.id, { name: 'バター' });

      const db = getDatabase();
      const before = (db
        .prepare('SELECT COUNT(*) as cnt FROM purchase_history WHERE user_id = ? AND item_name = ?')
        .get(user.id, 'バター') as { cnt: number }).cnt;
      expect(before).toBe(0);

      const updated = updateItem(user.id, item.id, { checked: 1 });
      expect(updated?.checked).toBe(1);

      const after = (db
        .prepare('SELECT COUNT(*) as cnt FROM purchase_history WHERE user_id = ? AND item_name = ?')
        .get(user.id, 'バター') as { cnt: number }).cnt;
      expect(after).toBe(1);
    });

    it('does not duplicate purchase_history when an already-checked item is re-updated', () => {
      const user = createTestUser();
      const item = createItem(user.id, { name: 'チーズ' });

      updateItem(user.id, item.id, { checked: 1 });
      // 既に checked=1 の状態でさらに checked=1 を送っても履歴は増えない
      updateItem(user.id, item.id, { checked: 1 });

      const db = getDatabase();
      const cnt = (db
        .prepare('SELECT COUNT(*) as cnt FROM purchase_history WHERE user_id = ? AND item_name = ?')
        .get(user.id, 'チーズ') as { cnt: number }).cnt;
      expect(cnt).toBe(1);
    });

    it('returns null when updating an item owned by a different user', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');
      const aliceItem = createItem(alice.id, { name: 'オリーブオイル' });

      const result = updateItem(bob.id, aliceItem.id, { checked: 1 });
      expect(result).toBeNull();
    });
  });

  describe('deleteCheckedItems', () => {
    it('returns the number of deleted rows and only removes checked ones', () => {
      const user = createTestUser();
      const a = createItem(user.id, { name: 'A' });
      const b = createItem(user.id, { name: 'B' });
      createItem(user.id, { name: 'C' });

      updateItem(user.id, a.id, { checked: 1 });
      updateItem(user.id, b.id, { checked: 1 });

      const deleted = deleteCheckedItems(user.id);
      expect(deleted).toBe(2);

      const remaining = getAllItems(user.id).map((i) => i.name);
      expect(remaining).toEqual(['C']);
    });

    it('returns 0 when no checked items exist', () => {
      const user = createTestUser();
      createItem(user.id, { name: 'X' });
      expect(deleteCheckedItems(user.id)).toBe(0);
    });

    it('does not delete another user\'s checked items', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');
      const bobItem = createItem(bob.id, { name: 'バナナ' });
      updateItem(bob.id, bobItem.id, { checked: 1 });

      const deleted = deleteCheckedItems(alice.id);
      expect(deleted).toBe(0);
      expect(getAllItems(bob.id)).toHaveLength(1);
    });
  });

  describe('getSuggestions', () => {
    it('excludes items that are currently in shopping_items with checked=0', () => {
      const user = createTestUser();
      recordPurchase(user.id, '牛乳');
      recordPurchase(user.id, '牛乳');
      recordPurchase(user.id, 'パン');

      // 牛乳を未チェックでカートに入れる → 候補から除外されるはず
      createItem(user.id, { name: '牛乳' });

      const suggestions = getSuggestions(user.id, '');
      const names = suggestions.map((s) => s.name);

      expect(names).not.toContain('牛乳');
      expect(names).toContain('パン');
    });

    it('still suggests items that are in shopping_items but already checked', () => {
      const user = createTestUser();
      recordPurchase(user.id, 'にんじん');
      const item = createItem(user.id, { name: 'にんじん' });
      updateItem(user.id, item.id, { checked: 1 });

      const suggestions = getSuggestions(user.id, '');
      expect(suggestions.map((s) => s.name)).toContain('にんじん');
    });

    it('filters by query prefix (case-insensitive)', () => {
      const user = createTestUser();
      recordPurchase(user.id, 'Apple');
      recordPurchase(user.id, 'avocado');
      recordPurchase(user.id, 'Banana');

      const suggestions = getSuggestions(user.id, 'a');
      const names = suggestions.map((s) => s.name).sort();
      expect(names).toEqual(['Apple', 'avocado']);
    });

    it('does not leak suggestions across users', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');
      recordPurchase(alice.id, 'シークレット');

      const bobSuggestions = getSuggestions(bob.id, '');
      expect(bobSuggestions.map((s) => s.name)).not.toContain('シークレット');
    });
  });
});
