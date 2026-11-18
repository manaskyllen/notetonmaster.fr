import { prisma } from '../db';

/**
 * Ratings of the mentions and of the universities (indexes /mentions and /universites), and the
 * figures of the cities (index /masters, refreshZoneStats): every
 * published review of their published parcours (public establishments, open cities) and its
 * average. Copied from the per-programme figures of ProgramSearchIndex (count × average sums back
 * to the exact average of the reviews), after every review change and every index refresh: the
 * pages read these columns, never the reviews. One statement per table over the index (a few
 * thousand rows), only the rows that changed are written.
 */
export async function refreshIndexRatings(): Promise<void> {
  await prisma.$executeRaw`
    WITH r AS (
      SELECT "mentionId" AS id, sum("reviewCount")::int AS n,
             sum("avgRating" * "reviewCount") / nullif(sum("reviewCount"), 0) AS avg
        FROM "ProgramSearchIndex" WHERE "isPublicSector" GROUP BY 1
    )
    UPDATE "Mention" m SET "reviewCount" = coalesce(r.n, 0), "avgRating" = r.avg
      FROM "Mention" m2 LEFT JOIN r ON r.id = m2.id
     WHERE m.id = m2.id
       AND (m."reviewCount" IS DISTINCT FROM coalesce(r.n, 0) OR m."avgRating" IS DISTINCT FROM r.avg)`;
  await prisma.$executeRaw`
    WITH r AS (
      SELECT "universityId" AS id, sum("reviewCount")::int AS n,
             sum("avgRating" * "reviewCount") / nullif(sum("reviewCount"), 0) AS avg
        FROM "ProgramSearchIndex" WHERE "isPublicSector" GROUP BY 1
    )
    UPDATE "University" u SET "reviewCount" = coalesce(r.n, 0), "avgRating" = r.avg
      FROM "University" u2 LEFT JOIN r ON r.id = u2.id
     WHERE u.id = u2.id
       AND (u."reviewCount" IS DISTINCT FROM coalesce(r.n, 0) OR u."avgRating" IS DISTINCT FROM r.avg)`;
  await refreshZoneStats();
}

/**
 * Figures of every city (LaunchZone) for /masters: published parcours of public establishments
 * taught in it, their establishments, their reviews and average, the parcours by domain, and the
 * INSEE region of the city (its own commune, else the most frequent region of its parcours).
 * A closed city has no row in the index: 0 everywhere. Also called on its own when cities open or
 * close (lib/launch/admin.ts), in case no parcours changed.
 */
export async function refreshZoneStats(): Promise<void> {
  // raw-sql: constant ZONE_STATS_SQL; no value.
  await prisma.$executeRawUnsafe(ZONE_STATS_SQL);
}

/** Copied in the migration city_index (first fill): keep both in step. */
export const ZONE_STATS_SQL = `
  WITH rows AS (
    SELECT z AS slug, i."universityId", i."reviewCount", i."avgRating", i.region, i."domainSlug"
      FROM "ProgramSearchIndex" i CROSS JOIN LATERAL unnest(i."zoneSlugs") z
     WHERE i."isPublicSector"
  ),
  s AS (
    SELECT slug, count(*)::int AS n, count(DISTINCT "universityId")::int AS etab,
           coalesce(sum("reviewCount"), 0)::int AS reviews,
           sum("avgRating" * "reviewCount") / nullif(sum("reviewCount"), 0) AS avg,
           mode() WITHIN GROUP (ORDER BY region) AS region
      FROM rows GROUP BY 1
  ),
  d AS (
    SELECT slug, jsonb_object_agg(dom, n) AS mix
      FROM (SELECT slug, "domainSlug" AS dom, count(*)::int AS n FROM rows
             WHERE "domainSlug" IS NOT NULL GROUP BY 1, 2) x
     GROUP BY 1
  ),
  v AS (
    SELECT lz.id, coalesce(s.n, 0) AS n, coalesce(s.etab, 0) AS etab,
           coalesce(s.reviews, 0) AS reviews, s.avg, coalesce(d.mix, '{}'::jsonb) AS mix,
           coalesce((SELECT c.region FROM "City" c
                      WHERE c."inseeCode" = ANY(lz."communeCodes") AND c.region <> ''
                      ORDER BY (lower(c.name) = lower(lz.name)) DESC, c."inseeCode" LIMIT 1),
                    s.region) AS region
      FROM "LaunchZone" lz
      LEFT JOIN s ON s.slug = lz.slug
      LEFT JOIN d ON d.slug = lz.slug
  )
  UPDATE "LaunchZone" z
     SET "programCount" = v.n, "establishmentCount" = v.etab, "reviewCount" = v.reviews,
         "avgRating" = v.avg, "domainCounts" = v.mix, region = v.region
    FROM v
   WHERE z.id = v.id
     AND (z."programCount", z."establishmentCount", z."reviewCount", z."avgRating", z."domainCounts", z.region)
         IS DISTINCT FROM (v.n, v.etab, v.reviews, v.avg, v.mix, v.region)`;
