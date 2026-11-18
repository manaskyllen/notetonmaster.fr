/** « Mieux notés » and the ratings denormalised on Program. */
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { browsePrograms } from '@/lib/catalog/browse';
import { EMPTY_FILTERS, effectiveSort, readFilters, SORTS } from '@/lib/catalog/filters';
import { refreshProgramRatings } from '@/lib/catalog/program-ratings';

afterAll(() => prisma.$disconnect());

describe('sorts', () => {
  it('only relevance (with a query), best rated (default), most reviewed, A → Z', () => {
    expect(SORTS.map((s) => s.id)).toEqual(['pertinence', 'notes', 'avis', 'az']);
    expect(effectiveSort(EMPTY_FILTERS)).toBe('notes');
    expect(effectiveSort(readFilters({ q: 'droit' }))).toBe('pertinence');
    // an old address sorted by places falls back on the default
    expect(effectiveSort(readFilters({ tri: 'places' }))).toBe('notes');
  });

  it('best rated: rating, then number of reviews; programs without reviews last, A → Z', async () => {
    const { rows, total } = await browsePrograms(
      readFilters({ tri: 'notes' }),
      {},
      { offset: 0, limit: 400 },
    );
    expect(total).toBeGreaterThan(0);
    const rated = rows.filter((r) => r.avgRating != null);
    expect(rated.length).toBeGreaterThan(1);
    const firstUnrated = rows.findIndex((r) => r.avgRating == null);
    // every rated program comes before the first one without reviews
    if (firstUnrated >= 0)
      expect(rows.slice(firstUnrated).every((r) => r.avgRating == null)).toBe(true);
    for (let i = 1; i < rated.length; i++) {
      const [a, b] = [rated[i - 1]!, rated[i]!];
      expect(a.avgRating!).toBeGreaterThanOrEqual(b.avgRating!);
      if (a.avgRating === b.avgRating) expect(a.reviewCount).toBeGreaterThanOrEqual(b.reviewCount);
    }
    const unrated = rows
      .slice(Math.max(0, firstUnrated))
      .filter((r) => r.avgRating == null)
      .slice(0, 30);
    const titles = unrated.map((r) => r.title);
    expect(titles).toEqual(
      [...titles].sort((x, y) => x.localeCompare(y, 'fr', { sensitivity: 'base' })),
    );
  });
});

describe('ratings denormalised on Program', () => {
  it('equal the published reviews, after a full refresh as well', async () => {
    await refreshProgramRatings(null);
    const rows = await prisma.$queryRaw<
      { id: string; n: number; stored: number; avg: number | null; savg: number | null }[]
    >`
      SELECT p.id, count(r.id)::int AS n, p."reviewCount" AS stored, avg(r."overallRating")::float AS avg, p."avgRating" AS savg
        FROM "Program" p LEFT JOIN "Review" r ON r."programId" = p.id AND r.status = 'PUBLISHED'
       GROUP BY p.id HAVING count(r.id) > 0 OR p."reviewCount" > 0`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.stored, r.id).toBe(r.n);
      expect(r.savg ?? 0, r.id).toBeCloseTo(r.avg ?? 0, 6);
    }
  });
});
