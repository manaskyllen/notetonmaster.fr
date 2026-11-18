import 'server-only';
import { publicMonth } from '@/lib/domain/public-date';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db/generated/client';
import type { Modality } from '@/lib/db/generated/enums';
import { summarizeOrigins } from '@/lib/domain/admission-origins';
import { CRITERIA, type CriterionKey } from '@/lib/domain/rating';

// ───────────────────────────── admission stats ─────────────────────────────

export interface StatInput {
  session: number;
  capacity: number | null;
  seatsTaken: number | null;
  applications: number | null;
  offers: number | null;
  lastRankCalled: number | null;
  accessRate: number | null;
  source: string;
  monMasterEntryId: string | null;
}

export interface AdmissionSummary {
  /** Session of the headline numbers (e.g. 2025). */
  session: number | null;
  source: string | null;
  fromMonMaster: boolean;
  capacity: number | null;
  seatsTaken: number | null;
  applications: number | null;
  offers: number | null;
  /** "48" or "68 / 74" when several Mon Master entries. */
  lastRank: string | null;
  entries: number;
  /** Fallback access rate (brochure), with its session. */
  accessRate: number | null;
  accessRateSession: number | null;
  accessRateSource: string | null;
}

const sumOrNull = (vals: (number | null)[]) =>
  vals.some((v) => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null;

/** Headline admission figures: latest session, summed over Mon Master entries. */
export function summarizeAdmission(stats: StatInput[]): AdmissionSummary {
  const mm = stats.filter((s) => s.monMasterEntryId);
  const pool = mm.length ? mm : stats.filter((s) => s.capacity != null || s.applications != null);
  const session = pool.length ? Math.max(...pool.map((s) => s.session)) : null;
  const latest = pool.filter((s) => s.session === session);
  const ranks = latest.map((s) => s.lastRankCalled).filter((r): r is number => r != null);
  const access = stats.filter((s) => s.accessRate != null).sort((a, b) => b.session - a.session)[0];
  return {
    session,
    source: latest[0]?.source ?? null,
    fromMonMaster: mm.length > 0,
    capacity: sumOrNull(latest.map((s) => s.capacity)),
    seatsTaken: latest.every((s) => s.seatsTaken != null)
      ? sumOrNull(latest.map((s) => s.seatsTaken))
      : null,
    applications: sumOrNull(latest.map((s) => s.applications)),
    offers: sumOrNull(latest.map((s) => s.offers)),
    lastRank: ranks.length ? ranks.join(' / ') : null,
    entries: latest.length,
    accessRate: access?.accessRate ?? null,
    accessRateSession: access?.session ?? null,
    accessRateSource: access?.source ?? null,
  };
}

// ───────────────────────────── program summaries ─────────────────────────────

const STAT_SELECT = {
  session: true,
  capacity: true,
  seatsTaken: true,
  applications: true,
  offers: true,
  lastRankCalled: true,
  accessRate: true,
  source: true,
  monMasterEntryId: true,
} as const;

export interface ProgramSummary {
  id: string;
  slug: string;
  title: string;
  shortName: string | null;
  city: string;
  campus: string | null;
  modality: Modality;
  entryLevel: 'M1' | 'M2';
  university: {
    id: string;
    slug: string;
    name: string;
    shortName: string | null;
    position: number;
  };
  component: string | null;
  mention: { slug: string; name: string; domainSlug: string | null };
  admission: AdmissionSummary;
  reviewCount: number;
  avgRating: number | null;
  internships: string | null;
  highlights: string[];
  requirements: string | null;
  programmeSource: string | null;
  keywords: string[];
}

/** Summaries of the given programs (the comparator: 3 at most). Never the whole catalogue. */
export const getProgramSummaries = cache(async (slugs: string[]): Promise<ProgramSummary[]> => {
  if (!slugs.length) return [];
  const [programs, universities, ratings] = await Promise.all([
    prisma.program.findMany({
      where: { isPublished: true, inOpenZone: true, slug: { in: slugs } },
      include: {
        university: true,
        component: true,
        mention: { include: { domain: true } },
        admissionStats: { select: STAT_SELECT },
        semesters: {
          select: { sourceDocument: true, sourceYear: true },
          take: 1,
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { title: 'asc' },
    }),
    prisma.university.findMany({ orderBy: { name: 'asc' }, select: { id: true } }),
    prisma.review.groupBy({
      by: ['programId'],
      where: { status: 'PUBLISHED', program: { slug: { in: slugs } } },
      _count: { _all: true },
      _avg: { overallRating: true },
    }),
  ]);
  const uniPos = new Map(universities.map((u, i) => [u.id, i]));
  const ratingBy = new Map(ratings.map((r) => [r.programId, r]));
  return programs.map((p) => {
    const r = ratingBy.get(p.id);
    const sem = p.semesters[0];
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      shortName: p.shortName,
      city: p.city,
      campus: p.campus,
      modality: p.modality,
      entryLevel: p.entryLevel,
      university: {
        id: p.university.id,
        slug: p.university.slug,
        name: p.university.name,
        shortName: p.university.shortName,
        position: uniPos.get(p.university.id) ?? 0,
      },
      component: p.component?.name ?? null,
      mention: {
        slug: p.mention.slug,
        name: p.mention.name,
        domainSlug: p.mention.domain?.slug ?? null,
      },
      admission: summarizeAdmission(p.admissionStats),
      reviewCount: r?._count._all ?? 0,
      avgRating: r?._avg.overallRating ?? null,
      internships: p.internships,
      highlights: p.highlights,
      requirements: p.requirements,
      programmeSource: sem ? [sem.sourceDocument, sem.sourceYear].filter(Boolean).join(' ') : null,
      keywords: p.keywords,
    };
  });
});

// ───────────────────────────── program detail ─────────────────────────────

export const getProgram = cache(async (slug: string) => {
  const p = await prisma.program.findUnique({
    where: { slug },
    include: {
      university: true,
      component: true,
      mention: { include: { certification: true, domain: true } },
      monMasterEntries: { orderBy: { code: 'asc' } },
      admissionStats: {
        select: {
          ...STAT_SELECT,
          accepted: true,
          acceptedSameInstitution: true,
          acceptedSameAcademy: true,
          acceptedAtMainPhaseStart: true,
          origins: { select: { origin: true, applications: true, offers: true, accepted: true } },
        },
        orderBy: { session: 'desc' },
      },
      semesters: {
        orderBy: { position: 'asc' },
        include: {
          courses: { orderBy: { order: 'asc' } },
          milestones: { orderBy: { order: 'asc' } },
        },
      },
    },
  });
  // Published = isPublished && in an open launch zone (lib/launch/zones.ts).
  if (!p || !p.isPublished || !p.inOpenZone) return null;
  const insertion = await prisma.insertionStat.findFirst({
    where: { mentionId: p.mentionId, universityId: p.universityId },
    orderBy: { cohortYear: 'desc' },
  });
  return {
    ...p,
    admission: summarizeAdmission(p.admissionStats),
    origins: summarizeOrigins(p.admissionStats),
    insertion,
  };
});

export type ProgramDetail = NonNullable<Awaited<ReturnType<typeof getProgram>>>;

export interface PublicReview {
  id: string;
  ref: string;
  level: 'M1' | 'M2' | 'GRADUATE';
  employmentStatus: 'EMPLOYED' | 'JOB_SEEKING' | 'FURTHER_STUDY' | 'OTHER' | null;
  jobTitle: string | null;
  cohortYear: number;
  rating: number;
  title: string | null;
  pros: string;
  cons: string;
  isVerified: boolean;
  acceptsQuestions: boolean;
  helpfulCount: number;
  publishedAt: Date;
  isDemo: boolean;
  scores: Partial<Record<CriterionKey, number>>;
  /** Published reply of the teaching team (droit de réponse). */
  reply: { body: string; domain: string; publishedAt: Date } | null;
}

export const REVIEW_LEVELS = ['M1', 'M2', 'GRADUATE'] as const;
export type ReviewLevelFilter = (typeof REVIEW_LEVELS)[number] | 'all';
export const REVIEW_SORTS = [
  { id: 'recents', label: 'Plus récents' },
  { id: 'utiles', label: 'Plus utiles' },
  { id: 'notes-hautes', label: 'Notes hautes' },
  { id: 'notes-basses', label: 'Notes basses' },
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number]['id'];
export const REVIEWS_PER_PAGE = 10;

const REVIEW_ORDER: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  recents: [{ publishedAt: 'desc' }, { id: 'asc' }],
  utiles: [{ helpfulCount: 'desc' }, { publishedAt: 'desc' }, { id: 'asc' }],
  'notes-hautes': [{ overallRating: 'desc' }, { publishedAt: 'desc' }, { id: 'asc' }],
  'notes-basses': [{ overallRating: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
};

/**
 * One page of the published reviews of a program: 10 per page, sorted, filtered by
 * level. The figures (« Note globale », criteria, verified share) are computed over every review
 * of the filter, never over the page.
 */
export async function getReviewPage(
  programId: string,
  opts: { level: ReviewLevelFilter; sort: ReviewSort; page: number },
) {
  const where = {
    programId,
    status: 'PUBLISHED' as const,
    ...(opts.level === 'all' ? {} : { level: opts.level }),
  };
  const [count, agg, positive, verified, graduates, criteria, byLevel, demo] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.aggregate({ where, _avg: { overallRating: true } }),
    prisma.review.count({ where: { ...where, overallRating: { gte: 4 } } }),
    prisma.review.count({ where: { ...where, isVerified: true } }),
    prisma.review.groupBy({
      by: ['employmentStatus'],
      where: { ...where, level: 'GRADUATE', employmentStatus: { not: null } },
      _count: { _all: true },
    }),
    prisma.reviewCriterionScore.groupBy({
      by: ['criterion'],
      where: { review: where },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ['level'],
      where: { programId, status: 'PUBLISHED' },
      _count: { _all: true },
    }),
    prisma.review.count({ where: { programId, status: 'PUBLISHED', isDemo: true } }),
  ]);
  const lastPage = Math.max(1, Math.ceil(count / REVIEWS_PER_PAGE));
  const page = Math.min(opts.page, lastPage);
  const reviews = await getPublishedReviews(programId, {
    where,
    orderBy: REVIEW_ORDER[opts.sort],
    skip: (page - 1) * REVIEWS_PER_PAGE,
    take: REVIEWS_PER_PAGE,
  });
  const graduatesTotal = graduates.reduce((a, g) => a + g._count._all, 0);
  return {
    reviews,
    page,
    requestedPage: opts.page,
    count,
    total: byLevel.reduce((a, l) => a + l._count._all, 0),
    hasDemo: demo > 0,
    stats: {
      count,
      avg: agg._avg.overallRating,
      verified,
      positiveShare: count ? Math.round((positive / count) * 100) : null,
      graduates: graduatesTotal,
      employed: graduates.find((g) => g.employmentStatus === 'EMPLOYED')?._count._all ?? 0,
      criteria: CRITERIA.map((c) => {
        const row = criteria.find((x) => x.criterion === c);
        return { criterion: c, avg: row?._avg.score ?? null, count: row?._count._all ?? 0 };
      }),
    },
  };
}

/**
 * Summary of the hero of a program page (« 12 avis d'étudiant·es · 8 vérifiés · 83 % le
 * recommandent »): every published review, whatever the level filter of the list below.
 * « Le recommandent » = overall rating of 4 or 5 (the form has no separate recommendation).
 */
export const getReviewSummary = cache(async (programId: string) => {
  const where = { programId, status: 'PUBLISHED' as const };
  const [count, agg, verified, positive] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.aggregate({ where, _avg: { overallRating: true } }),
    prisma.review.count({ where: { ...where, isVerified: true } }),
    prisma.review.count({ where: { ...where, overallRating: { gte: 4 } } }),
  ]);
  return {
    count,
    avg: agg._avg.overallRating,
    verified,
    recommendShare: count ? Math.round((positive / count) * 100) : null,
  };
});

