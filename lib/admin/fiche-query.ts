import { Prisma } from '@/lib/db/generated/client';
import { prisma } from '@/lib/db';
import { noJit } from '@/lib/db/no-jit';
import type { DataIssueKind, EntityType } from '@/lib/db/generated/enums';
import { codeCandidates, codeVariants, normalize } from '@/lib/domain/search';
import { ISSUE_ORDER, OPEN_ISSUE_SQL } from './issues';

/**
 * Admin catalogue (Fiches): every program, mention and establishment, drafts included, read by
 * view (« À traiter », « Publiées », « Conflits »…), searched (name, establishment, Mon Master,
 * RNCP, UAI), filtered (type, city, establishment, problem), sorted (priority, name, last sync,
 * least complete) and paginated on the server. One statement per page, total included.
 */

export type Publication = 'pub' | 'off' | 'draft';

export interface FicheRow {
  id: string;
  type: EntityType;
  name: string;
  sub: string;
  ident: string;
  publication: Publication;
  publicHref: string;
  issues: DataIssueKind[];
  pct: number;
  lastSync: string | null;
  syncFailed: boolean;
}

/** Views of the left column, as written in the URL (`vue=`). */
export const VIEWS = {
  'a-traiter': { label: 'À traiter', group: 'Suivi' },
  toutes: { label: 'Toutes', group: 'Suivi' },
  publiees: { label: 'Publiées', group: 'Suivi' },
  'hors-ville': { label: 'Hors ville ouverte', group: 'Suivi' },
  brouillons: { label: 'Brouillons', group: 'Suivi' },
  conflits: { label: 'Conflits', group: 'Par problème', kind: 'CONFLICT' },
  erreurs: { label: 'Erreurs de collecte', group: 'Par problème', kind: 'COLLECT_ERROR' },
  'sans-programme': { label: 'Sans programme', group: 'Par problème', kind: 'NO_PROGRAM' },
  'programme-ancien': { label: 'Programme ancien', group: 'Par problème', kind: 'OLD_PROGRAM' },
  'sans-uai': { label: 'Sans UAI', group: 'Par problème', kind: 'NO_UAI' },
  /** Parcours whose cursus nothing tells apart (issue #21): to name by hand. */
  'cursus-sans-libelle': { label: 'Cursus sans libellé', group: 'Par problème' },
} as const satisfies Record<string, { label: string; group: string; kind?: DataIssueKind }>;
export type ViewKey = keyof typeof VIEWS;
export const DEFAULT_VIEW: ViewKey = 'a-traiter';

/** Problem filter (`probleme=`). */
export const PROBLEM_PARAM: Record<string, DataIssueKind> = {
  conflit: 'CONFLICT',
  erreur: 'COLLECT_ERROR',
  'sans-programme': 'NO_PROGRAM',
  'programme-ancien': 'OLD_PROGRAM',
  'sans-uai': 'NO_UAI',
};
export const TYPE_PARAM: Record<string, EntityType> = {
  parcours: 'PROGRAM',
  mention: 'MENTION',
  etablissement: 'UNIVERSITY',
};
export const SORTS = {
  priorite: 'Priorité',
  nom: 'Nom A → Z',
  synchro: 'Dernière synchro',
  completude: 'Moins complètes',
} as const;
export type SortKey = keyof typeof SORTS;

export interface FicheQuery {
  view: ViewKey;
  q: string;
  type: EntityType | null;
  /** Slug of an open city, or « hors » (outside the open cities). */
  city: string | null;
  universityId: string | null;
  problem: DataIssueKind | null;
  sort: SortKey;
}

