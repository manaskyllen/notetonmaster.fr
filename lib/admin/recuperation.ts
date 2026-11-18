import 'server-only';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/db/generated/client';
import { noJit } from '@/lib/db/no-jit';
import { normalize } from '@/lib/domain/search';
import { OPEN_ISSUE_SQL } from './issues';
import { formatWhen } from './when';

/**
 * Récupération (AdminSync mockup): what is to handle (collect errors, conflicts grouped by rule,
 * establishments without a collect profile), the sources, every establishment, the journal by
 * pass. Every list is read a page at a time.
 */

const nf = new Intl.NumberFormat('fr-FR');

// ───────────────────────────── À traiter ─────────────────────────────

export interface CollectError {
  issueId: string;
  kind: 'SOURCE' | 'UNIVERSITY';
  targetId: string;
  name: string;
  message: string;
  meta: string;
  sourceKey: string;
}

export async function collectErrors(): Promise<CollectError[]> {
  // raw-sql: constant SQL; no value from a request.
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      targetType: 'SOURCE' | 'UNIVERSITY';
      targetId: string;
      detail: string | null;
      firstSeenAt: Date;
      sname: string | null;
      skey: string | null;
      uname: string | null;
      fiches: number;
      fails: number;
    }[]
  >(
    `SELECT d.id, d."targetType", d."targetId", d.detail, d."firstSeenAt", s.name AS sname, s.key AS skey, u.name AS uname,
            (SELECT count(*)::int FROM "DataIssue" x WHERE x.kind = 'COLLECT_ERROR' AND x."targetType" = 'PROGRAM'
                AND x."universityId" = d."targetId" AND x."resolvedAt" IS NULL) AS fiches,
            CASE WHEN d."targetType" = 'SOURCE' THEN (
              SELECT count(*)::int FROM (SELECT status FROM "SyncRun" r WHERE r."sourceId" = d."targetId"
                AND r.status IN ('SUCCEEDED', 'FAILED', 'AWAITING_VALIDATION') ORDER BY r."queuedAt" DESC LIMIT 10) l
               WHERE l.status = 'FAILED')
            ELSE (SELECT coalesce(max(h.failures), 0)::int FROM "CrawlHost" h WHERE h.host = ANY(u."siteDomains")) END AS fails
       FROM "DataIssue" d
       LEFT JOIN "DataSource" s ON d."targetType" = 'SOURCE' AND s.id = d."targetId"
       LEFT JOIN "University" u ON d."targetType" = 'UNIVERSITY' AND u.id = d."targetId"
      WHERE d.kind = 'COLLECT_ERROR' AND d."targetType" IN ('SOURCE', 'UNIVERSITY') AND ${OPEN_ISSUE_SQL.replace(/"(resolvedAt|ignoredUntil)"/g, 'd."$1"')}
      ORDER BY d."targetType" DESC, d."firstSeenAt"`,
  );
  return rows.map((r) => {
    const days = Math.floor((Date.now() - r.firstSeenAt.getTime()) / 86_400_000);
    const since =
      days >= 1
        ? `Depuis ${days} jour${days > 1 ? 's' : ''}`
        : `Depuis ${formatWhen(r.firstSeenAt)}`;
    const attempts = r.fails ? ` · ${r.fails} tentative${r.fails > 1 ? 's' : ''}` : '';
    const touched =
      r.targetType === 'SOURCE'
        ? ' · données du dernier passage réussi gardées'
        : ` · ${nf.format(r.fiches)} parcours touché${r.fiches > 1 ? 's' : ''}`;
    return {
      issueId: r.id,
      kind: r.targetType,
      targetId: r.targetId,
      name:
        r.targetType === 'SOURCE'
          ? (r.sname ?? 'Source')
          : `Sites des universités · ${r.uname ?? ''}`,
      message: r.detail ?? 'Erreur sans message',
      meta: `${since}${attempts}${touched}`,
      sourceKey: r.skey ?? 'univ-sites',
    };
  });
}

export interface NoProfile {
  id: string;
  name: string;
  detail: string;
}

