import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/db/generated/client';
import type { DataIssueKind, IssueSeverity } from '@/lib/db/generated/enums';

/**
 * Data problems of the admin (DataIssue). Computed in SQL, set-based, after each sync (whole
 * catalogue) and after each change in the admin (only the fiches touched): never on read.
 *
 * - CONFLICT: an open value conflict (DataConflict) · Important on a published fiche, else À faire;
 * - COLLECT_ERROR: a source whose last pass failed, an establishment whose site is paused or whose
 *   profile is paused, and its parcours in an open city · Bloquant;
 * - NO_PROGRAM: a parcours without any semester · À faire;
 * - OLD_PROGRAM: a programme read in a booklet more than 2 academic years old · À faire;
 * - NO_UAI: an establishment without UAI, and its parcours · À faire.
 *
 * A problem no longer detected is resolved (resolvedAt); one that comes back is reopened, with a
 * new firstSeenAt. « Ignorer » sets ignoredUntil: the row stays open but is left out of the lists.
 */

export const ISSUE_LABEL: Record<DataIssueKind, string> = {
  CONFLICT: 'Conflit',
  COLLECT_ERROR: 'Erreur de collecte',
  NO_PROGRAM: 'Sans programme',
  OLD_PROGRAM: 'Programme ancien',
  NO_UAI: 'Sans UAI',
};

/** Order of the « Priorité » sort and of the cards of a fiche: the most urgent first. */
export const ISSUE_ORDER: DataIssueKind[] = [
  'COLLECT_ERROR',
  'CONFLICT',
  'NO_UAI',
  'OLD_PROGRAM',
  'NO_PROGRAM',
];

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  BLOCK: 'Bloquant',
  HIGH: 'Important',
  LOW: 'À faire',
};

/** Days a problem stays out of the lists after « Ignorer ». */
export const IGNORE_DAYS = 30;

/** An open problem: not resolved, not ignored (SQL, alias-free). */
export const OPEN_ISSUE_SQL = `"resolvedAt" IS NULL AND ("ignoredUntil" IS NULL OR "ignoredUntil" <= now())`;

export interface IssueScope {
  programIds?: string[];
  universityIds?: string[];
  mentionIds?: string[];
}

/** Academic year a booklet must be from, at least, not to be « ancien » (2 years back). */
export function oldProgramThreshold(now = new Date()): number {
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return start - 2;
}

/**
 * Recomputes the problems, of the whole catalogue (no scope) or of a few fiches. `actorId` is
 * recorded on the problems this pass resolves (an arbitration, a programme entered by hand…).
 * Returns the number of open problems of the scope.
 */