type Params = Record<string, string | string[] | undefined>;
const one = (sp: Params, k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? '';

/** Reads a query from the URL (or from a saved view). Unknown values fall back to defaults. */
export function readFicheQuery(sp: Params): FicheQuery {
  const view = one(sp, 'vue');
  const sort = one(sp, 'tri');
  return {
    view: view in VIEWS ? (view as ViewKey) : DEFAULT_VIEW,
    q: one(sp, 'q').slice(0, 120),
    type: TYPE_PARAM[one(sp, 'type')] ?? null,
    city: one(sp, 'ville') || null,
    universityId: one(sp, 'etablissement') || null,
    problem: PROBLEM_PARAM[one(sp, 'probleme')] ?? null,
    sort: sort in SORTS ? (sort as SortKey) : 'priorite',
  };
}

/** The query as a query string (saved views, links of the bulk actions). */
export function ficheQueryString(q: FicheQuery): string {
  const p = new URLSearchParams();
  if (q.view !== DEFAULT_VIEW) p.set('vue', q.view);
  if (q.q) p.set('q', q.q);
  const type = Object.entries(TYPE_PARAM).find(([, v]) => v === q.type)?.[0];
  if (type) p.set('type', type);
  if (q.city) p.set('ville', q.city);
  if (q.universityId) p.set('etablissement', q.universityId);
  const prob = Object.entries(PROBLEM_PARAM).find(([, v]) => v === q.problem)?.[0];
  if (prob) p.set('probleme', prob);
  if (q.sort !== 'priorite') p.set('tri', q.sort);
  return p.toString();
}

const sql = Prisma.sql;
const KIND_ORDER = Prisma.raw(`ARRAY[${ISSUE_ORDER.map((k) => `'${k}'`).join(',')}]::text[]`);

/** Every fiche with its publication, problems and completeness (CTE `m`). */
export const FICHES_BASE = sql`
  mm AS (SELECT "programId", string_agg(code, ' + ' ORDER BY code) AS codes FROM "MonMasterEntry" GROUP BY 1),
  iss AS (
    SELECT "targetId" AS id,
           array_agg(kind::text ORDER BY array_position(${KIND_ORDER}, kind::text)) AS kinds,
           min(CASE severity WHEN 'BLOCK' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END) AS sev,
           min(array_position(${KIND_ORDER}, kind::text)) AS kord
      FROM "DataIssue" WHERE ${Prisma.raw(OPEN_ISSUE_SQL)} AND "targetType" <> 'SOURCE' GROUP BY 1),
  prov AS (
    SELECT "entityId", count(*)::int AS total, count(*) FILTER (WHERE state IN ('OK', 'STALE'))::int AS done,
           max("fetchedAt") AS last
      FROM "FieldProvenance" GROUP BY 1),
  f AS (
    SELECT 'PROGRAM'::text AS type, p.id, p.title AS name,
           concat_ws(' · ', u.name, p.city) AS sub,
           coalesce('MM ' || mm.codes, 'MM —') AS ident,
           CASE WHEN i."programId" IS NOT NULL THEN 'pub' WHEN p."isPublished" THEN 'off' ELSE 'draft' END AS publication,
           '/parcours/' || p.slug AS "publicHref", p."universityId" AS uni, p."siteCommunes" AS communes,
           p."inOpenZone" AS inzone, 0 AS ord
      FROM "Program" p JOIN "University" u ON u.id = p."universityId"
      LEFT JOIN mm ON mm."programId" = p.id
      LEFT JOIN "ProgramSearchIndex" i ON i."programId" = p.id
     -- A fiche merged into its parcours is one of its cursus: listed under the parcours.
     WHERE p.status <> 'MERGED'
    UNION ALL
    SELECT 'MENTION', m.id, m.name, 'Mention nationale', coalesce(m."rncpCode", 'RNCP —'),
           CASE WHEN NOT m."isPublished" THEN 'draft'
                WHEN EXISTS (SELECT 1 FROM "ProgramSearchIndex" i WHERE i."mentionId" = m.id) THEN 'pub' ELSE 'off' END,
           '/mentions/' || m.slug, NULL, NULL, NULL, 1
      FROM "Mention" m
    UNION ALL
    SELECT 'UNIVERSITY', u.id, u.name,
           concat_ws(' · ', coalesce(u."shortName", u."establishmentType"), nullif(array_to_string(u.cities, ', '), '')),
           CASE WHEN u.uai IS NOT NULL THEN 'UAI ' || u.uai ELSE 'UAI —' END,
           CASE WHEN NOT u."isPublished" THEN 'draft'
                WHEN EXISTS (SELECT 1 FROM "ProgramSearchIndex" i WHERE i."universityId" = u.id) THEN 'pub' ELSE 'off' END,
           '/universites/' || u.slug, u.id, NULL, NULL, 2
      FROM "University" u),
  m AS (
    SELECT f.*, coalesce(iss.kinds, '{}') AS kinds, coalesce(iss.sev, 9) AS sev, coalesce(iss.kord, 99) AS kord,
           CASE WHEN coalesce(prov.total, 0) = 0 THEN 0 ELSE round(100.0 * prov.done / prov.total)::int END AS pct,
           prov.last
      FROM f LEFT JOIN iss ON iss.id = f.id LEFT JOIN prov ON prov."entityId" = f.id)`;

function viewSql(view: ViewKey) {
  const v = VIEWS[view] as { kind?: DataIssueKind };
  if (v.kind) return sql`m.publication = 'pub' AND ${v.kind} = ANY(m.kinds)`;
  switch (view) {
    case 'a-traiter':
      return sql`m.publication = 'pub' AND cardinality(m.kinds) > 0`;
    case 'publiees':
      return sql`m.publication = 'pub'`;
    case 'hors-ville':
      return sql`m.publication = 'off'`;
    case 'brouillons':
      return sql`m.publication = 'draft'`;
    case 'cursus-sans-libelle':
      return sql`m.type = 'PROGRAM' AND EXISTS (
        SELECT 1 FROM "MonMasterEntry" e
         WHERE e."programId" = m.id AND e."cursusLabel" IS NULL
           AND e."lastSession" = (SELECT max(x."lastSession") FROM "MonMasterEntry" x WHERE x."programId" = m.id)
           AND (SELECT count(*) FROM "MonMasterEntry" y WHERE y."programId" = m.id AND y."lastSession" = e."lastSession") > 1)`;
    default:
      return sql`TRUE`;
  }
}

async function whereSql(q: FicheQuery) {
  const words = normalize(q.q)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 6);
  const codes = [...new Set(codeCandidates(q.q).flatMap((c) => codeVariants(c.code)))];
  const coded = codes.length
    ? (
        await prisma.identifier.findMany({
          where: { OR: codes.map((v) => ({ value: { startsWith: v } })) },
          select: { entityId: true },
          take: 2000,
        })
      ).map((i) => i.entityId)
    : [];
  const text = words.length
    ? Prisma.join(
        words.map(
          (w) => sql`public.nm_norm(m.name || ' ' || m.sub || ' ' || m.ident) LIKE ${`%${w}%`}`,
        ),
        ' AND ',
      )
    : sql`TRUE`;
  const city =
    q.city === 'hors'
      ? sql`m.type <> 'MENTION' AND NOT CASE m.type
              WHEN 'PROGRAM' THEN m.inzone
              ELSE EXISTS (SELECT 1 FROM "Program" p WHERE p."universityId" = m.id AND p."inOpenZone") END`
      : q.city
        ? sql`m.type <> 'MENTION' AND EXISTS (
              SELECT 1 FROM "LaunchZone" lz WHERE lz.slug = ${q.city} AND lz.open AND (
                CASE m.type WHEN 'PROGRAM' THEN m.communes && lz."communeCodes"
                  ELSE EXISTS (SELECT 1 FROM "Program" p WHERE p."universityId" = m.id AND p."siteCommunes" && lz."communeCodes") END))`
        : sql`TRUE`;
  return Prisma.join(
    [
      viewSql(q.view),
      coded.length ? sql`(m.id = ANY(${coded}) OR (${text}))` : text,
      q.type ? sql`m.type = ${q.type}` : sql`TRUE`,
      city,
      q.universityId ? sql`m.uni = ${q.universityId}` : sql`TRUE`,
      q.problem ? sql`${q.problem} = ANY(m.kinds)` : sql`TRUE`,
    ],
    ' AND ',
  );
}

