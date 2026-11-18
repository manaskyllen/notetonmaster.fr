import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { databaseUrl, mailSender, workerIndex } from './stack';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';

type Summary = { ID: string; Subject: string; To: { Address: string }[]; Created: string };

/** Waits for a mail to `to` whose subject matches, sent after `since`. Returns its HTML and text. */
export async function waitForMail(
  to: string,
  subject: RegExp,
  since = new Date(Date.now() - 60_000),
) {
  // Parallel stack: only the mails of this worker's server (the demo accounts exist on each).
  const from = mailSender();
  const query = from ? `to:"${to}" from:"${from}"` : `to:"${to}"`;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}&limit=20`);
    const json = (await res.json()) as { messages: Summary[] };
    const hit = json.messages.find((m) => subject.test(m.Subject) && new Date(m.Created) >= since);
    if (hit) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as {
        HTML: string;
        Text: string;
        Subject: string;
      };
      return full;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No mail to ${to} matching ${subject}`);
}

/** First link in a mail pointing to the app, rewritten to the test base URL. */
export function linkFrom(html: string, pathPart: string): string {
  const m = new RegExp(`href="(https?://[^"]*${pathPart}[^"]*)"`).exec(html);
  if (!m) throw new Error(`No link containing ${pathPart}`);
  const url = new URL(m[1]!.replace(/&amp;/g, '&'));
  return url.pathname + url.search + url.hash;
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@e2e.notetonmaster.local`;
}

/** Waits until React has hydrated the page (<html data-hydrated>, set by HydrationMarker). */
export async function waitForHydration(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}

/**
 * Waits for the end of the finite animations and transitions of the page, or of `scope` and its
 * descendants (instead of a fixed delay). Endless ones (spinners) are ignored.
 */
export async function animationsDone(scope: Page | Locator) {
  const root = 'goto' in scope ? scope.locator(':root') : scope;
  await root.evaluate(async (el) => {
    await new Promise((frame) => requestAnimationFrame(frame));
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
  });
}

/** The 6-digit code of a mail (« Ton code : 482 913 »). */
export function codeFrom(mail: { Text: string }): string {
  const m = /Ton code :\s*(\d{3}) ?(\d{3})/.exec(mail.Text);
  if (!m) throw new Error('No code in the mail');
  return m[1]! + m[2]!;
}

/** Types a code in the six boxes (one key per digit, as a person would). */
export async function typeCode(page: Page, code: string) {
  await page.getByRole('textbox', { name: 'Chiffre 1 sur 6' }).click();
  await page.keyboard.type(code);
}

/** On /connexion (hydrated): asks a code for `email` and types it. */
export async function loginWithCode(page: Page, email: string) {
  const since = new Date();
  await page.getByLabel('Ton adresse mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await expect(page.getByRole('heading', { name: 'Saisis ton code' })).toBeVisible();
  const mail = await waitForMail(email, /code de connexion/i, since);
  await typeCode(page, codeFrom(mail));
  return mail;
}

/**
 * Sessions saved once per server by the `setup` project (auth.setup.ts): the demo student and the
 * admins log in through the screens there, and the tests start from their cookies.
 */
const SESSIONS = join(import.meta.dirname, '.auth');
export const sessionFile = (email: string, server = workerIndex()) =>
  join(SESSIONS, String(server), `${email}.json`);

export async function saveSession(page: Page, email: string) {
  const file = sessionFile(email);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(await page.context().storageState()));
}

/** Opens `path` with the saved session of `email`; false when there is none or it has expired. */
async function restoreSession(page: Page, email: string, path: string, loginPath: string) {
  const file = sessionFile(email);
  if (!existsSync(file)) return false;
  const { cookies } = JSON.parse(readFileSync(file, 'utf8')) as {
    cookies: Parameters<ReturnType<Page['context']>['addCookies']>[0];
  };
  await page.context().addCookies(cookies);
  await page.goto(path);
  if (!new URL(page.url()).pathname.startsWith(loginPath)) return true;
  await page.context().clearCookies();
  return false;
}

/**
 * Logs a student in. The demo student starts from the saved session; a new address (or
 * `{ fresh: true }`) goes through the code mail, as a person would.
 */
export async function loginStudent(page: Page, email: string, opts: { fresh?: boolean } = {}) {
  if (!opts.fresh && (await restoreSession(page, email, '/espace', '/connexion'))) {
    await expect(
      page.getByRole('heading', { name: 'Ton tableau de bord', level: 1 }),
    ).toBeVisible();
    return;
  }
  await page.goto('/connexion');
  await waitForHydration(page);
  await loginWithCode(page, email);
  await expect(page.getByRole('heading', { name: 'Ton tableau de bord', level: 1 })).toBeVisible();
}

import { generateSync } from 'otplib';

export const ADMIN = {
  email: 'alexis@notetonmaster.example',
  password: 'notetonmaster-demo',
  totp: 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD',
};

export const DEMO_STUDENT = 'alexis.demo@demo.notetonmaster.local';

export const MODERATOR = {
  email: 'camille@notetonmaster.example',
  password: 'notetonmaster-demo',
  totp: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
};

/**
 * Admin login. Starts from the session saved by the setup project; `{ fresh: true }` goes through
 * the password and TOTP screens (the tests of the login itself).
 */
export async function loginAdmin(
  page: Page,
  who: { email: string; password: string; totp: string } = ADMIN,
  opts: { fresh?: boolean } = {},
) {
  if (!opts.fresh && (await restoreSession(page, who.email, '/admin', '/admin/login'))) {
    await expect(page.getByRole('heading', { name: 'Vue d’ensemble' })).toBeVisible();
    // As right after the password and TOTP: sensitive actions want an authentication of less
    // than 5 minutes (lib/auth/session.ts), and the saved session is older.
    await sql(
      `UPDATE "AuthSession" SET "reauthAt" = now()
        WHERE kind = 'ADMIN' AND "revokedAt" IS NULL
          AND "subjectId" = (SELECT id FROM "AdminUser" WHERE email = $1)`,
      [who.email],
    );
    return;
  }
  await page.goto('/admin/login');
  await waitForHydration(page);
  await page.getByLabel('Adresse mail').fill(who.email);
  await page.getByLabel('Mot de passe').fill(who.password);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Double authentification' })).toBeVisible();
  // Six boxes: the sixth digit sends the form.
  await page.getByRole('textbox', { name: 'Chiffre 1 sur 6' }).click();
  await page.keyboard.type(await freshTotp(page, who));
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble' })).toBeVisible();
}

/**
 * A TOTP code of a time step not used yet: a code is refused once used (replay protection), and
 * tests log the same account in many times. The next 30 s window is accepted (clock drift), so
 * waiting is rarely needed.
 */
export async function freshTotp(_page: Page, who: { email: string; totp: string } = ADMIN) {
  const [row] = await sql<{ last: number | null }>(
    'SELECT "totpLastStep" AS last FROM "AdminUser" WHERE email = $1',
    [who.email],
  );
  const now = () => Math.floor(Date.now() / 30_000);
  const next = (row?.last ?? -1) + 1;
  // Rare: every step up to the next window is spent. Wait until the clock reaches it.
  if (next > now() + 1) {
    await expect
      .poll(now, { timeout: 65_000, intervals: [1_000] })
      .toBeGreaterThanOrEqual(next - 1);
  }
  return generateSync({ secret: who.totp, epoch: Math.max(now(), next) * 30 });
}

import pg from 'pg';

const pools = new Map<string, pg.Pool>();
/**
 * Direct SQL on the database of this worker's server (test fixtures that the UI cannot create,
 * e.g. dates).
 */
export async function sql<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) {
  const url = databaseUrl();
  let pool = pools.get(url);
  if (!pool) pools.set(url, (pool = new pg.Pool({ connectionString: url, max: 2 })));
  return (await pool.query<T>(text, params)).rows;
}

/** Logs a student in from the current page's « connexion » link: back on `expectUrl`. */
export async function magicLinkFrom(page: Page, email: string, expectUrl: RegExp) {
  await waitForHydration(page);
  await loginWithCode(page, email);
  await expect(page).toHaveURL(expectUrl);
}

/**
 * Expires the cache of the open cities and of the catalogue, as the admin does when it saves the
 * cities (a test that opens or closes a zone in SQL: the index itself is left as it is).
 */
export async function expireZonesCache(page: Page) {
  const { createHmac } = await import('node:crypto');
  const body = JSON.stringify({ tags: ['launch-zones', 'catalog'], at: Date.now() });
  const sig = createHmac('sha256', process.env.SESSION_SECRET ?? '')
    .update(body)
    .digest('hex');
  const r = await page.request.post('/api/internal/revalidate', {
    data: body,
    headers: { 'content-type': 'application/json', 'x-nm-signature': sig },
  });
  expect(r.ok()).toBe(true);
}

/** Expires cache tags of the site as the worker does (e.g. `admin-counts` after a fixture in SQL). */
export async function expireTags(page: Page, tags: string[]) {
  const { createHmac } = await import('node:crypto');
  const body = JSON.stringify({ tags, at: Date.now() });
  const sig = createHmac('sha256', process.env.SESSION_SECRET ?? '')
    .update(body)
    .digest('hex');
  const r = await page.request.post('/api/internal/revalidate', {
    data: body,
    headers: { 'content-type': 'application/json', 'x-nm-signature': sig },
  });
  expect(r.ok()).toBe(true);
}
