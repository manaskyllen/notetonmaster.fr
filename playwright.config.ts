import { defineConfig, devices } from '@playwright/test';
import { SERVERS, STACK, serverUrl } from './tests/e2e/stack';

/**
 * End-to-end tests (Chromium only).
 * - CI and `make e2e-full`: a production build served by scripts/e2e-stack.sh, one server and one
 *   database per Playwright worker (E2E_SERVERS, tests/e2e/stack.ts).
 * - `make e2e`: the dev stack, one worker.
 * The `setup` project logs the demo accounts in once per server (tests/e2e/auth.setup.ts).
 * This file is also evaluated in each worker: `baseURL` is the server of that worker.
 */
export default defineConfig({
  testDir: 'tests',
  // Tests of a file stay in order (some share a state through the database); files are spread
  // over the workers.
  fullyParallel: false,
  workers: STACK ? SERVERS : 1,
  // In CI a failure is retried once, for its trace; a test that passes only on its retry still
  // fails the run (flaky is not green).
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.PW_BLOB
    ? [['list'], ['blob']]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: serverUrl(),
    // In production the reverse proxy adds the client address (lib/ip.ts); here nothing sits in
    // front of the server, so the browser plays that part (a documentation address).
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.10' },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testDir: 'tests/e2e',
      testMatch: /auth\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e',
      testDir: 'tests/e2e',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    // Screenshots taken by hand (tests/visual: the admin at 1440 px into tests/visual/screens,
    // logged-in pages into .shots/). Declared with VISUAL=1 only, so that no run of the suite
    // lists them, not even as skipped: `VISUAL=1 playwright test --project=visual`.
    ...(process.env.VISUAL
      ? [
          {
            name: 'visual',
            testDir: 'tests/visual',
            dependencies: ['setup'],
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
          },
        ]
      : []),
  ],
});
