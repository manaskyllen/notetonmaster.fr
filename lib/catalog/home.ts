import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { browsePrograms } from '@/lib/catalog/browse';
import { EMPTY_FILTERS } from '@/lib/catalog/filters';
import { TAGS } from '@/lib/cache/tags';
import { programSubtitle, searchPage, type SearchResult } from '@/lib/domain/search.server';
import { SEARCH_CAP } from '@/lib/pagination';

/**
 * Results under the big search bar of the home page: 10 per page, the most relevant
 * first, type filters with their total counters. Without a query, the catalogue: parcours with
 * reviews first, then mentions and universities by name.
 */
export type HomeType = 'all' | 'parcours' | 'mention' | 'universite';
export const HOME_PER_PAGE = 10;

export interface HomeResults {
  rows: Omit<SearchResult, 'score'>[];
  /** Totals per type filter (whole result, not the page). */
  counts: Record<HomeType, number>;
  /** Total of the selected filter (pagination). */
  total: number;
  hiddenPrivate: number;
}

const KIND_TYPE = { parcours: 'program', mention: 'mention', universite: 'university' } as const;

/** Catalogue counts without a query (cached 60 s, expired with the catalogue). */
const catalogueCounts = unstable_cache(
  async () => {
    const [[p], [m], [u]] = await Promise.all([
      prisma.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM "ProgramSearchIndex" WHERE "isPublicSector"`,
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT "mentionId") AS n FROM "ProgramSearchIndex" WHERE "isPublicSector"`,
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT "universityId") AS n FROM "ProgramSearchIndex" WHERE "isPublicSector"`,
    ]);
    return {
      parcours: Number(p?.n ?? 0),
      mention: Number(m?.n ?? 0),
      universite: Number(u?.n ?? 0),
    };
  },
  ['home-catalogue-counts'],
  { revalidate: 60, tags: [TAGS.catalog] },
);

async function mentionRows(offset: number, limit: number) {
  if (limit <= 0) return [];
  const rows = await prisma.$queryRaw<
    { id: string; slug: string; name: string; unis: bigint; m1: bigint }[]
  >`
    SELECT "mentionId" AS id, min("mentionSlug") AS slug, min("mentionName") AS name,
           count(DISTINCT "universityId") AS unis, count(*) FILTER (WHERE "entryLevel" = 'M1') AS m1
      FROM "ProgramSearchIndex" WHERE "isPublicSector"
     GROUP BY "mentionId" ORDER BY public.nm_norm(min("mentionName")), "mentionId"
     LIMIT ${limit} OFFSET ${offset}`;
  return rows.map((m) => ({
    type: 'mention' as const,
    kind: 'mention' as const,
    id: m.id,
    title: m.name,
    subtitle: `Mention nationale · ${m.unis} université${Number(m.unis) > 1 ? 's' : ''} · ${m.m1} parcours en M1`,
    href: `/mentions/${m.slug}`,
    matchedBy: { kind: 'TEXT' as const },
  }));
}

async function universityRows(offset: number, limit: number) {
  if (limit <= 0) return [];
  const rows = await prisma.$queryRaw<
    { id: string; slug: string; name: string; region: string; cities: string[]; n: bigint }[]
  >`
    SELECT u.id, u.slug, u.name, u.region, coalesce(u.cities, '{}') AS cities, count(*) AS n
      FROM "ProgramSearchIndex" i JOIN "University" u ON u.id = i."universityId"
     WHERE i."isPublicSector"
     GROUP BY u.id ORDER BY public.nm_norm(u.name), u.id
     LIMIT ${limit} OFFSET ${offset}`;
  return rows.map((u) => ({
    type: 'university' as const,
    kind: 'universite' as const,
    id: u.id,
    title: u.name,
    subtitle: [u.cities.join(' · '), u.region, `${u.n} parcours`].filter(Boolean).join(' · '),
    href: `/universites/${u.slug}`,
    matchedBy: { kind: 'TEXT' as const },
  }));
}

async function programRows(offset: number, limit: number) {
  if (limit <= 0) return [];
  const r = await browsePrograms({ ...EMPTY_FILTERS, tri: 'avis' }, {}, { offset, limit });
  return r.rows.map((p) => ({
    type: 'program' as const,
    kind: 'parcours' as const,
    id: p.programId,
    title: p.title,
    subtitle: programSubtitle(p),
    href: `/parcours/${p.slug}`,
    matchedBy: { kind: 'TEXT' as const },
  }));
}

/** Same answer for every visitor: cached 60 s per (query, type, page), expired with the catalogue. */
export function homeResults(opts: {
  q: string;
  type: HomeType;
  page: number;
  includePrivate: boolean;
}) {
  return unstable_cache(() => computeHomeResults(opts), ['home', JSON.stringify(opts)], {
    revalidate: 60,
    tags: [TAGS.catalog],
  })();
}

async function computeHomeResults(opts: {
  q: string;
  type: HomeType;
  page: number;
  includePrivate: boolean;
}): Promise<HomeResults> {
  const { q, type, page } = opts;
  const offset = (page - 1) * HOME_PER_PAGE;
  if (!q.trim()) {
    const c = await catalogueCounts();
    const counts = { all: c.parcours + c.mention + c.universite, ...c };
    // « Tout »: parcours, then mentions, then universities, as one paginated sequence.
    const parts: [HomeType, number, (o: number, l: number) => Promise<HomeResults['rows']>][] = [
      ['parcours', c.parcours, programRows],
      ['mention', c.mention, mentionRows],
      ['universite', c.universite, universityRows],
    ];
    const rows: HomeResults['rows'] = [];
    let start = offset;
    let left = HOME_PER_PAGE;
    for (const [t, n, load] of parts) {
      if (type !== 'all' && type !== t) continue;
      if (start >= n) {
        start -= n;
        continue;
      }
      const got = await load(start, Math.min(left, n - start));
      rows.push(...got);
      left -= got.length;
      start = 0;
      if (left <= 0) break;
    }
    return { rows, counts, total: counts[type], hiddenPrivate: 0 };
  }
  const found = await unstable_cache(
    () =>
      searchPage(q, {
        types: ['program', 'mention', 'university'],
        includePrivate: opts.includePrivate,
        limits: { program: SEARCH_CAP },
      }),
    ['home-search', JSON.stringify([q.trim().toLowerCase(), opts.includePrivate])],
    { revalidate: 60, tags: [TAGS.catalog] },
  )();
  const counts = {
    parcours: found.totals.program,
    mention: found.totals.mention,
    universite: found.totals.university,
    all: found.totals.program + found.totals.mention + found.totals.university,
  };
  const list =
    type === 'all' ? found.results : found.results.filter((r) => r.type === KIND_TYPE[type]);
  return {
    rows: list.slice(offset, offset + HOME_PER_PAGE).map((r) => {
      const out: Omit<SearchResult, 'score'> & { score?: number } = { ...r };
      delete out.score;
      return out;
    }),
    counts,
    total: Math.min(list.length, SEARCH_CAP),
    hiddenPrivate: found.hiddenPrivate,
  };
}
