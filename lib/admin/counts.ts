import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import type { DataIssueKind, IssueSeverity, IssueTarget } from '@/lib/db/generated/enums';
import { TAGS } from '@/lib/cache/tags';
import { conflictGroups } from './conflict-groups';
import { OPEN_ISSUE_SQL } from './issues';

/** Items waiting in each moderation queue. */
export async function moderationCounts() {
  const [
    reviews,
    documents,
    messageReports,
    reviewReportTargets,
    legal,
    responses,
    questions,
    answers,
  ] = await Promise.all([
    prisma.review.count({ where: { status: 'PENDING' } }),
    prisma.programVerification.count({ where: { method: 'DOCUMENT', status: 'PENDING' } }),
    prisma.report.groupBy({ by: ['targetId'], where: { targetType: 'MESSAGE', status: 'OPEN' } }),
    prisma.report.groupBy({ by: ['targetId'], where: { targetType: 'REVIEW', status: 'OPEN' } }),
    prisma.legalRequest.count({ where: { status: { not: 'CLOSED' } } }),
    prisma.reviewResponse.count({ where: { status: 'PENDING' } }),
    prisma.question.count({ where: { status: 'PENDING' } }),
    prisma.answer.count({ where: { status: 'PENDING' } }),
  ]);
  return {
    reviews,
    documents,
    messages: messageReports.length,
    reports: reviewReportTargets.length,
    legal,
    responses,
    questions: questions + answers,
    total:
      reviews +
      documents +
      messageReports.length +
      reviewReportTargets.length +
      responses +
      questions +
      answers +
      legal,
  };
}

export interface IssueCount {
  kind: DataIssueKind;
  targetType: IssueTarget;
  severity: IssueSeverity;
  published: boolean;
  n: number;
}

/**
 * Every counter of the admin, read in the database and cached 5 minutes (tag `admin-counts`,
 * expired after a sync, an arbitration, a bulk action). Problems: one grouped query on DataIssue.
 */
export interface AdminCounts {
  issues: IssueCount[];
  /** Published fiches with at least one open problem (sidebar « Fiches », view « À traiter »). */
  fichesToHandle: number;
  /** Names of the sources and establishments in collect error (first ones). */
  collectErrors: { sources: string[]; universities: string[]; total: number };
  /** Published parcours without programme, by open city. */
  noProgramByCity: { city: string; n: number }[];
  moderation: Awaited<ReturnType<typeof moderationCounts>>;
  /** Oldest review waiting, in hours. */
  oldestReviewHours: number | null;
  /** Open legal requests: the nearest internal deadline, in days. */
  legalDeadlineDays: number | null;
  conflictGroups: { groups: number; fields: string[]; isolated: number };
  noProfile: { n: number; names: string[] };
  computedAt: string;
}

