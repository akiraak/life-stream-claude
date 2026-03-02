const API = '/api/shopping';
const DISH_API = '/api/dishes';

const listEl = document.getElementById('shopping-list');
const emptyEl = document.getElementById('empty-message');

// FAB
const fabItem = document.getElementById('fab-item');
const fabDish = document.getElementById('fab-dish');

// モーダル
const modalOverlay = document.getElementById('modal-overlay');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalInput = document.getElementById('modal-input');
const modalDishRow = document.getElementById('modal-dish-row');
const modalDishSelect = document.getElementById('modal-dish-select');
const modalOk = document.getElementById('modal-ok');
const modalCancel = document.getElementById('modal-cancel');

// サジェスト
const suggestionsDropdown = document.getElementById('suggestions-dropdown');
let suggestDebounceTimer = null;
let selectedSuggestionIndex = -1;

// 具材検索中の料理ID
const loadingIngredientsDishes = new Set();
// 具材検索結果キャッシュ { dishId: { dishName, ingredients } }
const ingredientsCache = new Map();

// 具材提案モーダル
const ingredientsOverlay = document.getElementById('ingredients-overlay');
const ingredientsTitle = document.getElementById('ingredients-title');
const ingredientsLoading = document.getElementById('ingredients-loading');
const ingredientsError = document.getElementById('ingredients-error');
const ingredientsList = document.getElementById('ingredients-list');
const ingredientsRecipes = document.getElementById('ingredients-recipes');
const ingredientsActions = document.getElementById('ingredients-actions');
const ingredientsAdd = document.getElementById('ingredients-add');
const ingredientsSkip = document.getElementById('ingredients-skip');

// 確認ダイアログ
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');

let items = [];
let dishes = [];
let modalMode = null; // 'item' | 'dish' | 'edit'
let editingItem = null; // 編集中のアイテム
let confirmResolve = null;

// API 通信
async function api(method, path = '', body = null, base = API) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(base + path, opts);
  return res.json();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// アイテムがどの料理に紐づくか逆引きマップを作成
function buildItemDishMap() {
  const map = {};
  dishes.forEach(dish => {
    (dish.items || []).forEach(item => {
      if (!map[item.id]) map[item.id] = [];
      map[item.id].push(dish.id);
    });
  });
  return map;
}

// 描画
function render() {
  listEl.innerHTML = '';
  const unchecked = items.filter(i => !i.checked);
  const itemDishMap = buildItemDishMap();

  // 料理ごとにグループ化
  const grouped = {};
  const ungrouped = [];

  unchecked.forEach(item => {
    const dishIds = itemDishMap[item.id];
    if (dishIds && dishIds.length > 0) {
      dishIds.forEach(dishId => {
        if (!grouped[dishId]) grouped[dishId] = [];
        grouped[dishId].push(item);
      });
    } else {
      ungrouped.push(item);
    }
  });

  // 料理グループを表示
  dishes.forEach(dish => {
    const dishItems = grouped[dish.id] || [];

    const group = document.createElement('div');
    group.className = 'dish-group';

    const header = document.createElement('div');
    header.className = dishItems.length > 0 ? 'dish-header' : 'dish-header dish-header-empty';
    let dishStatus = '';
    if (loadingIngredientsDishes.has(dish.id)) {
      dishStatus = '<span class="dish-loading-spinner"></span>';
    } else if (ingredientsCache.has(dish.id)) {
      dishStatus = '<span class="dish-ingredients-badge" title="具材リストあり">🧾</span>';
    }
    header.innerHTML = `
      <span class="dish-name">${escapeHtml(dish.name)}${dishStatus}</span>
      <div class="dish-actions">
        <button class="btn-add-to-dish" title="アイテムを追加">+</button>
        <button class="btn-delete-dish" title="料理を削除">&times;</button>
      </div>
    `;
    header.querySelector('.dish-name').addEventListener('click', () => {
      if (loadingIngredientsDishes.has(dish.id)) return;
      const cached = ingredientsCache.get(dish.id);
      if (cached) {
        openIngredientsModalWithResults(dish.id, cached.dishName, cached.ingredients, cached.recipes);
      } else {
        fetchIngredientsInBackground(dish.id, dish.name);
      }
    });
    header.querySelector('.btn-add-to-dish').addEventListener('click', () => openModal('item', dish.id));
    header.querySelector('.btn-delete-dish').addEventListener('click', () => removeDish(dish.id));
    group.appendChild(header);

    if (dishItems.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'dish-items';
      dishItems.forEach(item => {
        ul.appendChild(createItemEl(item));
      });
      group.appendChild(ul);
    }
    listEl.appendChild(group);
  });

  // 料理に紐づかないアイテム
  if (ungrouped.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'ungrouped-items';
    ungrouped.forEach(item => {
      ul.appendChild(createItemEl(item));
    });
    listEl.appendChild(ul);
  }

  emptyEl.style.display = (unchecked.length === 0 && dishes.length === 0) ? '' : 'none';
}

