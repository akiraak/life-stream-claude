import { useState, useRef, useCallback, type ReactNode } from 'react';
import {
  View,
  Animated,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// 親コンポーネントに「ドラッグ中かどうか」を通知するためのコールバック
export interface DragCallbacks {
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

interface DraggableListProps<T> extends DragCallbacks {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (data: T[]) => void;
}

interface ItemLayout {
  pageY: number;
  height: number;
}

export function DraggableList<T>({ data, keyExtractor, renderItem, onReorder, onDragStart, onDragEnd }: DraggableListProps<T>) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [displayOrder, setDisplayOrder] = useState<T[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // ドラッグ終了直後のタップを無視するためのフラグ
  const justFinishedDragRef = useRef(false);

  const itemRefs = useRef<Map<string, View>>(new Map());
  const dragYAnim = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(-1);
  const orderRef = useRef<T[]>([]);
  const dragHeightRef = useRef(0);
  const orderedLayoutsRef = useRef<ItemLayout[]>([]);
  const dragActiveRef = useRef(false);
  const renderItemRef = useRef(renderItem);
  renderItemRef.current = renderItem;

  const measureAllItems = useCallback((): Promise<Map<string, ItemLayout>> => {
    return new Promise((resolve) => {
      const result = new Map<string, ItemLayout>();
      const keys = data.map(keyExtractor);
      let measured = 0;
      const total = keys.length;
      if (total === 0) { resolve(result); return; }

      keys.forEach((key) => {
        const ref = itemRefs.current.get(key);
        if (ref) {
          ref.measureInWindow((_x, y, _w, height) => {
            result.set(key, { pageY: y, height });
            measured++;
            if (measured === total) resolve(result);
          });
        } else {
          measured++;
          if (measured === total) resolve(result);
        }
      });
    });
  }, [data, keyExtractor]);

  const endDrag = useCallback(() => {
    if (!dragActiveRef.current) return;
    dragActiveRef.current = false;
    justFinishedDragRef.current = true;
    const finalOrder = orderRef.current;
    setActiveKey(null);
    setDisplayOrder(null);
    setIsDragging(false);
    onDragEnd?.();
    onReorder(finalOrder);
    // 少し後にフラグをリセット（次のタップイベントが処理された後）
    setTimeout(() => { justFinishedDragRef.current = false; }, 300);
  }, [onReorder, onDragEnd]);

  const moveDrag = useCallback((pageY: number) => {
    if (!dragActiveRef.current) return;

    dragYAnim.setValue(pageY - dragHeightRef.current / 2);

    const fromIdx = currentIndexRef.current;
    const layouts = orderedLayoutsRef.current;

    let targetIdx = fromIdx;
    for (let i = 0; i < layouts.length; i++) {
      const midY = layouts[i].pageY + layouts[i].height / 2;
      if (pageY < midY) {
        targetIdx = i;
        break;
      }
      if (i === layouts.length - 1) {
        targetIdx = layouts.length - 1;
      }
    }

    if (targetIdx !== fromIdx) {
      const newOrder = [...orderRef.current];
      const [moved] = newOrder.splice(fromIdx, 1);
      newOrder.splice(targetIdx, 0, moved);

      const newLayouts = [...layouts];
      const [movedL] = newLayouts.splice(fromIdx, 1);
      newLayouts.splice(targetIdx, 0, movedL);

      let accY = newLayouts[0]?.pageY ?? 0;
      for (let i = 0; i < newLayouts.length; i++) {
        newLayouts[i] = { ...newLayouts[i], pageY: accY };
        accY += newLayouts[i].height;
      }

      orderRef.current = newOrder;
      orderedLayoutsRef.current = newLayouts;
      currentIndexRef.current = targetIdx;
      setActiveKey(keyExtractor(newOrder[targetIdx]));
      setDisplayOrder([...newOrder]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [dragYAnim, keyExtractor]);

  const startDrag = useCallback(async (index: number, pageY: number) => {
    if (dragActiveRef.current) return;

    const layoutMap = await measureAllItems();
    const order = [...data];
    orderRef.current = order;
    currentIndexRef.current = index;

    const key = keyExtractor(order[index]);
    const layout = layoutMap.get(key);
    dragHeightRef.current = layout?.height ?? 50;

    orderedLayoutsRef.current = order.map((item) => {
      const l = layoutMap.get(keyExtractor(item));
      return l ?? { pageY: 0, height: 50 };
    });

    dragYAnim.setValue(pageY - dragHeightRef.current / 2);
    dragActiveRef.current = true;

    setActiveKey(key);
    setDisplayOrder(order);
    setIsDragging(true);
    onDragStart?.();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [data, keyExtractor, measureAllItems, dragYAnim, onDragStart]);

  // コンテナレベルでタッチムーブ・タッチエンドを処理
  const handleContainerTouchMove = useCallback((e: GestureResponderEvent) => {
    if (dragActiveRef.current) {
      moveDrag(e.nativeEvent.pageY);
    }
  }, [moveDrag]);

  const handleContainerTouchEnd = useCallback(() => {
    if (dragActiveRef.current) {
      endDrag();
    }
  }, [endDrag]);

  const items = displayOrder ?? data;
  const activeIdx = currentIndexRef.current;

  return (
    <View
      style={styles.container}
      // ドラッグ中はコンテナレベルでタッチイベントを捕捉
      onTouchMove={handleContainerTouchMove}
      onTouchEnd={handleContainerTouchEnd}
      onTouchCancel={handleContainerTouchEnd}
    >
      {items.map((item, index) => {
        const key = keyExtractor(item);
        const isBeingDragged = isDragging && key === activeKey;
        return (
          <View
            key={key}
            ref={(ref) => { if (ref) itemRefs.current.set(key, ref); }}
            style={isBeingDragged ? styles.placeholder : undefined}
            pointerEvents={isDragging ? 'none' : 'auto'}
            collapsable={false}
          >
            <DraggableItem
              index={index}
              onLongPress={startDrag}
              disabled={dragActiveRef.current}
              justFinishedDragRef={justFinishedDragRef}
            >
              {renderItem(item, index)}
            </DraggableItem>
          </View>
        );
      })}

      {/* フローティングアイテム */}
      {isDragging && activeKey && (
        <Animated.View
          style={[
            styles.floating,
            { transform: [{ translateY: dragYAnim }] },
          ]}
          pointerEvents="none"
        >
          {renderItemRef.current(items[activeIdx], activeIdx)}
        </Animated.View>
      )}
    </View>
  );
}

interface DraggableItemProps {
  index: number;
  children: ReactNode;
  onLongPress: (index: number, pageY: number) => void;
  disabled: boolean;
  justFinishedDragRef: React.MutableRefObject<boolean>;
}

function DraggableItem({ index, children, onLongPress, disabled, justFinishedDragRef }: DraggableItemProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startYRef = useRef(0);

  const handleTouchStart = useCallback((e: GestureResponderEvent) => {
    if (disabled || justFinishedDragRef.current) return;
    startYRef.current = e.nativeEvent.pageY;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onLongPress(index, startYRef.current);
    }, 400);
  }, [index, onLongPress, disabled, justFinishedDragRef]);

  const handleTouchEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback((e: GestureResponderEvent) => {
    if (timerRef.current) {
      const dy = Math.abs(e.nativeEvent.pageY - startYRef.current);
      if (dy > 8) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  return (
    <View
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {children}
    </View>
  );
}

// DragOverlay は不要になったが、互換性のためにエクスポート
export type DragOverlayState = null;
export function DragOverlay(_props: { state: DragOverlayState }) { return null; }

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  placeholder: {
    opacity: 0.3,
  },
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
