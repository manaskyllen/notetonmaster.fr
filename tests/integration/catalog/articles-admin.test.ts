/** Guides in the admin: the actions of the editor on the real database. */
import { afterAll, describe, expect, it, vi } from 'vitest';

const expired: string[] = [];
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: (tag: string) => void expired.push(tag),
  revalidatePath: (path: string) => void expired.push(`path:${path}`),
}));
let role: 'ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL' = 'DATA_EDITOR';
vi.mock('@/lib/auth/admin', async () => {
  const { can } = await import('@/lib/domain/permissions');
  const { fixtureAdmin } = await import('../fixtures/lookup');
  return {
    guard: async (permission: string, fn: (a: unknown) => unknown) => {
      if (!can(role as never, permission as never))
        return { ok: false, error: 'Action non autorisée pour ce rôle.' };
      const a = await fixtureAdmin();
      return fn({ ...a, role });
    },
  };
});

const { prisma } = await import('@/lib/db');
const {
  createArticle,
  markReviewed,
  previewArticle,
  publishArticle,
  saveArticle,
  unpublishArticle,
} = await import('@/app/admin/(panel)/articles/actions');

const ids: string[] = [];
afterAll(async () => {
  await prisma.articleSlugRedirect.deleteMany({ where: { articleId: { in: ids } } });
  await prisma.article.deleteMany({ where: { id: { in: ids } } });
});

const BODY = `Strasbourg compte {{ville.parcours}} parcours.

## Questions fréquentes

**Combien ?**
{{ville.parcours}}.`;

const base = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: 'Guide de test à Strasbourg',
  slug: 'guide-test-strasbourg',
  city: 'strasbourg',
  theme: 'GUIDE',
  lede: 'Un guide de test.',
  body: BODY,
  metaDescription: 'Une description de test.',
  keyword: 'guide Strasbourg',
  secondaryKeywords: [],
  searchKeywords: ['essai'],
  relatedSlugs: [],
  signature: '',
  ...over,
});

describe('guides in the admin', () => {
  let id = '';

  it('a moderator has no access; an editor creates a draft (audited)', async () => {
    role = 'MODERATOR';
    expect(await createArticle()).toEqual({
      ok: false,
      error: 'Action non autorisée pour ce rôle.',
    });
    role = 'DATA_EDITOR';
    const r = await createArticle();
    expect(r.ok).toBe(true);
    id = (r as { id: string }).id;
    ids.push(id);
    const a = await prisma.article.findUniqueOrThrow({ where: { id } });
    expect(a.status).toBe('DRAFT');
    expect(a.online).toBe(false);
    expect(
      await prisma.auditLog.count({ where: { targetId: id, action: 'a créé le guide' } }),
    ).toBe(1);
  });

  it('saves; the city must be open', async () => {
    expect(await saveArticle(base(id, { city: 'ville-fermee' }))).toEqual({
      ok: false,
      error: 'Choisis une ville ouverte.',
    });
    const r = await saveArticle(base(id));
    expect(r.ok).toBe(true);
    expect((await prisma.article.findUniqueOrThrow({ where: { id } })).searchKeywords).toEqual([
      'essai',
    ]);
  });

  it('a new slug leaves a redirection from the former one (audited)', async () => {
    const r = await saveArticle(base(id, { slug: 'guide-test-strasbourg-2' }));
    expect(r).toMatchObject({ ok: true, slug: 'guide-test-strasbourg-2' });
    const redirect = await prisma.articleSlugRedirect.findUnique({
      where: { slug: 'guide-test-strasbourg' },
    });
    expect(redirect?.articleId).toBe(id);
    // nouveau-guide → guide-test-strasbourg (first save), then → guide-test-strasbourg-2.
    expect(
      await prisma.auditLog.count({
        where: { targetId: id, action: 'a changé l’adresse du guide' },
      }),
    ).toBe(2);
    expect(await prisma.articleSlugRedirect.count({ where: { articleId: id } })).toBe(2);
  });

  it('an unknown token blocks the publication and shows in the preview', async () => {
    await saveArticle(
      base(id, { slug: 'guide-test-strasbourg-2', body: `${BODY}\n\n{{ville.inconnu}}` }),
    );
    const r = await publishArticle(id);
    expect(r.ok).toBe(false);
    expect((r as { blockers: string[] }).blockers).toContain('Jeton inconnu : {{ville.inconnu}}');
    const p = await previewArticle({
      title: 't',
      lede: 'l',
      body: '{{ville.inconnu}}',
      metaDescription: 'm',
      keyword: '',
      city: 'strasbourg',
    });
    expect(p.ok && p.previewHtml).toContain('g-tok--bad');
  });

  it('publishes (audited, figures of reference recorded), unpublishes', async () => {
    await saveArticle(base(id, { slug: 'guide-test-strasbourg-2' }));
    const r = await publishArticle(id);
    expect(r).toMatchObject({ ok: true, message: 'Guide publié.' });
    const a = await prisma.article.findUniqueOrThrow({ where: { id } });
    expect(a).toMatchObject({ online: true, status: 'PUBLISHED' });
    expect(Object.keys(a.reviewedValues as object)).toEqual(['ville.parcours']);
    expect(expired).toContain('articles');
    const u = await unpublishArticle(id);
    expect(u.ok).toBe(true);
    expect(await prisma.article.findUniqueOrThrow({ where: { id } })).toMatchObject({
      online: false,
      status: 'DRAFT',
    });
    const actions = (await prisma.auditLog.findMany({ where: { targetId: id } })).map(
      (l) => l.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['a publié le guide', 'a dépublié le guide']));
  });

  it('schedules on a future date', async () => {
    const at = new Date(Date.now() + 86400_000).toISOString();
    const r = await publishArticle(id, at);
    expect(r.ok).toBe(true);
    expect(await prisma.article.findUniqueOrThrow({ where: { id } })).toMatchObject({
      online: true,
      status: 'SCHEDULED',
    });
  });

  it('« Marquer comme relu » takes the guide out of « À relire »', async () => {
    await prisma.article.update({
      where: { id },
      data: { status: 'TO_REVIEW', reviewedValues: { 'ville.parcours': '999999' } },
    });
    expect((await markReviewed(id)).ok).toBe(true);
    const a = await prisma.article.findUniqueOrThrow({ where: { id } });
    expect(a.status).toBe('SCHEDULED');
    expect((a.reviewedValues as Record<string, string>)['ville.parcours']).not.toBe('999999');
  });
});
