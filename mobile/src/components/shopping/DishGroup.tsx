import { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import { ShoppingItemRow } from './ShoppingItemRow';
import { DraggableList } from '../ui/DraggableList';
import type { Dish, DishItem } from '../../types/models';

interface DishGroupProps {
  dish: Dish;
  onToggleCheck: (id: number, checked: number) => void;
  onDeleteItem: (id: number) => void;
  onDeleteDish: (dish: Dish) => void;
  onAddItem: (dishId: number) => void;
  onPressDishName: (dish: Dish) => void;
  onReorderItems?: (dishId: number, data: DishItem[]) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function DishGroup({
  dish,
  onToggleCheck,
  onDeleteItem,
  onDeleteDish,
  onAddItem,
  onPressDishName,
  onReorderItems,
  onDragStart,
  onDragEnd,
}: DishGroupProps) {
  const colors = useThemeColors();

  const uncheckedItems = dish.items.filter((i) => !i.checked);
  const checkedItems = dish.items.filter((i) => i.checked);

  const renderItem = useCallback((item: DishItem) => (
    <ShoppingItemRow
      id={item.id}
      name={item.name}
      checked={item.checked}
      onToggleCheck={onToggleCheck}
      onDelete={onDeleteItem}
    />
  ), [onToggleCheck, onDeleteItem]);

  const handleReorder = useCallback((newItems: DishItem[]) => {
    onReorderItems?.(dish.id, [...newItems, ...checkedItems]);
  }, [dish.id, checkedItems, onReorderItems]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.leftBorder, { backgroundColor: colors.primary }]} />
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.dishNameArea} onPress={() => onPressDishName(dish)}>
            <Text style={[styles.dishName, { color: colors.primaryLight }]} numberOfLines={1}>
              {dish.name}
            </Text>
          </TouchableOpacity>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={() => onAddItem(dish.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.headerBtn, { color: colors.primaryLight }]}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDeleteDish(dish)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.headerBtn, { color: colors.textMuted }]}>×</Text>
            </TouchableOpacity>
          </View>
        </View>

        {uncheckedItems.length > 0 && (
          <DraggableList
            data={uncheckedItems}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            onReorder={handleReorder}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        )}

        {checkedItems.map((item) => (
          <ShoppingItemRow
            key={item.id}
            id={item.id}
            name={item.name}
            checked={item.checked}
            onToggleCheck={onToggleCheck}
            onDelete={onDeleteItem}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  leftBorder: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dishNameArea: {
    flex: 1,
  },
  dishName: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerBtn: {
    fontSize: 22,
    fontWeight: '500',
  },
});
