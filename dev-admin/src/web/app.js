'use strict';

const CATEGORIES = ['plans', 'specs', 'todo'];
const TODO_FILES = ['TODO.md', 'DONE.md'];
const STORAGE_CATEGORY = 'dev-admin.activeCategory';
const STORAGE_EXPANDED = 'dev-admin.expanded';

const sidebarNav = document.getElementById('sidebar-nav');
const contentArea = document.getElementById('content-area');
const pageTitle = document.getElementById('page-title');
const topbarSub = document.getElementById('topbar-sub');
const topbarTabs = document.getElementById('topbar-tabs');

let docsTree = { plans: { files: [], dirs: [] }, specs: { files: [], dirs: [] } };
let activeCategory = 'plans';
let expanded = {};

// TODO ビューの状態（renderTodoView で更新）
const todoState = {
  name: null,          // 'TODO.md' | 'DONE.md'
  mode: 'preview',     // 'preview' | 'edit'
  content: '',         // textarea 上の現在値
  savedContent: '',    // 直近に取得/保存した内容（isDirty 判定用）
  mtime: 0,            // 楽観ロック用 baseMtime
};

function isTodoDirty() {
  return todoState.content !== todoState.savedContent;
}

function loadPersisted() {
  const cat = localStorage.getItem(STORAGE_CATEGORY);
  if (cat && CATEGORIES.includes(cat)) activeCategory = cat;
  try {
    const raw = localStorage.getItem(STORAGE_EXPANDED);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') expanded = parsed;
  } catch {
    expanded = {};
  }
}

function saveActiveCategory() {
  localStorage.setItem(STORAGE_CATEGORY, activeCategory);
}

function saveExpanded() {
  localStorage.setItem(STORAGE_EXPANDED, JSON.stringify(expanded));
}

async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '読み込みに失敗しました');
  return json.data;
}

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

function decodePath(p) {
  return p.split('/').map(decodeURIComponent).join('/');
}

