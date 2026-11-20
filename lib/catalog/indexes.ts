import 'server-only';
import { unstable_cache } from 'next/cache';
import { TAGS } from '@/lib/cache/tags';
import { prisma } from '@/lib/db';
import { monogram, tileOf, type CityEntry, type DomainLegend } from './index-labels';

/**
 * Indexes /mentions, /universites and /masters: every entry
 * that has at least one published parcours (public establishment, open city), in one light list
 * the page filters and sorts in the browser (no pagination: a few hundred entries at most). Read
 * from ProgramSearchIndex (the published perimeter) and from the ratings denormalised on Mention
 * and University (lib/catalog/index-ratings.ts). Cached 10 min, expired with the catalogue and
 * when a city opens or closes.
 */

export interface MentionEntry {
  slug: string;
  name: string;
  /** Slug of the national domain, null when the mention has none. */
  domain: string | null;
  parcours: number;
  /** Open cities (LaunchZone slugs) where it has a published parcours. */
  zones: string[];
  avg: number | null;
  reviews: number;
}

export interface UniversityEntry {
  slug: string;
  /** Usual name of the annuaire. */
  name: string;
  mono: string;
  /** Index in TILES. */
  tile: number;
  kind: 'univ' | 'ecole';
  zones: string[];
  /** Communes of the open cities where it teaches a published master. */
  campus: string[];
  masters: number;
  mentions: number;
  avg: number | null;
  reviews: number;
}

export interface ZoneName {
  slug: string;
  name: string;
}

const openZones = () =>
  prisma.launchZone.findMany({
    where: { open: true },
    orderBy: { name: 'asc' },
    select: { slug: true, name: true },
  });

async function computeMentions(): Promise<{ entries: MentionEntry[]; zones: ZoneName[] }> {
  const [rows, zones] = await Promise.all([
    prisma.$queryRaw<MentionEntry[]>`
      SELECT m.slug, m.name,
             -- the domain of the index (from the discipline): Mention.domainId is often empty
             mode() WITHIN GROUP (ORDER BY i."domainSlug") AS domain,
             count(DISTINCT i."programId")::int AS parcours,
             coalesce(array_agg(DISTINCT z) FILTER (WHERE z IS NOT NULL), '{}') AS zones,
             m."avgRating" AS avg, m."reviewCount" AS reviews
        FROM "ProgramSearchIndex" i
        JOIN "Mention" m ON m.id = i."mentionId"
        LEFT JOIN LATERAL unnest(i."zoneSlugs") z ON TRUE
       WHERE i."isPublicSector"
       GROUP BY m.id`,
    openZones(),
  ]);
  const open = new Set(zones.map((z) => z.slug));
  return { entries: rows.map((r) => ({ ...r, zones: r.zones.filter((z) => open.has(z)) })), zones };
}

async function computeUniversities(): Promise<{ entries: UniversityEntry[]; zones: ZoneName[] }> {
  const [rows, campus, zones] = await Promise.all([
    prisma.$queryRaw<
      {
        id: string;
        slug: string;
        name: string;
        shortName: string | null;
        keywords: string[];
        kind: string;
        zones: string[];
        masters: number;
        mentions: number;
        avg: number | null;
        reviews: number;
      }[]
    >`
      SELECT u.id, u.slug, u.name, u."shortName", coalesce(u.keywords, '{}') AS keywords,
             min(i.kind) AS kind,
             coalesce(array_agg(DISTINCT z) FILTER (WHERE z IS NOT NULL), '{}') AS zones,
             count(DISTINCT i."programId")::int AS masters,
             count(DISTINCT i."mentionId")::int AS mentions,
             u."avgRating" AS avg, u."reviewCount" AS reviews
        FROM "ProgramSearchIndex" i
        JOIN "University" u ON u.id = i."universityId"
        LEFT JOIN LATERAL unnest(i."zoneSlugs") z ON TRUE
       WHERE i."isPublicSector"
       GROUP BY u.id`,
    // The communes of its published masters inside the open cities (not a far site of the
    // same programme: « Brest » for a Rennes master).
    prisma.$queryRaw<{ id: string; communes: string[] }[]>`
      SELECT i."universityId" AS id, array_agg(DISTINCT c.name) AS communes
        FROM "ProgramSearchIndex" i
        JOIN "Program" p ON p.id = i."programId"
        JOIN "LaunchZone" lz ON lz.open AND lz."communeCodes" && p."siteCommunes"
        CROSS JOIN LATERAL unnest(p."siteCommunes") code
        JOIN "City" c ON c."inseeCode" = code
       WHERE i."isPublicSector" AND code = ANY(lz."communeCodes")
       GROUP BY 1`,
    openZones(),
  ]);
  const communes = new Map(campus.map((c) => [c.id, c.communes]));
  // Only the cities open now (the index is rebuilt when one closes; this holds in between).
  const open = new Set(zones.map((z) => z.slug));
  return {
    zones,
    entries: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      mono: monogram(r),
      tile: tileOf(r.id),
      kind: r.kind === 'UNIVERSITY' ? 'univ' : 'ecole',
      zones: r.zones.filter((z) => open.has(z)),
      campus: communes.get(r.id) ?? [],
      masters: r.masters,
      mentions: r.mentions,
      avg: r.avg,
      reviews: r.reviews,
    })),
  };
}

export const mentionIndex = unstable_cache(computeMentions, ['index-mentions'], {
  revalidate: 600,
  tags: [TAGS.catalog, TAGS.zones],
});

export const universityIndex = unstable_cache(computeUniversities, ['index-universites'], {
  revalidate: 600,
  tags: [TAGS.catalog, TAGS.zones],
});

/**
 * /masters: every open city with at least one published master, one row each, read from the
 * figures denormalised on LaunchZone (lib/catalog/index-ratings.ts): no count at request time.
 * The four domains come with it for the legend and the bars.
 */
async function computeCities(): Promise<{ entries: CityEntry[]; domains: DomainLegend[] }> {
  const [zones, domains] = await Promise.all([
    prisma.launchZone.findMany({
      where: { open: true, programCount: { gt: 0 } },
      orderBy: [{ programCount: 'desc' }, { order: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        region: true,
        programCount: true,
        establishmentCount: true,
        reviewCount: true,
        avgRating: true,
        domainCounts: true,
      },
    }),
    prisma.domain.findMany({
      orderBy: { position: 'asc' },
      select: { slug: true, name: true, tone: true, icon: true },
    }),
  ]);
  return {
    domains,
    entries: zones.map((z) => ({
      slug: z.slug,
      name: z.name,
      // « Provence-Alpes-Côte d'Azur » → typographic apostrophe, as everywhere on the site
      region: z.region?.replace(/'/g, '’') ?? null,
      masters: z.programCount,
      establishments: z.establishmentCount,
      reviews: z.reviewCount,
      avg: z.avgRating,
      domains: (z.domainCounts ?? {}) as Record<string, number>,
    })),
  };
}

export { computeCities as computeCityIndex };

export const cityIndex = unstable_cache(computeCities, ['index-villes'], {
  revalidate: 600,
  tags: [TAGS.zones, TAGS.catalog],
});
