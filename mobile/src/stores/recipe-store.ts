import { create } from 'zustand';
import type { SavedRecipe } from '../types/models';
import * as savedRecipesApi from '../api/saved-recipes';

interface RecipeState {
  savedRecipes: SavedRecipe[];
  sharedRecipes: SavedRecipe[];
  loading: boolean;

  loadSavedRecipes: () => Promise<void>;
  loadSharedRecipes: () => Promise<void>;
  toggleLike: (id: number) => Promise<void>;
}

export const useRecipeStore = create<RecipeState>((set, get) => ({
  savedRecipes: [],
  sharedRecipes: [],
  loading: false,

  loadSavedRecipes: async () => {
    set({ loading: true });
    try {
      const recipes = await savedRecipesApi.getSavedRecipes();
      set({ savedRecipes: recipes });
    } finally {
      set({ loading: false });
    }
  },

  loadSharedRecipes: async () => {
    set({ loading: true });
    try {
      const recipes = await savedRecipesApi.getSharedRecipes();
      set({ sharedRecipes: recipes });
    } finally {
      set({ loading: false });
    }
  },

  toggleLike: async (id) => {
    const result = await savedRecipesApi.toggleLike(id);
    const updateRecipe = (r: SavedRecipe) =>
      r.id === id ? { ...r, liked: result.liked, like_count: result.like_count } : r;

    set((s) => ({
      savedRecipes: s.savedRecipes.map(updateRecipe),
      sharedRecipes: s.sharedRecipes.map(updateRecipe),
    }));
  },
}));
