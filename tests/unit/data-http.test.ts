/** robots.txt, TDMRep and the polite HTTP client, with a fake fetch: no network. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HttpError, MemoryHostStore, PoliteHttpClient, OPEN_DATA_PATTERNS } from '@/lib/data/http';
import { isAllowed, parseRobots, robotsForStatus } from '@/lib/data/robots';
import { isReservedByFile, parseTdmRep, robotsDirectives } from '@/lib/data/tdm';

const UA = 'notetonmasterBot/1.0 (+https://example.test/robot)';

describe('robots.txt', () => {
  it('Mon Master: everything forbidden but the home page', () => {
    const r = parseRobots(readFileSync('fixtures/live/monmaster-fiches/robots.txt', 'utf8'));
    expect(isAllowed(r, UA, '/').allowed).toBe(true);
    expect(isAllowed(r, UA, '/formation/2500101KDKQN').allowed).toBe(false);
    expect(isAllowed(r, UA, '/api/candidat/formations').allowed).toBe(false);
  });

  it('ESR portal: /api/ is disallowed for every robot', () => {
    const r = parseRobots(
      'User-agent: Twitterbot\nDisallow:\n\nUser-agent: *\nDisallow: /api/\nDisallow: /explore/dataset/*/download\n',
    );
    expect(
      isAllowed(r, UA, '/api/explore/v2.1/catalog/datasets/fr-esr-mon_master/exports/csv').allowed,
    ).toBe(false);
    expect(isAllowed(r, UA, '/explore/dataset/fr-esr-mon_master/download').allowed).toBe(false);
    expect(isAllowed(r, UA, '/explore/dataset/fr-esr-mon_master/').allowed).toBe(true);
  });

  it('our own group wins over *, longest match wins, allow wins a tie, $ anchors', () => {
    const r = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: notetonmasterBot\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\nCrawl-delay: 7\n',
    );
    expect(isAllowed(r, UA, '/formation').allowed).toBe(true);
    expect(isAllowed(r, UA, '/private/x').allowed).toBe(false);
    expect(isAllowed(r, UA, '/private/public/x').allowed).toBe(true);
    expect(isAllowed(r, UA, '/livret.pdf').allowed).toBe(false);
    expect(isAllowed(r, UA, '/livret.pdf?v=2').allowed).toBe(true);
    expect(isAllowed(r, UA, '/x').crawlDelay).toBe(7);
  });

  it('K-Sup sites of Nantes UFRs allow formation pages', () => {
    const r = parseRobots(
      readFileSync('fixtures/live/univ-sites/nantes/robots_histoire.univ-nantes.fr.txt', 'utf8'),
    );
    expect(
      isAllowed(r, UA, '/offre-de-formation/offre-de-formation/fiche-formation-master-ccs-hacm')
        .allowed,
    ).toBe(true);
    expect(isAllowed(r, UA, '/action/print').allowed).toBe(false);
    expect(r.sitemaps).toEqual(['https://histoire.univ-nantes.fr/seo/sitemap.xml']);
  });

  it('missing file allows all, unreachable file forbids all', () => {
    expect(isAllowed(robotsForStatus(404, ''), UA, '/x').allowed).toBe(true);
    expect(isAllowed(robotsForStatus(503, ''), UA, '/x').allowed).toBe(false);
  });
});

describe('TDMRep and robots directives', () => {
  it('reserves by the most specific location', () => {
    const rules = parseTdmRep(
      '[{"location":"/*","tdm-reservation":0},{"location":"/livrets/*","tdm-reservation":1}]',
    );
    expect(isReservedByFile(rules, '/formation')).toBe(false);
    expect(isReservedByFile(rules, '/livrets/vnp.pdf')).toBe(true);
    expect(parseTdmRep('not json')).toEqual([]);
  });
  it('reads noindex from X-Robots-Tag and meta', () => {
    expect(robotsDirectives(new Headers({ 'x-robots-tag': 'noindex' })).noindex).toBe(true);
    expect(
      robotsDirectives(new Headers(), '<meta name="robots" content="index,nofollow">'),
    ).toEqual({ noindex: false, nofollow: true });
  });
});

type Route = (url: string, init: RequestInit) => Response | Promise<Response>;
function fakeClient(
  routes: Record<string, Route>,
  extra: Partial<ConstructorParameters<typeof PoliteHttpClient>[0]> = {},
) {
  const calls: { url: string; at: number }[] = [];
  let clock = 1_000_000;
  const client = new PoliteHttpClient({
    userAgent: UA,
    allowedDomains: ['example.test', 'univ.test'],
    minDelayMs: 2000,
    store: new MemoryHostStore(),
    now: () => clock,
    sleep: async (ms) => void (clock += ms),
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, at: clock });
      const route = routes[url] ?? routes[new URL(url).pathname];
      if (!route) return new Response('not found', { status: 404 });
      return route(url, init ?? {});
    }) as typeof fetch,
    ...extra,
  });
  return { client, calls, events: [] as unknown[] };
}

