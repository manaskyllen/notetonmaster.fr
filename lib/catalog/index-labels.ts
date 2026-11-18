import { normalize, tokenize } from '@/lib/domain/search';

/**
 * Pure helpers of the indexes /mentions, /universites and /masters, shared by the server (data) and the client (filters, sorts): no database here.
 */

export const MENTION_SORTS = [
  { id: 'az', label: 'A → Z' },
  { id: 'parcours', label: 'Plus de parcours' },
  { id: 'note', label: 'Mieux notées' },
] as const;
export type MentionSort = (typeof MENTION_SORTS)[number]['id'];

export const UNIVERSITY_SORTS = [
  { id: 'masters', label: 'Plus de masters' },
  { id: 'az', label: 'A → Z' },
  { id: 'note', label: 'Mieux notées' },
] as const;
export type UniversitySort = (typeof UNIVERSITY_SORTS)[number]['id'];

export const CITY_SORTS = [
  { id: 'masters', label: 'Plus de masters' },
  { id: 'az', label: 'A → Z' },
  { id: 'avis', label: 'Plus d’avis' },
] as const;
export type CitySort = (typeof CITY_SORTS)[number]['id'];

/** A city of /masters: one light row, filtered and sorted in the browser. */
export interface CityEntry {
  slug: string;
  name: string;
  /** INSEE region (« Pays de la Loire »), null when unknown. */
  region: string | null;
  masters: number;
  establishments: number;
  reviews: number;
  avg: number | null;
  /** Published parcours by domain slug. */
  domains: Record<string, number>;
}

/** A national domain in the legend and the bars, in the order and colours of the home tiles. */
export interface DomainLegend {
  slug: string;
  name: string;
  tone: string;
}

/** Below this many reviews a city shows its count only, not its average (as the promos). */
export const CITY_GRADE_MIN_REVIEWS = 3;

/** What the foot of a city card shows: the average from 3 reviews, the count below, or nothing. */
export function cityReviewsShown(reviews: number, avg: number | null): 'grade' | 'count' | 'none' {
  if (reviews <= 0) return 'none';
  return reviews >= CITY_GRADE_MIN_REVIEWS && avg != null ? 'grade' : 'count';
}

/**
 * Shares of the domains in a city, in the order of the legend, absent domains left out. The
 * percentages are rounded so that they add up to 100 (largest remainders).
 */
export function domainShares(
  counts: Record<string, number>,
  domains: readonly DomainLegend[],
): (DomainLegend & { n: number; pct: number })[] {
  const rows = domains.map((d) => ({ ...d, n: counts[d.slug] ?? 0 })).filter((d) => d.n > 0);
  const total = rows.reduce((t, d) => t + d.n, 0);
  if (!total) return [];
  const raw = rows.map((d) => (d.n * 100) / total);
  const pct = raw.map(Math.floor);
  let left = 100 - pct.reduce((a, b) => a + b, 0);
  for (const i of raw
    .map((r, i) => i)
    .sort((a, b) => raw[b]! - pct[b]! - (raw[a]! - pct[a]!) || a - b)) {
    if (left <= 0) break;
    pct[i]! += 1;
    left -= 1;
  }
  return rows.map((d, i) => ({ ...d, pct: pct[i]! }));
}

