import 'server-only';
import { unstable_cache } from 'next/cache';
import type { ProgramCardData } from '@/components/catalog/ProgramCard';
import { TAGS } from '@/lib/cache/tags';
import { prisma } from '@/lib/db';
import { cachedOpenZones } from '@/lib/launch/cached';
import type { OpenZone } from '@/lib/launch/zones';

/**
 * Landing pages by city: /masters/{ville} for every open city with a published master, and
 * /masters/{ville}/{mention} only when the city has at least MIN_CITY_MENTION published parcours
 * of that mention (fewer would be thin, duplicate pages). Public establishments only, read from
 * ProgramSearchIndex (`zoneSlugs` holds the open cities a parcours is taught in). They appear and
 * disappear with the opening of the cities: a closed city is not in cachedOpenZones (404, out of
 * the sitemap). Cached 10 min, expired with the catalogue and the zones.
 */

export const MIN_CITY_MENTION = 2;

const OPTS = { revalidate: 600, tags: [TAGS.catalog, TAGS.zones] };

const CARD_SQL = `i."programId", i.slug, i.title, i."universityId", i."universityShort", i."universityName",
  i."cityName", i.modalities, i."entryLevel"::text AS "entryLevel", i."durationYears",
  i."isPublicSector", i."avgRating", i."reviewCount", i."recommendShare",
  i."cursusCount", i."cursusLabels", i."cursusKind"`;

export interface CityMention {
  slug: string;
  name: string;
  programs: number;
  /** The only parcours when there is one (no city × mention page then). */
  onlySlug: string | null;
  onlyTitle: string | null;
}

export interface CityUniversity {
  slug: string;
  name: string;
  programs: number;
}

export interface CityOverview {
  zone: OpenZone;
  programs: number;
  reviews: number;
  mentions: CityMention[];
  universities: CityUniversity[];
  updatedAt: Date | null;
}

async function computeOverview(slug: string): Promise<CityOverview | null> {
  const zone = (await cachedOpenZones()).find((z) => z.slug === slug);
  if (!zone) return null;
  const [mentions, universities, [totals]] = await Promise.all([
    prisma.$queryRaw<CityMention[]>`
      SELECT i."mentionSlug" AS slug, i."mentionName" AS name, count(*)::int AS programs,
             CASE WHEN count(*) = 1 THEN min(i.slug) END AS "onlySlug",
             CASE WHEN count(*) = 1 THEN min(i.title) END AS "onlyTitle"
        FROM "ProgramSearchIndex" i
       WHERE ${slug} = ANY(i."zoneSlugs") AND i."isPublicSector"
       GROUP BY 1, 2 ORDER BY 3 DESC, 2`,
    prisma.$queryRaw<CityUniversity[]>`
      SELECT i."universitySlug" AS slug, min(i."universityName") AS name, count(*)::int AS programs
        FROM "ProgramSearchIndex" i
       WHERE ${slug} = ANY(i."zoneSlugs") AND i."isPublicSector"
       GROUP BY 1 ORDER BY 3 DESC, 2`,
    prisma.$queryRaw<{ programs: number; reviews: number; updated: Date | null }[]>`
      SELECT count(*)::int AS programs, coalesce(sum(i."reviewCount"), 0)::int AS reviews,
             max(greatest(p."updatedAt", (SELECT max(r."publishedAt") FROM "Review" r
                                           WHERE r."programId" = p.id AND r.status = 'PUBLISHED'))) AS updated
        FROM "ProgramSearchIndex" i JOIN "Program" p ON p.id = i."programId"
       WHERE ${slug} = ANY(i."zoneSlugs") AND i."isPublicSector"`,
  ]);
  if (!totals?.programs) return null;
  return {
    zone,
    programs: totals.programs,
    reviews: totals.reviews,
    mentions,
    universities,
    updatedAt: totals.updated,
  };
}

export const getCityOverview = (slug: string) =>
  unstable_cache(() => computeOverview(slug), ['city-overview', slug], OPTS)();

export interface CityMentionPage {
  zone: OpenZone;
  mention: { id: string; slug: string; name: string };
  programs: ProgramCardData[];
  universities: number;
  reviews: number;
  /** Other open cities with a page for this mention. */
  otherCities: { slug: string; name: string; programs: number }[];
}

async function computeCityMention(city: string, mention: string): Promise<CityMentionPage | null> {
  const zones = await cachedOpenZones();
  const zone = zones.find((z) => z.slug === city);
  if (!zone) return null;
  const m = await prisma.mention.findUnique({
    where: { slug: mention },
    select: { id: true, slug: true, name: true, isPublished: true },
  });
  if (!m?.isPublished) return null;
  // raw-sql: constant CARD_SQL; city, zone and mention are $n parameters.
  const programs = await prisma.$queryRawUnsafe<ProgramCardData[]>(
    `SELECT ${CARD_SQL} FROM "ProgramSearchIndex" i
      WHERE $1 = ANY(i."zoneSlugs") AND i."isPublicSector" AND i."mentionId" = $2
      ORDER BY i."avgRating" DESC NULLS LAST, i."reviewCount" DESC, i."titleNorm", i."programId"`,
    city,
    m.id,
  );
  if (programs.length < MIN_CITY_MENTION) return null;
  const pairs = await cityMentionPairs();
  return {
    zone,
    mention: { id: m.id, slug: m.slug, name: m.name },
    programs,
    universities: new Set(programs.map((p) => p.universityId)).size,
    reviews: programs.reduce((n, p) => n + p.reviewCount, 0),
    otherCities: pairs
      .filter((p) => p.mention === m.slug && p.city !== city)
      .map((p) => ({
        slug: p.city,
        name: zones.find((z) => z.slug === p.city)!.name,
        programs: p.programs,
      })),
  };
}

