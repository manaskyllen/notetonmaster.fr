/**
 * HTTP checks of scripts/test-deploy.sh, run in a container on the proxy network:
 *
 *   node test-deploy-http.mjs <base> <indexing: on|off>
 *
 * The requests carry the headers the gateway writes (Host, X-Forwarded-*), as for a visitor of
 * https://notetonmaster.fr. Prints ✅ / ❌ per check and exits with 1 on any failure.
 */
const [base, state] = process.argv.slice(2);
const on = state === 'on';
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` (${detail})`}`);
  if (!ok) failures.push(label);
};
const get = (path) =>
  fetch(base + path, {
    redirect: 'manual',
    headers: {
      'x-forwarded-host': 'notetonmaster.fr',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '198.51.100.7',
    },
    signal: AbortSignal.timeout(30_000),
  });

// An empty database: every page answers, without error.
for (const path of [
  '/',
  '/explorer',
  '/explorer?q=droit',
  '/mentions',
  '/universites',
  '/masters',
]) {
  const r = await get(path);
  const html = await r.text();
  check(`${path} répond 200`, r.status === 200, String(r.status));
  check(`${path} sans page d'erreur`, !/Application error|Une erreur est survenue/i.test(html));
}
for (const path of ['/cette-page-n-existe-pas', '/parcours/inexistant', '/masters/inexistante']) {
  const r = await get(path);
  check(`${path} répond 404`, r.status === 404, String(r.status));
}
const health = await (await get('/api/health')).json();
check('/api/health ok', health.status === 'ok', JSON.stringify(health));

// Indexing.
const robots = await (await get('/robots.txt')).text();
const disallowAll = /^Disallow:\s*\/\s*$/m.test(robots);
check(
  on ? 'robots.txt ouvre le site' : 'robots.txt interdit tout',
  on ? !disallowAll : disallowAll,
  robots,
);
const tag = (await get('/a-propos')).headers.get('x-robots-tag') ?? '';
check(
  on ? '/a-propos indexable' : '/a-propos : X-Robots-Tag noindex',
  on ? !/noindex/.test(tag) : /noindex/.test(tag),
  tag || 'absent',
);
const sitemap = await (await get('/sitemap.xml')).text();
check(
  on ? 'sitemap.xml liste ses fichiers' : 'sitemap.xml vide',
  on ? /<sitemap>/.test(sitemap) : !/<sitemap>/.test(sitemap),
  sitemap.slice(0, 200),
);
const pages = await (await get('/sitemaps/pages.xml')).text();
check(
  on ? 'sitemaps/pages.xml liste les pages' : 'sitemaps/pages.xml vide',
  on ? /<url>/.test(pages) : !/<url>/.test(pages),
);

process.exit(failures.length ? 1 : 0);
