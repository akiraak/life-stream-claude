const API = '/api/shopping';
const DISH_API = '/api/dishes';

// 認証状態管理
function getAuthToken() { return localStorage.getItem('auth_token'); }
function getAuthEmail() { return localStorage.getItem('auth_email'); }
function isAuthenticated() { return !!getAuthToken(); }

function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_email');
  showLoginPage();
}

// ページ表示制御
const loginPage = document.getElementById('login-page');
const appContent = document.getElementById('app-content');

function showLoginPage() {
  loginPage.style.display = '';
  appContent.style.display = 'none';
  // メアド入力画面に戻す
  loginForm.style.display = '';
  loginSent.style.display = 'none';
}

function showApp() {
  loginPage.style.display = 'none';
  appContent.style.display = '';
  const menuEmail = document.getElementById('header-menu-email');
  if (menuEmail) menuEmail.textContent = getAuthEmail() || '';
  loadAll();
}

// ログインページ UI
const loginEmailInput = document.getElementById('login-email');
const loginSubmitBtn = document.getElementById('login-submit');
const loginError = document.getElementById('login-error');
const loginForm = document.getElementById('login-form');
const loginSent = document.getElementById('login-sent');
const loginSentMessage = document.getElementById('login-sent-message');
const loginRetryBtn = document.getElementById('login-retry');
const otpInput = document.getElementById('otp-input');
const otpSubmitBtn = document.getElementById('otp-submit');
const otpError = document.getElementById('otp-error');
let loginEmail = ''; // OTPコード送信時に使うメールアドレス

loginSubmitBtn.addEventListener('click', async () => {
  const email = loginEmailInput.value.trim();
  if (!email || !email.includes('@')) {
    loginError.textContent = '有効なメールアドレスを入力してください';
    loginError.style.display = '';
    return;
  }
  loginError.style.display = 'none';
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = '送信中...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.success) {
      loginEmail = email;
      loginForm.style.display = 'none';
      loginSentMessage.textContent = `${email} にログインコードを送信しました。`;
      loginSent.style.display = '';
      otpInput.value = '';
      otpError.style.display = 'none';
      otpInput.focus();
    } else {
      loginError.textContent = data.error || 'エラーが発生しました';
      loginError.style.display = '';
    }
  } catch {
    loginError.textContent = 'サーバーに接続できません';
    loginError.style.display = '';
  } finally {
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.textContent = 'ログインコードを送信';
  }
});

loginEmailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginSubmitBtn.click();
});

loginRetryBtn.addEventListener('click', () => {
  loginSent.style.display = 'none';
  loginForm.style.display = '';
  loginEmailInput.value = '';
  loginEmailInput.focus();
});

// OTPコード送信
otpSubmitBtn.addEventListener('click', async () => {
  const code = otpInput.value.trim();
  if (!code || code.length !== 6) {
    otpError.textContent = '6桁のコードを入力してください';
    otpError.style.display = '';
    return;
  }
  otpError.style.display = 'none';
  otpSubmitBtn.disabled = true;
  otpSubmitBtn.textContent = '確認中...';

  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, code }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('auth_token', data.data.token);
      localStorage.setItem('auth_email', data.data.email);
      showApp();
    } else {
      otpError.textContent = data.error || 'コードが無効です';
      otpError.style.display = '';
    }
  } catch {
    otpError.textContent = 'サーバーに接続できません';
    otpError.style.display = '';
  } finally {
    otpSubmitBtn.disabled = false;
    otpSubmitBtn.textContent = 'ログイン';
  }
});

otpInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') otpSubmitBtn.click();
});

// ハンバーガーメニュー
const headerMenu = document.getElementById('header-menu');
const headerMenuBtn = document.getElementById('header-menu-btn');

headerMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  headerMenu.style.display = headerMenu.style.display === 'none' ? '' : 'none';
});

document.addEventListener('click', (e) => {
  if (headerMenu.style.display !== 'none' && !headerMenu.contains(e.target) && e.target !== headerMenuBtn) {
    headerMenu.style.display = 'none';
  }
});

document.getElementById('header-menu-logout').addEventListener('click', () => {
  headerMenu.style.display = 'none';
  logout();
});

// DOM 要素
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
const ingredientsHeader = document.getElementById('ingredients-header');
const ingredientsTitle = document.getElementById('ingredients-title');
const ingredientsTitleInput = document.getElementById('ingredients-title-input');
const ingredientsTitleLoading = document.getElementById('ingredients-title-loading');
const ingredientsLoading = document.getElementById('ingredients-loading');
const ingredientsError = document.getElementById('ingredients-error');
const ingredientsList = document.getElementById('ingredients-list');
const ingredientsRecipes = document.getElementById('ingredients-recipes');
const ingredientsSkip = document.getElementById('ingredients-skip');
const ingredientsRefresh = document.getElementById('ingredients-refresh');
const ingredientsRefreshRow = document.getElementById('ingredients-refresh-row');

