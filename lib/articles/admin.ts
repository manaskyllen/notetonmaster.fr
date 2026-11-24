import 'server-only';
import { prisma } from '@/lib/db';
import type { ArticleStatus, ArticleTheme } from '@/lib/db/generated/enums';
import { publishBlockers, seoChecklist, type CheckItem } from './checks';
import { cityScope, type Figures } from './figures';
import { loadFigures } from './figures.server';
import { displayStatus } from './model';
import { renderArticle, type LinkContext, type RenderMode, type RenderResult } from './render';
import { changedTokens, tokenMenu } from './tokens';

/**
 * Reads of the admin (Articles list and editor): never cached, figures from ArticleFigures.
 * In the admin, a link to a guide is valid when the guide exists (a draft may link to another
 * draft); on the site, only published guides count.
 */

/** Open cities with at least one public parcours (the cities of the site), by order. */
export function openCities() {
  return prisma.launchZone.findMany({
    where: { open: true, programCount: { gt: 0 } },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { slug: true, name: true },
  });
}

export async function adminLinkContext(): Promise<LinkContext & { open: Set<string> }> {
  const [slugs, zones] = await Promise.all([
    prisma.article.findMany({ select: { slug: true } }),
    openCities(),
  ]);
  const open = new Set(zones.map((z) => z.slug));
  return { guides: new Set(slugs.map((s) => s.slug)), cities: open, open };
}

export interface ArticleInput {
  title: string;
  lede: string;
  body: string;
  metaDescription: string;
  keyword: string;
  city: string | null;
}

export interface Analysis {
  render: RenderResult;
  checklist: CheckItem[];
  score: number;
  blockers: string[];
  figures: Figures;
}

/** Renders a guide as the admin sees it, with its checklist and what blocks its publication. */
export async function analyse(
  a: ArticleInput,
  mode: RenderMode,
  ctx?: Awaited<ReturnType<typeof adminLinkContext>>,
  figuresCache?: Map<string, Figures>,
): Promise<Analysis> {
  const c = ctx ?? (await adminLinkContext());
  const scope = cityScope(a.city);
  let figures = figuresCache?.get(scope);
  if (!figures) {
    figures = await loadFigures(scope);
    figuresCache?.set(scope, figures);
  }
  const render = renderArticle(a.body, figures, c, mode);
  const checklist = seoChecklist(a, render);
  return {
    render,
    checklist,
    score: checklist.filter((x) => x.ok).length,
    blockers: publishBlockers(a, render, c.open),
    figures,
  };
}

export interface AdminArticleRow {
  id: string;
  title: string;
  slug: string;
  city: string | null;
  cityName: string;
  theme: ArticleTheme;
  status: ArticleStatus;
  online: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  score: number;
  toReview: boolean;
}

export async function listAdminArticles(filter: {
  city: string | null;
  status: ArticleStatus | null;
}): Promise<AdminArticleRow[]> {
  const [rows, zones, ctx] = await Promise.all([
    prisma.article.findMany({
      where: {
        ...(filter.city === 'toutes' ? { city: null } : filter.city ? { city: filter.city } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.launchZone.findMany({ select: { slug: true, name: true } }),
    adminLinkContext(),
  ]);
  const cache = new Map<string, Figures>();
  const out: AdminArticleRow[] = [];
  for (const a of rows) {
    const status = displayStatus(a);
    if (filter.status && status !== filter.status) continue;
    const { score } = await analyse(a, 'preview', ctx, cache);
    out.push({
      id: a.id,
      title: a.title,
      slug: a.slug,
      city: a.city,
      cityName: a.city
        ? (zones.find((z) => z.slug === a.city)?.name ?? a.city)
        : 'Toutes les villes',
      theme: a.theme,
      status,
      online: a.online,
      publishedAt: a.publishedAt,
      updatedAt: a.updatedAt,
      score,
      toReview: a.status === 'TO_REVIEW',
    });
  }
  return out;
}

/** What the editor needs besides the article: cities, other guides, tokens, review state. */
export async function editorData(id: string) {
  const a = await prisma.article.findUnique({ where: { id } });
  if (!a) return null;
  const [zones, others, ctx, allZones] = await Promise.all([
    openCities(),
    prisma.article.findMany({
      where: { id: { not: id } },
      select: { slug: true, title: true },
      orderBy: { title: 'asc' },
    }),
    adminLinkContext(),
    prisma.launchZone.findMany({ select: { slug: true, name: true } }),
  ]);
  const analysis = await analyse(a, 'edit', ctx);
  const f = analysis.figures;
  return {
    article: a,
    cities: zones.map((z) => ({ slug: z.slug, name: z.name })),
    /** Name of the city of the guide when it is not open any more (kept in the editor). */
    closedCity:
      a.city && !zones.some((z) => z.slug === a.city)
        ? { slug: a.city, name: allZones.find((z) => z.slug === a.city)?.name ?? a.city }
        : null,
    others,
    analysis,
    tokens: tokenMenu(
      !!f.city,
      f.universities.map((u) => ({ slug: u.slug, name: u.name })),
    ),
    changed: changedTokens(a.body, a.reviewedValues as Record<string, string> | null, f),
  };
}