// ディレクトリとファイルを mtime 降順（新しい順）で 1 列に並べる
function mergeByMtime(dirs, files) {
  const items = [
    ...dirs.map(d => ({ kind: 'dir', data: d, mtime: d.mtime || 0 })),
    ...files.map(f => ({ kind: 'file', data: f, mtime: f.mtime || 0 })),
  ];
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

function renderTabs() {
  topbarTabs.querySelectorAll('.topbar-tab').forEach(tab => {
    const isActive = tab.dataset.category === activeCategory;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function renderFileItem(category, file, depth) {
  const a = document.createElement('a');
  a.className = 'nav-item';
  a.href = `#${category}/${encodePath(file.path)}`;
  a.dataset.category = category;
  a.dataset.path = file.path;
  if (depth > 0) a.style.marginLeft = `${depth * 22}px`;

  const title = document.createElement('div');
  title.textContent = file.title;
  a.appendChild(title);

  const fileName = document.createElement('div');
  fileName.className = 'nav-item-file';
  fileName.textContent = file.name;
  a.appendChild(fileName);

  return a;
}

function renderDir(category, dir, parentPath, depth) {
  const dirPath = parentPath ? `${parentPath}/${dir.name}` : dir.name;
  const expandKey = `${category}/${dirPath}`;
  const isExpanded = !!expanded[expandKey];

  const block = document.createElement('div');
  block.className = 'nav-dir-block';

  const header = document.createElement('div');
  header.className = 'nav-dir' + (isExpanded ? ' expanded' : '');
  if (depth > 0) header.style.marginLeft = `${depth * 22}px`;
  header.dataset.expandKey = expandKey;

  const toggle = document.createElement('span');
  toggle.className = 'nav-dir-toggle';
  toggle.textContent = isExpanded ? '▼' : '▶';
  header.appendChild(toggle);

  const name = document.createElement('span');
  name.className = 'nav-dir-name';
  name.textContent = dir.name;
  header.appendChild(name);

  // plans 直下のディレクトリ（archive 本体は除く）にアーカイブボタンを付ける
  if (category === 'plans' && depth === 0 && dir.name !== 'archive') {
    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'nav-dir-archive';
    archiveBtn.title = 'アーカイブする';
    archiveBtn.setAttribute('aria-label', `${dir.name} をアーカイブ`);
    archiveBtn.textContent = '📦';
    archiveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      archiveDirectory(dir.name);
    });
    header.appendChild(archiveBtn);
  }

  header.addEventListener('click', () => {
    expanded[expandKey] = !expanded[expandKey];
    saveExpanded();
    renderSidebar();
  });

  block.appendChild(header);

  if (isExpanded) {
    const children = document.createElement('div');
    children.className = 'nav-dir-children';
    for (const item of mergeByMtime(dir.dirs, dir.files)) {
      if (item.kind === 'dir') {
        children.appendChild(renderDir(category, item.data, dirPath, depth + 1));
      } else {
        children.appendChild(renderFileItem(category, item.data, depth + 1));
      }
    }
    block.appendChild(children);
  }

  return block;
}

function renderTodoSidebar() {
  sidebarNav.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const name of TODO_FILES) {
    const a = document.createElement('a');
    a.className = 'nav-item';
    a.href = `#todo/${encodeURIComponent(name)}`;
    a.dataset.category = 'todo';
    a.dataset.path = name;

    const title = document.createElement('div');
    title.textContent = name.replace(/\.md$/, '');
    a.appendChild(title);

    const fileName = document.createElement('div');
    fileName.className = 'nav-item-file';
    fileName.textContent = name;
    a.appendChild(fileName);

    frag.appendChild(a);
  }
  sidebarNav.appendChild(frag);
  refreshActiveHighlight();
}

function renderSidebar() {
  if (activeCategory === 'todo') {
    renderTodoSidebar();
    return;
  }

  const tree = docsTree[activeCategory] || { files: [], dirs: [] };
  sidebarNav.innerHTML = '';

  if (tree.files.length === 0 && tree.dirs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-text';
    empty.textContent = 'ドキュメントがありません';
    sidebarNav.appendChild(empty);
    return;
  }

  // archive ディレクトリはツリーの一番下に出す（それ以外は mtime 降順で混ぜて並べる）
  const regularDirs = tree.dirs.filter(d => d.name !== 'archive');
  const archiveDirs = tree.dirs.filter(d => d.name === 'archive');

  const frag = document.createDocumentFragment();
  for (const item of mergeByMtime(regularDirs, tree.files)) {
    if (item.kind === 'dir') {
      frag.appendChild(renderDir(activeCategory, item.data, '', 0));
    } else {
      frag.appendChild(renderFileItem(activeCategory, item.data, 0));
    }
  }
  for (const dir of archiveDirs) {
    frag.appendChild(renderDir(activeCategory, dir, '', 0));
  }
  sidebarNav.appendChild(frag);

  refreshActiveHighlight();
}

function refreshActiveHighlight() {
  const parsed = parseHash();
  sidebarNav.querySelectorAll('.nav-item').forEach(el => {
    const match = parsed
      && el.dataset.category === parsed.category
      && el.dataset.path === parsed.filePath;
    el.classList.toggle('active', !!match);
  });
}

function findFileMeta(category, filePath) {
  function walk(node) {
    for (const f of node.files) if (f.path === filePath) return f;
    for (const d of node.dirs) {
      const found = walk(d);
      if (found) return found;
    }
    return null;
  }
  const tree = docsTree[category];
  if (!tree) return null;
  return walk(tree);
}

async function renderMarkdown(category, filePath) {
  contentArea.innerHTML = '<div class="loading-text">読み込み中...</div>';
  const filename = filePath.split('/').pop();
  try {
    const data = await fetchJson(`/api/docs/${category}/${encodeURIComponent(filename)}`);
    pageTitle.textContent = data.title;
    topbarSub.textContent = `${category}/${filePath}`;
    contentArea.innerHTML = '';

    // plans の直下にある md のみアーカイブ可能
    if (category === 'plans' && !filePath.includes('/')) {
      const toolbar = document.createElement('div');
      toolbar.className = 'doc-toolbar';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'doc-action';
      btn.textContent = 'アーカイブする';
      btn.addEventListener('click', () => archivePlan(filename));
      toolbar.appendChild(btn);
      contentArea.appendChild(toolbar);
    }

    const div = document.createElement('div');
    div.className = 'md-content';
    div.innerHTML = data.html;
    contentArea.appendChild(div);
  } catch (err) {
    showError(err.message);
  }
}

async function archiveDirectory(dirName) {
  if (!confirm(`ディレクトリ ${dirName}/ を archive に移動します。よろしいですか？`)) return;
  try {
    const res = await fetch(`/api/docs/plans/${encodeURIComponent(dirName)}/archive-dir`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'アーカイブに失敗しました');
    docsTree = await fetchJson('/api/docs');

    const parsed = parseHash();
    const inArchivedDir = parsed
      && parsed.category === 'plans'
      && parsed.filePath.startsWith(`${dirName}/`);
    if (inArchivedDir) {
      const newHash = `plans/${encodePath(`archive/${parsed.filePath}`)}`;
      if (location.hash === `#${newHash}`) {
        renderSidebar();
        handleRoute();
      } else {
        location.hash = newHash;
      }
    } else {
      renderSidebar();
    }
  } catch (err) {
    alert(err.message);
  }
}

async function archivePlan(filename) {
  if (!confirm(`${filename} を archive に移動します。よろしいですか？`)) return;
  try {
    const res = await fetch(`/api/docs/plans/${encodeURIComponent(filename)}/archive`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'アーカイブに失敗しました');
    docsTree = await fetchJson('/api/docs');
    const newHash = `plans/archive/${encodeURIComponent(filename)}`;
    if (location.hash === `#${newHash}`) {
      renderSidebar();
      handleRoute();
    } else {
      location.hash = newHash;
    }
  } catch (err) {
    alert(err.message);
  }
}

async function renderTodoView(name) {
  contentArea.innerHTML = '<div class="loading-text">読み込み中...</div>';
  try {
    // 生 Markdown + mtime を先に取得（編集モードで必要）
    const data = await fetchJson(`/api/files/${encodeURIComponent(name)}`);
    todoState.name = name;
    todoState.content = data.content;
    todoState.savedContent = data.content;
    todoState.mtime = data.mtime;
    // 前回の mode を維持（初回は preview）
    if (todoState.mode !== 'preview' && todoState.mode !== 'edit') {
      todoState.mode = 'preview';
    }

    pageTitle.textContent = name.replace(/\.md$/, '');
    topbarSub.textContent = name;
    contentArea.innerHTML = '';
    contentArea.appendChild(buildTodoLayout());

    if (todoState.mode === 'preview') {
      await renderTodoPreviewBody();
    } else {
      renderTodoEditBody();
    }
  } catch (err) {
    showError(err.message);
  }
}

function buildTodoLayout() {
  const wrap = document.createElement('div');
  wrap.className = 'todo-view';

  const toolbar = document.createElement('div');
  toolbar.className = 'todo-toolbar';

  const subtabs = document.createElement('div');
  subtabs.className = 'todo-subtabs';
  subtabs.setAttribute('role', 'tablist');
  for (const m of ['preview', 'edit']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'todo-subtab' + (todoState.mode === m ? ' active' : '');
    btn.dataset.mode = m;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', todoState.mode === m ? 'true' : 'false');
    btn.textContent = m === 'preview' ? 'プレビュー' : '編集';
    btn.addEventListener('click', () => switchTodoMode(m));
    subtabs.appendChild(btn);
  }
  toolbar.appendChild(subtabs);

  const actions = document.createElement('div');
  actions.className = 'todo-actions';
  if (todoState.mode === 'edit') {
    const discardBtn = document.createElement('button');
    discardBtn.type = 'button';
    discardBtn.className = 'doc-action';
    discardBtn.textContent = '変更を破棄';
    discardBtn.addEventListener('click', discardTodoChanges);
    actions.appendChild(discardBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'doc-action doc-action-primary';
    saveBtn.textContent = '保存';
    saveBtn.dataset.role = 'save';
    saveBtn.addEventListener('click', () => saveTodoFile());
    actions.appendChild(saveBtn);
  }
  toolbar.appendChild(actions);

  wrap.appendChild(toolbar);

  const body = document.createElement('div');
  body.className = 'todo-body';
  body.id = 'todo-body';
  wrap.appendChild(body);

  return wrap;
}

async function switchTodoMode(mode) {
  if (todoState.mode === mode) return;
  if (todoState.mode === 'edit' && isTodoDirty()) {
    if (!confirm('未保存の変更があります。破棄してプレビューに切り替えますか？')) return;
    // 破棄してから切り替え
    todoState.content = todoState.savedContent;
  }
  todoState.mode = mode;
  // レイアウト全体を描き直してサブタブと保存ボタンの表示を切り替える
  contentArea.innerHTML = '';
  contentArea.appendChild(buildTodoLayout());
  if (mode === 'preview') {
    await renderTodoPreviewBody();
  } else {
    renderTodoEditBody();
  }
}

async function renderTodoPreviewBody() {
  const body = document.getElementById('todo-body');
  if (!body) return;
  body.innerHTML = '<div class="loading-text">読み込み中...</div>';
  try {
    const data = await fetchJson(`/api/files/${encodeURIComponent(todoState.name)}/render`);
    body.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'md-content';
    div.innerHTML = data.html;
    body.appendChild(div);
  } catch (err) {
    body.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'error-text';
    div.textContent = err.message;
    body.appendChild(div);
  }
}

function renderTodoEditBody() {
  const body = document.getElementById('todo-body');
  if (!body) return;
  body.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.className = 'todo-editor';
  textarea.value = todoState.content;
  textarea.setAttribute('spellcheck', 'false');
  textarea.addEventListener('input', () => {
    todoState.content = textarea.value;
  });
  // Cmd/Ctrl+S で保存
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveTodoFile();
    }
  });
  body.appendChild(textarea);
  // フォーカスはユーザーの操作後にのみ当てる（タブ切替時に textarea にスクロールしないため）
  textarea.focus();
}

