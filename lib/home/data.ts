import 'server-only';
import { unstable_cache } from 'next/cache';
import { TAGS } from '@/lib/cache/tags';
import { cityIndex, mentionIndex, type MentionEntry } from '@/lib/catalog/indexes';
import type { CityEntry, DomainLegend } from '@/lib/catalog/index-labels';
import { prisma } from '@/lib/db';
import { publicMonth } from '@/lib/domain/public-date';
import { DEFAULT_KINDS } from '@/lib/domain/sector';
import { cachedOpenZones } from '@/lib/launch/cached';
import { countTable, excerpt, type CountTable } from './labels';

/**
 * Everything the home shows, read from denormalised and cached data: the open cities
 * (LaunchZone, cachedOpenZones), the city cards (cityIndex, the figures of /masters), the
 * mentions per domain (mentionIndex, the list of /mentions), the count table of the button and
 * the latest reviews. No heavy query at each visit: two small reads, cached, expired with the
 * catalogue, the open cities and the reviews.
 */

/** An open city as the search form needs it (« Où ? », the line under the search). */
export interface HomeZone {
  slug: string;
  name: string;
  region: string | null;
  /** Published masters (public establishments). */
  masters: number;
}

export interface HomeDomain {
  slug: string;
  name: string;
  tone: string;
  icon: string;
  /** Mentions with a published parcours: '' for all open cities, else per city. */
  mentions: Record<string, number>;
}

export interface HomeReview {
  id: string;
  rating: number;
  /** First day of the month of publication (ISO): what the fiche shows, nothing more precise. */
  month: string;
  text: string;
  programTitle: string;
  programSlug: string;
  where: string;
  level: 'M1' | 'M2' | 'GRADUATE';
}

/** Reviews published before the section « Ce qu'en disent les étudiant·es » appears. */
export const REVIEWS_MIN = 3;
/** Programs with at least this many reviews are preferred for an excerpt (less identifying). */
const SAFE_PROGRAM_REVIEWS = 3;

/** Count of each domain's mentions, for all open cities ('') and each one. */
export function domainMentionCounts(
  entries: Pick<MentionEntry, 'domain' | 'zones'>[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    if (!e.domain) continue;
    const d = (out[e.domain] ??= {});
    d[''] = (d[''] ?? 0) + 1;
    for (const z of new Set(e.zones)) d[z] = (d[z] ?? 0) + 1;
  }
  return out;
}

/** The 5 mentions with the most published parcours: « Recherches fréquentes », no tracking. */
export function frequentMentions(entries: Pick<MentionEntry, 'name' | 'parcours'>[], n = 5) {
  return [...entries]
    .sort((a, b) => b.parcours - a.parcours || a.name.localeCompare(b.name, 'fr'))
    .slice(0, n)
    .map((e) => ({ name: e.name, parcours: e.parcours }));
}

/** Short mention names to try after an empty search (« Psychologie », « Droit »…). */
export function shortMentions(entries: Pick<MentionEntry, 'name' | 'parcours'>[], n = 4) {
  return frequentMentions(
    entries.filter((e) => e.name.length <= 22),
    n,
  ).map((e) => e.name);
}

async function computeCounts(): Promise<CountTable> {
  const rows = await prisma.$queryRaw<
    { zones: string[]; alt: boolean; avis: boolean; m1: boolean; n: number }[]
  >`
    SELECT "zoneSlugs" AS zones, 'alternance' = ANY(modalities) AS alt, "reviewCount" > 0 AS avis,
           "entryLevel" = 'M1' AS m1, count(*)::int AS n
      FROM "ProgramSearchIndex" WHERE kind = ANY(${DEFAULT_KINDS})
     GROUP BY 1, 2, 3, 4`;
  return countTable(rows);
}

/**
 * The button « Voir les n masters » with an empty « Quoi ? »: a few hundred bytes in the page,
 * no request. Same counting as the Explorer (public establishments, zone, quick filters).
 */
export const homeCounts = unstable_cache(computeCounts, ['home-counts'], {
  revalidate: 600,
  tags: [TAGS.catalog, TAGS.zones],
});