export async function readCounts(): Promise<AdminCounts> {
  const [issues, fiches, errors, byCity, moderation, oldest, legal, groups, noProfile] =
    await Promise.all([
      // raw-sql: constant SQL (OPEN_ISSUE_SQL); no value from a request.
      prisma.$queryRawUnsafe<IssueCount[]>(
        `SELECT kind, "targetType", severity, published, count(*)::int AS n
           FROM "DataIssue" WHERE ${OPEN_ISSUE_SQL} GROUP BY 1, 2, 3, 4`,
      ),
      // raw-sql: constant SQL (OPEN_ISSUE_SQL); no value from a request.
      prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(DISTINCT "targetId")::int AS n FROM "DataIssue"
          WHERE ${OPEN_ISSUE_SQL} AND published AND "targetType" <> 'SOURCE'`,
      ),
      // raw-sql: constant SQL (OPEN_ISSUE_SQL); no value from a request.
      prisma.$queryRawUnsafe<{ type: string; name: string }[]>(
        `SELECT d."targetType"::text AS type, coalesce(s.name, u.name) AS name
           FROM "DataIssue" d
           LEFT JOIN "DataSource" s ON d."targetType" = 'SOURCE' AND s.id = d."targetId"
           LEFT JOIN "University" u ON d."targetType" = 'UNIVERSITY' AND u.id = d."targetId"
          WHERE ${OPEN_ISSUE_SQL} AND kind = 'COLLECT_ERROR' AND d."targetType" IN ('SOURCE', 'UNIVERSITY')
          ORDER BY d."targetType" DESC, d."firstSeenAt"`,
      ),
      // raw-sql: constant SQL (OPEN_ISSUE_SQL); no value from a request.
      prisma.$queryRawUnsafe<{ city: string; n: number }[]>(
        `SELECT lz.name AS city, count(DISTINCT d."targetId")::int AS n
           FROM "DataIssue" d JOIN "ProgramSearchIndex" i ON i."programId" = d."targetId"
           CROSS JOIN LATERAL unnest(i."zoneSlugs") z(slug) JOIN "LaunchZone" lz ON lz.slug = z.slug
          WHERE ${OPEN_ISSUE_SQL} AND d.kind = 'NO_PROGRAM' AND d.published
          GROUP BY lz.name ORDER BY 2 DESC LIMIT 4`,
      ),
      moderationCounts(),
      prisma.review.findFirst({
        where: { status: 'PENDING' },
        orderBy: { submittedAt: 'asc' },
        select: { submittedAt: true },
      }),
      prisma.legalRequest.findFirst({
        where: { status: { not: 'CLOSED' } },
        orderBy: { internalDeadline: 'asc' },
        select: { internalDeadline: true },
      }),
      conflictGroups(),
      // Establishments with a parcours in an open city and no usable collect profile.
      prisma.$queryRaw<{ name: string }[]>`
        SELECT u.name FROM "University" u LEFT JOIN "ExtractionProfile" ep ON ep."universityId" = u.id
         WHERE ep.id IS NULL
           AND EXISTS (SELECT 1 FROM "Program" p WHERE p."universityId" = u.id AND p."inOpenZone")
         ORDER BY u.name`,
    ]);
  const now = Date.now();
  const sources = errors.filter((e) => e.type === 'SOURCE').map((e) => e.name);
  const universities = errors.filter((e) => e.type === 'UNIVERSITY').map((e) => e.name);
  return {
    issues,
    fichesToHandle: fiches[0]?.n ?? 0,
    collectErrors: {
      sources: sources.slice(0, 3),
      universities: universities.slice(0, 3),
      total: errors.length,
    },
    noProgramByCity: byCity,
    moderation,
    oldestReviewHours: oldest ? Math.floor((now - oldest.submittedAt.getTime()) / 3_600_000) : null,
    legalDeadlineDays: legal
      ? Math.ceil((legal.internalDeadline.getTime() - now) / 86_400_000)
      : null,
    conflictGroups: {
      groups: groups.groups.length,
      fields: [...new Set(groups.groups.map((g) => g.fieldLabel.toLowerCase()))].slice(0, 4),
      isolated: groups.isolated,
    },
    noProfile: { n: noProfile.length, names: noProfile.slice(0, 3).map((u) => u.name) },
    computedAt: new Date().toISOString(),
  };
}

export const adminCounts = unstable_cache(readCounts, ['admin-counts-v1'], {
  revalidate: 300,
  tags: [TAGS.admin],
});

/** Sum of the open problems of a kind, optionally of the published fiches only. */
export function issueTotal(
  c: Pick<AdminCounts, 'issues'>,
  kind: DataIssueKind,
  o: { published?: boolean; targets?: IssueTarget[]; severity?: IssueSeverity } = {},
) {
  return c.issues
    .filter(
      (i) =>
        i.kind === kind &&
        (o.published === undefined || i.published === o.published) &&
        (!o.targets || o.targets.includes(i.targetType)) &&
        (!o.severity || i.severity === o.severity),
    )
    .reduce((a, i) => a + i.n, 0);
}

export async function ficheCount() {
  const [p, m, u] = await Promise.all([
    prisma.program.count(),
    prisma.mention.count(),
    prisma.university.count(),
  ]);
  return p + m + u;
}

/** Turnstile verifications of the last 7 days, grouped by form and outcome. */
export async function turnstileWeek() {
  return prisma.turnstileLog.groupBy({
    by: ['form', 'outcome'],
    where: { at: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } },
    _count: { _all: true },
  });
}

/** Figures of the overview (bandeau, villes ouvertes, dernières synchros), same cache. */
export interface OverviewData {
  published: number;
  inBase: number;
  programmeShare: number | null;
  /** Points gained (or lost) in 7 days, null before a week of history. */
  programmeDelta: number | null;
  reviewsPublished: number;
  sourcesEnabled: number;
  sourcesTotal: number;
  sourcesInError: number;
  cities: { name: string; slug: string; fiches: number; programme: number; reviews: number }[];
  runs: { id: string; name: string; status: string; at: string | null }[];
  lastSync: { at: string; errors: number } | null;
}

export async function readOverview(): Promise<OverviewData> {
  const { PROGRAMME_SHARE_KEY } = await import('./issues');
  const [published, inBase, reviews, sources, sourceErrors, cities, runs, share] =
    await Promise.all([
      prisma.programSearchIndex.count(),
      prisma.program.count(),
      prisma.review.count({ where: { status: 'PUBLISHED' } }),
      prisma.dataSource.findMany({ select: { enabled: true } }),
      // raw-sql: constant SQL (OPEN_ISSUE_SQL); no value from a request.
      prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "DataIssue" WHERE ${OPEN_ISSUE_SQL} AND kind = 'COLLECT_ERROR' AND "targetType" = 'SOURCE'`,
      ),
      prisma.$queryRaw<OverviewData['cities']>`
      SELECT lz.name, lz.slug, count(i."programId")::int AS fiches,
             coalesce(round(100.0 * count(i."programId") FILTER (WHERE EXISTS (
               SELECT 1 FROM "ProgramSemester" s WHERE s."programId" = i."programId")) / nullif(count(i."programId"), 0)), 0)::int AS programme,
             coalesce(sum(i."reviewCount"), 0)::int AS reviews
        FROM "LaunchZone" lz LEFT JOIN "ProgramSearchIndex" i ON lz.slug = ANY(i."zoneSlugs")
       WHERE lz.open GROUP BY lz.id ORDER BY lz."order", lz.name`,
      prisma.syncRun.findMany({
        where: { status: { in: ['SUCCEEDED', 'FAILED', 'AWAITING_VALIDATION', 'RUNNING'] } },
        orderBy: [{ startedAt: 'desc' }],
        take: 4,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          source: { select: { name: true } },
        },
      }),
      prisma.setting.findUnique({ where: { key: PROGRAMME_SHARE_KEY } }),
    ]);
  const history = Object.entries((share?.value ?? {}) as Record<string, number>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const last = history.at(-1);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const base = history.filter(([d]) => d <= weekAgo).at(-1);
  const lastRun = runs.find((r) => r.status !== 'RUNNING');
  return {
    published,
    inBase,
    programmeShare: last ? Math.round(last[1]) : null,
    programmeDelta: last && base ? Math.round(last[1] - base[1]) : null,
    reviewsPublished: reviews,
    sourcesEnabled: sources.filter((s) => s.enabled).length,
    sourcesTotal: sources.length,
    sourcesInError: sourceErrors[0]?.n ?? 0,
    cities,
    runs: runs.map((r) => ({
      id: r.id,
      name: r.source.name,
      status: r.status,
      at: (r.finishedAt ?? r.startedAt)?.toISOString() ?? null,
    })),
    lastSync: lastRun
      ? {
          at: (lastRun.finishedAt ?? lastRun.startedAt)!.toISOString(),
          errors: sourceErrors[0]?.n ?? 0,
        }
      : null,
  };
}

export const overviewData = unstable_cache(readOverview, ['admin-overview-v1'], {
  revalidate: 300,
  tags: [TAGS.admin],
});
