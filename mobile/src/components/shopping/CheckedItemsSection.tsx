import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ShoppingItemRow } from './ShoppingItemRow';
import { useThemeColors } from '../../theme/theme-provider';
import type { ShoppingItem } from '../../types/models';

const CHECKED_PAGE_SIZE = 10;

interface CheckedItemsSectionProps {
  items: ShoppingItem[];
  onToggleCheck: (id: number, checked: number) => void;
  onPressItemName?: (id: number, name: string) => void;
}

export function CheckedItemsSection({ items, onToggleCheck, onPressItemName }: CheckedItemsSectionProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(CHECKED_PAGE_SIZE);

  if (items.length === 0) return null;

  const visible = items.slice(0, limit);
  const remaining = items.length - limit;

  return (
    <View style={styles.checkedSection}>
      <TouchableOpacity style={styles.checkedHeader} onPress={() => setExpanded((v) => !v)}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          {expanded ? '▼' : '▶'} チェック済み ({items.length})
        </Text>
      </TouchableOpacity>
      {expanded && (
        <>
          {visible.map((item) => (
            <ShoppingItemRow
              key={item.id}
              id={item.id}
              name={item.name}
              checked={item.checked}
              onToggleCheck={onToggleCheck}
              onPressName={onPressItemName}
            />
          ))}
          {remaining > 0 && (
            <TouchableOpacity onPress={() => setLimit((l) => l + CHECKED_PAGE_SIZE)}>
              <Text style={[styles.showMoreBtn, { color: colors.primaryLight }]}>
                さらに {remaining} 件を表示
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  sectionLabel: {
    fontSize: 13,
    marginBottom: 4,
    fontWeight: '500',
  },
  showMoreBtn: {
    textAlign: 'center',
    paddingVertical: 8,
    fontSize: 14,
  },
});
