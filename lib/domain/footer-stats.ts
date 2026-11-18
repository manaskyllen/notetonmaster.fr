import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { TAGS } from '@/lib/cache/tags';

/**
 * « La base aujourd'hui », the four figures of the footer. Counted in the database,
 * never typed in: published programs of public establishments (in an open city, ACTIVE or
 * NOT_RENEWED, never drafts), the universities and mentions that have at least one of them, published reviews
 * (demo reviews excluded in production), and the end of the last successful APPLY sync run.
 */
export interface FooterStats {
  programs: number;
  universities: number;
  mentions: number;
  reviews: number;
  /** Open cities of the launch, in their order (« parcours de master à Strasbourg, … »). */
  cities: string[];
  /** ISO date of the last successful publication, or null. */
  updatedAt: string | null;
}

export async function loadFooterStats(opts: { includeDemo?: boolean } = {}): Promise<FooterStats> {
  const includeDemo = opts.includeDemo ?? process.env.NODE_ENV !== 'production';
  const [row] = await prisma.$queryRaw<
    { programs: bigint; universities: bigint; mentions: bigint }[]
  >`
    SELECT count(*) AS programs,
           count(DISTINCT p."universityId") AS universities,
           count(DISTINCT p."mentionId") AS mentions
      FROM "Program" p
      JOIN "University" u ON u.id = p."universityId"
      JOIN "Mention" m ON m.id = p."mentionId"
     WHERE p."isPublished" AND p."inOpenZone" AND p.status IN ('ACTIVE', 'NOT_RENEWED')
       AND u."isPublished" AND u.sector = 'PUBLIC'
       AND m."isPublished"`;
  const [reviews, run, zones] = await Promise.all([
    prisma.review.count({
      where: {
        status: 'PUBLISHED',
        // reviews of a closed city are kept but hidden: not counted
        program: { inOpenZone: true },
        ...(includeDemo ? {} : { isDemo: false }),
      },
    }),
    prisma.syncRun.findFirst({
      where: { status: 'SUCCEEDED', mode: 'APPLY', finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    }),
    prisma.launchZone.findMany({
      where: { open: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { name: true },
    }),
  ]);
  return {
    programs: Number(row?.programs ?? 0),
    universities: Number(row?.universities ?? 0),
    mentions: Number(row?.mentions ?? 0),
    reviews,
    cities: zones.map((z) => z.name),
    updatedAt: run?.finishedAt?.toISOString() ?? null,
  };
}

/** Cached 1 hour, expired on each publication of a sync and each review published or removed. */
export const getFooterStats = unstable_cache(() => loadFooterStats(), ['footer-stats'], {
  revalidate: 3600,
  tags: [TAGS.footer, TAGS.zones],
});

/** « 7 746 » (narrow no-break space, as Intl writes it in French). */
export function formatCount(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

/** « 12 nov. 2026 ». */
export function formatStatsDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}

export interface FooterFigure {
  key: 'programs' | 'universities' | 'mentions' | 'reviews';
  value: number;
  text: string;
  label: string;
  /** Full sentence for screen readers: « 7 746 parcours de master référencés ». */
  aria: string;
}

/** The four figures, formatted, with « 1 avis publié » / « 0 avis publié » in the singular. */
/**
 * First label of « La base aujourd'hui », built from the open cities: « parcours de master à
 * Strasbourg, Mulhouse et Nantes », « … dans 5 villes » beyond three.
 */
export function programsLabel(cities: string[]): string {
  if (!cities.length) return 'parcours de master référencés';
  if (cities.length > 3) return `parcours de master dans ${cities.length} villes`;
  const list =
    cities.length > 1 ? `${cities.slice(0, -1).join(', ')} et ${cities.at(-1)}` : cities[0];
  return `parcours de master à ${list}`;
}

export function footerFigures(s: FooterStats): FooterFigure[] {
  const rows: [FooterFigure['key'], number, string][] = [
    ['programs', s.programs, programsLabel(s.cities ?? [])],
    ['universities', s.universities, 'universités et établissements'],
    ['mentions', s.mentions, 'mentions nationales'],
    ['reviews', s.reviews, s.reviews > 1 ? 'avis publiés' : 'avis publié'],
  ];
  return rows.map(([key, value, label]) => ({
    key,
    value,
    text: formatCount(value),
    label,
    aria: `${formatCount(value)} ${label}`,
  }));
}