/** Published reviews, newest first (no ranking by rating, see charter). Never exposes authors. */
export async function getPublishedReviews(
  programId: string,
  page?: {
    where: Prisma.ReviewWhereInput;
    orderBy: Prisma.ReviewOrderByWithRelationInput[];
    skip: number;
    take: number;
  },
): Promise<PublicReview[]> {
  const rows = await prisma.review.findMany({
    where: page?.where ?? { programId, status: 'PUBLISHED' },
    orderBy: page?.orderBy ?? { publishedAt: 'desc' },
    ...(page ? { skip: page.skip, take: page.take } : {}),
    select: {
      id: true,
      ref: true,
      level: true,
      employmentStatus: true,
      jobTitle: true,
      cohortYear: true,
      overallRating: true,
      title: true,
      pros: true,
      cons: true,
      isVerified: true,
      acceptsQuestions: true,
      helpfulCount: true,
      publishedAt: true,
      isDemo: true,
      student: { select: { acceptsQuestions: true, deletedAt: true } },
      scores: { select: { criterion: true, score: true } },
    },
  });
  // Published replies of the teaching teams: one statement for the page.
  const replies = rows.length
    ? await prisma.$queryRaw<
        { reviewId: string; body: string; publishedAt: Date; domain: string }[]
      >`
        SELECT r."reviewId", r.body, r."publishedAt", s.domain
          FROM "ReviewResponse" r JOIN "StaffResponder" s ON s.id = r."responderId"
         WHERE r."reviewId" = ANY(${rows.map((x) => x.id)}) AND r.status = 'PUBLISHED' AND r."publishedAt" IS NOT NULL`
    : [];
  const replyBy = new Map(replies.map((x) => [x.reviewId, x]));
  return rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    level: r.level,
    employmentStatus: r.level === 'GRADUATE' ? r.employmentStatus : null,
    jobTitle: r.level === 'GRADUATE' && r.employmentStatus === 'EMPLOYED' ? r.jobTitle : null,
    cohortYear: r.cohortYear,
    rating: r.overallRating,
    title: r.title,
    pros: r.pros,
    cons: r.cons,
    isVerified: r.isVerified,
    // Account holders can switch questions off globally; reviews without account keep their own choice.
    acceptsQuestions:
      r.acceptsQuestions && (r.student ? r.student.acceptsQuestions && !r.student.deletedAt : true),
    helpfulCount: r.helpfulCount,
    publishedAt: publicMonth(r.publishedAt),
    isDemo: r.isDemo,
    scores: Object.fromEntries(r.scores.map((s) => [s.criterion, s.score])),
    reply: replyBy.has(r.id)
      ? {
          body: replyBy.get(r.id)!.body,
          domain: replyBy.get(r.id)!.domain,
          publishedAt: publicMonth(replyBy.get(r.id)!.publishedAt),
        }
      : null,
  }));
}

