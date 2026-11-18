import { describe, expect, it } from 'vitest';
import {
  outOfRange,
  pageCount,
  pageHref,
  pageItems,
  pagedTitle,
  rangeSummary,
  readPage,
} from '@/lib/pagination';

describe('pagination: page numbers with ellipses', () => {
  it('shows a single page as such', () => {
    expect(pageItems(1, 1)).toEqual([1]);
  });
  it('shows 2 and 7 pages without ellipsis when nothing is hidden', () => {
    expect(pageItems(1, 2)).toEqual([1, 2]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // An ellipsis never hides a single page.
    expect(pageItems(1, 7)).toEqual([1, 2, 3, 'gap', 7]);
    expect(pageItems(5, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('shows 1 … 4 5 6 7 8 … 42', () => {
    expect(pageItems(6, 42)).toEqual([1, 'gap', 4, 5, 6, 7, 8, 'gap', 42]);
  });
  it('handles the first and the last page', () => {
    expect(pageItems(1, 42)).toEqual([1, 2, 3, 'gap', 42]);
    expect(pageItems(42, 42)).toEqual([1, 'gap', 40, 41, 42]);
  });
});

describe('pagination: rules', () => {
  it('reads page and size from the URL, odd values back to defaults', () => {
    expect(readPage({}, { perPage: 24 })).toEqual({ page: 1, perPage: 24, offset: 0 });
    expect(readPage({ page: '3', parPage: '48' }, { perPage: 24, choices: [24, 48, 96] })).toEqual({
      page: 3,
      perPage: 48,
      offset: 96,
    });
    expect(readPage({ page: '-2', parPage: '1000' }, { perPage: 24, choices: [24, 48] })).toEqual({
      page: 1,
      perPage: 24,
      offset: 0,
    });
    expect(readPage({ page: 'abc' }, { perPage: 10 }).page).toBe(1);
  });
  it('sends a page beyond the last to the last valid page', () => {
    expect(pageCount(7746, 24)).toBe(323);
    expect(outOfRange(400, 7746, 24)).toBe(323);
    expect(outOfRange(3, 7746, 24)).toBeNull();
    expect(outOfRange(2, 0, 24)).toBe(1);
  });
  it('keeps filters, sort and query in page links, page 1 without parameter', () => {
    const sp = { q: 'droit', tri: 'places', page: '4', modalite: 'alternance' };
    expect(pageHref('/explorer', sp, 5)).toBe(
      '/explorer?q=droit&tri=places&modalite=alternance&page=5',
    );
    expect(pageHref('/explorer', sp, 1)).toBe('/explorer?q=droit&tri=places&modalite=alternance');
    expect(pageHref('/explorer', sp, 1, { tri: null })).toBe(
      '/explorer?q=droit&modalite=alternance',
    );
  });
  it('summarises the range and titles the pages', () => {
    expect(rangeSummary(4, 20, 7746, 'parcours', 'parcours')).toMatch(
      /^61–80 sur 7\s746 parcours$/u,
    );
    expect(rangeSummary(1, 20, 0, 'avis', 'avis')).toBe('0 avis');
    expect(rangeSummary(1, 50, 1, 'mention')).toBe('1–1 sur 1 mention');
    expect(pagedTitle('Explorer les masters', 2)).toBe('Explorer les masters — page 2');
    expect(pagedTitle('Explorer les masters', 1)).toBe('Explorer les masters');
  });
});