function discardTodoChanges() {
  if (!isTodoDirty()) return;
  if (!confirm('未保存の変更を破棄します。よろしいですか？')) return;
  todoState.content = todoState.savedContent;
  renderTodoEditBody();
}

async function saveTodoFile(options = {}) {
  const { force = false } = options;
  if (!todoState.name) return;
  if (!force && !isTodoDirty()) {
    showToast('変更はありません');
    return;
  }
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(todoState.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: todoState.content, baseMtime: todoState.mtime }),
    });
    if (res.status === 409) {
      const json = await res.json().catch(() => ({}));
      const currentMtime = json && json.data && typeof json.data.currentMtime === 'number'
        ? json.data.currentMtime
        : null;
      await handleSaveConflict(currentMtime);
      return;
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '保存に失敗しました');
    todoState.mtime = json.data.mtime;
    todoState.savedContent = todoState.content;
    showToast('保存しました');
  } catch (err) {
    alert(`保存に失敗しました: ${err.message}`);
  }
}

function handleSaveConflict(currentMtime) {
  return new Promise((resolve) => {
    showConflictDialog({
      onReload: async () => {
        // 外部の最新を取得して textarea を差し替え（編集内容は破棄）
        try {
          const data = await fetchJson(`/api/files/${encodeURIComponent(todoState.name)}`);
          todoState.content = data.content;
          todoState.savedContent = data.content;
          todoState.mtime = data.mtime;
          if (todoState.mode === 'edit') renderTodoEditBody();
          else await renderTodoPreviewBody();
          showToast('最新内容を読み込みました');
        } catch (err) {
          alert(`再取得に失敗しました: ${err.message}`);
        }
        resolve();
      },
      onKeep: () => {
        // 編集は維持。mtime はそのまま（次の保存でも競合するが、意図的な運用）
        resolve();
      },
      onForce: async () => {
        // baseMtime を現在値に差し替えて再 PUT
        if (typeof currentMtime === 'number') {
          todoState.mtime = currentMtime;
        } else {
          // currentMtime が無ければ GET で取り直す
          try {
            const data = await fetchJson(`/api/files/${encodeURIComponent(todoState.name)}`);
            todoState.mtime = data.mtime;
          } catch (err) {
            alert(`mtime 取得に失敗しました: ${err.message}`);
            resolve();
            return;
          }
        }
        await saveTodoFile({ force: true });
        resolve();
      },
    });
  });
}

