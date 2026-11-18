/**
 * Broken internal links, read-only: `pnpm links --url=https://notetonmaster.fr [--max=400]`.
 * Crawls the site from the home page and the sitemaps (same origin only), then checks every
 * internal link found. Prints ✅ / ❌ and exits with 1 when a link is broken.
 */
const arg = (name: string, fallback: string) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? fallback;

const BASE = arg('url', 'http://localhost:3000').replace(/\/$/, '');
const MAX = Number(arg('max', '400'));
const origin = new URL(BASE).origin;

const get = (url: string) =>
  fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'notetonmaster-links/1.0' },
    signal: AbortSignal.timeout(20_000),
  });

function internal(href: string, from: string): string | null {
  try {
    const u = new URL(href, from);
    if (u.origin !== origin || !/^https?:$/.test(u.protocol)) return null;
    if (/\.(png|jpe?g|svg|ico|webp|css|js|txt|xml|webmanifest)$/.test(u.pathname)) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

async function main() {
  const queue: string[] = [`${BASE}/`];
  const sitemap = await get(`${BASE}/sitemap.xml`)
    .then((r) => r.text())
    .catch(() => '');
  for (const sub of sitemap.match(/<loc>[^<]+<\/loc>/g) ?? []) {
    const xml = await get(sub.slice(5, -6).replace(/^https?:\/\/[^/]+/, BASE))
      .then((r) => r.text())
      .catch(() => '');
    for (const loc of (xml.match(/<loc>[^<]+<\/loc>/g) ?? []).slice(0, 50))
      queue.push(loc.slice(5, -6).replace(/^https?:\/\/[^/]+/, BASE));
  }
  const seen = new Set<string>();
  const status = new Map<string, number>();
  const referrers = new Map<string, string>();
  while (queue.length && seen.size < MAX) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const r = await get(url).catch(() => null);
    status.set(url, r?.status ?? 0);
    if (!r?.ok || !(r.headers.get('content-type') ?? '').includes('text/html')) continue;
    const html = await r.text();
    for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
      const link = internal(m[1]!.replace(/&amp;/g, '&'), url);
      if (link && !seen.has(link)) {
        queue.push(link);
        if (!referrers.has(link)) referrers.set(link, url);
      }
    }
  }
  const broken = [...status].filter(([, s]) => s === 0 || s >= 400);
  for (const [u, s] of broken)
    console.log(
      `❌ ${u} → ${s || 'injoignable'} (lien depuis ${referrers.get(u) ?? 'le sitemap'})`,
    );
  console.log(
    `${broken.length ? '❌' : '✅'} ${status.size} pages vérifiées, ${broken.length} lien(s) cassé(s).`,
  );
  process.exit(broken.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});

export {};
