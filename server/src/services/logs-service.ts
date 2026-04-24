import fs from 'node:fs';
import path from 'node:path';

/**
 * 管理画面向け: pino の JSON Lines ログファイルを読む／tail するサービス。
 *
 * ログ書き込みは `lib/logger.ts` の pino-roll が担当するため、
 * ここでは書き込みはせず、`LOG_FILE_PATH` 環境変数を起点に
 * pino-roll の出力（`server.YYYY-MM-DD.N.log`）を辿って読む。
 */

export interface LogEntry {
  time?: number;
  level?: number;
  msg?: string;
  reqId?: string;
  [key: string]: unknown;
}

export interface LogFilter {
  // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  level?: string;
  q?: string;
}

const LEVEL_MAP: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * pino-roll は `file: '.../server.log'` を `server.YYYY-MM-DD.N.log` に展開する。
 * 同ディレクトリから最新更新の該当ファイルを返す。
 * テスト用途で base ファイルそのものが存在する場合はそれを優先する。
 */
function findActiveLogFile(): string | null {
  const base = process.env.LOG_FILE_PATH;
  if (!base) return null;

  try {
    if (fs.existsSync(base) && fs.statSync(base).isFile()) {
      return base;
    }
  } catch {
    // stat 失敗は存在しない扱いで続行
  }

  const dir = path.dirname(base);
  const ext = path.extname(base) || '.log';
  const stem = path.basename(base, path.extname(base));

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }

  const candidates: { full: string; mtime: number }[] = [];
  for (const name of entries) {
    if (!name.startsWith(stem + '.') || !name.endsWith(ext)) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (st.isFile()) candidates.push({ full, mtime: st.mtimeMs });
    } catch {
      // 読めないファイルは無視
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].full;
}

function parseLine(line: string): LogEntry | null {
  try {
    const obj = JSON.parse(line);
    if (obj && typeof obj === 'object') return obj as LogEntry;
  } catch {
    // JSON 以外の行（pino-pretty 等）は黙って捨てる
  }
  return null;
}

function matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
  if (filter.level) {
    const threshold = LEVEL_MAP[filter.level.toLowerCase()];
    if (threshold !== undefined) {
      const entryLevel = typeof entry.level === 'number' ? entry.level : 0;
      if (entryLevel < threshold) return false;
    }
  }
  if (filter.q) {
    const haystack = JSON.stringify(entry).toLowerCase();
    if (!haystack.includes(filter.q.toLowerCase())) return false;
  }
  return true;
}

/**
 * ファイル末尾から逆読みで最新 N 件（filter 通過分）を返す。
 * 日次ローテ＋7 日保持の運用想定なので、1 ファイル全読みで十分軽い。
 */
export function readRecentLogs(lines: number, filter: LogFilter = {}): LogEntry[] {
  const file = findActiveLogFile();
  if (!file) return [];

  let content: string;
  try {
    content = fs.readFileSync(file, 'utf-8');
  } catch {
    return [];
  }

  const matched: LogEntry[] = [];
  for (const raw of content.split('\n')) {
    if (!raw) continue;
    const entry = parseLine(raw);
    if (entry && matchesFilter(entry, filter)) {
      matched.push(entry);
    }
  }
  if (matched.length <= lines) return matched;
  return matched.slice(matched.length - lines);
}

/**
 * tail -f 相当。新しく書かれた JSON Lines を 1 行ずつ `onEntry` に渡す。
 * 返り値の関数を呼ぶとウォッチを停止する。
 *
 * - fs.watch はプラットフォームによって信頼性が低いため 1 秒のポーリング併用
 * - 日次ローテでアクティブファイル名が変わるので、毎ポーリングで再解決する
 * - ファイルサイズが縮んだ場合（ローテ直後など）は先頭から読み直す
 */
export function tailLogFile(
  filter: LogFilter,
  onEntry: (entry: LogEntry) => void,
): () => void {
  let currentFile: string | null = findActiveLogFile();
  let position = 0;
  let buffer = '';
  let closed = false;

  if (currentFile) {
    try {
      position = fs.statSync(currentFile).size;
    } catch {
      position = 0;
    }
  }

  const flushLines = (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const entry = parseLine(line);
      if (entry && matchesFilter(entry, filter)) {
        onEntry(entry);
      }
    }
  };

  const check = () => {
    if (closed) return;
    const active = findActiveLogFile();
    if (active && active !== currentFile) {
      // ローテでファイルが切り替わった → 先頭から読み直す
      currentFile = active;
      position = 0;
      buffer = '';
    }
    if (!currentFile) return;

    let size = 0;
    try {
      size = fs.statSync(currentFile).size;
    } catch {
      return;
    }
    if (size < position) {
      // 同名ファイルが truncate された（考えにくいが防御）
      position = 0;
      buffer = '';
    }
    if (size <= position) return;

    const stream = fs.createReadStream(currentFile, {
      start: position,
      end: size - 1,
      encoding: 'utf-8',
    });
    const readUpTo = size;
    stream.on('data', (chunk) => flushLines(chunk as string));
    stream.on('end', () => {
      position = readUpTo;
    });
    stream.on('error', () => {
      // 次回ポーリングで取り戻す
    });
  };

  const interval = setInterval(check, 1000);

  let watcher: fs.FSWatcher | null = null;
  const dir = currentFile ? path.dirname(currentFile) : process.env.LOG_FILE_PATH
    ? path.dirname(process.env.LOG_FILE_PATH)
    : null;
  if (dir) {
    try {
      watcher = fs.watch(dir, () => check());
    } catch {
      watcher = null;
    }
  }

  return () => {
    closed = true;
    clearInterval(interval);
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
    }
  };
}
