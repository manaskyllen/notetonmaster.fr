import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The development database stays what DATABASE_URL names; the integration project works on
// DATABASE_URL_TEST, and its setup refuses to drop the development one.
process.env.DATABASE_URL_DEV ??= process.env.DATABASE_URL;
const testDatabase = process.env.DATABASE_URL_TEST;

const alias = {
  '@': fileURLToPath(new URL('./', import.meta.url)),
  'server-only': fileURLToPath(new URL('./tests/unit/stubs/server-only.ts', import.meta.url)),
};

/**
 * Two projects:
 * - unit: pure logic, no database (`pnpm test`, CI job « unit »);
 * - integration: its own PostgreSQL database DATABASE_URL_TEST (…/notetonmaster_test), dropped and
 *   recreated at each run with the migrations, the demo seed and the integration fixtures
 *   (tests/integration/setup/global.ts); never the development database. Mails go to an in-memory
 *   outbox. `pnpm test:int`, CI job « integration ».
 * The checks on a real national import are a third suite, run by hand: vitest.data.config.ts.
 *
 * Coverage (`pnpm test:coverage`, both projects): minimum thresholds per folder, stricter on what
 * protects people (authentication, permissions, anonymity, messaging). CI fails under them.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.{ts,tsx}'],
          environment: 'node',
          globalSetup: ['tests/integration/setup/global.ts'],
          setupFiles: ['tests/integration/setup/mail.ts'],
          env: testDatabase ? { DATABASE_URL: testDatabase } : {},
          // One database: files run one after the other.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reporter: ['text-summary', 'html', 'json-summary'],
      include: ['lib/**/*.ts', 'app/**/actions.ts', 'app/**/route.ts'],
      exclude: ['lib/db/generated/**', '**/*.d.ts'],
      thresholds: {
        // Sensitive folders and files: 90 % of lines.
        'lib/auth/**': { lines: 90 },
        'lib/domain/permissions.ts': { lines: 90 },
        'lib/domain/masking.ts': { lines: 90 },
        'lib/domain/public-date.ts': { lines: 90 },
        'lib/messaging/**': { lines: 90 },
        'lib/security/**': { lines: 90 },
        'lib/env.ts': { lines: 90 },
        // Everything else: a floor that only goes up.
        lines: 55,
      },
    },
  },
});
