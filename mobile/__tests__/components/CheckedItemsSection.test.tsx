// CheckedItemsSection のロジックテスト。
// expanded / limit の state 遷移は React state に閉じているので、
// pure function には切り出せない。RN render + fireEvent ライブラリは未導入なので
// react-test-renderer (jest-expo に同梱) で render し、props を直接叩いて検証する。

import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CheckedItemsSection } from '../../src/components/shopping/CheckedItemsSection';
import { ShoppingItemRow } from '../../src/components/shopping/ShoppingItemRow';
import type { ShoppingItem } from '../../src/types/models';

function makeItem(id: number, name: string): ShoppingItem {
  return {
    id,
    name,
    category: '',
    checked: 1,
    dish_id: null,
    position: id,
    created_at: '',
    updated_at: '',
  };
}

function renderSection(items: ShoppingItem[]) {
  let root!: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(
      <CheckedItemsSection items={items} onToggleCheck={() => {}} />,
    );
  });
  return root;
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  const texts = node.findAllByType(Text);
  return texts.map((t) => {
    const c = t.props.children;
    return Array.isArray(c) ? c.join('') : String(c ?? '');
  }).join(' ');
}

function findHeaderToggle(root: TestRenderer.ReactTestRenderer) {
  return root.root.findAll(
    (n) => n.type === TouchableOpacity && /チェック済み/.test(textOf(n)),
  )[0];
}

function findShowMoreToggle(root: TestRenderer.ReactTestRenderer) {
  return root.root.findAll(
    (n) => n.type === TouchableOpacity && /さらに .* 件を表示/.test(textOf(n)),
  )[0];
}

describe('CheckedItemsSection', () => {
  it('does not render any item rows when collapsed', () => {
    const items = [makeItem(1, 'a'), makeItem(2, 'b'), makeItem(3, 'c')];
    const root = renderSection(items);

    // 折りたたみ時は ShoppingItemRow を 1 つも描画しない
    expect(root.root.findAllByType(ShoppingItemRow)).toHaveLength(0);

    // ヘッダは ▶ で始まる
    const headerLabel = root.root.findAllByType(Text)[0];
    expect(String(headerLabel.props.children)).toMatch(/^▶/);
  });

  it('shows "さらに N 件を表示" when expanded and items exceed the page size', () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem(i + 1, `item-${i + 1}`));
    const root = renderSection(items);

    act(() => {
      findHeaderToggle(root).props.onPress();
    });

    // ページサイズ 10 → 10 件描画、残り 2 件は「さらに 2 件を表示」リンク
    expect(root.root.findAllByType(ShoppingItemRow)).toHaveLength(10);
    const showMore = findShowMoreToggle(root);
    expect(showMore).toBeTruthy();
    expect(textOf(showMore)).toContain('さらに 2 件を表示');
  });

  it('grows the visible window by the page size when "さらに N 件" is tapped', () => {
    const items = Array.from({ length: 25 }, (_, i) => makeItem(i + 1, `item-${i + 1}`));
    const root = renderSection(items);

    act(() => {
      findHeaderToggle(root).props.onPress();
    });
    expect(root.root.findAllByType(ShoppingItemRow)).toHaveLength(10);

    act(() => {
      findShowMoreToggle(root).props.onPress();
    });
    // 10 → 20 に伸びる
    expect(root.root.findAllByType(ShoppingItemRow)).toHaveLength(20);

    act(() => {
      findShowMoreToggle(root).props.onPress();
    });
    // 20 → 30 だが items は 25 件しかないので全件表示・「さらに」は消える
    expect(root.root.findAllByType(ShoppingItemRow)).toHaveLength(25);
    expect(findShowMoreToggle(root)).toBeUndefined();
  });
});