function createItemEl(item) {
  const li = document.createElement('li');
  li.className = 'list-item';
  li.dataset.itemId = item.id;
  li.innerHTML = `
    <input type="checkbox">
    <div class="item-info">
      <div class="item-name">${escapeHtml(item.name)}</div>
    </div>
    <button class="btn-delete">&times;</button>
  `;
  li.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleCheck(item));
  li.querySelector('.btn-delete').addEventListener('click', () => removeItem(item.id));
  li.querySelector('.item-info').addEventListener('click', () => openEditModal(item));
  return li;
}

// 料理ドロップダウンを更新
function updateDishSelect() {
  modalDishSelect.innerHTML = '<option value="">未分類</option>';
  dishes.forEach(dish => {
    const opt = document.createElement('option');
    opt.value = dish.id;
    opt.textContent = dish.name;
    modalDishSelect.appendChild(opt);
  });
}

// データ読み込み
async function loadItems() {
  const res = await api('GET');
  if (res.success) {
    items = res.data;
    render();
  }
}

async function loadDishes() {
  const res = await api('GET', '', null, DISH_API);
  if (res.success) {
    dishes = res.data;
    updateDishSelect();
    render();
  }
}

async function loadAll() {
  await loadDishes();
  await loadItems();
}

// アイテム操作
async function addItem(name, dishId) {
  // 同じ料理に同名アイテムが既にあればスキップ
  if (dishId) {
    const dish = dishes.find(d => d.id === Number(dishId));
    if (dish && (dish.items || []).some(i => i.name === name)) return;
  }
  const res = await api('POST', '', { name });
  if (res.success) {
    items.unshift(res.data);
    if (dishId) {
      await api('POST', `/${dishId}/items`, { itemId: res.data.id }, DISH_API);
      await loadDishes();
    }
    render();
  }
}

async function toggleCheck(item) {
  const el = document.querySelector(`[data-item-id="${item.id}"]`);
  if (el) {
    el.classList.add('checked-out');
    await new Promise(r => setTimeout(r, 300));
  }
  const res = await api('PUT', `/${item.id}`, { checked: 1 });
  if (res.success) {
    items = items.filter(i => i.id !== item.id);
    render();
  }
}

async function removeItem(id) {
  const el = document.querySelector(`[data-item-id="${id}"]`);
  if (el) {
    el.classList.add('deleted');
    await new Promise(r => setTimeout(r, 300));
  }
  const res = await api('DELETE', `/${id}`);
  if (res.success) {
    items = items.filter(i => i.id !== id);
    await loadDishes();
    render();
  }
}

// 料理操作
async function addDish(name) {
  const res = await api('POST', '', { name }, DISH_API);
  if (res.success) {
    dishes.unshift(res.data);
    updateDishSelect();
    render();
    fetchIngredientsInBackground(res.data.id, res.data.name);
  }
}

async function removeDish(id) {
  const dish = dishes.find(d => d.id === id);
  const name = dish ? dish.name : '';
  const ok = await showConfirm('料理を削除', `「${name}」を削除しますか？\nアイテムは未分類に移動します。`);
  if (!ok) return;
  const res = await api('DELETE', `/${id}`, null, DISH_API);
  if (res.success) {
    dishes = dishes.filter(d => d.id !== id);
    updateDishSelect();
    render();
  }
}

// 確認ダイアログ
function showConfirm(title, message) {
  return new Promise(resolve => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOverlay.classList.add('active');
    confirmResolve = resolve;
  });
}

