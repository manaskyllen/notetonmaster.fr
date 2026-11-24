/**
 * SEO check of a running site (`pnpm seo:check -- --url=http://localhost:3002`), from its
 * sitemap: a production build started in CI, or https://notetonmaster.fr by hand after a deploy.
 * Fails (exit 1) when:
 * - a title or a description is missing, duplicated or outside the lengths aimed at;
 * - an indexable page has no canonical, or a canonical that is not itself;
 * - a page of the sitemap is noindex or does not answer 200;
 * - a JSON-LD block is invalid, or its BreadcrumbList differs from the visible breadcrumb;
 * - a page does not have exactly one h1;
 * - an internal link is broken (4xx / 5xx);
 * - an indexable page is orphan (no link from another indexable page);
 * - Open Graph tags are missing;
 * - a guide (/guides/{slug}) has a title over 60 characters, a description outside 120–155, or
 *   a token or a data block left unresolved in its page.
 *
 * Outside production (any origin but https://notetonmaster.fr) the whole site answers
 * `X-Robots-Tag: noindex, nofollow` and its robots.txt disallows everything: the check expects
 * that header and does not count it as a page noindex.
 *
 * Options: --concurrency=6, --json=report.json, --max-links-per-path=2,
 *          --audit=/,/explorer (one line per page: no sitemap crawl, for docs/seo/audit.md).
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { headingJumps, isNoindex, readPage, type PageFacts } from '../lib/seo/html';
import { breadcrumbNames, checkJsonLd, typesOf } from '../lib/seo/jsonld-check';
import { CANONICAL_ORIGIN, DESCRIPTION, TITLE } from '../lib/seo/rules';
import { META_MAX, META_MIN, TITLE_MAX } from '../lib/articles/model';

const GUIDE = { title: TITLE_MAX, metaMin: META_MIN, metaMax: META_MAX };

const arg = (k: string, d?: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;

const BASE = (arg('url') ?? process.env.SEO_CHECK_URL ?? '').replace(/\/$/, '');
if (!BASE) {
  console.error('Usage : pnpm seo:check -- --url=http://localhost:3002');
  process.exit(2);
}
const ORIGIN = new URL(BASE).origin;
const PRODUCTION = ORIGIN === CANONICAL_ORIGIN;
const CONCURRENCY = Number(arg('concurrency', PRODUCTION ? '3' : '6'));
const PER_PATH = Number(arg('max-links-per-path', '2'));
const UA = 'notetonmaster-seo-check/1.0';

interface Fetched {
  url: string;
  status: number;
  location: string | null;
  xRobots: string | null;
  html: string | null;
  ms: number;
}

async function get(url: string, attempt = 0): Promise<Fetched> {
  const t = performance.now();
  try {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(30_000),
    });
    const type = r.headers.get('content-type') ?? '';
    const html = /html|xml|text\/plain/.test(type) ? await r.text() : (await r.arrayBuffer(), null);
    return {
      url,
      status: r.status,
      location: r.headers.get('location'),
      xRobots: r.headers.get('x-robots-tag'),
      html,
      ms: performance.now() - t,
    };
  } catch (e) {
    if (attempt < 2) return get(url, attempt + 1);
    return { url, status: 0, location: String(e), xRobots: null, html: null, ms: 0 };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

/** Same-origin page links, without hash; assets, mail and API left out. */
function internal(href: string, from: string): string | null {
  if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return null;
  let u: URL;
  try {
    u = new URL(href, from);
  } catch {
    return null;
  }
  if (u.origin !== ORIGIN) return null;
  if (/^\/(_next|api)\//.test(u.pathname)) return null;
  u.hash = '';
  return u.toString();
}

/** The sitemap URLs, from robots.txt (or /sitemap.xml), following sitemap indexes. */
async function sitemapUrls(): Promise<{ urls: string[]; sitemaps: string[]; robots: string }> {
  const robots = await get(`${BASE}/robots.txt`);
  const listed = [...(robots.html ?? '').matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]!);
  const queue = listed.length ? listed : [`${BASE}/sitemap.xml`];
  const urls: string[] = [];
  const seen = new Set<string>();
  const sitemaps: string[] = [];
  while (queue.length) {
    const raw = queue.shift()!;
    // A local build may announce another origin (APP_URL): read it on the checked one.
    const sm = ORIGIN + new URL(raw).pathname + new URL(raw).search;
    if (seen.has(sm)) continue;
    seen.add(sm);
    sitemaps.push(sm);
    const r = await get(sm);
    if (r.status !== 200 || !r.html) {
      errors.push({ rule: 'sitemap', url: sm, detail: `répond ${r.status}` });
      continue;
    }
    const locs = [...r.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
      m[1]!.replace(/&amp;/g, '&'),
    );
    if (/<sitemapindex/.test(r.html)) queue.push(...locs);
    else urls.push(...locs);
    if (/<urlset/.test(r.html) && !/<lastmod>/.test(r.html) && locs.length)
      warnings.push({ rule: 'sitemap', url: sm, detail: 'aucun lastmod' });
  }
  return { urls, sitemaps, robots: robots.html ?? '' };
}

