import { prisma } from '../db';

/**
 * Ratings denormalised on Program: published reviews,
 * verified ones, average overall rating and the share that recommend the master (overall rating
 * of 4 or 5, as in the hero of the fiche). Recomputed for some programs after every review
 * published, edited, hidden or removed (`afterReviewChange`), for all of them on a full index
 * rebuild. The lists read the copy in ProgramSearchIndex, never the reviews.
 */
export async function refreshProgramRatings(ids: string[] | null): Promise<number> {
  const list = ids ? [...new Set(ids.filter(Boolean))] : null;
  if (list && !list.length) return 0;
  return prisma.$executeRaw`
    WITH rev AS (
      SELECT r."programId", count(*)::int AS n,
             (count(*) FILTER (WHERE r."isVerified"))::int AS nv,
             avg(r."overallRating")::float AS avg,
             round(100.0 * count(*) FILTER (WHERE r."overallRating" >= 4) / count(*))::int AS reco
        FROM "Review" r
       WHERE r.status = 'PUBLISHED' AND (${list}::text[] IS NULL OR r."programId" = ANY(${list}::text[]))
       GROUP BY 1
    )
    UPDATE "Program" p
       SET "reviewCount" = coalesce(rev.n, 0), "verifiedReviewCount" = coalesce(rev.nv, 0),
           "avgRating" = rev.avg, "recommendShare" = rev.reco
      FROM "Program" p2 LEFT JOIN rev ON rev."programId" = p2.id
     WHERE p.id = p2.id AND (${list}::text[] IS NULL OR p.id = ANY(${list}::text[]))
       AND (p."reviewCount" IS DISTINCT FROM coalesce(rev.n, 0)
         OR p."verifiedReviewCount" IS DISTINCT FROM coalesce(rev.nv, 0)
         OR p."avgRating" IS DISTINCT FROM rev.avg
         OR p."recommendShare" IS DISTINCT FROM rev.reco)`;
}