function closeConfirm(result) {
  confirmOverlay.classList.remove('active');
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

confirmOk.addEventListener('click', () => closeConfirm(true));
confirmCancel.addEventListener('click', () => closeConfirm(false));
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeConfirm(false);
});

// モーダル
function openModal(mode, presetDishId) {
  modalMode = mode;
  editingItem = null;
  modalInput.value = '';
  if (mode === 'item') {
    modalTitle.textContent = 'アイテムを追加';
    modalInput.placeholder = 'アイテム名';
    modalDishRow.style.display = '';
    modalDishSelect.value = presetDishId || '';
    modalOk.textContent = '追加';
  } else {
    modalTitle.textContent = '料理を追加';
    modalInput.placeholder = '料理名';
    modalDishRow.style.display = 'none';
    modalOk.textContent = '追加';
  }
  modalInput.focus();
  modalOverlay.classList.add('active');
  if (mode === 'item' || mode === 'dish') fetchSuggestions('');
}

// アイテム編集モーダル
function openEditModal(item) {
  modalMode = 'edit';
  editingItem = item;
  modalTitle.textContent = 'アイテムを編集';
  modalInput.placeholder = 'アイテム名';
  modalInput.value = item.name;
  modalDishRow.style.display = '';
  modalOk.textContent = '保存';

  // 現在の料理を選択
  const itemDishMap = buildItemDishMap();
  const dishIds = itemDishMap[item.id] || [];
  modalDishSelect.value = dishIds.length > 0 ? dishIds[0] : '';

  modalInput.focus();
  modalOverlay.classList.add('active');
}

function closeModal() {
  modalOverlay.classList.remove('active');
  modalMode = null;
  hideSuggestions();
}

function submitModal() {
  const name = modalInput.value.trim();
  if (!name) return;
  if (modalMode === 'edit') {
    const dishId = modalDishSelect.value || null;
    updateItemEdit(editingItem, name, dishId);
  } else if (modalMode === 'item') {
    const dishId = modalDishSelect.value || null;
    addItem(name, dishId);
  } else {
    addDish(name);
  }
  closeModal();
}

// アイテム編集
async function updateItemEdit(item, newName, newDishId) {
  // 名前を更新
  const res = await api('PUT', `/${item.id}`, { name: newName });
  if (res.success) {
    item.name = newName;
  }

  // 現在の料理を取得
  const itemDishMap = buildItemDishMap();
  const currentDishIds = itemDishMap[item.id] || [];
  const currentDishId = currentDishIds.length > 0 ? String(currentDishIds[0]) : null;

  // 料理の紐付けを更新
  if (currentDishId !== newDishId) {
    // 旧料理から解除
    if (currentDishId) {
      await api('DELETE', `/${currentDishId}/items/${item.id}`, null, DISH_API);
    }
    // 新料理に紐付け
    if (newDishId) {
      await api('POST', `/${newDishId}/items`, { itemId: item.id }, DISH_API);
    }
    await loadDishes();
  }

  render();
}

// イベント
fabItem.addEventListener('click', () => openModal('item'));
fabDish.addEventListener('click', () => openModal('dish'));
modalCancel.addEventListener('click', closeModal);
modalOk.addEventListener('click', submitModal);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// サジェスト機能
async function fetchSuggestions(query) {
  const base = modalMode === 'dish' ? DISH_API : API;
  try {
    const res = await api('GET', `/suggestions?q=${encodeURIComponent(query || '')}`, null, base);
    if (res.success && res.data.length > 0) {
      showSuggestions(res.data);
    } else {
      hideSuggestions();
    }
  } catch { hideSuggestions(); }
}

function showSuggestions(suggestions) {
  suggestionsDropdown.innerHTML = '';
  selectedSuggestionIndex = -1;
  suggestions.forEach(s => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `
      <span class="suggestion-name">${escapeHtml(s.name)}</span>
      <span class="suggestion-count">${s.count}回</span>
    `;
    div.addEventListener('click', () => selectSuggestion(s.name));
    suggestionsDropdown.appendChild(div);
  });
  suggestionsDropdown.classList.add('active');
}

