/**
 * Pure rules of the home (guided search, open cities, domains, latest reviews), shared by the
 * server, the search island and the unit tests. No data access here.
 */
import { normalize } from '@/lib/domain/search';

export * from './form';
import type { Quick } from './form';
import { quickMask } from './form';

/** Count table of the button, empty query: per open city ('' = all of them), 8 combinations. */
export type CountTable = Record<string, number[]>;

/**
 * From the grouped counts of the search index (one row per zone set × quick filter values), the
 * number of masters for every city and combination: a combination counts the rows that satisfy
 * each filter it holds.
 */
export function countTable(
  rows: { zones: string[]; alt: boolean; avis: boolean; m1: boolean; n: number }[],
): CountTable {
  const cells: Record<string, number[]> = {};
  const add = (key: string, cell: number, n: number) => {
    (cells[key] ??= Array(8).fill(0))[cell]! += n;
  };
  for (const r of rows) {
    const cell = quickMask({ alt: r.alt, avis: r.avis, m1: r.m1 });
    add('', cell, r.n);
    for (const z of new Set(r.zones)) add(z, cell, r.n);
  }
  const out: CountTable = {};
  for (const [key, c] of Object.entries(cells))
    out[key] = Array.from({ length: 8 }, (_, mask) =>
      c.reduce((sum, n, cell) => ((cell & mask) === mask ? sum + n : sum), 0),
    );
  return out;
}

// ───────────── Words ─────────────

/** « à Strasbourg, Nantes, Mulhouse ou Montpellier », or « dans l’une des villes ouvertes » beyond 4. */
export function firstReviewCities(names: string[]): string {
  if (!names.length || names.length > 4) return 'dans l’une des villes ouvertes';
  if (names.length === 1) return `à ${names[0]}`;
  return `à ${names.slice(0, -1).join(', ')} ou ${names.at(-1)}`;
}

/**
 * Age of a review, never more precise than its fiche (the month, lib/domain/public-date.ts):
 * « ce mois-ci », « le mois dernier », « il y a 3 mois », « il y a plus d’un an ».
 */
export function reviewAge(month: Date, now = new Date()): string {
  const m =
    (now.getUTCFullYear() - month.getUTCFullYear()) * 12 + now.getUTCMonth() - month.getUTCMonth();
  if (m <= 0) return 'ce mois-ci';
  if (m === 1) return 'le mois dernier';
  if (m < 12) return `il y a ${m} mois`;
  return 'il y a plus d’un an';
}

/** Excerpt of a review: whole words, about `max` characters at most, an ellipsis when cut. */
export function excerpt(text: string, max = 220): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.!?–—-]+$/, '')}…`;
}

/** Who wrote it, as little as the fiche says: « en M1 », « en M2 », « diplômé·e ». */
export const AUTHOR_LEVEL = {
  M1: 'en M1',
  M2: 'en M2',
  GRADUATE: 'diplômé·e',
  LEFT: 'parti·e en cours',
} as const;

// ───────────── Highlight ─────────────

export interface Part {
  text: string;
  hit: boolean;
}

/**
 * The words typed, marked in a label without regard to accents or case (« therapie » in
 * « Thérapie »): the label keeps its own characters. Every occurrence of every word.
 */
export function highlight(text: string, query: string): Part[] {
  const words = [
    ...new Set(
      normalize(query)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 0),
    ),
  ].sort((a, b) => b.length - a.length);
  if (!words.length || !text) return [{ text, hit: false }];
  // Normalised text, each of its characters mapped back to the original one.
  const chars = Array.from(text);
  let norm = '';
  const back: number[] = [];
  chars.forEach((ch, i) => {
    for (const c of normalize(ch)) {
      norm += c;
      back.push(i);
    }
  });
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const w of words) {
    let at = norm.indexOf(w);
    while (at !== -1) {
      for (let k = at; k < at + w.length; k++) marked[back[k]!] = true;
      at = norm.indexOf(w, at + w.length);
    }
  }
  const parts: Part[] = [];
  chars.forEach((ch, i) => {
    const last = parts.at(-1);
    if (last && last.hit === marked[i]) last.text += ch;
    else parts.push({ text: ch, hit: marked[i]! });
  });
  return parts;
}

// ───────────── Open cities typed in « Quoi ? » ─────────────

/** Open cities whose name the query is (or starts): « nant » → Nantes. Whole query only. */
export function citiesTyped<Z extends { name: string }>(zones: Z[], query: string): Z[] {
  const q = normalize(query)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (q.length < 3) return [];
  return zones.filter((z) => {
    const n = normalize(z.name)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return n === q || n.startsWith(q);
  });
}
