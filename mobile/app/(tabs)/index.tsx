import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '../../src/theme/theme-provider';
import { useShoppingStore } from '../../src/stores/shopping-store';
import { DishGroup } from '../../src/components/shopping/DishGroup';
import { ShoppingItemRow } from '../../src/components/shopping/ShoppingItemRow';
import { AddModal } from '../../src/components/shopping/AddModal';
import { DraggableList } from '../../src/components/ui/DraggableList';
import { ConfirmDialog } from '../../src/components/ui/ConfirmDialog';
import { Toast } from '../../src/components/ui/Toast';
import { IngredientsScreen } from '../../src/components/dishes/IngredientsScreen';
import type { Dish, DishItem } from '../../src/types/models';

type ModalMode = 'item' | 'dish';

export default function ShoppingListScreen() {
  const colors = useThemeColors();
  const { items, dishes, loading, loadAll, addItem, toggleCheck, deleteItem, addDish, deleteDish, linkItemToDish, deleteCheckedItems, reorderDishes, reorderDishItems } = useShoppingStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('item');
  const [presetDishId, setPresetDishId] = useState<number | null>(null);
  const [confirmDish, setConfirmDish] = useState<Dish | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeDish, setActiveDish] = useState<Dish | null>(null);
  const [checkedExpanded, setCheckedExpanded] = useState(false);
  const [checkedLimit, setCheckedLimit] = useState(10);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const CHECKED_PAGE_SIZE = 10;

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const itemDishMap = new Map<number, number>();
  for (const dish of dishes) {
    for (const di of dish.items) {
      itemDishMap.set(di.id, dish.id);
    }
  }
  const ungroupedItems = items.filter((i) => !itemDishMap.has(i.id) && !i.checked);
  const checkedItems = items.filter((i) => i.checked);

  const handleToggleCheck = useCallback(async (id: number, checked: number) => {
    try {
      await toggleCheck(id, checked);
    } catch {
      Alert.alert('エラー', '更新に失敗しました');
    }
  }, [toggleCheck]);

  const handleDeleteItem = useCallback(async (id: number) => {
    try {
      await deleteItem(id);
    } catch {
      Alert.alert('エラー', '削除に失敗しました');
    }
  }, [deleteItem]);

  const handleDeleteDish = useCallback(async () => {
    if (!confirmDish) return;
    try {
      await deleteDish(confirmDish.id);
      setToast(`${confirmDish.name} を削除しました`);
    } catch {
      Alert.alert('エラー', '削除に失敗しました');
    }
    setConfirmDish(null);
  }, [confirmDish, deleteDish]);

  const openAddItem = useCallback((dishId?: number) => {
    setModalMode('item');
    setPresetDishId(dishId ?? null);
    setModalVisible(true);
  }, []);

  const openAddDish = useCallback(() => {
    setModalMode('dish');
    setPresetDishId(null);
    setModalVisible(true);
  }, []);

  const handleSubmitItem = useCallback(async (name: string, dishId: number | null) => {
    setModalVisible(false);
    try {
      const item = await addItem(name);
      if (dishId) {
        await linkItemToDish(dishId, item.id);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast(`${name} を追加しました`);
    } catch {
      Alert.alert('エラー', '追加に失敗しました');
    }
  }, [addItem, linkItemToDish]);

  const handleSubmitDish = useCallback(async (name: string) => {
    setModalVisible(false);
    try {
      await addDish(name);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast(`${name} を追加しました`);
    } catch {
      Alert.alert('エラー', '追加に失敗しました');
    }
  }, [addDish]);

  const handleDeleteChecked = useCallback(async () => {
    try {
      const count = await deleteCheckedItems();
      if (count > 0) setToast(`${count}件を削除しました`);
    } catch {
      Alert.alert('エラー', '削除に失敗しました');
    }
  }, [deleteCheckedItems]);

  const handleReorderDishes = useCallback(async (newDishes: Dish[]) => {
    useShoppingStore.setState({ dishes: newDishes });
    try {
      await reorderDishes(newDishes.map((d) => d.id));
    } catch {
      loadAll();
    }
  }, [reorderDishes, loadAll]);

  const handleReorderDishItems = useCallback(async (dishId: number, newItems: DishItem[]) => {
    useShoppingStore.setState((s) => ({
      dishes: s.dishes.map((d) => d.id === dishId ? { ...d, items: newItems } : d),
    }));
    try {
      await reorderDishItems(dishId, newItems.map((i) => i.id));
    } catch {
      loadAll();
    }
  }, [reorderDishItems, loadAll]);

  const handleDragStart = useCallback(() => setScrollEnabled(false), []);
  const handleDragEnd = useCallback(() => setScrollEnabled(true), []);

  const renderDishGroup = useCallback((dish: Dish) => (
    <DishGroup
      dish={dish}
      onToggleCheck={handleToggleCheck}
      onDeleteItem={handleDeleteItem}
      onDeleteDish={setConfirmDish}
      onAddItem={openAddItem}
      onPressDishName={setActiveDish}
      onReorderItems={handleReorderDishItems}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    />
  ), [handleToggleCheck, handleDeleteItem, openAddItem, handleReorderDishItems, handleDragStart, handleDragEnd]);

  const isEmpty = dishes.length === 0 && ungroupedItems.length === 0 && checkedItems.length === 0;
  // scrollEnabled は state で管理

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor={colors.primary} />}
        scrollEnabled={scrollEnabled}
      >
        {isEmpty && !loading && (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            リストは空です。料理やアイテムを追加しましょう
          </Text>
        )}

        {dishes.length > 0 && (
          <DraggableList
            data={dishes}
            keyExtractor={(d) => String(d.id)}
            renderItem={renderDishGroup}
            onReorder={handleReorderDishes}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        )}

        {ungroupedItems.length > 0 && (
          <View style={styles.ungroupedSection}>
            {dishes.length > 0 && (
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>その他</Text>
            )}
            {ungroupedItems.map((item) => (
              <ShoppingItemRow
                key={item.id}
                id={item.id}
                name={item.name}
                checked={item.checked}
                onToggleCheck={handleToggleCheck}
                onDelete={handleDeleteItem}
              />
            ))}
          </View>
        )}

        {checkedItems.length > 0 && (
          <View style={styles.checkedSection}>
            <TouchableOpacity style={styles.checkedHeader} onPress={() => setCheckedExpanded(!checkedExpanded)}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                {checkedExpanded ? '▼' : '▶'} チェック済み ({checkedItems.length})
              </Text>
              <TouchableOpacity onPress={handleDeleteChecked}>
                <Text style={[styles.clearBtn, { color: colors.danger }]}>すべて削除</Text>
              </TouchableOpacity>
            </TouchableOpacity>
            {checkedExpanded && (
              <>
                {checkedItems.slice(0, checkedLimit).map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    checked={item.checked}
                    onToggleCheck={handleToggleCheck}
                    onDelete={handleDeleteItem}
                  />
                ))}
                {checkedItems.length > checkedLimit && (
                  <TouchableOpacity onPress={() => setCheckedLimit((l) => l + CHECKED_PAGE_SIZE)}>
                    <Text style={[styles.showMoreBtn, { color: colors.primaryLight }]}>
                      さらに {checkedItems.length - checkedLimit} 件を表示
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.fabContainer}>
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primaryLight }]} onPress={openAddDish}>
          <Image source={require('../../assets/icon_dish.png')} style={styles.fabDishIcon} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => openAddItem()}>
          <Text style={styles.fabIconWhite}>+</Text>
        </TouchableOpacity>
      </View>

      <AddModal
        visible={modalVisible}
        mode={modalMode}
        dishes={dishes}
        presetDishId={presetDishId}
        onClose={() => setModalVisible(false)}
        onSubmitItem={handleSubmitItem}
        onSubmitDish={handleSubmitDish}
      />

      <ConfirmDialog
        visible={!!confirmDish}
        title="料理を削除"
        message={`「${confirmDish?.name}」を削除しますか？アイテムはリストに残ります。`}
        onConfirm={handleDeleteDish}
        onCancel={() => setConfirmDish(null)}
      />

      <Toast message={toast} onHide={() => setToast(null)} />

      {activeDish && (
        <View style={StyleSheet.absoluteFill}>
          <IngredientsScreen dish={activeDish} onClose={() => setActiveDish(null)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
  ungroupedSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    marginBottom: 4,
    fontWeight: '500',
  },
  checkedSection: {
    marginTop: 16,
    opacity: 0.6,
  },
  checkedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  clearBtn: {
    fontSize: 13,
  },
  showMoreBtn: {
    textAlign: 'center',
    paddingVertical: 8,
    fontSize: 14,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabDishIcon: {
    width: 40,
    height: 40,
  },
  fabIconWhite: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
});