/** Establishments with a parcours in an open city and no collect profile. */
export async function noProfileUniversities(): Promise<NoProfile[]> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; city: string | null; host: string | null; reason: string | null }[]
  >`
    WITH last AS (
      SELECT r.stats FROM "SyncRun" r JOIN "DataSource" s ON s.id = r."sourceId"
       WHERE s.key = 'univ-sites' AND r.stats ? 'sites' ORDER BY r."queuedAt" DESC LIMIT 1)
    SELECT u.id, u.name, u.cities[1] AS city, coalesce(u."siteDomains"[1], regexp_replace(u.website, '^https?://([^/]+).*$', '\\1')) AS host,
           (SELECT x->>'reason' FROM last, jsonb_array_elements(last.stats->'sites') x WHERE x->>'universityId' = u.id LIMIT 1) AS reason
      FROM "University" u LEFT JOIN "ExtractionProfile" ep ON ep."universityId" = u.id
     WHERE ep.id IS NULL AND EXISTS (SELECT 1 FROM "Program" p WHERE p."universityId" = u.id AND p."inOpenZone")
     ORDER BY u.name`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    detail: [r.city, r.host, r.reason ?? 'gabarit inconnu (aucune page de master repérée)']
      .filter(Boolean)
      .join(' · '),
  }));
}

/** Data alerts still open, other than collect errors (shown with them). */
export async function openAlerts() {
  return prisma.dataAlert.findMany({
    where: { resolvedAt: null, NOT: { code: { in: ['host-paused', 'source-failing'] } } },
    orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    take: 50,
  });
}

// ───────────────────────────── Établissements ─────────────────────────────

export const PROFILE_FILTER: Record<string, string> = {
  ametys: 'AMETYS_ODF_HTML',
  ksup: 'KSUP',
  drupal: 'DRUPAL',
  generique: 'GENERIC_HTML',
  aucun: 'NONE',
};
export const PROFILE_LABEL: Record<string, string> = {
  AMETYS_ODF_HTML: 'Ametys ODF',
  AMETYS_ODF: 'Ametys ODF',
  KSUP: 'K-Sup',
  DRUPAL: 'Drupal',
  GENERIC_HTML: 'Générique',
  ODF_XML: 'ODF (XML)',
  PDF_BOOKLET: 'Livrets PDF',
};
export type EtabState = 'ok' | 'err' | 'robots' | 'none';
export const ETAB_STATE: Record<EtabState, string> = {
  ok: 'OK',
  err: 'En erreur',
  robots: 'Bloqué par robots.txt',
  none: 'Sans profil',
};

export interface EtabRow {
  id: string;
  name: string;
  city: string | null;
  host: string | null;
  profile: string;
  programs: number;
  pct: number;
  last: string | null;
  inZone: boolean;
  state: EtabState;
}

