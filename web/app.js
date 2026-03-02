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
    header.innerHTML = `
      <span class="dish-name">${escapeHtml(dish.name)}</span>
      <div class="dish-actions">
        <button class="btn-add-to-dish" title="アイテムを追加">+</button>
        <button class="btn-delete-dish" title="料理を削除">&times;</button>
      </div>
    `;
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
  if (mode === 'item') fetchSuggestions('');
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
  try {
    const res = await api('GET', `/suggestions?q=${encodeURIComponent(query || '')}`);
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
  if (modalMode !== 'item') { hideSuggestions(); return; }
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

// 画面回転ロック（対応ブラウザのみ）
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('portrait').catch(() => {});
}

// 初期読み込み
loadAll();
