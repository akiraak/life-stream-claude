import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe, SavedRecipe } from '../types/models';
import * as savedRecipesApi from '../api/saved-recipes';

export type Mode = 'local' | 'server';

interface RecipeState {
  mode: Mode;
  savedRecipes: SavedRecipe[];
  loading: boolean;
  nextLocalId: number;

  setMode: (mode: Mode) => void;
  clearLocalData: () => void;

  loadSavedRecipes: () => Promise<void>;
  deleteSavedRecipe: (id: number) => Promise<void>;

  autoSaveRecipes: (
    dishName: string,
    recipes: Recipe[],
    sourceDishId: number,
  ) => Promise<SavedRecipe[]>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildLocalSavedRecipe(
  id: number,
  dishName: string,
  recipe: Recipe,
  sourceDishId: number,
): SavedRecipe {
  return {
    id,
    user_id: 0,
    dish_name: dishName,
    title: recipe.title,
    summary: recipe.summary,
    steps_json: JSON.stringify(recipe.steps ?? []),
    ingredients_json: JSON.stringify(recipe.ingredients ?? []),
    source_dish_id: sourceDishId,
    created_at: nowIso(),
  };
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set, get) => ({
      mode: 'local',
      savedRecipes: [],
      loading: false,
      nextLocalId: -1,

      setMode: (mode) => {
        if (get().mode === mode) return;
        set({ mode, savedRecipes: [] });
      },

      clearLocalData: () => {
        set({ savedRecipes: [], nextLocalId: -1 });
      },

      loadSavedRecipes: async () => {
        if (get().mode === 'local') return;
        set({ loading: true });
        try {
          const recipes = await savedRecipesApi.getSavedRecipes();
          set({ savedRecipes: recipes });
        } finally {
          set({ loading: false });
        }
      },

      deleteSavedRecipe: async (id) => {
        if (get().mode === 'server') {
          await savedRecipesApi.deleteSavedRecipe(id);
        }
        set((s) => ({
          savedRecipes: s.savedRecipes.filter((r) => r.id !== id),
        }));
      },

      autoSaveRecipes: async (dishName, recipes, sourceDishId) => {
        if (recipes.length === 0) return [];

        if (get().mode === 'local') {
          const assigned: SavedRecipe[] = [];
          let nextId = get().nextLocalId;
          for (const r of recipes) {
            assigned.push(buildLocalSavedRecipe(nextId, dishName, r, sourceDishId));
            nextId -= 1;
          }
          set((s) => ({
            savedRecipes: [...assigned, ...s.savedRecipes],
            nextLocalId: nextId,
          }));
          return assigned;
        }

        const inputs: savedRecipesApi.BulkSavedRecipeInput[] = recipes.map((r) => ({
          dishName,
          title: r.title,
          summary: r.summary,
          steps: r.steps,
          ingredients: r.ingredients,
          sourceDishId,
        }));
        const created = await savedRecipesApi.createSavedRecipesBulk(inputs);
        set((s) => ({
          savedRecipes: [...created, ...s.savedRecipes],
        }));
        return created;
      },
    }),
    {
      name: 'cb-recipe-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) =>
        state.mode === 'local'
          ? {
              mode: state.mode,
              savedRecipes: state.savedRecipes,
              nextLocalId: state.nextLocalId,
            }
          : { mode: state.mode, nextLocalId: state.nextLocalId },
    },
  ),
);
