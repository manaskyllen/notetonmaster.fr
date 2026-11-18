import 'server-only';
import { prisma } from '@/lib/db';
import { normMention, normProgramTitle, similarity } from '@/lib/data/normalize';
import {
  evolutionAnnotations,
  evolutionPoints,
  historyStats,
  promoRatings,
  type EvolutionStat,
} from '@/lib/domain/admission-evolution';

/** Predecessor chains are short (one re-accreditation every five years); a cycle stops the walk. */
const MAX_DEPTH = 6;

type Row = {
  session: number;
  applications: number | null;
  offers: number | null;
  capacity: number | null;
  raw: unknown;
  monMasterEntry: { code: string } | null;
};
const toStat = (r: Row): EvolutionStat => ({
  session: r.session,
  entry: r.monMasterEntry?.code ?? '',
  applications: r.applications,
  offers: r.offers,
  capacity: r.capacity,
  raw: r.raw && typeof r.raw === 'object' ? (r.raw as EvolutionStat['raw']) : null,
});
const STAT = {
  session: true,
  applications: true,
  offers: true,
  capacity: true,
  raw: true,
  monMasterEntry: { select: { code: true } },
} as const;

/**
 * « Comment ce master évolue » for one program: points per session, annotations and ratings per
 * promo. The history walks the « succède à » links between accreditations and keeps every former
 * Mon Master number of the program.
 */
export async function getEvolution(p: {
  id: string;
  title: string;
  accreditationId: string | null;
  mentionName: string;
}) {
  // « succède à » chain, from the current accreditation up
  const chain: { id: string; mention: string }[] = [];
  const seen = new Set<string>();
  let next = p.accreditationId;
  while (next && !seen.has(next) && chain.length < MAX_DEPTH) {
    seen.add(next);
    const a = await prisma.mentionAccreditation.findUnique({
      where: { id: next },
      select: { id: true, predecessorId: true, mention: { select: { name: true } } },
    });
    if (!a) break;
    chain.push({ id: a.id, mention: a.mention.name });
    next = a.predecessorId;
  }
  const predecessors = chain.slice(1).map((a) => a.id);
  const key = normProgramTitle(p.title);
  const [own, candidates, promos] = await Promise.all([
    prisma.admissionStat.findMany({
      where: { programId: p.id, monMasterEntryId: { not: null } },
      select: STAT,
    }),
    predecessors.length
      ? prisma.program.findMany({
          where: { accreditationId: { in: predecessors }, id: { not: p.id } },
          select: { id: true, title: true },
        })
      : [],
    prisma.review.groupBy({
      by: ['cohortYear'],
      where: { programId: p.id, status: 'PUBLISHED' },
      _avg: { overallRating: true },
      _count: { _all: true },
    }),
  ]);
  // The same parcours under a former accreditation (not merged into this program).
  const same = candidates.filter((c) => {
    const k = normProgramTitle(c.title);
    return k === key || similarity(k, key) >= 0.9;
  });
  const inherited = same.length
    ? await prisma.admissionStat.findMany({
        where: { programId: { in: same.map((s) => s.id) }, monMasterEntryId: { not: null } },
        select: STAT,
      })
    : [];
  const stats = historyStats(own.map(toStat), inherited.map(toStat));
  const names = new Map(chain.map((a) => [normMention(a.mention), a.mention]));
  return {
    points: evolutionPoints(stats),
    annotations: evolutionAnnotations(stats, { mentionName: p.mentionName }, names),
    promos: promoRatings(
      promos.map((r) => ({
        cohortYear: r.cohortYear,
        avg: r._avg.overallRating,
        count: r._count._all,
      })),
    ),
  };
}

export type Evolution = Awaited<ReturnType<typeof getEvolution>>;
