import { Alert } from 'react-native';
import { useShoppingStore } from '../stores/shopping-store';
import { useRecipeStore } from '../stores/recipe-store';
import {
  migrate,
  type MigrateDishInput,
  type MigrateItemInput,
  type MigrateSavedRecipeInput,
} from '../api/migrate';

export type MigrationResult = 'migrated' | 'discarded' | 'cancelled';

type PromptChoice = 'migrate' | 'discard' | 'cancel' | 'confirm-discard' | 'abort-discard';

function prompt(
  title: string,
  message: string,
  buttons: { text: string; value: PromptChoice; style?: 'default' | 'cancel' | 'destructive' }[],
): Promise<PromptChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((b) => ({
        text: b.text,
        style: b.style,
        onPress: () => resolve(b.value),
      })),
      { cancelable: false, onDismiss: () => resolve('cancel') },
    );
  });
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ログイン直後（verify 完了後）に呼ぶ。local モードのままローカルデータを読み、
// 移す／破棄／キャンセルをユーザーに問う。サーバモードへの切替は呼び出し側
// （AuthModal → finishLogin）に任せる。
// 戻り値:
//   'migrated'   — ローカルデータをサーバに移した（または元々空だった）
//   'discarded'  — ローカルデータの破棄を確定した
//   'cancelled'  — ユーザーがキャンセル。呼び出し側でログインをロールバックする
export async function runLoginMigration(): Promise<MigrationResult> {
  const shopping = useShoppingStore.getState();
  const recipe = useRecipeStore.getState();

  const localItems = shopping.items;
  const localDishes = shopping.dishes;
  const localSavedRecipes = recipe.savedRecipes;
  const totalCount = localItems.length + localDishes.length + localSavedRecipes.length;

  if (totalCount === 0) {
    return 'migrated';
  }

  const choice = await prompt(
    'ローカルデータの移行',
    `ローカルに ${totalCount} 件のデータがあります。アカウントに移しますか？`,
    [
      { text: '移す', value: 'migrate' },
      { text: '破棄', value: 'discard', style: 'destructive' },
      { text: 'キャンセル', value: 'cancel', style: 'cancel' },
    ],
  );

  if (choice === 'cancel') return 'cancelled';

  if (choice === 'discard') {
    const confirm = await prompt(
      '本当に破棄しますか？',
      'ローカルデータは削除されます。この操作は取り消せません。',
      [
        { text: '破棄する', value: 'confirm-discard', style: 'destructive' },
        { text: 'キャンセル', value: 'abort-discard', style: 'cancel' },
      ],
    );
    if (confirm !== 'confirm-discard') return 'cancelled';
    return 'discarded';
  }

  const items: MigrateItemInput[] = localItems.map((i) => ({
    localId: i.id,
    name: i.name,
    category: i.category,
    checked: i.checked,
    dishLocalId: i.dish_id ?? null,
  }));
  const dishes: MigrateDishInput[] = localDishes.map((d, idx) => ({
    localId: d.id,
    name: d.name,
    ingredients: safeJsonParse<unknown[]>(d.ingredients_json, []),
    recipes: safeJsonParse<unknown[]>(d.recipes_json, []),
    position: idx,
  }));
  const savedRecipes: MigrateSavedRecipeInput[] = localSavedRecipes.map((r) => ({
    localId: r.id,
    dishName: r.dish_name,
    title: r.title,
    summary: r.summary,
    steps: safeJsonParse<string[]>(r.steps_json, []),
    ingredients: safeJsonParse<{ name: string; category: string }[]>(r.ingredients_json, []),
    sourceDishLocalId: r.source_dish_id ?? null,
  }));

  try {
    await migrate({ items, dishes, savedRecipes });
    return 'migrated';
  } catch (e) {
    const message = e instanceof Error ? e.message : 'マイグレーションに失敗しました';
    Alert.alert('エラー', message);
    return 'cancelled';
  }
}
