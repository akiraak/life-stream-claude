import { Tabs } from 'expo-router';
import { useThemeColors } from '../../src/theme/theme-provider';

export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textMuted,
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
  );
}

// Unicode文字でシンプルなタブアイコン（後で expo/vector-icons に置換可能）
function TabIcon({ name, color, size }: { name: string; color: string; size: number }) {
  const icons: Record<string, string> = {
    cart: '🛒',
    book: '📖',
    people: '👥',
  };
  const { Text } = require('react-native');
  return <Text style={{ fontSize: size * 0.8, color }}>{icons[name] ?? '?'}</Text>;
}