// 追加素材セクション
const extraIngredientsSection = document.getElementById('extra-ingredients-section');
const extraIngredientsChips = document.getElementById('extra-ingredients-chips');
const extraSearchBtn = document.getElementById('extra-search-btn');

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

// モーダル開閉時のスクロール制御
const recipePageOverlay = document.getElementById('recipe-page-overlay');

function updateBodyScroll() {
  const anyOpen = modalOverlay.classList.contains('active')
    || ingredientsOverlay.classList.contains('active')
    || confirmOverlay.classList.contains('active')
    || recipePageOverlay.classList.contains('active');
  document.body.classList.toggle('modal-open', anyOpen);
}

// API 通信（認証ヘッダー付き）
async function api(method, path = '', body = null, base = API) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(base + path, opts);
  // 401 の場合はログインページへ
  if (res.status === 401) {
    logout();
    return { success: false, data: null, error: '認証が必要です' };
  }
  return res.json();
}

function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function highlightIngredients(text, ingredientNames, addedNames) {
  if (!ingredientNames || !ingredientNames.length) return escapeHtml(text);
  const sorted = [...ingredientNames].sort((a, b) => b.length - a.length);
  const escaped = escapeHtml(text);
  const pattern = sorted.map(n => escapeHtml(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${pattern})`, 'g');
  return escaped.replace(regex, (match) => {
    const cls = addedNames && addedNames.has(match) ? 'recipe-ingredient added' : 'recipe-ingredient';
    return `<span class="${cls}" data-name="${match}">${match}</span>`;
  });
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
let isDragging = false;

function render() {
  if (isDragging) return;
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
    // dish.items の順序（position順）に従って並べ替え
    const dishItemOrder = (dish.items || []).map(i => i.id);
    const dishItems = (grouped[dish.id] || []).sort((a, b) =>
      dishItemOrder.indexOf(a.id) - dishItemOrder.indexOf(b.id)
    );

    const group = document.createElement('div');
    group.className = 'dish-group';
    group.dataset.dishId = dish.id;

    const header = document.createElement('div');
    header.className = dishItems.length > 0 ? 'dish-header' : 'dish-header dish-header-empty';
    let dishStatus = '';
    if (loadingIngredientsDishes.has(dish.id)) {
      dishStatus = '<span class="dish-loading-spinner"></span>';
    } else if (ingredientsCache.has(dish.id)) {
      dishStatus = '<span class="dish-ingredients-badge" title="具材リストあり">&#x1F9FE;</span>';
    }
    header.innerHTML = `
      <span class="dish-name">${escapeHtml(dish.name)}${dishStatus}</span>
      <div class="dish-actions">
        <button class="btn-add-to-dish" title="アイテムを追加">+</button>
        <button class="btn-delete-dish" title="料理を削除">&times;</button>
      </div>
    `;
    header.querySelector('.dish-name').addEventListener('click', async () => {
      if (loadingIngredientsDishes.has(dish.id)) return;
      const cached = ingredientsCache.get(dish.id);
      if (cached) {
        openIngredientsModalWithResults(dish.id, cached.dishName, cached.ingredients, cached.recipes);
        // recipeStates がなければ API から取得して更新
        if (!cached.recipeStates || cached.recipeStates.length === 0) {
          const res = await api('POST', `/${dish.id}/suggest-ingredients`, { force: false }, DISH_API);
          if (res.success && res.data.recipeStates) {
            cached.recipeStates = res.data.recipeStates;
            if (ingredientsDishId === dish.id) {
              renderRecipes(cached.recipes, cached.ingredients);
            }
          }
        }
      } else {
        fetchIngredientsInBackground(dish.id, dish.name);
      }
    });
    header.querySelector('.btn-add-to-dish').addEventListener('click', () => openModal('item', dish.id));
    header.querySelector('.btn-delete-dish').addEventListener('click', () => removeDish(dish.id));
    group.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'dish-items';
    dishItems.forEach(item => {
      ul.appendChild(createItemEl(item));
    });
    group.appendChild(ul);
    listEl.appendChild(group);
  });

  // 料理に紐づかないアイテム（移動先として常に表示）
  {
    const ul = document.createElement('ul');
    ul.className = 'ungrouped-items';
    ungrouped.forEach(item => {
      ul.appendChild(createItemEl(item));
    });
    listEl.appendChild(ul);
  }

  emptyEl.style.display = (unchecked.length === 0 && dishes.length === 0) ? '' : 'none';
  initSortable();
}

// ドラッグ並べ替え
let sortableInstances = [];

function destroySortables() {
  sortableInstances.forEach(s => s.destroy());
  sortableInstances = [];
}

function initSortable() {
  destroySortables();

  const sortableOpts = {
    animation: 150,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    delay: 300,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    direction: 'vertical',
    onStart: () => { isDragging = true; },
  };

  // 料理グループの並べ替え
  if (listEl.querySelectorAll('.dish-group').length > 1) {
    sortableInstances.push(new Sortable(listEl, {
      ...sortableOpts,
      handle: '.dish-header',
      draggable: '.dish-group',
      onEnd: async () => {
        isDragging = false;
        const ids = Array.from(listEl.querySelectorAll('.dish-group')).map(g => Number(g.dataset.dishId));
        const dishMap = new Map(dishes.map(d => [d.id, d]));
        dishes = ids.map(id => dishMap.get(id)).filter(Boolean);
        await api('PUT', '/reorder', { orderedIds: ids }, DISH_API);
      }
    }));
  }

  // アイテム移動時の処理（別リストから追加された時）
  async function onItemAdd(evt) {
    isDragging = false;
    const itemId = Number(evt.item.dataset.itemId);
    const fromUl = evt.from;
    const toUl = evt.to;

    // 移動元の料理から unlink
    const fromGroup = fromUl.closest('.dish-group');
    if (fromGroup) {
      const fromDishId = Number(fromGroup.dataset.dishId);
      await api('DELETE', `/${fromDishId}/items/${itemId}`, null, DISH_API);
    }

    // 移動先の料理に link
    const toGroup = toUl.closest('.dish-group');
    if (toGroup) {
      const toDishId = Number(toGroup.dataset.dishId);
      await api('POST', `/${toDishId}/items`, { itemId }, DISH_API);
    }

    // データを再読み込みして整合性を保つ
    await loadDishes();
    await loadItems();
    render();
  }

  // 料理内アイテムの並べ替え（グループ間移動対応）
  listEl.querySelectorAll('.dish-items').forEach(ul => {
    const dishId = Number(ul.closest('.dish-group').dataset.dishId);
    sortableInstances.push(new Sortable(ul, {
      ...sortableOpts,
      group: 'items',
      onEnd: async () => {
        isDragging = false;
        const ids = Array.from(ul.querySelectorAll('.list-item')).map(li => Number(li.dataset.itemId));
        const dish = dishes.find(d => d.id === dishId);
        if (dish && dish.items) {
          const itemMap = new Map(dish.items.map(i => [i.id, i]));
          dish.items = ids.map(id => itemMap.get(id)).filter(Boolean);
        }
        await api('PUT', `/${dishId}/items/reorder`, { orderedItemIds: ids }, DISH_API);
      },
      onAdd: onItemAdd,
    }));
  });

  // 未分類アイテムの並べ替え（グループ間移動対応）
  const ungroupedUl = listEl.querySelector('.ungrouped-items');
  if (ungroupedUl) {
    sortableInstances.push(new Sortable(ungroupedUl, {
      ...sortableOpts,
      group: 'items',
      onEnd: async () => {
        isDragging = false;
        const ids = Array.from(ungroupedUl.querySelectorAll('.list-item')).map(li => Number(li.dataset.itemId));
        await api('PUT', '/reorder', { orderedIds: ids });
      },
      onAdd: onItemAdd,
    }));
  }
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
  `;
  li.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleCheck(item));
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
    // DBに保存済みのAI情報をキャッシュに復元
    dishes.forEach(d => {
      if (d.ingredients_json && !ingredientsCache.has(d.id)) {
        const ingredients = JSON.parse(d.ingredients_json);
        const recipes = d.recipes_json ? JSON.parse(d.recipes_json) : [];
        ingredientsCache.set(d.id, { dishName: d.name, ingredients, recipes, recipeStates: [] });
      }
    });
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
    const dish = res.data;
    dishes.unshift(dish);
    updateDishSelect();
    // 前回の同名料理からAI情報を引き継いでいる場合
    if (dish.ingredients_json) {
      const ingredients = JSON.parse(dish.ingredients_json);
      const recipes = dish.recipes_json ? JSON.parse(dish.recipes_json) : [];
      ingredientsCache.set(dish.id, { dishName: dish.name, ingredients, recipes, recipeStates: [] });
      render();
      if (!isAnyModalOpen()) {
        openIngredientsModalWithResults(dish.id, dish.name, ingredients, recipes);
      }
    } else {
      render();
      fetchIngredientsInBackground(dish.id, dish.name);
    }
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
    updateBodyScroll();
    confirmResolve = resolve;
  });
}

