/** « Importer un livret » (rôle Données) cannot be used to reach the internal network. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/auth/admin', async () => {
  const { can } = await import('@/lib/domain/permissions');
  const admin = { id: 'test-data-editor', name: 'Données', email: 'd@x', role: 'DATA_EDITOR' };
  const mod = {
    // Re-authentication is tested apart (tests/integration/security/admin-auth.test.ts).
    guardSensitive: (...a: unknown[]) =>
      (mod as { guard: (...x: unknown[]) => unknown }).guard(...a),
    guard: async (permission: string, fn: (a: typeof admin) => unknown) =>
      can(admin.role as never, permission as never) ? fn(admin) : { ok: false, error: 'refusé' },
  };
  return mod;
});

const fetched: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
  fetched.push(String(u));
  return realFetch(u, init);
}) as typeof fetch;

const { prisma } = await import('@/lib/db');
const { importBooklet } = await import('@/app/admin/(panel)/fiches/[id]/actions');
let programId = '';

beforeAll(async () => {
  programId = (await programBySlug(FX.programs.illkirch))!.id;
});

describe('importBooklet', () => {
  it.each([
    'http://127.0.0.1:3000/api/health',
    'https://localhost/',
    'https://169.254.169.254/latest/meta-data/',
    'http://db:5432/',
    'https://app:3000/',
    'https://[::1]/',
    'https://10.0.0.1/',
  ])('refuses %s without sending any request', async (url) => {
    fetched.length = 0;
    const r = await importBooklet(programId, url);
    expect(r).toMatchObject({ ok: false });
    expect(fetched.filter((u) => !u.includes('challenges.cloudflare.com'))).toEqual([]);
  });

  it('refuses plain http unless CRAWLER_ALLOW_HTTP=true', async () => {
    delete process.env.CRAWLER_ALLOW_HTTP;
    const r = await importBooklet(programId, 'http://www.example.org/livret');
    expect(r).toMatchObject({ ok: false });
  });
});
