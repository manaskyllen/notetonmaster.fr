/**
 * Short links of the printed QR codes (issue #17): /q/{slug} adds one to the counter of the day,
 * then redirects to the target. Scans are counted, never people: nothing about the visitor is
 * stored, and nothing is added to the target address. Pure rules, tested.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 32;
export const LABEL_MAX = 120;
export const TARGET_MAX = 300;
const SLUG_RE = /^[a-z0-9-]{3,32}$/;

export const isValidSlug = (s: string) => SLUG_RE.test(s);

/** « Sous-bock vert · Nantes » → « sous-bock-vert-nantes » (editable in the admin). */
export function proposeSlug(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let s = base.slice(0, SLUG_MAX);
  // Cut at a word when the label is long.
  if (base.length > SLUG_MAX && s.includes('-')) s = s.slice(0, s.lastIndexOf('-'));
  s = s.replace(/-+$/g, '');
  return s.length >= SLUG_MIN ? s : `qr-${s || 'lien'}`.slice(0, SLUG_MAX);
}

/**
 * An internal path of the site, never another site (open redirect): one leading « / » and not
 * two, no « \ », no scheme, no space nor control character (a browser drops a tab or a line
 * break, and « /\t/exemple.fr » would become « //exemple.fr »). Never /q/ itself (a loop).
 * Checked when a link is saved and again at each redirect.
 */
export function isInternalPath(p: unknown): p is string {
  if (typeof p !== 'string' || !p || p.length > TARGET_MAX) return false;
  if (!p.startsWith('/') || p.startsWith('//')) return false;
  if (p.includes('\\')) return false;
  // Whitespace, control characters (C0, DEL, C1) and invisible separators.
  if (/[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/u.test(p)) return false;
  // A scheme before the first « / », « ? » or « # » (« /javascript:… » is a path, « javascript: » is not).
  if (/^[^/?#]*:/.test(p)) return false;
  let url: URL;
  try {
    url = new URL(p, 'https://interne.invalid');
  } catch {
    return false;
  }
  if (url.origin !== 'https://interne.invalid') return false;
  if (url.pathname === '/q' || url.pathname.startsWith('/q/')) return false;
  return true;
}

/**
 * Robots and link previews (WhatsApp, Discord, Slack…), from the user agent, which is read here
 * and never stored. An empty user agent is not a phone scanning a code.
 */
// « Googlebot », « bingbot »… but not the phone brand « Cubot »; link previews (the in-app
// browsers of the same apps are people: not listed); tools and monitoring.
const BOT_RE =
  /(?<!cu)bot\b|crawl|spider|slurp|facebookexternalhit|facebot|meta-externalagent|whatsapp\/|slack-imgproxy|skypeuripreview|embedly|iframely|vkshare|mastodon\/|cardyb|bingpreview|google-inspectiontool|googleother|curl\/|wget\/|python-requests|python-urllib|go-http-client|java\/|okhttp|axios\/|node-fetch|undici|libwww|httpclient|scrapy|lighthouse|pagespeed|pingdom|uptimerobot|statuscake/i;

export function isBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  return !ua || BOT_RE.test(ua);
}

/** A prefetch or a prerender of the browser (Sec-Purpose, Purpose, X-Purpose, X-Moz). */
export function isPrefetch(get: (name: string) => string | null): boolean {
  return ['sec-purpose', 'purpose', 'x-purpose', 'x-moz'].some((h) =>
    /prefetch|prerender|preview/i.test(get(h) ?? ''),
  );
}

/** The day of a scan, in Europe/Paris (« 2026-11-24 »). */
export function parisDay(at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Targets offered in the admin; « Chemin interne » takes any internal path. */
export type TargetKind = 'home' | 'avis' | 'ville' | 'path';
export const TARGET_KIND_LABEL: Record<TargetKind, string> = {
  home: 'Accueil',
  avis: 'Formulaire d’avis',
  ville: 'Page d’une ville',
  path: 'Chemin interne',
};

export function targetFor(kind: TargetKind, value = ''): string {
  switch (kind) {
    case 'home':
      return '/';
    case 'avis':
      return '/avis/nouveau';
    case 'ville':
      return `/masters/${value}`;
    case 'path':
      return value.trim();
  }
}

/** The kind and value of a saved target, to fill the edit form. */
export function targetKindOf(path: string): { kind: TargetKind; value: string } {
  if (path === '/') return { kind: 'home', value: '' };
  if (path === '/avis/nouveau') return { kind: 'avis', value: '' };
  const m = /^\/masters\/([a-z0-9-]+)$/.exec(path);
  if (m) return { kind: 'ville', value: m[1]! };
  return { kind: 'path', value: path };
}
