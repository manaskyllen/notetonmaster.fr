/** Indexing rules: canonical redirects, list variants, private areas (lib/seo). */
import { afterEach, describe, expect, it } from 'vitest';
import { isPrivatePath, listIndexing } from '@/lib/seo/meta';
import { absoluteUrl, canonicalRedirect, isProductionSite, siteOrigin } from '@/lib/seo/site';

const PROD = 'https://notetonmaster.fr';
const req = (o: Partial<{ host: string; proto: string; pathname: string; search: string }>) => ({
  host: 'notetonmaster.fr',
  proto: 'https',
  pathname: '/',
  search: '',
  ...o,
});

describe('canonical origin', () => {
  const saved = process.env.APP_URL;
  afterEach(() => {
    process.env.APP_URL = saved;
  });
  it('comes from APP_URL, never from the code; production only on https://notetonmaster.fr', () => {
    process.env.APP_URL = 'https://notetonmaster.fr/';
    expect(siteOrigin()).toBe(PROD);
    expect(isProductionSite()).toBe(true);
    expect(absoluteUrl('/parcours/x')).toBe(`${PROD}/parcours/x`);
    process.env.APP_URL = 'http://localhost:3002';
    expect(isProductionSite()).toBe(false);
    expect(absoluteUrl('/a')).toBe('http://localhost:3002/a');
  });
});

describe('301 to the canonical form', () => {
  it('www, .com and http → https://notetonmaster.fr, same path and query', () => {
    expect(
      canonicalRedirect(
        req({ host: 'www.notetonmaster.fr', pathname: '/explorer', search: '?q=droit' }),
        PROD,
      ),
    ).toBe(`${PROD}/explorer?q=droit`);
    expect(
      canonicalRedirect(req({ host: 'notetonmaster.com', pathname: '/parcours/x' }), PROD),
    ).toBe(`${PROD}/parcours/x`);
    expect(canonicalRedirect(req({ host: 'www.notetonmaster.com' }), PROD)).toBe(`${PROD}/`);
    expect(canonicalRedirect(req({ proto: 'http', pathname: '/mentions' }), PROD)).toBe(
      `${PROD}/mentions`,
    );
    expect(canonicalRedirect(req({ pathname: '/mentions' }), PROD)).toBeNull();
  });
  it('capitals of a public address and a trailing slash, everywhere', () => {
    expect(canonicalRedirect(req({ pathname: '/Mentions/Droit/' }), PROD)).toBe(
      `${PROD}/mentions/droit`,
    );
    expect(canonicalRedirect(req({ pathname: '/explorer/', search: '?page=2' }), PROD)).toBe(
      `${PROD}/explorer?page=2`,
    );
    // tokens are case sensitive: never lowered
    expect(canonicalRedirect(req({ pathname: '/connexion/lien/AbC' }), PROD)).toBeNull();
    // outside production: same rules on the host used, never to the production host
    expect(
      canonicalRedirect(
        req({ host: 'localhost:3002', proto: 'http', pathname: '/Explorer' }),
        'http://localhost:3002',
      ),
    ).toBe('http://localhost:3002/explorer');
    expect(
      canonicalRedirect(req({ host: 'app:3000', proto: 'http', pathname: '/api/health' }), PROD),
    ).toBeNull();
  });
});

describe('list variants', () => {
  it('the bare list and its pages are indexable, each page with its own canonical', () => {
    expect(listIndexing('/mentions/droit', {})).toEqual({
      canonical: '/mentions/droit',
      noindex: false,
      page: 1,
    });
    expect(listIndexing('/mentions/droit', { page: '3' })).toEqual({
      canonical: '/mentions/droit?page=3',
      noindex: false,
      page: 3,
    });
  });
  it('a filter, a sort or a search: noindex, canonical to the list without filters', () => {
    expect(listIndexing('/mentions/droit', { tri: 'notes', page: '2' })).toEqual({
      canonical: '/mentions/droit',
      noindex: true,
      page: 2,
    });
    expect(listIndexing('/universites/x', { q: 'patrimoine' }).noindex).toBe(true);
    expect(listIndexing('/universites/x', { q: '' }).noindex).toBe(false);
  });
  it('strict (Explorer, home): only the bare address is indexable', () => {
    expect(listIndexing('/explorer', {}, { strict: true }).noindex).toBe(false);
    expect(listIndexing('/explorer', { page: '2' }, { strict: true })).toEqual({
      canonical: '/explorer?page=2',
      noindex: true,
      page: 2,
    });
  });
});

describe('private areas', () => {
  it('account, admin, sign-in, magic link, review form, report, API', () => {
    for (const p of [
      '/espace',
      '/espace/avis',
      '/admin/login',
      '/connexion',
      '/connexion/lien/x',
      '/avis/nouveau',
      '/signaler',
      '/api/search',
      '/reponse-formation',
    ])
      expect(isPrivatePath(p), p).toBe(true);
    for (const p of [
      '/',
      '/explorer',
      '/parcours/x',
      '/masters/nantes',
      '/a-propos',
      '/legal/charte',
    ])
      expect(isPrivatePath(p), p).toBe(false);
  });
});