describe('PoliteHttpClient', () => {
  it('skips what robots.txt forbids, without requesting it', async () => {
    const { client, calls } = fakeClient({
      '/robots.txt': () => new Response('User-agent: *\nDisallow: /prive/'),
      'https://example.test/prive/x': () => new Response('secret'),
    });
    const r = await client.get('https://example.test/prive/x');
    expect(r.kind).toBe('skip');
    expect(calls.map((c) => new URL(c.url).pathname)).not.toContain('/prive/x');
  });

  it('applies the open-data exception only to declared URLs (still TDMRep-checked)', async () => {
    const url =
      'https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-mon_master/exports/csv?delimiter=%3B';
    const events: string[] = [];
    const { client, calls } = fakeClient(
      {
        '/robots.txt': () => new Response('User-agent: *\nDisallow: /api/'),
        [url]: () => new Response('a;b\n1;2', { headers: { 'content-type': 'text/csv' } }),
        'https://data.enseignementsup-recherche.gouv.fr/api/records/1.0/search': () =>
          new Response('{}'),
      },
      {
        allowedDomains: ['data.enseignementsup-recherche.gouv.fr'],
        openDataExceptions: [OPEN_DATA_PATTERNS.esr('fr-esr-mon_master')],
        onEvent: (e) => void events.push(e.type),
      },
    );
    const ok = await client.get(url, { accept: ['csv'] });
    expect(ok.kind).toBe('response');
    expect(events).toContain('open-data-exception');
    const other = await client.get(
      'https://data.enseignementsup-recherche.gouv.fr/api/records/1.0/search',
    );
    expect(other.kind).toBe('skip');
    expect(calls.some((c) => c.url.includes('/api/records'))).toBe(false);
  });

  it('waits at least the delay between two requests to the same host, and honours Crawl-delay', async () => {
    const { client, calls } = fakeClient({
      '/robots.txt': () => new Response('User-agent: *\nCrawl-delay: 5\n'),
      '/a': () => new Response('a', { headers: { 'content-type': 'text/html' } }),
      '/b': () => new Response('b', { headers: { 'content-type': 'text/html' } }),
    });
    await client.get('https://example.test/a');
    await client.get('https://example.test/b');
    const a = calls.find((c) => c.url.endsWith('/a'))!;
    const b = calls.find((c) => c.url.endsWith('/b'))!;
    expect(b.at - a.at).toBeGreaterThanOrEqual(5000);
  });

  it('never follows a redirect outside the allowed domains', async () => {
    const { client } = fakeClient({
      '/robots.txt': () => new Response(''),
      '/go': () =>
        new Response(null, { status: 302, headers: { location: 'https://evil.test/x' } }),
    });
    await expect(client.get('https://example.test/go')).rejects.toBeInstanceOf(HttpError);
  });

  it('refuses hosts outside the list and denied test hosts', async () => {
    const { client } = fakeClient(
      {},
      { allowedDomains: ['univ-nantes.fr'], deniedHosts: [/\.testksup\./] },
    );
    expect((await client.get('https://histoire.testksup.univ-nantes.fr/x')).kind).toBe('skip');
    expect((await client.get('https://other.fr/x')).kind).toBe('skip');
  });

  it('retries 429 with Retry-After, then pauses the host after 3 failures', async () => {
    const events: string[] = [];
    const { client } = fakeClient(
      {
        '/robots.txt': () => new Response(''),
        '/busy': () => new Response('slow down', { status: 429, headers: { 'retry-after': '30' } }),
      },
      { onEvent: (e) => void events.push(e.type) },
    );
    await expect(client.get('https://example.test/busy')).rejects.toThrow(/pause/);
    expect(events.filter((e) => e === 'retry')).toHaveLength(2);
    expect(events).toContain('host-paused');
    const again = await client.get('https://example.test/busy');
    expect(again.kind).toBe('skip');
  });

  it('refuses a body larger than the limit and an unexpected content type', async () => {
    const { client } = fakeClient({
      '/robots.txt': () => new Response(''),
      '/big': () =>
        new Response('x'.repeat(2000), { headers: { 'content-type': 'application/pdf' } }),
      '/page': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    });
    await expect(
      client.get('https://example.test/big', { maxBytes: 1000, accept: ['pdf'] }),
    ).rejects.toThrow(/trop gros/);
    await expect(client.get('https://example.test/page', { accept: ['pdf'] })).rejects.toThrow(
      /Type de contenu/,
    );
  });

  it('skips a page reserved by the tdm-reservation header', async () => {
    const { client } = fakeClient({
      '/robots.txt': () => new Response(''),
      '/r': () =>
        new Response('x', { headers: { 'content-type': 'text/html', 'tdm-reservation': '1' } }),
    });
    expect((await client.get('https://example.test/r')).kind).toBe('skip');
  });
});
