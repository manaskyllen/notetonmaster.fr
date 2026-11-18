/** Ratings of the mentions and universities (indexes /mentions and /universites), denormalised. */
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { refreshIndexRatings } from '@/lib/catalog/index-ratings';

afterAll(() => prisma.$disconnect());

describe('ratings denormalised on Mention and University', () => {
  // The per-programme figures (Program, then the index) are checked in sort-ratings.test.ts.
  it('equal the reviews of their published parcours, summed from the index', async () => {
    await refreshIndexRatings();
    for (const [table, col] of [
      ['Mention', 'mentionId'],
      ['University', 'universityId'],
    ] as const) {
      const rows = await prisma.$queryRawUnsafe<
        { n: number; stored: number; avg: number | null; savg: number | null }[]
      >(`
        SELECT coalesce(sum(i."reviewCount"), 0)::int AS n, t."reviewCount" AS stored,
               (sum(i."avgRating" * i."reviewCount") / nullif(sum(i."reviewCount"), 0))::float AS avg,
               t."avgRating" AS savg
          FROM "${table}" t
          LEFT JOIN "ProgramSearchIndex" i ON i."${col}" = t.id AND i."isPublicSector"
         GROUP BY t.id`);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.stored).toBe(r.n);
        if (r.avg == null) expect(r.savg).toBeNull();
        else expect(r.savg!).toBeCloseTo(r.avg, 6);
      }
    }
  });
});