function hideSuggestions() {
  suggestionsDropdown.classList.remove('active');
  suggestionsDropdown.innerHTML = '';
  selectedSuggestionIndex = -1;
}

function selectSuggestion(name) {
  modalInput.value = name;
  hideSuggestions();
  modalInput.focus();
}

function updateSuggestionSelection() {
  const items = suggestionsDropdown.querySelectorAll('.suggestion-item');
  items.forEach((el, i) => el.classList.toggle('selected', i === selectedSuggestionIndex));
  if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
    items[selectedSuggestionIndex].scrollIntoView({ block: 'nearest' });
  }
}

modalInput.addEventListener('input', () => {
  if (modalMode !== 'item' && modalMode !== 'dish') { hideSuggestions(); return; }
  clearTimeout(suggestDebounceTimer);
  const query = modalInput.value.trim();
  suggestDebounceTimer = setTimeout(() => fetchSuggestions(query), 200);
});

modalInput.addEventListener('keydown', (e) => {
  const isDropdownVisible = suggestionsDropdown.classList.contains('active');
  const items = suggestionsDropdown.querySelectorAll('.suggestion-item');

  if (isDropdownVisible && items.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
      updateSuggestionSelection();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
      updateSuggestionSelection();
      return;
    }
    if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      selectSuggestion(items[selectedSuggestionIndex].querySelector('.suggestion-name').textContent);
      return;
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    submitModal();
  }
  if (e.key === 'Escape' && isDropdownVisible) {
    hideSuggestions();
  }
});

modal.addEventListener('click', (e) => {
  if (e.target !== modalInput && !suggestionsDropdown.contains(e.target)) {
    hideSuggestions();
  }
});

// モーダルが開いているか判定
function isAnyModalOpen() {
  return modalOverlay.classList.contains('active')
    || ingredientsOverlay.classList.contains('active')
    || confirmOverlay.classList.contains('active');
}

// バックグラウンド具材検索
async function fetchIngredientsInBackground(dishId, dishName) {
  loadingIngredientsDishes.add(dishId);
  render();
  try {
    const res = await api('POST', `/${dishId}/suggest-ingredients`, {}, DISH_API);
    loadingIngredientsDishes.delete(dishId);
    if (res.success && res.data.ingredients.length > 0) {
      const recipes = res.data.recipes || [];
      ingredientsCache.set(dishId, { dishName, ingredients: res.data.ingredients, recipes });
      render();
      if (!isAnyModalOpen()) {
        openIngredientsModalWithResults(dishId, dishName, res.data.ingredients, recipes);
      }
    } else {
      render();
    }
  } catch {
    loadingIngredientsDishes.delete(dishId);
    render();
  }
}

function openIngredientsModalWithResults(dishId, dishName, ingredients, recipes) {
  ingredientsDishId = dishId;
  ingredientsTitle.textContent = `「${dishName}」`;
  ingredientsLoading.style.display = 'none';
  ingredientsError.style.display = 'none';
  // 料理に既に追加されているアイテム名を取得して除外
  const dish = dishes.find(d => d.id === dishId);
  const existingNames = new Set((dish && dish.items || []).map(i => i.name));
  const filtered = ingredients.filter(ing => !existingNames.has(ing.name));
  renderIngredients(filtered);
  renderRecipes(recipes || []);
  ingredientsOverlay.classList.add('active');
}

// 具材提案モーダル
let ingredientsDishId = null;

function openIngredientsModal(dishId, dishName) {
  ingredientsDishId = dishId;
  ingredientsTitle.textContent = `「${dishName}」の具材を検索中...`;
  ingredientsLoading.style.display = '';
  ingredientsError.style.display = 'none';
  ingredientsList.style.display = 'none';
  ingredientsActions.style.display = 'none';
  ingredientsOverlay.classList.add('active');
  fetchIngredients(dishId, dishName);
}

function closeIngredientsModal() {
  ingredientsOverlay.classList.remove('active');
  ingredientsDishId = null;
  if (ingredientsRecipes) ingredientsRecipes.style.display = 'none';
}

