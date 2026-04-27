import { useEffect, useState, useCallback, useRef } from 'react';
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
import * as dishesApi from '../../src/api/dishes';
import { DishGroup } from '../../src/components/shopping/DishGroup';
import { ShoppingItemRow } from '../../src/components/shopping/ShoppingItemRow';
import { AddModal } from '../../src/components/shopping/AddModal';
import { DraggableList } from '../../src/components/ui/DraggableList';
import { DragProvider } from '../../src/components/ui/drag-context';
import { ConfirmDialog } from '../../src/components/ui/ConfirmDialog';
import { Toast } from '../../src/components/ui/Toast';
import { IngredientsScreen } from '../../src/components/dishes/IngredientsScreen';
import type { Dish, DishItem, ShoppingItem } from '../../src/types/models';
import type { ModalMode } from '../../src/types/ui';

export default function ShoppingListScreen() {
  const colors = useThemeColors();
  const { items, dishes, loading, loadAll, addItem, updateItemName, toggleCheck, deleteItem, addDish, deleteDish, linkItemToDish, reorderItems, reorderDishes, reorderDishItems } = useShoppingStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('item');
  const [presetDishId, setPresetDishId] = useState<number | null>(null);
  const [confirmDish, setConfirmDish] = useState<Dish | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeDish, setActiveDish] = useState<Dish | null>(null);
  const [editItem, setEditItem] = useState<{ id: number; name: string } | null>(null);
  const [checkedExpanded, setCheckedExpanded] = useState(false);
  const [checkedLimit, setCheckedLimit] = useState(10);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [dropTargetDishId, setDropTargetDishId] = useState<number | null>(null); // 0 = ungrouped
  const [draggingFromDishId, setDraggingFromDishId] = useState<number | null>(null); // 0 = ungrouped
  const dishGroupRefs = useRef<Map<number, View>>(new Map()); // 0 = ungrouped
  const dishGroupLayouts = useRef<Map<number, { pageY: number; height: number }>>(new Map());
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
    setEditItem({ id, name });
    setModalMode('edit');
    setPresetDishId(itemDishMap.get(id) ?? null);
    setModalVisible(true);
  }, [itemDishMap]);

  const handleUpdateItem = useCallback(async (name: string, dishId: number | null) => {
    if (!editItem) return;
    setModalVisible(false);
    const currentDishId = itemDishMap.get(editItem.id) ?? null;
    try {
      if (name !== editItem.name) {
        await updateItemName(editItem.id, name);
      }
      if (dishId !== currentDishId) {
        if (currentDishId) await dishesApi.unlinkItemFromDish(currentDishId, editItem.id);
        if (dishId) await dishesApi.linkItemToDish(dishId, editItem.id);
        await loadAll();
      }
      setToast(`${name} を更新しました`);
    } catch {
      Alert.alert('エラー', '更新に失敗しました');
    }
    setEditItem(null);
  }, [editItem, itemDishMap, updateItemName, loadAll]);

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

  const handleReorderUngroupedItems = useCallback(async (newItems: ShoppingItem[]) => {
    useShoppingStore.setState((s) => {
      const ungroupedIds = new Set(newItems.map((i) => i.id));
      const otherItems = s.items.filter((i) => !ungroupedIds.has(i.id));
      return { items: [...otherItems, ...newItems] };
    });
    try {
      await reorderItems(newItems.map((i) => i.id));
    } catch {
      loadAll();
    }
  }, [reorderItems, loadAll]);

  const handleDragStart = useCallback(() => setScrollEnabled(false), []);
  const handleDragEnd = useCallback(() => setScrollEnabled(true), []);

  // 料理間ドラッグ: 全DishGroupの位置を計測
  const measureDishGroups = useCallback(() => {
    dishGroupLayouts.current.clear();
    const promises: Promise<void>[] = [];
    dishGroupRefs.current.forEach((ref, dishId) => {
      promises.push(new Promise((resolve) => {
        ref.measureInWindow((_x, y, _w, height) => {
          dishGroupLayouts.current.set(dishId, { pageY: y, height });
          resolve();
        });
      }));
    });
    return Promise.all(promises);
  }, []);

  // 料理内食材のドラッグ開始時
  const handleItemDragStart = useCallback((dishId: number) => {
    setScrollEnabled(false);
    setDraggingFromDishId(dishId);
    measureDishGroups();
  }, [measureDishGroups]);

  // 料理内食材のドラッグ中: 指位置からドロップ先を判定
  const handleItemDragMove = useCallback((pageY: number) => {
    let targetId: number | null = null;
    dishGroupLayouts.current.forEach((layout, dishId) => {
      if (pageY >= layout.pageY && pageY <= layout.pageY + layout.height) {
        targetId = dishId;
      }
    });
    setDropTargetDishId((prev) => prev !== targetId ? targetId : prev);
  }, []);

  // 料理内食材のドラッグ終了
  const handleItemDragEnd = useCallback(() => {
    setScrollEnabled(true);
    setDraggingFromDishId(null);
  }, []);

  // 食材のドロップ: 別の料理またはその他に移動
  const handleItemDrop = useCallback(async (sourceDishId: number, itemId: number, pageY: number) => {
    setDraggingFromDishId(null);
    const targetDishId = dropTargetDishId;
    setDropTargetDishId(null);

    if (targetDishId !== null && targetDishId !== sourceDishId) {
      try {
        // 元の料理からunlink（その他からの場合は不要）
        if (sourceDishId !== 0) {
          await dishesApi.unlinkItemFromDish(sourceDishId, itemId);
        }
        // 移動先の料理にlink（その他への場合は不要）
        if (targetDishId !== 0) {
          await dishesApi.linkItemToDish(targetDishId, itemId);
        }
        await loadAll();
        const targetName = targetDishId === 0 ? 'その他' : (dishes.find((d) => d.id === targetDishId)?.name ?? '別の料理');
        setToast(`${targetName} に移動しました`);
      } catch {
        Alert.alert('エラー', '移動に失敗しました');
        loadAll();
      }
    }
  }, [dropTargetDishId, dishes, loadAll]);

  // その他食材のドラッグ開始
  const handleUngroupedDragStart = useCallback(() => {
    setScrollEnabled(false);
    setDraggingFromDishId(0);
    measureDishGroups();
  }, [measureDishGroups]);

  // その他食材のドラッグ終了
  const handleUngroupedDragEnd = useCallback(() => {
    setScrollEnabled(true);
    setDraggingFromDishId(null);
  }, []);

  // その他食材のドロップ
  const handleUngroupedDrop = useCallback((item: ShoppingItem, pageY: number) => {
    handleItemDrop(0, item.id, pageY);
  }, [handleItemDrop]);

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
      ref={(ref) => { if (ref) dishGroupRefs.current.set(dish.id, ref); }}
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
        onDragStart={handleItemDragStart}
        onDragEnd={handleItemDragEnd}
        onItemDragMove={handleItemDragMove}
        onItemDrop={handleItemDrop}
        dropTarget={dropTargetDishId === dish.id}
        itemDragging={draggingFromDishId === dish.id}
      />
    </View>
  ), [handleToggleCheck, openAddItem, handlePressItemName, handleReorderDishItems, handleItemDragStart, handleItemDragEnd, handleItemDragMove, handleItemDrop, dropTargetDishId, draggingFromDishId]);

  const isEmpty = dishes.length === 0 && ungroupedItems.length === 0 && checkedItems.length === 0;
  // scrollEnabled は state で管理

  return (
    <DragProvider>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor={colors.primary} />}
        scrollEnabled={scrollEnabled}
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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            elevatedKey={draggingFromDishId ? String(draggingFromDishId) : null}
          />
        )}

        {ungroupedItems.length > 0 && (
          <View
            style={[
              styles.ungroupedSection,
              dropTargetDishId === 0 && { borderColor: colors.primary, borderWidth: 2, borderRadius: 8, padding: 8 },
            ]}
            ref={(ref) => { if (ref) dishGroupRefs.current.set(0, ref); }}
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
              onDragStart={handleUngroupedDragStart}
              onDragEnd={handleUngroupedDragEnd}
              onDragMoveY={handleItemDragMove}
              onDragDrop={handleUngroupedDrop}
            />
          </View>
        )}

        {checkedItems.length > 0 && (
          <View style={styles.checkedSection}>
            <TouchableOpacity style={styles.checkedHeader} onPress={() => setCheckedExpanded(!checkedExpanded)}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                {checkedExpanded ? '▼' : '▶'} チェック済み ({checkedItems.length})
              </Text>
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
                    onPressName={handlePressItemName}
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
          <IngredientsScreen dish={activeDish} onClose={() => setActiveDish(null)} />
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