const ORDER: Record<SortKey, Prisma.Sql> = {
  priorite: sql`m.sev, m.kord, cardinality(m.kinds) DESC, m.ord, public.nm_norm(m.name), m.id`,
  nom: sql`public.nm_norm(m.name), m.id`,
  synchro: sql`m.last DESC NULLS LAST, m.id`,
  completude: sql`m.pct, public.nm_norm(m.name), m.id`,
};

export async function getFichesPage(q: FicheQuery, offset: number, limit: number) {
  const where = await whereSql(q);
  const rows = await noJit(
    (tx) => tx.$queryRaw<
      (Omit<FicheRow, 'issues' | 'lastSync' | 'syncFailed'> & {
        kinds: DataIssueKind[];
        last: Date | null;
        total_rows: number;
      })[]
    >`
    WITH ${FICHES_BASE}
    SELECT m.type, m.id, m.name, m.sub, m.ident, m.publication, m."publicHref", m.kinds, m.pct, m.last,
           count(*) OVER ()::int AS total_rows
      FROM m WHERE ${where}
     ORDER BY ${ORDER[q.sort]}
     LIMIT ${limit} OFFSET ${offset}`,
  );
  return {
    rows: rows.map((r): FicheRow => ({
      id: r.id,
      type: r.type,
      name: r.name,
      sub: r.sub,
      ident: r.ident,
      publication: r.publication,
      publicHref: r.publicHref,
      issues: r.kinds,
      pct: r.pct,
      lastSync: r.last?.toISOString() ?? null,
      syncFailed: r.kinds.includes('COLLECT_ERROR'),
    })),
    total: rows[0]?.total_rows ?? (offset > 0 ? await countFiches(q) : 0),
  };
}

