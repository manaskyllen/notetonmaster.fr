import { ALIAS_HOSTS, CANONICAL_ORIGIN } from './rules';

/**
 * Origin of the site, from APP_URL (set at deploy time, read at run time: never written in the
 * code). Canonicals, sitemaps, Open Graph and JSON-LD are built from it.
 */
export function siteOrigin(): string {
  const raw = process.env.APP_URL ?? 'http://localhost:3000';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

/** Indexable only on https://notetonmaster.fr: local, CI and any other host are noindex. */
export function isProductionSite(origin = siteOrigin()): boolean {
  return origin === CANONICAL_ORIGIN;
}

/** « /parcours/x » → « https://notetonmaster.fr/parcours/x ». */
export function absoluteUrl(path: string, origin = siteOrigin()): string {
  if (/^https?:\/\//.test(path)) return path;
  return origin + (path.startsWith('/') ? path : `/${path}`);
}

/** Public sections whose addresses are always lower case (slugs never have capitals). */
const LOWERCASE_SECTIONS = new Set([
  'explorer',
  'mentions',
  'universites',
  'parcours',
  'masters',
  'a-propos',
  'legal',
  'comparer',
]);

/**
 * Where a request must go before anything else (301), or null:
 * - an alias host (www., .com) or plain http on the canonical host → the canonical origin;
 * - capitals in a public address (« /Mentions/Droit ») → lower case;
 * - a trailing slash → without it.
 * `host` and `proto` are the ones the visitor used (X-Forwarded-* behind the proxy).
 */
export function canonicalRedirect(
  req: { host: string; proto: string; pathname: string; search: string },
  origin = siteOrigin(),
): string | null {
  const canonical = new URL(origin);
  let { pathname } = req;
  let moved = false;
  const host = req.host.toLowerCase().replace(/:\d+$/, '');
  if (isProductionSite(origin)) {
    if (ALIAS_HOSTS.includes(host)) moved = true;
    else if (host === canonical.hostname && req.proto === 'http') moved = true;
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '') || '/';
    moved = true;
  }
  const section = pathname.split('/')[1]?.toLowerCase() ?? '';
  if (LOWERCASE_SECTIONS.has(section) && pathname !== pathname.toLowerCase()) {
    pathname = pathname.toLowerCase();
    moved = true;
  }
  if (!moved) return null;
  const base = isProductionSite(origin) ? origin : `${req.proto}://${req.host}`;
  return base + pathname + req.search;
}
