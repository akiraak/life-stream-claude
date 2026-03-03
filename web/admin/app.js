// ============================================================
// Config & Helpers
// ============================================================
const API = '/api/admin';

function getAuthToken() { return localStorage.getItem('auth_token'); }

async function api(method, url, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_email');
    location.href = '/';
    return { success: false };
  }
  if (res.status === 403) {
    document.getElementById('content-area').innerHTML =
      '<div class="empty-state">管理者権限がありません</div>';
    return { success: false };
  }
  return res.json();
}

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return dateStr.replace('T', ' ').slice(0, 16);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}日 ${h}時間 ${m}分`;
  if (h > 0) return `${h}時間 ${m}分`;
  return `${m}分`;
}

// ============================================================
// Toast
// ============================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ============================================================
// Confirm dialog
// ============================================================
function showConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="confirm-message">${escapeHtml(message)}</div>
        <div class="confirm-buttons">
          <button class="confirm-cancel">キャンセル</button>
          <button class="confirm-ok">削除</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('.confirm-ok').onclick = () => { overlay.remove(); resolve(true); };
  });
}

// ============================================================
// Reusable data table
// ============================================================
function renderDataTable(container, { columns, data, searchFields, actions }) {
  let filtered = data;
  const el = typeof container === 'string' ? document.getElementById(container) : container;

  function render() {
    let html = '<div class="table-card"><div class="table-toolbar">';
    html += `<div class="table-toolbar-left"><span class="table-count">${filtered.length} 件</span></div>`;
    if (searchFields) {
      html += '<input type="text" class="search-input" placeholder="検索...">';
    }
    html += '</div><div class="table-wrap"><table><thead><tr>';
    columns.forEach(c => {
      const w = c.width ? ` style="width:${c.width}"` : '';
      html += `<th${w}>${escapeHtml(c.label)}</th>`;
    });
    if (actions) html += '<th>操作</th>';
    html += '</tr></thead><tbody>';

    if (filtered.length === 0) {
      const colspan = columns.length + (actions ? 1 : 0);
      html += `<tr><td colspan="${colspan}" style="text-align:center;color:#94a3b8;padding:24px">データがありません</td></tr>`;
    } else {
      filtered.forEach(row => {
        html += '<tr>';
        columns.forEach(c => {
          const val = c.render ? c.render(row) : escapeHtml(row[c.key]);
          html += `<td>${val}</td>`;
        });
        if (actions) {
          html += '<td>';
          actions.forEach(a => {
            html += `<button class="btn ${a.class || 'btn-danger'} btn-sm" data-action="${a.key}" data-id="${row.id}">${a.label}</button> `;
          });
          html += '</td>';
        }
        html += '</tr>';
      });
    }

    html += '</tbody></table></div></div>';
    el.innerHTML = html;

    // Search handler
    const searchInput = el.querySelector('.search-input');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const q = searchInput.value.toLowerCase().trim();
          filtered = q ? data.filter(row =>
            searchFields.some(f => String(row[f] || '').toLowerCase().includes(q))
          ) : data;
          // Re-render table body only
          const tbody = el.querySelector('tbody');
          let tbHtml = '';
          if (filtered.length === 0) {
            const colspan = columns.length + (actions ? 1 : 0);
            tbHtml = `<tr><td colspan="${colspan}" style="text-align:center;color:#94a3b8;padding:24px">データがありません</td></tr>`;
          } else {
            filtered.forEach(row => {
              tbHtml += '<tr>';
              columns.forEach(c => {
                const val = c.render ? c.render(row) : escapeHtml(row[c.key]);
                tbHtml += `<td>${val}</td>`;
              });
              if (actions) {
                tbHtml += '<td>';
                actions.forEach(a => {
                  tbHtml += `<button class="btn ${a.class || 'btn-danger'} btn-sm" data-action="${a.key}" data-id="${row.id}">${a.label}</button> `;
                });
                tbHtml += '</td>';
              }
              tbHtml += '</tr>';
            });
          }
          tbody.innerHTML = tbHtml;
          el.querySelector('.table-count').textContent = filtered.length + ' 件';
          attachActionHandlers();
        }, 200);
      });
    }

    attachActionHandlers();
  }

  function attachActionHandlers() {
    if (!actions) return;
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = () => {
        const action = actions.find(a => a.key === btn.dataset.action);
        const row = data.find(r => String(r.id) === btn.dataset.id);
        if (action && row) action.onClick(row);
      };
    });
  }

  render();
}

// ============================================================
// Pages
// ============================================================
const Pages = {
  dashboard:          { title: 'ダッシュボード',   render: renderDashboard },
  users:              { title: 'ユーザー管理',     render: renderUsers },
  dishes:             { title: '料理',             render: renderDishes },
  'saved-recipes':    { title: '料理レシピ',       render: renderSavedRecipes },
  'dish-items':       { title: '料理-食材リンク',  render: renderDishItems },
  'dish-history':     { title: '料理履歴',         render: renderDishHistory },
  shopping:           { title: '買い物アイテム',   render: renderShopping },
  'purchase-history': { title: '購入履歴',         render: renderPurchaseHistory },
  system:             { title: 'システム情報',     render: renderSystem },
};

// ============================================================
// Router
// ============================================================
const Router = {
  currentPage: null,
  init() {
    window.addEventListener('hashchange', () => this.navigate());
    this.navigate();
  },
  navigate() {
    const hash = location.hash.slice(1) || 'dashboard';
    this.currentPage = hash;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === hash);
    });
    const page = Pages[hash];
    if (page) {
      document.getElementById('page-title').textContent = page.title;
      page.render();
    }
  }
};

// ============================================================
// Dashboard
// ============================================================
async function renderDashboard() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/dashboard`);
  if (!res.success) return;
  const d = res.data;

  area.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">ユーザー数</div>
        <div class="stat-value">${d.totalUsers}</div>
        <div class="stat-sub">直近7日: +${d.recentUsersCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">買い物アイテム</div>
        <div class="stat-value">${d.totalItems}</div>
        <div class="stat-sub">直近7日: +${d.recentItemsCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">料理</div>
        <div class="stat-value">${d.totalDishes}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">購入履歴</div>
        <div class="stat-value">${d.totalPurchases}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">料理履歴</div>
        <div class="stat-value">${d.totalDishHistory}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日のアクティブ</div>
        <div class="stat-value">${d.activeUsersToday}</div>
      </div>
    </div>`;
}

// ============================================================
// Users
// ============================================================
async function renderUsers() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/users`);
  if (!res.success) return;

  renderDataTable(area, {
    columns: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'email', label: 'メール' },
      { key: 'shopping_count', label: 'アイテム数', width: '90px' },
      { key: 'dish_count', label: '料理数', width: '80px' },
      { key: 'purchase_count', label: '購入履歴', width: '80px' },
      { key: 'created_at', label: '作成日', render: r => formatDate(r.created_at) },
      { key: 'last_login_at', label: '最終ログイン', render: r => formatDate(r.last_login_at) },
    ],
    data: res.data,
    searchFields: ['email'],
    actions: [
      { key: 'delete', label: '削除', class: 'btn-danger', onClick: async (row) => {
        if (await showConfirm(`ユーザー「${row.email}」を削除しますか？\n関連する全データも削除されます。`)) {
          const r = await api('DELETE', `${API}/users/${row.id}`);
          if (r.success) { showToast('ユーザーを削除しました'); renderUsers(); }
          else showToast('削除に失敗しました', 'error');
        }
      }}
    ]
  });
}

