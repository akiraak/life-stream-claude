import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import type { Dish } from '../../types/models';
import type { ModalMode } from '../../types/ui';

interface AddModalProps {
  visible: boolean;
  mode: ModalMode;
  dishes: Dish[];
  presetDishId?: number | null;
  editItemName?: string;
  onClose: () => void;
  onSubmitItem: (name: string, dishId: number | null) => void;
  onSubmitDish: (name: string) => void;
  onUpdateItem?: (name: string, dishId: number | null) => void;
  onDeleteItem?: () => void;
}

export function AddModal({
  visible,
  mode,
  dishes,
  presetDishId,
  editItemName,
  onClose,
  onSubmitItem,
  onSubmitDish,
  onUpdateItem,
  onDeleteItem,
}: AddModalProps) {
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [selectedDishId, setSelectedDishId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setName(mode === 'edit' ? (editItemName ?? '') : '');
      setSelectedDishId(presetDishId ?? null);
      setMounted(true);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
        inputRef.current?.focus();
      });
    } else if (mounted) {
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setMounted(false);
      });
    }
  }, [visible]);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === 'edit') {
      onUpdateItem?.(trimmed, selectedDishId);
    } else if (mode === 'item') {
      onSubmitItem(trimmed, selectedDishId);
    } else {
      onSubmitDish(trimmed);
    }
  }, [name, mode, selectedDishId, onSubmitItem, onSubmitDish, onUpdateItem]);

  // 編集モードではボタン廃止。外タップ／キーボード確定で保存（空欄なら削除）。
  const handleEditDismiss = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      onDeleteItem?.();
    } else {
      onUpdateItem?.(trimmed, selectedDishId);
    }
  }, [name, selectedDishId, onUpdateItem, onDeleteItem]);

  const handleOverlayPress = mode === 'edit' ? handleEditDismiss : onClose;
  const handleEditingSubmit = mode === 'edit' ? handleEditDismiss : handleSubmit;

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <TouchableWithoutFeedback onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.modal,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: fadeAnim },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'edit' ? '食材編集' : mode === 'item' ? '食材追加' : '料理追加'}
          </Text>

          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            placeholder={mode === 'dish' ? '料理名' : '食材名'}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            onSubmitEditing={handleEditingSubmit}
            autoComplete="off"
            importantForAutofill="no"
            returnKeyType="done"
          />

          {(mode === 'item' || mode === 'edit') && (
            <View style={styles.dishPicker}>
              <Text style={[styles.label, { color: colors.textMuted }]}>料理:</Text>
              <View style={styles.dishOptions}>
                <TouchableOpacity
                  style={[
                    styles.dishOption,
                    { borderColor: colors.border },
                    selectedDishId === null && { borderColor: colors.primary, backgroundColor: colors.surfaceHover },
                  ]}
                  onPress={() => setSelectedDishId(null)}
                >
                  <Text style={[styles.dishOptionText, { color: selectedDishId === null ? colors.primary : colors.textMuted }]}>
                    なし
                  </Text>
                </TouchableOpacity>
                {dishes.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.dishOption,
                      { borderColor: colors.border },
                      selectedDishId === d.id && { borderColor: colors.primary, backgroundColor: colors.surfaceHover },
                    ]}
                    onPress={() => setSelectedDishId(d.id)}
                  >
                    <Text
                      style={[styles.dishOptionText, { color: selectedDishId === d.id ? colors.primary : colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {mode !== 'edit' && (
            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={[styles.cancelText, { color: colors.textMuted }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: !name.trim() ? 0.5 : 1 }]}
                onPress={handleSubmit}
                disabled={!name.trim()}
              >
                <Text style={styles.submitText}>追加</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modal: {
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  dishPicker: {
    gap: 6,
  },
  label: {
    fontSize: 13,
  },
  dishOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dishOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  dishOptionText: {
    fontSize: 13,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 15,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
