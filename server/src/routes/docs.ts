import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

export const docsRouter = Router();

const DOCS_DIR = path.join(__dirname, '../../../docs');

// 仕様書一覧ページ
docsRouter.get('/', (_req: Request, res: Response) => {
  const specsDir = path.join(DOCS_DIR, 'specs');
  let files: string[] = [];

  if (fs.existsSync(specsDir)) {
    files = fs.readdirSync(specsDir)
      .filter(f => f.endsWith('.md'))
      .sort();
  }

  const fileList = files.map(f => {
    const name = f.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(specsDir, f), 'utf-8');
    // front matter の title: か、最初の # 行をタイトルとして取得
    const titleMatch = content.match(/^---[\s\S]*?title:\s*(.+)[\s\S]*?---/);
    const stripped = content.replace(/^---[\s\S]*?---\n*/, '');
    const firstLine = stripped.split('\n').find(l => l.trim()) || name;
    const title = titleMatch ? titleMatch[1].trim() : firstLine.replace(/^#+\s*/, '');
    return { file: f, name, title, type: 'md' as const };
  });

  res.send(renderListPage(fileList));
});

// デザインファイル (design/ サブディレクトリ)
docsRouter.get('/specs/design/:file', (req: Request, res: Response) => {
  const file = req.params.file as string;

  if (file.includes('..') || file.includes('/')) {
    res.status(400).send('Invalid file name');
    return;
  }

  const filePath = path.join(DOCS_DIR, 'specs', 'design', file);

  if (!fs.existsSync(filePath) || !file.endsWith('.html')) {
    res.status(404).send(renderErrorPage('ファイルが見つかりません'));
    return;
  }

  res.send(fs.readFileSync(filePath, 'utf-8'));
});

