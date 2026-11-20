import 'server-only';
import { Prisma } from '@/lib/db/generated/client';
import { prisma } from '@/lib/db';
import { browsePrograms } from '@/lib/catalog/browse';
import { EMPTY_FILTERS, type Filters } from '@/lib/catalog/filters';
import { matchedByText } from '@/lib/domain/search';
import { searchPage } from '@/lib/domain/search.server';
import { DEFAULT_KINDS } from '@/lib/domain/sector';
import { notYetPlace } from '@/lib/launch/places';
import { QUICK_FILTERS, type Quick } from './labels';

/**
 * Suggestions of « Quoi ? » on the home (GET /api/suggest): the site search, scoped like the
 * Explorer the form leads to.
 * - the count and the masters: browsePrograms, the very query of the Explorer, with the same
 *   filters (q, open city, quick filters): « Voir les n masters » is the Explorer's total;
 * - the disciplines and the establishments: the search service of the ⌘K palette (identifiers,
 *   full text, typos), then their parcours in the city chosen, in one grouped statement;
 * - a place known but not open yet (« Lyon »).
 * Display fields only: 6 to 10 items.
 */

export interface SuggestQuery {
  q: string;
  /** Slug of an open city, or null for all of them. */
  city: string | null;
  quick: Quick;
}

export interface SuggestAnswer {
  q: string;
  count: number;
  mentions: { slug: string; name: string; domain: string | null; n: number }[];
  programs: {
    slug: string;
    title: string;
    where: string;
    reviews: number;
    avg: number | null;
    /** « RNCP · RNCP42684 » when found by an identifier. */
    code: string | null;
  }[];
  universities: { slug: string; name: string; n: number }[];
  notYet: { place: string } | null;
}

const LIMITS = { mentions: 3, programs: 4, universities: 2 } as const;

/** The Explorer filters of a home search (lib/home/labels.ts: same parameters). */
export function suggestFilters(s: SuggestQuery): Filters {
  const f: Filters = { ...EMPTY_FILTERS, q: s.q.slice(0, 120) };
  if (s.city) f.lieux = [`zone:${s.city}`];
  for (const qf of QUICK_FILTERS)
    if (s.quick[qf.key]) {
      if (qf.param === 'modalite') f.modalites = [qf.value];
      if (qf.param === 'avis') f.avis = [qf.value];
      if (qf.param === 'entree') f.entrees = [qf.value];
    }
  return f;
}

/** Only the number of masters (button, quick filter changed with the panel closed). */
export async function suggestCount(s: SuggestQuery): Promise<number> {
  return (await browsePrograms(suggestFilters(s), {}, { offset: 0, limit: 1 })).total;
}

export async function suggest(s: SuggestQuery): Promise<SuggestAnswer> {
  const zone = s.city ? Prisma.sql`AND ${s.city} = ANY(i."zoneSlugs")` : Prisma.empty;
  const [programs, others, notYet] = await Promise.all([
    // a few more: homonyms of one establishment read the same, one of them is enough
    browsePrograms(suggestFilters(s), {}, { offset: 0, limit: LIMITS.programs * 3 }),
    searchPage(s.q, {
      types: ['mention', 'university'],
      // a wide pool: those without a parcours in the city chosen are left out below
      limits: { mention: 30, university: 12 },
      limit: 42,
    }),
    notYetPlace(s.q),
  ]);
  const mentionIds = others.results.filter((r) => r.type === 'mention').map((r) => r.id);
  const uniIds = others.results.filter((r) => r.type === 'university').map((r) => r.id);
  // Parcours of each one in the city chosen (public establishments, as the Explorer), and the
  // domain of a mention as /mentions shows it (the one of most of its parcours).
  const counts =
    mentionIds.length + uniIds.length
      ? await prisma.$queryRaw<{ kind: string; id: string; n: number; domain: string | null }[]>`
        SELECT 'm' AS kind, i."mentionId" AS id,
               count(*) FILTER (WHERE TRUE ${zone})::int AS n,
               mode() WITHIN GROUP (ORDER BY i."domainSlug") AS domain
          FROM "ProgramSearchIndex" i
         WHERE i."mentionId" = ANY(${mentionIds}) AND i.kind = ANY(${DEFAULT_KINDS})
         GROUP BY 2
        UNION ALL
        SELECT 'u', i."universityId", count(*) FILTER (WHERE TRUE ${zone})::int, NULL
          FROM "ProgramSearchIndex" i
         WHERE i."universityId" = ANY(${uniIds}) AND i.kind = ANY(${DEFAULT_KINDS})
         GROUP BY 2`
      : [];
  const byId = new Map(counts.map((c) => [`${c.kind}:${c.id}`, c]));
  const slugOf = (href: string) => href.split('/').pop() ?? '';
  return {
    q: s.q,
    count: programs.total,
    mentions: others.results
      .filter((r) => r.type === 'mention' && (byId.get(`m:${r.id}`)?.n ?? 0) > 0)
      // the most furnished first, the search order between equals
      .sort((x, y) => byId.get(`m:${y.id}`)!.n - byId.get(`m:${x.id}`)!.n)
      .slice(0, LIMITS.mentions)
      .map((r) => {
        const c = byId.get(`m:${r.id}`)!;
        return { slug: slugOf(r.href), name: r.title, domain: c.domain, n: c.n };
      }),
    programs: programs.rows
      .filter(
        (p, i, rows) =>
          rows.findIndex(
            (o) =>
              o.title === p.title &&
              o.universityShort === p.universityShort &&
              o.cityName === p.cityName,
          ) === i,
      )
      .slice(0, LIMITS.programs)
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        where: [p.universityShort, p.cityName].filter(Boolean).join(' · '),
        reviews: p.reviewCount,
        avg: p.avgRating,
        code: matchedByText(p.matchedBy),
      })),
    universities: others.results
      .filter((r) => r.type === 'university' && (byId.get(`u:${r.id}`)?.n ?? 0) > 0)
      .slice(0, LIMITS.universities)
      .map((r) => ({ slug: slugOf(r.href), name: r.title, n: byId.get(`u:${r.id}`)!.n })),
    notYet,
  };
}
