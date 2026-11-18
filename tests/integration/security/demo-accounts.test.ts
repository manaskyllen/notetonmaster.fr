/**
 * No demo account in production: the server refuses to start on a database holding demo data,
 * and a demo admin address can never log in there. The dev database holds the seed, which is
 * exactly what a production start must refuse.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);
// Turnstile is tested apart: here only the demo-account rule may refuse the login.
vi.mock('@/lib/turnstile', () => ({
  verifyTurnstile: async () => ({ ok: true }),
  turnstileTokenOf: () => 'x',
  turnstileMode: () => 'live',
}));

const { request } = await import('../helpers/request');
const { assertNoDemoData, isDemoAddress } = await import('@/lib/auth/demo');
const { loginAction } = await import('@/app/admin/login/actions');
/** A long test-only session secret, built at run time (never a real value). */
const FAKE_SECRET = `test-only-${'s'.repeat(40)}`;
const TURNSTILE_MOCK_TOKEN = 'x';

const saved = { ...process.env };
const asProduction = () =>
  Object.assign(process.env, {
    NODE_ENV: 'production',
    APP_URL: 'https://notetonmaster.fr',
    SESSION_SECRET: FAKE_SECRET,
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    ALLOW_INSECURE_LOCAL_PROD: '',
  });
afterEach(() => {
  process.env = { ...saved };
});

describe('demo data in production', () => {
  it('demo addresses are recognised', () => {
    expect(isDemoAddress('alexis@notetonmaster.example')).toBe(true);
    expect(isDemoAddress('bastien@demo.notetonmaster.local')).toBe(true);
    expect(isDemoAddress('contact@notetonmaster.fr')).toBe(false);
  });

  it('a production start refuses a database that holds demo accounts or demo content', async () => {
    asProduction();
    await expect(assertNoDemoData()).rejects.toThrow(/démo/);
  });

  it('a local production build (CI, make prod-up) may run on the demo data', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      APP_URL: 'http://localhost:3002',
      ALLOW_INSECURE_LOCAL_PROD: '1',
    });
    await expect(assertNoDemoData()).resolves.toBeUndefined();
  });

  it('the demo admin cannot log in in production, even with the right password', async () => {
    asProduction();
    request.reset();
    const f = new FormData();
    f.set('step', 'password');
    f.set('email', 'alexis@notetonmaster.example');
    f.set('password', 'notetonmaster-demo');
    f.set('cf-turnstile-response', TURNSTILE_MOCK_TOKEN);
    const r = await loginAction({ step: 'password' }, f);
    expect(r).toMatchObject({ step: 'password', error: expect.any(String) });
  });

  it('the server checks it at startup', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('instrumentation.ts', 'utf8'));
    expect(src).toMatch(/assertNoDemoData\(/);
  });
});
