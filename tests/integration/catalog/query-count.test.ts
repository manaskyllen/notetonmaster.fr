import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { browsePrograms, facetCounts } from '@/lib/catalog/browse';
import { EMPTY_FILTERS } from '@/lib/catalog/filters';
import { getReviewPage, getProgramSummaries } from '@/lib/queries/catalog';
import { searchPage } from '@/lib/domain/search.server';

/**
 * No N+1: the number of SQL queries behind a list does not grow with its size.
 * Queries are counted through Prisma's query events (enabled outside production).
 */
let n = 0;
(prisma as unknown as { $on: (e: 'query', cb: () => void) => void }).$on('query', () => {
  n++;
});
async function count(fn: () => Promise<unknown>) {
  await fn(); // warm-up (connection)
  n = 0;
  await fn();
  return n;
}

describe('queries per list', () => {
  afterAll(() => prisma.$disconnect());

  it('Explorer: one statement for a page of results, one for every facet', async () => {
    const small = await count(() => browsePrograms(EMPTY_FILTERS, {}, { offset: 0, limit: 24 }));
    const big = await count(() => browsePrograms(EMPTY_FILTERS, {}, { offset: 0, limit: 96 }));
    expect(small).toBe(1);
    expect(big).toBe(small);
    expect(await count(() => facetCounts(EMPTY_FILTERS, {}))).toBe(1);
  });

  it('search: the same number of queries for 7 or 1 000 programs', async () => {
    const few = await count(() => searchPage('droit', { limits: { program: 7 } }));
    const many = await count(() => searchPage('droit', { limits: { program: 1000 } }));
    expect(many).toBe(few);
    expect(few).toBeLessThanOrEqual(6);
  });

  it('reviews of a program: a fixed number of queries per page', async () => {
    const p = await prisma.program.findFirstOrThrow({
      where: { slug: 'valorisation-des-nouveaux-patrimoines' },
    });
    const q = await count(() => getReviewPage(p.id, { level: 'all', sort: 'recents', page: 1 }));
    expect(q).toBeLessThanOrEqual(12);
  });

  it('comparator: never the whole catalogue', async () => {
    const one = await count(() => getProgramSummaries(['valorisation-des-nouveaux-patrimoines']));
    const three = await count(() =>
      getProgramSummaries([
        'valorisation-des-nouveaux-patrimoines',
        'evenementiel-mediation-des-arts-et-des-sciences',
        'histoire-de-l-art-et-culture-materielle',
      ]),
    );
    expect(three).toBe(one);
  });
});
