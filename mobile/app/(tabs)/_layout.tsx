import { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Modal } from 'react-native';
import { Tabs } from 'expo-router';
import { useThemeColors } from '../../src/theme/theme-provider';
import { useAuthStore } from '../../src/stores/auth-store';

export default function TabsLayout() {
  const colors = useThemeColors();
  const [menuVisible, setMenuVisible] = useState(false);
  const { email, logout } = useAuthStore();

  const handleLogout = () => {
    setMenuVisible(false);
    logout();
  };

  const headerRight = () => (
    <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
      <Text style={[styles.menuIcon, { color: colors.text }]}>☰</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.primaryLight,
          tabBarInactiveTintColor: colors.textMuted,
          headerRight,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '買い物リスト',
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="cart" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="recipes"
          options={{
            title: '自分のレシピ',
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="book" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="shared"
          options={{
            title: 'みんなのレシピ',
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="people" color={color} size={size} />
            ),
          }}
        />
      </Tabs>

      {/* メニュー */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {email && (
              <Text style={[styles.menuEmail, { color: colors.textMuted, borderBottomColor: colors.border }]}>
                {email}
              </Text>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Text style={[styles.menuItemText, { color: colors.danger }]}>ログアウト</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function TabIcon({ name, color, size }: { name: string; color: string; size: number }) {
  const icons: Record<string, string> = {
    cart: '🛒',
    book: '📖',
    people: '👥',
  };
  const { Text } = require('react-native');
  return <Text style={{ fontSize: size * 0.8, color }}>{icons[name] ?? '?'}</Text>;
}

const styles = StyleSheet.create({
  menuBtn: {
    paddingHorizontal: 14,
  },
  menuIcon: {
    fontSize: 20,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menu: {
    marginTop: 56,
    marginRight: 14,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  menuEmail: {
    fontSize: 12,
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  menuItem: {
    paddingVertical: 8,
  },
  menuItemText: {
    fontSize: 14,
  },
});
