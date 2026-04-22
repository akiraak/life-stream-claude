'use strict';

const CATEGORIES = ['plans', 'specs'];
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

function renderSidebar() {
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

async function init() {
  loadPersisted();
  setupTabs();
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
