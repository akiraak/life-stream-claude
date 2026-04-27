import { useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useDragState } from '../ui/drag-context';
import { useThemeColors } from '../../theme/theme-provider';

interface ShoppingItemRowProps {
  id: number;
  name: string;
  checked: number;
  onToggleCheck: (id: number, checked: number) => void;
  onPressName?: (id: number, name: string) => void;
}

export function ShoppingItemRow({ id, name, checked, onToggleCheck, onPressName }: ShoppingItemRowProps) {
  const colors = useThemeColors();
  const { ref: dragRef } = useDragState();
  const opacity = useRef(new Animated.Value(1)).current;

  const handleCheck = () => {
    if (dragRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newChecked = checked ? 0 : 1;
    if (newChecked === 1) {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        onToggleCheck(id, newChecked);
      });
    } else {
      onToggleCheck(id, newChecked);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.checkRow}>
        <TouchableOpacity onPress={handleCheck} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View
            style={[
              styles.checkbox,
              { borderColor: checked ? colors.primaryLight : colors.textMuted },
              !!checked && { backgroundColor: colors.primaryLight },
            ]}
          >
            {checked ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.nameArea}
          onPress={() => { if (!dragRef.current && onPressName) onPressName(id, name); }}
          activeOpacity={0.6}
        >
          <Text
            style={[
              styles.name,
              { color: checked ? colors.checked : colors.text },
              !!checked && styles.nameChecked,
            ]}
          >
            {name}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  checkRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: -1,
  },
  nameArea: {
    flex: 1,
  },
  name: {
    fontSize: 15,
  },
  nameChecked: {
    textDecorationLine: 'line-through',
  },
});
