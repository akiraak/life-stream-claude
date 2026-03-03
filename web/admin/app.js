const API_ADMIN = '/api/admin';
const API_HEALTH = '/api/health';

const serverStatusEl = document.getElementById('server-status');
const statTotalEl = document.getElementById('stat-total');
const statUncheckedEl = document.getElementById('stat-unchecked');
const statCheckedEl = document.getElementById('stat-checked');
const itemsBody = document.getElementById('items-body');
const deleteAllBtn = document.getElementById('delete-all');
const emptyEl = document.getElementById('empty-message');

let items = [];

// 認証トークン取得
function getAuthToken() { return localStorage.getItem('auth_token'); }

// API 通信（認証ヘッダー付き）
async function api(method, url, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) {
    // 認証エラー → メインページへリダイレクト
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_email');
    location.href = '/';
    return { success: false, data: null, error: '認証が必要です' };
  }
  return res.json();
}

// ヘルスチェック
async function checkHealth() {
  try {
    const res = await api('GET', API_HEALTH);
    if (res.success) {
      serverStatusEl.textContent = 'OK';
      serverStatusEl.className = 'card-value ok';
    } else {
      throw new Error();
    }
  } catch {
    serverStatusEl.textContent = 'ERROR';
    serverStatusEl.className = 'card-value error';
  }
}

// 統計読み込み
async function loadStats() {
  const res = await api('GET', `${API_ADMIN}/stats`);
  if (res.success) {
    statTotalEl.textContent = res.data.total;
    statUncheckedEl.textContent = res.data.unchecked;
    statCheckedEl.textContent = res.data.checked;
  }
}

// アイテム一覧読み込み
async function loadItems() {
  const res = await api('GET', `${API_ADMIN}/shopping`);
  if (res.success) {
    items = res.data;
    renderTable();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return dateStr.replace('T', ' ').slice(0, 16);
}

// テーブル描画
function renderTable() {
  itemsBody.innerHTML = '';
  emptyEl.style.display = items.length === 0 ? '' : 'none';

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.id}</td>
      <td><input type="text" class="name-input" value="${escapeHtml(item.name)}" data-field="name"></td>
      <td><input type="text" class="cat-input" value="${escapeHtml(item.category)}" data-field="category"></td>
      <td><span class="badge ${item.checked ? 'badge-done' : 'badge-pending'}">${item.checked ? '購入済' : '未購入'}</span></td>
      <td>${formatDate(item.created_at)}</td>
      <td>
        <button class="btn btn-save">保存</button>
        <button class="btn btn-del">削除</button>
      </td>
    `;

    // 保存ボタン
    tr.querySelector('.btn-save').addEventListener('click', () => {
      const name = tr.querySelector('[data-field="name"]').value.trim();
      const category = tr.querySelector('[data-field="category"]').value.trim();
      if (!name) return alert('名前は必須です');
      saveItem(item.id, { name, category });
    });

    // 削除ボタン
    tr.querySelector('.btn-del').addEventListener('click', () => {
      if (confirm(`「${item.name}」を削除しますか？`)) {
        removeItem(item.id);
      }
    });

    itemsBody.appendChild(tr);
  });
}

// アイテム保存
async function saveItem(id, data) {
  const res = await api('PUT', `${API_ADMIN}/shopping/${id}`, data);
  if (res.success) {
    await refresh();
  }
}

// アイテム削除
async function removeItem(id) {
  const res = await api('DELETE', `${API_ADMIN}/shopping/${id}`);
  if (res.success) {
    await refresh();
  }
}

// 全件削除
async function deleteAll() {
  if (!confirm('全アイテムを削除しますか？この操作は取り消せません。')) return;
  const res = await api('DELETE', `${API_ADMIN}/shopping`);
  if (res.success) {
    await refresh();
  }
}

// 全データ再読み込み
async function refresh() {
  await Promise.all([loadStats(), loadItems()]);
}

// イベント
deleteAllBtn.addEventListener('click', deleteAll);

// レシピ推薦
const recipeBtnEl = document.getElementById('recipe-btn');
const recipeResponseEl = document.getElementById('recipe-response');

function renderRecipes(data) {
  const { items, recipes, rawResponse } = data;

  let html = `<div class="recipe-ingredients">食材: ${items.map(i => escapeHtml(i)).join('、')}</div>`;

  if (recipes.length === 0 && rawResponse) {
    html += `<div class="claude-response">${escapeHtml(rawResponse)}</div>`;
  } else {
    recipes.forEach((r, i) => {
      html += `<div class="recipe-card">`;
      html += `<h3>${i + 1}. ${escapeHtml(r.title)}</h3>`;
      html += `<div class="recipe-label">食材</div>`;
      html += `<ul>${r.ingredients.map(ig => `<li>${escapeHtml(ig)}</li>`).join('')}</ul>`;
      html += `<div class="recipe-label">手順</div>`;
      html += `<ol>${r.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;
      if (r.note) {
        html += `<div class="recipe-note">${escapeHtml(r.note)}</div>`;
      }
      html += `</div>`;
    });
  }

  return html;
}

async function fetchRecipes() {
  recipeBtnEl.disabled = true;
  recipeResponseEl.style.display = '';
  recipeResponseEl.className = 'claude-response loading';
  recipeResponseEl.textContent = 'レシピを考えています...';

  try {
    const res = await api('GET', '/api/recipes/recommend');
    if (res.success) {
      recipeResponseEl.className = '';
      recipeResponseEl.innerHTML = renderRecipes(res.data);
    } else {
      throw new Error(res.error || 'Unknown error');
    }
  } catch (err) {
    recipeResponseEl.className = 'claude-response error';
    recipeResponseEl.textContent = `エラー: ${err.message}`;
  } finally {
    recipeBtnEl.disabled = false;
  }
}

recipeBtnEl.addEventListener('click', fetchRecipes);

// Claude テスト
const claudePromptEl = document.getElementById('claude-prompt');
const claudeSendBtn = document.getElementById('claude-send');
const claudeResponseEl = document.getElementById('claude-response');

async function sendClaude() {
  const prompt = claudePromptEl.value.trim();
  if (!prompt) return;

  claudeSendBtn.disabled = true;
  claudeResponseEl.style.display = '';
  claudeResponseEl.className = 'claude-response loading';
  claudeResponseEl.textContent = '応答を待っています...';

  try {
    const res = await api('POST', '/api/claude', { prompt });
    if (res.success) {
      claudeResponseEl.className = 'claude-response';
      claudeResponseEl.textContent = res.data.response;
    } else {
      throw new Error(res.error || 'Unknown error');
    }
  } catch (err) {
    claudeResponseEl.className = 'claude-response error';
    claudeResponseEl.textContent = `エラー: ${err.message}`;
  } finally {
    claudeSendBtn.disabled = false;
  }
}

claudeSendBtn.addEventListener('click', sendClaude);
claudePromptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendClaude();
});

// 認証チェック → 初期読み込み
if (!getAuthToken()) {
  location.href = '/';
} else {
  checkHealth();
  refresh();
}
