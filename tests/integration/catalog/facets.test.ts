import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { browsePrograms, facetCounts } from '@/lib/catalog/browse';
import { refreshProgramIndexRows } from '@/lib/catalog/program-index';
import { EMPTY_FILTERS, filtersToParams, readFilters, type Filters } from '@/lib/catalog/filters';
import { searchPage } from '@/lib/domain/search.server';
import { FX } from '../fixtures/ids';
import { mentionBySlug } from '../fixtures/lookup';

/** Explorer facets: counters, radius, URL, private establishments. */
const count = (f: Filters) => browsePrograms(f, {}, { offset: 0, limit: 1 }).then((r) => r.total);
const option = (facets: Awaited<ReturnType<typeof facetCounts>>, g: string, k: string) =>
  facets[g]?.find((o) => o.key === k)?.count ?? 0;

describe('facets: counters', () => {
  it('with no filter: total = public programs, each option = what ticking it gives', async () => {
    const facets = await facetCounts(EMPTY_FILTERS, {});
    expect(facets.total).toBe(await count(EMPTY_FILTERS));
    for (const m of ['alternance', 'presentiel'])
      expect(option(facets, 'modalite', m), m).toBe(
        await count({ ...EMPTY_FILTERS, modalites: [m] }),
      );
    const d = facets.domaine![0]!;
    expect(d.count).toBe(await count({ ...EMPTY_FILTERS, domaines: [d.key] }));
  });

  it('with one filter: other groups count with it, its own group without it', async () => {
    const f = { ...EMPTY_FILTERS, modalites: ['alternance'] };
    const facets = await facetCounts(f, {});
    expect(facets.total).toBe(await count(f));
    // Own group: ticking « présentiel » too gives alternance OR présentiel.
    expect(option(facets, 'modalite', 'presentiel')).toBe(
      await count({ ...EMPTY_FILTERS, modalites: ['presentiel'] }),
    );
    // The ticked option never falls to 0 in its own group.
    expect(option(facets, 'modalite', 'alternance')).toBeGreaterThan(0);
    // Another group: with the filter.
    expect(option(facets, 'entree', 'M1')).toBe(await count({ ...f, entrees: ['M1'] }));
  });

  it('with several filters: each option is checked against all the others', async () => {
    const f: Filters = {
      ...EMPTY_FILTERS,
      domaines: ['droit-economie-gestion'],
      modalites: ['alternance'],
      entrees: ['M1'],
      acces: ['selectif'],
    };
    const facets = await facetCounts(f, {});
    expect(facets.total).toBe(await count(f));
    expect(option(facets, 'acces', 'accessible')).toBe(
      await count({ ...f, acces: ['accessible'] }),
    );
    const top = facets.etab!.sort((a, b) => b.count - a.count)[0]!;
    expect(top.count).toBe(await count({ ...f, etabs: [top.key] }));
    expect(option(facets, 'acces', 'selectif')).toBeGreaterThan(0);
  });
});

describe('facets: places', () => {
  it('a 25 km radius around Nantes keeps the campuses within 25 km, and only them', async () => {
    const nantes = await prisma.city.findFirst({ where: { inseeCode: '44109' } });
    expect(nantes?.lat).toBeTruthy();
    const f = { ...EMPTY_FILTERS, lieux: ['insee:44109'], rayon: 25 };
    const r = await browsePrograms(f, {}, { offset: 0, limit: 1000 });
    expect(r.total).toBeGreaterThan(0);
    const rows = await prisma.programSearchIndex.findMany({
      where: { programId: { in: r.rows.map((x) => x.programId) } },
      select: { lat: true, lng: true },
    });
    const km = (lat: number, lng: number) => {
      const rad = Math.PI / 180;
      const a =
        Math.sin(((lat - nantes!.lat!) * rad) / 2) ** 2 +
        Math.cos(nantes!.lat! * rad) *
          Math.cos(lat * rad) *
          Math.sin(((lng - nantes!.lng!) * rad) / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(a));
    };
    for (const x of rows) expect(km(x.lat!, x.lng!)).toBeLessThanOrEqual(25);
    // Wider radius, more (or as many) programs; the commune alone, fewer.
    expect(await count({ ...f, rayon: 50 })).toBeGreaterThanOrEqual(r.total);
    expect(await count({ ...f, rayon: null })).toBeLessThanOrEqual(r.total);
  });
});

describe('facets: URL', () => {
  it('a shared URL gives the same filters', () => {
    const f: Filters = {
      ...EMPTY_FILTERS,
      q: 'patrimoine',
      domaines: ['arts-lettres-langues'],
      lieux: ['insee:44109'],
      rayon: 25,
      etabs: ['0442953W'],
      types: ['UNIVERSITY', 'PRIVATE'],
      modalites: ['alternance', 'continue'],
      avis: ['note-4'],
      tri: 'notes',
    };
    const params = Object.fromEntries(
      Object.entries(filtersToParams(f)).filter((e): e is [string, string] => e[1] != null),
    );
    expect(readFilters(params)).toEqual(f);
    expect(params).toMatchObject({
      lieu: 'insee:44109',
      etab: '0442953W',
      modalite: 'alternance,continue',
    });
  });
  it('ignores unknown values', () => {
    expect(readFilters({ modalite: 'teleportation', rayon: '12', type: 'secte' })).toEqual(
      EMPTY_FILTERS,
    );
  });
});

describe('private establishments (D2 bis)', () => {
  // Letters only: a word like « prive-123 » parses as a number in PostgreSQL full text.
  const TAG = `prive${Date.now()
    .toString(36)
    .replace(/\d/g, (d) => 'abcdefghij'[Number(d)]!)}`;
  let programId = '';
  beforeAll(async () => {
    const mention = await mentionBySlug(FX.mentions.droit);
    const uni = await prisma.university.create({
      data: {
        name: `Institut catholique de Test ${TAG}`,
        slug: TAG,
        city: 'Testville',
        region: 'Test',
        sector: 'PRIVATE',
        sectorSource: 'annuaire',
      },
    });
    const p = await prisma.program.create({
      data: {
        title: `Zygomorphologie appliquée ${TAG}`,
        slug: `p-${TAG}`,
        mentionId: mention.id,
        universityId: uni.id,
        // in an open city: only the sector hides it
        city: 'Nantes',
      },
    });
    programId = p.id;
    await refreshProgramIndexRows([p.id]);
  });
  afterAll(async () => {
    const p = await prisma.program.delete({ where: { id: programId } });
    await prisma.university.delete({ where: { id: p.universityId } });
    await prisma.$disconnect();
  });

  it('is hidden from Explorer, the search and the palette unless asked', async () => {
    const q = `Zygomorphologie ${TAG}`;
    expect(await count({ ...EMPTY_FILTERS, q })).toBe(0);
    const s = await searchPage(q);
    expect(s.results.map((r) => r.id)).not.toContain(programId);
    expect(s.hiddenPrivate).toBe(1);
    const palette = await searchPage(q, {
      limits: { program: 7, mention: 4, university: 4, city: 4 },
    });
    expect(palette.results.some((r) => r.id === programId)).toBe(false);
    // With « Établissement privé » ticked (Explorer) or « Afficher » (search).
    expect(
      await count({ ...EMPTY_FILTERS, q, types: ['UNIVERSITY', 'PUBLIC_SCHOOL', 'PRIVATE'] }),
    ).toBe(1);
    expect(
      (await searchPage(q, { includePrivate: true })).results.some((r) => r.id === programId),
    ).toBe(true);
  });
});
