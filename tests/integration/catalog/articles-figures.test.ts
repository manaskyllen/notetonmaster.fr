/**
 * Figures of the guides on the real database: computed from the search index of an open city,
 * cached in ArticleFigures, a guide sent to « À relire » when a quoted figure changes after a
 * sync, and taken offline when its city closes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { prisma } = await import('@/lib/db');
const { closeCityArticles, computeFigures, loadFigures, refreshArticleFigures } =
  await import('@/lib/articles/figures.server');
const { resolveToken, tokenValues } = await import('@/lib/articles/tokens');

const SLUG = 'test-chiffres-strasbourg';
const BODY =
  'Strasbourg compte {{ville.parcours}} parcours, dont {{ville.alternance}} en alternance.';

beforeAll(async () => {
  await prisma.article.deleteMany({ where: { slug: SLUG } });
});
afterAll(async () => {
  await prisma.article.deleteMany({ where: { slug: SLUG } });
});

describe('figures of a city', () => {
  it('counts the public parcours of the open city, like the city page', async () => {
    const f = await computeFigures('ville:strasbourg');
    const [page] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "ProgramSearchIndex"
       WHERE 'strasbourg' = ANY("zoneSlugs") AND "isPublicSector"`;
    expect(f.city?.name).toBe('Strasbourg');
    expect(f.rows.length).toBe(page!.n);
    expect(f.rows.length).toBeGreaterThan(0);
    expect(resolveToken('ville.parcours', f)?.raw).toBe(String(page!.n));
    expect(resolveToken('session', f)?.raw).toMatch(/^20\d\d$/);
  });

  it('a city that is not open has no figures: its tokens are unknown', async () => {
    const f = await computeFigures('ville:nulle-part');
    expect(f.city).toBeNull();
    expect(f.rows).toEqual([]);
    expect(resolveToken('ville.parcours', f)).toBeNull();
  });

  it('cached per scope, recomputed by refreshArticleFigures', async () => {
    await refreshArticleFigures();
    const row = await prisma.articleFigures.findUnique({ where: { scope: 'ville:strasbourg' } });
    expect(row).not.toBeNull();
    expect((await loadFigures('toutes')).site.programs).toBeGreaterThan(0);
  });
});

describe('« À relire » after a sync', () => {
  it('a quoted figure that changed sends the guide to review; it stays online', async () => {
    const f = await computeFigures('ville:strasbourg');
    const values = tokenValues(BODY, f);
    const a = await prisma.article.create({
      data: {
        title: 'Test chiffres',
        slug: SLUG,
        city: 'strasbourg',
        body: BODY,
        status: 'PUBLISHED',
        online: true,
        publishedAt: new Date('2026-01-01'),
        reviewedAt: new Date(),
        reviewedValues: values,
      },
    });
    // Same figures: nothing changes.
    let r = await refreshArticleFigures({ review: true });
    expect(r.toReview).not.toContain(a.id);
    // The figures of the last review were different (a sync changed them since).
    await prisma.article.update({
      where: { id: a.id },
      data: { reviewedValues: { ...values, 'ville.parcours': '999999' } },
    });
    r = await refreshArticleFigures({ review: true });
    expect(r.toReview).toContain(a.id);
    const after = await prisma.article.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.status).toBe('TO_REVIEW');
    expect(after.online).toBe(true);
    const log = await prisma.auditLog.findFirst({
      where: { targetId: a.id, category: 'ARTICLES' },
      orderBy: { at: 'desc' },
    });
    expect(log?.action).toContain('À relire');
  });

  it('its city closed: offline and to review', async () => {
    await prisma.article.update({
      where: { slug: SLUG },
      data: { status: 'PUBLISHED', online: true },
    });
    const ids = await closeCityArticles(['strasbourg']);
    const a = await prisma.article.findUniqueOrThrow({ where: { slug: SLUG } });
    expect(ids).toContain(a.id);
    expect(a.online).toBe(false);
    expect(a.status).toBe('TO_REVIEW');
  });
});