export function reviewStats(reviews: PublicReview[]) {
  const n = reviews.length;
  const avg = n ? reviews.reduce((a, r) => a + r.rating, 0) / n : null;
  const verified = reviews.filter((r) => r.isVerified).length;
  const positive = reviews.filter((r) => r.rating >= 4).length;
  const criteria = CRITERIA.map((c) => {
    const vals = reviews.map((r) => r.scores[c]).filter((v): v is number => v != null);
    return {
      criterion: c,
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      count: vals.length,
    };
  });
  return {
    count: n,
    avg,
    verified,
    positiveShare: n ? Math.round((positive / n) * 100) : null,
    criteria,
  };
}

// ───────────────────────────── mention / university ─────────────────────────────

export const getMention = cache(async (slug: string) => {
  const m = await prisma.mention.findUnique({
    where: { slug },
    include: { certification: true, domain: true },
  });
  if (!m || !m.isPublished) return null;
  // Figures of the header, computed (public establishments).
  const [fig] = await prisma.$queryRaw<
    { unis: bigint; programs: bigint; places: bigint | null; listed: bigint }[]
  >`
    SELECT count(DISTINCT "universityId") FILTER (WHERE "isPublicSector") AS unis,
           count(*) FILTER (WHERE "isPublicSector") AS programs,
           sum(places) FILTER (WHERE "isPublicSector") AS places, count(*) AS listed
      FROM "ProgramSearchIndex" WHERE "mentionId" = ${m.id}`;
  // No published parcours (none in an open city): no public page.
  if (!Number(fig?.listed ?? 0)) return null;
  return {
    ...m,
    figures: {
      universities: Number(fig?.unis ?? 0),
      programs: Number(fig?.programs ?? 0),
      places: fig?.places == null ? null : Number(fig.places),
    },
  };
});