// 個別の仕様書表示
docsRouter.get('/specs/:file', (req: Request, res: Response) => {
  const file = req.params.file as string;

  if (file.includes('..') || file.includes('/')) {
    res.status(400).send('Invalid file name');
    return;
  }

  const filePath = path.join(DOCS_DIR, 'specs', file);

  if (!fs.existsSync(filePath) || !file.endsWith('.md')) {
    res.status(404).send(renderErrorPage('ファイルが見つかりません'));
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  // Jekyll front matter を除去
  const md = raw.replace(/^---[\s\S]*?---\n*/, '');
  const html = marked(md) as string;

  // h2 見出しを抽出してサイドバー目次を生成
  const headings: { id: string; text: string }[] = [];
  const htmlWithIds = html.replace(/<h2>(.*?)<\/h2>/g, (_match, text) => {
    const id = 'sec-' + headings.length;
    headings.push({ id, text });
    return `<h2 id="${id}">${text}</h2>`;
  });

  const tocItems = headings.map(h =>
    `<a href="#${h.id}">${escapeHtml(h.text)}</a>`
  ).join('\n');

  const sidebar = headings.length > 0
    ? `<aside class="sidebar"><h3>目次</h3>\n${tocItems}\n<div class="sidebar-divider"></div>\n<a href="/docs/">← 一覧へ戻る</a></aside>`
    : `<aside class="sidebar"><h3>メニュー</h3>\n<a href="/docs/">← 一覧へ戻る</a></aside>`;

  res.send(layoutHtml(escapeHtml(file.replace('.md', '')), `
    <div class="layout">
      ${sidebar}
      <div class="main">
        <article class="doc-content">${htmlWithIds}</article>
      </div>
    </div>
  `));
});

function renderListPage(files: { file: string; name: string; title: string; type: string }[]): string {
  const mdFiles = files.filter(f => f.type === 'md');
  const mdItems = mdFiles.length > 0
    ? mdFiles.map(f =>
      `<li class="doc-item"><a href="/docs/specs/${f.file}">${escapeHtml(f.title)}</a><span class="doc-file">${escapeHtml(f.file)}</span></li>`
    ).join('\n')
    : '<li class="doc-empty">仕様書はまだありません</li>';

  // design/ サブディレクトリのインデックスファイルを検出
  const designDir = path.join(DOCS_DIR, 'specs', 'design');
  let designItems = '';
  if (fs.existsSync(designDir)) {
    const designFiles = fs.readdirSync(designDir).filter(f => f.endsWith('.html'));
    const indexFiles = designFiles.filter(f => f.includes('index'));
    designItems = indexFiles.map(idx => {
      const prefix = idx.replace('index.html', '');
      const count = designFiles.filter(f => f.startsWith(prefix) && !f.includes('index')).length;
      const content = fs.readFileSync(path.join(designDir, idx), 'utf-8');
      const titleMatch = content.match(/<title>(.*?)<\/title>/);
      const title = titleMatch ? titleMatch[1] : idx;
      return `<li class="doc-item"><a href="/docs/specs/design/${idx}">${escapeHtml(title)}</a><span class="doc-file">${count}パターン・プレビュー付き</span></li>`;
    }).join('\n');
  }

  const designSection = designItems
    ? `<h2 class="section-label">デザイン案</h2><ul class="doc-list">${designItems}</ul>`
    : '';

  return layoutHtml('仕様書一覧', `
    <div class="layout">
      <aside class="sidebar">
        <h3>メニュー</h3>
        <a href="/">トップページ</a>
        <a href="/docs/" class="active">仕様書一覧</a>
        <a href="/admin/">管理画面</a>
      </aside>
      <div class="main">
        <h1>仕様書一覧</h1>
        <h2 class="section-label">ドキュメント</h2>
        <ul class="doc-list">${mdItems}</ul>
        ${designSection}
      </div>
    </div>
  `);
}

function renderErrorPage(message: string): string {
  return layoutHtml('エラー', `
    <div class="layout">
      <aside class="sidebar">
        <h3>メニュー</h3>
        <a href="/docs/">← 一覧へ戻る</a>
      </aside>
      <div class="main">
        <p class="doc-error">${escapeHtml(message)}</p>
      </div>
    </div>
  `);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layoutHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Life Stream</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #faf7f2;
      color: #3d3530;
      line-height: 1.85;
      font-size: 15px;
      -webkit-text-size-adjust: 100%;
    }

    /* レイアウト */
    .layout { display: flex; max-width: 960px; margin: 0 auto; }

    /* サイドバー */
    .sidebar {
      width: 200px;
      background: #f5ebe0;
      padding: 24px 16px;
      max-height: 100vh;
      border-right: 1px solid #e6d5c3;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      align-self: flex-start;
      overflow-y: auto;
    }
    .sidebar h3 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #9c6644;
      margin-bottom: 12px;
    }
    .sidebar a {
      display: block;
      padding: 6px 10px;
      color: #7f5539;
      text-decoration: none;
      font-size: 13px;
      border-radius: 6px;
      margin-bottom: 2px;
    }
    .sidebar a:hover, .sidebar a.active {
      background: #eedcca;
      color: #3d2b1a;
    }
    .sidebar-divider {
      border-top: 1px solid #e6d5c3;
      margin: 12px 0;
    }

    /* メインコンテンツ */
    .main {
      flex: 1;
      padding: 40px 32px;
      min-width: 0;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 24px;
      color: #5a3e28;
      font-weight: 700;
    }

    /* セクションラベル */
    .section-label {
      font-size: 1.05rem;
      margin: 28px 0 12px;
      color: #7f5539;
      font-weight: 700;
    }

    /* 一覧ページ */
    .doc-list { list-style: none; }
    .doc-item {
      background: #fdfbf8;
      border-radius: 10px;
      margin-bottom: 8px;
      border: 1px solid #ede2d5;
    }
    .doc-item a {
      display: block;
      padding: 14px 16px;
      color: #7f5539;
      text-decoration: none;
      font-weight: 600;
    }
    .doc-item a:hover {
      background: #eedcca;
      border-radius: 10px;
    }
    .doc-file {
      display: block;
      padding: 0 16px 10px;
      font-size: 12px;
      color: #b08968;
    }
    .doc-empty {
      text-align: center;
      color: #b08968;
      padding: 40px 0;
    }

    /* 仕様書ページ */
    .doc-content h1 {
      font-size: 1.5rem;
      margin-bottom: 24px;
      color: #5a3e28;
      font-weight: 700;
    }
    .doc-content h2 {
      font-size: 1.1rem;
      margin: 32px 0 12px;
      color: #7f5539;
      font-weight: 700;
      scroll-margin-top: 20px;
    }
    .doc-content h3 {
      font-size: 0.95rem;
      margin: 18px 0 8px;
      color: #9c6644;
    }
    .doc-content p {
      margin-bottom: 14px;
      color: #524740;
    }
    .doc-content ul, .doc-content ol {
      margin: 8px 0 14px 24px;
      color: #524740;
    }
    .doc-content li {
      margin-bottom: 4px;
    }
    .doc-content table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 16px 0;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(90, 62, 40, 0.06);
    }
    .doc-content th, .doc-content td {
      padding: 10px 14px;
      text-align: left;
    }
    .doc-content th {
      background: #ddb892;
      color: #3d2b1a;
      font-weight: 700;
      font-size: 0.85rem;
    }
    .doc-content td {
      background: #fff;
      border-bottom: 1px solid #f0e6da;
    }
    .doc-content tr:last-child td {
      border-bottom: none;
    }
    .doc-content code {
      font-family: 'SF Mono', Menlo, Monaco, monospace;
      font-size: 0.85em;
      color: #bc6c25;
      background: #f5ede4;
      padding: 1px 5px;
      border-radius: 4px;
    }
    .doc-content pre {
      background: #3d2b1a;
      color: #f5ebe0;
      padding: 16px;
      border-radius: 10px;
      overflow-x: auto;
      margin: 16px 0;
      font-size: 14px;
    }
    .doc-content pre code {
      background: none;
      padding: 0;
      color: #f5ebe0;
    }
    .doc-content blockquote {
      border-left: 4px solid #ddb892;
      padding: 12px 16px;
      margin: 16px 0;
      background: #f5efe6;
      border-radius: 0 8px 8px 0;
      color: #5a4a3e;
    }
    .doc-content hr {
      border: none;
      border-top: 1px solid #e6d5c3;
      margin: 28px 0;
    }

    .doc-error {
      text-align: center;
      color: #c45a30;
      padding: 40px 0;
    }

    /* レスポンシブ */
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .layout { flex-direction: column; }
      .main { padding: 24px 16px; }
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}
