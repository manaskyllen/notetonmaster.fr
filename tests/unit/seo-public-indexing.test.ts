/**
 * PUBLIC_INDEXING (lib/seo/site.ts): off by default in production, so that the site can be filled
 * before its cities open. Off: robots.txt disallows everything, every answer is noindex, the
 * sitemaps are empty. On: the public site is open to search engines.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import { GET as sitemapIndex } from '@/app/sitemap.xml/route';
import { GET as sitemapFile } from '@/app/sitemaps/[name]/route';
import { proxy } from '@/proxy';
import { publicIndexing, sitemapsWithheld } from '@/lib/seo/site';

const saved = { url: process.env.APP_URL, indexing: process.env.PUBLIC_INDEXING };
beforeEach(() => {
  process.env.APP_URL = 'https://notetonmaster.fr';
});
afterEach(() => {
  process.env.APP_URL = saved.url;
  if (saved.indexing === undefined) delete process.env.PUBLIC_INDEXING;
  else process.env.PUBLIC_INDEXING = saved.indexing;
});

const page = (path: string) =>
  proxy(
    new NextRequest(`https://notetonmaster.fr${path}`, {
      headers: { host: 'notetonmaster.fr', 'x-forwarded-proto': 'https' },
    }),
  );

describe('PUBLIC_INDEXING off (the default)', () => {
  beforeEach(() => {
    delete process.env.PUBLIC_INDEXING;
  });

  it('is off unless set to true, and never outside https://notetonmaster.fr', () => {
    expect(publicIndexing()).toBe(false);
    process.env.PUBLIC_INDEXING = 'false';
    expect(publicIndexing()).toBe(false);
    process.env.PUBLIC_INDEXING = 'true';
    process.env.APP_URL = 'http://localhost:3002';
    expect(publicIndexing()).toBe(false);
  });

  it('robots.txt disallows everything and gives no sitemap', () => {
    expect(robots()).toEqual({ rules: [{ userAgent: '*', disallow: '/' }] });
  });

  it('every page answers X-Robots-Tag: noindex', async () => {
    for (const path of ['/', '/a-propos', '/legal/mentions-legales']) {
      const res = await page(path);
      expect(res.headers.get('x-robots-tag'), path).toMatch(/noindex/);
    }
  });

  it('the sitemaps are empty', async () => {
    expect(sitemapsWithheld()).toBe(true);
    const index = await (await sitemapIndex()).text();
    expect(index).toContain('<sitemapindex');
    expect(index).not.toContain('<sitemap>');
    const file = await (
      await sitemapFile(new Request('https://notetonmaster.fr/sitemaps/pages.xml'), {
        params: Promise.resolve({ name: 'pages.xml' }),
      })
    ).text();
    expect(file).toContain('<urlset');
    expect(file).not.toContain('<url>');
  });
});

describe('PUBLIC_INDEXING=true', () => {
  beforeEach(() => {
    process.env.PUBLIC_INDEXING = 'true';
  });

  it('robots.txt opens the public site, keeps the private areas closed, gives the sitemap', () => {
    const r = robots();
    expect(publicIndexing()).toBe(true);
    expect(r.sitemap).toBe('https://notetonmaster.fr/sitemap.xml');
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.allow).toEqual(['/', '/avis/nouveau']);
    expect(rule.disallow).toContain('/espace');
    expect(rule.disallow).toContain('/avis');
  });

  it('the review form stays noindex although link previews may read it', async () => {
    expect((await page('/avis/nouveau')).headers.get('x-robots-tag')).toMatch(/noindex/);
  });

  it('public pages are indexable, private ones are not', async () => {
    expect((await page('/a-propos')).headers.get('x-robots-tag')).toBeNull();
    expect((await page('/espace')).headers.get('x-robots-tag')).toMatch(/noindex/);
  });

  it('the sitemaps are no longer withheld', () => {
    expect(sitemapsWithheld()).toBe(false);
  });
});