/** Slug of a region name, for the address (?region=grand-est). */
export const regionSlug = (name: string) =>
  normalize(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The sorts of /masters: « Plus de masters », A → Z, « Plus d’avis » (then the most masters). */
export function cityOrder(sort: CitySort) {
  return (a: CityEntry, b: CityEntry) =>
    sort === 'az'
      ? byName(a, b)
      : sort === 'avis'
        ? b.reviews - a.reviews || b.masters - a.masters || byName(a, b)
        : b.masters - a.masters || byName(a, b);
}

/** An open city offered by the city picker, with its count in the context of the page. */
export interface IndexCity {
  slug: string;
  name: string;
  count: number;
}

/** What a rated entry needs for the « Mieux notées » sort. */
export interface Rated {
  name: string;
  avg: number | null;
  reviews: number;
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
export const byName = <T extends { name: string }>(a: T, b: T) => collator.compare(a.name, b.name);

/** « Mieux notées »: rated first, best average, then the most reviews, then A → Z. */
export function byRating<T extends Rated>(a: T, b: T): number {
  const ra = a.reviews > 0 && a.avg != null;
  const rb = b.reviews > 0 && b.avg != null;
  if (ra !== rb) return ra ? -1 : 1;
  if (ra && rb && a.avg !== b.avg) return b.avg! - a.avg!;
  return b.reviews - a.reviews || byName(a, b);
}

/** Every word typed is in the text, accents and case ignored. */
export function matchesWords(text: string, q: string): boolean {
  const words = tokenize(q);
  if (!words.length) return true;
  const hay = tokenize(text).join(' ');
  return words.every((w) => hay.includes(w));
}

/** Letter of a group in the A → Z sort, accents ignored (« Économie » under E). */
export function letterOf(name: string): string {
  const c = normalize(name)
    .replace(/^[^a-z0-9]+/, '')
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

/** Entries already sorted A → Z, cut into groups by letter (in order). */
export function groupByLetter<T extends { name: string }>(rows: T[]) {
  const groups: { letter: string; items: T[] }[] = [];
  for (const r of rows) {
    const l = letterOf(r.name);
    const last = groups.at(-1);
    if (last?.letter === l) last.items.push(r);
    else groups.push({ letter: l, items: [r] });
  }
  return groups;
}

/**
 * Where a mention is taught: « Strasbourg et Nantes », beyond two « Lyon, Nantes et 3 autres
 * villes ». Alphabetical, the filtered city first.
 */
export function citiesLabel(names: string[], first?: string | null): string {
  const xs = [...new Set(names)].sort((a, b) => collator.compare(a, b));
  if (first && xs.includes(first)) xs.splice(0, 0, ...xs.splice(xs.indexOf(first), 1));
  if (xs.length <= 2) return xs.join(' et ');
  const more = xs.length - 2;
  return `${xs.slice(0, 2).join(', ')} et ${more} autre${more > 1 ? 's' : ''} ville${more > 1 ? 's' : ''}`;
}

export const plural = (n: number, one: string, many: string) =>
  `${new Intl.NumberFormat('fr-FR').format(n)} ${n > 1 ? many : one}`;

/** « 30 mentions », or « 12 mentions sur 214 » when a filter is on. */
export function countLabel(shown: number, total: number, one: string, many: string): string {
  return plural(shown, one, many) + (shown === total ? '' : ` sur ${total}`);
}

const SMALL = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'et',
  'pour',
  'en',
  'a',
  'au',
  'aux',
]);

/** Initials of the significant words: « Université de Rennes » → UR, « … Rennes 2 » → UR2. */
function initials(name: string): string {
  return name
    .replace(/[’'`-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SMALL.has(normalize(w)))
    .map((w) => (/^\d+$/.test(w) ? w : /^[A-Z]{2,5}$/.test(w) ? w : w.charAt(0).toUpperCase()))
    .join('')
    .slice(0, 6);
}

const GENERIC = new Set(['universite', 'ecole', 'institut', 'conservatoire', 'centre', 'grand']);

/**
 * The usual short name of an establishment for its tile (« Unistra », « UHA », « INSA »):
 * - a short `shortName` (« Lyon III »);
 * - the acronym that opens its name (« INSA de Lyon » → INSA, « ENS de Lyon » → ENS);
 * - the acronym of the annuaire, a lowercase search keyword that is not a word of the name
 *   (« nantes » is not one, « nu » is): upper case up to five letters, capitalised beyond;
 * - the first word of a two-word name that does not start with a generic word (« Oniris »);
 * - else the initials of the significant words (« Université de Rennes » → UR).
 */
export function monogram(u: {
  name: string;
  shortName: string | null;
  keywords: string[];
}): string {
  const short = u.shortName?.trim() || null;
  if (short && short.length <= 8) return short;
  const lead = /^([A-Z]{2,6})\b/.exec(short ?? u.name)?.[1];
  if (lead) return lead;
  const nameWords = new Set(tokenize(`${u.name} ${short ?? ''}`));
  const sigle = u.keywords.find((k) => /^[a-z0-9]{2,8}$/.test(k) && !nameWords.has(k));
  if (sigle)
    return sigle.length <= 5 ? sigle.toUpperCase() : sigle.charAt(0).toUpperCase() + sigle.slice(1);
  const words = u.name.split(/\s+/);
  if (words.length === 2 && words[0]!.length <= 8 && !GENERIC.has(normalize(words[0]!)))
    return words[0]!;
  const fromShort = short ? initials(short) : '';
  if (fromShort.length >= 2 && fromShort.length <= 5) return fromShort;
  return initials(u.name) || u.name.slice(0, 3);
}

/** Colours of the tiles, from the brand palette: [background, ink]. */
export const TILES: readonly (readonly [string, string])[] = [
  ['#5A3BF0', '#FFFFFF'],
  ['#16131F', '#D4F75A'],
  ['#E9F9B8', '#3A4A05'],
  ['#FFB59E', '#16131F'],
  ['#D4F75A', '#16131F'],
  ['#16131F', '#FFFFFF'],
  ['#ECE8FF', '#3B23B8'],
  ['#FFF6D6', '#6B4A00'],
];

/** A stable tile for an establishment: computed from its id, the same on every visit. */
export function tileOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % TILES.length;
}
