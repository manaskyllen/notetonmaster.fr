/**
 * `pnpm articles:import` on the test database: the 12 guides of content/articles are imported as
 * drafts without error, a published guide is never touched, and each one renders (its preview).
 */
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { prisma } = await import('@/lib/db');
const { adminLinkContext, analyse } = await import('@/lib/articles/admin');
const { isKnownToken } = await import('@/lib/articles/tokens');

const run = () =>
  execFileSync('node_modules/.bin/tsx', ['scripts/articles-import.ts'], {
    env: process.env,
    encoding: 'utf8',
  });

const SLUGS = [
  'calendrier-mon-master',
  'master-alternance-dijon',
  'master-dijon-guide',
  'master-europeen-strasbourg',
  'master-montpellier-guide',
  'master-mulhouse-guide',
  'master-nantes-guide',
  'master-strasbourg-guide',
  'masters-selectifs-montpellier',
  'masters-selectifs-nantes',
  'masters-selectifs-strasbourg',
  'taux-acces-master',
];

/** The establishments the articles name (the test database has fictional ones). */
const UNIVERSITIES = [
  { slug: 'universite-bourgogne-europe', name: 'Université Bourgogne Europe', city: 'Dijon' },
  {
    slug: 'import-test-institut-agro',
    name: 'Institut Agro (test)',
    shortName: 'Institut Agro',
    city: 'Dijon',
  },
  { slug: 'universite-de-montpellier', name: 'Université de Montpellier', city: 'Montpellier' },
  {
    slug: 'universite-de-montpellier-paul-valery',
    name: 'Université Paul-Valéry (test)',
    city: 'Montpellier',
  },
  { slug: 'universite-de-haute-alsace', name: 'Université de Haute-Alsace', city: 'Mulhouse' },
  { slug: 'import-test-cnam', name: 'Cnam (test)', keywords: ['cnam'], city: 'Paris' },
  { slug: 'universite-de-strasbourg', name: 'Université de Strasbourg', city: 'Strasbourg' },
];
const created: string[] = [];

beforeAll(async () => {
  for (const u of UNIVERSITIES)
    if (!(await prisma.university.findUnique({ where: { slug: u.slug } }))) {
      await prisma.university.create({ data: { region: 'Test', isPublished: false, ...u } });
      created.push(u.slug);
    }
});

afterAll(async () => {
  await prisma.article.deleteMany({ where: { slug: { in: SLUGS } } });
  await prisma.university.deleteMany({ where: { slug: { in: created } } });
});

describe('import of content/articles', () => {
  it('imports the 12 guides as drafts, without error', async () => {
    const out = run();
    expect(out).toContain('12 fichiers : 12 créés, 0 mis à jour, 0 déjà en ligne, 0 refusés.');
    expect(out).not.toContain('✗');
    const rows = await prisma.article.findMany({ where: { slug: { in: SLUGS } } });
    expect(rows.map((r) => r.slug).sort()).toEqual(SLUGS);
    expect(rows.every((r) => r.status === 'DRAFT' && !r.online)).toBe(true);
    expect(rows.find((r) => r.slug === 'taux-acces-master')).toMatchObject({
      city: null,
      theme: 'METHODE',
    });
  });

  it('updates drafts, never a published guide', async () => {
    await prisma.article.update({
      where: { slug: 'master-nantes-guide' },
      data: {
        online: true,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        title: 'Changé à la main',
      },
    });
    const out = run();
    expect(out).toContain('11 mis à jour, 1 déjà en ligne');
    expect(
      (await prisma.article.findUniqueOrThrow({ where: { slug: 'master-nantes-guide' } })).title,
    ).toBe('Changé à la main');
  });

  it('every guide renders: no unknown block, no broken guide link', async () => {
    const ctx = await adminLinkContext();
    for (const a of await prisma.article.findMany({ where: { slug: { in: SLUGS } } })) {
      const { render } = await analyse(a, 'preview', ctx);
      expect(render.html.length, a.slug).toBeGreaterThan(500);
      expect(
        render.issues.filter((i) => i.kind === 'block'),
        a.slug,
      ).toEqual([]);
      expect(
        render.issues.filter((i) => i.kind === 'link' && i.source.startsWith('/guides/')),
        a.slug,
      ).toEqual([]);
      // Tokens of the README only (their value depends on the data of the test database).
      expect(
        render.issues.filter((i) => i.kind === 'token' && !isKnownToken(i.source.slice(2, -2))),
        a.slug,
      ).toEqual([]);
    }
  });
});
