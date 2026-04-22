import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // better-sqlite3 の native モジュールはワーカースレッドで問題を起こすことがあるため
    // fork プールを使い、さらに per-process でテスト DB ファイル名を分けて衝突回避する
    pool: 'forks',
    forks: {
      singleFork: false,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
  },
});