function showConflictDialog({ onReload, onKeep, onForce }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = '外部で更新されています';
  modal.appendChild(title);

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.textContent = 'このファイルは別の場所で更新されました。どう処理しますか？';
  modal.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const close = () => overlay.remove();
  const makeBtn = (label, cls, handler) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `modal-btn${cls ? ' ' + cls : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => { close(); handler(); });
    return b;
  };
  actions.appendChild(makeBtn('手元の内容を維持', '', onKeep));
  actions.appendChild(makeBtn('リロードする（編集を破棄）', '', onReload));
  actions.appendChild(makeBtn('強制上書き', 'modal-btn-danger', onForce));

  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function showToast(message, durationMs = 2000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  // enter animation
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 200);
  }, durationMs);
}

function renderDesign(category, filePath) {
  const filename = filePath.split('/').pop();
  const meta = findFileMeta(category, filePath);
  pageTitle.textContent = meta ? meta.title : filename;
  topbarSub.textContent = `${category}/${filePath}`;

  const wrap = document.createElement('div');
  wrap.className = 'design-frame-wrap';

  const toolbar = document.createElement('div');
  toolbar.className = 'design-frame-toolbar';
  const left = document.createElement('span');
  left.textContent = filePath;
  const designUrl = `/api/design/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
  const right = document.createElement('a');
  right.className = 'design-frame-open';
  right.href = designUrl;
  right.target = '_blank';
  right.rel = 'noopener';
  right.textContent = '別タブで開く ↗';
  toolbar.appendChild(left);
  toolbar.appendChild(right);

  const iframe = document.createElement('iframe');
  iframe.className = 'design-frame';
  iframe.src = designUrl;
  iframe.title = filename;

  wrap.appendChild(toolbar);
  wrap.appendChild(iframe);

  contentArea.innerHTML = '';
  contentArea.appendChild(wrap);
}