interface Issue {
  rule: string;
  url: string;
  detail: string;
}
const errors: Issue[] = [];
const warnings: Issue[] = [];

function pageChecks(url: string, f: Fetched, p: PageFacts, inSitemap: boolean) {
  const err = (rule: string, detail: string) => errors.push({ rule, url, detail });
  const warn = (rule: string, detail: string) => warnings.push({ rule, url, detail });
  if (p.titleCount !== 1) err('title', `${p.titleCount} balises <title>`);
  if (!p.title) err('title', 'manquant');
  else if (p.title.length < TITLE.min || p.title.length > TITLE.max)
    err(
      'title',
      `${p.title.length} caractères (attendu ${TITLE.min}–${TITLE.max}) : « ${p.title} »`,
    );
  if (!p.description) err('description', 'manquante');
  else if (p.description.length < DESCRIPTION.min || p.description.length > DESCRIPTION.max)
    err(
      'description',
      `${p.description.length} caractères (attendu ${DESCRIPTION.min}–${DESCRIPTION.max}) : « ${p.description} »`,
    );
  if (!p.metaInHead) err('head', 'title / description hors du <head> (métadonnées en streaming)');
  if (p.h1.length !== 1)
    err('h1', `${p.h1.length} h1${p.h1.length ? ` : ${p.h1.join(' | ')}` : ''}`);
  for (const j of headingJumps(p.headings)) warn('titres', `saut de niveau ${j}`);
  if (!p.canonical) err('canonique', 'manquante');
  else if (p.canonical !== (inSitemap ? (sitemapForm.get(url) ?? url) : url)) {
    const own = new URL(p.canonical);
    const here = new URL(url);
    if (own.pathname + own.search !== here.pathname + here.search)
      err('canonique', `pointe vers ${p.canonical}`);
    else if (own.origin !== expectedOrigin)
      err('canonique', `origine ${own.origin} (attendu ${expectedOrigin}, APP_URL)`);
  }
  for (const e of p.jsonLdErrors) err('json-ld', e);
  const visible = p.breadcrumb;
  for (const block of p.jsonLd) {
    for (const e of checkJsonLd(block)) err('json-ld', e);
    const names = breadcrumbNames(block);
    if (names && visible.length && names.join(' › ') !== visible.join(' › '))
      err(
        'json-ld',
        `fil d’Ariane différent du visible : ${names.join(' › ')} ≠ ${visible.join(' › ')}`,
      );
  }
  if (visible.length > 1 && !p.jsonLd.some((b) => breadcrumbNames(b)))
    err('json-ld', 'fil d’Ariane visible sans BreadcrumbList');
  for (const k of [
    'og:title',
    'og:description',
    'og:url',
    'og:type',
    'og:locale',
    'og:image',
    'twitter:card',
  ])
    if (!p.og[k]) err('open-graph', `${k} manquant`);
  if (p.og['og:locale'] && p.og['og:locale'] !== 'fr_FR')
    err('open-graph', `og:locale ${p.og['og:locale']}`);
  if (/^\/guides\/[^/]+$/.test(new URL(url).pathname)) guideChecks(f, p, err);
  void f;
}

/** Guides: the lengths of the editor, and nothing of the Markdown of the figures left. */
function guideChecks(f: Fetched, p: PageFacts, err: (rule: string, detail: string) => void) {
  if (p.title && p.title.length > GUIDE.title)
    err('guide', `titre de ${p.title.length} caractères (${GUIDE.title} au plus)`);
  const d = p.description?.length ?? 0;
  if (d < GUIDE.metaMin || d > GUIDE.metaMax)
    err('guide', `meta description de ${d} caractères (${GUIDE.metaMin}–${GUIDE.metaMax})`);
  const body = (f.html ?? '').replace(/<script[\s\S]*?<\/script>/g, '');
  const token = /\{\{[^}]*\}\}/.exec(body);
  if (token) err('guide', `jeton non résolu ${token[0]}`);
  const block = /:::\s*[a-z-]+[^<]*:::/.exec(body);
  if (block) err('guide', `bloc non résolu ${block[0].slice(0, 80)}`);
}

