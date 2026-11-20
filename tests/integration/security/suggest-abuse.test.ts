/** /api/suggest (home): limited per IP like /api/search, light and public, never a data-cache entry per query. */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);

const { request } = await import('../helpers/request');
const route = await import('@/app/api/suggest/route');
const guard = await import('@/lib/search-guard');

const get = (qs: string) => route.GET(new NextRequest(`http://localhost/api/suggest?${qs}`));

beforeAll(() => {
  process.env.RATE_LIMIT_MULTIPLIER = '1';
});

describe('/api/suggest', () => {
  it('answers a small public payload, cacheable for visitors without a session', async () => {
    request.reset('198.51.100.210');
    const r = await get('q=patrimoine&lieu=zone%3Anantes&entree=M1');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toMatch(/public.*stale-while-revalidate/);
    const body = await r.json();
    expect(Object.keys(body).sort()).toEqual(
      ['count', 'mentions', 'notYet', 'programs', 'q', 'universities'].sort(),
    );
    expect(
      body.programs.length + body.mentions.length + body.universities.length,
    ).toBeLessThanOrEqual(9);
    const count = await (await get('q=patrimoine&lieu=zone%3Anantes&entree=M1&mode=count')).json();
    expect(count).toEqual({ q: 'patrimoine', count: body.count });
  });

  it('an empty query is refused (the page holds those counts)', async () => {
    expect((await get('q=')).status).toBe(400);
  });

  it('answers 429 past the limit of one IP (shared with /api/search)', async () => {
    request.reset('198.51.100.211');
    let last = 200;
    for (let i = 0; i < guard.SEARCH_PER_MINUTE + 1; i++)
      last = (await get(`q=droit${i % 3}`)).status;
    expect(last).toBe(429);
  });

  it('no server data-cache entry keyed by the raw query', () => {
    expect(readFileSync('app/api/suggest/route.ts', 'utf8')).not.toMatch(/unstable_cache/);
  });
});
