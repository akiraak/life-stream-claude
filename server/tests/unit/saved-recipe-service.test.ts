import { describe, expect, it } from 'vitest';
import {
  createSavedRecipe,
  deleteSavedRecipe,
  getAllSavedRecipes,
  getSavedRecipe,
  getSharedRecipes,
  toggleLike,
} from '../../src/services/saved-recipe-service';
import { createTestUser } from '../helpers/auth';
import { setupTestDatabase } from '../helpers/db';

setupTestDatabase();

const sampleInput = {
  dishName: 'カレー',
  title: '定番チキンカレー',
  summary: 'スパイスから作る基本のカレー',
  steps: ['玉ねぎを炒める', 'スパイスを加える', '煮込む'],
  ingredients: [
    { name: '玉ねぎ', category: '野菜' },
    { name: '鶏肉', category: '肉' },
  ],
};

describe('saved-recipe-service', () => {
  describe('create / getAll / get / delete', () => {
    it('saves a recipe and returns it via getAllSavedRecipes', () => {
      const user = createTestUser();
      const created = createSavedRecipe(user.id, sampleInput);

      expect(created.title).toBe('定番チキンカレー');
      expect(created.like_count).toBe(0);
      expect(created.liked).toBe(0);
      expect(JSON.parse(created.steps_json)).toEqual(sampleInput.steps);

      const list = getAllSavedRecipes(user.id);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(created.id);
    });

    it('fetches a single recipe scoped to the owner', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');
      const aliceRecipe = createSavedRecipe(alice.id, sampleInput);

      expect(getSavedRecipe(alice.id, aliceRecipe.id)?.id).toBe(aliceRecipe.id);
      expect(getSavedRecipe(bob.id, aliceRecipe.id)).toBeNull();
    });

    it('deletes a recipe owned by the user and refuses foreign ones', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');
      const recipe = createSavedRecipe(alice.id, sampleInput);

      expect(deleteSavedRecipe(bob.id, recipe.id)).toBe(false);
      expect(getSavedRecipe(alice.id, recipe.id)).not.toBeNull();

      expect(deleteSavedRecipe(alice.id, recipe.id)).toBe(true);
      expect(getSavedRecipe(alice.id, recipe.id)).toBeNull();
    });
  });

  describe('toggleLike', () => {
    it('flips liked and updates like_count on successive calls', () => {
      const author = createTestUser('author@example.com');
      const recipe = createSavedRecipe(author.id, sampleInput);

      const first = toggleLike(author.id, recipe.id);
      expect(first).toEqual({ liked: 1, like_count: 1 });

      const second = toggleLike(author.id, recipe.id);
      expect(second).toEqual({ liked: 0, like_count: 0 });
    });

    it('counts likes from multiple users independently', () => {
      const author = createTestUser('author@example.com');
      const fan1 = createTestUser('fan1@example.com');
      const fan2 = createTestUser('fan2@example.com');
      const recipe = createSavedRecipe(author.id, sampleInput);

      expect(toggleLike(fan1.id, recipe.id)).toEqual({ liked: 1, like_count: 1 });
      expect(toggleLike(fan2.id, recipe.id)).toEqual({ liked: 1, like_count: 2 });
      // fan1 視点では自分のいいねが 1, 合計 2
      const recipeForFan1 = getSavedRecipe(author.id, recipe.id); // owner 視点 = author
      // author 自身はいいねしていないので liked=0
      expect(recipeForFan1?.liked).toBe(0);
      expect(recipeForFan1?.like_count).toBe(2);
    });

    it('returns null when the recipe does not exist', () => {
      const user = createTestUser();
      expect(toggleLike(user.id, 999999)).toBeNull();
    });
  });

  describe('getSharedRecipes', () => {
    it('returns recipes from any user as long as they have at least one like, with liked reflecting the viewer', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');

      const aliceRecipe = createSavedRecipe(alice.id, { ...sampleInput, title: 'Alice Curry' });
      const bobRecipe = createSavedRecipe(bob.id, { ...sampleInput, title: 'Bob Curry' });
      // 誰にもいいねされていないレシピは shared には含まれない
      createSavedRecipe(alice.id, { ...sampleInput, title: 'Lonely Curry' });

      // Bob が Alice のレシピにいいね、Alice が Bob のレシピにいいね
      toggleLike(bob.id, aliceRecipe.id);
      toggleLike(alice.id, bobRecipe.id);

      const sharedForAlice = getSharedRecipes(alice.id);
      const titles = sharedForAlice.map((r) => r.title).sort();
      expect(titles).toEqual(['Alice Curry', 'Bob Curry']);

      const aliceView = Object.fromEntries(sharedForAlice.map((r) => [r.title, r]));
      // Alice は自分のレシピにはいいねしていない
      expect(aliceView['Alice Curry'].liked).toBe(0);
      // Alice は Bob のレシピにいいねした
      expect(aliceView['Bob Curry'].liked).toBe(1);

      // Lonely Curry は誰にもいいねされていないので含まれない
      expect(titles).not.toContain('Lonely Curry');
    });

    it('orders by like_count desc', () => {
      const alice = createTestUser('alice@example.com');
      const bob = createTestUser('bob@example.com');
      const carol = createTestUser('carol@example.com');

      const low = createSavedRecipe(alice.id, { ...sampleInput, title: 'Low' });
      const high = createSavedRecipe(alice.id, { ...sampleInput, title: 'High' });

      toggleLike(bob.id, low.id);
      toggleLike(bob.id, high.id);
      toggleLike(carol.id, high.id);

      const shared = getSharedRecipes(alice.id);
      expect(shared.map((r) => r.title)).toEqual(['High', 'Low']);
      expect(shared[0].like_count).toBe(2);
      expect(shared[1].like_count).toBe(1);
    });
  });
});