/** Origin expected in canonicals: the one the sitemap announces (APP_URL). */
let expectedOrigin = ORIGIN;
/** Checked URL → the URL as written in the sitemap (another origin on a local build). */
const sitemapForm = new Map<string, string>();

async function audit(paths: string[]) {
  const rows = await pool(paths, 2, async (path) => {
    const f = await get(BASE + path);
    const p = f.html ? readPage(f.html) : null;
    let js = 0;
    if (p)
      for (const s of new Set(p.scripts)) {
        const r = await fetch(new URL(s, BASE)).catch(() => null);
        if (r?.ok) js += gzipSync(Buffer.from(await r.arrayBuffer())).length;
      }
    return {
      path,
      status: f.status,
      location: f.location,
      xRobots: f.xRobots,
      title: p?.title ?? null,
      titleInHead: p?.metaInHead ?? false,
      description: p?.description ?? null,
      h1: p?.h1 ?? [],
      canonical: p?.canonical ?? null,
      robots: p?.robots ?? null,
      jsonLd: p ? [...new Set(p.jsonLd.flatMap(typesOf))] : [],
      jsonLdErrors: p ? [...p.jsonLdErrors, ...p.jsonLd.flatMap(checkJsonLd)] : [],
      headingJumps: p ? headingJumps(p.headings) : [],
      og: p ? Object.keys(p.og).length : 0,
      jsKb: Math.round(js / 102.4) / 10,
    };
  });
  console.log(JSON.stringify(rows, null, 2));
  const out = arg('json');
  if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
}

