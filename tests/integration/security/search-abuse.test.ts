/** /api/search: limited per IP, and its cache stays bounded whatever the queries sent. */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);

const { request } = await import('../helpers/request');
const route = await import('@/app/api/search/route');
const guard = await import('@/lib/search-guard');

const get = (q: string) =>
  route.GET(
    new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}&types=program`),
  );

beforeAll(() => {
  process.env.RATE_LIMIT_MULTIPLIER = '1';
});

describe('/api/search', () => {
  it('answers 429 past the limit of one IP, other IPs unaffected', async () => {
    request.reset('198.51.100.200');
    let last = 200;
    for (let i = 0; i < guard.SEARCH_PER_MINUTE + 1; i++)
      last = (await get(`nantes ${i % 3}`)).status;
    expect(last).toBe(429);
    request.reset('198.51.100.201');
    expect((await get('nantes')).status).toBe(200);
  });

  it('the cache keeps a bounded number of answers', async () => {
    guard.clearSearchCache();
    for (let i = 0; i < guard.SEARCH_CACHE_MAX + 50; i++)
      await guard.cachedSearch(`q${i}`, async () => i);
    expect(guard.searchCacheSize()).toBe(guard.SEARCH_CACHE_MAX);
    // The most recent answers are the ones kept.
    expect(await guard.cachedSearch(`q${guard.SEARCH_CACHE_MAX + 49}`, async () => -1)).toBe(
      guard.SEARCH_CACHE_MAX + 49,
    );
  });

  it('no server data-cache entry keyed by the raw query', () => {
    expect(readFileSync('app/api/search/route.ts', 'utf8')).not.toMatch(/unstable_cache/);
  });
});
