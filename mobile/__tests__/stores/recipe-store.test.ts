import type { Recipe, SavedRecipe } from '../../src/types/models';

jest.mock('../../src/api/saved-recipes', () => ({
  getSavedRecipes: jest.fn(),
  getSharedRecipes: jest.fn(),
  toggleLike: jest.fn(),
  deleteSavedRecipe: jest.fn(),
  createSavedRecipesBulk: jest.fn(),
}));

import * as savedRecipesApi from '../../src/api/saved-recipes';
import { useRecipeStore } from '../../src/stores/recipe-store';
import { useAuthStore } from '../../src/stores/auth-store';

const api = savedRecipesApi as jest.Mocked<typeof savedRecipesApi>;

function makeRecipe(partial?: Partial<Recipe>): Recipe {
  return {
    title: partial?.title ?? 'タイトル',
    summary: partial?.summary ?? '概要',
    steps: partial?.steps ?? ['step1', 'step2'],
    ingredients: partial?.ingredients ?? [{ name: '材料', category: '' }],
  };
}

function resetStore(mode: 'local' | 'server') {
  useRecipeStore.setState({
    mode,
    savedRecipes: [],
    sharedRecipes: [],
    loading: false,
    nextLocalId: -1,
  });
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    email: null,
    userId: null,
    authModalVisible: false,
    authModalReason: null,
    authModalOnSuccess: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('recipe-store (server mode)', () => {
  beforeEach(() => resetStore('server'));

  it('loadSavedRecipes fetches from the server', async () => {
    const recipes = [{ id: 1 } as SavedRecipe];
    api.getSavedRecipes.mockResolvedValue(recipes);
    await useRecipeStore.getState().loadSavedRecipes();
    expect(api.getSavedRecipes).toHaveBeenCalled();
    expect(useRecipeStore.getState().savedRecipes).toEqual(recipes);
  });

  it('toggleLike updates saved and shared recipes with the server response', async () => {
    useRecipeStore.setState({
      savedRecipes: [
        { id: 1, liked: 0, like_count: 0 } as SavedRecipe,
        { id: 2, liked: 0, like_count: 0 } as SavedRecipe,
      ],
      sharedRecipes: [{ id: 1, liked: 0, like_count: 0 } as SavedRecipe],
    });
    api.toggleLike.mockResolvedValue({ liked: 1, like_count: 3 });

    await useRecipeStore.getState().toggleLike(1);

    expect(api.toggleLike).toHaveBeenCalledWith(1);
    const state = useRecipeStore.getState();
    expect(state.savedRecipes[0]).toMatchObject({ liked: 1, like_count: 3 });
    expect(state.savedRecipes[1]).toMatchObject({ liked: 0 });
    expect(state.sharedRecipes[0]).toMatchObject({ liked: 1, like_count: 3 });
  });

  it('autoSaveRecipes posts bulk and prepends to state', async () => {
    const recipes = [makeRecipe({ title: 'R1' }), makeRecipe({ title: 'R2' })];
    const created = [
      { id: 100, title: 'R1', liked: 0, like_count: 0 } as SavedRecipe,
      { id: 101, title: 'R2', liked: 0, like_count: 0 } as SavedRecipe,
    ];
    api.createSavedRecipesBulk.mockResolvedValue(created);

    const result = await useRecipeStore.getState().autoSaveRecipes('カレー', recipes, 10);

    expect(api.createSavedRecipesBulk).toHaveBeenCalledWith([
      expect.objectContaining({ dishName: 'カレー', title: 'R1', sourceDishId: 10 }),
      expect.objectContaining({ dishName: 'カレー', title: 'R2', sourceDishId: 10 }),
    ]);
    expect(result).toEqual(created);
    expect(useRecipeStore.getState().savedRecipes).toEqual(created);
  });
});

describe('recipe-store (local mode)', () => {
  beforeEach(() => resetStore('local'));

  it('loadSavedRecipes is a no-op (uses persisted state)', async () => {
    useRecipeStore.setState({ savedRecipes: [{ id: -1 } as SavedRecipe] });
    await useRecipeStore.getState().loadSavedRecipes();
    expect(api.getSavedRecipes).not.toHaveBeenCalled();
    expect(useRecipeStore.getState().savedRecipes).toHaveLength(1);
  });

  it('autoSaveRecipes assigns negative ids locally without hitting the server', async () => {
    const recipes = [makeRecipe({ title: 'A' }), makeRecipe({ title: 'B' })];
    const result = await useRecipeStore.getState().autoSaveRecipes('鍋', recipes, 42);

    expect(api.createSavedRecipesBulk).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(-1);
    expect(result[1].id).toBe(-2);
    expect(result[0].source_dish_id).toBe(42);
    const state = useRecipeStore.getState();
    expect(state.savedRecipes).toHaveLength(2);
    expect(state.nextLocalId).toBe(-3);
  });

  it('toggleLike triggers requestLogin when not authenticated', async () => {
    await useRecipeStore.getState().toggleLike(1);
    expect(api.toggleLike).not.toHaveBeenCalled();
    const auth = useAuthStore.getState();
    expect(auth.authModalVisible).toBe(true);
    expect(auth.authModalReason).toContain('いいね');
  });

  it('deleteSavedRecipe removes locally only', async () => {
    useRecipeStore.setState({
      savedRecipes: [
        { id: -1, title: 'A' } as SavedRecipe,
        { id: -2, title: 'B' } as SavedRecipe,
      ],
    });
    await useRecipeStore.getState().deleteSavedRecipe(-1);
    expect(api.deleteSavedRecipe).not.toHaveBeenCalled();
    expect(useRecipeStore.getState().savedRecipes.map((r) => r.id)).toEqual([-2]);
  });
});

describe('recipe-store (setMode)', () => {
  it('clears state when switching modes', () => {
    resetStore('local');
    useRecipeStore.setState({ savedRecipes: [{ id: -1 } as SavedRecipe] });
    useRecipeStore.getState().setMode('server');
    const state = useRecipeStore.getState();
    expect(state.mode).toBe('server');
    expect(state.savedRecipes).toHaveLength(0);
  });
});
