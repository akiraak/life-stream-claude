import { useEffect, useLayoutEffect, useMemo, useState, useCallback } from 'react';
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
import { useNavigation } from 'expo-router';
import { useThemeColors } from '../../src/theme/theme-provider';
import { useShoppingStore } from '../../src/stores/shopping-store';
import { useDishDragCoordinator } from '../../src/hooks/use-dish-drag-coordinator';
import { DishGroup } from '../../src/components/shopping/DishGroup';
import { ShoppingItemRow } from '../../src/components/shopping/ShoppingItemRow';
import { CheckedItemsSection } from '../../src/components/shopping/CheckedItemsSection';
import { AddModal } from '../../src/components/shopping/AddModal';
import { DraggableList } from '../../src/components/ui/DraggableList';
import { DragProvider } from '../../src/components/ui/drag-context';
import { ConfirmDialog } from '../../src/components/ui/ConfirmDialog';
import { Toast } from '../../src/components/ui/Toast';
import { IngredientsScreen } from '../../src/components/dishes/IngredientsScreen';
import { DishNameHeader } from '../../src/components/dishes/DishNameHeader';
import type { Dish, DishItem, ShoppingItem } from '../../src/types/models';
import type { ModalMode } from '../../src/types/ui';

export default function ShoppingListScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation();
  const { items, dishes, loading, loadAll, addItem, updateItemName, toggleCheck, deleteItem, addDish, deleteDish, linkItemToDish, moveItemToDish, reorderItems, reorderDishes, reorderDishItems } = useShoppingStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('item');
  const [presetDishId, setPresetDishId] = useState<number | null>(null);
  const [confirmDish, setConfirmDish] = useState<Dish | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeDish, setActiveDish] = useState<Dish | null>(null);
  const [editItem, setEditItem] = useState<{ id: number; name: string; dishId: number | null } | null>(null);

  const drag = useDishDragCoordinator({
    onMoveSuccess: (targetDishId) => {
      const targetName = targetDishId === 0
        ? 'その他'
        : (dishes.find((d) => d.id === targetDishId)?.name ?? '別の料理');
      setToast(`${targetName} に移動しました`);
    },
    onMoveError: () => {
      Alert.alert('エラー', '移動に失敗しました');
    },
  });

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const liveActiveDish = useMemo(
    () => (activeDish ? dishes.find((d) => d.id === activeDish.id) ?? activeDish : null),
    [activeDish, dishes],
  );

  const handleCloseActiveDish = useCallback(() => {
    void loadAll();
    setActiveDish(null);
  }, [loadAll]);

  useLayoutEffect(() => {
    if (liveActiveDish) {
      navigation.setOptions({
        title: liveActiveDish.name,
        headerTitle: () => <DishNameHeader dish={liveActiveDish} />,
        headerLeft: () => (
          <TouchableOpacity
            onPress={handleCloseActiveDish}
            style={styles.headerBackBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="戻る"
            accessibilityRole="button"
          >
            <Text style={[styles.headerBackText, { color: colors.primaryLight }]}>←</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        title: '買い物リスト',
        headerTitle: undefined,
        headerLeft: undefined,
      });
    }
  }, [liveActiveDish, navigation, colors.primaryLight, handleCloseActiveDish]);

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

  const handlePressItemName = useCallback((id: number, name: string) => {
    const dishId = itemDishMap.get(id) ?? null;
    setEditItem({ id, name, dishId });
    setModalMode('edit');
    setPresetDishId(dishId);
    setModalVisible(true);
  }, [itemDishMap]);

  const handleUpdateItem = useCallback(async (name: string, dishId: number | null) => {
    if (!editItem) return;
    setModalVisible(false);
    const nameChanged = name !== editItem.name;
    const dishChanged = dishId !== editItem.dishId;
    if (!nameChanged && !dishChanged) {
      setEditItem(null);
      return;
    }
    try {
      if (nameChanged) {
        await updateItemName(editItem.id, name);
      }
      if (dishChanged) {
        await moveItemToDish(editItem.id, dishId);
      }
      setToast(`${name} を更新しました`);
    } catch {
      Alert.alert('エラー', '更新に失敗しました');
    }
    setEditItem(null);
  }, [editItem, updateItemName, moveItemToDish]);

  const handleDeleteEditItem = useCallback(async () => {
    if (!editItem) return;
    setModalVisible(false);
    try {
      await deleteItem(editItem.id);
      setToast(`${editItem.name} を削除しました`);
    } catch {
      Alert.alert('エラー', '削除に失敗しました');
    }
    setEditItem(null);
  }, [editItem, deleteItem]);

  // 並び替え系は store 側で楽観更新 + 失敗時 snapshot 復元まで担う（refactor-09 Phase 3）。
  // 画面側は store の throw を Alert で受けるだけ。
  const handleReorderDishes = useCallback(async (newDishes: Dish[]) => {
    try {
      await reorderDishes(newDishes.map((d) => d.id));
    } catch {
      Alert.alert('エラー', '並び替えに失敗しました');
    }
  }, [reorderDishes]);

  const handleReorderDishItems = useCallback(async (dishId: number, newItems: DishItem[]) => {
    try {
      await reorderDishItems(dishId, newItems.map((i) => i.id));
    } catch {
      Alert.alert('エラー', '並び替えに失敗しました');
    }
  }, [reorderDishItems]);

  const handleReorderUngroupedItems = useCallback(async (newItems: ShoppingItem[]) => {
    try {
      await reorderItems(newItems.map((i) => i.id));
    } catch {
      Alert.alert('エラー', '並び替えに失敗しました');
    }
  }, [reorderItems]);

  const renderUngroupedItem = useCallback((item: ShoppingItem) => (
    <ShoppingItemRow
      id={item.id}
      name={item.name}
      checked={item.checked}
      onToggleCheck={handleToggleCheck}
      onPressName={handlePressItemName}
    />
  ), [handleToggleCheck, handlePressItemName]);

  const renderDishGroup = useCallback((dish: Dish) => (
    <View
      ref={drag.registerDishGroup(dish.id)}
      collapsable={false}
    >
      <DishGroup
        dish={dish}
        onToggleCheck={handleToggleCheck}
        onDeleteDish={setConfirmDish}
        onAddItem={openAddItem}
        onPressDishName={setActiveDish}
        onPressItemName={handlePressItemName}
        onReorderItems={handleReorderDishItems}
        {...drag.dishGroupHandlers}
        dropTarget={drag.dropTargetDishId === dish.id}
        itemDragging={drag.draggingFromDishId === dish.id}
      />
    </View>
  ), [handleToggleCheck, openAddItem, handlePressItemName, handleReorderDishItems, drag]);

  const isEmpty = dishes.length === 0 && ungroupedItems.length === 0 && checkedItems.length === 0;

  return (
    <DragProvider>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor={colors.primary} />}
        scrollEnabled={drag.scrollEnabled}
      >
        {isEmpty && !loading && (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            リストは空です。料理や食材を追加しましょう
          </Text>
        )}

        {dishes.length > 0 && (
          <DraggableList
            data={dishes}
            keyExtractor={(d) => String(d.id)}
            renderItem={renderDishGroup}
            onReorder={handleReorderDishes}
            {...drag.outerDragHandlers}
            elevatedKey={drag.draggingFromDishId ? String(drag.draggingFromDishId) : null}
          />
        )}

        {ungroupedItems.length > 0 && (
          <View
            style={[
              styles.ungroupedSection,
              drag.dropTargetDishId === 0 && { borderColor: colors.primary, borderWidth: 2, borderRadius: 8, padding: 8 },
            ]}
            ref={drag.registerDishGroup(0)}
            collapsable={false}
          >
            {dishes.length > 0 && (
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>その他</Text>
            )}
            <DraggableList
              data={ungroupedItems}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderUngroupedItem}
              onReorder={handleReorderUngroupedItems}
              {...drag.ungroupedHandlers}
            />
          </View>
        )}

        <CheckedItemsSection
          items={checkedItems}
          onToggleCheck={handleToggleCheck}
          onPressItemName={handlePressItemName}
        />
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
        editItemName={editItem?.name}
        onClose={() => { setModalVisible(false); setEditItem(null); }}
        onSubmitItem={handleSubmitItem}
        onSubmitDish={handleSubmitDish}
        onUpdateItem={handleUpdateItem}
        onDeleteItem={handleDeleteEditItem}
      />

      <ConfirmDialog
        visible={!!confirmDish}
        title="料理を削除"
        message={`「${confirmDish?.name}」を削除しますか？食材はリストに残ります。`}
        onConfirm={handleDeleteDish}
        onCancel={() => setConfirmDish(null)}
      />

      <Toast message={toast} onHide={() => setToast(null)} />

      {activeDish && (
        <View style={StyleSheet.absoluteFill}>
          <IngredientsScreen dish={activeDish} />
        </View>
      )}
    </View>
    </DragProvider>
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
  headerBackBtn: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  headerBackText: {
    fontSize: 22,
    fontWeight: '500',
  },
});
