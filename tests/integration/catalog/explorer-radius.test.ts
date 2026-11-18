/** Explorer › « Autour de » (radius around a commune): independent of any map. */
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { browsePrograms } from '@/lib/catalog/browse';
import { EMPTY_FILTERS, readFilters, type Filters } from '@/lib/catalog/filters';

afterAll(() => prisma.$disconnect());

const count = async (f: Filters) => (await browsePrograms(f, {}, { offset: 0, limit: 1 })).total;
const around = (insee: string, rayon: number | null) => ({
  ...EMPTY_FILTERS,
  lieux: [`insee:${insee}`],
  rayon,
});

describe('radius', () => {
  it('10, 25 or 50 km around a commune; no radius for a region or an unknown distance', async () => {
    const n = (km: number) => count(around('44109', km));
    const [r10, r25, r50] = [await n(10), await n(25), await n(50)];
    const city = await count(around('44109', null));
    expect(city).toBeGreaterThan(0);
    expect(r10).toBeGreaterThanOrEqual(city);
    expect(r25).toBeGreaterThanOrEqual(r10);
    expect(r50).toBeGreaterThanOrEqual(r25);
    // Strasbourg: Illkirch-Graffenstaden (Eurométropole) is within 10 km
    expect(await count(around('67482', 10))).toBeGreaterThan(await count(around('67482', null)));
    expect(readFilters({ lieu: 'insee:44109', rayon: '30' }).rayon).toBeNull();
  });
});
