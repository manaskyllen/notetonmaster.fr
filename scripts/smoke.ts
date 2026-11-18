/**
 * Smoke test, read-only: `pnpm smoke --url=https://notetonmaster.fr` (or a local production build,
 * http://localhost:3002). Only GET and HEAD requests: it never creates anything.
 *
 * - key pages answer 200, the 404 page answers 404;
 * - security headers present (CSP with nonce, frame-ancestors, nosniff, Referrer-Policy,
 *   Permissions-Policy, COOP, CORP; HSTS sent once over HTTPS);
 * - no demo, debug or seed route;
 * - on https://notetonmaster.fr, consistent with PUBLIC_INDEXING: indexing open (robots.txt
 *   opens the public site, no public page is noindex, the sitemap lists its files) or closed
 *   (robots.txt disallows everything, every page is noindex, the sitemap is empty).
 * Prints ✅ / ❌ per check and exits with 1 on any failure.
 */
const arg = (name: string, fallback: string) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? fallback;

const BASE = arg('url', 'http://localhost:3000').replace(/\/$/, '');
const PRODUCTION = BASE === 'https://notetonmaster.fr';
const HTTPS = BASE.startsWith('https://');

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const check = (label: string, ok: boolean, detail?: string) => checks.push({ label, ok, detail });

async function get(path: string, init: RequestInit = {}) {
  return fetch(BASE + path, {
    redirect: 'manual',
    headers: { 'user-agent': 'notetonmaster-smoke/1.0', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
}

const PUBLIC_PAGES = [
  '/',
  '/explorer',
  '/masters',
  '/mentions',
  '/universites',
  '/a-propos',
  '/connexion',
  '/signaler',
];

async function main() {
  // Key pages.
  for (const p of [...PUBLIC_PAGES, '/admin/login', '/api/health', '/robots.txt', '/sitemap.xml']) {
    const r = await get(p);
    check(`${p} répond 200`, r.status === 200, String(r.status));
  }
  const missing = await get('/cette-page-n-existe-pas');
  check('une page inconnue répond 404', missing.status === 404, String(missing.status));

  // Security headers on a public page and on the admin login.
  for (const p of ['/', '/admin/login']) {
    const h = (await get(p)).headers;
    const csp = h.get('content-security-policy') ?? '';
    check(
      `${p} : CSP avec nonce, sans unsafe-inline pour les scripts`,
      /script-src[^;]*'nonce-/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp),
    );
    check(
      `${p} : CSP frame-ancestors 'none', object-src 'none', base-uri 'self'`,
      /frame-ancestors 'none'/.test(csp) &&
        /object-src 'none'/.test(csp) &&
        /base-uri 'self'/.test(csp),
    );
    check(`${p} : X-Content-Type-Options nosniff`, h.get('x-content-type-options') === 'nosniff');
    check(`${p} : Referrer-Policy`, h.get('referrer-policy') === 'strict-origin-when-cross-origin');
    check(`${p} : Permissions-Policy`, /camera=\(\)/.test(h.get('permissions-policy') ?? ''));
    check(
      `${p} : Cross-Origin-Opener-Policy`,
      h.get('cross-origin-opener-policy') === 'same-origin',
    );
    check(
      `${p} : Cross-Origin-Resource-Policy`,
      h.get('cross-origin-resource-policy') === 'same-origin',
    );
    check(`${p} : X-Powered-By absent`, !h.has('x-powered-by'));
    check(`${p} : pas de CORS ouvert`, h.get('access-control-allow-origin') !== '*');
    if (HTTPS) {
      const hsts = h.get('strict-transport-security') ?? '';
      // Two senders (the app and the proxy) would show as two comma-separated values.
      check(
        `${p} : HSTS un an, une seule fois`,
        hsts === 'max-age=31536000; includeSubDomains',
        hsts || 'absent',
      );
    }
  }
  const token = (await get('/connexion/lien/smoke-test')).headers.get('referrer-policy');
  check(
    'page de lien de connexion : Referrer-Policy no-referrer',
    token === 'no-referrer',
    token ?? 'absent',
  );

  // No demo, debug or seed route.
  // The demo invitation and the design system exist on purpose in a local build with the demo
  // data (ALLOW_INSECURE_LOCAL_PROD, local APP_URL only): checked over HTTPS.
  const demoRoutes = HTTPS ? ['/admin/invitation/demo-invitation-juridique', '/design-system'] : [];
  for (const p of ['/api/debug', '/api/seed', '/api/demo', '/_next/webpack-hmr', ...demoRoutes]) {
    const r = await get(p);
    const body = r.status === 200 ? await r.text() : '';
    const exposed = r.status === 200 && !/Invitation expirée/.test(body);
    check(`${p} n’est pas exposé`, !exposed, String(r.status));
  }

  // Indexing, on the production site only: consistent with PUBLIC_INDEXING, whichever it is.
  if (PRODUCTION) {
    const robots = await (await get('/robots.txt')).text();
    const star = robots.split(/User-agent:/i).find((b) => /^\s*\*/.test(b)) ?? '';
    const open = !/^\s*Disallow:\s*\/\s*$/im.test(star);
    console.log(`Indexation ${open ? 'ouverte' : 'fermée'} (PUBLIC_INDEXING=${open})`);
    for (const p of PUBLIC_PAGES.filter((x) => x !== '/connexion' && x !== '/signaler')) {
      const r = await get(p);
      const html = await r.text();
      const noindex =
        /noindex/i.test(r.headers.get('x-robots-tag') ?? '') ||
        /<meta[^>]+name="robots"[^>]+noindex/i.test(html);
      check(open ? `${p} indexable (pas de noindex)` : `${p} : noindex`, open ? !noindex : noindex);
    }
    const sm = await get('/sitemap.xml');
    const xml = await sm.text();
    check('sitemap.xml répond en XML', sm.status === 200 && /<sitemapindex|<urlset/.test(xml));
    check(
      open ? 'sitemap.xml liste les sitemaps' : 'sitemap.xml vide',
      open === /<sitemap>/.test(xml),
    );
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks)
    console.log(`${c.ok ? '✅' : '❌'} ${c.label}${!c.ok && c.detail ? ` (${c.detail})` : ''}`);
  console.log(
    `\n${BASE} : ${checks.length - failed.length}/${checks.length} vérifications passées.`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`❌ ${BASE} injoignable : ${(e as Error).message}`);
  process.exit(1);
});

export {};
