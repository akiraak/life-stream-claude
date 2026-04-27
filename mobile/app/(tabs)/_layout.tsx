import { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Modal } from 'react-native';
import { Tabs } from 'expo-router';
import { useThemeColors } from '../../src/theme/theme-provider';
import { useAuthStore } from '../../src/stores/auth-store';
import { useAiStore } from '../../src/stores/ai-store';
import { isLocalServer, localServerLabel } from '../../src/config/api-endpoint';

export default function TabsLayout() {
  const colors = useThemeColors();
  const [menuVisible, setMenuVisible] = useState(false);
  const { isAuthenticated, email, logout, requestLogin } = useAuthStore();
  const aiRemaining = useAiStore((s) => s.remaining);

  const handleLogout = () => {
    setMenuVisible(false);
    logout();
  };

  const handleLogin = () => {
    setMenuVisible(false);
    requestLogin();
  };

  const headerRight = () => (
    <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
      <Text style={[styles.menuIcon, { color: colors.text }]}>☰</Text>
      {isLocalServer && (
        <View style={[styles.menuBadge, { backgroundColor: colors.danger, borderColor: colors.surface }]} />
      )}
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
            title: 'レシピノート',
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="book" color={color} size={size} />
            ),
          }}
        />
      </Tabs>

      {/* メニュー */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {isAuthenticated ? (
              <>
                {email && (
                  <Text style={[styles.menuEmail, { color: colors.textMuted, borderBottomColor: colors.border }]}>
                    {email}
                  </Text>
                )}
                {aiRemaining !== null && (
                  <Text style={[styles.menuAiRemaining, { color: colors.textMuted }]}>
                    AI 残り {aiRemaining} 回
                  </Text>
                )}
                <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                  <Text style={[styles.menuItemText, { color: colors.danger }]}>ログアウト</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {aiRemaining !== null && (
                  <Text style={[styles.menuAiRemaining, { color: colors.textMuted, borderBottomColor: colors.border, borderBottomWidth: 1, paddingBottom: 10, marginBottom: 8 }]}>
                    AI 残り {aiRemaining} 回
                  </Text>
                )}
                <TouchableOpacity style={styles.menuItem} onPress={handleLogin}>
                  <Text style={[styles.menuItemText, { color: colors.primaryLight }]}>ログイン</Text>
                </TouchableOpacity>
              </>
            )}
            {isLocalServer && (
              <Text style={[styles.menuLocalServer, { color: colors.danger, borderTopColor: colors.border }]}>
                🔧 ローカル: {localServerLabel}
              </Text>
            )}
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
  };
  return <Text style={{ fontSize: size * 0.8, color }}>{icons[name] ?? '?'}</Text>;
}

const styles = StyleSheet.create({
  menuBtn: {
    paddingHorizontal: 14,
  },
  menuIcon: {
    fontSize: 20,
  },
  menuBadge: {
    position: 'absolute',
    top: 2,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
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
  menuAiRemaining: {
    fontSize: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  menuItem: {
    paddingVertical: 8,
  },
  menuItemText: {
    fontSize: 14,
  },
  menuLocalServer: {
    fontSize: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
});
