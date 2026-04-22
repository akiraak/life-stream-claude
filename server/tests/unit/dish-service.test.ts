import { describe, expect, it } from 'vitest';
import {
  createDish,
  deleteDish,
  getAllDishes,
  getDish,
  linkItemToDish,
  reorderDishes,
  reorderDishItems,
  unlinkItemFromDish,
} from '../../src/services/dish-service';
import { createItem } from '../../src/services/shopping-service';
import { getDatabase } from '../../src/database';
import { createTestUser } from '../helpers/auth';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

describe('dish-service', () => {
  describe('create → link → unlink → delete', () => {
    it('links an item to a dish so it appears under the dish', () => {
      const user = createTestUser();
      const dish = createDish(user.id, 'カレー');
      const item = createItem(user.id, { name: '玉ねぎ' });

      expect(linkItemToDish(user.id, dish.id, item.id)).toBe(true);

      const fetched = getDish(user.id, dish.id);
      expect(fetched?.items.map((i) => i.name)).toEqual(['玉ねぎ']);
    });

    it('unlinks an item so it disappears from the dish but remains as a shopping item', () => {
      const user = createTestUser();
      const dish = createDish(user.id, 'カレー');
      const item = createItem(user.id, { name: 'にんじん' });

      linkItemToDish(user.id, dish.id, item.id);
      expect(unlinkItemFromDish(user.id, dish.id, item.id)).toBe(true);

      const fetched = getDish(user.id, dish.id);
      expect(fetched?.items).toEqual([]);

      // shopping_items 本体は残る（dish_id が NULL になっただけ）
      const db = getDatabase();
      const row = db
        .prepare('SELECT id, dish_id FROM shopping_items WHERE id = ?')
        .get(item.id) as { id: number; dish_id: number | null };
      expect(row.dish_id).toBeNull();
    });

    it('soft-deletes a dish and detaches its linked items (dish_id becomes NULL)', () => {
      const user = createTestUser();
      const dish = createDish(user.id, 'カレー');
      const item = createItem(user.id, { name: 'じゃがいも' });
      linkItemToDish(user.id, dish.id, item.id);

      expect(deleteDish(user.id, dish.id)).toBe(true);

      // active=0 のため getAllDishes からは見えない
      expect(getAllDishes(user.id)).toEqual([]);

      // リンクしていた item は dish_id=NULL で残る
      const db = getDatabase();
      const row = db
        .prepare('SELECT id, dish_id FROM shopping_items WHERE id = ?')
        .get(item.id) as { id: number; dish_id: number | null };
      expect(row.dish_id).toBeNull();

      // dishes 本体は active=0 で残る（reuse のため）
      const dishRow = db
        .prepare('SELECT active FROM dishes WHERE id = ?')
        .get(dish.id) as { active: number };
      expect(dishRow.active).toBe(0);
    });

    it('does not allow one user to link another user\'s item to their dish', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');
      const aliceDish = createDish(alice.id, 'ハンバーグ');
      const bobItem = createItem(bob.id, { name: 'ひき肉' });

      // Alice の dish に Bob の item をリンクしようとしても失敗する
      linkItemToDish(alice.id, aliceDish.id, bobItem.id);
      const fetched = getDish(alice.id, aliceDish.id);
      expect(fetched?.items).toEqual([]);
    });
  });

  describe('reorderDishes', () => {
    it('reassigns positions starting from 0 in the given id order', () => {
      const user = createTestUser();
      const a = createDish(user.id, 'A');
      const b = createDish(user.id, 'B');
      const c = createDish(user.id, 'C');

      reorderDishes(user.id, [c.id, a.id, b.id]);

      const db = getDatabase();
      const rows = db
        .prepare('SELECT id, position FROM dishes WHERE user_id = ?')
        .all(user.id) as { id: number; position: number }[];
      const posById = Object.fromEntries(rows.map((r) => [r.id, r.position]));

      expect(posById[c.id]).toBe(0);
      expect(posById[a.id]).toBe(1);
      expect(posById[b.id]).toBe(2);
    });

    it('does not touch positions of dishes owned by another user', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');
      const aliceDish = createDish(alice.id, 'A');
      const bobDish = createDish(bob.id, 'B');

      // Alice が Bob の dish を含む id で reorder しても Bob 側は無影響
      reorderDishes(alice.id, [bobDish.id, aliceDish.id]);

      const db = getDatabase();
      const bobPos = (db
        .prepare('SELECT position FROM dishes WHERE id = ?')
        .get(bobDish.id) as { position: number }).position;
      // Bob の dish は作成時の position (0) のまま
      expect(bobPos).toBe(0);
    });
  });

  describe('reorderDishItems', () => {
    it('reassigns item positions from 0 within a dish', () => {
      const user = createTestUser();
      const dish = createDish(user.id, '肉じゃが');
      const a = createItem(user.id, { name: 'A' });
      const b = createItem(user.id, { name: 'B' });
      const c = createItem(user.id, { name: 'C' });
      linkItemToDish(user.id, dish.id, a.id);
      linkItemToDish(user.id, dish.id, b.id);
      linkItemToDish(user.id, dish.id, c.id);

      reorderDishItems(user.id, dish.id, [b.id, c.id, a.id]);

      const db = getDatabase();
      const rows = db
        .prepare('SELECT id, position FROM shopping_items WHERE dish_id = ?')
        .all(dish.id) as { id: number; position: number }[];
      const posById = Object.fromEntries(rows.map((r) => [r.id, r.position]));

      expect(posById[b.id]).toBe(0);
      expect(posById[c.id]).toBe(1);
      expect(posById[a.id]).toBe(2);
    });
  });
});
