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
    // ファイル先頭行をタイトルとして取得
    const content = fs.readFileSync(path.join(specsDir, f), 'utf-8');
    const firstLine = content.split('\n').find(l => l.trim()) || name;
    const title = firstLine.replace(/^#+\s*/, '');
    return { file: f, name, title };
  });

  res.send(renderListPage(fileList));
});

// 個別の仕様書表示
docsRouter.get('/specs/:file', (req: Request, res: Response) => {
  const file = req.params.file as string;

  // パストラバーサル防止
  if (file.includes('..') || file.includes('/')) {
    res.status(400).send('Invalid file name');
    return;
  }

  const filePath = path.join(DOCS_DIR, 'specs', file);

  if (!fs.existsSync(filePath) || !file.endsWith('.md')) {
    res.status(404).send(renderErrorPage('ファイルが見つかりません'));
    return;
  }

  const md = fs.readFileSync(filePath, 'utf-8');
  const html = marked(md) as string;
  res.send(renderDocPage(html));
});

function renderListPage(files: { file: string; name: string; title: string }[]): string {
  const items = files.length > 0
    ? files.map(f =>
      `<li class="doc-item"><a href="/docs/specs/${f.file}">${escapeHtml(f.title)}</a><span class="doc-file">${escapeHtml(f.file)}</span></li>`
    ).join('\n')
    : '<li class="doc-empty">仕様書はまだありません</li>';

  return layoutHtml('仕様書一覧', `
    <div class="doc-header">
      <h1>仕様書一覧</h1>
      <a href="/" class="back-link">← トップへ</a>
    </div>
    <ul class="doc-list">${items}</ul>
  `);
}

function renderDocPage(contentHtml: string): string {
  return layoutHtml('仕様書', `
    <div class="doc-header">
      <a href="/docs/" class="back-link">← 一覧へ戻る</a>
    </div>
    <article class="doc-content">${contentHtml}</article>
  `);
}

function renderErrorPage(message: string): string {
  return layoutHtml('エラー', `
    <div class="doc-header">
      <a href="/docs/" class="back-link">← 一覧へ戻る</a>
    </div>
    <p class="doc-error">${escapeHtml(message)}</p>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.7;
      -webkit-text-size-adjust: 100%;
    }
    .container { max-width: 720px; margin: 0 auto; padding: 20px 16px; }
    .doc-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; flex-wrap: wrap; gap: 8px;
    }
    .doc-header h1 { font-size: 1.4rem; }
    .back-link { color: #007aff; text-decoration: none; font-size: 14px; }
    .back-link:hover { text-decoration: underline; }

    /* 一覧ページ */
    .doc-list { list-style: none; }
    .doc-item {
      background: #fff; border-radius: 10px; margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .doc-item a {
      display: block; padding: 14px 16px; color: #007aff;
      text-decoration: none; font-weight: 500;
    }
    .doc-item a:hover { background: #f0f0f0; border-radius: 10px; }
    .doc-file { display: block; padding: 0 16px 10px; font-size: 12px; color: #999; }
    .doc-empty { text-align: center; color: #aaa; padding: 40px 0; }

    /* 仕様書ページ */
    .doc-content {
      background: #fff; border-radius: 10px; padding: 24px 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .doc-content h1 { font-size: 1.5rem; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #eee; }
    .doc-content h2 { font-size: 1.25rem; margin: 24px 0 12px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
    .doc-content h3 { font-size: 1.1rem; margin: 20px 0 8px; }
    .doc-content p { margin-bottom: 12px; }
    .doc-content ul, .doc-content ol { margin: 8px 0 12px 24px; }
    .doc-content li { margin-bottom: 4px; }
    .doc-content code {
      background: #f0f0f0; padding: 2px 6px; border-radius: 4px;
      font-size: 0.9em; font-family: 'SF Mono', Monaco, Consolas, monospace;
    }
    .doc-content pre {
      background: #1e1e1e; color: #d4d4d4; padding: 16px;
      border-radius: 8px; overflow-x: auto; margin: 12px 0;
    }
    .doc-content pre code { background: none; padding: 0; color: inherit; }
    .doc-content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    .doc-content th, .doc-content td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    .doc-content th { background: #f8f8f8; font-weight: 600; }
    .doc-content blockquote {
      border-left: 4px solid #007aff; padding: 8px 16px; margin: 12px 0;
      background: #f8f9ff; color: #555;
    }

    .doc-error { text-align: center; color: #ff3b30; padding: 40px 0; }
  </style>
</head>
<body>
  <div class="container">${body}</div>
</body>
</html>`;
}