export const getUniversity = cache(async (slug: string) => {
  const u = await prisma.university.findUnique({
    where: { slug },
    include: {
      parent: { select: { name: true, slug: true } },
      children: {
        where: { isPublished: true },
        select: { id: true, name: true, shortName: true, slug: true },
      },
    },
  });
  if (!u || !u.isPublished) return null;
  // No published parcours, its own or its établissements-composantes': no public page.
  const listed = await prisma.programSearchIndex.count({
    where: { universityId: { in: [u.id, ...u.children.map((c) => c.id)] } },
  });
  if (!listed) return null;
  return u;
});

/** Header figures of a university (with or without its établissements-composantes). */
export async function universityFigures(ids: string[]) {
  const [f] = await prisma.$queryRaw<
    {
      programs: bigint;
      mentions: bigint;
      places: bigint | null;
      apps: bigint | null;
      reviews: bigint;
      session: number | null;
    }[]
  >`
    SELECT count(*) AS programs, count(DISTINCT "mentionId") AS mentions, sum(places) AS places,
           sum(applications) AS apps, sum("reviewCount") AS reviews, max("lastSession") AS session
      FROM "ProgramSearchIndex" WHERE "universityId" = ANY(${ids})`;
  const n = (v: bigint | null | undefined) => (v == null ? null : Number(v));
  return {
    programs: n(f?.programs) ?? 0,
    mentions: n(f?.mentions) ?? 0,
    places: n(f?.places),
    applications: n(f?.apps),
    reviews: n(f?.reviews) ?? 0,
    session: f?.session ?? null,
  };
}

/**
 * The domains, each with its mentions listed on the site: published and with at least one parcours
 * of a public establishment in an open city (the search index), as the other public lists. A
 * mention whose parcours are all in closed cities has a 404 page: never counted nor linked.
 */
export const getDomains = cache(async () => {
  const [domains, listed] = await Promise.all([
    prisma.domain.findMany({
      orderBy: { position: 'asc' },
      include: {
        mentions: { where: { isPublished: true }, select: { id: true, slug: true, name: true } },
      },
    }),
    prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT "mentionId" AS id FROM "ProgramSearchIndex" WHERE "isPublicSector"`,
  ]);
  const ids = new Set(listed.map((r) => r.id));
  return domains.map((d) => ({ ...d, mentions: d.mentions.filter((m) => ids.has(m.id)) }));
});
