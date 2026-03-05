import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import { SuggestionsList, type Suggestion } from '../ui/SuggestionsList';
import { useDebounce } from '../../hooks/use-debounce';
import * as shoppingApi from '../../api/shopping';
import * as dishesApi from '../../api/dishes';
import type { Dish } from '../../types/models';

type ModalMode = 'item' | 'dish';

interface AddModalProps {
  visible: boolean;
  mode: ModalMode;
  dishes: Dish[];
  presetDishId?: number | null;
  onClose: () => void;
  onSubmitItem: (name: string, dishId: number | null) => void;
  onSubmitDish: (name: string) => void;
}

export function AddModal({
  visible,
  mode,
  dishes,
  presetDishId,
  onClose,
  onSubmitItem,
  onSubmitDish,
}: AddModalProps) {
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [selectedDishId, setSelectedDishId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<(string | Suggestion)[]>([]);
  const debouncedName = useDebounce(name, 200);

  useEffect(() => {
    if (visible) {
      setName('');
      setSelectedDishId(presetDishId ?? null);
      setSuggestions([]);
    }
  }, [visible, presetDishId]);

  useEffect(() => {
    if (!visible) return;
    const fetchSuggestions = async () => {
      try {
        const results = mode === 'item'
          ? await shoppingApi.getItemSuggestions(debouncedName || undefined)
          : await dishesApi.getDishSuggestions(debouncedName || undefined);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    };
    fetchSuggestions();
  }, [debouncedName, mode, visible]);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === 'item') {
      onSubmitItem(trimmed, selectedDishId);
    } else {
      onSubmitDish(trimmed);
    }
  }, [name, mode, selectedDishId, onSubmitItem, onSubmitDish]);

  const handleSelectSuggestion = useCallback((suggestion: string) => {
    // 候補を選択したら即送信
    setSuggestions([]);
    if (mode === 'item') {
      onSubmitItem(suggestion, selectedDishId);
    } else {
      onSubmitDish(suggestion);
    }
  }, [mode, selectedDishId, onSubmitItem, onSubmitDish]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'item' ? 'アイテム追加' : '料理追加'}
          </Text>

          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            placeholder={mode === 'item' ? 'アイテム名' : '料理名'}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <SuggestionsList suggestions={suggestions} onSelect={handleSelectSuggestion} />

          {mode === 'item' && (
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

          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.textMuted }]}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={!name.trim()}
            >
              <Text style={styles.submitText}>追加</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
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
