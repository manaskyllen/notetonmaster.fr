import 'server-only';
import { Prisma } from '@/lib/db/generated/client';
import { prisma } from '@/lib/db';
import { browsePrograms, type ProgramRow } from '@/lib/catalog/browse';
import { EMPTY_FILTERS } from '@/lib/catalog/filters';
import { ESTABLISHMENT_KINDS } from '@/lib/domain/sector';
import {
  codeCandidates,
  codeVariants,
  matchCode,
  normalize,
  queryWords,
  rankScore,
  SEARCH_TYPES,
  TYPE_ORDER,
  type IdentifierKindName,
  type MatchedBy,
  type SearchType,
} from './search';

/**
 * The one search of the site: home page, ⌘K palette, review form, Explorer.
 * Pure rules (normalisation, codes, ranking) are in ./search.ts, shared with local list filters.
 *
 * Programs come from ProgramSearchIndex (lib/catalog/browse.ts), ranked by:
 *   1. exact identifier (RNCP, Mon Master number, UAI), 2. title starting with the query,
 *   3. weighted full text (title A, mention and university B, city and component C, keywords
 *      and RNCP title D), 4. trigram similarity for typos, 5. at equal score: programs with
 *      verified reviews, then the number of published reviews, then ACTIVE before NOT_RENEWED,
 *      and finally the id, so a page never repeats nor skips a result.
 * Mentions, universities and cities come from the search_document view (same rules).
 * Programs of private establishments are left out unless asked.
 */

export type ResultKind = 'parcours' | 'mention' | 'universite' | 'ville';

export interface SearchResult {
  type: SearchType;
  kind: ResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  matchedBy: MatchedBy;
  score: number;
}

export interface SearchOptions {
  types?: SearchType[];
  /** Total number of results. */
  limit?: number;
  /** Per-type maximum (palette: 4 cities, 4 mentions, 4 universities, 7 programs). */
  limits?: Partial<Record<SearchType, number>>;
  /** Programs of private establishments too (« Afficher »). */
  includePrivate?: boolean;
}

export interface SearchPage {
  results: SearchResult[];
  /** Matches per type, before any limit (type filters of the home page, palette footer). */
  totals: Record<SearchType, number>;
  /** Programs of private establishments left out (« 12 parcours … masqués · Afficher »). */
  hiddenPrivate: number;
}

const ENTITY_TYPE: Record<string, SearchType> = {
  PROGRAM: 'program',
  MENTION: 'mention',
  UNIVERSITY: 'university',
};

/** The kind of entity each identifier designates: it ranks first on its own code. */
const NATURAL: Partial<Record<IdentifierKindName, SearchType>> = {
  RNCP: 'mention',
  RNCP_PREVIOUS: 'mention',
  MM_MENTION: 'mention',
  UAI: 'university',
  PAYSAGE: 'university',
  SISE: 'university',
};

type Hit = { type: SearchType; id: string; tsRank?: number; similarity?: number };

