import 'server-only';
import { Prisma } from '@/lib/db/generated/client';
import { prisma } from '@/lib/db';
import {
  codeCandidates,
  codeVariants,
  normalize,
  queryWords,
  type IdentifierKindName,
  type MatchedBy,
} from '@/lib/domain/search';
import { SEARCH_CAP } from '@/lib/pagination';
import { effectiveKinds, effectiveSort, PLACES, type Filters, type Sort } from './filters';

/**
 * Program lists on ProgramSearchIndex: one SQL statement for a page of results
 * (with its total), one for every facet counter. Each facet counts the programs the visitor
 * would get by ticking an option, with all the other active filters but those of its own group.
 */

/**
 * Imposed scope: a mention page, a university page (with its établissements-composantes), a
 * city page (an open LaunchZone), or a city × mention page.
 */
export interface BrowseContext {
  mentionId?: string;
  universityIds?: string[];
  zoneSlug?: string;
}

const sql = Prisma.sql;
const TRUE = sql`TRUE`;
const and = (xs: Prisma.Sql[]) => (xs.length ? Prisma.join(xs, ' AND ') : TRUE);
const or = (xs: Prisma.Sql[]) => (xs.length ? sql`(${Prisma.join(xs, ' OR ')})` : TRUE);

/** Words of a query, safe for to_tsquery (« patrimoine » → « patrimoine:* »). */
function tsQuery(text: string): string | null {
  const words = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

interface TextPlan {
  /** Exact values and prefixes of the codes typed (RNCP, Mon Master, UAI). */
  exact: string[];
  prefixes: string[];
  fullTs: string | null;
  restTs: string | null;
  norm: string;
  words: string[];
}

function textPlan(q: string): TextPlan | null {
  const words = queryWords(q);
  if (!words.some((w) => normalize(w).replace(/[^a-z0-9]/g, ''))) return null;
  const cands = codeCandidates(q);
  const used = new Set(cands.flatMap((c) => c.words));
  const exact = [...new Set(cands.flatMap((c) => codeVariants(c.code)))];
  return {
    exact,
    prefixes: exact.map((v) => `${v}%`),
    fullTs: tsQuery(q),
    restTs: tsQuery(words.filter((_, i) => !used.has(i)).join(' ')),
    norm: normalize(q).trim().replace(/\s+/g, ' '),
    words: normalize(q)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  };
}

/** CTE `codes` (identifiers matching the typed codes) and the per-row match level 0/1/2. */
function codeParts(t: TextPlan | null) {
  if (!t?.exact.length) return { cte: sql``, hit: sql`0`, join: sql`` };
  return {
    cte: sql`codes AS (
      SELECT "entityType"::text AS t, "entityId" AS id, bool_or(value = ANY(${t.exact})) AS exact
        FROM "Identifier"
       WHERE ${Prisma.join(
         t.prefixes.map((p) => sql`value LIKE ${p}`),
         ' OR ',
       )}
       GROUP BY 1, 2
    ),
    -- Level of the match of each program found by a code: its own, its mention's, its university's.
    hits AS (
      SELECT h."programId", max(h.level) AS level FROM (
        SELECT i."programId", CASE WHEN c.exact THEN 2 ELSE 1 END AS level
          FROM codes c JOIN "ProgramSearchIndex" i ON c.t = 'PROGRAM' AND i."programId" = c.id
        UNION ALL
        SELECT i."programId", CASE WHEN c.exact THEN 2 ELSE 1 END
          FROM codes c JOIN "ProgramSearchIndex" i ON c.t = 'MENTION' AND i."mentionId" = c.id
        UNION ALL
        SELECT i."programId", CASE WHEN c.exact THEN 2 ELSE 1 END
          FROM codes c JOIN "ProgramSearchIndex" i ON c.t = 'UNIVERSITY' AND i."universityId" = c.id
      ) h GROUP BY 1
    ),`,
    hit: sql`coalesce(hits.level, 0)`,
    join: sql`LEFT JOIN hits ON hits."programId" = i."programId"`,
  };
}

/**
 * Whole words of the query found as such (« nantes » in « Nantes Université », not the stem
 * prefix of « Nanterre »): 20 points each, in the title 10 more.
 */
function wholeWords(words: string[]): Prisma.Sql {
  const ws = words.filter((w) => w.length >= 3).slice(0, 8);
  if (!ws.length) return sql``;
  return sql`+ ${Prisma.join(
    ws.map(
      (w) =>
        sql`(CASE WHEN "textNorm" ~ ${`\\m${w}\\M`} THEN 20 ELSE 0 END + CASE WHEN "titleNorm" ~ ${`\\m${w}\\M`} THEN 10 ELSE 0 END)`,
    ),
    ' + ',
  )}`;
}

/** Text condition on a row of `base` (code_hit computed), and the relevance score. */
function textParts(t: TextPlan | null, fuzzy: boolean) {
  if (!t) return { where: TRUE, score: sql`0` };
  const rank = (ts: string | null) =>
    ts ? sql`least(1, ts_rank(tsv, to_tsquery('french', ${ts})))` : sql`0`;
  let where: Prisma.Sql;
  if (fuzzy) where = and(t.words.map((w) => sql`word_similarity(${w}, "textNorm") > 0.3`));
  else if (t.exact.length)
    where = sql`(CASE WHEN EXISTS (SELECT 1 FROM codes)
                      THEN code_hit > 0 ${t.restTs ? sql`AND tsv @@ to_tsquery('french', ${t.restTs})` : sql``}
                      ELSE ${t.fullTs ? sql`tsv @@ to_tsquery('french', ${t.fullTs})` : sql`FALSE`} END)`;
  else where = t.fullTs ? sql`tsv @@ to_tsquery('french', ${t.fullTs})` : sql`FALSE`;
  const score = sql`(CASE WHEN code_hit = 2 THEN 1000 WHEN code_hit = 1 THEN 900
                          WHEN "titleNorm" = ${t.norm} THEN 800
                          WHEN "titleNorm" LIKE ${`${t.norm}%`} THEN 700 ELSE 0 END)
                    + ${rank(t.exact.length ? t.restTs : t.fullTs)} * 100
                    + similarity("titleNorm", ${t.norm}) * 50
                    ${wholeWords(t.words)}`;
  return { where, score };
}

function contextWhere(ctx: BrowseContext): Prisma.Sql {
  const xs: Prisma.Sql[] = [];
  if (ctx.mentionId) xs.push(sql`i."mentionId" = ${ctx.mentionId}`);
  if (ctx.universityIds?.length) xs.push(sql`i."universityId" = ANY(${ctx.universityIds})`);
  if (ctx.zoneSlug) xs.push(sql`${ctx.zoneSlug} = ANY(i."zoneSlugs")`);
  return and(xs);
}

/** Columns the facets group by or filter on. */
const FACET_COLUMNS = sql`"domainSlug", "disciplineSlug", discipline, "mentionSlug", "mentionName", region,
  "regionSlug", "departmentCode", "departmentName", "cityKey", "cityName", "isAbroad", "universityKey",
  "universityShort", "universityName", kind, modalities, "zoneSlugs", "entryLevel", "accessBand", places,
  "reviewCount", "verifiedReviewCount", "avgRating", "componentName"`;

/** Distance in km between a row and a point (haversine), after a bounding-box prefilter. */
function radius(lat: number, lng: number, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return sql`(lat BETWEEN ${lat - dLat} AND ${lat + dLat} AND lng BETWEEN ${lng - dLng} AND ${lng + dLng}
              AND 2 * 6371 * asin(sqrt(power(sin(radians(lat - ${lat}) / 2), 2)
                  + cos(radians(${lat})) * cos(radians(lat)) * power(sin(radians(lng - ${lng}) / 2), 2))) <= ${km})`;
}

type Group =
  | 'domaine'
  | 'mention'
  | 'lieu'
  | 'etab'
  | 'type'
  | 'modalite'
  | 'entree'
  | 'acces'
  | 'places'
  | 'avis'
  | 'composante';
const GROUPS: Group[] = [
  'domaine',
  'mention',
  'lieu',
  'etab',
  'type',
  'modalite',
  'entree',
  'acces',
  'places',
  'avis',
  'composante',
];

function placesBand(id: string): Prisma.Sql {
  const b = PLACES.find((p) => p.id === id)!;
  return and([
    sql`places IS NOT NULL`,
    ...(b.min != null ? [sql`places >= ${b.min}`] : []),
    ...(b.max != null ? [sql`places <= ${b.max}`] : []),
  ]);
}

const REVIEW_PRED: Record<string, Prisma.Sql> = {
  avec: sql`"reviewCount" > 0`,
  verifies: sql`"verifiedReviewCount" > 0`,
  'note-3': sql`"avgRating" >= 3`,
  'note-4': sql`"avgRating" >= 4`,
};

/** Centre of the commune of a radius search. */
async function centreOf(f: Filters): Promise<{ insee: string; lat: number; lng: number } | null> {
  const insee = f.lieux.find((l) => l.startsWith('insee:'))?.slice(6);
  if (!f.rayon || !insee) return null;
  const c = await prisma.city.findUnique({
    where: { inseeCode: insee },
    select: { lat: true, lng: true },
  });
  if (c?.lat != null && c.lng != null) return { insee, lat: c.lat, lng: c.lng };
  const r = await prisma.programSearchIndex.findFirst({
    where: { cityInsee: insee, lat: { not: null } },
    select: { lat: true, lng: true },
  });
  return r?.lat != null && r.lng != null ? { insee, lat: r.lat, lng: r.lng } : null;
}

function groupPreds(
  f: Filters,
  centre: Awaited<ReturnType<typeof centreOf>>,
): Record<Group, Prisma.Sql> {
  const lieux = f.lieux.map((l) => {
    const [k, v = ''] = l.split(/:(.*)/s);
    if (k === 'insee' && centre && v === centre.insee)
      return radius(centre.lat, centre.lng, f.rayon!);
    if (k === 'insee') return sql`"cityInsee" = ${v}`;
    if (k === 'dep') return sql`"departmentCode" = ${v}`;
    if (k === 'reg') return sql`"regionSlug" = ${v}`;
    if (k === 'nom') return sql`"cityKey" = ${l}`;
    // an open city and its intercommunality: denormalised on the index
    if (k === 'zone') return sql`${v} = ANY("zoneSlugs")`;
    return sql`"isAbroad"`;
  });
  return {
    domaine:
      f.domaines.length || f.disciplines.length
        ? or([
            ...(f.domaines.length ? [sql`"domainSlug" = ANY(${f.domaines})`] : []),
            ...(f.disciplines.length ? [sql`"disciplineSlug" = ANY(${f.disciplines})`] : []),
          ])
        : TRUE,
    mention: f.mentions.length ? sql`"mentionSlug" = ANY(${f.mentions})` : TRUE,
    lieu: or(lieux),
    etab: f.etabs.length ? sql`"universityKey" = ANY(${f.etabs})` : TRUE,
    type: sql`kind = ANY(${effectiveKinds(f)})`,
    modalite: f.modalites.length ? sql`modalities && ${f.modalites}::text[]` : TRUE,
    entree: f.entrees.length ? sql`"entryLevel"::text = ANY(${f.entrees})` : TRUE,
    acces: f.acces.length ? sql`"accessBand" = ANY(${f.acces})` : TRUE,
    places: or(f.places.map(placesBand)),
    avis: and(f.avis.map((a) => REVIEW_PRED[a]!).filter(Boolean)),
    composante: f.composantes.length ? sql`"componentName" = ANY(${f.composantes})` : TRUE,
  };
}

function orderBy(sort: Sort): Prisma.Sql {
  // Stable from one page to the next: the program id settles every tie.
  const tie = sql`"verifiedReviewCount" > 0 DESC, "reviewCount" DESC, (status = 'ACTIVE') DESC, "programId"`;
  switch (sort) {
    case 'pertinence':
      return sql`score DESC, ${tie}`;
    case 'avis':
      return sql`"reviewCount" DESC, "avgRating" DESC NULLS LAST, "titleNorm", "programId"`;
    case 'az':
      return sql`"titleNorm", "programId"`;
    default:
      // « Mieux notés »: rating, then number of reviews; programs without reviews last, A → Z.
      return sql`"avgRating" DESC NULLS LAST, "reviewCount" DESC, "titleNorm", "programId"`;
  }
}

/** Fields of a program card. */
export interface ProgramRow {
  programId: string;
  slug: string;
  title: string;
  parentTitle: string | null;
  sourceTitle: string;
  shortName: string | null;
  status: 'ACTIVE' | 'NOT_RENEWED' | 'DRAFT';
  universityId: string;
  universitySlug: string;
  universityKey: string;
  universityName: string;
  universityShort: string;
  mentionId: string;
  mentionSlug: string;
  mentionName: string;
  kind: string;
  isPublicSector: boolean;
  componentName: string | null;
  cityName: string;
  isAbroad: boolean;
  modalities: string[];
  entryLevel: 'M1' | 'M2';
  places: number | null;
  applications: number | null;
  offers: number | null;
  accessRate: number | null;
  lastSession: number | null;
  reviewCount: number;
  verifiedReviewCount: number;
  avgRating: number | null;
  /** Share of the reviews that recommend it (overall rating 4 or 5), or null without review. */
  recommendShare: number | null;
  durationYears: number;
  /** Cursus of the parcours (issue #21): number, labels, how the card shows them. */
  cursusCount: number;
  cursusLabels: string[];
  cursusKind: string;
  /** How a query found it (« Trouvé par RNCP · … »), when it was by an identifier. */
  matchedBy: MatchedBy | null;
  /** 2: exact identifier, 1: identifier prefix, 0: text. */
  codeLevel: number;
}

const ROW_COLUMNS = sql`"programId", slug, title, "parentTitle", "sourceTitle", "shortName", status::text AS status,
  "universityId", "universitySlug", "universityKey", "universityName", "universityShort",
  "mentionId", "mentionSlug", "mentionName", kind, "isPublicSector", "componentName", "cityName",
  "isAbroad", modalities, "entryLevel"::text AS "entryLevel", places, applications, offers,
  "accessRate", "lastSession", "reviewCount", "verifiedReviewCount", "avgRating", "recommendShare",
  "durationYears", "cursusCount", "cursusLabels", "cursusKind", code_hit`;

/** Columns the filters, sorts and cards read (never the tsvector: CTEs may be materialised). */
const BASE_COLUMNS = sql`i."programId", i.slug, i.title, i."parentTitle", i."sourceTitle", i."shortName", i.status,
  i."universityId", i."universitySlug", i."universityKey", i."universityName", i."universityShort",
  i."mentionId", i."mentionSlug", i."mentionName", i.kind, i."isPublicSector", i."componentName",
  i."cityName", i."cityKey", i."cityInsee", i."departmentCode", i."departmentName", i.region, i."regionSlug", i.lat, i.lng,
  i."isAbroad", i.modalities, i."entryLevel", i.places, i.applications, i.offers, i."accessRate",
  i."accessBand", i."lastSession", i."reviewCount", i."verifiedReviewCount", i."avgRating", i."recommendShare",
  i."durationYears", i."zoneSlugs", i."domainSlug", i."disciplineSlug", i.discipline, i."titleNorm",
  i."cursusCount", i."cursusLabels", i."cursusKind"`;

function baseCte(t: TextPlan | null, ctx: BrowseContext, fuzzy: boolean) {
  const codes = codeParts(t);
  const text = textParts(t, fuzzy);
  // The text columns are read only by the text condition and the score, inside `m`.
  return sql`WITH ${codes.cte} m AS (
    SELECT ${BASE_COLUMNS}, ${text.score} AS score, code_hit
      FROM (SELECT i.*, ${codes.hit} AS code_hit FROM "ProgramSearchIndex" i ${codes.join} WHERE ${contextWhere(ctx)}) i
     WHERE ${text.where}
  )`;
}

async function matchedLabels(
  t: TextPlan | null,
  rows: { programId: string; mentionId: string; universityId: string; code_hit: number }[],
) {
  const out = new Map<string, MatchedBy>();
  if (!t?.exact.length || !rows.some((r) => r.code_hit > 0)) return out;
  const ids = rows.flatMap((r) => [r.programId, r.mentionId, r.universityId]);
  const found = await prisma.identifier.findMany({
    where: {
      entityId: { in: ids },
      OR: t.exact.map((v) => ({ value: { startsWith: v } })),
    },
    select: { entityId: true, kind: true, value: true, label: true },
  });
  for (const r of rows) {
    if (!r.code_hit) continue;
    const hit =
      found.find((x) => x.entityId === r.programId) ??
      found.find((x) => x.entityId === r.mentionId) ??
      found.find((x) => x.entityId === r.universityId);
    if (hit)
      out.set(r.programId, {
        kind: hit.kind as IdentifierKindName,
        value: hit.value,
        label: hit.label,
      });
  }
  return out;
}

export interface BrowseResult {
  rows: ProgramRow[];
  total: number;
  /** Total pages may go to (the public search stops at 1 000). */
  reachable: number;
  sort: Sort;
  fuzzy: boolean;
}

/** One page of programs, sorted, with the total (one statement; a typo fallback when empty). */
export async function browsePrograms(
  f: Filters,
  ctx: BrowseContext,
  page: { offset: number; limit: number },
): Promise<BrowseResult> {
  const t = textPlan(f.q);
  const sort = effectiveSort(f);
  const centre = await centreOf(f);
  const preds = groupPreds(f, centre);
  const run = (fuzzy: boolean) =>
    prisma.$queryRaw<(Omit<ProgramRow, 'matchedBy'> & { code_hit: number; total: bigint })[]>`
      ${baseCte(t, ctx, fuzzy)}
      SELECT ${ROW_COLUMNS}, count(*) OVER () AS total
        FROM m WHERE ${and(GROUPS.map((g) => preds[g]))}
       ORDER BY ${orderBy(sort)}
       LIMIT ${page.limit} OFFSET ${page.offset}`;
  let fuzzy = false;
  let rows = await run(false);
  if (!rows.length && t && !t.exact.length && page.offset === 0) {
    // Typos: every word close to a word of the program (trigrams), only when nothing matched.
    fuzzy = true;
    rows = await run(true);
  }
  let total = Number(rows[0]?.total ?? 0);
  if (!rows.length && page.offset > 0) {
    // Beyond the last page: the caller redirects, it needs the total.
    const [c] = await prisma.$queryRaw<{ n: bigint }[]>`
      ${baseCte(t, ctx, false)} SELECT count(*) AS n FROM m WHERE ${and(GROUPS.map((g) => preds[g]))}`;
    total = Number(c?.n ?? 0);
  }
  const labels = await matchedLabels(t, rows);
  return {
    rows: rows.map((row) => {
      const r = { ...row } as Partial<typeof row>;
      delete r.total;
      delete r.code_hit;
      return {
        ...(r as Omit<typeof row, 'total' | 'code_hit'>),
        places: row.places == null ? null : Number(row.places),
        applications: row.applications == null ? null : Number(row.applications),
        offers: row.offers == null ? null : Number(row.offers),
        matchedBy: labels.get(row.programId) ?? null,
        codeLevel: Number(row.code_hit ?? 0),
      };
    }),
    total,
    reachable: t ? Math.min(total, SEARCH_CAP) : total,
    sort,
    fuzzy,
  };
}

export interface FacetOption {
  key: string;
  label: string;
  /** Parent (domain of a discipline, department of a city, full name of an establishment). */
  extra: string;
  count: number;
}
export type Facets = Record<string, FacetOption[]> & { total: number };

/** The facet statement (exported for EXPLAIN ANALYZE in the performance checks). */
export async function facetQuery(
  f: Filters,
  ctx: BrowseContext,
  opts: { fuzzy?: boolean } = {},
): Promise<Prisma.Sql> {
  const t = textPlan(f.q);
  const centre = await centreOf(f);
  const preds = groupPreds(f, centre);
  // Each group's condition is evaluated once per row (f_<group>), in a narrow CTE: the 15
  // aggregations below only read booleans and the columns they group by.
  const flag = (g: Group) => sql([`f_${g}`] as unknown as TemplateStringsArray);
  const except = (g: Group) => and(GROUPS.filter((x) => x !== g).map(flag));
  const all = and(GROUPS.map(flag));
  const codes = codeParts(t);
  const text = textParts(t, !!opts.fuzzy);
  return sql`
    WITH ${codes.cte} m AS MATERIALIZED (
      SELECT ${FACET_COLUMNS}, ${Prisma.join(
        GROUPS.map((g) => sql`(${preds[g]}) AS ${flag(g)}`),
        ', ',
      )}
        FROM (SELECT i.*, ${codes.hit} AS code_hit FROM "ProgramSearchIndex" i ${codes.join} WHERE ${contextWhere(ctx)}) i
       WHERE ${text.where}
    )
    SELECT 'total' AS g, '' AS k, '' AS label, '' AS extra, count(*) AS n FROM m WHERE ${all}
    UNION ALL SELECT 'domaine', "domainSlug", '', '', count(*) FROM m WHERE ${except('domaine')} GROUP BY 2
    UNION ALL SELECT 'discipline', "disciplineSlug", min(discipline), "domainSlug", count(*) FROM m
               WHERE ${except('domaine')} AND "disciplineSlug" IS NOT NULL GROUP BY 2, 4
    UNION ALL SELECT 'mention', "mentionSlug", min("mentionName"), '', count(*) FROM m WHERE ${except('mention')} GROUP BY 2
    UNION ALL SELECT 'region', "regionSlug", min(region), '', count(*) FROM m
               WHERE ${except('lieu')} AND "regionSlug" IS NOT NULL AND NOT "isAbroad" GROUP BY 2
    UNION ALL SELECT 'departement', "departmentCode", min("departmentName"), min(region), count(*) FROM m
               WHERE ${except('lieu')} AND "departmentCode" IS NOT NULL GROUP BY 2
    UNION ALL SELECT 'ville', "cityKey", min("cityName"), min(coalesce("departmentName", region, '')), count(*) FROM m
               WHERE ${except('lieu')} AND NOT "isAbroad" GROUP BY 2
    UNION ALL SELECT 'zone', z.slug, min(lz.name), min(lz."order")::text, count(*)
                FROM m CROSS JOIN LATERAL unnest(m."zoneSlugs") AS z(slug) JOIN "LaunchZone" lz ON lz.slug = z.slug
               WHERE ${except('lieu')} GROUP BY 2
    UNION ALL SELECT 'etranger', 'etranger', 'À l’étranger', '', count(*) FROM m WHERE ${except('lieu')} AND "isAbroad"
    UNION ALL SELECT 'etab', "universityKey", min("universityShort"), min("universityName"), count(*) FROM m
               WHERE ${except('etab')} GROUP BY 2
    UNION ALL SELECT 'type', kind, '', '', count(*) FROM m WHERE ${except('type')} GROUP BY 2
    UNION ALL SELECT 'modalite', x, '', '', count(*) FROM m, unnest(modalities) x WHERE ${except('modalite')} GROUP BY 2
    UNION ALL SELECT 'entree', "entryLevel"::text, '', '', count(*) FROM m WHERE ${except('entree')} GROUP BY 2
    UNION ALL SELECT 'acces', "accessBand", '', '', count(*) FROM m WHERE ${except('acces')} GROUP BY 2
    UNION ALL SELECT 'places', CASE WHEN places < 16 THEN 'moins-16' WHEN places <= 30 THEN '16-30'
                                    WHEN places <= 60 THEN '31-60' ELSE 'plus-60' END, '', '', count(*)
               FROM m WHERE ${except('places')} AND places IS NOT NULL GROUP BY 2
    UNION ALL SELECT 'avis', a.k, '', '', count(*) FROM m
               CROSS JOIN LATERAL (VALUES ('avec', "reviewCount" > 0), ('verifies', "verifiedReviewCount" > 0),
                                          ('note-3', coalesce("avgRating" >= 3, false)),
                                          ('note-4', coalesce("avgRating" >= 4, false))) AS a(k, ok)
               WHERE ${except('avis')} AND a.ok GROUP BY 2
    UNION ALL SELECT 'composante', "componentName", '', '', count(*) FROM m
               WHERE ${except('composante')} AND "componentName" IS NOT NULL GROUP BY 2`;
}

/** Every facet counter in one statement (COUNT … GROUP BY per group, UNION ALL). */
export async function facetCounts(
  f: Filters,
  ctx: BrowseContext,
  opts: { fuzzy?: boolean } = {},
): Promise<Facets> {
  const rows = await prisma.$queryRaw<
    { g: string; k: string | null; label: string | null; extra: string | null; n: bigint }[]
  >(await facetQuery(f, ctx, opts));
  const out = { total: 0 } as Facets;
  for (const r of rows) {
    if (r.g === 'total') {
      out.total = Number(r.n);
      continue;
    }
    if (r.k == null) continue;
    (out[r.g] ??= []).push({
      key: r.k,
      label: r.label || r.k,
      extra: r.extra ?? '',
      count: Number(r.n),
    });
  }
  return out;
}

/**
 * Sources of what a page shows, from the provenance of its data: never a fixed text.
 * Returns the distinct source names of the fields and admission figures of these programs.
 */
export async function sourcesOf(ctx: BrowseContext): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ source: string }[]>`
    WITH ids AS (SELECT "programId" AS id FROM "ProgramSearchIndex" i WHERE ${contextWhere(ctx)})
    SELECT source FROM (
      SELECT DISTINCT fp.source FROM "FieldProvenance" fp JOIN ids ON ids.id = fp."entityId"
       WHERE fp.state IN ('OK', 'STALE') AND NOT fp.locked
      UNION
      SELECT DISTINCT s.source FROM "AdmissionStat" s JOIN ids ON ids.id = s."programId"
    ) x WHERE source IS NOT NULL AND source <> '' ORDER BY 1`;
  // « Mon Master, données ouvertes…, session 2025 · rang phase principale » and « Mon Master ·
  // données ouvertes » are one source: grouped by their first words, the most precise label kept.
  const bySource = new Map<string, string>();
  for (const { source } of rows) {
    if (/refus|n\.c\./i.test(source)) continue;
    const label = source.split(' · ')[0]!.trim();
    const key = label
      .toLowerCase()
      .split(/[\s,]+/)
      .slice(0, 2)
      .join(' ');
    const cur = bySource.get(key);
    if (!cur || label.length > cur.length) bySource.set(key, label);
  }
  return [...bySource.values()];
}
