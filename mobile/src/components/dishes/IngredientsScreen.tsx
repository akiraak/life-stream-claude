import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import { useShoppingStore } from '../../stores/shopping-store';
import { RecipeCard } from './RecipeCard';
import { useRecipeStore } from '../../stores/recipe-store';
import { useAiStore } from '../../stores/ai-store';
import { useAuthStore } from '../../stores/auth-store';
import { AiQuotaError } from '../../api/ai';
import type { Dish, Ingredient, Recipe, RecipeState } from '../../types/models';
import type { SuggestIngredientsResult } from '../../stores/shopping-store';

interface IngredientsScreenProps {
  dish: Dish;
  onClose: () => void;
}

export function IngredientsScreen({ dish, onClose }: IngredientsScreenProps) {
  const colors = useThemeColors();
  const { addItem, linkItemToDish, loadAll, updateDish } = useShoppingStore();
  const { toggleLike } = useRecipeStore();
  const { remaining } = useAiStore();
  const { isAuthenticated, requestLogin } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeStates, setRecipeStates] = useState<RecipeState[]>([]);
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [dishName, setDishName] = useState(dish.name);
  const [editingName, setEditingName] = useState(false);

  const dishItemNames = useMemo(
    () => new Set(dish.items.filter((i) => !i.checked).map((i) => i.name)),
    [dish.items],
  );

  const extraIngredients = useMemo(() => {
    const aiNames = new Set(ingredients.map((i) => i.name));
    return dish.items
      .filter((item) => !item.checked && !aiNames.has(item.name))
      .map((item) => item.name);
  }, [dish.items, ingredients]);

  // dish.ingredients_json / recipes_json に前回のキャッシュがあれば初期表示に使う
  useEffect(() => {
    if (!dish.ingredients_json && !dish.recipes_json) return;
    try {
      const cachedIngredients: Ingredient[] = dish.ingredients_json
        ? JSON.parse(dish.ingredients_json)
        : [];
      const cachedRecipes: Recipe[] = dish.recipes_json ? JSON.parse(dish.recipes_json) : [];
      setIngredients(cachedIngredients);
      setRecipes(cachedRecipes);
      const existing = new Set<string>();
      for (const ing of cachedIngredients) {
        if (dishItemNames.has(ing.name)) existing.add(ing.name);
      }
      setAddedNames(existing);
    } catch {
      /* 破損したキャッシュは無視 */
    }
    // 初回のみ参照（dish.id で dep 判定）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dish.id]);

  const fetchSuggestions = useCallback(
    async (extras?: string[]) => {
      setLoading(true);
      try {
        const data: SuggestIngredientsResult = await useShoppingStore.getState().suggestIngredients(
          dish.id,
          extras && extras.length > 0 ? extras : undefined,
        );
        setIngredients(data.ingredients);
        setRecipes(data.recipes);
        setRecipeStates(data.recipeStates);
        const existing = new Set<string>();
        for (const ing of data.ingredients) {
          if (dishItemNames.has(ing.name)) existing.add(ing.name);
        }
        setAddedNames(existing);
      } catch (e: unknown) {
        if (e instanceof AiQuotaError) {
          if (!isAuthenticated) {
            requestLogin({
              reason: 'AI 提案の残り回数を増やすにはログインしてください',
              onSuccess: () => fetchSuggestions(extras),
            });
          } else {
            Alert.alert('本日の上限に達しました', '明日また使えます');
          }
        } else {
          const message = e instanceof Error ? e.message : 'AI提案に失敗しました';
          Alert.alert('エラー', message);
        }
      } finally {
        setLoading(false);
      }
    },
    [dish.id, dishItemNames, isAuthenticated, requestLogin],
  );

  const handleToggleIngredient = useCallback(
    async (name: string) => {
      if (addedNames.has(name)) {
        setAddedNames((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
      } else {
        setAddedNames((prev) => new Set(prev).add(name));
        try {
          const ingredient = ingredients.find((i) => i.name === name);
          const item = await addItem(name, ingredient?.category);
          await linkItemToDish(dish.id, item.id);
        } catch {
          setAddedNames((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        }
      }
    },
    [addedNames, ingredients, addItem, linkItemToDish, dish.id],
  );

  const handleRefresh = useCallback(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleSearchWithExtras = useCallback(() => {
    fetchSuggestions(extraIngredients);
  }, [fetchSuggestions, extraIngredients]);

  const handleToggleLike = useCallback(
    async (recipeStateId: number) => {
      try {
        await toggleLike(recipeStateId);
        // local モード（未認証）時は toggleLike 内で requestLogin を呼ぶのみで状態は変化しない
        if (useRecipeStore.getState().mode === 'server') {
          setRecipeStates((prev) =>
            prev.map((rs) =>
              rs.id === recipeStateId ? { ...rs, liked: rs.liked ? 0 : 1 } : rs,
            ),
          );
        }
      } catch {
        Alert.alert('エラー', 'いいねに失敗しました');
      }
    },
    [toggleLike],
  );

  const handleAddRecipeToList = useCallback(
    async (recipe: Recipe) => {
      for (const ing of recipe.ingredients) {
        if (!addedNames.has(ing.name)) {
          try {
            const item = await addItem(ing.name, ing.category);
            await linkItemToDish(dish.id, item.id);
            setAddedNames((prev) => new Set(prev).add(ing.name));
          } catch {
            /* skip */
          }
        }
      }
    },
    [addedNames, addItem, linkItemToDish, dish.id],
  );

  const handleSaveName = useCallback(async () => {
    const trimmed = dishName.trim();
    if (!trimmed || trimmed === dish.name) {
      setDishName(dish.name);
      setEditingName(false);
      return;
    }
    try {
      await updateDish(dish.id, trimmed);
      setEditingName(false);
    } catch {
      setDishName(dish.name);
      setEditingName(false);
    }
  }, [dishName, dish.id, dish.name, updateDish]);

  const withRemaining = useCallback(
    (base: string) => (remaining === null ? base : `${base}（残り ${remaining} 回）`),
    [remaining],
  );

  const refreshLabel = useMemo(
    () =>
      extraIngredients.length > 0
        ? withRemaining('この素材でレシピをAI検索')
        : withRemaining('レシピをAI検索'),
    [extraIngredients.length, withRemaining],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => {
            loadAll();
            onClose();
          }}
          style={styles.headerSide}
        >
          <Text style={[styles.backBtn, { color: colors.primaryLight }]}>← 戻る</Text>
        </TouchableOpacity>
        {editingName ? (
          <TextInput
            style={[
              styles.nameInput,
              {
                color: colors.text,
                borderColor: colors.primaryLight,
                backgroundColor: colors.background,
              },
            ]}
            value={dishName}
            onChangeText={setDishName}
            onBlur={handleSaveName}
            onSubmitEditing={handleSaveName}
            autoFocus
            autoComplete="off"
            importantForAutofill="no"
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity style={styles.dishTitleBtn} onPress={() => setEditingName(true)}>
            <View
              style={[styles.dishTitleUnderline, { borderBottomColor: 'rgba(251,146,60,0.5)' }]}
            >
              <Text style={[styles.dishTitle, { color: colors.primaryLight }]}>{dishName}</Text>
              <Text style={[styles.editIcon, { color: colors.textMuted }]}> ✎</Text>
            </View>
          </TouchableOpacity>
        )}
        <View style={styles.headerSide} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>AI で検索中...</Text>
          </View>
        ) : (
          <>
            {ingredients.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>具材</Text>
                <View style={styles.chipContainer}>
                  {ingredients.map((ing) => {
                    const isAdded = addedNames.has(ing.name);
                    return (
                      <TouchableOpacity
                        key={ing.name}
                        style={[
                          styles.chip,
                          isAdded
                            ? { backgroundColor: colors.primary }
                            : {
                                backgroundColor: colors.surfaceHover,
                                borderColor: 'rgba(251,146,60,0.3)',
                                borderWidth: 1,
                              },
                        ]}
                        onPress={() => handleToggleIngredient(ing.name)}
                      >
                        <Text
                          style={[styles.chipText, { color: isAdded ? '#fff' : colors.text }]}
                        >
                          {ing.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {extraIngredients.length > 0 ? (
              <View style={[styles.extraSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.extraLabel, { color: colors.textMuted }]}>
                  追加具材（買い物リストから）
                </Text>
                <View style={styles.chipContainer}>
                  {extraIngredients.map((name) => (
                    <View
                      key={name}
                      style={[
                        styles.chip,
                        styles.extraChip,
                        { borderColor: colors.primaryLight },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: colors.primaryLight }]}>
                        + {name}
                      </Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.extraSearchBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={handleSearchWithExtras}
                  disabled={loading}
                >
                  <Text style={styles.extraSearchBtnText}>{refreshLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.extraSearchBtn, { backgroundColor: colors.primaryLight }]}
                onPress={handleRefresh}
                disabled={loading}
              >
                <Text style={styles.extraSearchBtnText}>{refreshLabel}</Text>
              </TouchableOpacity>
            )}

            {recipes.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>レシピ</Text>
                {recipes.map((recipe, i) => (
                  <RecipeCard
                    key={i}
                    recipe={recipe}
                    recipeState={recipeStates[i]}
                    allIngredients={ingredients}
                    addedNames={addedNames}
                    onToggleLike={handleToggleLike}
                    onAddToList={handleAddRecipeToList}
                    onPressIngredient={handleToggleIngredient}
                  />
                ))}
                <TouchableOpacity
                  style={[
                    styles.extraSearchBtn,
                    styles.recipesFooterBtn,
                    { backgroundColor: colors.primaryLight },
                  ]}
                  onPress={extraIngredients.length > 0 ? handleSearchWithExtras : handleRefresh}
                  disabled={loading}
                >
                  <Text style={styles.extraSearchBtnText}>{refreshLabel}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerSide: {
    width: 60,
  },
  backBtn: {
    fontSize: 16,
  },
  dishTitleBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishTitleUnderline: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 2,
  },
  dishTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  editIcon: {
    fontSize: 13,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
  },
  extraSection: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    paddingTop: 16,
    marginBottom: 16,
  },
  extraLabel: {
    fontSize: 13,
    marginBottom: 10,
  },
  extraChip: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  extraSearchBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  extraSearchBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
  },
  recipesFooterBtn: {
    marginTop: 16,
  },
});
