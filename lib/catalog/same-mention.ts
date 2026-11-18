import { prisma } from '@/lib/db';
import type { ProgramCardData } from '@/components/catalog/ProgramCard';

export const SAME_MENTION_LIMIT = 4;

/**
 * « Même mention, ailleurs » under a fiche parcours: up to 4 listed parcours of
 * the same mention (public establishments), never the current one; the same city first, then the
 * best rated (rating, number of reviews, A → Z). `count` is every parcours of the mention, for
 * « Voir les n parcours de la mention ». Read from the search index only.
 */
export async function sameMentionElsewhere(p: {
  id: string;
  mentionId: string;
}): Promise<{ rows: ProgramCardData[]; count: number }> {
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<ProgramCardData[]>`
      WITH cur AS (SELECT "cityKey" FROM "ProgramSearchIndex" WHERE "programId" = ${p.id})
      SELECT i."programId", i.slug, i.title, i."universityId", i."universityShort", i."universityName",
             i."cityName", i.modalities, i."entryLevel"::text AS "entryLevel", i."durationYears",
             i."isPublicSector", i."avgRating", i."reviewCount", i."recommendShare"
        FROM "ProgramSearchIndex" i
       WHERE i."mentionId" = ${p.mentionId} AND i."programId" <> ${p.id} AND i."isPublicSector"
       ORDER BY (i."cityKey" = (SELECT "cityKey" FROM cur)) IS NOT TRUE,
                i."avgRating" DESC NULLS LAST, i."reviewCount" DESC, i."titleNorm", i."programId"
       LIMIT ${SAME_MENTION_LIMIT}`,
    prisma.programSearchIndex.count({ where: { mentionId: p.mentionId, isPublicSector: true } }),
  ]);
  return { rows, count };
}
