import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Checks on a real national import (tests/data), outside the pull-request CI: run by hand against
 * an imported database (DATABASE_URL), `pnpm test:data`. They fail clearly on any other database.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/unit/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    name: 'data',
    include: ['tests/data/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
