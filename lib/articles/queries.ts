import 'server-only';
import { unstable_cache } from 'next/cache';
import { TAGS } from '@/lib/cache/tags';
import { prisma } from '@/lib/db';
import type { ArticleTheme } from '@/lib/db/generated/enums';
import { cachedOpenZones } from '@/lib/launch/cached';
import { BLOCK_LIKE_RE } from './blocks';
import { cityScope, counts, type Figures } from './figures';
import { loadFigures } from './figures.server';
import { readingMinutes } from './model';
import { countWords, renderArticle, type RenderResult } from './render';

/**
 * Public reads of the guides, cached (tag `articles`, expired by every change in the admin and
 * after the figures are recomputed). A guide is public when it is online, its date has passed,
 * and its city (if any) is open.
 */

const OPTS = { revalidate: 600, tags: [TAGS.articles, TAGS.zones] };

export interface GuideItem {
  slug: string;
  title: string;
  lede: string;
  theme: ArticleTheme;
  city: { slug: string; name: string } | null;
  searchKeywords: string[];
  minutes: number;
  publishedAt: string;
  updatedAt: string;
}

/** Reading time from the source: blocks out, tokens counted as one word. */
function minutesOf(body: string): number {
  const text = body
    .split('\n')
    .filter((l) => !BLOCK_LIKE_RE.test(l.trim()))
    .join(' ')
    .replace(/\{\{[^}]*\}\}/g, '0')
    .replace(/[#*_>`[\]()-]/g, ' ');
  return readingMinutes(countWords(text));
}

async function computeGuides(): Promise<GuideItem[]> {
  const [rows, zones] = await Promise.all([
    prisma.article.findMany({
      where: { online: true, publishedAt: { lte: new Date() } },
      orderBy: [{ publishedAt: 'desc' }, { slug: 'asc' }],
      select: {
        slug: true,
        title: true,
        lede: true,
        theme: true,
        city: true,
        searchKeywords: true,
        body: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
    cachedOpenZones(),
  ]);
  return rows.flatMap((a) => {
    const zone = a.city ? zones.find((z) => z.slug === a.city) : null;
    if (a.city && !zone) return [];
    return [
      {
        slug: a.slug,
        title: a.title,
        lede: a.lede,
        theme: a.theme,
        city: zone ? { slug: zone.slug, name: zone.name } : null,
        searchKeywords: a.searchKeywords,
        minutes: minutesOf(a.body),
        publishedAt: a.publishedAt!.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      },
    ];
  });
}

/** Every public guide, the most recent first. */
export const publishedGuides = unstable_cache(computeGuides, ['guides-published'], OPTS);

export async function guidesOfCity(city: string): Promise<GuideItem[]> {
  return (await publishedGuides()).filter((g) => g.city?.slug === city);
}

export interface GuidePage {
  id: string;
  slug: string;
  title: string;
  lede: string;
  metaDescription: string;
  theme: ArticleTheme;
  city: { slug: string; name: string } | null;
  signature: string | null;
  publishedAt: string;
  updatedAt: string;
  render: Pick<RenderResult, 'html' | 'toc' | 'words'>;
  session: number | null;
  /** Card of the city (beside the table of contents). */
  cityCard: {
    programs: number;
    establishments: number;
    veryselective: number;
    selective: number;
    accessible: number;
  } | null;
  related: GuideItem[];
}

async function computeGuide(slug: string): Promise<GuidePage | null> {
  const a = await prisma.article.findUnique({ where: { slug } });
  if (!a || !a.online || !a.publishedAt || a.publishedAt > new Date()) return null;
  const [all, zones] = await Promise.all([publishedGuides(), cachedOpenZones()]);
  const zone = a.city ? zones.find((z) => z.slug === a.city) : null;
  if (a.city && !zone) return null;
  const figures: Figures = await loadFigures(cityScope(a.city));
  const r = renderArticle(
    a.body,
    figures,
    { guides: new Set(all.map((g) => g.slug)), cities: new Set(zones.map((z) => z.slug)) },
    'public',
  );
  const c = figures.city ? counts(figures) : null;
  const others = all.filter((g) => g.slug !== a.slug);
  const linked = a.relatedSlugs.flatMap((s) => others.filter((g) => g.slug === s));
  const related = (
    linked.length ? linked : others.filter((g) => a.city && g.city?.slug === a.city)
  ).slice(0, 3);
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    lede: a.lede,
    metaDescription: a.metaDescription,
    theme: a.theme,
    city: zone ? { slug: zone.slug, name: zone.name } : null,
    signature: a.signature,
    publishedAt: a.publishedAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    render: { html: r.html, toc: r.toc, words: r.words },
    session: figures.session,
    cityCard: c
      ? {
          programs: c.programs,
          establishments: c.establishments,
          veryselective: c.veryselective,
          selective: c.selective,
          accessible: c.accessible,
        }
      : null,
    related,
  };
}

export const getGuide = (slug: string) =>
  unstable_cache(() => computeGuide(slug), ['guide', slug], OPTS)();
