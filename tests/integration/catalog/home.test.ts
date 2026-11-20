/**
 * Home: the domain of the mentions (bug « Sciences humaines et sociales : Bientôt »), the counts
 * of the tiles and of the button (the same as /mentions and the Explorer), the suggestions, the
 * latest reviews.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);

const { Prisma } = await import('@/lib/db/generated/client');
const { prisma } = await import('@/lib/db');
const { browsePrograms } = await import('@/lib/catalog/browse');
const { EMPTY_FILTERS } = await import('@/lib/catalog/filters');
const { mentionIndex } = await import('@/lib/catalog/indexes');
const { fillMentionDomains, mentionDomainIssues } = await import('@/lib/data/mention-domains');
const { disciplineDomainSql, domainOfDiscipline } = await import('@/lib/domain/discipline-domain');
const { domainMentionCounts, homeCounts, homeReviews, REVIEWS_MIN } =
  await import('@/lib/home/data');
const { NO_QUICK, quickMask } = await import('@/lib/home/labels');
const { suggest, suggestCount } = await import('@/lib/home/suggest');
const f = await import('../fixtures/factories');

afterAll(() => prisma.$disconnect());

const LABELS = [
  'Sc. fondamentales et appliquées (dont S.T.A.P.S.)',
  'Sc. fondamentales et appliquées (dont STAPS)',
  'Lettres, langues, art',
  'Droit et sc. politiques',
  'Economie, gestion et A.E.S.',
  'Economie, gestion et AES',
  'S.H.S.',
  'SHS',
  'M.E.E.F.',
  'MEEF',
];

describe('domain of the mentions', () => {
  it('the SQL rule (search index, backfill) agrees with the importer on every label', async () => {
    const rows = await prisma.$queryRaw<{ label: string; slug: string | null }[]>`
      SELECT label, ${Prisma.raw(disciplineDomainSql('label'))} AS slug
        FROM unnest(${LABELS}::text[]) AS label`;
    for (const r of rows) expect(r.slug, r.label).toBe(domainOfDiscipline(r.label));
  });

  it('a mention without a domain gets the one of most of its parcours; a domain set stays', async () => {
    const uni = await prisma.university.findFirstOrThrow({ select: { id: true } });
    const shs = await prisma.domain.findUniqueOrThrow({
      where: { slug: 'sciences-humaines-et-sociales' },
    });
    const deg = await prisma.domain.findUniqueOrThrow({
      where: { slug: 'droit-economie-gestion' },
    });
    const empty = await prisma.mention.create({
      data: { slug: 'it-home-sans-domaine', name: 'Sans domaine', levels: ['M1', 'M2'] },
    });
    const set = await prisma.mention.create({
      data: {
        slug: 'it-home-avec-domaine',
        name: 'Avec domaine',
        levels: ['M1'],
        domainId: deg.id,
      },
    });
    const stat = async (mentionId: string, slug: string, disci: string) => {
      const p = await f.program({
        slug,
        title: slug,
        mentionId,
        universityId: uni.id,
        city: 'Nantes',
      });
      await prisma.admissionStat.create({
        data: { programId: p.id, session: 2025, source: 'test', raw: { disci_master: disci } },
      });
      return p.id;
    };
    const ids = [
      await stat(empty.id, 'it-home-p1', 'S.H.S.'),
      await stat(empty.id, 'it-home-p2', 'M.E.E.F.'),
      await stat(empty.id, 'it-home-p3', 'Droit et sc. politiques'),
      await stat(set.id, 'it-home-p4', 'S.H.S.'),
    ];
    try {
      await fillMentionDomains();
      expect((await prisma.mention.findUniqueOrThrow({ where: { id: empty.id } })).domainId).toBe(
        shs.id,
      );
      expect((await prisma.mention.findUniqueOrThrow({ where: { id: set.id } })).domainId).toBe(
        deg.id,
      );
    } finally {
      await prisma.program.deleteMany({ where: { id: { in: ids } } });
      await prisma.mention.deleteMany({ where: { id: { in: [empty.id, set.id] } } });
    }
  });

  it('admin: a published mention without a domain, or another one than its parcours, is reported', async () => {
    expect(await mentionDomainIssues()).toEqual([]);
    const [row] = await prisma.$queryRaw<{ id: string; domainId: string | null; listed: string }[]>`
      SELECT m.id, m."domainId", min(i."domainSlug") AS listed
        FROM "Mention" m JOIN "ProgramSearchIndex" i ON i."mentionId" = m.id
       WHERE i."isPublicSector" GROUP BY m.id ORDER BY m.id LIMIT 1`;
    await prisma.mention.update({ where: { id: row!.id }, data: { domainId: null } });
    try {
      const issues = await mentionDomainIssues();
      expect(issues.map((i) => i.id)).toEqual([row!.id]);
      expect(issues[0]!.stored).toBeNull();
      expect(issues[0]!.listed).toBe(row!.listed);
    } finally {
      await prisma.mention.update({ where: { id: row!.id }, data: { domainId: row!.domainId } });
    }
  });
});

describe('counts of the home', () => {
  it('tiles: mentions per domain and city, as /mentions lists them', async () => {
    const { entries, zones } = await mentionIndex();
    const counts = domainMentionCounts(entries);
    for (const [domain, c] of Object.entries(counts)) {
      expect(c['']).toBe(entries.filter((e) => e.domain === domain).length);
      for (const z of zones)
        expect(c[z.slug] ?? 0, `${domain} · ${z.slug}`).toBe(
          entries.filter((e) => e.domain === domain && e.zones.includes(z.slug)).length,
        );
    }
    // every domain of the seed has a published mention: none says « Bientôt »
    expect(Object.keys(counts).length).toBeGreaterThan(0);
  });

  it('button, empty query: the count table equals the Explorer for every city and filter', async () => {
    const table = await homeCounts();
    const zones = (await prisma.launchZone.findMany({ where: { open: true } })).map((z) => z.slug);
    const total = async (lieu: string | null, q: typeof NO_QUICK) =>
      (
        await browsePrograms(
          {
            ...EMPTY_FILTERS,
            lieux: lieu ? [`zone:${lieu}`] : [],
            modalites: q.alt ? ['alternance'] : [],
            avis: q.avis ? ['avec'] : [],
            entrees: q.m1 ? ['M1'] : [],
          },
          {},
          { offset: 0, limit: 1 },
        )
      ).total;
    for (const lieu of [null, ...zones])
      for (const q of [NO_QUICK, { ...NO_QUICK, m1: true }, { alt: true, avis: true, m1: false }])
        expect(table[lieu ?? '']?.[quickMask(q)] ?? 0, `${lieu} ${JSON.stringify(q)}`).toBe(
          await total(lieu, q),
        );
  });
});

describe('suggestions', () => {
  it('the count is the Explorer total for the same search', async () => {
    for (const city of [null, 'nantes']) {
      const a = await suggest({ q: 'patrimoine', city, quick: NO_QUICK });
      const b = await browsePrograms(
        { ...EMPTY_FILTERS, q: 'patrimoine', lieux: city ? [`zone:${city}`] : [] },
        {},
        { offset: 0, limit: 1 },
      );
      expect(a.count).toBe(b.total);
      expect(await suggestCount({ q: 'patrimoine', city, quick: NO_QUICK })).toBe(b.total);
      expect(a.programs.length).toBeLessThanOrEqual(4);
    }
  });

  it('an RNCP number: the parcours found by it says so', async () => {
    const a = await suggest({ q: 'RNCP42684', city: null, quick: NO_QUICK });
    const vnp = a.programs.find((p) => p.slug === 'valorisation-des-nouveaux-patrimoines');
    expect(vnp?.code).toBe('RNCP · RNCP42684');
  });

  it('disciplines: their domain and their parcours in the city, at most 3', async () => {
    const a = await suggest({ q: 'patrimoine', city: null, quick: NO_QUICK });
    expect(a.mentions.length).toBeGreaterThan(0);
    expect(a.mentions.length).toBeLessThanOrEqual(3);
    for (const m of a.mentions) {
      expect(m.n).toBeGreaterThan(0);
      expect(m.domain).not.toBeNull();
    }
  });

  it('a city not open yet: said, rather than an empty list', async () => {
    const z = await prisma.launchZone.create({
      data: {
        slug: 'it-home-pasencore',
        name: 'Pasencoreville',
        epciCode: '999999999',
        epciName: 'CA de Pasencoreville',
        communeCodes: [],
        open: false,
      },
    });
    try {
      const a = await suggest({ q: 'Pasencoreville', city: null, quick: NO_QUICK });
      expect(a.notYet).toEqual({ place: 'Pasencoreville' });
      expect(a.count).toBe(0);
    } finally {
      await prisma.launchZone.delete({ where: { id: z.id } });
    }
  });
});

describe('latest reviews', () => {
  it('from 3 published: three, one per parcours, dated to the month only', async () => {
    const r = await homeReviews();
    expect(r.total).toBeGreaterThanOrEqual(REVIEWS_MIN);
    expect(r.items).toHaveLength(3);
    expect(new Set(r.items.map((i) => i.programSlug)).size).toBe(3);
    for (const i of r.items) {
      expect(new Date(i.month).getUTCDate()).toBe(1);
      expect(new Date(i.month).getUTCHours()).toBe(0);
      expect(i.text.length).toBeLessThanOrEqual(220);
    }
  });

  it('production: demo reviews are left out, as in the footer', async () => {
    const real = await prisma.review.count({
      where: { status: 'PUBLISHED', isDemo: false, program: { inOpenZone: true } },
    });
    const all = await prisma.review.count({
      where: { status: 'PUBLISHED', program: { inOpenZone: true } },
    });
    expect((await homeReviews(false)).total).toBeLessThanOrEqual(real);
    expect((await homeReviews(true)).total).toBeLessThanOrEqual(all);
    expect((await homeReviews(true)).total).toBeGreaterThanOrEqual(
      (await homeReviews(false)).total,
    );
  });

  it('under 3 published reviews: no excerpt at all', async () => {
    const kept = await prisma.review.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const hide = kept.slice(2).map((r) => r.id);
    await prisma.review.updateMany({ where: { id: { in: hide } }, data: { status: 'HIDDEN' } });
    try {
      const r = await homeReviews();
      expect(r.total).toBeLessThan(REVIEWS_MIN);
      expect(r.items).toEqual([]);
    } finally {
      await prisma.review.updateMany({
        where: { id: { in: hide } },
        data: { status: 'PUBLISHED' },
      });
    }
  });
});
