import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

// next/cache outside Next.js: record what the footer asks for.
const cacheCalls: { keys?: string[]; options?: { revalidate?: number; tags?: string[] } }[] = [];
const expired: string[] = [];
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown, keys?: string[], options?: { tags?: string[] }) => {
    cacheCalls.push({ keys, options });
    return fn;
  },
  revalidateTag: (tag: string) => {
    expired.push(tag);
  },
}));

const { prisma } = await import('@/lib/db');
const { footerFigures, formatCount, formatStatsDate, loadFooterStats, programsLabel } =
  await import('@/lib/domain/footer-stats');
const { afterReviewChange } = await import('@/lib/cache/next');

const TAG = `ft-test-${Date.now()}`;
const created = { programs: [] as string[], universities: [] as string[], reviews: [] as string[] };

describe('footer figures (getFooterStats)', () => {
  let publicProgram: { id: string; mentionId: string; universityId: string };
  beforeAll(async () => {
    publicProgram = await programBySlug(FX.programs.illkirch);
  });
  afterAll(async () => {
    await prisma.review.deleteMany({ where: { id: { in: created.reviews } } });
    await prisma.program.deleteMany({ where: { id: { in: created.programs } } });
    await prisma.university.deleteMany({ where: { id: { in: created.universities } } });
  });

  it('counts published programs of public establishments (open cities), never drafts nor private ones', async () => {
    const before = await loadFooterStats();
    const expected = await prisma.program.count({
      where: {
        isPublished: true,
        inOpenZone: true,
        status: { in: ['ACTIVE', 'NOT_RENEWED'] },
        university: { sector: 'PUBLIC', isPublished: true },
        mention: { isPublished: true },
      },
    });
    expect(before.programs).toBe(expected);

    // A university whose only program is a draft is not counted, nor is a private one.
    const draftUni = await prisma.university.create({
      data: {
        name: `Université brouillon ${TAG}`,
        slug: `u-draft-${TAG}`,
        city: 'Nulle part',
        region: 'Test',
        sector: 'PUBLIC',
      },
    });
    const privateUni = await prisma.university.create({
      data: {
        name: `Institut privé ${TAG}`,
        slug: `u-private-${TAG}`,
        city: 'Ailleurs',
        region: 'Test',
        sector: 'PRIVATE',
      },
    });
    created.universities.push(draftUni.id, privateUni.id);
    const base = { mentionId: publicProgram.mentionId, city: 'Test', isPublished: true };
    for (const [slug, universityId, status] of [
      [`p-draft-${TAG}`, draftUni.id, 'DRAFT'],
      [`p-draft2-${TAG}`, publicProgram.universityId, 'DRAFT'],
      [`p-private-${TAG}`, privateUni.id, 'ACTIVE'],
    ] as const) {
      const p = await prisma.program.create({
        data: { ...base, title: slug, slug, universityId, status },
      });
      created.programs.push(p.id);
    }
    const after = await loadFooterStats();
    expect(after.programs).toBe(before.programs);
    expect(after.universities).toBe(before.universities);
    expect(after.mentions).toBe(before.mentions);
  });

  it('counts published reviews of the open cities only, demo reviews only outside production', async () => {
    const before = await loadFooterStats({ includeDemo: true });
    expect(before.reviews).toBe(
      await prisma.review.count({ where: { status: 'PUBLISHED', program: { inOpenZone: true } } }),
    );
    const r = await prisma.review.create({
      data: {
        ref: `T${Date.now().toString(36).toUpperCase()}`,
        programId: publicProgram.id,
        authorEmailHash: `test:${TAG}`,
        level: 'M2',
        cohortYear: 2025,
        overallRating: 4,
        pros: 'Un avis de test, pas encore relu par la modération.',
        cons: 'Rien à signaler pour ce test automatique du pied de page.',
        status: 'PENDING',
      },
    });
    created.reviews.push(r.id);
    expect((await loadFooterStats({ includeDemo: true })).reviews).toBe(before.reviews);
    await prisma.review.update({
      where: { id: r.id },
      data: { status: 'PUBLISHED', isDemo: true },
    });
    expect((await loadFooterStats({ includeDemo: true })).reviews).toBe(before.reviews + 1);
    expect((await loadFooterStats({ includeDemo: false })).reviews).toBe(
      await prisma.review.count({
        where: { status: 'PUBLISHED', isDemo: false, program: { inOpenZone: true } },
      }),
    );
  });

  it('dates the base with the last successful APPLY run', async () => {
    const run = await prisma.syncRun.findFirst({
      where: { status: 'SUCCEEDED', mode: 'APPLY', finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
    });
    expect((await loadFooterStats()).updatedAt).toBe(run?.finishedAt?.toISOString() ?? null);
  });
});

describe('footer figures: formatting', () => {
  it('formats numbers the French way and dates as « 12 nov. 2026 »', () => {
    expect(formatCount(7746)).toMatch(/^7\s746$/u);
    expect(formatCount(115)).toBe('115');
    expect(formatStatsDate('2026-11-12T10:00:00.000Z')).toBe('12 nov. 2026');
  });
  it('writes « avis publié » in the singular for 0 and 1', () => {
    const f = (reviews: number) =>
      footerFigures({
        programs: 7746,
        universities: 115,
        mentions: 326,
        reviews,
        cities: [],
        updatedAt: null,
      });
    expect(f(0)[3]).toMatchObject({ text: '0', label: 'avis publié', aria: '0 avis publié' });
    expect(f(1)[3]!.label).toBe('avis publié');
    expect(f(2)[3]!.label).toBe('avis publiés');
    expect(f(0)[0]!.aria).toMatch(/^7\s746 parcours de master référencés$/u);
  });
  it('names the open cities in the first label, « dans n villes » beyond three', () => {
    expect(programsLabel(['Strasbourg', 'Mulhouse', 'Nantes'])).toBe(
      'parcours de master à Strasbourg, Mulhouse et Nantes',
    );
    expect(programsLabel(['Strasbourg', 'Mulhouse', 'Nantes', 'Lyon'])).toBe(
      'parcours de master dans 4 villes',
    );
    expect(programsLabel(['Nantes'])).toBe('parcours de master à Nantes');
  });
});

describe('footer figures: cache', () => {
  it('is cached one hour under the footer-stats tag', () => {
    const call = cacheCalls.find((c) => c.keys?.includes('footer-stats'));
    expect(call?.options).toMatchObject({
      revalidate: 3600,
      tags: ['footer-stats', 'launch-zones'],
    });
  });
  it('expires the tag when a review is published or removed', async () => {
    expired.length = 0;
    await afterReviewChange(['abc']);
    expect(expired).toEqual(expect.arrayContaining(['footer-stats', 'catalog', 'program:abc']));
  });
});
