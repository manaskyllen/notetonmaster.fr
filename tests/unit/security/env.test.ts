/**
 * The server refuses to start in production with a missing variable, a development or demo value,
 * a test key, or a protection switched off. Local production builds (make prod-up, CI) need an
 * explicit ALLOW_INSECURE_LOCAL_PROD=1, which only works on a local address.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateEnv } from '@/lib/env';
/** A long test-only session secret, built at run time (never a real value). */
const FAKE_SECRET = `test-only-${'s'.repeat(40)}`;

const good = {
  NODE_ENV: 'production',
  APP_URL: 'https://notetonmaster.fr',
  DATABASE_URL: 'postgresql://nm_app:x@db:5432/notetonmaster',
  SESSION_SECRET: FAKE_SECRET,
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  TURNSTILE_MODE: 'live',
  TURNSTILE_SITE_KEY: `0x4${'A'.repeat(7)}site`,
  TURNSTILE_SECRET_KEY: `0x4${'A'.repeat(7)}secret`,
  SMTP_HOST: 'smtp.example.net',
  MAIL_FROM: 'notetonmaster <ne-pas-repondre@notetonmaster.fr>',
  CONNECTORS_MODE: 'live',
};

const errorsOf = (env: Record<string, string | undefined>) => validateEnv(env).errors.join('\n');

describe('environment validation in production', () => {
  it('accepts a complete production configuration', () => {
    expect(validateEnv(good)).toEqual({ ok: true, errors: [] });
  });

  it.each([
    ['APP_URL', undefined],
    ['APP_URL', 'http://notetonmaster.fr'],
    ['DATABASE_URL', undefined],
    ['SESSION_SECRET', 'short'],
    ['SESSION_SECRET', 'dev-only-session-secret-change-me-0123456789abcdef'],
    ['SESSION_SECRET', 'ci-only-session-secret-change-me-0123456789abcdef'],
    ['APP_ENCRYPTION_KEY', 'ZGV2LW9ubHkta2V5LWNoYW5nZS1tZS0zMi1ieXRlcyE='],
    ['APP_ENCRYPTION_KEY', Buffer.from('too-short').toString('base64')],
    ['TURNSTILE_MODE', undefined],
    ['TURNSTILE_MODE', 'mock'],
    ['TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA'],
    ['TURNSTILE_SITE_KEY', '1x00000000000000000000AA'],
    ['SMTP_HOST', undefined],
    ['SMTP_HOST', 'mailpit'],
    ['CONNECTORS_MODE', 'mock'],
    ['SEED_ON_START', 'true'],
    ['DEMO_DATA', 'true'],
    ['RATE_LIMIT_MULTIPLIER', '20'],
  ])('refuses %s=%s', (key, value) => {
    const r = validateEnv({ ...good, [key]: value });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain(key);
  });

  it('a local production build needs the explicit flag, on a local address only', () => {
    const local = {
      ...good,
      APP_URL: 'http://localhost:3001',
      TURNSTILE_MODE: 'mock',
      DEMO_DATA: 'true',
    };
    expect(validateEnv(local).ok).toBe(false);
    expect(validateEnv({ ...local, ALLOW_INSECURE_LOCAL_PROD: '1' }).ok).toBe(true);
    // The flag cannot unlock a public address.
    expect(
      errorsOf({ ...local, APP_URL: 'https://notetonmaster.fr', ALLOW_INSECURE_LOCAL_PROD: '1' }),
    ).toContain('ALLOW_INSECURE_LOCAL_PROD');
  });

  it('no secret is exposed through a NEXT_PUBLIC_ variable', () => {
    expect(errorsOf({ ...good, NEXT_PUBLIC_SESSION_SECRET: 'x' })).toContain('NEXT_PUBLIC_');
  });

  it('development keeps working with the values of .env.example', () => {
    expect(validateEnv({ NODE_ENV: 'development', APP_URL: 'http://localhost:3000' }).ok).toBe(
      true,
    );
  });

  it('the server and the worker check it at startup', () => {
    expect(readFileSync('instrumentation.ts', 'utf8')).toMatch(/assertEnv\(/);
    expect(readFileSync('worker/index.ts', 'utf8')).toMatch(/assertEnv\(/);
  });

  it('the production compose file has no test key or development default', () => {
    const prod = readFileSync('docker-compose.prod.yml', 'utf8');
    expect(prod).not.toMatch(/1x0000000000000000000000000000000AA|1x00000000000000000000AA/);
    expect(prod).not.toMatch(/TURNSTILE_MODE: \$\{PROD_TURNSTILE_MODE:-mock/);
  });
});

describe('Turnstile fails closed', () => {
  it('mock mode is refused at runtime in production', async () => {
    const { turnstileMode } = await import('@/lib/turnstile');
    const saved = { ...process.env };
    Object.assign(process.env, { NODE_ENV: 'production', APP_URL: 'https://notetonmaster.fr' });
    delete process.env.TURNSTILE_MODE;
    delete process.env.ALLOW_INSECURE_LOCAL_PROD;
    try {
      expect(turnstileMode()).toBe('live');
    } finally {
      process.env = saved;
    }
  });
});
