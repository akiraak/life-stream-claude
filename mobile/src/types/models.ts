export interface ShoppingItem {
  id: number;
  name: string;
  category: string;
  checked: number; // 0 or 1
  dish_id: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DishItem {
  id: number;
  name: string;
  category: string;
  checked: number;
}

export interface Dish {
  id: number;
  name: string;
  ingredients_json: string | null;
  recipes_json: string | null;
  items: DishItem[];
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  name: string;
  category: string;
}

export interface Recipe {
  title: string;
  summary: string;
  steps: string[];
  ingredients: Ingredient[];
}

export interface RecipeState {
  id: number;
}

export interface SuggestIngredientsResponse {
  dishId: number;
  dishName: string;
  ingredients: Ingredient[];
  recipes: Recipe[];
  recipeStates: RecipeState[];
}

export interface SavedRecipe {
  id: number;
  user_id: number;
  dish_name: string;
  title: string;
  summary: string;
  steps_json: string;
  ingredients_json: string;
  source_dish_id: number | null;
  created_at: string;
}
