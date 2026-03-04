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
  shopping:           { title: '買い物アイテム',   render: renderShopping },
  'purchase-history': { title: '購入履歴',         render: renderPurchaseHistory },
  system:             { title: 'システム情報',     render: renderSystem },
  docs:               { title: '企画ドキュメント', render: renderDocs },
  'icon-preview':     { title: 'アイコン候補',     render: renderIconPreview, parent: 'docs' },
  'app-name':         { title: 'アプリ名候補',     render: renderAppName, parent: 'docs' },
  'monetization':     { title: 'マネタイズ検討',   render: renderMonetization, parent: 'docs' },
  'native-app':       { title: 'ネイティブアプリ技術検討', render: renderNativeApp, parent: 'docs' },
  'remote-dev':       { title: 'リモート開発環境検討', render: renderRemoteDev, parent: 'docs' },
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
    const page = Pages[hash];
    // サブページの場合は親のナビをアクティブにする
    const navTarget = (page && page.parent) || hash;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === navTarget);
    });
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
      { key: 'dish_names', label: '料理', render: r => r.dish_names || '' },
      { key: 'checked', label: '状態', render: r =>
        r.checked
          ? '<span class="badge badge-success">購入済</span>'
          : '<span class="badge badge-warning">未購入</span>'
      },
      { key: 'created_at', label: '作成日', render: r => formatDate(r.created_at) },
    ],
    data: res.data,
    searchFields: ['name', 'category', 'email', 'dish_names'],
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
      { key: 'item_names', label: '食材', render: r => {
        if (!r.item_names) return '<span class="badge badge-neutral">なし</span>';
        const items = r.item_names.split(', ');
        return `<span class="toggle-detail" data-id="items-${r.id}">▶ ${items.length}件</span>`
          + `<div class="detail-content" id="items-${r.id}" style="display:none">${items.map(i => escapeHtml(i)).join('<br>')}</div>`;
      }},
      { key: 'active', label: '状態', width: '60px', render: r =>
        r.active ? '<span class="badge badge-success">有効</span>' : '<span class="badge badge-neutral">完了</span>'
      },
      { key: 'created_at', label: '作成日', render: r => formatDate(r.created_at) },
    ],
    data: res.data,
    searchFields: ['name', 'email', 'item_names'],
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

  // 折りたたみトグル
  area.querySelectorAll('.toggle-detail').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const target = document.getElementById(el.dataset.id);
      if (target) {
        const open = target.style.display !== 'none';
        target.style.display = open ? 'none' : 'block';
        el.textContent = (open ? '▶' : '▼') + el.textContent.slice(1);
      }
    });
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
      { key: 'like_count', label: 'いいね', width: '70px', render: r =>
        r.like_count > 0 ? `<span class="badge badge-success">♥ ${r.like_count}</span>` : '<span class="badge badge-neutral">0</span>'
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
// Docs (企画ドキュメント一覧)
// ============================================================
function renderDocs() {
  const docs = [
    { hash: 'icon-preview', icon: '&#127912;', title: 'アイコン候補', desc: 'ヘッダーアイコンの組み合わせ比較' },
    { hash: 'app-name', icon: '&#9998;', title: 'アプリ名候補', desc: 'アプリ名の候補一覧（決定：お料理バスケット）' },
    { hash: 'monetization', icon: '&#128176;', title: 'マネタイズ検討', desc: '収益モデル比較、競合価格帯、推奨プラン、ロードマップ' },
    { hash: 'native-app', icon: '&#128241;', title: 'ネイティブアプリ技術検討', desc: 'iPhone/Android アプリ化の技術比較・推奨アプローチ・コスト試算' },
    { hash: 'remote-dev', icon: '&#128225;', title: 'リモート開発環境検討', desc: 'WSL2 + Claude Code をスマホから外出先で操作する方法の比較' },
  ];

  const area = document.getElementById('content-area');
  let html = '<div class="docs-grid">';
  for (const d of docs) {
    html += `
      <a href="#${d.hash}" class="docs-card">
        <div class="docs-card-icon">${d.icon}</div>
        <div class="docs-card-body">
          <div class="docs-card-title">${escapeHtml(d.title)}</div>
          <div class="docs-card-desc">${escapeHtml(d.desc)}</div>
        </div>
      </a>`;
  }
  html += '</div>';
  area.innerHTML = html;
}

// ============================================================
// Icon Preview
// ============================================================
function renderIconPreview() {
  const combos = [
    {
      id: 'A', label: '地球 + ハート', desc: 'みんな=地球 / 自分=ハート',
      shared: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
      saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    },
    {
      id: 'B', label: '複数人 + 1人', desc: 'みんな=ユーザーグループ / 自分=ユーザー',
      shared: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
      saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    },
    {
      id: 'C', label: '開いた本 + ブックマーク', desc: 'みんな=開いた本 / 自分=ブックマーク',
      shared: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
      saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>',
    },
    {
      id: 'D', label: '複数人 + ハート', desc: 'みんな=ユーザーグループ / 自分=ハート',
      shared: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
      saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    },
    {
      id: 'E', label: '星 + ブックマーク', desc: 'みんな=星(人気) / 自分=ブックマーク',
      shared: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>',
    },
    {
      id: 'F', label: '複数人 + ブックマーク', desc: 'みんな=ユーザーグループ / 自分=ブックマーク', current: true,
      shared: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
      saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>',
    },
    {
      id: 'G', label: '地球 + ブックマーク', desc: 'みんな=地球 / 自分=ブックマーク',
      shared: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
      saved: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>',
    },
  ];

  const hamburger = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';

  const btnStyle = 'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid #444;border-radius:6px;background:none;color:#888;';

  let html = `
    <p style="color:#888;margin-bottom:16px">左: みんなのレシピ / 中: 自分のレシピ / 右: メニュー(固定)</p>
    <div style="display:flex;flex-direction:column;gap:12px">`;

  for (const c of combos) {
    html += `
      <div class="card" style="padding:16px;display:flex;align-items:center;gap:16px;${c.current ? 'border:1px solid #f97316;' : ''}">
        <strong style="min-width:20px">${c.id}</strong>
        <div style="display:flex;gap:8px;align-items:center;background:#1c1c1c;padding:8px 12px;border-radius:8px">
          <span style="${btnStyle}">${c.shared}</span>
          <span style="${btnStyle}">${c.saved}</span>
          <span style="${btnStyle}">${hamburger}</span>
        </div>
        <div>
          <div style="font-size:14px">${c.label}${c.current ? ' <span style="background:#f97316;color:#1c1c1c;padding:2px 6px;border-radius:4px;font-size:11px">現在</span>' : ''}</div>
          <div style="font-size:12px;color:#888">${c.desc}</div>
        </div>
      </div>`;
  }

  html += '</div>';
  document.getElementById('content-area').innerHTML = html;
}

// ============================================================
// App Name Candidates
// ============================================================
function renderAppName() {
  const currentName = 'お料理バスケット';

  const categories = [
    {
      label: 'こんだて・献立 系',
      items: [
        { name: 'こんだてリスト', short: 'こんだて', desc: '直球。献立＋リスト' },
        { name: 'こんだてメモ', short: 'こんだて', desc: 'メモ感で気軽さ' },
        { name: 'こんだてノート', short: 'こんだて', desc: '記録・管理感' },
        { name: 'こんだてかご', short: 'こんだて', desc: '献立＋買い物かご' },
        { name: 'こんだてボード', short: 'こんだて', desc: 'ホワイトボード的な' },
        { name: 'こんだてポケット', short: 'こんだて', desc: 'ポケットに入る手軽さ' },
        { name: 'こんだてストック', short: 'こんだて', desc: '食材ストック感' },
        { name: 'こんだて帳', short: 'こんだて帳', desc: '手帳っぽい' },
      ]
    },
    {
      label: 'レシピ 系',
      items: [
        { name: 'レシピかご', short: 'レシピかご', desc: 'かわいい響き' },
        { name: 'レシピメモ', short: 'レシピメモ', desc: 'シンプル' },
        { name: 'レシピノート', short: 'レシピノート', desc: '記録感' },
        { name: 'レシピリスト', short: 'レシピリスト', desc: '直球' },
        { name: 'レシピポケット', short: 'レシピ', desc: '手元にある感' },
        { name: 'レシピボックス', short: 'レシピ', desc: '箱に入れてストック' },
        { name: 'レシピストック', short: 'レシピ', desc: '蓄える感じ' },
        { name: 'レシピ棚', short: 'レシピ棚', desc: 'パントリー的' },
      ]
    },
    {
      label: '食材・具材 系',
      items: [
        { name: '食材リスト', short: '食材リスト', desc: '機能そのまま' },
        { name: '食材メモ', short: '食材メモ', desc: '気軽' },
        { name: '食材ノート', short: '食材ノート', desc: '記録' },
        { name: '食材かご', short: '食材かご', desc: '買い物かご感' },
        { name: '食材ポケット', short: '食材', desc: 'コンパクト' },
        { name: '具材メモ', short: '具材メモ', desc: '具材にフォーカス' },
        { name: '具材リスト', short: '具材リスト', desc: '直球' },
        { name: '具材かご', short: '具材かご', desc: 'かわいい' },
      ]
    },
    {
      label: 'ごはん・お料理 系',
      items: [
        { name: 'ごはんメモ', short: 'ごはんメモ', desc: '親しみやすい' },
        { name: 'ごはんリスト', short: 'ごはん', desc: 'カジュアル' },
        { name: 'ごはんノート', short: 'ごはん', desc: '日記っぽさ' },
        { name: 'ごはんかご', short: 'ごはん', desc: 'やわらかい' },
        { name: 'お料理メモ', short: 'お料理メモ', desc: '丁寧な響き' },
        { name: 'お料理かご', short: 'お料理かご', desc: '上品＋かわいい' },
        { name: 'お料理ノート', short: 'お料理', desc: '記録感' },
        { name: 'おかずメモ', short: 'おかずメモ', desc: '日常感' },
        { name: 'おかずかご', short: 'おかずかご', desc: '庶民的でかわいい' },
      ]
    },
    {
      label: '買い物・キッチン 系',
      items: [
        { name: 'おかいものメモ', short: 'おかいもの', desc: 'やさしい響き' },
        { name: 'おかいものかご', short: 'おかいもの', desc: 'スーパーのかご感' },
        { name: 'かいものノート', short: 'かいもの', desc: 'シンプル' },
        { name: 'キッチンメモ', short: 'キッチン', desc: 'おしゃれ' },
        { name: 'キッチンリスト', short: 'キッチン', desc: 'スマート' },
        { name: 'キッチンノート', short: 'キッチン', desc: '台所の相棒感' },
      ]
    },
    {
      label: '食卓・まいにち 系',
      items: [
        { name: '食卓メモ', short: '食卓メモ', desc: '食卓を囲むイメージ' },
        { name: '食卓ノート', short: '食卓ノート', desc: 'あたたかみ' },
        { name: '食卓リスト', short: '食卓リスト', desc: 'きちんと感' },
        { name: 'まいにちごはん', short: 'まいにち', desc: '毎日使うアプリ感' },
        { name: 'まいにちこんだて', short: 'まいにち', desc: '日常に寄り添う' },
      ]
    },
    {
      label: '〇〇バスケット 系',
      items: [
        { name: 'こんだてバスケット', short: 'こんだて', desc: '献立＋買い物かごの英語版' },
        { name: 'レシピバスケット', short: 'レシピ', desc: 'レシピを入れるかご' },
        { name: '食材バスケット', short: '食材', desc: '食材を買い物かごに' },
        { name: '具材バスケット', short: '具材', desc: '具材を集めるイメージ' },
        { name: 'ごはんバスケット', short: 'ごはん', desc: 'カジュアル＋おしゃれ' },
        { name: 'お料理バスケット', short: 'お料理', desc: '丁寧で上品' },
        { name: 'おかずバスケット', short: 'おかず', desc: '日常感＋英語のおしゃれ感' },
        { name: 'キッチンバスケット', short: 'キッチン', desc: '台所のかご。インテリア感' },
        { name: '食卓バスケット', short: '食卓', desc: 'テーブルに並ぶイメージ' },
        { name: 'おかいものバスケット', short: 'おかいもの', desc: 'スーパーの買い物かご' },
      ]
    },
    {
      label: 'ひねり系',
      items: [
        { name: 'ごはんのたね', short: 'ごはんのたね', desc: '食材＝ごはんの種' },
        { name: 'こんだてのたね', short: 'こんだてのたね', desc: '献立の素' },
        { name: 'おかずのもと', short: 'おかずのもと', desc: '料理の元＝食材' },
        { name: 'レシピのもと', short: 'レシピのもと', desc: 'レシピ作りの素材' },
        { name: '食材パントリー', short: '食材', desc: '食料庫イメージ' },
      ]
    },
  ];

  const area = document.getElementById('content-area');

  // 変更対象の箇所
  const targets = [
    { file: 'web/index.html', location: '<title>', current: currentName },
    { file: 'web/index.html', location: 'ログイン画面 <h1>', current: currentName },
    { file: 'web/index.html', location: 'ヘッダー <h1>', current: currentName },
    { file: 'web/manifest.json', location: 'name', current: currentName },
    { file: 'web/manifest.json', location: 'short_name', current: currentName },
    { file: 'web/admin/index.html', location: '<title>', current: '管理画面 - ' + currentName },
  ];

  let html = '';

  // 現在の名前
  html += `
    <div class="info-section" style="margin-bottom:20px">
      <div class="info-section-title">現在のアプリ名</div>
      <div style="font-size:24px;font-weight:700;color:#1e293b;margin-bottom:16px">${escapeHtml(currentName)}</div>
      <div class="info-section-title" style="margin-top:12px">変更対象の箇所</div>
      ${targets.map(t => `
        <div class="info-row">
          <span class="info-label"><code>${escapeHtml(t.file)}</code> — ${escapeHtml(t.location)}</span>
          <span class="info-value">${escapeHtml(t.current)}</span>
        </div>
      `).join('')}
    </div>`;

  // 検索
  html += `
    <div style="margin-bottom:16px;display:flex;gap:12px;align-items:center">
      <input type="text" class="search-input" id="app-name-search" placeholder="候補を検索..." style="width:300px">
      <span class="table-count" id="app-name-count">${categories.reduce((s, c) => s + c.items.length, 0)} 件</span>
    </div>`;

  // カテゴリごとのカード
  html += '<div id="app-name-list">';
  for (const cat of categories) {
    html += `<div class="name-category" data-category="${escapeHtml(cat.label)}">`;
    html += `<div style="font-size:14px;font-weight:700;color:#64748b;margin:20px 0 10px;text-transform:uppercase;letter-spacing:0.03em">${escapeHtml(cat.label)}</div>`;
    html += '<div class="name-grid">';
    for (const item of cat.items) {
      html += `
        <div class="name-card" data-name="${escapeHtml(item.name)}" data-desc="${escapeHtml(item.desc)}">
          <div class="name-card-name">${escapeHtml(item.name)}</div>
          <div class="name-card-short">short_name: ${escapeHtml(item.short)}</div>
          <div class="name-card-desc">${escapeHtml(item.desc)}</div>
        </div>`;
    }
    html += '</div></div>';
  }
  html += '</div>';

  area.innerHTML = html;

  // 検索機能
  const searchInput = document.getElementById('app-name-search');
  const countEl = document.getElementById('app-name-count');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    let visible = 0;
    area.querySelectorAll('.name-card').forEach(card => {
      const match = !q ||
        card.dataset.name.toLowerCase().includes(q) ||
        card.dataset.desc.toLowerCase().includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    // カテゴリ見出しの表示/非表示
    area.querySelectorAll('.name-category').forEach(cat => {
      const hasVisible = cat.querySelectorAll('.name-card[style=""], .name-card:not([style])').length > 0;
      // Check if any card is visible
      let anyVisible = false;
      cat.querySelectorAll('.name-card').forEach(c => {
        if (c.style.display !== 'none') anyVisible = true;
      });
      cat.style.display = anyVisible ? '' : 'none';
    });
    countEl.textContent = visible + ' 件';
  });
}

// ============================================================
// Monetization
// ============================================================
function renderMonetization() {
  const area = document.getElementById('content-area');

  const sections = [
    {
      title: '1. 収益モデルの比較',
      content: `
        <table>
          <thead><tr><th>モデル</th><th>概要</th><th>メリット</th><th>デメリット</th><th>適合度</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>フリーミアム</strong></td>
              <td>基本無料＋有料プレミアム機能</td>
              <td>ユーザー獲得しやすい、段階的に課金導入可能</td>
              <td>無料→有料の壁が高い</td>
              <td><span class="badge badge-success">★★★</span></td>
            </tr>
            <tr>
              <td><strong>サブスクリプション</strong></td>
              <td>月額/年額課金</td>
              <td>安定収入、LTV が高い</td>
              <td>初期ユーザー数が少ないと厳しい</td>
              <td><span class="badge badge-success">★★★</span></td>
            </tr>
            <tr>
              <td><strong>広告</strong></td>
              <td>バナー・インタースティシャル広告</td>
              <td>導入が簡単</td>
              <td>UX 低下、単価が低い、PWA は広告 SDK の制約あり</td>
              <td><span class="badge badge-warning">★★</span></td>
            </tr>
            <tr>
              <td><strong>アフィリエイト</strong></td>
              <td>食材購入リンクで紹介料</td>
              <td>レシピ→買い物の導線と相性抜群</td>
              <td>提携先の開拓が必要</td>
              <td><span class="badge badge-success">★★★</span></td>
            </tr>
            <tr>
              <td><strong>買い切り</strong></td>
              <td>アプリ購入で一括課金</td>
              <td>シンプル</td>
              <td>PWA では課金が難しい、継続収入なし</td>
              <td><span class="badge badge-neutral">★</span></td>
            </tr>
            <tr>
              <td><strong>投げ銭・寄付</strong></td>
              <td>任意の支援金</td>
              <td>ユーザーの善意、導入が簡単</td>
              <td>収入が不安定</td>
              <td><span class="badge badge-warning">★★</span></td>
            </tr>
          </tbody>
        </table>`
    },
    {
      title: '2. 競合アプリの価格帯（日本市場）',
      content: `
        <table>
          <thead><tr><th>アプリ</th><th>月額</th><th>年額</th><th>無料機能</th><th>有料機能</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Cookpad</strong></td>
              <td>¥280</td>
              <td>-</td>
              <td>レシピ閲覧、投稿</td>
              <td>人気順検索、プレミアム限定レシピ</td>
            </tr>
            <tr>
              <td><strong>DELISH KITCHEN</strong></td>
              <td>¥480</td>
              <td>¥4,500</td>
              <td>レシピ動画閲覧</td>
              <td>管理栄養士監修、献立提案</td>
            </tr>
            <tr>
              <td><strong>クラシル</strong></td>
              <td>¥480</td>
              <td>-</td>
              <td>レシピ動画</td>
              <td>人気ランキング、栄養表示、広告非表示</td>
            </tr>
          </tbody>
        </table>
        <div class="monetize-note">
          → 日本の料理アプリ市場では<strong>月額 ¥280〜500</strong>が一般的な価格帯
        </div>`
    },
    {
      title: '3. 推奨プラン：フリーミアム＋アフィリエイト',
      content: `
        <div class="monetize-plan">
          <div class="monetize-plan-header">無料プラン（現状の機能）</div>
          <ul>
            <li>買い物リストの作成・管理</li>
            <li>料理の登録・管理</li>
            <li>AI 具材検索（1日3回まで）</li>
            <li>AI レシピ提案（1日3回まで）</li>
            <li>みんなのレシピ閲覧・いいね</li>
          </ul>
        </div>
        <div class="monetize-plan">
          <div class="monetize-plan-header premium">プレミアムプラン（月額 ¥300）</div>
          <ul>
            <li>AI 具材検索・レシピ提案 <strong>無制限</strong></li>
            <li>栄養情報の表示（カロリー、たんぱく質等）</li>
            <li>週間こんだて自動生成</li>
            <li>買い物リストの共有（家族・パートナー）</li>
            <li>レシピのエクスポート（PDF / 画像）</li>
            <li>広告非表示</li>
          </ul>
        </div>
        <div class="monetize-plan">
          <div class="monetize-plan-header affiliate">アフィリエイト連携</div>
          <ul>
            <li>買い物リストから<strong>ネットスーパー</strong>へワンタップ注文</li>
            <li>提携候補：Amazon フレッシュ、楽天西友、Oisix、イオンネットスーパー</li>
            <li>紹介手数料 <strong>5〜15%</strong>（商品カテゴリによる）</li>
            <li>レシピ内の食材リンク → 購入ページへの導線</li>
          </ul>
        </div>`
    },
    {
      title: '4. 実装ロードマップ',
      content: `
        <table>
          <thead><tr><th>フェーズ</th><th>施策</th><th>目的</th><th>必要な作業</th></tr></thead>
          <tbody>
            <tr>
              <td><span class="badge badge-info">Phase 1</span></td>
              <td>AI 利用回数の制限導入</td>
              <td>無料/有料の差別化の土台</td>
              <td>API コール回数カウント、日次リセット</td>
            </tr>
            <tr>
              <td><span class="badge badge-info">Phase 2</span></td>
              <td>Stripe 決済導入</td>
              <td>サブスクリプション課金基盤</td>
              <td>Stripe Checkout、Webhook、ユーザー課金状態管理</td>
            </tr>
            <tr>
              <td><span class="badge badge-info">Phase 3</span></td>
              <td>プレミアム機能の開発</td>
              <td>有料プランの価値を提供</td>
              <td>栄養情報 API 連携、献立自動生成、PDF エクスポート</td>
            </tr>
            <tr>
              <td><span class="badge badge-info">Phase 4</span></td>
              <td>アフィリエイト連携</td>
              <td>追加収益源の確保</td>
              <td>ネットスーパー API 連携、アフィリエイトリンク生成</td>
            </tr>
            <tr>
              <td><span class="badge badge-info">Phase 5</span></td>
              <td>投げ銭・寄付の導入</td>
              <td>無料ユーザーからの支援</td>
              <td>Stripe の単発決済 or Buy Me a Coffee 導入</td>
            </tr>
          </tbody>
        </table>`
    },
    {
      title: '5. 収益シミュレーション',
      content: `
        <div class="monetize-note">前提：ユーザー数 1,000人時点の月間収益見込み</div>
        <table>
          <thead><tr><th>収益源</th><th>転換率</th><th>単価</th><th>月間収益</th></tr></thead>
          <tbody>
            <tr>
              <td>サブスクリプション</td>
              <td>5%（50人）</td>
              <td>¥300/月</td>
              <td><strong>¥15,000</strong></td>
            </tr>
            <tr>
              <td>アフィリエイト</td>
              <td>10%（100人が月1回購入）</td>
              <td>¥200/件</td>
              <td><strong>¥20,000</strong></td>
            </tr>
            <tr>
              <td>投げ銭</td>
              <td>1%（10人）</td>
              <td>¥500/月</td>
              <td><strong>¥5,000</strong></td>
            </tr>
            <tr style="background:#f0f9ff">
              <td colspan="3" style="text-align:right;font-weight:700">合計</td>
              <td><strong>¥40,000/月</strong></td>
            </tr>
          </tbody>
        </table>
        <div class="monetize-note">
          ※ ユーザー数 10,000人 なら <strong>¥400,000/月</strong>、AI API コスト（Gemini）は月 ¥5,000〜20,000 程度
        </div>`
    },
    {
      title: '6. 技術的な考慮事項',
      content: `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">
          <div class="info-section" style="margin:0">
            <div class="info-section-title">決済基盤</div>
            <div class="info-row"><span class="info-label">推奨</span><span class="info-value">Stripe</span></div>
            <div class="info-row"><span class="info-label">理由</span><span class="info-value">PWA 対応、日本円対応、Webhook が充実</span></div>
            <div class="info-row"><span class="info-label">手数料</span><span class="info-value">3.6%</span></div>
          </div>
          <div class="info-section" style="margin:0">
            <div class="info-section-title">注意点</div>
            <div class="info-row"><span class="info-label">Apple 税</span><span class="info-value">PWA なので App Store 手数料なし</span></div>
            <div class="info-row"><span class="info-label">特商法</span><span class="info-value">有料化時に特定商取引法の表記が必要</span></div>
            <div class="info-row"><span class="info-label">資金決済法</span><span class="info-value">ポイント制はライセンスが必要な場合あり</span></div>
          </div>
        </div>`
    },
  ];

  let html = `
    <div class="info-section" style="margin-bottom:20px">
      <div class="info-section-title">マネタイズ検討ドキュメント</div>
      <div style="color:#64748b;font-size:13px">
        お料理バスケット（PWA）の収益化戦略。2026年3月時点の分析。
      </div>
    </div>`;

  for (const s of sections) {
    html += `
      <div class="info-section monetize-section">
        <div class="info-section-title">${escapeHtml(s.title)}</div>
        ${s.content}
      </div>`;
  }

  area.innerHTML = html;
}

// ============================================================
// Native App Technical Investigation (ネイティブアプリ技術検討)
// ============================================================
function renderNativeApp() {
  const area = document.getElementById('content-area');

  const sections = [
    {
      title: '1. 現状の整理',
      content: `
        <table>
          <thead><tr><th>項目</th><th>現状</th></tr></thead>
          <tbody>
            <tr><td><strong>アプリ形態</strong></td><td>PWA（Progressive Web App）— Vanilla JS、モバイルファースト設計</td></tr>
            <tr><td><strong>manifest.json</strong></td><td>あり（standalone 表示、192/512px アイコン）</td></tr>
            <tr><td><strong>Service Worker</strong></td><td><span class="badge badge-warning">未実装</span> — オフライン対応・プッシュ通知は未対応</td></tr>
            <tr><td><strong>認証</strong></td><td>Magic Link (OTP) + JWT + Google Sign-In</td></tr>
            <tr><td><strong>バックエンド</strong></td><td>Node.js + Express + SQLite（単一サーバ）</td></tr>
            <tr><td><strong>AI 連携</strong></td><td>Gemini API（具材提案・レシピ生成）</td></tr>
          </tbody>
        </table>
      `
    },
    {
      title: '2. アプリ化の技術選択肢',
      content: `
        <table>
          <thead><tr><th>アプローチ</th><th>概要</th><th>開発コスト</th><th>iOS</th><th>Android</th><th>適合度</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>A. PWA のまま</strong></td>
              <td>現在のまま。ホーム画面追加で利用</td>
              <td><span class="badge badge-success">なし</span></td>
              <td>Safari から追加可能。プッシュ通知は iOS 16.4+ で対応</td>
              <td>Chrome から追加可能。フル機能</td>
              <td><span class="badge badge-success">★★★</span></td>
            </tr>
            <tr>
              <td><strong>B. Capacitor</strong></td>
              <td>既存 PWA を WebView でラップしてネイティブアプリ化</td>
              <td><span class="badge badge-success">低（数日）</span></td>
              <td>App Store 提出可能（ただし審査リスクあり）</td>
              <td>Play Store 提出可能</td>
              <td><span class="badge badge-success">★★★</span></td>
            </tr>
            <tr>
              <td><strong>C. TWA（Android のみ）</strong></td>
              <td>Trusted Web Activity で PWA を Play Store に公開</td>
              <td><span class="badge badge-success">低（1〜2日）</span></td>
              <td><span class="badge badge-neutral">非対応</span></td>
              <td>Play Store 提出可能。Chrome エンジンで描画</td>
              <td><span class="badge badge-warning">★★</span></td>
            </tr>
            <tr>
              <td><strong>D. React Native</strong></td>
              <td>JS/TS でネイティブ UI を構築。既存コード再利用は限定的</td>
              <td><span class="badge badge-warning">中〜高（数ヶ月）</span></td>
              <td>App Store 提出可能</td>
              <td>Play Store 提出可能</td>
              <td><span class="badge badge-warning">★★</span></td>
            </tr>
            <tr>
              <td><strong>E. Flutter</strong></td>
              <td>Dart でネイティブ UI を構築。既存コード再利用不可</td>
              <td><span class="badge badge-warning">高（数ヶ月）</span></td>
              <td>App Store 提出可能</td>
              <td>Play Store 提出可能</td>
              <td><span class="badge badge-neutral">★</span></td>
            </tr>
            <tr>
              <td><strong>F. Swift / Kotlin ネイティブ</strong></td>
              <td>各プラットフォーム専用開発</td>
              <td><span class="badge badge-warning">最高（各数ヶ月×2）</span></td>
              <td>App Store 提出可能</td>
              <td>Play Store 提出可能</td>
              <td><span class="badge badge-neutral">★</span></td>
            </tr>
          </tbody>
        </table>
      `
    },
    {
      title: '3. 各アプローチの詳細評価',
      content: `
        <div class="info-section">
          <div class="info-section-title">A. PWA のまま（現状維持 + 改善）</div>
          <p><strong>やること：</strong>Service Worker 追加（オフライン対応・プッシュ通知）</p>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・追加開発コストがほぼゼロ<br>
                  ・コードベースが1つのまま<br>
                  ・iOS 16.4+ でプッシュ通知対応済み<br>
                  ・ストア審査不要、即時デプロイ
                </td>
                <td>
                  ・App Store / Play Store に並ばない（発見性が低い）<br>
                  ・「アプリ」として認識されにくい<br>
                  ・iOS での一部制約（バックグラウンド同期など）
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">B. Capacitor（推奨）</div>
          <p><strong>やること：</strong>Capacitor CLI で iOS/Android プロジェクト生成 → 既存 web/ をバンドル</p>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・既存 Vanilla JS コードをそのまま利用<br>
                  ・ネイティブ API アクセス（プッシュ通知、カメラ等）<br>
                  ・1つのコードベースで Web + iOS + Android<br>
                  ・Web 開発者のスキルセットで対応可能<br>
                  ・導入は数時間〜数日
                </td>
                <td>
                  ・Apple ガイドライン 4.2「リパッケージ Web サイト」として審査リジェクトのリスク<br>
                  ・ネイティブの操作感（遷移アニメーション等）は劣る<br>
                  ・Xcode / Android Studio のセットアップが必要
                </td>
              </tr>
            </tbody>
          </table>
          <p><strong>Apple 審査対策：</strong>ネイティブ機能（プッシュ通知、ショートカット、ウィジェット等）を追加して「Web サイトのラップ以上」であることを示す</p>
        </div>

        <div class="info-section">
          <div class="info-section-title">C. TWA（Trusted Web Activity）— Android 限定</div>
          <p><strong>やること：</strong>Bubblewrap / PWABuilder で TWA パッケージ生成</p>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・コード変更ゼロで Play Store 公開<br>
                  ・Chrome エンジンで PWA そのままの体験<br>
                  ・導入最速（1〜2日）
                </td>
                <td>
                  ・Android 専用（iOS は非対応）<br>
                  ・ネイティブ API アクセスは限定的<br>
                  ・Chrome がインストールされていない場合は WebView にフォールバック
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">D〜F. フルネイティブ系（React Native / Flutter / Swift・Kotlin）</div>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・完全なネイティブ UI/UX<br>
                  ・パフォーマンス最高<br>
                  ・App Store 審査に強い
                </td>
                <td>
                  ・既存コード再利用がほぼ不可（API 層のみ共通）<br>
                  ・開発期間: 3〜6ヶ月（小規模チーム）<br>
                  ・新しい言語/フレームワーク学習が必要（Flutter→Dart）<br>
                  ・メンテナンスコストが Web + モバイルで倍増
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `
    },
    {
      title: '4. コスト比較',
      content: `
        <table>
          <thead><tr><th>項目</th><th>PWA</th><th>Capacitor</th><th>TWA</th><th>React Native</th><th>Flutter</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>初期開発</strong></td>
              <td>0円</td>
              <td>数万円分の工数</td>
              <td>数万円分の工数</td>
              <td>数十万〜数百万円</td>
              <td>数十万〜数百万円</td>
            </tr>
            <tr>
              <td><strong>Apple Developer 年会費</strong></td>
              <td>不要</td>
              <td>$99/年（約15,000円）</td>
              <td>不要</td>
              <td>$99/年</td>
              <td>$99/年</td>
            </tr>
            <tr>
              <td><strong>Google Play 登録料</strong></td>
              <td>不要</td>
              <td>$25（一回のみ）</td>
              <td>$25（一回のみ）</td>
              <td>$25</td>
              <td>$25</td>
            </tr>
            <tr>
              <td><strong>ストア手数料</strong></td>
              <td>なし</td>
              <td>15〜30%</td>
              <td>15〜30%</td>
              <td>15〜30%</td>
              <td>15〜30%</td>
            </tr>
            <tr>
              <td><strong>継続メンテナンス</strong></td>
              <td>低</td>
              <td>低〜中</td>
              <td>低</td>
              <td>中〜高</td>
              <td>中〜高</td>
            </tr>
            <tr>
              <td><strong>学習コスト</strong></td>
              <td>なし</td>
              <td>低（Capacitor CLI）</td>
              <td>低（Bubblewrap）</td>
              <td>中（React Native）</td>
              <td>高（Dart 言語）</td>
            </tr>
          </tbody>
        </table>
        <p style="margin-top:12px;font-size:13px;color:#64748b;">※ ストア手数料は年間収益 $1M 以下の場合、Apple/Google ともに 15% の小規模事業者プログラムあり</p>
      `
    },
    {
      title: '5. 推奨アプローチ',
      content: `
        <div class="info-section" style="border-left: 4px solid #007aff;">
          <div class="info-section-title" style="color: #007aff;">推奨: 段階的アプローチ（Phase 1 → 2 → 3）</div>

          <div style="margin-bottom:16px;">
            <strong>Phase 1: PWA 強化（今すぐ）</strong>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li>Service Worker 追加（オフラインキャッシュ）</li>
              <li>Web Push 通知の実装</li>
              <li>インストールバナー（beforeinstallprompt）の改善</li>
              <li>コスト: <span class="badge badge-success">ゼロ</span>　期間: <span class="badge badge-info">1〜2週間</span></li>
            </ul>
          </div>

          <div style="margin-bottom:16px;">
            <strong>Phase 2: Android アプリ — TWA で Play Store 公開</strong>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li>Bubblewrap / PWABuilder で TWA パッケージ作成</li>
              <li>Digital Asset Links 設定</li>
              <li>Play Store に公開（発見性アップ）</li>
              <li>コスト: <span class="badge badge-success">$25（一回）</span>　期間: <span class="badge badge-info">1〜2日</span></li>
            </ul>
          </div>

          <div style="margin-bottom:16px;">
            <strong>Phase 3: iOS アプリ — Capacitor でラップ</strong>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li>Capacitor で iOS プロジェクト生成</li>
              <li>ネイティブ機能追加（プッシュ通知、ショートカット等）で Apple 審査対策</li>
              <li>App Store に公開</li>
              <li>コスト: <span class="badge badge-warning">$99/年</span>　期間: <span class="badge badge-info">1〜2週間</span></li>
            </ul>
          </div>
        </div>

        <div class="info-section">
          <div class="info-section-title">この推奨の理由</div>
          <table>
            <thead><tr><th>観点</th><th>説明</th></tr></thead>
            <tbody>
              <tr><td><strong>コスト最小</strong></td><td>既存コードベースを最大限活用。React Native/Flutter のようなフルリライト不要</td></tr>
              <tr><td><strong>リスク分散</strong></td><td>段階的に進めるため、各フェーズで判断・方向転換が可能</td></tr>
              <tr><td><strong>スキルセット</strong></td><td>Web 開発スキル（HTML/CSS/JS）のみで対応可能</td></tr>
              <tr><td><strong>メンテナンス</strong></td><td>コードベースは基本的に1つ。Web / Android / iOS で共有</td></tr>
              <tr><td><strong>ユーザー体験</strong></td><td>本アプリはデータ表示・リスト操作が中心であり、WebView で十分なパフォーマンス</td></tr>
            </tbody>
          </table>
        </div>
      `
    },
    {
      title: '6. Apple App Store 審査の注意点',
      content: `
        <div class="info-section">
          <div class="info-section-title">ガイドライン 4.2 — リパッケージ Web サイトの禁止</div>
          <p>Apple は「Web サイトを単にラップしただけのアプリ」をリジェクトする方針。Capacitor で提出する場合は以下の対策が必要：</p>
          <table>
            <thead><tr><th>対策</th><th>詳細</th><th>難易度</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>プッシュ通知</strong></td>
                <td>APNs 連携で買い物リマインダーや共有通知を実装</td>
                <td><span class="badge badge-success">低</span></td>
              </tr>
              <tr>
                <td><strong>Siri ショートカット</strong></td>
                <td>「今日の買い物リスト」を Siri で確認</td>
                <td><span class="badge badge-warning">中</span></td>
              </tr>
              <tr>
                <td><strong>ウィジェット</strong></td>
                <td>ホーム画面に買い物リストの概要を表示</td>
                <td><span class="badge badge-warning">中</span></td>
              </tr>
              <tr>
                <td><strong>App Clip / Spotlight</strong></td>
                <td>ディープリンクで特定の料理や買い物リストに直接アクセス</td>
                <td><span class="badge badge-warning">中</span></td>
              </tr>
              <tr>
                <td><strong>ネイティブ設定画面</strong></td>
                <td>iOS の Settings.app に設定項目を追加</td>
                <td><span class="badge badge-success">低</span></td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top:12px;font-size:13px;color:#64748b;">※ 最低でもプッシュ通知 + もう1つのネイティブ機能を実装することで審査通過率が上がる</p>
        </div>
      `
    },
    {
      title: '7. 必要な開発環境・ツール',
      content: `
        <table>
          <thead><tr><th>ツール</th><th>用途</th><th>備考</th></tr></thead>
          <tbody>
            <tr><td><strong>Xcode</strong></td><td>iOS ビルド・シミュレータ</td><td>macOS 必須。App Store 提出に必要</td></tr>
            <tr><td><strong>Android Studio</strong></td><td>Android ビルド・エミュレータ</td><td>Windows/Mac/Linux 対応</td></tr>
            <tr><td><strong>Capacitor CLI</strong></td><td>iOS/Android プロジェクト管理</td><td><code>npm install @capacitor/core @capacitor/cli</code></td></tr>
            <tr><td><strong>Bubblewrap</strong></td><td>TWA パッケージ生成</td><td><code>npm install -g @nicolo-ribaudo/pwabuilder-cli</code></td></tr>
            <tr><td><strong>Apple Developer Account</strong></td><td>App Store 提出</td><td>$99/年</td></tr>
            <tr><td><strong>Google Play Console</strong></td><td>Play Store 提出</td><td>$25（一回）</td></tr>
          </tbody>
        </table>
      `
    },
    {
      title: '8. 参考リンク',
      content: `
        <table>
          <thead><tr><th>リソース</th><th>URL</th></tr></thead>
          <tbody>
            <tr><td>Capacitor 公式ドキュメント</td><td><a href="https://capacitorjs.com/docs" target="_blank">capacitorjs.com/docs</a></td></tr>
            <tr><td>PWA → Native (Capacitor)</td><td><a href="https://capgo.app/blog/transform-pwa-to-native-app-with-capacitor/" target="_blank">capgo.app/blog/transform-pwa-to-native-app-with-capacitor</a></td></tr>
            <tr><td>TWA 公式ガイド</td><td><a href="https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities" target="_blank">developer.android.com TWA</a></td></tr>
            <tr><td>PWA vs Native 比較表 (2026)</td><td><a href="https://progressier.com/pwa-vs-native-app-comparison-table" target="_blank">progressier.com/pwa-vs-native-app-comparison-table</a></td></tr>
            <tr><td>Apple App Store ストア提出ガイド</td><td><a href="https://www.mobiloud.com/blog/publishing-pwa-app-store" target="_blank">mobiloud.com - Publishing PWA to App Store</a></td></tr>
            <tr><td>Capacitor vs React Native 比較</td><td><a href="https://nextnative.dev/blog/capacitor-vs-react-native" target="_blank">nextnative.dev/blog/capacitor-vs-react-native</a></td></tr>
          </tbody>
        </table>
      `
    }
  ];

  let html = '<a href="#docs" class="back-link">&larr; ドキュメント一覧</a>';
  html += '<div class="info-section-title" style="font-size:18px;margin-bottom:20px;">ネイティブアプリ技術検討（2026-03）</div>';
  for (const s of sections) {
    html += `<div class="info-section"><div class="info-section-title">${s.title}</div>${s.content}</div>`;
  }
  area.innerHTML = html;
}

// ============================================================
// Remote Dev Environment Investigation (リモート開発環境検討)
// ============================================================
function renderRemoteDev() {
  const area = document.getElementById('content-area');

  const sections = [
    {
      title: '1. やりたいこと',
      content: `
        <div class="info-section">
          <table>
            <thead><tr><th>項目</th><th>内容</th></tr></thead>
            <tbody>
              <tr><td><strong>目的</strong></td><td>自宅 WSL2 上の Claude Code（VSCode Terminal）を、外出先からスマホで操作したい</td></tr>
              <tr><td><strong>開発環境</strong></td><td>Windows + WSL2（Ubuntu）+ VSCode + Claude Code CLI</td></tr>
              <tr><td><strong>クライアント</strong></td><td>iPhone / Android スマホ（Wi-Fi / モバイル回線）</td></tr>
              <tr><td><strong>要件</strong></td><td>セッション維持（途中で切れても再接続可能）、セキュア、低コスト</td></tr>
            </tbody>
          </table>
        </div>
      `
    },
    {
      title: '2. 技術選択肢の比較',
      content: `
        <table>
          <thead><tr><th>アプローチ</th><th>概要</th><th>コスト</th><th>難易度</th><th>スマホ対応</th><th>適合度</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>A. Claude Code Remote Control</strong></td>
              <td>公式機能。ローカル CLI セッションをスマホの Claude アプリ/Web から操作</td>
              <td><span class="badge badge-warning">Max プラン必要</span></td>
              <td><span class="badge badge-success">低</span></td>
              <td>Claude アプリ / ブラウザ</td>
              <td><span class="badge badge-success">★★★</span></td>
            </tr>
            <tr>
              <td><strong>B. VS Code Tunnel</strong></td>
              <td>Microsoft 公式。WSL2 から vscode.dev にトンネル接続</td>
              <td><span class="badge badge-success">無料</span></td>
              <td><span class="badge badge-success">低</span></td>
              <td>ブラウザ (vscode.dev)</td>
              <td><span class="badge badge-success">★★★</span></td>
            </tr>
            <tr>
              <td><strong>C. Tailscale + SSH + tmux</strong></td>
              <td>VPN メッシュで WSL2 に直接 SSH。tmux でセッション維持</td>
              <td><span class="badge badge-success">無料（個人利用）</span></td>
              <td><span class="badge badge-warning">中</span></td>
              <td>Termius / Blink 等の SSH アプリ</td>
              <td><span class="badge badge-success">★★★</span></td>
            </tr>
            <tr>
              <td><strong>D. Cloudflare Tunnel + SSH</strong></td>
              <td>Cloudflare Zero Trust 経由で SSH。ブラウザ SSH も可</td>
              <td><span class="badge badge-success">無料</span></td>
              <td><span class="badge badge-warning">中</span></td>
              <td>ブラウザ / SSH アプリ</td>
              <td><span class="badge badge-warning">★★</span></td>
            </tr>
            <tr>
              <td><strong>E. code-server</strong></td>
              <td>VSCode をセルフホスト。ブラウザでフル IDE アクセス</td>
              <td><span class="badge badge-success">無料</span></td>
              <td><span class="badge badge-warning">中</span></td>
              <td>ブラウザ（フル VSCode UI）</td>
              <td><span class="badge badge-warning">★★</span></td>
            </tr>
            <tr>
              <td><strong>F. ポート転送 + DDNS</strong></td>
              <td>ルーターのポート転送 + DDNS でグローバル公開</td>
              <td><span class="badge badge-success">無料</span></td>
              <td><span class="badge badge-warning">高</span></td>
              <td>SSH アプリ</td>
              <td><span class="badge badge-neutral">★</span></td>
            </tr>
          </tbody>
        </table>
      `
    },
    {
      title: '3. 各アプローチの詳細',
      content: `
        <div class="info-section" style="border-left: 4px solid #007aff;">
          <div class="info-section-title" style="color: #007aff;">A. Claude Code Remote Control（公式機能・2026年2月リリース）</div>
          <p>Anthropic 公式のリモート操作機能。ローカル CLI セッションをスマホから直接操作。</p>
          <table>
            <thead><tr><th>項目</th><th>内容</th></tr></thead>
            <tbody>
              <tr><td><strong>仕組み</strong></td><td>CLI でセッション URL + QR コードが表示される → スマホでスキャンして接続</td></tr>
              <tr><td><strong>セットアップ</strong></td><td><code>/mobile</code> コマンドで設定。「Enable Remote Control for all sessions」を有効化</td></tr>
              <tr><td><strong>できること</strong></td><td>リアルタイムで進捗確認、ファイル変更の承認/拒否、追加指示、複数セッション管理</td></tr>
              <tr><td><strong>制約</strong></td><td>Claude Max プラン（$100〜/月）が必要。コードはローカルに残る（クラウド実行ではない）</td></tr>
            </tbody>
          </table>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・公式サポート、セットアップが最も簡単<br>
                  ・Claude Code に最適化された UI<br>
                  ・ファイル変更の承認/拒否が可能<br>
                  ・コードがローカルから離れない
                </td>
                <td>
                  ・Max プラン（$100〜/月）が必要<br>
                  ・Claude Code 以外のターミナル操作は不可<br>
                  ・Research Preview 段階
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">B. VS Code Tunnel（Microsoft 公式）</div>
          <p>WSL2 内の VS Code Server からトンネルを張り、スマホブラウザで vscode.dev にアクセス。</p>
          <table>
            <thead><tr><th>項目</th><th>内容</th></tr></thead>
            <tbody>
              <tr><td><strong>仕組み</strong></td><td>WSL2 で <code>code tunnel</code> を実行 → Microsoft dev tunnel 経由で vscode.dev に接続</td></tr>
              <tr><td><strong>セットアップ</strong></td><td>① WSL2 で <code>code tunnel</code> 実行<br>② GitHub アカウントで認証<br>③ スマホで <code>vscode.dev/tunnel/&lt;名前&gt;</code> を開く</td></tr>
              <tr><td><strong>できること</strong></td><td>フル VSCode UI（エディタ、ターミナル、拡張機能）をブラウザで利用</td></tr>
              <tr><td><strong>制約</strong></td><td>GitHub アカウント必要。トンネル数・転送量に制限あり</td></tr>
            </tbody>
          </table>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・無料、セットアップ簡単<br>
                  ・フル VSCode UI（ターミナル含む）<br>
                  ・Microsoft 公式で安定<br>
                  ・ポート転送不要
                </td>
                <td>
                  ・Microsoft インフラに依存<br>
                  ・スマホでの VSCode UI はやや使いにくい<br>
                  ・Claude Code CLI のインタラクティブ操作は制限的
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">C. Tailscale + SSH + tmux</div>
          <p>Tailscale VPN で WSL2 に直接 SSH 接続。tmux でセッション維持。</p>
          <table>
            <thead><tr><th>項目</th><th>内容</th></tr></thead>
            <tbody>
              <tr><td><strong>仕組み</strong></td><td>Tailscale が WireGuard ベースの P2P VPN を構築 → SSH で WSL2 に接続 → tmux でセッション永続化</td></tr>
              <tr><td><strong>セットアップ</strong></td><td>① Windows に Tailscale インストール<br>② WSL2 に SSH サーバ + tmux 設定<br>③ スマホに Tailscale + Termius インストール</td></tr>
              <tr><td><strong>無料枠</strong></td><td>個人利用: 3 ユーザー、100 デバイスまで無料</td></tr>
              <tr><td><strong>接続安定性</strong></td><td>Mosh 併用で Wi-Fi ↔ モバイル回線の切り替えにも耐える</td></tr>
            </tbody>
          </table>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・無料（個人利用）<br>
                  ・tmux でセッション永続化（切断しても復帰可能）<br>
                  ・P2P 接続で低遅延<br>
                  ・フルターミナルアクセス（Claude Code をそのまま操作）<br>
                  ・約20分でセットアップ完了
                </td>
                <td>
                  ・SSH アプリでの操作感はターミナルそのもの（IDE 機能なし）<br>
                  ・スマホでの長文タイピングは不便<br>
                  ・WSL2 の SSH 設定にやや手間がかかる
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">D. Cloudflare Tunnel + SSH</div>
          <p>Cloudflare Zero Trust 経由で SSH。ブラウザベースの SSH アクセスも可能。</p>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・無料プランあり<br>
                  ・ブラウザから SSH 可能（アプリ不要）<br>
                  ・Zero Trust 認証でセキュア<br>
                  ・独自ドメイン連携
                </td>
                <td>
                  ・設定が Tailscale より複雑<br>
                  ・cloudflared のインストール・設定が必要<br>
                  ・Cloudflare インフラ経由のため P2P より遅延あり
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">E. code-server（セルフホスト VSCode）</div>
          <p>Coder 社の OSS。VSCode をブラウザで完全に動かす。</p>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・フル VSCode UI をブラウザで利用<br>
                  ・完全セルフホスト（外部サービス不要）<br>
                  ・拡張機能もほぼすべて使える
                </td>
                <td>
                  ・外部アクセスには Tailscale / Cloudflare Tunnel 等が別途必要<br>
                  ・VS Code Tunnel より設定が複雑<br>
                  ・スマホでの VSCode UI は使いにくい
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">F. ポート転送 + DDNS（非推奨）</div>
          <table>
            <thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
            <tbody>
              <tr>
                <td>
                  ・外部サービスに依存しない<br>
                  ・追加コストなし
                </td>
                <td>
                  ・セキュリティリスクが高い（ポートがグローバルに公開）<br>
                  ・ルーター設定が必要（ISP によっては不可）<br>
                  ・動的 IP の場合 DDNS 設定が必要<br>
                  ・WSL2 のネットワークは Windows と共有で設定が複雑
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `
    },
    {
      title: '4. 推奨アプローチ',
      content: `
        <div class="info-section" style="border-left: 4px solid #007aff;">
          <div class="info-section-title" style="color: #007aff;">推奨: B + C の組み合わせ（VS Code Tunnel + Tailscale/SSH/tmux）</div>

          <div style="margin-bottom:16px;">
            <strong>メイン: VS Code Tunnel（ブラウザで VSCode を使いたい場合）</strong>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li>WSL2 で <code>code tunnel</code> を実行するだけ</li>
              <li>スマホのブラウザで vscode.dev にアクセス</li>
              <li>エディタ + ターミナルをフルに利用可能</li>
              <li>コスト: <span class="badge badge-success">無料</span>　セットアップ: <span class="badge badge-info">5分</span></li>
            </ul>
          </div>

          <div style="margin-bottom:16px;">
            <strong>サブ: Tailscale + SSH + tmux（ターミナル直接操作したい場合）</strong>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li>Claude Code CLI をそのまま操作可能</li>
              <li>tmux でセッション永続化（電車内で切断されても復帰可能）</li>
              <li>Termius（iOS/Android）で快適な SSH 操作</li>
              <li>コスト: <span class="badge badge-success">無料</span>　セットアップ: <span class="badge badge-info">20分</span></li>
            </ul>
          </div>

          <div style="margin-bottom:16px;">
            <strong>将来: Claude Code Remote Control（公式機能が安定したら）</strong>
            <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
              <li>Claude Code に最適化された UI で最も快適</li>
              <li>ただし Max プラン（$100〜/月）が必要</li>
              <li>Pro プラン対応を待つのも選択肢</li>
              <li>コスト: <span class="badge badge-warning">$100〜/月</span></li>
            </ul>
          </div>
        </div>

        <div class="info-section">
          <div class="info-section-title">推奨の理由</div>
          <table>
            <thead><tr><th>観点</th><th>説明</th></tr></thead>
            <tbody>
              <tr><td><strong>コスト</strong></td><td>VS Code Tunnel も Tailscale も無料。追加費用ゼロで始められる</td></tr>
              <tr><td><strong>用途の使い分け</strong></td><td>コード編集 → VS Code Tunnel、Claude Code 操作 → SSH + tmux</td></tr>
              <tr><td><strong>セッション永続性</strong></td><td>tmux により回線切断してもセッションが維持される</td></tr>
              <tr><td><strong>セキュリティ</strong></td><td>ポート転送不要。Tailscale は WireGuard ベースで暗号化</td></tr>
              <tr><td><strong>導入の容易さ</strong></td><td>VS Code Tunnel は 5 分、Tailscale は 20 分で完了</td></tr>
            </tbody>
          </table>
        </div>
      `
    },
    {
      title: '5. セットアップ手順',
      content: `
        <div class="info-section">
          <div class="info-section-title">VS Code Tunnel セットアップ</div>
          <table>
            <thead><tr><th>ステップ</th><th>コマンド / 操作</th></tr></thead>
            <tbody>
              <tr><td><strong>1. WSL2 でトンネル起動</strong></td><td><code>code tunnel</code></td></tr>
              <tr><td><strong>2. GitHub 認証</strong></td><td>表示される URL を開いてコードを入力</td></tr>
              <tr><td><strong>3. スマホからアクセス</strong></td><td>ブラウザで <code>https://vscode.dev/tunnel/&lt;マシン名&gt;</code> を開く</td></tr>
              <tr><td><strong>4. 常時起動（任意）</strong></td><td><code>code tunnel service install</code> で systemd サービス化</td></tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">Tailscale + SSH + tmux セットアップ</div>
          <table>
            <thead><tr><th>ステップ</th><th>コマンド / 操作</th></tr></thead>
            <tbody>
              <tr><td><strong>1. Windows に Tailscale</strong></td><td><a href="https://tailscale.com/download/windows" target="_blank">tailscale.com</a> からインストール</td></tr>
              <tr><td><strong>2. WSL2 に SSH サーバ</strong></td><td><code>sudo apt install openssh-server</code><br><code>sudo service ssh start</code></td></tr>
              <tr><td><strong>3. WSL2 に tmux</strong></td><td><code>sudo apt install tmux</code></td></tr>
              <tr><td><strong>4. スマホに Tailscale</strong></td><td>App Store / Play Store から Tailscale インストール</td></tr>
              <tr><td><strong>5. スマホに SSH アプリ</strong></td><td>Termius（iOS/Android 対応・無料）を推奨</td></tr>
              <tr><td><strong>6. 接続テスト</strong></td><td>Termius で Tailscale IP に SSH → <code>tmux new -s dev</code></td></tr>
              <tr><td><strong>7. 再接続</strong></td><td><code>tmux attach -t dev</code> でセッション復帰</td></tr>
            </tbody>
          </table>
        </div>

        <div class="info-section">
          <div class="info-section-title">Claude Code Remote Control セットアップ</div>
          <table>
            <thead><tr><th>ステップ</th><th>コマンド / 操作</th></tr></thead>
            <tbody>
              <tr><td><strong>1. 有効化</strong></td><td>Claude Code CLI で <code>/mobile</code> を実行</td></tr>
              <tr><td><strong>2. 設定</strong></td><td>「Enable Remote Control for all sessions」を有効化</td></tr>
              <tr><td><strong>3. スマホ接続</strong></td><td>表示される QR コードをスキャン → Claude アプリ or ブラウザで操作</td></tr>
            </tbody>
          </table>
          <p style="margin-top:8px;font-size:13px;color:#64748b;">※ Claude Max プラン（$100〜/月）が必要</p>
        </div>
      `
    },
    {
      title: '6. スマホ操作の実用 Tips',
      content: `
        <div class="info-section">
          <table>
            <thead><tr><th>Tips</th><th>詳細</th></tr></thead>
            <tbody>
              <tr><td><strong>tmux のキーバインド</strong></td><td>Ctrl+B はスマホキーボードで押しにくい。<code>set -g prefix C-a</code> に変更推奨</td></tr>
              <tr><td><strong>Mosh の導入</strong></td><td>SSH より接続が安定。Wi-Fi ↔ モバイル回線の切り替えに強い: <code>sudo apt install mosh</code></td></tr>
              <tr><td><strong>Claude Code の使い方</strong></td><td>長い指示は事前にメモアプリで書いてペースト。<code>claude -p "指示"</code> の非対話モードも活用</td></tr>
              <tr><td><strong>外部キーボード</strong></td><td>Bluetooth キーボードがあると生産性が大幅にアップ</td></tr>
              <tr><td><strong>ホーム画面に追加</strong></td><td>vscode.dev のトンネル URL を iOS/Android のホーム画面に追加してワンタップアクセス</td></tr>
            </tbody>
          </table>
        </div>
      `
    },
    {
      title: '7. 参考リンク',
      content: `
        <table>
          <thead><tr><th>リソース</th><th>URL</th></tr></thead>
          <tbody>
            <tr><td>Claude Code Remote Control 公式</td><td><a href="https://code.claude.com/docs/en/remote-control" target="_blank">code.claude.com/docs/en/remote-control</a></td></tr>
            <tr><td>VS Code Tunnel 公式ドキュメント</td><td><a href="https://code.visualstudio.com/docs/remote/tunnels" target="_blank">code.visualstudio.com/docs/remote/tunnels</a></td></tr>
            <tr><td>Tailscale + WSL2 + VSCode</td><td><a href="https://www.hanselman.com/blog/using-tailscale-on-windows-to-network-more-easily-with-wsl2-and-visual-studio-code" target="_blank">hanselman.com - Tailscale WSL2</a></td></tr>
            <tr><td>SSH + tmux で Claude Code (iPhone)</td><td><a href="https://dev.to/shimo4228/running-claude-code-from-iphone-via-ssh-tmux-4c10" target="_blank">dev.to - Running Claude Code from iPhone</a></td></tr>
            <tr><td>Cloudflare Tunnel SSH</td><td><a href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/ssh/" target="_blank">developers.cloudflare.com - SSH Tunnel</a></td></tr>
            <tr><td>Tailscale 無料プラン</td><td><a href="https://tailscale.com/pricing" target="_blank">tailscale.com/pricing</a></td></tr>
          </tbody>
        </table>
      `
    }
  ];

  let html = '<a href="#docs" class="back-link">&larr; ドキュメント一覧</a>';
  html += '<div class="info-section-title" style="font-size:18px;margin-bottom:20px;">リモート開発環境検討 — スマホから WSL2 + Claude Code を操作（2026-03）</div>';
  for (const s of sections) {
    html += `<div class="info-section"><div class="info-section-title">${s.title}</div>${s.content}</div>`;
  }
  area.innerHTML = html;
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
