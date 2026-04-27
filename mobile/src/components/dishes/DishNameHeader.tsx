import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import { useShoppingStore } from '../../stores/shopping-store';
import type { Dish } from '../../types/models';

interface DishNameHeaderProps {
  dish: Dish;
}

export function DishNameHeader({ dish }: DishNameHeaderProps) {
  const colors = useThemeColors();
  const updateDish = useShoppingStore((s) => s.updateDish);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dish.name);

  const handleStartEdit = useCallback(() => {
    setDraft(dish.name);
    setEditing(true);
  }, [dish.name]);

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === dish.name) {
      setDraft(dish.name);
      setEditing(false);
      return;
    }
    try {
      await updateDish(dish.id, trimmed);
    } catch {
      setDraft(dish.name);
    } finally {
      setEditing(false);
    }
  }, [draft, dish.id, dish.name, updateDish]);

  if (editing) {
    return (
      <TextInput
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: colors.primaryLight,
            backgroundColor: colors.background,
          },
        ]}
        value={draft}
        onChangeText={setDraft}
        onBlur={handleSave}
        onSubmitEditing={handleSave}
        autoFocus
        autoComplete="off"
        importantForAutofill="no"
        returnKeyType="done"
      />
    );
  }

  return (
    <TouchableOpacity style={styles.titleBtn} onPress={handleStartEdit}>
      <View style={[styles.titleUnderline, { borderBottomColor: 'rgba(251,146,60,0.5)' }]}>
        <Text style={[styles.title, { color: colors.primaryLight }]}>{dish.name}</Text>
        <Text style={[styles.editIcon, { color: colors.textMuted }]}> ✎</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  titleBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleUnderline: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  editIcon: {
    fontSize: 13,
  },
  input: {
    fontSize: 18,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flex: 1,
    textAlign: 'center',
  },
});
