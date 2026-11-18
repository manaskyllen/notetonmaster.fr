-- Ratings of the mentions and universities (indexes /mentions and /universites), denormalised
-- from the published parcours of ProgramSearchIndex (lib/catalog/index-ratings.ts).
ALTER TABLE "Mention" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0,
                      ADD COLUMN "avgRating" DOUBLE PRECISION;
ALTER TABLE "University" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0,
                         ADD COLUMN "avgRating" DOUBLE PRECISION;

-- First values (then kept by refreshIndexRatings).
UPDATE "Mention" m SET "reviewCount" = r.n, "avgRating" = r.avg
  FROM (SELECT "mentionId" AS id, sum("reviewCount")::int AS n,
               sum("avgRating" * "reviewCount") / nullif(sum("reviewCount"), 0) AS avg
          FROM "ProgramSearchIndex" WHERE "isPublicSector" GROUP BY 1) r
 WHERE r.id = m.id;
UPDATE "University" u SET "reviewCount" = r.n, "avgRating" = r.avg
  FROM (SELECT "universityId" AS id, sum("reviewCount")::int AS n,
               sum("avgRating" * "reviewCount") / nullif(sum("reviewCount"), 0) AS avg
          FROM "ProgramSearchIndex" WHERE "isPublicSector" GROUP BY 1) r
 WHERE r.id = u.id;