async function main() {
  const auditPaths = arg('audit');
  if (auditPaths) return audit(auditPaths.split(','));

  const t0 = performance.now();
  const { urls: listed, sitemaps, robots } = await sitemapUrls();
  if (!listed.length) errors.push({ rule: 'sitemap', url: BASE, detail: 'aucune URL' });
  if (listed[0]) expectedOrigin = new URL(listed[0]).origin;
  const sitemapSet = new Set<string>();
  for (const u of listed) {
    const here = ORIGIN + new URL(u).pathname + new URL(u).search;
    if (sitemapSet.has(here)) errors.push({ rule: 'sitemap', url: u, detail: 'URL en double' });
    sitemapSet.add(here);
    sitemapForm.set(here, u);
  }
  // Outside production: robots.txt disallows everything and every answer is noindex.
  const staging = !PRODUCTION;
  if (staging && !/^disallow:\s*\/\s*$/im.test(robots))
    errors.push({
      rule: 'hors-production',
      url: `${BASE}/robots.txt`,
      detail: 'n’interdit pas tout',
    });
  if (!staging && /^disallow:\s*\/\s*$/im.test(robots))
    errors.push({
      rule: 'robots.txt',
      url: `${BASE}/robots.txt`,
      detail: 'interdit tout le site en production',
    });

  // Crawl: the sitemap, then every indexable page reached by a link (pagination included).
  const fetched = new Map<string, Fetched>();
  const facts = new Map<string, PageFacts>();
  const indexable = new Set<string>();
  /** link target → pages linking to it (indexable pages only) */
  const inbound = new Map<string, Set<string>>();
  /** targets to check for broken links, a few query variants per path */
  const toCheck = new Map<string, string>();
  const perPath = new Map<string, number>();

  let frontier = [...sitemapSet, `${BASE}/`];
  const visited = new Set<string>();
  while (frontier.length) {
    const batch = [...new Set(frontier)].filter((u) => !visited.has(u));
    frontier = [];
    batch.forEach((u) => visited.add(u));
    const results = await pool(batch, CONCURRENCY, (u) => get(u));
    for (const f of results) {
      fetched.set(f.url, f);
      const inSitemap = sitemapSet.has(f.url);
      if (f.status !== 200) {
        if (inSitemap)
          errors.push({
            rule: 'statut',
            url: f.url,
            detail: `${f.status}${f.location ? ` → ${f.location}` : ''}`,
          });
        continue;
      }
      if (!f.html) continue;
      const p = readPage(f.html);
      facts.set(f.url, p);
      if (staging) {
        if (!isNoindex(f.xRobots))
          errors.push({
            rule: 'hors-production',
            url: f.url,
            detail: 'X-Robots-Tag noindex absent',
          });
      } else if (isNoindex(f.xRobots) && inSitemap)
        errors.push({ rule: 'noindex', url: f.url, detail: `X-Robots-Tag: ${f.xRobots}` });
      if (isNoindex(p.robots)) {
        if (inSitemap)
          errors.push({ rule: 'noindex', url: f.url, detail: `meta robots ${p.robots}` });
        continue;
      }
      indexable.add(f.url);
      pageChecks(f.url, f, p, inSitemap);
      for (const href of p.links) {
        const t = internal(href, f.url);
        if (!t) continue;
        if (t !== f.url) {
          if (!inbound.has(t)) inbound.set(t, new Set());
          inbound.get(t)!.add(f.url);
        }
        if (visited.has(t) || toCheck.has(t)) continue;
        const path = new URL(t).pathname;
        const n = perPath.get(path) ?? 0;
        // Plain addresses and pages of a list are crawled; other query variants sampled.
        const q = new URL(t).searchParams;
        const crawlable = [...q.keys()].every((k) => k === 'page');
        if (crawlable) frontier.push(t);
        else if (n < PER_PATH) {
          perPath.set(path, n + 1);
          toCheck.set(t, f.url);
        }
      }
    }
  }
  // Link targets that were not crawled (query variants): status only.
  const rest = [...toCheck.keys()].filter((u) => !fetched.has(u));
  for (const f of await pool(rest, CONCURRENCY, (u) => get(u))) fetched.set(f.url, f);
  for (const [target, froms] of inbound) {
    const f = fetched.get(target);
    if (!f) continue;
    if (f.status === 0 || f.status >= 400)
      errors.push({
        rule: 'lien cassé',
        url: target,
        detail: `${f.status} — depuis ${[...froms].slice(0, 3).join(', ')}${froms.size > 3 ? ` (+${froms.size - 3})` : ''}`,
      });
  }

  // Duplicates among indexable pages.
  for (const key of ['title', 'description'] as const) {
    const by = new Map<string, string[]>();
    for (const u of indexable) {
      const v = facts.get(u)?.[key];
      if (v) by.set(v, [...(by.get(v) ?? []), u]);
    }
    for (const [v, us] of by)
      if (us.length > 1)
        errors.push({
          rule: key,
          url: us[0]!,
          detail: `en double sur ${us.length} pages (${us.slice(1, 4).join(', ')}) : « ${v} »`,
        });
  }
  // Orphans: an indexable page that no other indexable page links to (the home excepted).
  for (const u of indexable) {
    if (new URL(u).pathname === '/' && !new URL(u).search) continue;
    if (!inbound.get(u)?.size)
      errors.push({ rule: 'orpheline', url: u, detail: 'aucun lien depuis une page indexable' });
  }
  for (const u of sitemapSet)
    if (!indexable.has(u) && fetched.get(u)?.status === 200 && !errors.some((e) => e.url === u))
      errors.push({ rule: 'sitemap', url: u, detail: 'page non indexable dans le sitemap' });

  const byRule = (list: Issue[]) =>
    list.reduce<Record<string, number>>((a, e) => ((a[e.rule] = (a[e.rule] ?? 0) + 1), a), {});
  const report = {
    url: BASE,
    production: PRODUCTION,
    seconds: Math.round((performance.now() - t0) / 1000),
    sitemaps: sitemaps.length,
    sitemapUrls: sitemapSet.size,
    pagesFetched: fetched.size,
    indexablePages: indexable.size,
    errors: byRule(errors),
    warnings: byRule(warnings),
    errorList: errors,
    warningList: warnings,
  };
  const out = arg('json');
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(
    `${BASE} — ${report.sitemaps} sitemaps, ${report.sitemapUrls} URL, ${report.pagesFetched} pages lues, ${report.indexablePages} indexables, ${report.seconds} s`,
  );
  const show = (title: string, list: Issue[], max = 15) => {
    if (!list.length) return;
    console.log(`\n${title} (${list.length})`);
    const groups = new Map<string, Issue[]>();
    for (const e of list) groups.set(e.rule, [...(groups.get(e.rule) ?? []), e]);
    for (const [rule, es] of groups) {
      console.log(`  ${rule} : ${es.length}`);
      for (const e of es.slice(0, max))
        console.log(`    ${e.url.replace(ORIGIN, '')} — ${e.detail}`);
      if (es.length > max) console.log(`    … ${es.length - max} de plus`);
    }
  };
  show('Avertissements', warnings, 5);
  show('Erreurs', errors);
  if (errors.length) process.exit(1);
  console.log('\nOK : aucune erreur.');
}

void main();
