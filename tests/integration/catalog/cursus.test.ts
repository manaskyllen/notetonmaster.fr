import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  attachFiche,
  mergeGroup,
  planCursus,
  recomputeCursusLabels,
  revertRun,
  setCursusLabel,
  splitCursus,
} from '@/lib/catalog/cursus';
import { mention, program, university } from '../fixtures/factories';

/**
 * Cursus of one parcours (issue #21): the journaled grouping, its exact way back, and the
 * corrections of the admin. On fiches of their own establishment, so that no other test sees them.
 */
const TITLE =
  'Projets de coopération (tronc commun menant vers les M2 : « Coopération » et « Intelligence collective »)';
const CURSUS = [
  {
    code: 'IT21SXB00001',
    slug: 'it21-sxb',
    capacity: 30,
    apps: 338,
    offers: 59,
    lieux: 'Faculté des Langues - STRASBOURG (67)',
  },
  {
    code: 'IT21KEHL0001',
    slug: 'it21-kehl',
    capacity: 10,
    apps: 53,
    offers: 26,
    lieux: 'Faculté des Langues - STRASBOURG (67)|Hochschule - KEHL',
  },
  {
    code: 'IT21PASSAU01',
    slug: 'it21-passau',
    capacity: 2,
    apps: 42,
    offers: 2,
    lieux: 'Faculté des Langues - STRASBOURG (67)|Universität Passau - PASSAU',
  },
];
const ids: Record<string, string> = {};
let studentId = '';
let qrId = '';

const snapshot = async () => ({
  programs: await prisma.program.findMany({
    where: { id: { in: Object.values(ids) } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      isPublished: true,
      mergedIntoId: true,
    },
    orderBy: { id: 'asc' },
  }),
  entries: await prisma.monMasterEntry.findMany({
    where: { code: { in: CURSUS.map((c) => c.code) } },
    select: { code: true, programId: true, homeProgramId: true },
    orderBy: { code: 'asc' },
  }),
  reviews: await prisma.review.findMany({
    where: { ref: { startsWith: 'avis-it21' } },
    select: { programId: true },
  }),
  favorites: await prisma.favorite.findMany({
    where: { studentId },
    select: { programId: true },
    orderBy: { programId: 'asc' },
  }),
  redirects: await prisma.programSlugRedirect.findMany({
    where: { slug: { startsWith: 'it21' } },
    orderBy: { slug: 'asc' },
  }),
  qr: (await prisma.qrLink.findUniqueOrThrow({ where: { id: qrId } })).targetPath,
});

beforeAll(async () => {
  const uni = await university({
    slug: 'it21-universite',
    name: 'Université des cursus',
    city: 'Strasbourg',
    region: 'Grand Est',
  });
  const m = await mention({
    slug: 'it21-lea',
    name: 'Langues étrangères appliquées (cursus)',
    domainSlug: 'arts-lettres-langues',
  });
  for (const c of CURSUS) {
    const p = await program({
      slug: c.slug,
      title: TITLE,
      mentionId: m.id,
      universityId: uni.id,
      city: 'Strasbourg',
    });
    ids[c.slug] = p.id;
    const e = await prisma.monMasterEntry.create({
      data: {
        code: c.code,
        programId: p.id,
        inmp: 'IT21-03Y',
        label: TITLE,
        places: c.lieux,
        workStudy: false,
        firstSession: 2025,
        lastSession: 2025,
      },
    });
    await prisma.admissionStat.create({
      data: {
        programId: p.id,
        monMasterEntryId: e.id,
        session: 2025,
        source: 'Mon Master · données ouvertes',
        capacity: c.capacity,
        applications: c.apps,
        offers: c.offers,
      },
    });
  }
  const student = await prisma.student.create({
    data: { emailHash: 'it21-student', emailEnc: 'x' },
  });
  studentId = student.id;
  // Follows two cursus: one follow survives the grouping, the oldest.
  await prisma.favorite.create({
    data: { studentId, programId: ids['it21-kehl']!, createdAt: new Date('2026-01-01') },
  });
  await prisma.favorite.create({
    data: { studentId, programId: ids['it21-sxb']!, createdAt: new Date('2026-06-01') },
  });
  await prisma.review.create({
    data: {
      ref: 'avis-it21-0001',
      programId: ids['it21-kehl']!,
      authorEmailHash: 'it21-author',
      level: 'M2',
      cohortYear: 2025,
      overallRating: 4,
      pros: 'Une très bonne équipe pédagogique.',
      cons: 'Un emploi du temps chargé.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      submittedAt: new Date(),
    },
  });
  qrId = (
    await prisma.qrLink.create({
      data: { slug: 'it21-qr', label: 'Kehl', targetPath: '/avis/nouveau?parcours=it21-kehl' },
    })
  ).id;
});