export const getCityMention = (city: string, mention: string) =>
  unstable_cache(() => computeCityMention(city, mention), ['city-mention', city, mention], OPTS)();

export interface CityMentionPair {
  city: string;
  mention: string;
  programs: number;
  updatedAt: Date | null;
}

/**
 * Every city × mention page (open city, at least MIN_CITY_MENTION public parcours), most
 * furnished first: sitemap, links of the mention and parcours pages.
 */
async function computePairs(): Promise<CityMentionPair[]> {
  const open = (await cachedOpenZones()).map((z) => z.slug);
  if (!open.length) return [];
  const rows = await prisma.$queryRaw<CityMentionPair[]>`
    SELECT z AS city, i."mentionSlug" AS mention, count(*)::int AS programs,
           max(greatest(p."updatedAt", (SELECT max(r."publishedAt") FROM "Review" r
                                         WHERE r."programId" = p.id AND r.status = 'PUBLISHED'))) AS "updatedAt"
      FROM "ProgramSearchIndex" i
      JOIN "Program" p ON p.id = i."programId"
      CROSS JOIN LATERAL unnest(i."zoneSlugs") z
     WHERE i."isPublicSector" AND z = ANY(${open}::text[])
     GROUP BY 1, 2 HAVING count(*) >= ${MIN_CITY_MENTION}
     ORDER BY 3 DESC, 1, 2`;
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt ? new Date(r.updatedAt) : null }));
}

export const cityMentionPairs = unstable_cache(computePairs, ['city-mention-pairs'], OPTS);

/** /masters/{ville}/{mention} when that page exists, else null. */
export async function cityMentionHref(city: string, mention: string): Promise<string | null> {
  const pairs = await cityMentionPairs();
  return pairs.some((p) => p.city === city && p.mention === mention)
    ? `/masters/${city}/${mention}`
    : null;
}

export const cityHref = (slug: string) => `/masters/${slug}`;

/**
 * The open city of a parcours (the most furnished one when it is taught in several) and its
 * city × mention page if there is one: breadcrumb and links of the fiche.
 */
export async function programPlace(
  programId: string,
  mentionSlug: string,
): Promise<{ zone: OpenZone; cityMention: string | null } | null> {
  const [row, zones] = await Promise.all([
    prisma.programSearchIndex.findUnique({ where: { programId }, select: { zoneSlugs: true } }),
    cachedOpenZones(),
  ]);
  const zone = zones.find((z) => row?.zoneSlugs.includes(z.slug));
  if (!zone) return null;
  return { zone, cityMention: await cityMentionHref(zone.slug, mentionSlug) };
}

export interface PlaceLink {
  slug: string;
  name: string;
  programs: number;
  /** /masters/{ville}/{mention} (mention pages) or /masters/{ville} (university pages). */
  href: string;
}

async function zonesOf(where: 'mention' | 'university', ids: string[]) {
  const rows = await prisma.$queryRaw<{ zone: string; programs: number }[]>`
    SELECT z AS zone, count(*)::int AS programs
      FROM "ProgramSearchIndex" i CROSS JOIN LATERAL unnest(i."zoneSlugs") z
     WHERE i."isPublicSector"
       AND (CASE WHEN ${where} = 'mention' THEN i."mentionId" = ANY(${ids}::text[])
                 ELSE i."universityId" = ANY(${ids}::text[]) END)
     GROUP BY 1 ORDER BY 2 DESC, 1`;
  const zones = await cachedOpenZones();
  return rows.flatMap((r) => {
    const z = zones.find((x) => x.slug === r.zone);
    return z ? [{ slug: z.slug, name: z.name, programs: r.programs }] : [];
  });
}

/** Open cities of a mention, each to its city × mention page (or its city page below 2). */
export async function mentionCities(mentionId: string, mentionSlug: string): Promise<PlaceLink[]> {
  const [list, pairs] = await Promise.all([zonesOf('mention', [mentionId]), cityMentionPairs()]);
  return list.map((z) => ({
    ...z,
    href: pairs.some((p) => p.city === z.slug && p.mention === mentionSlug)
      ? `/masters/${z.slug}/${mentionSlug}`
      : `/masters/${z.slug}`,
  }));
}

/** Open cities where an establishment teaches a published master, to their city pages. */
export async function universityCities(ids: string[]): Promise<PlaceLink[]> {
  return (await zonesOf('university', ids)).map((z) => ({ ...z, href: `/masters/${z.slug}` }));
}