export async function etablissementsPage(o: {
  q: string;
  profile: string | null;
  state: EtabState | null;
  zoneOnly: boolean;
  offset: number;
  limit: number;
}) {
  const sql = Prisma.sql;
  const words = normalize(o.q)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 5);
  const where = Prisma.join(
    [
      o.zoneOnly ? sql`e.in_zone` : sql`TRUE`,
      ...words.map(
        (w) =>
          sql`public.nm_norm(e.name || ' ' || coalesce(e.city, '') || ' ' || coalesce(e.host, '')) LIKE ${`%${w}%`}`,
      ),
      o.profile === 'NONE'
        ? sql`e.kind IS NULL`
        : o.profile
          ? sql`e.kind = ${o.profile}`
          : sql`TRUE`,
      o.state ? sql`e.state = ${o.state}` : sql`TRUE`,
    ],
    ' AND ',
  );
  const rows = await noJit(
    (tx) =>
      tx.$queryRaw<
        (Omit<EtabRow, 'last' | 'profile' | 'inZone'> & {
          kind: string | null;
          last: Date | null;
          in_zone: boolean;
          total_rows: number;
          zone_total: number;
          all_total: number;
        })[]
      >`
      WITH p AS (
        SELECT "universityId" AS uni, count(*)::int AS n,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "ProgramSemester" s WHERE s."programId" = pr.id))::int AS with_prog,
               bool_or("inOpenZone") AS in_zone
          FROM "Program" pr GROUP BY 1),
      e AS (
        SELECT u.id, u.name, u.cities[1] AS city,
               coalesce(u."siteDomains"[1], regexp_replace(u.website, '^https?://([^/]+).*$', '\\1')) AS host,
               ep.kind::text AS kind, coalesce(p.n, 0) AS programs,
               CASE WHEN coalesce(p.n, 0) = 0 THEN 0 ELSE round(100.0 * p.with_prog / p.n)::int END AS pct,
               (SELECT max(c."lastFetchedAt") FROM "CrawlPage" c WHERE c."universityId" = u.id) AS last,
               coalesce(p.in_zone, false) AS in_zone,
               CASE WHEN ep.id IS NULL THEN 'none'
                    WHEN ep.status = 'BLOCKED' THEN 'robots'
                    WHEN EXISTS (SELECT 1 FROM "DataIssue" d WHERE d.kind = 'COLLECT_ERROR' AND d."targetType" = 'UNIVERSITY'
                                  AND d."targetId" = u.id AND d."resolvedAt" IS NULL) THEN 'err'
                    ELSE 'ok' END AS state
          FROM "University" u LEFT JOIN "ExtractionProfile" ep ON ep."universityId" = u.id LEFT JOIN p ON p.uni = u.id)
      SELECT e.*, count(*) OVER ()::int AS total_rows,
             (SELECT count(*)::int FROM e WHERE e.in_zone) AS zone_total, (SELECT count(*)::int FROM e) AS all_total
        FROM e WHERE ${where}
       ORDER BY e.in_zone DESC, e.programs DESC, e.name
       LIMIT ${o.limit} OFFSET ${o.offset}`,
  );
  const [totals] = rows.length
    ? [{ zone: rows[0]!.zone_total, all: rows[0]!.all_total }]
    : await prisma.$queryRaw<{ zone: number; all: number }[]>`
        SELECT (SELECT count(DISTINCT "universityId")::int FROM "Program" WHERE "inOpenZone") AS zone, (SELECT count(*)::int FROM "University") AS all`;
  return {
    rows: rows.map((r): EtabRow => ({
      id: r.id,
      name: r.name,
      city: r.city,
      host: r.host,
      profile: r.kind ? (PROFILE_LABEL[r.kind] ?? r.kind) : 'Sans profil',
      programs: r.programs,
      pct: r.pct,
      last: r.last ? formatWhen(r.last) : r.in_zone ? 'Jamais' : 'Pas encore (ville fermée)',
      inZone: r.in_zone,
      state: r.state,
    })),
    total: rows[0]?.total_rows ?? 0,
    zoneTotal: totals?.zone ?? 0,
    allTotal: totals?.all ?? 0,
  };
}

// ───────────────────────────── Journal ─────────────────────────────

export interface RunRow {
  id: string;
  name: string;
  sourceKey: string;
  status: string;
  tone: 'ok' | 'err' | 'warn' | 'run';
  when: string;
  duration: string;
  result: string;
  reportHref: string | null;
}

type RunStats = {
  sites?: { fetched?: number; notModified?: number; failed?: number }[];
  created?: number;
  updated?: number;
  conflicts?: number;
  options?: { universityIds?: string[] };
};
type RunDiff = { byAction?: Record<string, number>; nothingNew?: boolean };

