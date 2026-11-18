/** Index /masters (VillesIndex): figures denormalised on LaunchZone, sorts, shares, rating rule. */
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { refreshZoneStats } from '@/lib/catalog/index-ratings';
import {
  cityOrder,
  cityReviewsShown,
  domainShares,
  matchesWords,
  regionSlug,
  type CityEntry,
} from '@/lib/catalog/index-labels';
import { computeCityIndex } from '@/lib/catalog/indexes';

afterAll(() => prisma.$disconnect());

const DOMAINS = [
  { slug: 'al', name: 'Arts, lettres, langues', tone: 'violet' },
  { slug: 'shs', name: 'Sciences humaines et sociales', tone: 'lime' },
  { slug: 'deg', name: 'Droit, économie, gestion', tone: 'coral' },
  { slug: 'sts', name: 'Sciences, technologies, santé', tone: 'night' },
];

const city = (name: string, masters: number, reviews: number, region = 'Grand Est'): CityEntry => ({
  slug: regionSlug(name),
  name,
  region,
  masters,
  establishments: 1,
  reviews,
  avg: reviews ? 4 : null,
  domains: {},
});

describe('city cards', () => {
  it('shows the average from 3 reviews only, the count below, nothing without', () => {
    expect(cityReviewsShown(0, null)).toBe('none');
    expect(cityReviewsShown(1, 3)).toBe('count');
    expect(cityReviewsShown(2, 4.5)).toBe('count');
    expect(cityReviewsShown(3, 4)).toBe('grade');
    expect(cityReviewsShown(18, 3.78)).toBe('grade');
  });

  it('domain shares: legend order, absent domains left out, percentages adding up to 100', () => {
    const s = domainShares({ sts: 143, deg: 120, al: 52, shs: 101 }, DOMAINS);
    expect(s.map((d) => d.slug)).toEqual(['al', 'shs', 'deg', 'sts']);
    expect(s.reduce((t, d) => t + d.pct, 0)).toBe(100);
    const t = domainShares({ shs: 1, deg: 1, sts: 1 }, DOMAINS);
    expect(t.map((d) => d.slug)).toEqual(['shs', 'deg', 'sts']);
    expect(t.map((d) => d.pct)).toEqual([34, 33, 33]);
    expect(domainShares({}, DOMAINS)).toEqual([]);
  });

  it('sorts: most masters by default, A → Z with accents, most reviews then most masters', () => {
    const rows = [
      city('Metz', 97, 1),
      city('Écully', 5, 0),
      city('Nantes', 157, 18),
      city('Belfort', 12, 1),
    ];
    const names = (s: Parameters<typeof cityOrder>[0]) =>
      [...rows].sort(cityOrder(s)).map((c) => c.name);
    expect(names('masters')).toEqual(['Nantes', 'Metz', 'Belfort', 'Écully']);
    expect(names('az')).toEqual(['Belfort', 'Écully', 'Metz', 'Nantes']);
    expect(names('avis')).toEqual(['Nantes', 'Metz', 'Belfort', 'Écully']);
  });

  it('the field matches the city or its region, accents ignored; region slugs for the address', () => {
    const text = 'Marseille Provence-Alpes-Côte d’Azur';
    expect(matchesWords(text, 'cote azur')).toBe(true);
    expect(matchesWords(text, 'marseille')).toBe(true);
    expect(matchesWords(text, 'lyon')).toBe(false);
    expect(regionSlug('Provence-Alpes-Côte d’Azur')).toBe('provence-alpes-cote-d-azur');
    expect(regionSlug('Auvergne-Rhône-Alpes')).toBe('auvergne-rhone-alpes');
  });
});

describe('figures of the cities, denormalised on LaunchZone', () => {
  it('equal the published parcours of public establishments of the search index', async () => {
    await refreshZoneStats();
    const rows = await prisma.$queryRaw<
      {
        slug: string;
        n: number;
        stored: number;
        etab: number;
        setab: number;
        r: number;
        sr: number;
      }[]
    >`
      SELECT z.slug, count(i."programId")::int AS n, z."programCount" AS stored,
             count(DISTINCT i."universityId")::int AS etab, z."establishmentCount" AS setab,
             coalesce(sum(i."reviewCount"), 0)::int AS r, z."reviewCount" AS sr
        FROM "LaunchZone" z
        LEFT JOIN "ProgramSearchIndex" i ON z.slug = ANY(i."zoneSlugs") AND i."isPublicSector"
       GROUP BY z.id`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.stored, r.slug).toBe(r.n);
      expect(r.setab, r.slug).toBe(r.etab);
      expect(r.sr, r.slug).toBe(r.r);
    }
  });

  it('an open city without any published master is not listed', async () => {
    const zone = await prisma.launchZone.create({
      data: {
        slug: 'test-ville-vide',
        name: 'Ville vide',
        epciCode: 'test-000000000',
        epciName: 'CC de test',
        communeCodes: ['99999'],
        open: true,
      },
    });
    try {
      await refreshZoneStats();
      const { entries, domains } = await computeCityIndex();
      expect(entries.some((e) => e.slug === zone.slug)).toBe(false);
      expect(entries.every((e) => e.masters > 0)).toBe(true);
      const open = await prisma.launchZone.findMany({
        where: { open: true, programCount: { gt: 0 } },
        select: { slug: true },
      });
      expect(entries.map((e) => e.slug).sort()).toEqual(open.map((z) => z.slug).sort());
      expect(domains.map((d) => d.tone)).toEqual(['violet', 'lime', 'coral', 'night']);
    } finally {
      await prisma.launchZone.delete({ where: { id: zone.id } });
    }
  });
});