// ============================================================
// Shopping Items
// ============================================================
async function renderShopping() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/shopping`);
  if (!res.success) return;

  renderDataTable(area, {
    columns: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'email', label: 'ユーザー' },
      { key: 'name', label: '名前' },
      { key: 'category', label: 'カテゴリ' },
      { key: 'checked', label: '状態', render: r =>
        r.checked
          ? '<span class="badge badge-success">購入済</span>'
          : '<span class="badge badge-warning">未購入</span>'
      },
      { key: 'created_at', label: '作成日', render: r => formatDate(r.created_at) },
    ],
    data: res.data,
    searchFields: ['name', 'category', 'email'],
    actions: [
      { key: 'delete', label: '削除', class: 'btn-danger', onClick: async (row) => {
        if (await showConfirm(`「${row.name}」を削除しますか？`)) {
          const r = await api('DELETE', `${API}/shopping/${row.id}`);
          if (r.success) { showToast('削除しました'); renderShopping(); }
          else showToast('削除に失敗しました', 'error');
        }
      }}
    ]
  });
}

// ============================================================
// Dishes
// ============================================================
async function renderDishes() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/dishes`);
  if (!res.success) return;

  renderDataTable(area, {
    columns: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'email', label: 'ユーザー' },
      { key: 'name', label: '料理名' },
      { key: 'ingredients_json', label: '具材', render: r =>
        r.ingredients_json ? '<span class="badge badge-success">あり</span>' : '<span class="badge badge-neutral">なし</span>'
      },
      { key: 'recipes_json', label: 'レシピ', render: r =>
        r.recipes_json ? '<span class="badge badge-success">あり</span>' : '<span class="badge badge-neutral">なし</span>'
      },
      { key: 'created_at', label: '作成日', render: r => formatDate(r.created_at) },
    ],
    data: res.data,
    searchFields: ['name', 'email'],
    actions: [
      { key: 'delete', label: '削除', class: 'btn-danger', onClick: async (row) => {
        if (await showConfirm(`料理「${row.name}」を削除しますか？`)) {
          const r = await api('DELETE', `${API}/dishes/${row.id}`);
          if (r.success) { showToast('削除しました'); renderDishes(); }
          else showToast('削除に失敗しました', 'error');
        }
      }}
    ]
  });
}