function duration(a: Date | null, b: Date | null): string {
  if (!a || !b) return '—';
  const s = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60
    ? `${m} min${s % 60 ? ` ${String(s % 60).padStart(2, '0')}` : ''}`
    : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

function runResult(
  status: string,
  stats: RunStats | null,
  diff: RunDiff | null,
  errors: number,
): string {
  if (status === 'FAILED') return 'Échec';
  if (status === 'SKIPPED') return 'Ignoré';
  if (status === 'QUEUED') return 'En file';
  if (status === 'RUNNING') return 'En cours';
  const parts: string[] = [];
  if (stats?.sites?.length) {
    const pages = stats.sites.reduce((a, s) => a + (s.fetched ?? 0) + (s.notModified ?? 0), 0);
    const failed = stats.sites.reduce((a, s) => a + (s.failed ?? 0), 0);
    parts.push(
      `${nf.format(pages)} pages`,
      `${stats.sites.length} établissement${stats.sites.length > 1 ? 's' : ''}`,
    );
    if (failed) parts.push(`${failed} erreur${failed > 1 ? 's' : ''}`);
  } else if (diff?.byAction) {
    const a = diff.byAction;
    if (diff.nothingNew) parts.push('rien de nouveau');
    else
      parts.push(
        `${nf.format(a.create ?? 0)} créations`,
        `${nf.format(a.update ?? 0)} modifications`,
      );
  } else if (stats) {
    parts.push(
      `${nf.format(stats.created ?? 0)} créés`,
      `${nf.format(stats.updated ?? 0)} mis à jour`,
    );
    if (stats.conflicts) parts.push(`${stats.conflicts} conflits`);
  }
  if (errors && !parts.some((p) => p.includes('erreur')))
    parts.push(`${errors} erreur${errors > 1 ? 's' : ''}`);
  if (status === 'AWAITING_VALIDATION') parts.push('à valider');
  return parts.join(' · ') || 'Terminé';
}

export const RUNS_PAGE = 30;

/** Passes, newest first, by cursor (queuedAt, id). */
export async function runsPage(o: {
  source: string | null;
  level: 'err' | 'warn' | null;
  days: number | null;
  before?: string;
}) {
  const sql = Prisma.sql;
  const ref = o.before
    ? await prisma.syncRun.findUnique({
        where: { id: o.before },
        select: { id: true, queuedAt: true },
      })
    : null;
  const rows = await prisma.$queryRaw<
    {
      id: string;
      status: string;
      queuedAt: Date;
      startedAt: Date | null;
      finishedAt: Date | null;
      stats: RunStats | null;
      diff: RunDiff | null;
      mode: string;
      sname: string;
      skey: string;
      errors: number;
      warns: number;
    }[]
  >`
    SELECT r.id, r.status::text, r."queuedAt", r."startedAt", r."finishedAt", r.stats, r.diff, r.mode::text, s.name AS sname, s.key AS skey,
           (SELECT count(*)::int FROM "SyncLog" l WHERE l."runId" = r.id AND l.level = 'ERROR') AS errors,
           (SELECT count(*)::int FROM "SyncLog" l WHERE l."runId" = r.id AND l.level = 'WARN') AS warns
      FROM "SyncRun" r JOIN "DataSource" s ON s.id = r."sourceId"
     WHERE ${Prisma.join(
       [
         o.source ? sql`s.key = ${o.source}` : sql`TRUE`,
         o.days ? sql`r."queuedAt" > now() - make_interval(days => ${o.days})` : sql`TRUE`,
         o.level === 'err'
           ? sql`(r.status = 'FAILED' OR EXISTS (SELECT 1 FROM "SyncLog" l WHERE l."runId" = r.id AND l.level = 'ERROR'))`
           : o.level === 'warn'
             ? sql`(r.status = 'AWAITING_VALIDATION' OR EXISTS (SELECT 1 FROM "SyncLog" l WHERE l."runId" = r.id AND l.level = 'WARN'))`
             : sql`TRUE`,
         ref ? sql`(r."queuedAt", r.id) < (${ref.queuedAt}, ${ref.id})` : sql`TRUE`,
       ],
       ' AND ',
     )}
     ORDER BY r."queuedAt" DESC, r.id DESC
     LIMIT ${RUNS_PAGE + 1}`;
  const uniIds = [
    ...new Set(
      rows.flatMap((r) =>
        r.stats?.options?.universityIds?.length === 1 ? r.stats.options.universityIds : [],
      ),
    ),
  ];
  const unis = new Map(
    (
      await prisma.university.findMany({
        where: { id: { in: uniIds } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );
  const page = rows.slice(0, RUNS_PAGE);
  return {
    rows: page.map((r): RunRow => {
      const one =
        r.stats?.options?.universityIds?.length === 1
          ? unis.get(r.stats.options.universityIds[0]!)
          : null;
      return {
        id: r.id,
        name: `${r.sname}${one ? ` · ${one}` : ''}${r.mode === 'PREVIEW' ? ' · simulation' : ''}`,
        sourceKey: r.skey,
        status: r.status,
        tone:
          r.status === 'FAILED' || r.errors
            ? 'err'
            : r.status === 'RUNNING' || r.status === 'QUEUED'
              ? 'run'
              : r.status === 'AWAITING_VALIDATION' || r.warns
                ? 'warn'
                : 'ok',
        when: formatWhen(r.startedAt ?? r.queuedAt),
        duration: duration(r.startedAt, r.finishedAt),
        result: runResult(r.status, r.stats, r.diff, r.errors),
        reportHref: r.diff ? `/admin/recuperation/rapports/${r.id}` : null,
      };
    }),
    next: rows.length > RUNS_PAGE ? page.at(-1)!.id : null,
  };
}
