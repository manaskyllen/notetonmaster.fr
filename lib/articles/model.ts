import type { ArticleStatus, ArticleTheme } from '@/lib/db/generated/enums';

/**
 * Guides (« articles » in the code and the admin): constants shared by the admin, the public
 * pages and the import. No database, no Next.js: also read by scripts and unit tests.
 */

export const TITLE_MAX = 60;
export const META_MIN = 120;
export const META_MAX = 155;
export const LEDE_MAX = 400;
export const BODY_MAX = 60_000;
export const SLUG_MAX = 120;
export const MIN_WORDS = 600;
export const MIN_INTERNAL_LINKS = 3;
/** Byline when none is set: the brand is written like the logo where it is shown. */
export const DEFAULT_SIGNATURE = 'Par l’équipe note ton master';
/** /guides: guides per page, and the size past which the search goes to the server. */
export const GUIDES_PER_PAGE = 20;
export const CLIENT_SEARCH_MAX = 100;
/** Draft autosave: at most every 10 s. */
export const AUTOSAVE_MS = 10_000;

export interface ThemeInfo {
  id: ArticleTheme;
  /** URL value of the subject filter (/guides?sujet=alternance). */
  slug: string;
  label: string;
  /** Plural label of the subject filter (« Guides »). */
  filter: string;
  bg: string;
  fg: string;
}

/** Colors of the theme labels (ArticlesIndex mockup), the same on /guides and « À lire aussi ». */
export const THEMES: ThemeInfo[] = [
  { id: 'GUIDE', slug: 'guide', label: 'Guide', filter: 'Guides', bg: '#ece8ff', fg: '#3b23b8' },
  {
    id: 'SELECTIVITE',
    slug: 'selectivite',
    label: 'Sélectivité',
    filter: 'Sélectivité',
    bg: '#ffe3dc',
    fg: '#8a2a0e',
  },
  {
    id: 'ALTERNANCE',
    slug: 'alternance',
    label: 'Alternance',
    filter: 'Alternance',
    bg: '#fff6d6',
    fg: '#7a4f00',
  },
  { id: 'EUROPE', slug: 'europe', label: 'Europe', filter: 'Europe', bg: '#e3f0ff', fg: '#1d4e89' },
  {
    id: 'METHODE',
    slug: 'methode',
    label: 'Méthode',
    filter: 'Méthode',
    bg: '#e9f9b8',
    fg: '#3a4a05',
  },
  {
    id: 'CALENDRIER',
    slug: 'calendrier',
    label: 'Calendrier',
    filter: 'Calendrier',
    bg: '#e9f9b8',
    fg: '#3a4a05',
  },
];

export const themeInfo = (t: ArticleTheme): ThemeInfo => THEMES.find((x) => x.id === t)!;
export const themeBySlug = (s: string | null | undefined): ThemeInfo | null =>
  THEMES.find((x) => x.slug === s) ?? null;

export const STATUS_LABEL: Record<ArticleStatus, string> = {
  DRAFT: 'Brouillon',
  SCHEDULED: 'Programmé',
  PUBLISHED: 'Publié',
  TO_REVIEW: 'À relire',
};

/** Status shown: a scheduled guide whose date has passed is published. */
export function displayStatus(
  a: { status: ArticleStatus; online: boolean; publishedAt: Date | null },
  now = new Date(),
): ArticleStatus {
  if (a.status === 'SCHEDULED' && a.online && a.publishedAt && a.publishedAt <= now)
    return 'PUBLISHED';
  return a.status;
}

/** Public: online, with a publication date in the past. The city is checked by the caller. */
export function isLive(a: { online: boolean; publishedAt: Date | null }, now = new Date()) {
  return a.online && !!a.publishedAt && a.publishedAt <= now;
}

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');

export const isValidSlug = (s: string) =>
  s.length >= 3 &&
  s.length <= SLUG_MAX &&
  /^[a-z0-9-]+$/.test(s) &&
  !s.startsWith('-') &&
  !s.endsWith('-') &&
  !s.includes('--');

/** Reading time: 220 words a minute, at least one minute. */
export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 220));

/** Accents and case ignored, punctuation as spaces: the search of /guides. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/** Short chapô of a list line: the first sentence, cut on a word under `max` characters. */
export function shortLede(lede: string, max = 150): string {
  const first = /^(.+?[.!?])(\s|$)/.exec(lede.trim())?.[1] ?? lede.trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
}
