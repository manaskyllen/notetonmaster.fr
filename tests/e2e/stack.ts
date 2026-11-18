/**
 * Which site, database and mail sender a Playwright worker talks to.
 *
 * - Parallel stack (`E2E_SERVERS=n`, started by scripts/e2e-stack.sh): one production build served
 *   n times, each server with its own worker process, its own database `notetonmaster_test_<i>` and
 *   its own mail sender (`ne-pas-repondre+w<i>@…`). Playwright worker i (TEST_PARALLEL_INDEX) only
 *   talks to server i: tests never see the writes of another process.
 * - Dev stack (`E2E_SERVERS` unset, `make e2e`): one server (BASE_URL), the database of
 *   DATABASE_URL, one worker.
 */
export const SERVERS = Number(process.env.E2E_SERVERS ?? 0);
export const STACK = SERVERS > 0;
const HOST = process.env.E2E_HOST ?? 'localhost';
const BASE_PORT = Number(process.env.E2E_BASE_PORT ?? 3100);

let pinned: number | null = null;
/** The session setup (auth.setup.ts) works on every server in turn, from one worker. */
export function pinServer(i: number | null) {
  pinned = i;
}

/** Index of the current Playwright worker (0 in the runner process and with a single worker). */
export const workerIndex = () => pinned ?? Number(process.env.TEST_PARALLEL_INDEX ?? 0);

export function serverUrl(i = workerIndex()): string {
  if (!STACK) return process.env.BASE_URL ?? 'http://web:3000';
  return `http://${HOST}:${BASE_PORT + i}`;
}

export function databaseUrl(i = workerIndex()): string {
  const url = process.env.DATABASE_URL ?? '';
  if (!STACK) return url;
  const u = new URL(url);
  u.pathname = `/notetonmaster_test_${i}`;
  return u.toString();
}

/** Sender of the mails of server i (null on the dev stack: every mail comes from one sender). */
export function mailSender(i = workerIndex()): string | null {
  return STACK ? `ne-pas-repondre+w${i}@notetonmaster.example` : null;
}