/**
 * Demo reviews (seed) count in development only, as in the footer (lib/domain/footer-stats.ts):
 * in production the section appears with real reviews or not at all.
 */
async function computeReviews(
  includeDemo = process.env.NODE_ENV !== 'production',
): Promise<{ total: number; items: HomeReview[] }> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      rating: number;
      publishedAt: Date;
      pros: string;
      level: HomeReview['level'];
      title: string;
      slug: string;
      uni: string;
      city: string;
      programReviews: number;
      programId: string;
      total: number;
    }[]
  >`
    SELECT r.id, r."overallRating" AS rating, r."publishedAt", r.pros, r.level::text AS level,
           i.title, i.slug, i."universityShort" AS uni, i."cityName" AS city,
           i."reviewCount" AS "programReviews", i."programId", count(*) OVER ()::int AS total
      FROM "Review" r JOIN "ProgramSearchIndex" i ON i."programId" = r."programId"
     WHERE r.status = 'PUBLISHED' AND r."publishedAt" IS NOT NULL AND i.kind = ANY(${DEFAULT_KINDS})
       AND (${includeDemo} OR NOT r."isDemo")
     ORDER BY r."publishedAt" DESC, r.id
     LIMIT 40`;
  const total = rows[0]?.total ?? 0;
  if (total < REVIEWS_MIN) return { total, items: [] };
  // The latest ones, one per parcours, those of a parcours with several reviews first: an
  // excerpt of the only review of a small promo is easier to attribute.
  const picked: typeof rows = [];
  for (const safe of [true, false])
    for (const r of rows) {
      if (picked.length === 3) break;
      if (safe !== r.programReviews >= SAFE_PROGRAM_REVIEWS) continue;
      // one per parcours, and never two cards that read the same (homonym parcours)
      if (
        picked.some((p) => p.programId === r.programId || (p.title === r.title && p.uni === r.uni))
      )
        continue;
      picked.push(r);
    }
  // Not enough distinct parcours: the latest reviews, whatever their parcours.
  for (const r of rows) if (picked.length < 3 && !picked.includes(r)) picked.push(r);
  picked.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return {
    total,
    items: picked.map((r) => ({
      id: r.id,
      rating: r.rating,
      month: publicMonth(r.publishedAt).toISOString(),
      text: excerpt(r.pros),
      programTitle: r.title,
      programSlug: r.slug,
      where: [r.uni, r.city].filter(Boolean).join(' · '),
      level: r.level,
    })),
  };
}

/** Latest published reviews: expired at each publication (tag `reviews`, afterReviewChange). */
export const homeReviews = unstable_cache(computeReviews, ['home-reviews'], {
  revalidate: 600,
  tags: [TAGS.reviews, TAGS.catalog, TAGS.zones],
});

export interface HomeData {
  zones: HomeZone[];
  cities: CityEntry[];
  legend: DomainLegend[];
  domains: HomeDomain[];
  frequent: { name: string; parcours: number }[];
  tries: string[];
  counts: CountTable;
  reviews: { total: number; items: HomeReview[] };
}

export async function homeData(): Promise<HomeData> {
  const [open, { entries: cityEntries, domains: legend }, { entries: mentions }, counts, reviews] =
    await Promise.all([
      cachedOpenZones(),
      cityIndex(),
      mentionIndex(),
      homeCounts(),
      homeReviews(),
    ]);
  const card = new Map(cityEntries.map((c) => [c.slug, c]));
  const perDomain = domainMentionCounts(mentions);
  return {
    // The order of the open cities line (most masters first): getOpenZones.
    zones: open.map((z) => ({
      slug: z.slug,
      name: z.name,
      region: card.get(z.slug)?.region ?? null,
      masters: z.programs,
    })),
    cities: cityEntries,
    legend,
    domains: legend.map((d) => ({
      slug: d.slug,
      name: d.name,
      tone: d.tone,
      icon: d.icon ?? 'mention',
      mentions: perDomain[d.slug] ?? {},
    })),
    frequent: frequentMentions(mentions),
    tries: shortMentions(mentions),
    counts,
    reviews,
  };
}
