/** Launch limited to some cities. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Next.js outside a request: the cache is a pass-through, the tags and paths are recorded.
const expired: string[] = [];
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: (tag: string) => void expired.push(tag),
  revalidatePath: (path: string) => void expired.push(`path:${path}`),
}));
// The admin of the action: an Admin, or another role (the guard is the real rule, `can`).
let role: 'ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL' = 'ADMIN';
let actor = { id: '', name: 'Test villes ouvertes', email: '', role: 'ADMIN' as string };
vi.mock('@/lib/auth/admin', async () => {
  const { can } = await import('@/lib/domain/permissions');
  const mod = {
    // Re-authentication is tested apart (tests/integration/security/admin-auth.test.ts).
    guardSensitive: (...a: unknown[]) =>
      (mod as { guard: (...x: unknown[]) => unknown }).guard(...a),
    guard: async (permission: string, fn: (a: typeof actor) => unknown) =>
      can(role as never, permission as never)
        ? fn({ ...actor, role })
        : { ok: false, error: 'Ton rôle ne donne pas accès à cette action.' },
  };
  return mod;
});

const { prisma } = await import('@/lib/db');
const { FX } = await import('../fixtures/ids');
const { fixtureAdmin, mentionBySlug, programBySlug } = await import('../fixtures/lookup');
const { orderZones, parseLieux, refreshOpenZoneFlags, teachingSites, zonesLabel } =
  await import('@/lib/launch/zones');
const { applyZoneStates } = await import('@/lib/launch/admin');
const { saveZones } = await import('@/app/admin/(panel)/parametres/villes-actions');
const { loadFooterStats, programsLabel } = await import('@/lib/domain/footer-stats');
const { getMention } = await import('@/lib/queries/catalog');
const { sitemapEntries, SITEMAPS } = await import('@/lib/seo/sitemap');
const sitemap = async () =>
  (await Promise.all(SITEMAPS.map((n) => sitemapEntries(n))))
    .flat()
    .map((e) => ({ url: `http://x${e.path}` }));

const TEST = { slug: 'test-colmar', epciCode: '246800726' };

describe('sites of a parcours (Mon Master « lieux »)', () => {
  it('reads « site - COMMUNE (dép.) », cedex removed, entries split on | and ,', () => {
    expect(
      parseLieux(
        'UFR Sciences et Techniques - SAINT-NAZAIRE (44),Nantes Université - NANTES CEDEX 3 (44)',
      ),
    ).toEqual([
      { site: 'UFR Sciences et Techniques', city: 'SAINT-NAZAIRE', dep: '44' },
      { site: 'Nantes Université', city: 'NANTES', dep: '44' },
    ]);
    expect(parseLieux('IPAG - NANTES')).toEqual([{ site: 'IPAG', city: 'NANTES', dep: null }]);
  });

  it('the establishment itself (its head office) is not a site when a real one is given', () => {
    const lieux = 'UFR Sciences et Techniques - SAINT-NAZAIRE (44)|Nantes Université - NANTES (44)';
    expect(teachingSites(lieux, ['Nantes Université'])).toEqual([
      { city: 'SAINT-NAZAIRE', dep: '44' },
    ]);
    // a real multi-site parcours: Nantes and Saint-Nazaire
    expect(
      teachingSites('Faculté de droit - NANTES (44)|IUT de Saint-Nazaire - SAINT-NAZAIRE (44)', [
        'Nantes Université',
      ]),
    ).toHaveLength(2);
    // only the head office: it stays the site
    expect(teachingSites('Nantes Université - NANTES (44)', ['Nantes Université'])).toEqual([
      { city: 'NANTES', dep: '44' },
    ]);
  });
});

describe('who is published', () => {
  it('Illkirch-Graffenstaden (Eurométropole) is published, Colmar alone is not', async () => {
    const illkirch = await programBySlug(FX.programs.illkirch);
    const colmar = await programBySlug(FX.programs.colmar);
    expect(illkirch.siteCommunes).toEqual([FX.insee.illkirch]);
    expect(colmar.siteCommunes).toEqual([FX.insee.colmar]);
    expect(illkirch?.inOpenZone).toBe(true);
    expect(colmar?.inOpenZone).toBe(false);
  });

  it('a parcours taught in Nantes and Saint-Nazaire is published; Saint-Nazaire alone is not', async () => {
    const p = await programBySlug(FX.programs.saintNazaire);
    expect(p.siteCommunes).toEqual([FX.insee.saintNazaire]);
    expect(p.inOpenZone).toBe(false);
    try {
      await prisma.program.update({
        where: { id: p.id },
        data: { siteCommunes: ['44109', '44184'] },
      });
      await refreshOpenZoneFlags([p.id]);
      expect((await prisma.program.findUniqueOrThrow({ where: { id: p.id } })).inOpenZone).toBe(
        true,
      );
    } finally {
      await prisma.program.update({ where: { id: p.id }, data: { siteCommunes: p.siteCommunes } });
      await refreshOpenZoneFlags([p.id]);
    }
  });

  it('the sitemap lists no parcours, mention or university outside the open cities', async () => {
    const urls = (await sitemap()).map((u) => new URL(u.url).pathname);
    const hidden = await prisma.program.findMany({
      where: { isPublished: true, inOpenZone: false },
      select: { slug: true },
      take: 200,
    });
    const set = new Set(urls);
    for (const h of hidden) expect(set.has(`/parcours/${h.slug}`), h.slug).toBe(false);
    const listed = await prisma.programSearchIndex.findMany({
      where: { isPublicSector: true },
      select: { slug: true },
    });
    for (const l of listed.slice(0, 50)) expect(set.has(`/parcours/${l.slug}`)).toBe(true);
  });

  it('a mention whose parcours are all outside the open cities has no public page', async () => {
    const m = await mentionBySlug(FX.mentions.saintNazaire);
    expect(
      await prisma.program.count({
        where: { mentionId: m.id, isPublished: true, inOpenZone: true },
      }),
    ).toBe(0);
    expect(await getMention(m.slug)).toBeNull();
    expect(await getMention('droit')).not.toBeNull();
  });
});

describe('opening and closing a city', () => {
  let colmarCodes: string[] = [];
  beforeAll(async () => {
    const admin = await fixtureAdmin();
    actor = { ...actor, id: admin.id, email: admin.email };
    colmarCodes = ['68066'];
    await prisma.launchZone.deleteMany({ where: { slug: TEST.slug } });
    await prisma.launchZone.create({
      data: {
        slug: TEST.slug,
        name: 'Colmar',
        epciCode: TEST.epciCode,
        epciName: 'Colmar Agglomération (test)',
        communeCodes: colmarCodes,
        open: false,
        order: 99,
      },
    });
  });
  afterAll(async () => {
    await applyZoneStates([{ slug: TEST.slug, open: false }], null);
    await prisma.launchZone.deleteMany({ where: { slug: TEST.slug } });
    await prisma.$disconnect();
  });

  it('a role other than Admin cannot open or close a city (checked in the action)', async () => {
    for (const r of ['MODERATOR', 'DATA_EDITOR', 'LEGAL'] as const) {
      role = r;
      expect(await saveZones([{ slug: TEST.slug, open: true }])).toMatchObject({ ok: false });
    }
    role = 'ADMIN';
    expect((await prisma.launchZone.findUniqueOrThrow({ where: { slug: TEST.slug } })).open).toBe(
      false,
    );
  });

  it('opening publishes its parcours (index, footer « dans 4 villes »), closing hides them, reviews kept; two audit entries', async () => {
    const before = await loadFooterStats({ includeDemo: true });
    expect(before.cities).toEqual(['Strasbourg', 'Mulhouse', 'Nantes']);
    expect(programsLabel(before.cities)).toBe(
      'parcours de master à Strasbourg, Mulhouse et Nantes',
    );
    const reviews = await prisma.review.count();
    const colmar = await programBySlug(FX.programs.colmar);
    expect(colmar).toMatchObject({ isPublished: true, status: 'ACTIVE', inOpenZone: false });
    const auditBefore = await prisma.auditLog.count({
      where: { targetLabel: 'Villes ouvertes · Colmar' },
    });

    expired.length = 0;
    expect(await saveZones([{ slug: TEST.slug, open: true }])).toMatchObject({ ok: true });
    expect(expired).toEqual(
      expect.arrayContaining(['catalog', 'footer-stats', 'launch-zones', 'path:/sitemap.xml']),
    );
    const opened = await loadFooterStats({ includeDemo: true });
    expect(opened.cities).toHaveLength(4);
    expect(programsLabel(opened.cities)).toBe('parcours de master dans 4 villes');
    expect(opened.programs).toBeGreaterThan(before.programs);
    expect(
      await prisma.programSearchIndex.count({ where: { zoneSlugs: { has: TEST.slug } } }),
    ).toBeGreaterThan(0);

    expect(await saveZones([{ slug: TEST.slug, open: false }])).toMatchObject({ ok: true });
    const closed = await loadFooterStats({ includeDemo: true });
    expect(closed.programs).toBe(before.programs);
    expect(closed.cities).toEqual(before.cities);
    expect(
      await prisma.programSearchIndex.count({ where: { zoneSlugs: { has: TEST.slug } } }),
    ).toBe(0);
    // nothing is deleted
    expect(await prisma.review.count()).toBe(reviews);
    const entries = await prisma.auditLog.findMany({
      where: { targetLabel: 'Villes ouvertes · Colmar' },
      orderBy: { at: 'asc' },
      skip: auditBefore,
    });
    expect(entries.map((e) => e.detail)).toEqual([
      'Avant : fermée · Après : ouverte',
      'Avant : ouverte · Après : fermée (avis gardés, masqués)',
    ]);
  });

  it('shows the cities with at least one master, the most furnished first', () => {
    const z = (name: string, programs: number) => ({ name, programs });
    expect(
      orderZones([
        z('Strasbourg', 240),
        z('Mulhouse', 34),
        z('Sarrebourg', 0),
        z('Nantes', 157),
        z('Rennes', 157),
      ]).map((x) => x.name),
    ).toEqual(['Strasbourg', 'Nantes', 'Rennes', 'Mulhouse']);
  });

  it('labels the open cities', () => {
    expect(zonesLabel(['Strasbourg', 'Mulhouse', 'Nantes'])).toBe('Strasbourg, Mulhouse et Nantes');
    expect(zonesLabel(['A', 'B', 'C', 'D', 'E'])).toBe('5 villes');
  });
});