function closeConfirm(result) {
  confirmOverlay.classList.remove('active');
  updateBodyScroll();
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
  updateBodyScroll();
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
  updateBodyScroll();
}

function closeModal() {
  modalOverlay.classList.remove('active');
  updateBodyScroll();
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
    || confirmOverlay.classList.contains('active')
    || recipePageOverlay.classList.contains('active');
}

// バックグラウンド具材検索
async function fetchIngredientsInBackground(dishId, dishName, force = false) {
  showToast(`「${dishName}」のレシピを検索中...`);
  loadingIngredientsDishes.add(dishId);
  render();
  try {
    const res = await api('POST', `/${dishId}/suggest-ingredients`, { force }, DISH_API);
    loadingIngredientsDishes.delete(dishId);
    if (res.success && res.data.ingredients.length > 0) {
      const recipes = res.data.recipes || [];
      const recipeStates = res.data.recipeStates || [];
      ingredientsCache.set(dishId, { dishName, ingredients: res.data.ingredients, recipes, recipeStates });
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

// モーダル内で再検索（force）
async function fetchIngredientsForModal(dishId, dishName) {
  showToast(`「${dishName}」のレシピを再取得中...`);
  loadingIngredientsDishes.add(dishId);
  render();
  try {
    const res = await api('POST', `/${dishId}/suggest-ingredients`, { force: true }, DISH_API);
    loadingIngredientsDishes.delete(dishId);
    if (res.success && res.data.ingredients.length > 0) {
      const recipes = res.data.recipes || [];
      const recipeStates = res.data.recipeStates || [];
      ingredientsCache.set(dishId, { dishName, ingredients: res.data.ingredients, recipes, recipeStates });
      render();
      // モーダルがまだ開いていてこの料理なら結果を表示
      if (ingredientsDishId === dishId) {
        ingredientsLoading.style.display = 'none';
        renderIngredients(res.data.ingredients);
        renderExtraIngredients(dishId);
        renderRecipes(recipes, res.data.ingredients);
      }
    } else {
      render();
      if (ingredientsDishId === dishId) {
        ingredientsLoading.style.display = 'none';
        ingredientsError.textContent = '具材が見つかりませんでした';
        ingredientsError.style.display = '';
      }
    }
  } catch (err) {
    loadingIngredientsDishes.delete(dishId);
    render();
    if (ingredientsDishId === dishId) {
      ingredientsLoading.style.display = 'none';
      ingredientsError.textContent = `エラー: ${err.message || 'AI接続に失敗しました'}`;
      ingredientsError.style.display = '';
    }
  }
}

function openIngredientsModalWithResults(dishId, dishName, ingredients, recipes) {
  ingredientsDishId = dishId;
  ingredientsTitle.textContent = dishName;
  ingredientsTitleLoading.style.display = 'none';
  ingredientsHeader.style.display = '';
  ingredientsLoading.style.display = 'none';
  ingredientsError.style.display = 'none';
  renderIngredients(ingredients);
  renderExtraIngredients(dishId);
  renderRecipes(recipes || [], ingredients);
  ingredientsOverlay.classList.add('active');
  updateBodyScroll();
}

// 具材提案モーダル
let ingredientsDishId = null;

function openIngredientsModal(dishId, dishName) {
  ingredientsDishId = dishId;
  ingredientsHeader.style.display = 'none';
  ingredientsTitleLoading.textContent = '具材を検索中...';
  ingredientsTitleLoading.style.display = '';
  ingredientsLoading.style.display = '';
  ingredientsError.style.display = 'none';
  ingredientsList.style.display = 'none';
  ingredientsOverlay.classList.add('active');
  updateBodyScroll();
  fetchIngredients(dishId, dishName);
}

// 追加素材: 料理グループの食材のうちAI食材リストにないもの
function getExtraIngredients(dishId) {
  const dish = dishes.find(d => d.id === dishId);
  if (!dish || !dish.items || dish.items.length === 0) return [];
  const cached = ingredientsCache.get(dishId);
  if (!cached || !cached.ingredients) return [];
  const aiNames = new Set(cached.ingredients.map(i => i.name));
  return dish.items.filter(item => !item.checked && !aiNames.has(item.name)).map(item => item.name);
}

function renderExtraIngredients(dishId) {
  const extras = getExtraIngredients(dishId);
  if (extras.length === 0) {
    extraIngredientsSection.style.display = 'none';
    return;
  }
  extraIngredientsSection.style.display = '';
  extraIngredientsChips.innerHTML = extras.map(name =>
    `<span class="extra-ingredient-chip">${escapeHtml(name)}</span>`
  ).join('');
  extraSearchBtn.disabled = false;
  extraSearchBtn.textContent = 'この素材でレシピを再検索';
}

async function searchWithExtraIngredients() {
  const dishId = ingredientsDishId;
  const cached = ingredientsCache.get(dishId);
  if (!dishId || !cached) return;
  const extras = getExtraIngredients(dishId);
  if (extras.length === 0) return;

  // 選択済みの全食材（AI食材 + 追加食材）を送る
  const dish = dishes.find(d => d.id === dishId);
  const allSelectedNames = (dish && dish.items || []).map(i => i.name);

  extraSearchBtn.disabled = true;
  extraSearchBtn.textContent = 'レシピを検索中...';
  showToast(`「${cached.dishName}」のレシピを再検索中...`);
  loadingIngredientsDishes.add(dishId);
  render();

  // レシピ部分をローディングにする
  if (ingredientsRecipes) ingredientsRecipes.style.display = 'none';
  ingredientsRefreshRow.style.display = 'none';
  ingredientsLoading.style.display = '';

  try {
    const res = await api('POST', `/${dishId}/suggest-ingredients`, {
      force: true,
      extraIngredients: allSelectedNames,
    }, DISH_API);
    loadingIngredientsDishes.delete(dishId);
    if (res.success && res.data.ingredients.length > 0) {
      const recipes = res.data.recipes || [];
      const recipeStates = res.data.recipeStates || [];
      ingredientsCache.set(dishId, { dishName: cached.dishName, ingredients: res.data.ingredients, recipes, recipeStates });
      render();
      if (ingredientsDishId === dishId) {
        ingredientsLoading.style.display = 'none';
        renderIngredients(res.data.ingredients);
        renderExtraIngredients(dishId);
        renderRecipes(recipes, res.data.ingredients);
      }
    } else {
      render();
      if (ingredientsDishId === dishId) {
        ingredientsLoading.style.display = 'none';
        ingredientsError.textContent = '具材が見つかりませんでした';
        ingredientsError.style.display = '';
        extraSearchBtn.disabled = false;
        extraSearchBtn.textContent = 'この素材でレシピを再検索';
      }
    }
  } catch (err) {
    loadingIngredientsDishes.delete(dishId);
    render();
    if (ingredientsDishId === dishId) {
      ingredientsLoading.style.display = 'none';
      ingredientsError.textContent = `エラー: ${err.message || 'AI接続に失敗しました'}`;
      ingredientsError.style.display = '';
      extraSearchBtn.disabled = false;
      extraSearchBtn.textContent = 'この素材でレシピを再検索';
    }
  }
}

function closeIngredientsModal() {
  ingredientsOverlay.classList.remove('active');
  updateBodyScroll();
  ingredientsDishId = null;
  ingredientsHeader.style.display = 'none';
  ingredientsTitleInput.style.display = 'none';
  ingredientsTitle.style.display = '';
  ingredientsTitleLoading.style.display = 'none';
  if (ingredientsRecipes) ingredientsRecipes.style.display = 'none';
  ingredientsRefreshRow.style.display = 'none';
  extraIngredientsSection.style.display = 'none';
}

async function fetchIngredients(dishId, dishName) {
  showToast(`「${dishName}」のレシピを検索中...`);
  try {
    const res = await api('POST', `/${dishId}/suggest-ingredients`, {}, DISH_API);
    if (res.success && res.data.ingredients.length > 0) {
      ingredientsTitleLoading.style.display = 'none';
      ingredientsHeader.style.display = '';
      ingredientsTitle.textContent = dishName;
      ingredientsLoading.style.display = 'none';
      renderIngredients(res.data.ingredients);
    } else {
      ingredientsTitleLoading.style.display = 'none';
      ingredientsHeader.style.display = '';
      ingredientsTitle.textContent = dishName;
      ingredientsLoading.style.display = 'none';
      ingredientsError.textContent = '具材が見つかりませんでした';
      ingredientsError.style.display = '';
    }
  } catch (err) {
    ingredientsTitleLoading.style.display = 'none';
    ingredientsHeader.style.display = '';
    ingredientsTitle.textContent = dishName;
    ingredientsLoading.style.display = 'none';
    ingredientsError.textContent = `エラー: ${err.message || 'AI接続に失敗しました'}`;
    ingredientsError.style.display = '';
  }
}

function renderIngredients(ingredients) {
  const dish = ingredientsDishId ? dishes.find(d => d.id === ingredientsDishId) : null;
  const existingNames = new Set((dish && dish.items || []).filter(i => !i.checked).map(i => i.name));

  let html = '<div class="ingredients-hint">素材をタップすると追加されます</div>';
  ingredients.forEach(ing => {
    const added = existingNames.has(ing.name);
    html += `<span class="ingredient-chip${added ? ' selected' : ''}" data-name="${escapeHtml(ing.name)}">${escapeHtml(ing.name)}</span>`;
  });
  ingredientsList.innerHTML = html;
  ingredientsList.style.display = '';

  ingredientsList.querySelectorAll('.ingredient-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const name = chip.dataset.name;
      if (chip.classList.contains('selected')) {
        // 削除: 料理からアイテムを探して削除
        const d = dishes.find(dd => dd.id === ingredientsDishId);
        const dishItem = d && (d.items || []).find(i => i.name === name);
        if (dishItem) {
          chip.classList.remove('selected');
          await api('DELETE', `/${dishItem.id}`);
          items = items.filter(i => i.id !== dishItem.id);
          await loadDishes();
          render();
          renderExtraIngredients(ingredientsDishId);
          // レシピ内の同名食材も未追加状態に戻す
          ingredientsRecipes.querySelectorAll(`.recipe-ingredient[data-name="${CSS.escape(name)}"]`).forEach(el => {
            el.classList.remove('added');
          });
        }
      } else {
        // 追加
        chip.classList.add('selected');
        await addItem(name, ingredientsDishId);
        renderExtraIngredients(ingredientsDishId);
        // レシピ内の同名食材も追加済みに
        ingredientsRecipes.querySelectorAll(`.recipe-ingredient[data-name="${CSS.escape(name)}"]`).forEach(el => {
          el.classList.add('added');
        });
      }
    });
  });
}