/** Number of fiches of a query (a page beyond the last one, saved views). */
export async function countFiches(q: FicheQuery): Promise<number> {
  const where = await whereSql(q);
  const [r] = await noJit(
    (tx) => tx.$queryRaw<{ n: number }[]>`
    WITH ${FICHES_BASE} SELECT count(*)::int AS n FROM m WHERE ${where}`,
  );
  return r?.n ?? 0;
}

/** Ids and types of every fiche of a query (« Sélectionner les 183 fiches de la vue »). */
export async function ficheIds(q: FicheQuery, max = 20_000) {
  const where = await whereSql(q);
  return noJit(
    (tx) => tx.$queryRaw<{ id: string; type: EntityType }[]>`
    WITH ${FICHES_BASE} SELECT m.id, m.type FROM m WHERE ${where} ORDER BY ${ORDER[q.sort]} LIMIT ${max}`,
  );
}

/** Counters of every view, one grouped statement (cached by lib/admin/fiches.ts). */
export async function readViewCounts(): Promise<Record<ViewKey, number>> {
  const kinds = Object.entries(VIEWS).filter(([, v]) => 'kind' in v) as [
    ViewKey,
    { kind: DataIssueKind },
  ][];
  const [r] = await noJit(
    (tx) => tx.$queryRaw<Record<string, number>[]>`
      WITH ${FICHES_BASE}
      SELECT count(*) FILTER (WHERE publication = 'pub' AND cardinality(kinds) > 0)::int AS "a-traiter",
             count(*)::int AS toutes,
             count(*) FILTER (WHERE publication = 'pub')::int AS publiees,
             count(*) FILTER (WHERE publication = 'off')::int AS "hors-ville",
             count(*) FILTER (WHERE publication = 'draft')::int AS brouillons,
             ${Prisma.join(
               kinds.map(
                 ([key, v]) =>
                   sql`count(*) FILTER (WHERE publication = 'pub' AND ${v.kind} = ANY(kinds))::int AS ${Prisma.raw(`"${key}"`)}`,
               ),
               ', ',
             )}
        FROM m`,
  );
  return r as Record<ViewKey, number>;
}

/** CSV of fiches (export of a view or of a selection), one line per fiche. */
export async function fichesCsvRows(ids: string[]): Promise<string[][]> {
  const out: string[][] = [
    [
      'Type',
      'Nom',
      'Établissement · ville',
      'Identifiants',
      'Publication',
      'À traiter',
      'Complétude (%)',
      'Dernière synchro',
      'Fiche admin',
    ],
  ];
  const TYPE: Record<string, string> = {
    PROGRAM: 'Parcours',
    MENTION: 'Mention',
    UNIVERSITY: 'Établissement',
  };
  const PUB: Record<string, string> = {
    pub: 'Publiée',
    off: 'Hors ville ouverte',
    draft: 'Brouillon',
  };
  const LABEL: Record<string, string> = {
    CONFLICT: 'Conflit',
    COLLECT_ERROR: 'Erreur de collecte',
    NO_PROGRAM: 'Sans programme',
    OLD_PROGRAM: 'Programme ancien',
    NO_UAI: 'Sans UAI',
  };
  for (let i = 0; i < ids.length; i += 1000) {
    const part = ids.slice(i, i + 1000);
    const rows = await noJit(
      (tx) => tx.$queryRaw<
        {
          id: string;
          type: string;
          name: string;
          sub: string;
          ident: string;
          publication: string;
          kinds: string[];
          pct: number;
          last: Date | null;
        }[]
      >`WITH ${FICHES_BASE} SELECT m.id, m.type, m.name, m.sub, m.ident, m.publication, m.kinds, m.pct, m.last
        FROM m WHERE m.id = ANY(${part}) ORDER BY array_position(${part}::text[], m.id)`,
    );
    for (const r of rows)
      out.push([
        TYPE[r.type] ?? r.type,
        r.name,
        r.sub,
        r.ident,
        PUB[r.publication] ?? r.publication,
        r.kinds.map((k) => LABEL[k] ?? k).join(', '),
        String(r.pct),
        r.last ? r.last.toISOString().slice(0, 16).replace('T', ' ') : '',
        `/admin/fiches/${r.id}`,
      ]);
  }
  return out;
}

/** A CSV line, RFC 4180, « ; »-separated for French spreadsheets, formula injection guarded. */
export function csvLine(cells: string[]): string {
  return cells
    .map((c) => {
      const v = /^[=+\-@\t\r]/.test(c) ? `'${c}` : c;
      return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    })
    .join(';');
}