afterAll(() => prisma.$disconnect());

describe('cursus grouping', () => {
  it('plans the three numbers as one parcours, the largest kept', async () => {
    const { groups } = await planCursus();
    const g = groups.find((x) => x.memberIds.includes(ids['it21-sxb']!));
    expect(g?.memberIds.sort()).toEqual(Object.values(ids).sort());
    expect(g?.keeperId).toBe(ids['it21-sxb']);
  });

  it('merges, labels by place, and is undone exactly', async () => {
    const before = await snapshot();
    const run = { runId: 'test:it21' };
    const slug = await mergeGroup(run, {
      keeperId: ids['it21-sxb']!,
      memberIds: Object.values(ids),
    });
    expect(slug).toBe('projets-de-cooperation-universite-des-cursus');
    await recomputeCursusLabels([ids['it21-sxb']!]);

    const after = await snapshot();
    expect(after.programs.find((p) => p.id === ids['it21-kehl'])).toMatchObject({
      status: 'MERGED',
      isPublished: false,
      mergedIntoId: ids['it21-sxb'],
    });
    expect(after.entries.every((e) => e.programId === ids['it21-sxb'])).toBe(true);
    expect(after.reviews.map((r) => r.programId)).toEqual([ids['it21-sxb']]);
    expect(after.favorites).toEqual([{ programId: ids['it21-sxb'] }]);
    expect(after.redirects.map((r) => [r.slug, r.programId])).toEqual([
      ['it21-kehl', ids['it21-sxb']],
      ['it21-passau', ids['it21-sxb']],
      ['it21-sxb', ids['it21-sxb']],
    ]);
    expect(after.qr).toBe(`/avis/nouveau?parcours=${slug}`);
    const labels = await prisma.monMasterEntry.findMany({
      where: { code: { in: CURSUS.map((c) => c.code) } },
      orderBy: { code: 'asc' },
    });
    expect(Object.fromEntries(labels.map((l) => [l.code, l.cursusLabel]))).toEqual({
      IT21KEHL0001: 'Kehl',
      IT21PASSAU01: 'Passau',
      IT21SXB00001: 'Strasbourg',
    });

    await revertRun(run.runId);
    expect(await snapshot()).toEqual(before);
  });

  it('a split stays split, a label typed by hand stays, an attachment holds', async () => {
    const run = { runId: 'test:it21-b' };
    await mergeGroup(run, { keeperId: ids['it21-sxb']!, memberIds: Object.values(ids) });

    const split = await splitCursus('IT21KEHL0001', null);
    expect(split.ok).toBe(true);
    const kehl = await prisma.program.findUniqueOrThrow({ where: { id: ids['it21-kehl'] } });
    expect(kehl).toMatchObject({
      status: 'ACTIVE',
      isPublished: true,
      slug: 'it21-kehl',
      mergedIntoId: null,
    });
    expect(
      await prisma.programSlugRedirect.findUnique({ where: { slug: 'it21-kehl' } }),
    ).toBeNull();
    // its review of the time goes back with it
    expect(
      (await prisma.review.findFirstOrThrow({ where: { ref: 'avis-it21-0001' } })).programId,
    ).toBe(ids['it21-kehl']);
    // the next grouping leaves it apart
    const { groups } = await planCursus();
    expect(groups.some((g) => g.memberIds.includes(ids['it21-kehl']!))).toBe(false);

    // the native cursus cannot be split
    expect((await splitCursus('IT21SXB00001', null)).ok).toBe(false);

    await setCursusLabel('IT21PASSAU01', 'Franco-allemand', 'M2 franco-allemand', null);
    await recomputeCursusLabels();
    expect(
      (await prisma.monMasterEntry.findUniqueOrThrow({ where: { code: 'IT21PASSAU01' } }))
        .cursusLabel,
    ).toBe('Franco-allemand');

    const attached = await attachFiche(ids['it21-kehl']!, ids['it21-sxb']!, null);
    expect(attached.ok).toBe(true);
    expect(
      (await prisma.program.findUniqueOrThrow({ where: { id: ids['it21-kehl'] } })).status,
    ).toBe('MERGED');
    expect(
      await prisma.cursusOverride.findUniqueOrThrow({ where: { code: 'IT21KEHL0001' } }),
    ).toMatchObject({ split: false, attachToId: ids['it21-sxb'] });
    const again = await planCursus();
    expect(again.groups.some((g) => g.memberIds.includes(ids['it21-kehl']!))).toBe(false);
  });
});