function renderRecipes(recipes, ingredients) {
  if (!ingredientsRecipes) return;
  if (!recipes || recipes.length === 0) {
    ingredientsRecipes.style.display = 'none';
    ingredientsRefreshRow.style.display = '';
    return;
  }

  // 具材名リストと既に追加済みの名前を取得
  const ingredientNames = (ingredients || []).map(ing => ing.name);
  const dish = ingredientsDishId ? dishes.find(d => d.id === ingredientsDishId) : null;
  const addedNames = new Set((dish && dish.items || []).filter(i => !i.checked).map(i => i.name));
  const cached = ingredientsDishId ? ingredientsCache.get(ingredientsDishId) : null;
  const recipeStates = (cached && cached.recipeStates) || [];

  let html = '<div class="recipes-title">レシピ</div>';
  recipes.forEach((r, i) => {
    const state = recipeStates[i];
    const savedId = state ? state.id : 0;
    const liked = state ? state.liked : 0;
    const likeCount = state ? (state.like_count || 0) : 0;
    let stepsHtml = '';
    if (r.steps && r.steps.length > 0) {
      stepsHtml = `<ol class="recipe-steps" id="recipe-steps-${i}">`;
      r.steps.forEach(s => { stepsHtml += `<li>${highlightIngredients(s, ingredientNames, addedNames)}</li>`; });
      stepsHtml += '</ol>';
    }
    html += `
      <div class="recipe-card">
        <div class="recipe-card-header">
          <div class="recipe-card-title">${escapeHtml(r.title)}</div>
          ${savedId ? `<div><button class="recipe-like-btn${liked ? ' liked' : ''}" data-recipe-id="${savedId}">${liked ? '♥' : '♡'}</button>${likeCount > 0 ? `<span class="recipe-like-count">${likeCount}</span>` : ''}</div>` : ''}
        </div>
        <div class="recipe-card-summary">${highlightIngredients(r.summary, ingredientNames, addedNames)}</div>
        ${stepsHtml ? `<div class="recipe-detail-toggle" data-target="recipe-steps-${i}">▶ 詳細を見る</div>${stepsHtml}` : ''}
      </div>
    `;
  });
  ingredientsRecipes.innerHTML = html;
  ingredientsRecipes.style.display = '';
  ingredientsRefreshRow.style.display = '';

  ingredientsRecipes.querySelectorAll('.recipe-detail-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const steps = document.getElementById(toggle.dataset.target);
      if (steps) {
        const isOpen = steps.classList.toggle('open');
        toggle.textContent = isOpen ? '▼ 閉じる' : '▶ 詳細を見る';
      }
    });
  });

  // 食材名タップで追加/削除トグル
  ingredientsRecipes.querySelectorAll('.recipe-ingredient').forEach(span => {
    span.addEventListener('click', async () => {
      const name = span.dataset.name;
      if (span.classList.contains('added')) {
        // 削除
        const d = dishes.find(dd => dd.id === ingredientsDishId);
        const dishItem = d && (d.items || []).find(i => i.name === name);
        if (dishItem) {
          ingredientsRecipes.querySelectorAll(`.recipe-ingredient[data-name="${CSS.escape(name)}"]`).forEach(el => {
            el.classList.remove('added');
          });
          ingredientsList.querySelectorAll(`.ingredient-chip[data-name="${CSS.escape(name)}"]`).forEach(el => {
            el.classList.remove('selected');
          });
          await api('DELETE', `/${dishItem.id}`);
          items = items.filter(i => i.id !== dishItem.id);
          await loadDishes();
          render();
          renderExtraIngredients(ingredientsDishId);
        }
      } else {
        // 追加
        ingredientsRecipes.querySelectorAll(`.recipe-ingredient[data-name="${CSS.escape(name)}"]`).forEach(el => {
          el.classList.add('added');
        });
        ingredientsList.querySelectorAll(`.ingredient-chip[data-name="${CSS.escape(name)}"]`).forEach(el => {
          el.classList.add('selected');
        });
        await addItem(name, ingredientsDishId);
        renderExtraIngredients(ingredientsDishId);
      }
    });
  });

  // いいねボタン
  ingredientsRecipes.querySelectorAll('.recipe-like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const recipeId = Number(btn.dataset.recipeId);
      if (!recipeId) return;
      const res = await api('PUT', `/${recipeId}/like`, {}, '/api/saved-recipes');
      if (res.success) {
        const { liked, like_count } = res.data;
        btn.textContent = liked ? '♥' : '♡';
        btn.classList.toggle('liked', !!liked);
        // いいね数更新
        const countEl = btn.parentElement.querySelector('.recipe-like-count');
        if (countEl) {
          countEl.textContent = like_count > 0 ? like_count : '';
          if (like_count === 0) countEl.remove();
        } else if (like_count > 0) {
          const span = document.createElement('span');
          span.className = 'recipe-like-count';
          span.textContent = like_count;
          btn.parentElement.appendChild(span);
        }
        // キャッシュも更新
        const cached = ingredientsCache.get(ingredientsDishId);
        if (cached && cached.recipeStates) {
          const state = cached.recipeStates.find(s => s.id === recipeId);
          if (state) {
            state.liked = liked;
            state.like_count = like_count;
          }
        }
      }
    });
  });
}

