/**
 * HTTP headers of the site, and the origin check of the requests that change something
 * (Server Actions, API routes): only the site's own address (APP_URL).
 */
import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '@/lib/security/origin';

async function headersFor(path: string, appUrl = 'https://notetonmaster.fr') {
  process.env.APP_URL = appUrl;
  const { default: config } = await import('../../../next.config');
  const rules = await config.headers!();
  const out = new Map<string, string>();
  for (const r of rules) {
    const re = new RegExp(`^${r.source.replace(/:path\*/g, '.*').replace(/:\w+/g, '[^/]+')}$`);
    if (re.test(path)) for (const h of r.headers) out.set(h.key.toLowerCase(), h.value);
  }
  return out;
}

describe('security headers', () => {
  it('HSTS: one year, sub-domains, no preload, sent by the application over HTTPS only', async () => {
    const h = await headersFor('/');
    expect(h.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect((await headersFor('/', 'http://localhost:3000')).has('strict-transport-security')).toBe(
      false,
    );
  });

  it('COOP and CORP on every page, also in local http', async () => {
    for (const url of ['https://notetonmaster.fr', 'http://localhost:3000']) {
      const h = await headersFor('/parcours/x', url);
      expect(h.get('cross-origin-opener-policy')).toBe('same-origin');
      expect(h.get('cross-origin-resource-policy')).toBe('same-origin');
      expect(h.get('x-content-type-options')).toBe('nosniff');
      expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(h.get('permissions-policy')).toMatch(/camera=\(\)/);
    }
  });

  it('Open Graph images can be embedded elsewhere', async () => {
    expect((await headersFor('/og/parcours/x.png')).get('cross-origin-resource-policy')).toBe(
      'cross-origin',
    );
  });

  it.each(['/connexion/lien/abc', '/avis/confirmer/abc', '/reponse/abc', '/admin/invitation/abc'])(
    'no referrer at all on the page of a link carrying a token (%s)',
    async (path) => {
      expect((await headersFor(path)).get('referrer-policy')).toBe('no-referrer');
    },
  );
});

describe('origin of requests that change something', () => {
  const prod = { NODE_ENV: 'production', APP_URL: 'https://notetonmaster.fr' };
  it('accepts the site itself only', () => {
    expect(isAllowedOrigin('https://notetonmaster.fr', prod)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', prod)).toBe(false);
    expect(isAllowedOrigin('https://notetonmaster.fr.evil.example', prod)).toBe(false);
    expect(isAllowedOrigin('http://notetonmaster.fr', prod)).toBe(false);
    expect(isAllowedOrigin(null, prod)).toBe(false);
    expect(isAllowedOrigin('null', prod)).toBe(false);
  });
  it('the dev stack also accepts its Playwright alias, never in production', () => {
    const dev = { NODE_ENV: 'development', APP_URL: 'http://localhost:3000' };
    expect(isAllowedOrigin('http://web:3000', dev)).toBe(true);
    expect(isAllowedOrigin('http://web:3000', prod)).toBe(false);
  });
});
