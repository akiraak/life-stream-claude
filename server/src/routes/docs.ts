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
  // front matter からタイトル取得
  const fmTitleMatch = raw.match(/^---[\s\S]*?title:\s*(.+)[\s\S]*?---/);
  // Jekyll front matter を除去
  const md = raw.replace(/^---[\s\S]*?---\n*/, '');
  const html = marked(md) as string;

  // h1 からタイトル取得（front matter になければ）
  const h1Match = html.match(/<h1>(.*?)<\/h1>/);
  const pageTitle = fmTitleMatch ? fmTitleMatch[1].trim() : (h1Match ? h1Match[1] : file.replace('.md', ''));

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

  const breadcrumb = `<nav class="breadcrumb">
    <a href="/docs/">仕様書一覧</a><span class="sep">/</span><span class="current">${escapeHtml(pageTitle)}</span>
  </nav>`;

  res.send(layoutHtml(escapeHtml(pageTitle), `
    <div class="layout">
      ${sidebar}
      <div class="main">
        ${breadcrumb}
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
        <a href="/docs/" class="active">仕様書一覧</a>
      </aside>
      <div class="main">
        <nav class="breadcrumb">
          <span class="current">仕様書一覧</span>
        </nav>
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
  <title>${escapeHtml(title)} - お料理バスケット</title>
  <link rel="stylesheet" href="/docs.css">
</head>
<body>
  ${body}
</body>
</html>`;
}