function showError(message) {
  contentArea.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'error-text';
  div.textContent = message;
  contentArea.appendChild(div);
}

function showEmpty() {
  pageTitle.textContent = 'ドキュメント';
  topbarSub.textContent = '';
  contentArea.innerHTML = '<div class="empty-state">サイドバーからドキュメントを選択してください。</div>';
}

function parseHash() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash) return null;
  const slash = hash.indexOf('/');
  if (slash < 0) return null;
  const category = hash.slice(0, slash);
  const filePath = decodePath(hash.slice(slash + 1));
  return { category, filePath };
}

function expandAncestors(category, filePath) {
  const parts = filePath.split('/');
  if (parts.length <= 1) return false;
  let changed = false;
  let prefix = '';
  for (let i = 0; i < parts.length - 1; i++) {
    prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
    const key = `${category}/${prefix}`;
    if (!expanded[key]) {
      expanded[key] = true;
      changed = true;
    }
  }
  if (changed) saveExpanded();
  return changed;
}

function handleRoute() {
  const rawHash = location.hash.replace(/^#/, '');

  // 旧 #design/xxx.html → #specs/design/xxx.html
  if (rawHash.startsWith('design/')) {
    location.replace(`#specs/${rawHash}`);
    return;
  }

  const parsed = parseHash();
  if (!parsed) {
    refreshActiveHighlight();
    showEmpty();
    return;
  }

  const { category, filePath } = parsed;
  if (!CATEGORIES.includes(category)) {
    showError('不正なカテゴリです');
    return;
  }

  let needSidebarRerender = false;
  if (activeCategory !== category) {
    activeCategory = category;
    saveActiveCategory();
    renderTabs();
    needSidebarRerender = true;
  }

  if (category === 'todo') {
    if (!TODO_FILES.includes(filePath)) {
      if (needSidebarRerender) renderSidebar();
      else refreshActiveHighlight();
      showError('対応していないファイルです');
      return;
    }
    // ファイル切替時、未保存の変更があれば確認
    if (todoState.name && todoState.name !== filePath && isTodoDirty()) {
      if (!confirm('未保存の変更があります。破棄して別のファイルに移動しますか？')) {
        // 元のファイルに戻す（履歴を増やさないよう replace）
        location.replace(`#todo/${encodeURIComponent(todoState.name)}`);
        return;
      }
      // 破棄する（savedContent に戻すことで以降の isDirty を false にする）
      todoState.content = todoState.savedContent;
    }
    if (needSidebarRerender) renderSidebar();
    else refreshActiveHighlight();
    renderTodoView(filePath);
    return;
  }

  if (expandAncestors(category, filePath)) {
    needSidebarRerender = true;
  }
  if (needSidebarRerender) renderSidebar();
  else refreshActiveHighlight();

  const lastDot = filePath.lastIndexOf('.');
  const ext = lastDot >= 0 ? filePath.slice(lastDot).toLowerCase() : '';
  if (ext === '.html') {
    renderDesign(category, filePath);
  } else if (ext === '.md') {
    renderMarkdown(category, filePath);
  } else {
    showError('対応していないファイル形式です');
  }
}

function setupTabs() {
  topbarTabs.querySelectorAll('.topbar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const cat = tab.dataset.category;
      if (!CATEGORIES.includes(cat) || activeCategory === cat) return;
      // TODO タブから離れるときは未保存確認
      if (activeCategory === 'todo' && isTodoDirty()) {
        if (!confirm('未保存の変更があります。破棄して他のタブに移動しますか？')) return;
        todoState.content = todoState.savedContent;
      }
      activeCategory = cat;
      saveActiveCategory();
      renderTabs();
      renderSidebar();

      if (location.hash) {
        history.pushState(null, '', location.pathname + location.search);
      }
      refreshActiveHighlight();
      showEmpty();
    });
  });
}

function setupBeforeUnload() {
  window.addEventListener('beforeunload', (e) => {
    if (isTodoDirty()) {
      e.preventDefault();
      // 一部ブラウザ（古い Chrome 等）は returnValue 設定を要求する
      e.returnValue = '';
      return '';
    }
  });
}

async function init() {
  loadPersisted();
  setupTabs();
  setupBeforeUnload();
  renderTabs();

  try {
    docsTree = await fetchJson('/api/docs');
    renderSidebar();
    handleRoute();
  } catch (err) {
    sidebarNav.innerHTML = '';
    showError(err.message);
  }
}

window.addEventListener('hashchange', handleRoute);
init();
