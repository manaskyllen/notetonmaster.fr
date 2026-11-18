/**
 * Pagination rules shared by every list of the site. Pages are computed on the server
 * (LIMIT / OFFSET, or a cursor for long chronological feeds) and the state lives in the URL:
 * `page` (from 1) and `parPage`, kept with the filters, the sort and the query.
 */

export const PAGE = 'page';
export const PER_PAGE = 'parPage';

/** The public search never goes deeper than this (« Affine ta recherche pour voir la suite »). */
export const SEARCH_CAP = 1000;

export type Params = Record<string, string | string[] | undefined>;

export interface PageRequest {
  page: number;
  perPage: number;
  offset: number;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Page and page size read from the URL; any odd value falls back to page 1 / the default size. */
export function readPage(
  sp: Params,
  opts: { perPage: number; choices?: readonly number[] },
): PageRequest {
  const page = Math.max(1, Math.floor(Number(first(sp[PAGE])) || 1));
  const asked = Number(first(sp[PER_PAGE]));
  const perPage = opts.choices?.includes(asked) ? asked : opts.perPage;
  return { page, perPage, offset: (page - 1) * perPage };
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/**
 * Page numbers to show: the first and the last, and two pages on each side of the current one,
 * with ellipses for the gaps: 1 … 4 5 6 7 8 … 42. An ellipsis never hides a single page.
 */
export function pageItems(current: number, last: number): (number | 'gap')[] {
  if (last <= 1) return [1];
  const keep = new Set([1, last]);
  for (let p = current - 2; p <= current + 2; p++) if (p >= 1 && p <= last) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  for (const [i, p] of sorted.entries()) {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) out.push('gap');
    out.push(p);
  }
  return out;
}

/** Page beyond the last one: where to go instead (the last valid page), or null when fine. */
export function outOfRange(page: number, total: number, perPage: number): number | null {
  const last = pageCount(total, perPage);
  return page > last ? last : null;
}

/**
 * URL of a page of the current list: every other parameter is kept, `page=1` is left out (one
 * canonical URL per page). `set` overrides parameters (null removes them).
 */
export function pageHref(
  pathname: string,
  sp: Params,
  page: number,
  set: Record<string, string | null> = {},
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === PAGE || v === undefined || k in set) continue;
    for (const x of Array.isArray(v) ? v : [v]) if (x !== '') q.append(k, x);
  }
  for (const [k, v] of Object.entries(set)) if (v !== null && k !== PAGE) q.set(k, v);
  if (page > 1) q.set(PAGE, String(page));
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** URL of the same list after a filter, sort or query change: back to page 1. */
export function filterHref(pathname: string, sp: Params, set: Record<string, string | null>) {
  return pageHref(pathname, sp, 1, set);
}

const nf = new Intl.NumberFormat('fr-FR');

/** « 61–80 sur 7 746 parcours » (nothing to show: « 0 parcours »). */
export function rangeSummary(
  page: number,
  perPage: number,
  total: number,
  noun: string,
  plural = `${noun}s`,
): string {
  const word = total > 1 ? plural : noun;
  if (total === 0) return `0 ${word}`;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return `${nf.format(from)}–${nf.format(to)} sur ${nf.format(total)} ${word}`;
}

/** Title of a page beyond the first: « Explorer les masters — page 2 ». */
export function pagedTitle(title: string, page: number): string {
  return page > 1 ? `${title} — page ${page}` : title;
}