// 料理名タップで編集
ingredientsTitle.addEventListener('click', () => {
  const dish = dishes.find(d => d.id === ingredientsDishId);
  if (!dish) return;
  ingredientsTitle.style.display = 'none';
  ingredientsTitleInput.value = dish.name;
  ingredientsTitleInput.style.display = '';
  ingredientsTitleInput.focus();
  ingredientsTitleInput.select();
});

async function commitDishNameEdit() {
  ingredientsTitleInput.style.display = 'none';
  ingredientsTitle.style.display = '';
  const newName = ingredientsTitleInput.value.trim();
  if (!newName || !ingredientsDishId) return;
  const dish = dishes.find(d => d.id === ingredientsDishId);
  if (!dish || dish.name === newName) return;

  // API で名前を更新
  const res = await api('PUT', `/${ingredientsDishId}`, { name: newName }, DISH_API);
  if (!res.success) return;

  // タイトル更新
  ingredientsTitle.textContent = newName;

  // キャッシュ削除 → レシピ再取得
  ingredientsCache.delete(ingredientsDishId);
  await loadDishes();
  render();

  // モーダル内をローディングにしてレシピ再取得
  ingredientsList.style.display = 'none';
  if (ingredientsRecipes) ingredientsRecipes.style.display = 'none';
  ingredientsRefreshRow.style.display = 'none';
  extraIngredientsSection.style.display = 'none';
  ingredientsError.style.display = 'none';
  ingredientsLoading.style.display = '';
  fetchIngredientsForModal(ingredientsDishId, newName);
}

ingredientsTitleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitDishNameEdit(); }
  if (e.key === 'Escape') {
    ingredientsTitleInput.style.display = 'none';
    ingredientsTitle.style.display = '';
  }
});

ingredientsTitleInput.addEventListener('blur', () => commitDishNameEdit());

ingredientsSkip.addEventListener('click', closeIngredientsModal);
ingredientsRefresh.addEventListener('click', () => {
  const dishId = ingredientsDishId;
  const cached = ingredientsCache.get(dishId);
  if (!dishId || !cached) return;
  ingredientsCache.delete(dishId);
  // モーダル内をローディング状態に
  ingredientsList.style.display = 'none';
  if (ingredientsRecipes) ingredientsRecipes.style.display = 'none';
  ingredientsRefreshRow.style.display = 'none';
  extraIngredientsSection.style.display = 'none';
  ingredientsError.style.display = 'none';
  ingredientsLoading.style.display = '';
  fetchIngredientsForModal(dishId, cached.dishName);
});
ingredientsOverlay.addEventListener('click', (e) => {
  if (e.target === ingredientsOverlay) closeIngredientsModal();
});

// 追加素材で再検索
extraSearchBtn.addEventListener('click', searchWithExtraIngredients);

// 画面回転ロック（対応ブラウザのみ）
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('portrait').catch(() => {});
}

