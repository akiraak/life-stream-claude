import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

const app = express();
const PORT = Number(process.env.DEV_ADMIN_PORT) || 3010;
const HOST = '127.0.0.1';

const DOCS_DIR = path.join(__dirname, '../../docs');
const MD_CATEGORIES = ['plans', 'specs'] as const;
type MdCategory = typeof MD_CATEGORIES[number];

interface TreeFile {
  name: string;
  path: string;
  title: string;
}

interface TreeDir {
  name: string;
  files: TreeFile[];
  dirs: TreeDir[];
}

interface Tree {
  files: TreeFile[];
  dirs: TreeDir[];
}

function extractMdTitle(raw: string, fallback: string): string {
  const fm = raw.match(/^---[\s\S]*?title:\s*(.+?)\s*\n[\s\S]*?---/);
  if (fm) return fm[1].trim();
  const stripped = raw.replace(/^---[\s\S]*?---\n*/, '');
  const h1 = stripped.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return fallback;
}

function extractHtmlTitle(raw: string, fallback: string): string {
  const t = raw.match(/<title>([^<]+)<\/title>/i);
  if (t) return t[1].trim();
  const h1 = raw.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1) return h1[1].trim();
  return fallback;
}

function extractTitle(absPath: string, fallback: string): string {
  const raw = fs.readFileSync(absPath, 'utf-8');
  if (absPath.endsWith('.md')) return extractMdTitle(raw, fallback);
  if (absPath.endsWith('.html')) return extractHtmlTitle(raw, fallback);
  return fallback;
}

// カテゴリ配下を再帰的にツリー化する
function listTree(absDir: string, exts: string[], relPrefix: string = ''): Tree {
  if (!fs.existsSync(absDir)) return { files: [], dirs: [] };
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  const files: TreeFile[] = [];
  const dirs: TreeDir[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(absDir, entry.name);
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const sub = listTree(abs, exts, rel);
      if (sub.files.length > 0 || sub.dirs.length > 0) {
        dirs.push({ name: entry.name, files: sub.files, dirs: sub.dirs });
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!exts.includes(ext)) continue;
      const fallback = entry.name.replace(/\.[^.]+$/, '');
      files.push({ name: entry.name, path: rel, title: extractTitle(abs, fallback) });
    }
  }

  return { files, dirs };
}

function isSafeName(file: string, ext: string): boolean {
  return !file.includes('..') && !file.includes('/') && !file.includes('\\') && file.endsWith(ext);
}

// カテゴリルートからファイルを再帰的に探す（サブディレクトリ対応）
function findFileUnder(root: string, file: string): string | null {
  if (!fs.existsSync(root)) return null;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile() && entry.name === file) {
        return abs;
      }
    }
  }
  return null;
}

function findMdFile(category: MdCategory, file: string): string | null {
  return findFileUnder(path.join(DOCS_DIR, category), file);
}

// ドキュメント一覧（ツリー構造）
app.get('/api/docs', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      plans: listTree(path.join(DOCS_DIR, 'plans'), ['.md', '.html']),
      specs: listTree(path.join(DOCS_DIR, 'specs'), ['.md', '.html']),
    },
    error: null,
  });
});

// markdown ドキュメント取得（HTML 変換）
app.get('/api/docs/:category/:file', (req: Request, res: Response) => {
  const category = req.params.category as string;
  const file = req.params.file as string;

  if (!MD_CATEGORIES.includes(category as MdCategory)) {
    res.status(400).json({ success: false, data: null, error: '不正なカテゴリです' });
    return;
  }
  if (!isSafeName(file, '.md')) {
    res.status(400).json({ success: false, data: null, error: '不正なファイル名です' });
    return;
  }

  const filePath = findMdFile(category as MdCategory, file);
  if (!filePath) {
    res.status(404).json({ success: false, data: null, error: 'ファイルが見つかりません' });
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const title = extractMdTitle(raw, file.replace(/\.md$/, ''));
  const md = raw.replace(/^---[\s\S]*?---\n*/, '');
  const html = marked(md) as string;
  res.json({ success: true, data: { title, html }, error: null });
});

// design HTML をそのまま返す（iframe 用・カテゴリ指定）
app.get('/api/design/:category/:file', (req: Request, res: Response) => {
  const category = req.params.category as string;
  const file = req.params.file as string;

  if (!MD_CATEGORIES.includes(category as MdCategory)) {
    res.status(400).send('不正なカテゴリです');
    return;
  }
  if (!isSafeName(file, '.html')) {
    res.status(400).send('不正なファイル名です');
    return;
  }

  const filePath = findFileUnder(path.join(DOCS_DIR, category), file);
  if (!filePath) {
    res.status(404).send('ファイルが見つかりません');
    return;
  }
  res.type('html').sendFile(filePath);
});

// 旧: design 専用エンドポイント（specs/design/ 限定、後方互換）
app.get('/api/design/:file', (req: Request, res: Response) => {
  const file = req.params.file as string;
  if (!isSafeName(file, '.html')) {
    res.status(400).send('不正なファイル名です');
    return;
  }
  const filePath = path.join(DOCS_DIR, 'specs', 'design', file);
  if (!fs.existsSync(filePath)) {
    res.status(404).send('ファイルが見つかりません');
    return;
  }
  res.type('html').sendFile(filePath);
});

// 静的配信（dev-admin/src/web/）
app.use(express.static(path.join(__dirname, 'web')));

app.listen(PORT, HOST, () => {
  console.log(`[dev-admin] running at http://${HOST}:${PORT}`);
});
