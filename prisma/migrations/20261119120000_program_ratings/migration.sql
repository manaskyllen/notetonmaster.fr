-- Allègement, partie 5 : note, nombre d'avis et part de recommandation dénormalisés sur Program
-- (lib/catalog/program-ratings.ts), indexés pour les tris « Mieux notés » et « Plus d'avis ».
ALTER TABLE "Program"
  ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "verifiedReviewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "avgRating" DOUBLE PRECISION,
  ADD COLUMN "recommendShare" INTEGER;

CREATE INDEX "Program_avgRating_reviewCount_idx" ON "Program"("avgRating" DESC, "reviewCount" DESC);
CREATE INDEX "Program_reviewCount_idx" ON "Program"("reviewCount" DESC);

ALTER TABLE "ProgramSearchIndex" ADD COLUMN "recommendShare" INTEGER;

-- Backfill from the published reviews (then the index copies them at its next rebuild).
WITH rev AS (
  SELECT r."programId", count(*)::int AS n,
         (count(*) FILTER (WHERE r."isVerified"))::int AS nv,
         avg(r."overallRating")::float AS avg,
         round(100.0 * count(*) FILTER (WHERE r."overallRating" >= 4) / count(*))::int AS reco
    FROM "Review" r WHERE r.status = 'PUBLISHED' GROUP BY 1
)
UPDATE "Program" p SET "reviewCount" = rev.n, "verifiedReviewCount" = rev.nv, "avgRating" = rev.avg, "recommendShare" = rev.reco
  FROM rev WHERE rev."programId" = p.id;

UPDATE "ProgramSearchIndex" i SET "recommendShare" = p."recommendShare"
  FROM "Program" p WHERE p.id = i."programId";
