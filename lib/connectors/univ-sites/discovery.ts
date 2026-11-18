/**
 * Discovery of the program pages of a university site, with the polite client only (robots.txt,
 * delays, allowed domains): robots.txt of each catalogue host, then
 * 1. sitemaps: declared in the profile, declared in robots.txt, /sitemap.xml, /sitemap_index.xml
 *    (indexes followed, the children that look like the catalogue first);
 * 2. if the sitemaps give too few pages: links from the entry addresses and the catalogue home,
 *    3 levels at most, following only links that contain « master », « formation » or « diplôme ».
 * Nothing is fetched outside the profile's hosts; no form, no JavaScript.
 */
import { isAllowed } from '@/lib/data/robots';
import type { HttpResult, PoliteHttpClient, RequestOptions } from '@/lib/data/http';
import { MB } from '@/lib/data/http';
import { parseHtml, queryAll } from './html';
import { isProgramUrl, type ProfileConfig } from './profiles';

export type SiteStatus = 'ACTIVE' | 'BLOCKED' | 'PAUSED';

export interface Discovery {
  status: SiteStatus;
  reason: string | null;
  urls: string[];
  via: string[];
  requests: number;
}

const SITEMAP_HINT = /(formation|program|odf|offre|cursus|diplom|master|catalog|page)/i;
const FOLLOW = /(master|formation|diplom|offre|catalogue|cursus)/i;
const MAX_SITEMAP_FILES = 30;
const MAX_CRAWL_PAGES = 200;
const MIN_FROM_SITEMAPS = 5;

/** A request that never throws: a refused content type or a network error is a failed page. */
async function tryGet(
  http: PoliteHttpClient,
  url: string,
  o: RequestOptions,
): Promise<HttpResult | null> {
  try {
    return await http.get(url, o);
  } catch {
    return null;
  }
}

export async function discover(
  http: PoliteHttpClient,
  cfg: ProfileConfig,
  log: (msg: string) => Promise<void> = async () => {},
): Promise<Discovery> {
  let requests = 0;
  const via: string[] = [];
  if (cfg.blocked) return { status: 'BLOCKED', reason: cfg.blocked, urls: [], via, requests };

  // robots.txt of every catalogue host
  const usable: string[] = [];
  const reasons: string[] = [];
  let blocked = 0;
  for (const host of cfg.hosts) {
    const robots = await http.robotsFor(new URL(`https://${host}/`));
    requests++;
    if (robots.mode === 'disallow-all') {
      reasons.push(`robots.txt de ${host} injoignable`);
      continue;
    }
    if (
      !isAllowed(robots, http.userAgent, '/').allowed &&
      !isAllowed(robots, http.userAgent, '/fr/').allowed
    ) {
      reasons.push(`robots.txt de ${host} : collecte interdite`);
      blocked++;
      continue;
    }
    usable.push(host);
  }
  if (!usable.length) {
    const status: SiteStatus = blocked === cfg.hosts.length ? 'BLOCKED' : 'PAUSED';
    return {
      status,
      reason: reasons.join(' ; ') || 'aucun hôte utilisable',
      urls: [],
      via,
      requests,
    };
  }

  const found = new Set<string>();
  const add = (u: string) => {
    const clean = u.replace(/#.*$/, '');
    if (isProgramUrl({ ...cfg, hosts: usable }, clean)) found.add(clean);
  };

  // 1. sitemaps
  const queue: string[] = [...cfg.sitemaps];
  for (const host of usable) {
    const robots = await http.robotsFor(new URL(`https://${host}/`));
    queue.push(...robots.sitemaps.filter((s) => usable.some((h) => s.includes(h))));
    queue.push(`https://${host}/sitemap.xml`, `https://${host}/sitemap_index.xml`);
  }
  const seen = new Set<string>();
  let files = 0;
  while (queue.length && files < MAX_SITEMAP_FILES) {
    const url = queue.shift()!;
    if (seen.has(url) || /\.gz$/i.test(url)) continue;
    seen.add(url);
    const r = await tryGet(http, url, { accept: ['xml', 'text'], maxBytes: 50 * MB });
    requests++;
    files++;
    if (!r || r.kind !== 'response' || r.status !== 200 || !r.body) continue;
    const text = r.body.toString('utf8');
    const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
      m[1]!.replace(/&amp;/g, '&'),
    );
    if (/<sitemapindex/i.test(text)) {
      const pri = locs.filter((l) => SITEMAP_HINT.test(l));
      queue.unshift(...pri);
      queue.push(...locs.filter((l) => !SITEMAP_HINT.test(l)));
    } else {
      const before = found.size;
      for (const l of locs) add(l);
      if (found.size > before) via.push(`sitemap ${url} (${found.size - before})`);
    }
  }

  // 2. links, 3 levels at most, when the sitemaps give too few pages
  if (found.size < MIN_FROM_SITEMAPS) {
    const start = [...cfg.entryUrls, ...usable.map((h) => `https://${h}/`)];
    const visited = new Set<string>();
    let frontier = start;
    let pages = 0;
    const before = found.size;
    for (let depth = 0; depth < 3 && frontier.length && pages < MAX_CRAWL_PAGES; depth++) {
      const next: string[] = [];
      for (const url of frontier) {
        if (visited.has(url) || pages >= MAX_CRAWL_PAGES) continue;
        visited.add(url);
        const r = await tryGet(http, url, { accept: ['html'], maxBytes: 5 * MB });
        requests++;
        pages++;
        if (!r || r.kind !== 'response' || r.status !== 200 || !r.body) continue;
        for (const a of queryAll(parseHtml(r.body.toString('utf8')), 'a[href]')) {
          let link: string;
          try {
            link = new URL(a.attrs.href!, url).toString().replace(/#.*$/, '');
          } catch {
            continue;
          }
          const host = new URL(link).hostname;
          if (!usable.includes(host)) continue;
          add(link);
          if (
            !visited.has(link) &&
            FOLLOW.test(decodeURIComponent(new URL(link).pathname)) &&
            !/\.(pdf|docx?|jpe?g|png|zip)$/i.test(link)
          )
            next.push(link);
        }
      }
      frontier = [...new Set(next)];
    }
    if (found.size > before) via.push(`liens (${found.size - before}, ${pages} pages lues)`);
  }
  await log(`${found.size} pages de parcours trouvées${via.length ? ` : ${via.join(', ')}` : ''}`);
  const urls = [...found].slice(0, cfg.maxPages);
  return {
    status: 'ACTIVE',
    reason: urls.length
      ? reasons.length
        ? reasons.join(' ; ')
        : null
      : 'aucune page de master trouvée',
    urls,
    via,
    requests,
  };
}