export async function computeIssues(scope?: IssueScope, actorId: string | null = null) {
  let pids: string[] | null = null;
  let uids: string[] | null = null;
  let mids: string[] | null = null;
  if (scope) {
    const progs = await prisma.program.findMany({
      where: {
        OR: [
          { id: { in: scope.programIds ?? [] } },
          { universityId: { in: scope.universityIds ?? [] } },
        ],
      },
      select: { id: true, universityId: true },
    });
    pids = [...new Set([...(scope.programIds ?? []), ...progs.map((p) => p.id)])];
    uids = [...new Set([...(scope.universityIds ?? []), ...progs.map((p) => p.universityId)])];
    mids = scope.mentionIds ?? [];
  }
  const threshold = oldProgramThreshold();
  const sql = Prisma.sql;
  const raw = Prisma.raw;
  const upsert = raw(`ON CONFLICT (kind, "targetType", "targetId", field) DO UPDATE SET
      "lastSeenAt" = now(), severity = EXCLUDED.severity, detail = EXCLUDED.detail,
      "universityId" = EXCLUDED."universityId", published = EXCLUDED.published,
      "firstSeenAt" = CASE WHEN "DataIssue"."resolvedAt" IS NOT NULL THEN now() ELSE "DataIssue"."firstSeenAt" END,
      "resolvedAt" = NULL, "resolvedById" = NULL`);
  const cols = raw(
    `"DataIssue" (id, kind, "targetType", "targetId", field, severity, detail, "universityId", published, "firstSeenAt", "lastSeenAt")`,
  );
  const P = pids ? sql`p.id = ANY(${pids}::text[])` : sql`TRUE`;
  const U = uids ? sql`u.id = ANY(${uids}::text[])` : sql`TRUE`;
  const T = (col: string) =>
    pids
      ? sql`(${raw(col)} = ANY(${pids}::text[]) OR ${raw(col)} = ANY(${uids}::text[]) OR ${raw(col)} = ANY(${mids}::text[]))`
      : sql`TRUE`;

  return prisma.$transaction(
    async (tx) => {
      // Establishments in error: profile paused, or one of their hosts paused after failures.
      await tx.$executeRaw`CREATE TEMP TABLE IF NOT EXISTS nm_uni_err (id text PRIMARY KEY, detail text) ON COMMIT DROP`;
      await tx.$executeRaw`TRUNCATE nm_uni_err`;
      await tx.$executeRaw`
        INSERT INTO nm_uni_err (id, detail)
        SELECT u.id, left(coalesce(
                 (SELECT h."pausedReason" || ' · ' || h.host FROM "CrawlHost" h
                   WHERE h.host = ANY(u."siteDomains") AND h."pausedUntil" > now() ORDER BY h."pausedUntil" DESC LIMIT 1),
                 ep."pausedReason", 'collecte en pause'), 300)
          FROM "University" u LEFT JOIN "ExtractionProfile" ep ON ep."universityId" = u.id
         WHERE ${U} AND (ep.status = 'PAUSED'
                OR EXISTS (SELECT 1 FROM "CrawlHost" h WHERE h.host = ANY(u."siteDomains") AND h."pausedUntil" > now()))`;

      // COLLECT_ERROR · sources (whole catalogue only): last finished pass failed, not paused.
      if (!scope)
        await tx.$executeRaw`
          INSERT INTO ${cols}
          SELECT gen_random_uuid()::text, 'COLLECT_ERROR', 'SOURCE', s.id, '', 'BLOCK', left(r.error, 300), NULL, false, coalesce(r."finishedAt", now()), now()
            FROM "DataSource" s
            JOIN LATERAL (SELECT status, error, "finishedAt" FROM "SyncRun" r
                           WHERE r."sourceId" = s.id AND r.status IN ('SUCCEEDED', 'FAILED', 'AWAITING_VALIDATION')
                           ORDER BY r."queuedAt" DESC LIMIT 1) r ON true
           WHERE s.enabled AND r.status = 'FAILED' AND (s."pausedUntil" IS NULL OR s."pausedUntil" <= now())
          ${upsert}`;
      // COLLECT_ERROR · establishments, and their parcours of the open cities (the only ones read).
      await tx.$executeRaw`
        INSERT INTO ${cols}
        SELECT gen_random_uuid()::text, 'COLLECT_ERROR', 'UNIVERSITY', e.id, '', 'BLOCK', e.detail, e.id,
               EXISTS (SELECT 1 FROM "ProgramSearchIndex" i WHERE i."universityId" = e.id), now(), now()
          FROM nm_uni_err e
        ${upsert}`;
      await tx.$executeRaw`
        INSERT INTO ${cols}
        SELECT gen_random_uuid()::text, 'COLLECT_ERROR', 'PROGRAM', p.id, '', 'BLOCK', e.detail, p."universityId",
               (i."programId" IS NOT NULL), now(), now()
          FROM "Program" p JOIN nm_uni_err e ON e.id = p."universityId"
          LEFT JOIN "ProgramSearchIndex" i ON i."programId" = p.id
         WHERE ${P} AND p."inOpenZone"
        ${upsert}`;

      // CONFLICT: open value conflicts (merge proposals have their own screen, Rapprochements).
      await tx.$executeRaw`
        INSERT INTO ${cols}
        SELECT gen_random_uuid()::text, 'CONFLICT', c."entityType"::text::"IssueTarget", c."entityId", c.field,
               (CASE WHEN x.pub THEN 'HIGH' ELSE 'LOW' END)::"IssueSeverity",
               left(concat_ws(' ≠ ', c.options->0->>'source', c.options->1->>'source'), 300), x.uni, x.pub, c."createdAt", now()
          FROM "DataConflict" c
          CROSS JOIN LATERAL (
            SELECT CASE c."entityType"
                     WHEN 'PROGRAM' THEN EXISTS (SELECT 1 FROM "ProgramSearchIndex" i WHERE i."programId" = c."entityId")
                     WHEN 'UNIVERSITY' THEN EXISTS (SELECT 1 FROM "ProgramSearchIndex" i WHERE i."universityId" = c."entityId")
                     ELSE EXISTS (SELECT 1 FROM "ProgramSearchIndex" i WHERE i."mentionId" = c."entityId") END AS pub,
                   CASE c."entityType"
                     WHEN 'PROGRAM' THEN (SELECT p."universityId" FROM "Program" p WHERE p.id = c."entityId")
                     WHEN 'UNIVERSITY' THEN c."entityId" END AS uni) x
         WHERE c."resolvedAt" IS NULL AND c.kind = 'VALUE' AND ${T('c."entityId"')}
        ${upsert}`;

      // NO_PROGRAM / OLD_PROGRAM: the parcours, with or without semesters.
      await tx.$executeRaw`
        INSERT INTO ${cols}
        SELECT gen_random_uuid()::text, 'NO_PROGRAM', 'PROGRAM', p.id, '', 'LOW', NULL, p."universityId",
               (i."programId" IS NOT NULL), now(), now()
          FROM "Program" p LEFT JOIN "ProgramSearchIndex" i ON i."programId" = p.id
         WHERE ${P} AND NOT EXISTS (SELECT 1 FROM "ProgramSemester" s WHERE s."programId" = p.id)
        ${upsert}`;
      await tx.$executeRaw`
        INSERT INTO ${cols}
        SELECT gen_random_uuid()::text, 'OLD_PROGRAM', 'PROGRAM', p.id, '', 'LOW', 'Livret ' || y.label, p."universityId",
               (i."programId" IS NOT NULL), now(), now()
          FROM "Program" p
          JOIN LATERAL (SELECT max(s."sourceYear") AS label,
                               max(substring(s."sourceYear" from '^[0-9]{4}')::int) AS y
                          FROM "ProgramSemester" s WHERE s."programId" = p.id) y ON true
          LEFT JOIN "ProgramSearchIndex" i ON i."programId" = p.id
         WHERE ${P} AND y.y IS NOT NULL AND y.y < ${threshold}::int
        ${upsert}`;

      // NO_UAI: the establishment, and its parcours.
      await tx.$executeRaw`
        INSERT INTO ${cols}
        SELECT gen_random_uuid()::text, 'NO_UAI', 'UNIVERSITY', u.id, '', 'LOW', NULL, u.id,
               EXISTS (SELECT 1 FROM "ProgramSearchIndex" i WHERE i."universityId" = u.id), now(), now()
          FROM "University" u
         WHERE ${U} AND u.uai IS NULL
        ${upsert}`;
      await tx.$executeRaw`
        INSERT INTO ${cols}
        SELECT gen_random_uuid()::text, 'NO_UAI', 'PROGRAM', p.id, '', 'LOW', NULL, p."universityId",
               (i."programId" IS NOT NULL), now(), now()
          FROM "Program" p JOIN "University" u ON u.id = p."universityId"
          LEFT JOIN "ProgramSearchIndex" i ON i."programId" = p.id
         WHERE ${P} AND u.uai IS NULL
        ${upsert}`;

      // What this pass did not see again is solved (lastSeenAt is stored to the millisecond, now() is not).
      await tx.$executeRaw`
        UPDATE "DataIssue" SET "resolvedAt" = now(), "resolvedById" = ${actorId}
         WHERE "resolvedAt" IS NULL AND "lastSeenAt" < now() - interval '1 millisecond' AND ${T('"targetId"')}`;
      // Share of the published parcours with a programme, one point a day (overview: « +4 pts
      // cette semaine »), kept 60 days. Only after a whole pass.
      if (!scope) await recordProgrammeShare(tx);
      const [row] = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "DataIssue" WHERE ${raw(OPEN_ISSUE_SQL)} AND ${T('"targetId"')}`;
      return row?.n ?? 0;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

export const PROGRAMME_SHARE_KEY = 'admin.programmeShare';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function recordProgrammeShare(tx: Tx) {
  const [r] = await tx.$queryRaw<{ total: number; with: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "ProgramSemester" s WHERE s."programId" = i."programId"))::int AS with
      FROM "ProgramSearchIndex" i`;
  if (!r?.total) return;
  const cur = await tx.setting.findUnique({ where: { key: PROGRAMME_SHARE_KEY } });
  const history = { ...((cur?.value ?? {}) as Record<string, number>) };
  history[new Date().toISOString().slice(0, 10)] = Math.round((r.with / r.total) * 1000) / 10;
  const keep = Object.keys(history).sort().slice(-60);
  const value = Object.fromEntries(keep.map((k) => [k, history[k]!]));
  await tx.setting.upsert({
    where: { key: PROGRAMME_SHARE_KEY },
    create: { key: PROGRAMME_SHARE_KEY, value },
    update: { value },
  });
}
