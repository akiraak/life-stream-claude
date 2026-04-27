// ============================================================
// Config & Helpers
// ============================================================
const API = '/api/admin';

async function api(method, url, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const opts = { method, headers, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) {
    location.href = '/cdn-cgi/access/logout?returnTo=' + encodeURIComponent('/admin/');
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
            if (a.visible && !a.visible(row)) return;
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
                  if (a.visible && !a.visible(row)) return;
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
  shopping:           { title: '買い物食材',   render: renderShopping },
  'purchase-history': { title: '購入履歴',         render: renderPurchaseHistory },
  'ai-quota':         { title: 'AI 利用状況',      render: renderAiQuota },
  system:             { title: 'システム情報',     render: renderSystem },
  logs:               { title: 'ログ',             render: renderLogs },
};

// ============================================================
// Router
// ============================================================
let activeCleanup = null;
function registerPageCleanup(fn) { activeCleanup = fn; }

const Router = {
  currentPage: null,
  init() {
    window.addEventListener('hashchange', () => this.navigate());
    this.navigate();
  },
  navigate() {
    if (activeCleanup) {
      try { activeCleanup(); } catch (_) { /* ignore */ }
      activeCleanup = null;
    }

    const hash = location.hash.slice(1) || 'dashboard';
    this.currentPage = hash;

    const page = Pages[hash];
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === hash);
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
        <div class="stat-label">買い物食材</div>
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
      { key: 'shopping_count', label: '食材数', width: '90px' },
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
      { key: 'item_name', label: '食材名' },
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
// AI Quota
// ============================================================
async function renderAiQuota() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading-text">読み込み中...</div>';

  const res = await api('GET', `${API}/ai-quota`);
  if (!res.success) return;
  const { today, todaySummary, daily, recent, limits } = res.data;

  const dailyRows = daily.map(r => `
    <tr>
      <td>${escapeHtml(r.date)}${r.date === today ? ' <span class="badge badge-success">今日</span>' : ''}</td>
      <td style="text-align:right">${r.total_calls}</td>
      <td style="text-align:right">${r.user_calls} (${r.user_keys}人)</td>
      <td style="text-align:right">${r.guest_calls} (${r.guest_keys}台)</td>
    </tr>
  `).join('');

  const limitUser = limits?.user ?? 0;
  const limitGuest = limits?.guest ?? 0;

  area.innerHTML = `
    <div class="info-section" style="margin-bottom:16px">
      <div class="info-section-title">1 日あたりの AI 呼出上限</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:end">
        <div>
          <label style="display:block;font-size:12px;color:#64748b;margin-bottom:4px">ログインユーザー / 日</label>
          <input type="number" id="ai-limit-user" min="0" max="100000" step="1" value="${limitUser}" class="search-input" style="width:100%">
        </div>
        <div>
          <label style="display:block;font-size:12px;color:#64748b;margin-bottom:4px">ゲスト / 日</label>
          <input type="number" id="ai-limit-guest" min="0" max="100000" step="1" value="${limitGuest}" class="search-input" style="width:100%">
        </div>
        <div>
          <button class="btn btn-primary" id="ai-limit-save">保存</button>
        </div>
      </div>
      <div id="ai-limit-warn" style="margin-top:8px;font-size:12px;color:#94a3b8"></div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">今日の呼出数 (${escapeHtml(today)} JST)</div>
        <div class="stat-value">${todaySummary.total_calls}</div>
        <div class="stat-sub">ユニーク ${todaySummary.unique_keys} キー</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日のログイン利用</div>
        <div class="stat-value">${todaySummary.user_calls}</div>
        <div class="stat-sub">${todaySummary.user_keys} ユーザー / 上限 ${limitUser} per user</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日のゲスト利用</div>
        <div class="stat-value">${todaySummary.guest_calls}</div>
        <div class="stat-sub">${todaySummary.guest_keys} 端末 / 上限 ${limitGuest} per device</div>
      </div>
    </div>

    <div class="info-section" style="margin-top:16px">
      <div class="info-section-title">今日の消化数をリセット</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-danger" id="ai-quota-reset-user">ログインユーザー分をリセット</button>
        <button class="btn btn-danger" id="ai-quota-reset-guest">ゲスト分をリセット</button>
        <button class="btn btn-danger" id="ai-quota-reset-all">すべてリセット</button>
      </div>
      <div style="margin-top:8px;font-size:12px;color:#94a3b8">今日 (${escapeHtml(today)} JST) の消化カウンタを 0 に戻します。過去日には影響しません。</div>
    </div>

    <div class="info-section" style="margin-top:16px">
      <div class="info-section-title">日次推移（直近14日）</div>
      <table class="data-table" style="width:100%">
        <thead>
          <tr>
            <th>日付 (JST)</th>
            <th style="text-align:right">合計</th>
            <th style="text-align:right">ログイン</th>
            <th style="text-align:right">ゲスト</th>
          </tr>
        </thead>
        <tbody>${dailyRows || '<tr><td colspan="4">データなし</td></tr>'}</tbody>
      </table>
    </div>

    <div style="margin-top:16px">
      <button class="btn btn-primary" onclick="renderAiQuota()">更新</button>
    </div>
  `;

  // 上限編集の挙動
  const userInput = document.getElementById('ai-limit-user');
  const guestInput = document.getElementById('ai-limit-guest');
  const warnEl = document.getElementById('ai-limit-warn');
  const updateWarn = () => {
    const u = Number(userInput.value);
    const g = Number(guestInput.value);
    if (u === 0 || g === 0) {
      warnEl.style.color = '#dc2626';
      warnEl.textContent = '※ 0 は AI 機能を実質停止します';
    } else {
      warnEl.style.color = '#94a3b8';
      warnEl.textContent = '';
    }
  };
  userInput.addEventListener('input', updateWarn);
  guestInput.addEventListener('input', updateWarn);
  updateWarn();

  document.getElementById('ai-limit-save').addEventListener('click', async () => {
    const user = Number(userInput.value);
    const guest = Number(guestInput.value);
    if (!Number.isInteger(user) || !Number.isInteger(guest) || user < 0 || guest < 0) {
      showToast('0 以上の整数を指定してください', 'error');
      return;
    }
    const r = await api('PUT', `${API}/ai-limits`, { user, guest });
    if (r.success) {
      showToast('保存しました');
      renderAiQuota();
    } else {
      showToast('保存に失敗しました', 'error');
    }
  });

  // 消化数リセットの挙動
  async function resetAiQuota(scope, options = {}) {
    const body = { scope, ...options };
    const r = await api('POST', `${API}/ai-quota/reset`, body);
    if (r.success) {
      showToast(`${r.data.deleted} 件リセットしました`);
      renderAiQuota();
    } else {
      showToast('リセットに失敗しました', 'error');
    }
  }

  document.getElementById('ai-quota-reset-user').addEventListener('click', () => {
    if (!confirm('ログインユーザーの今日の AI 呼び出し回数を 0 に戻します。よろしいですか？')) return;
    resetAiQuota('user');
  });
  document.getElementById('ai-quota-reset-guest').addEventListener('click', () => {
    if (!confirm('ゲストの今日の AI 呼び出し回数を 0 に戻します。よろしいですか？')) return;
    resetAiQuota('guest');
  });
  document.getElementById('ai-quota-reset-all').addEventListener('click', () => {
    if (!confirm('今日の AI 呼び出し回数 (ログイン + ゲスト) をすべて 0 に戻します。よろしいですか？')) return;
    resetAiQuota('all');
  });

  // キー単位の直近利用
  const recentArea = document.createElement('div');
  recentArea.className = 'info-section';
  recentArea.style.marginTop = '16px';
  area.appendChild(recentArea);

  renderDataTable(recentArea, {
    columns: [
      { key: 'date', label: '日付', width: '120px' },
      { key: 'type', label: '種別', width: '90px', render: r =>
        r.key.startsWith('user:')
          ? '<span class="badge badge-success">ユーザー</span>'
          : '<span class="badge badge-warning">ゲスト</span>'
      },
      { key: 'identifier', label: '識別子', render: r => {
        if (r.key.startsWith('user:')) {
          return r.email ? escapeHtml(r.email) : `<span class="badge badge-neutral">削除済</span> ${escapeHtml(r.key)}`;
        }
        // device:<64桁ハッシュ> → 先頭 10 桁だけ見せる
        const hash = r.key.slice('device:'.length);
        return `<code>${escapeHtml(hash.slice(0, 10))}…</code>`;
      }},
      { key: 'count', label: '回数', width: '80px' },
    ],
    data: recent.map((r, i) => ({ ...r, id: `${r.key}|${r.date}|${i}` })),
    searchFields: ['key', 'email', 'date'],
    actions: [
      {
        key: 'reset',
        label: '今日分リセット',
        class: 'btn-danger',
        visible: row => row.date === today,
        onClick: row => {
          if (!confirm(`このキーの今日の AI 呼び出し回数を 0 に戻します。よろしいですか？\n\n${row.key}`)) return;
          resetAiQuota('key', { key: row.key });
        },
      },
    ],
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
        <div class="info-row"><span class="info-label">デプロイ日時</span><span class="info-value"${s.deployedAt ? '' : ' style="color:#94a3b8;font-weight:400"'}>${s.deployedAt ? escapeHtml(s.deployedAt) : '未設定'}</span></div>
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
// Logs
// ============================================================
const LOG_LEVEL_LABELS = {
  10: { name: 'TRACE', cls: 'log-level-trace' },
  20: { name: 'DEBUG', cls: 'log-level-debug' },
  30: { name: 'INFO',  cls: 'log-level-info' },
  40: { name: 'WARN',  cls: 'log-level-warn' },
  50: { name: 'ERROR', cls: 'log-level-error' },
  60: { name: 'FATAL', cls: 'log-level-fatal' },
};
const LOG_MAX_ROWS = 500;

function formatLogTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildLogMeta(entry) {
  // time/level/msg/reqId 以外の補助フィールドを JSON で表示
  const skip = new Set(['time', 'level', 'msg', 'reqId', 'pid', 'hostname', 'v']);
  const rest = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!skip.has(k)) rest[k] = v;
  }
  if (Object.keys(rest).length === 0) return '';
  try { return JSON.stringify(rest); } catch (_) { return ''; }
}

function renderLogRowHtml(entry) {
  const lvl = LOG_LEVEL_LABELS[entry.level] || { name: String(entry.level || ''), cls: 'log-level-info' };
  const meta = buildLogMeta(entry);
  return `
    <div class="log-row ${lvl.cls}">
      <span class="log-time">${escapeHtml(formatLogTime(entry.time))}</span>
      <span class="log-level-badge ${lvl.cls}">${lvl.name}</span>
      <span class="log-reqid">${escapeHtml(entry.reqId || '')}</span>
      <span class="log-msg">${escapeHtml(entry.msg || '')}</span>
      ${meta ? `<span class="log-meta">${escapeHtml(meta)}</span>` : ''}
    </div>`;
}

async function renderLogs() {
  const area = document.getElementById('content-area');
  area.innerHTML = `
    <div class="log-toolbar">
      <label class="log-field">
        <span class="log-field-label">レベル</span>
        <select id="log-level" class="log-select">
          <option value="">すべて</option>
          <option value="info" selected>info 以上</option>
          <option value="warn">warn 以上</option>
          <option value="error">error のみ</option>
        </select>
      </label>
      <label class="log-field log-field-grow">
        <span class="log-field-label">キーワード</span>
        <input id="log-q" type="text" class="search-input log-search" placeholder="メッセージを含む...">
      </label>
      <label class="log-field log-field-inline">
        <input id="log-wrap" type="checkbox" checked>
        <span>折返し</span>
      </label>
      <label class="log-field log-field-inline">
        <input id="log-follow" type="checkbox" checked>
        <span>自動追尾</span>
      </label>
      <div class="log-toolbar-actions">
        <span id="log-status" class="log-status log-status-connecting">接続中...</span>
        <button id="log-clear" class="btn btn-save btn-sm">クリア</button>
      </div>
    </div>
    <div id="log-viewer" class="log-viewer log-wrap"></div>
  `;

  const viewer = document.getElementById('log-viewer');
  const levelSel = document.getElementById('log-level');
  const qInput = document.getElementById('log-q');
  const wrapInput = document.getElementById('log-wrap');
  const followInput = document.getElementById('log-follow');
  const statusEl = document.getElementById('log-status');
  const clearBtn = document.getElementById('log-clear');

  const state = {
    abort: null,
    closed: false,
    retryMs: 1000,
    retryTimer: null,
    reloadTimer: null,
  };

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = `log-status ${cls}`;
  }

  function trimToMax() {
    while (viewer.childElementCount > LOG_MAX_ROWS) {
      viewer.removeChild(viewer.firstChild);
    }
  }

  function appendEntry(entry) {
    const wasAtBottom = followInput.checked;
    viewer.insertAdjacentHTML('beforeend', renderLogRowHtml(entry));
    trimToMax();
    if (wasAtBottom) viewer.scrollTop = viewer.scrollHeight;
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (levelSel.value) params.set('level', levelSel.value);
    const q = qInput.value.trim();
    if (q) params.set('q', q);
    return params;
  }

  function cancelStream() {
    if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = null; }
    if (state.abort) {
      try { state.abort.abort(); } catch (_) { /* ignore */ }
      state.abort = null;
    }
  }

  async function connectStream() {
    if (state.closed) return;
    cancelStream();
    setStatus('接続中...', 'log-status-connecting');

    const params = buildQuery();
    const url = `${API}/logs/stream${params.toString() ? '?' + params : ''}`;
    const ctrl = new AbortController();
    state.abort = ctrl;

    let res;
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        credentials: 'same-origin',
      });
    } catch (err) {
      if (state.closed || ctrl.signal.aborted) return;
      scheduleReconnect();
      return;
    }

    if (!res.ok || !res.body) {
      if (res.status === 401) {
        location.href = '/cdn-cgi/access/logout?returnTo=' + encodeURIComponent('/admin/');
        return;
      }
      if (res.status === 403) {
        setStatus('権限がありません', 'log-status-error');
        return;
      }
      scheduleReconnect();
      return;
    }

    setStatus('接続中', 'log-status-connected');
    state.retryMs = 1000;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          // chunk は複数行に分かれうる。data: 行だけ拾う。
          const dataLines = chunk
            .split('\n')
            .filter(l => l.startsWith('data:'))
            .map(l => l.slice(5).trimStart());
          if (dataLines.length === 0) continue;
          const payload = dataLines.join('\n');
          try {
            const entry = JSON.parse(payload);
            appendEntry(entry);
          } catch (_) {
            // 壊れた行は無視
          }
        }
      }
    } catch (_) {
      // 中断または切断
    }

    if (!state.closed && !ctrl.signal.aborted) {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (state.closed) return;
    setStatus(`切断: ${Math.round(state.retryMs / 1000)} 秒後に再接続`, 'log-status-error');
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      connectStream();
    }, state.retryMs);
    state.retryMs = Math.min(state.retryMs * 2, 30000);
  }

  async function reload() {
    viewer.innerHTML = '';
    const params = buildQuery();
    params.set('lines', '200');
    const res = await api('GET', `${API}/logs?${params}`);
    if (!res.success) return;
    (res.data || []).forEach(appendEntry);
    if (followInput.checked) viewer.scrollTop = viewer.scrollHeight;
    connectStream();
  }

  function scheduleReload() {
    clearTimeout(state.reloadTimer);
    state.reloadTimer = setTimeout(() => { state.reloadTimer = null; reload(); }, 250);
  }

  levelSel.addEventListener('change', scheduleReload);
  qInput.addEventListener('input', scheduleReload);
  wrapInput.addEventListener('change', () => {
    viewer.classList.toggle('log-wrap', wrapInput.checked);
    viewer.classList.toggle('log-nowrap', !wrapInput.checked);
  });
  clearBtn.addEventListener('click', () => { viewer.innerHTML = ''; });

  registerPageCleanup(() => {
    state.closed = true;
    clearTimeout(state.reloadTimer);
    cancelStream();
  });

  await reload();
}

// ============================================================
// Init
// ============================================================
async function initAdmin() {
  const logoutLink = document.getElementById('topbar-logout');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      location.href = '/cdn-cgi/access/logout?returnTo=' + encodeURIComponent('/');
    });
  }
  const res = await api('GET', `${API}/me`);
  if (!res || !res.success) return;
  document.getElementById('topbar-user').textContent = (res.data && res.data.email) || '';
  Router.init();
}

initAdmin();
