import { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import { ShoppingItemRow } from './ShoppingItemRow';
import { DraggableList } from '../ui/DraggableList';
import { useDragState } from '../ui/drag-context';
import type { Dish, DishItem } from '../../types/models';

interface DishGroupProps {
  dish: Dish;
  onToggleCheck: (id: number, checked: number) => void;
  onDeleteDish: (dish: Dish) => void;
  onAddItem: (dishId: number) => void;
  onPressDishName: (dish: Dish) => void;
  onPressItemName?: (id: number, name: string) => void;
  onReorderItems?: (dishId: number, data: DishItem[]) => void;
  onDragStart?: (dishId: number) => void;
  onDragEnd?: (dishId: number) => void;
  onItemDragMove?: (pageY: number) => void;
  onItemDrop?: (sourceDishId: number, itemId: number, pageY: number) => void;
  dropTarget?: boolean;
  itemDragging?: boolean;
}

export function DishGroup({
  dish,
  onToggleCheck,
  onDeleteDish,
  onAddItem,
  onPressDishName,
  onPressItemName,
  onReorderItems,
  onDragStart,
  onDragEnd,
  onItemDragMove,
  onItemDrop,
  dropTarget,
  itemDragging,
}: DishGroupProps) {
  const colors = useThemeColors();
  const { ref: dragRef } = useDragState();

  const uncheckedItems = dish.items.filter((i) => !i.checked);
  const checkedItems = dish.items.filter((i) => i.checked);

  const renderItem = useCallback((item: DishItem) => (
    <ShoppingItemRow
      id={item.id}
      name={item.name}
      checked={item.checked}
      onToggleCheck={onToggleCheck}
      onPressName={onPressItemName}
    />
  ), [onToggleCheck, onPressItemName]);

  const handleReorder = useCallback((newItems: DishItem[]) => {
    onReorderItems?.(dish.id, [...newItems, ...checkedItems]);
  }, [dish.id, checkedItems, onReorderItems]);

  const handleInnerDragStart = useCallback(() => {
    onDragStart?.(dish.id);
  }, [dish.id, onDragStart]);

  const handleInnerDragEnd = useCallback(() => {
    onDragEnd?.(dish.id);
  }, [dish.id, onDragEnd]);

  const handleDragDrop = useCallback((item: DishItem, pageY: number) => {
    onItemDrop?.(dish.id, item.id, pageY);
  }, [dish.id, onItemDrop]);

  return (
    <View style={[
      styles.container,
      { backgroundColor: colors.surface, borderColor: dropTarget ? colors.primary : colors.border },
      dropTarget && styles.dropTargetContainer,
      itemDragging && styles.itemDraggingContainer,
    ]}>
      <View style={[styles.leftBorder, { backgroundColor: dropTarget ? colors.primary : colors.primary }]} />
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.dishNameArea} onPress={() => { if (!dragRef.current) onPressDishName(dish); }}>
            <Text style={[styles.dishName, { color: colors.primaryLight }]} numberOfLines={1}>
              {dish.name}
            </Text>
          </TouchableOpacity>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={() => { if (!dragRef.current) onAddItem(dish.id); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.headerBtn, { color: colors.primaryLight }]}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { if (!dragRef.current) onDeleteDish(dish); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
            onDragStart={handleInnerDragStart}
            onDragEnd={handleInnerDragEnd}
            onDragMoveY={onItemDragMove}
            onDragDrop={handleDragDrop}
          />
        )}

        {checkedItems.map((item) => (
          <ShoppingItemRow
            key={item.id}
            id={item.id}
            name={item.name}
            checked={item.checked}
            onToggleCheck={onToggleCheck}
            onPressName={onPressItemName}
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
  dropTargetContainer: {
    borderWidth: 2,
  },
  itemDraggingContainer: {
    overflow: 'visible',
    zIndex: 1000,
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
