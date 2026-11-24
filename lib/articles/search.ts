import type { ArticleTheme } from '@/lib/db/generated/enums';
import { fold, GUIDES_PER_PAGE, themeBySlug, themeInfo } from './model';

/**
 * Search of /guides, the same on the server (first render, pages, beyond CLIENT_SEARCH_MAX
 * guides) and in the browser (filtering while typing): every word of « Quoi ? » in the title,
 * the chapô, the theme, the city or the search keywords of the guide, accents and case aside.
 * « Où ? » keeps the guides of the city, then those about every city (always shown, after).
 */

export interface SearchableGuide {
  slug: string;
  title: string;
  lede: string;
  theme: ArticleTheme;
  city: { slug: string; name: string } | null;
  searchKeywords: string[];
}

export interface GuideFilters {
  q: string;
  city: string | null;
  /** Theme slug (« alternance »), null for every subject. */
  subject: string | null;
}

const words = (q: string) => fold(q).split(' ').filter(Boolean);

function haystack(g: SearchableGuide): string {
  return fold(
    [
      g.title,
      g.lede,
      themeInfo(g.theme).label,
      themeInfo(g.theme).filter,
      g.city?.name ?? 'toutes les villes',
      ...g.searchKeywords,
    ].join(' '),
  );
}

export function searchGuides<G extends SearchableGuide>(list: G[], f: GuideFilters): G[] {
  const w = words(f.q);
  const theme = themeBySlug(f.subject);
  const match = (g: G) =>
    (!theme || g.theme === theme.id) && (!w.length || w.every((x) => haystack(g).includes(x)));
  if (!f.city) return list.filter(match);
  return [
    ...list.filter((g) => g.city?.slug === f.city && match(g)),
    ...list.filter((g) => !g.city && match(g)),
  ];
}

/** Parts of a title with the searched words highlighted (accents and case aside). */
export function highlight(title: string, q: string): { text: string; hit: boolean }[] {
  const w = words(q).filter((x) => x.length > 1);
  if (!w.length) return [{ text: title, hit: false }];
  // Folded title, character by character, with the index of each in the original.
  let folded = '';
  const at: number[] = [];
  for (let i = 0; i < title.length; i++) {
    const c = fold(title[i]!) || ' ';
    for (const ch of c) {
      folded += ch;
      at.push(i);
    }
  }
  const marks = new Array<boolean>(title.length).fill(false);
  for (const x of w) {
    let from = 0;
    for (let k = folded.indexOf(x, from); k !== -1; k = folded.indexOf(x, from)) {
      for (let j = k; j < k + x.length; j++) marks[at[j]!] = true;
      from = k + x.length;
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < title.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += title[i];
    else out.push({ text: title[i]!, hit: marks[i]! });
  }
  return out;
}

/** « 4 guides pour Nantes ». */
export function countLabel(n: number, cityName: string | null): string {
  return `${n} guide${n > 1 ? 's' : ''}${cityName ? ` pour ${cityName}` : ''}`;
}

/** The parameters of /guides, from the address. */
export function readGuideParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  };
  return {
    q: one('q').slice(0, 120),
    city: one('ville') || null,
    subject: themeBySlug(one('sujet'))?.slug ?? null,
    page: Math.max(1, Math.floor(Number(one('page')) || 1)),
  };
}

/** Address of a state of /guides (page 1 left out). */
export function guidesHref(f: GuideFilters, page = 1): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.city) p.set('ville', f.city);
  if (f.subject) p.set('sujet', f.subject);
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `/guides?${s}` : '/guides';
}

export const pageSlice = <T>(list: T[], page: number) =>
  list.slice((page - 1) * GUIDES_PER_PAGE, page * GUIDES_PER_PAGE);
