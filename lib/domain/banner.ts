/**
 * Information banner of the public site. Pure: visibility, status of the admin preview, the
 * dismissal key and the tones. Tested in tests/unit/banner.test.ts.
 * Loaded by the public layout in the browser (SiteBanner): no dependency here. The validation
 * of the admin form (zod) lives in ./banner-schema.
 */
export const BANNER_MAX = 160;

export type BannerTone = 'INFO' | 'IMPORTANT' | 'ALERT';
export type BannerScope = 'ALL' | 'HOME';

export interface BannerData {
  id: string;
  message: string;
  linkLabel: string | null;
  linkUrl: string | null;
  tone: BannerTone;
  scope: BannerScope;
  startsAt: string;
  endsAt: string | null;
  dismissible: boolean;
  active: boolean;
  updatedAt: string;
}

/** Text night on lime and coral, white on violet (contrast checked in the axe test). */
export const BANNER_TONES: Record<
  BannerTone,
  { label: string; bg: string; fg: string; icoBg: string; icoFg: string }
> = {
  INFO: { label: 'Information', bg: '#D4F75A', fg: '#16131F', icoBg: '#16131F', icoFg: '#D4F75A' },
  IMPORTANT: {
    label: 'Important',
    bg: '#5A3BF0',
    fg: '#FFFFFF',
    icoBg: '#D4F75A',
    icoFg: '#16131F',
  },
  ALERT: { label: 'Alerte', bg: '#FFB59E', fg: '#16131F', icoBg: '#16131F', icoFg: '#FFB59E' },
};

export const DEFAULT_BANNER = {
  message:
    'Nous travaillons actuellement pour vous proposer davantage d’informations, de façon claire et précise, pour votre avenir :)',
  linkLabel: 'En savoir plus',
  linkUrl: '/a-propos',
  tone: 'INFO' as const,
  scope: 'ALL' as const,
  active: true,
  dismissible: true,
};

/** Online now: active, started, not ended. */
export function bannerLive(
  b: Pick<BannerData, 'active' | 'startsAt' | 'endsAt'>,
  now = new Date(),
) {
  if (!b.active) return false;
  if (new Date(b.startsAt) > now) return false;
  return !b.endsAt || new Date(b.endsAt) > now;
}

/** Pages where the banner never shows: the review form, the login, the admin. */
export function bannerExcluded(pathname: string): boolean {
  return /^\/(avis\/nouveau|connexion|admin)(\/|$)/.test(pathname);
}

/** Shown on this page (scope, excluded pages, dates). */
export function bannerShownOn(b: BannerData | null, pathname: string, now = new Date()) {
  if (!b || !bannerLive(b, now) || bannerExcluded(pathname)) return false;
  return b.scope === 'ALL' || pathname === '/';
}

/** Status pill of the admin preview. */
export function bannerStatus(
  b: { active: boolean; startsAt: string; endsAt: string | null },
  now = new Date(),
): 'En ligne' | 'Programmé' | 'Terminé' | 'Masqué' {
  if (!b.active) return 'Masqué';
  if (b.endsAt && new Date(b.endsAt) <= now) return 'Terminé';
  if (new Date(b.startsAt) > now) return 'Programmé';
  return 'En ligne';
}

/** localStorage key of a dismissal: a new message (new updatedAt) shows again. */
export const bannerKey = (b: Pick<BannerData, 'id' | 'updatedAt'>) =>
  `banner:${b.id}:${new Date(b.updatedAt).getTime()}`;

/** « 2026-11-14 » (Paris day) → start of that day, end → end of that day, in UTC. */
export function parisDay(date: string, end = false): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  // Paris is UTC+1 or UTC+2: find the offset of that day at noon
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  const paris = new Date(noon.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const utc = new Date(noon.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offset = paris.getTime() - utc.getTime();
  const t = end ? Date.UTC(y, m - 1, d, 23, 59, 59) : Date.UTC(y, m - 1, d, 0, 0, 0);
  return new Date(t - offset);
}

/** Date → « AAAA-MM-JJ » in Paris. */
export function toParisDay(d: Date | string): string {
  return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

/**
 * Inline script of the root layout (before paint): hides a dismissed banner and skips the
 * slide-in already seen in this visit, from the storage keys of the current banner.
 */
export function bannerHeadScript(key: string | null): string {
  if (!key) return '';
  const k = JSON.stringify(key);
  return `try{var h=document.documentElement;if(localStorage.getItem(${k}))h.setAttribute('data-banner-closed','');if(sessionStorage.getItem('banner-seen:'+${k}))h.setAttribute('data-banner-seen','')}catch(e){}`;
}
