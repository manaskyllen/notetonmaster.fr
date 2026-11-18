-- Figures of the cards of /masters, denormalised on LaunchZone (lib/catalog/index-ratings.ts
-- fills them after every sync, review change and opening or closing of a city).
ALTER TABLE "LaunchZone" ADD COLUMN     "avgRating" DOUBLE PRECISION,
ADD COLUMN     "domainCounts" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "establishmentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "programCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- « Montbéliar » was typed without its final d (docs/seo/audit.md). The old address answers
-- with a 301 (next.config.ts).
UPDATE "LaunchZone" SET slug = 'montbeliard', name = 'Montbéliard'
 WHERE slug = 'montbeliar'
   AND NOT EXISTS (SELECT 1 FROM "LaunchZone" WHERE slug = 'montbeliard');
UPDATE "ProgramSearchIndex" SET "zoneSlugs" = array_replace("zoneSlugs", 'montbeliar', 'montbeliard')
 WHERE 'montbeliar' = ANY("zoneSlugs");

-- First fill (same statement as refreshZoneStats, lib/catalog/index-ratings.ts).
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
       IS DISTINCT FROM (v.n, v.etab, v.reviews, v.avg, v.mix, v.region);
