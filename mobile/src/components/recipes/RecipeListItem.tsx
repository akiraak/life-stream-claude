import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import type { SavedRecipe, Ingredient } from '../../types/models';

interface RecipeListItemProps {
  recipe: SavedRecipe;
  onToggleLike: (id: number) => void;
  onAddToList?: (recipe: SavedRecipe) => void;
}

export function RecipeListItem({ recipe, onToggleLike, onAddToList }: RecipeListItemProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  let steps: string[] = [];
  let ingredients: Ingredient[] = [];
  try {
    steps = JSON.parse(recipe.steps_json || '[]');
    ingredients = JSON.parse(recipe.ingredients_json || '[]');
  } catch { /* ignore */ }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={[styles.dishName, { color: colors.textMuted }]}>{recipe.dish_name}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{recipe.title}</Text>
        </View>
        <TouchableOpacity onPress={() => onToggleLike(recipe.id)}>
          <Text style={styles.heart}>
            {recipe.liked ? '❤️' : '🤍'} {recipe.like_count > 0 ? recipe.like_count : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {recipe.summary ? (
        <Text style={[styles.summary, { color: colors.text }]}>{recipe.summary}</Text>
      ) : null}

      {onAddToList && (
        <TouchableOpacity
          style={[styles.addBtn, { borderColor: colors.primary }]}
          onPress={() => onAddToList(recipe)}
        >
          <Text style={[styles.addBtnText, { color: colors.primary }]}>＋リストに追加</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <Text style={[styles.toggleText, { color: colors.textMuted }]}>
          {expanded ? '▲ 閉じる' : `▼ ステップ (${steps.length})`}
        </Text>
      </TouchableOpacity>

      {expanded && steps.length > 0 && (
        <View style={styles.steps}>
          {ingredients.length > 0 && (
            <Text style={[styles.ingredientsList, { color: colors.textMuted }]}>
              具材: {ingredients.map((i) => i.name).join('、')}
            </Text>
          )}
          {steps.map((step, i) => (
            <View key={i} style={styles.step}>
              <Text style={[styles.stepNum, { color: colors.primaryLight }]}>{i + 1}.</Text>
              <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  titleArea: {
    flex: 1,
    marginRight: 8,
  },
  dishName: {
    fontSize: 12,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  heart: {
    fontSize: 18,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  addBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  toggleText: {
    fontSize: 13,
    textAlign: 'center',
  },
  steps: {
    marginTop: 10,
    gap: 8,
  },
  ingredientsList: {
    fontSize: 13,
    marginBottom: 4,
  },
  step: {
    flexDirection: 'row',
    gap: 6,
  },
  stepNum: {
    fontWeight: '600',
    fontSize: 14,
    minWidth: 20,
  },
  stepText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