// ============================================================
// Dish Items (links)
// ============================================================
async function renderDishItems() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/dish-items`);
  if (!res.success) return;

  renderDataTable(area, {
    columns: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'email', label: 'ユーザー' },
      { key: 'dish_name', label: '料理名' },
      { key: 'item_name', label: 'アイテム名' },
      { key: 'position', label: '順序', width: '60px' },
    ],
    data: res.data,
    searchFields: ['dish_name', 'item_name', 'email'],
  });
}

// ============================================================
// Purchase History
// ============================================================
async function renderPurchaseHistory() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/purchase-history?limit=500`);
  if (!res.success) return;

  renderDataTable(area, {
    columns: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'email', label: 'ユーザー' },
      { key: 'item_name', label: 'アイテム名' },
      { key: 'purchased_at', label: '購入日', render: r => formatDate(r.purchased_at) },
    ],
    data: res.data,
    searchFields: ['item_name', 'email'],
  });
}

// ============================================================
// Dish History
// ============================================================
async function renderDishHistory() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/dish-history?limit=500`);
  if (!res.success) return;

  renderDataTable(area, {
    columns: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'email', label: 'ユーザー' },
      { key: 'dish_name', label: '料理名' },
      { key: 'created_at', label: '作成日', render: r => formatDate(r.created_at) },
    ],
    data: res.data,
    searchFields: ['dish_name', 'email'],
  });
}

// ============================================================
// Saved Recipes
// ============================================================
async function renderSavedRecipes() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/saved-recipes`);
  if (!res.success) return;

  renderDataTable(area, {
    columns: [
      { key: 'id', label: 'ID', width: '60px' },
      { key: 'email', label: 'ユーザー' },
      { key: 'dish_name', label: '料理名' },
      { key: 'title', label: 'レシピ名' },
      { key: 'summary', label: '概要' },
      { key: 'liked', label: 'いいね', width: '70px', render: r =>
        r.liked ? '<span class="badge badge-success">♥</span>' : '<span class="badge badge-neutral">-</span>'
      },
      { key: 'created_at', label: '保存日', render: r => formatDate(r.created_at) },
    ],
    data: res.data,
    searchFields: ['dish_name', 'title', 'email', 'summary'],
    actions: [
      { key: 'delete', label: '削除', class: 'btn-danger', onClick: async (row) => {
        if (await showConfirm(`レシピ「${row.title}」を削除しますか？`)) {
          const r = await api('DELETE', `${API}/saved-recipes/${row.id}`);
          if (r.success) { showToast('削除しました'); renderSavedRecipes(); }
          else showToast('削除に失敗しました', 'error');
        }
      }}
    ]
  });
}

// ============================================================
// System
// ============================================================
async function renderSystem() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/system`);
  if (!res.success) return;
  const s = res.data;

  const tableRows = Object.entries(s.tableCounts)
    .map(([name, count]) => `<div class="info-row"><span class="info-label">${escapeHtml(name)}</span><span class="info-value">${count}</span></div>`)
    .join('');

  area.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
      <div class="info-section">
        <div class="info-section-title">サーバー</div>
        <div class="info-row"><span class="info-label">稼働時間</span><span class="info-value">${formatUptime(s.uptime)}</span></div>
        <div class="info-row"><span class="info-label">Node.js</span><span class="info-value">${escapeHtml(s.nodeVersion)}</span></div>
        <div class="info-row"><span class="info-label">メモリ (RSS)</span><span class="info-value">${formatBytes(s.memoryUsage.rss)}</span></div>
        <div class="info-row"><span class="info-label">ヒープ使用量</span><span class="info-value">${formatBytes(s.memoryUsage.heapUsed)} / ${formatBytes(s.memoryUsage.heapTotal)}</span></div>
      </div>
      <div class="info-section">
        <div class="info-section-title">データベース</div>
        <div class="info-row"><span class="info-label">DB サイズ</span><span class="info-value">${formatBytes(s.dbSizeBytes)}</span></div>
        ${tableRows}
      </div>
    </div>
    <div style="margin-top:16px">
      <button class="btn btn-primary" onclick="renderSystem()">更新</button>
    </div>`;
}

// ============================================================
// Init
// ============================================================
if (!getAuthToken()) {
  location.href = '/';
} else {
  document.getElementById('topbar-user').textContent = localStorage.getItem('auth_email') || '';
  Router.init();
}
