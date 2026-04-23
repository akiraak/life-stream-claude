import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useThemeColors } from '../src/theme/theme-provider';
import { useAuthStore } from '../src/stores/auth-store';
import { useShoppingStore } from '../src/stores/shopping-store';
import { useRecipeStore } from '../src/stores/recipe-store';
import { AuthModal } from '../src/components/auth/AuthModal';

function RootNavigator() {
  const { isLoading, isAuthenticated, checkAuth } = useAuthStore();
  const colors = useThemeColors();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 認証状態とストアの mode を同期
  useEffect(() => {
    if (isLoading) return;
    const mode = isAuthenticated ? 'server' : 'local';
    useShoppingStore.getState().setMode(mode);
    useRecipeStore.getState().setMode(mode);
    if (isAuthenticated) {
      useShoppingStore.getState().loadAll();
      useRecipeStore.getState().loadSavedRecipes();
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Slot />
      <AuthModal />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </ThemeProvider>
  );
}
