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

// API 通信
async function api(method, url, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
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
      <td><input type="number" class="qty-input" value="${item.quantity}" min="1" max="99" data-field="quantity"></td>
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
      const quantity = parseInt(tr.querySelector('[data-field="quantity"]').value, 10) || 1;
      const category = tr.querySelector('[data-field="category"]').value.trim();
      if (!name) return alert('名前は必須です');
      saveItem(item.id, { name, quantity, category });
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

// 初期読み込み
checkHealth();
refresh();
