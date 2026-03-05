import { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, FlatList, RefreshControl, StyleSheet, Alert } from 'react-native';
import { useThemeColors } from '../../src/theme/theme-provider';
import { useRecipeStore } from '../../src/stores/recipe-store';
import { useShoppingStore } from '../../src/stores/shopping-store';
import { RecipeListItem } from '../../src/components/recipes/RecipeListItem';
import { Toast } from '../../src/components/ui/Toast';
import type { SavedRecipe } from '../../src/types/models';

export default function SharedRecipesScreen() {
  const colors = useThemeColors();
  const { sharedRecipes, loading, loadSharedRecipes, toggleLike } = useRecipeStore();
  const { addDish, addItem, linkItemToDish } = useShoppingStore();
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadSharedRecipes();
  }, [loadSharedRecipes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sharedRecipes;
    const q = search.toLowerCase();
    return sharedRecipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.dish_name.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.steps_json.toLowerCase().includes(q),
    );
  }, [sharedRecipes, search]);

  const handleToggleLike = useCallback(async (id: number) => {
    try {
      await toggleLike(id);
    } catch {
      Alert.alert('エラー', 'いいねに失敗しました');
    }
  }, [toggleLike]);

  const handleAddToList = useCallback(async (recipe: SavedRecipe) => {
    try {
      const dish = await addDish(recipe.dish_name);
      const ingredients = JSON.parse(recipe.ingredients_json || '[]');
      for (const ing of ingredients) {
        const item = await addItem(ing.name, ing.category);
        await linkItemToDish(dish.id, item.id);
      }
      setToast(`${recipe.dish_name} をリストに追加しました`);
    } catch {
      Alert.alert('エラー', 'リストへの追加に失敗しました');
    }
  }, [addDish, addItem, linkItemToDish]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TextInput
        style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        placeholder="レシピを検索..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <RecipeListItem recipe={item} onToggleLike={handleToggleLike} onAddToList={handleAddToList} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSharedRecipes} tintColor={colors.primary} />}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {search ? '検索結果なし' : 'まだ共有レシピがありません'}
          </Text>
        }
      />
      <Toast message={toast} onHide={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchInput: {
    margin: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
});
