import { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, FlatList, RefreshControl, StyleSheet, Alert } from 'react-native';
import { useThemeColors } from '../../src/theme/theme-provider';
import { useRecipeStore } from '../../src/stores/recipe-store';
import { useShoppingStore } from '../../src/stores/shopping-store';
import { useAuthStore } from '../../src/stores/auth-store';
import { RecipeListItem } from '../../src/components/recipes/RecipeListItem';
import { Toast } from '../../src/components/ui/Toast';
import type { SavedRecipe } from '../../src/types/models';

export default function RecipesScreen() {
  const colors = useThemeColors();
  const { mode, savedRecipes, loading, loadSavedRecipes, toggleLike } = useRecipeStore();
  const { addDish, addItem, linkItemToDish } = useShoppingStore();
  const { isAuthenticated, requestLogin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadSavedRecipes();
  }, [loadSavedRecipes]);

  // サーバモードはいいね済みのみ表示、local モードは全保存レシピを表示
  const filtered = useMemo(() => {
    const base = mode === 'server' ? savedRecipes.filter((r) => r.liked) : savedRecipes;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.dish_name.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.steps_json.toLowerCase().includes(q),
    );
  }, [mode, savedRecipes, search]);

  const handleToggleLike = useCallback(async (id: number) => {
    if (!isAuthenticated) {
      requestLogin({ reason: 'レシピにいいねするにはログインしてください' });
      return;
    }
    try {
      await toggleLike(id);
    } catch {
      Alert.alert('エラー', 'いいねに失敗しました');
    }
  }, [isAuthenticated, requestLogin, toggleLike]);

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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSavedRecipes} tintColor={colors.primary} />}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {search
              ? '検索結果なし'
              : mode === 'server'
              ? 'いいねしたレシピがありません'
              : 'レシピを生成すると自動で保存されます'}
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