async function fetchIngredients(dishId, dishName) {
  try {
    const res = await api('POST', `/${dishId}/suggest-ingredients`, {}, DISH_API);
    if (res.success && res.data.ingredients.length > 0) {
      ingredientsTitle.textContent = `「${dishName}」の具材`;
      ingredientsLoading.style.display = 'none';
      renderIngredients(res.data.ingredients);
    } else {
      ingredientsTitle.textContent = `「${dishName}」の具材`;
      ingredientsLoading.style.display = 'none';
      ingredientsError.textContent = '具材が見つかりませんでした';
      ingredientsError.style.display = '';
      ingredientsActions.style.display = '';
      ingredientsAdd.style.display = 'none';
    }
  } catch (err) {
    ingredientsTitle.textContent = `「${dishName}」の具材`;
    ingredientsLoading.style.display = 'none';
    ingredientsError.textContent = `エラー: ${err.message || 'AI接続に失敗しました'}`;
    ingredientsError.style.display = '';
    ingredientsActions.style.display = '';
    ingredientsAdd.style.display = 'none';
  }
}

function renderIngredients(ingredients) {
  let html = '';
  ingredients.forEach(ing => {
    html += `<span class="ingredient-chip" data-name="${escapeHtml(ing.name)}">${escapeHtml(ing.name)}</span>`;
  });
  ingredientsList.innerHTML = html;
  ingredientsList.style.display = '';
  ingredientsActions.style.display = '';
  ingredientsAdd.style.display = '';

  ingredientsList.querySelectorAll('.ingredient-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });
}

function renderRecipes(recipes) {
  if (!ingredientsRecipes) return;
  if (!recipes || recipes.length === 0) {
    ingredientsRecipes.style.display = 'none';
    return;
  }
  let html = '<div class="recipes-title">レシピ</div>';
  recipes.forEach((r, i) => {
    let stepsHtml = '';
    if (r.steps && r.steps.length > 0) {
      stepsHtml = `<ol class="recipe-steps" id="recipe-steps-${i}">`;
      r.steps.forEach(s => { stepsHtml += `<li>${escapeHtml(s)}</li>`; });
      stepsHtml += '</ol>';
    }
    html += `
      <div class="recipe-card">
        <div class="recipe-card-title">${escapeHtml(r.title)}</div>
        <div class="recipe-card-summary">${escapeHtml(r.summary)}</div>
        ${stepsHtml ? `<div class="recipe-detail-toggle" data-target="recipe-steps-${i}">▶ 詳細を見る</div>${stepsHtml}` : ''}
      </div>
    `;
  });
  ingredientsRecipes.innerHTML = html;
  ingredientsRecipes.style.display = '';

  ingredientsRecipes.querySelectorAll('.recipe-detail-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const steps = document.getElementById(toggle.dataset.target);
      if (steps) {
        const isOpen = steps.classList.toggle('open');
        toggle.textContent = isOpen ? '▼ 閉じる' : '▶ 詳細を見る';
      }
    });
  });
}

async function addSelectedIngredients() {
  const chips = ingredientsList.querySelectorAll('.ingredient-chip.selected');
  if (chips.length === 0) {
    closeIngredientsModal();
    return;
  }

  ingredientsAdd.disabled = true;
  ingredientsAdd.textContent = '追加中...';

  // 同じ料理に既にある名前を取得
  const dish = dishes.find(d => d.id === ingredientsDishId);
  const existingNames = new Set((dish && dish.items || []).map(i => i.name));

  for (const chip of chips) {
    const name = chip.dataset.name;
    if (existingNames.has(name)) continue;
    const res = await api('POST', '', { name });
    if (res.success) {
      items.unshift(res.data);
      await api('POST', `/${ingredientsDishId}/items`, { itemId: res.data.id }, DISH_API);
    }
  }

  await loadDishes();
  render();
  ingredientsAdd.disabled = false;
  ingredientsAdd.textContent = '追加';
  closeIngredientsModal();
}

ingredientsAdd.addEventListener('click', addSelectedIngredients);
ingredientsSkip.addEventListener('click', closeIngredientsModal);
ingredientsOverlay.addEventListener('click', (e) => {
  if (e.target === ingredientsOverlay) closeIngredientsModal();
});

// 画面回転ロック（対応ブラウザのみ）
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('portrait').catch(() => {});
}

// 初期読み込み
loadAll();
