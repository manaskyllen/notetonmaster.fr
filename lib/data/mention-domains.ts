import { Prisma } from '../db/generated/client';
import { prisma } from '../db';
import { disciplineDomainSql } from '../domain/discipline-domain';

/**
 * Domain of the mentions (`Mention.domainId`), from the disciplines Mon Master gives their
 * parcours: the most frequent one wins. No 'server-only' guard: the worker calls it after a sync
 * (lib/search-index.ts), and migration 20261124090000_mention_domains ran the same statement once.
 *
 * Only empty domains are filled: a domain set by hand (or by the seed) is never overwritten. A
 * domain that disagrees with the parcours is reported in the admin instead (« Traiter ce qui
 * cloche », lib/admin/counts.ts).
 */

/** Domain each mention's parcours point to (mode of their disciplines), as a SQL CTE body. */
const VOTES_SQL = `
  SELECT p."mentionId" AS id, mode() WITHIN GROUP (ORDER BY v.slug) AS slug
    FROM "Program" p
    JOIN LATERAL (
      SELECT ${disciplineDomainSql(`s.raw->>'disci_master'`)} AS slug
        FROM "AdmissionStat" s WHERE s."programId" = p.id
    ) v ON v.slug IS NOT NULL
   GROUP BY p."mentionId"`;

export async function fillMentionDomains(): Promise<number> {
  return prisma.$executeRaw`
    WITH votes AS (${Prisma.raw(VOTES_SQL)})
    UPDATE "Mention" m SET "domainId" = d.id
      FROM votes JOIN "Domain" d ON d.slug = votes.slug
     WHERE m.id = votes.id AND m."domainId" IS NULL`;
}

export interface MentionDomainIssue {
  id: string;
  name: string;
  /** Domain stored on the mention, or null. */
  stored: string | null;
  /** Domain of its published parcours (search index), the one the site shows. */
  listed: string;
}

/**
 * Published mentions (a parcours in an open city) without a domain, or whose domain is not the
 * one of their parcours: the admin check of « Traiter ce qui cloche ».
 */
export async function mentionDomainIssues(): Promise<MentionDomainIssue[]> {
  return prisma.$queryRaw<MentionDomainIssue[]>`
    WITH listed AS (
      SELECT "mentionId" AS id, mode() WITHIN GROUP (ORDER BY "domainSlug") AS slug
        FROM "ProgramSearchIndex" WHERE "isPublicSector" GROUP BY 1
    )
    SELECT m.id, m.name, d.slug AS stored, l.slug AS listed
      FROM listed l JOIN "Mention" m ON m.id = l.id
      LEFT JOIN "Domain" d ON d.id = m."domainId"
     WHERE d.slug IS DISTINCT FROM l.slug
     ORDER BY m.name`;
}
