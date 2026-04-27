import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import { useShoppingStore } from '../../stores/shopping-store';
import { useAiStore } from '../../stores/ai-store';
import { useDishSuggestions } from '../../hooks/use-dish-suggestions';
import { RecipeCard } from './RecipeCard';
import { DishNameHeader } from './DishNameHeader';
import type { Dish, Ingredient, Recipe } from '../../types/models';

interface IngredientsScreenProps {
  dish: Dish;
  onClose: () => void;
}

function parseJson<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as T[];
  } catch {
    return [];
  }
}

export function IngredientsScreen({ dish, onClose }: IngredientsScreenProps) {
  const colors = useThemeColors();
  const addItem = useShoppingStore((s) => s.addItem);
  const linkItemToDish = useShoppingStore((s) => s.linkItemToDish);
  const loadAll = useShoppingStore((s) => s.loadAll);
  // store の最新 dish を購読する。AI 提案は store の dish.ingredients_json /
  // recipes_json に書き戻すので、ここがそのまま唯一の真実になる。
  const liveDish = useShoppingStore((s) => s.dishes.find((d) => d.id === dish.id)) ?? dish;
  const remaining = useAiStore((s) => s.remaining);

  const ingredients = useMemo<Ingredient[]>(
    () => parseJson<Ingredient>(liveDish.ingredients_json),
    [liveDish.ingredients_json],
  );
  const recipes = useMemo<Recipe[]>(
    () => parseJson<Recipe>(liveDish.recipes_json),
    [liveDish.recipes_json],
  );

  const pinnedExtras = useMemo(
    () => liveDish.items.filter((i) => !i.checked).map((i) => i.name),
    [liveDish.items],
  );

  const dishItemNames = useMemo(() => new Set(pinnedExtras), [pinnedExtras]);

  const extraIngredients = useMemo(() => {
    const aiNames = new Set(ingredients.map((i) => i.name));
    return liveDish.items
      .filter((item) => !item.checked && !aiNames.has(item.name))
      .map((item) => item.name);
  }, [liveDish.items, ingredients]);

  const showError = useCallback((title: string, message: string) => {
    Alert.alert(title, message);
  }, []);

  const { loading, fetchSuggestions } = useDishSuggestions({
    dishId: dish.id,
    onError: showError,
  });

  // addedNames は「視覚的に追加済みとマークするチップ」のローカル状態。
  // dish.items への実体は addItem + linkItemToDish 経由で残っているが、
  // 一度トグル off した後に再 mark しないために local に持つ。
  const [addedNames, setAddedNames] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const cached = parseJson<Ingredient>(dish.ingredients_json);
    const itemNames = new Set(dish.items.filter((i) => !i.checked).map((i) => i.name));
    for (const ing of cached) {
      if (itemNames.has(ing.name)) initial.add(ing.name);
    }
    return initial;
  });

  // ingredients_json が更新されたとき（fetch 直後 / ログイン後の再 fetch 等）に
  // 「すでに買い物リストに入っている具材」を再シードする。
  // dishItemNames の変化単独では再シードしない（ユーザーのトグル off を保つ）。
  const seededFor = useRef<string | null>(liveDish.ingredients_json);
  useEffect(() => {
    if (seededFor.current === liveDish.ingredients_json) return;
    seededFor.current = liveDish.ingredients_json;
    const existing = new Set<string>();
    for (const ing of ingredients) {
      if (dishItemNames.has(ing.name)) existing.add(ing.name);
    }
    setAddedNames(existing);
  }, [liveDish.ingredients_json, ingredients, dishItemNames]);

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

  const handleSearch = useCallback(() => {
    void fetchSuggestions(pinnedExtras.length > 0 ? pinnedExtras : undefined);
  }, [fetchSuggestions, pinnedExtras]);

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

  const handleClose = useCallback(() => {
    void loadAll();
    onClose();
  }, [loadAll, onClose]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={handleClose} style={styles.headerSide}>
          <Text style={[styles.backBtn, { color: colors.primaryLight }]}>← 戻る</Text>
        </TouchableOpacity>
        <DishNameHeader dish={liveDish} />
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
                  onPress={handleSearch}
                  disabled={loading}
                >
                  <Text style={styles.extraSearchBtnText}>{refreshLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.extraSearchBtn, { backgroundColor: colors.primaryLight }]}
                onPress={handleSearch}
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
                    allIngredients={ingredients}
                    addedNames={addedNames}
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
                  onPress={handleSearch}
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