function tsWords(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Mentions, universities, cities (search_document): full text, else trigrams for typos. */
async function textHits(
  words: string[],
  types: SearchType[],
  ids?: string[],
  fuzzy = true,
): Promise<Hit[]> {
  if (words.length === 0 || types.length === 0) return [];
  const tsq = words.map((w) => `${w}:*`).join(' & ');
  const restrict = ids ? Prisma.sql`AND entity_id = ANY(${ids})` : Prisma.empty;
  const full = await prisma.$queryRaw<
    { entity_type: SearchType; entity_id: string; rank: number }[]
  >`
    SELECT entity_type, entity_id, ts_rank(tsv, to_tsquery('french', ${tsq})) AS rank
      FROM search_document
     WHERE entity_type = ANY(${types}) ${restrict}
       AND tsv @@ to_tsquery('french', ${tsq})`;
  if (full.length > 0 || !fuzzy)
    return full.map((r) => ({ type: r.entity_type, id: r.entity_id, tsRank: Number(r.rank) }));
  const similar = Prisma.join(
    words.map((w) => Prisma.sql`word_similarity(${w}, text_norm) > 0.3`),
    ' AND ',
  );
  const sum = Prisma.join(
    words.map((w) => Prisma.sql`word_similarity(${w}, text_norm)`),
    ' + ',
  );
  const close = await prisma.$queryRaw<
    { entity_type: SearchType; entity_id: string; sim: number }[]
  >`
    SELECT entity_type, entity_id, (${sum}) / ${words.length} AS sim
      FROM search_document
     WHERE entity_type = ANY(${types}) ${restrict} AND ${similar}`;
  return close.map((r) => ({ type: r.entity_type, id: r.entity_id, similarity: Number(r.sim) }));
}

/** « Nantes Université · Nantes » */
export function programSubtitle(p: ProgramRow): string {
  // « Université · ville », never the places
  return [p.universityShort, p.cityName].filter(Boolean).join(' · ');
}

/** Display data of mentions, universities and cities found (only those still listed). */
async function otherItems(hits: Hit[], includePrivate: boolean) {
  const ids = (t: SearchType) => hits.filter((h) => h.type === t).map((h) => h.id);
  const pub = includePrivate ? Prisma.empty : Prisma.sql`AND "isPublicSector"`;
  const [mentions, universities, cities] = await Promise.all([
    ids('mention').length
      ? prisma.$queryRaw<{ id: string; slug: string; name: string; unis: bigint; m1: bigint }[]>`
          SELECT m.id, m.slug, m.name,
                 count(DISTINCT i."universityId") AS unis,
                 count(*) FILTER (WHERE i."entryLevel" = 'M1') AS m1
            FROM "Mention" m JOIN "ProgramSearchIndex" i ON i."mentionId" = m.id ${pub}
           WHERE m.id = ANY(${ids('mention')})
           GROUP BY m.id`
      : [],
    ids('university').length
      ? prisma.$queryRaw<
          { id: string; slug: string; name: string; cities: string[]; region: string; n: bigint }[]
        >`
          SELECT u.id, u.slug, u.name, coalesce(u.cities, '{}') AS cities, u.region, count(i."programId") AS n
            FROM "University" u JOIN "ProgramSearchIndex" i ON i."universityId" = u.id ${pub}
           WHERE u.id = ANY(${ids('university')})
           GROUP BY u.id`
      : [],
    ids('city').length
      ? prisma.$queryRaw<
          {
            id: string;
            title: string;
            insee: string | null;
            region: string | null;
            n: bigint;
            unis: string;
          }[]
        >`
          SELECT d.entity_id AS id, d.title, min(c."inseeCode") AS insee, min(c.region) AS region,
                 count(i."programId") AS n,
                 string_agg(DISTINCT i."universityShort", ', ') AS unis
            FROM search_document d
            LEFT JOIN "City" c ON c.slug = d.entity_id
            JOIN "ProgramSearchIndex" i
              ON (i."cityInsee" = c."inseeCode" OR (c.id IS NULL AND i."cityKey" = 'nom:' || d.entity_id)) ${pub}
           WHERE d.entity_type = 'city' AND d.entity_id = ANY(${ids('city')})
           GROUP BY d.entity_id, d.title`
      : [],
  ]);
  const items = new Map<string, Omit<SearchResult, 'matchedBy' | 'score'>>();
  for (const m of mentions) {
    const unis = Number(m.unis);
    items.set(`mention:${m.id}`, {
      type: 'mention',
      kind: 'mention',
      id: m.id,
      title: m.name,
      subtitle: `Mention nationale · ${unis} université${unis > 1 ? 's' : ''} · ${m.m1} parcours en M1`,
      href: `/mentions/${m.slug}`,
    });
  }
  for (const u of universities)
    items.set(`university:${u.id}`, {
      type: 'university',
      kind: 'universite',
      id: u.id,
      title: u.name,
      subtitle: [u.cities.join(' · '), u.region, `${u.n} parcours`].filter(Boolean).join(' · '),
      href: `/universites/${u.slug}`,
    });
  for (const c of cities) {
    const n = Number(c.n);
    items.set(`city:${c.id}`, {
      type: 'city',
      kind: 'ville',
      id: c.id,
      title: c.title,
      subtitle: [c.region, `${n} master${n > 1 ? 's' : ''}`, c.unis].filter(Boolean).join(' · '),
      href: `/explorer?lieu=${encodeURIComponent(c.insee ? `insee:${c.insee}` : `nom:${c.id}`)}`,
    });
  }
  return items;
}

/** Search with totals per type (home page, palette, API). */
export async function searchPage(query: string, opts: SearchOptions = {}): Promise<SearchPage> {
  const types = opts.types?.length ? opts.types : SEARCH_TYPES;
  const totals: Record<SearchType, number> = { program: 0, mention: 0, university: 0, city: 0 };
  const empty = { results: [], totals, hiddenPrivate: 0 };
  const words = queryWords(query);
  if (!words.some((w) => normalize(w).replace(/[^a-z0-9]/g, ''))) return empty;
  const includePrivate = !!opts.includePrivate;
  const programCap = Math.min(opts.limits?.program ?? opts.limit ?? 1000, 1000);
  const others: SearchType[] = types.filter((t) => t !== 'program');

  // 1. Programs (ranked in SQL) and, for the other types, identifiers then text.
  const programs = types.includes('program')
    ? browsePrograms(
        {
          ...EMPTY_FILTERS,
          q: query,
          tri: 'pertinence',
          types: includePrivate ? ESTABLISHMENT_KINDS.map((k) => k.id) : [],
        },
        {},
        { offset: 0, limit: programCap },
      )
    : null;
  const hidden =
    types.includes('program') && !includePrivate
      ? browsePrograms(
          { ...EMPTY_FILTERS, q: query, types: ['PRIVATE'] },
          {},
          { offset: 0, limit: 1 },
        )
      : null;

  const candidates = codeCandidates(query);
  const codeHits = new Map<string, { match: MatchedBy; how: 'exact' | 'prefix' }>();
  const consumed = new Set<number>();
  if (candidates.length > 0 && others.length) {
    const values = candidates.flatMap((c) => codeVariants(c.code));
    const rows = await prisma.identifier.findMany({
      where: {
        entityType: { in: ['MENTION', 'UNIVERSITY'] },
        OR: values.map((v) => ({ value: { startsWith: v } })),
      },
      select: { entityType: true, entityId: true, kind: true, value: true, label: true },
    });
    for (const c of candidates) {
      let used = false;
      for (const r of rows) {
        const how = matchCode(c.code, r.value);
        if (!how) continue;
        used = true;
        const key = `${ENTITY_TYPE[r.entityType]}:${r.entityId}`;
        const prev = codeHits.get(key);
        if (!prev || (prev.how === 'prefix' && how === 'exact'))
          codeHits.set(key, {
            how,
            match: { kind: r.kind as IdentifierKindName, value: r.value, label: r.label },
          });
      }
      if (used) c.words.forEach((i) => consumed.add(i));
    }
  }
  const textPart = words.filter((_, i) => !consumed.has(i)).join(' ');
  let hits: Hit[];
  if (codeHits.size > 0) {
    const coded = [...codeHits.keys()].map((k) => {
      const [type, id] = k.split(':') as [SearchType, string];
      return { type, id };
    });
    hits = tsWords(textPart).length
      ? await textHits(
          tsWords(textPart),
          others,
          coded.map((h) => h.id),
        )
      : coded.filter((h) => others.includes(h.type));
  } else {
    // A code that matched no identifier gets no typo tolerance: « RNCP99999 » finds nothing.
    hits = await textHits(tsWords(textPart), others, undefined, candidates.length === 0);
  }
  const items = await otherItems(hits, includePrivate);

  // 2. One list, ranked.
  const results: SearchResult[] = [];
  for (const h of hits) {
    const it = items.get(`${h.type}:${h.id}`);
    if (!it) continue;
    const code = codeHits.get(`${h.type}:${h.id}`);
    results.push({
      ...it,
      matchedBy: code?.match ?? { kind: 'TEXT' },
      score: rankScore({
        identifier: code?.how ?? null,
        title: it.title,
        query: textPart || query,
        tsRank: h.tsRank,
        similarity: h.similarity,
      }),
    });
  }
  const pr = await programs;
  if (pr) {
    totals.program = pr.total;
    pr.rows.forEach((p, i) => {
      const code = p.matchedBy;
      // Programs keep their SQL order: a score just below the identifier tiers, decreasing.
      let score = 600 - i * 0.001;
      if (code && code.kind !== 'TEXT') {
        // Exact 1000 / prefix 900, 50 less when the code designates another kind of entity
        // (an RNCP number is the mention's: the mention comes first).
        const base = p.codeLevel >= 2 ? 1000 : 900;
        const other = NATURAL[code.kind] && NATURAL[code.kind] !== 'program';
        score = base - (other ? 50 : 0) - i * 0.001;
      } else if (normalize(p.title).trim() === normalize(query).trim()) score = 800 - i * 0.001;
      else if (normalize(p.title).startsWith(normalize(query).trim())) score = 700 - i * 0.001;
      results.push({
        type: 'program',
        kind: 'parcours',
        id: p.programId,
        title: p.title,
        subtitle: programSubtitle(p),
        href: `/parcours/${p.slug}`,
        matchedBy: code ?? { kind: 'TEXT' },
        score,
      });
    });
  }
  results.sort(
    (a, b) =>
      b.score - a.score ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.title.localeCompare(b.title, 'fr') ||
      a.id.localeCompare(b.id),
  );
  for (const r of results) if (r.type !== 'program') totals[r.type]++;

  const perType: Partial<Record<SearchType, number>> = {};
  const out: SearchResult[] = [];
  for (const r of results) {
    const max = opts.limits?.[r.type];
    const n = perType[r.type] ?? 0;
    if (max !== undefined && n >= max) continue;
    perType[r.type] = n + 1;
    out.push(r);
    if (opts.limit && out.length >= opts.limit) break;
  }
  return { results: out, totals, hiddenPrivate: (await hidden)?.total ?? 0 };
}

/** The ranked results only (review form, older callers). */
export async function search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
  return (await searchPage(query, opts)).results;
}

export { refreshSearchIndex } from '@/lib/search-index';