// 料理レシピページ
const recipePageContent = document.getElementById('recipe-page-content');
const recipePageLikeCount = document.getElementById('recipe-page-like-count');

document.getElementById('header-recipe-btn').addEventListener('click', openRecipePage);
document.getElementById('recipe-page-close').addEventListener('click', closeRecipePage);

async function openRecipePage() {
  recipePageOverlay.classList.add('active');
  updateBodyScroll();
  recipePageContent.innerHTML = '<div class="recipe-page-empty">読み込み中...</div>';
  recipePageLikeCount.textContent = '';

  const res = await api('GET', '', null, '/api/saved-recipes');
  if (res.success) {
    renderRecipePage(res.data);
  } else {
    recipePageContent.innerHTML = '<div class="recipe-page-empty">読み込みに失敗しました</div>';
  }
}

function closeRecipePage() {
  recipePageOverlay.classList.remove('active');
  updateBodyScroll();
}

function renderRecipePage(recipes) {
  if (!recipes || recipes.length === 0) {
    recipePageContent.innerHTML = '<div class="recipe-page-empty">まだレシピがありません。<br>料理を追加するとレシピが自動で保存されます。</div>';
    recipePageLikeCount.textContent = '';
    return;
  }

  // いいね合計数
  const totalLikes = recipes.reduce((sum, r) => sum + (r.like_count || 0), 0);
  recipePageLikeCount.textContent = totalLikes > 0 ? `♥ ${totalLikes}` : '';

  // dish_name でグループ化
  const groups = new Map();
  for (const r of recipes) {
    const key = r.dish_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  // グループをいいね数合計でソート（APIのソート順で既にlike_count DESC）
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const aLikes = a[1].reduce((s, r) => s + (r.like_count || 0), 0);
    const bLikes = b[1].reduce((s, r) => s + (r.like_count || 0), 0);
    return bLikes - aLikes;
  });

  let html = '';
  let stepIdx = 0;
  for (const [dishName, groupRecipes] of sortedGroups) {
    const groupLikes = groupRecipes.reduce((s, r) => s + (r.like_count || 0), 0);
    html += `<div class="recipe-group">`;
    html += `<div class="recipe-group-header">`;
    html += `<div class="recipe-group-title">${escapeHtml(dishName)}</div>`;
    if (groupLikes > 0) html += `<span class="recipe-group-like-count">♥ ${groupLikes}</span>`;
    html += `</div>`;

    for (const r of groupRecipes) {
      const liked = r.liked;
      const likeCount = r.like_count || 0;
      let steps = [];
      try { steps = JSON.parse(r.steps_json); } catch {}
      let stepsHtml = '';
      if (steps && steps.length > 0) {
        stepsHtml = `<ol class="recipe-steps" id="rp-steps-${stepIdx}">`;
        steps.forEach(s => { stepsHtml += `<li>${escapeHtml(s)}</li>`; });
        stepsHtml += '</ol>';
      }
      html += `
        <div class="recipe-card">
          <div class="recipe-card-header">
            <div class="recipe-card-title">${escapeHtml(r.title)}</div>
            <div>
              <button class="recipe-like-btn${liked ? ' liked' : ''}" data-recipe-id="${r.id}">${liked ? '♥' : '♡'}</button>
              ${likeCount > 0 ? `<span class="recipe-like-count">${likeCount}</span>` : ''}
            </div>
          </div>
          <div class="recipe-card-summary">${escapeHtml(r.summary)}</div>
          ${stepsHtml ? `<div class="recipe-detail-toggle" data-target="rp-steps-${stepIdx}">▶ 詳細を見る</div>${stepsHtml}` : ''}
        </div>
      `;
      stepIdx++;
    }
    html += `</div>`;
  }

  recipePageContent.innerHTML = html;

  // 詳細展開トグル
  recipePageContent.querySelectorAll('.recipe-detail-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const steps = document.getElementById(toggle.dataset.target);
      if (steps) {
        const isOpen = steps.classList.toggle('open');
        toggle.textContent = isOpen ? '▼ 閉じる' : '▶ 詳細を見る';
      }
    });
  });

  // いいねトグル
  recipePageContent.querySelectorAll('.recipe-like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const recipeId = Number(btn.dataset.recipeId);
      if (!recipeId) return;
      const res = await api('PUT', `/${recipeId}/like`, {}, '/api/saved-recipes');
      if (res.success) {
        const { liked, like_count } = res.data;
        btn.textContent = liked ? '♥' : '♡';
        btn.classList.toggle('liked', !!liked);
        // いいね数更新
        const countEl = btn.parentElement.querySelector('.recipe-like-count');
        if (countEl) {
          countEl.textContent = like_count > 0 ? like_count : '';
          if (like_count === 0) countEl.remove();
        } else if (like_count > 0) {
          const span = document.createElement('span');
          span.className = 'recipe-like-count';
          span.textContent = like_count;
          btn.parentElement.appendChild(span);
        }

        // グループいいね数を再計算
        const group = btn.closest('.recipe-group');
        if (group) {
          let groupLikes = 0;
          group.querySelectorAll('.recipe-like-count').forEach(el => {
            groupLikes += Number(el.textContent) || 0;
          });
          const groupCountEl = group.querySelector('.recipe-group-like-count');
          if (groupCountEl) {
            groupCountEl.textContent = groupLikes > 0 ? `♥ ${groupLikes}` : '';
          } else if (groupLikes > 0) {
            const span = document.createElement('span');
            span.className = 'recipe-group-like-count';
            span.textContent = `♥ ${groupLikes}`;
            group.querySelector('.recipe-group-header').appendChild(span);
          }
        }

        // ヘッダー合計更新
        let totalLikes = 0;
        recipePageContent.querySelectorAll('.recipe-like-count').forEach(el => {
          totalLikes += Number(el.textContent) || 0;
        });
        recipePageLikeCount.textContent = totalLikes > 0 ? `♥ ${totalLikes}` : '';

        // ingredientsCache のrecipeStatesも同期
        for (const [, cached] of ingredientsCache) {
          if (cached.recipeStates) {
            const state = cached.recipeStates.find(s => s.id === recipeId);
            if (state) {
              state.liked = liked;
              state.like_count = like_count;
            }
          }
        }
      }
    });
  });
}

// 初期化: 認証状態チェック
if (isAuthenticated()) {
  showApp();
} else {
  showLoginPage();
}
