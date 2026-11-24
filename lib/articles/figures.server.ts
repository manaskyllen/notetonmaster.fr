import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { cityScope, SCOPE_ALL, type Band, type FigureRow, type Figures } from './figures';
import { slugify } from './model';
import { changedTokens } from './tokens';

/**
 * Figures of the guides in the database (ArticleFigures): one row per scope (every open city,
 * every city a guide is about, « toutes »), recomputed after each sync and each opening or
 * closing of a city, never on a visit. No 'server-only' guard: the worker and the import script
 * call it too.
 */

interface IndexRow {
  slug: string;
  title: string;
  universityShort: string;
  universitySlug: string;
  mentionName: string;
  domainSlug: string | null;
  modalities: string[];
  places: number | null;
  applications: number | null;
  offers: number | null;
  accessRate: number | null;
  accessBand: string;
  lastSession: number | null;
  reviewCount: number;
}

async function indexRows(city: string | null): Promise<IndexRow[]> {
  // Public establishments of the open cities: the rows of the city pages (lib/catalog/cities.ts).
  return prisma.$queryRaw<IndexRow[]>`
    SELECT i.slug, i.title, i."universityShort", i."universitySlug", i."mentionName", i."domainSlug",
           i.modalities, i.places, i.applications, i.offers, i."accessRate", i."accessBand",
           i."lastSession", i."reviewCount"
      FROM "ProgramSearchIndex" i
     WHERE i."isPublicSector"
       AND (CASE WHEN ${city}::text IS NULL THEN cardinality(i."zoneSlugs") > 0
                 ELSE ${city}::text = ANY(i."zoneSlugs") END)
     ORDER BY i.slug`;
}

async function context() {
  const [[session], zones, [site], [sync]] = await Promise.all([
    prisma.$queryRaw<{ s: number | null }[]>`
      SELECT max(session)::int AS s FROM "AdmissionStat" WHERE "monMasterEntryId" IS NOT NULL`,
    prisma.launchZone.findMany({
      where: { open: true },
      select: { slug: true, name: true, programCount: true },
      orderBy: [{ programCount: 'desc' }, { order: 'asc' }],
    }),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "ProgramSearchIndex"
       WHERE "isPublicSector" AND cardinality("zoneSlugs") > 0`,
    prisma.$queryRaw<{ at: Date | null }[]>`
      SELECT max(r."finishedAt") AS at FROM "SyncRun" r JOIN "DataSource" s ON s.id = r."sourceId"
       WHERE s.key LIKE 'monmaster%' AND r.status = 'SUCCEEDED'`,
  ]);
  const cities = zones.filter((z) => z.programCount > 0);
  return {
    session: session?.s ?? null,
    open: cities.map((z) => ({ slug: z.slug, name: z.name, programs: z.programCount })),
    site: { programs: site?.n ?? 0, cities: cities.length },
    dataUpdatedAt: sync?.at ? new Date(sync.at).toISOString() : null,
  };
}

const BANDS: Band[] = ['tres-selectif', 'selectif', 'accessible', 'nc'];

/** Figures of one scope, read in the database now. */
export async function computeFigures(
  scope: string,
  ctx?: Awaited<ReturnType<typeof context>>,
): Promise<Figures> {
  const c = ctx ?? (await context());
  const citySlug = scope.startsWith('ville:') ? scope.slice(6) : null;
  // A city that is not open has no figures: its tokens are unknown, its guide cannot be published.
  const city = citySlug ? (c.open.find((z) => z.slug === citySlug) ?? null) : null;
  const raw = citySlug && !city ? [] : await indexRows(citySlug);
  const rows: FigureRow[] = raw.map((r) => ({
    slug: r.slug,
    title: r.title,
    university: r.universityShort,
    universitySlug: r.universitySlug,
    mention: r.mentionName,
    domain: r.domainSlug,
    modalities: r.modalities,
    places: r.places,
    applications: r.applications,
    offers: r.offers,
    accessRate: r.accessRate,
    band: (BANDS as string[]).includes(r.accessBand) ? (r.accessBand as Band) : 'nc',
    session: r.lastSession,
  }));
  const slugs = [...new Set(rows.map((r) => r.universitySlug))];
  const universities = slugs.length
    ? await prisma.university.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, name: true, shortName: true, keywords: true },
      })
    : [];
  return {
    scope,
    city: city ? { slug: city.slug, name: city.name } : null,
    session: c.session,
    rows,
    reviews: raw.reduce((n, r) => n + r.reviewCount, 0),
    universities: universities.map((u) => ({
      slug: u.slug,
      name: u.name,
      aliases: [
        ...new Set(
          [u.shortName ?? '', ...u.keywords].map((x) => slugify(x)).filter((x) => x.length > 1),
        ),
      ],
    })),
    site: c.site,
    cities: c.open,
    computedAt: new Date().toISOString(),
    dataUpdatedAt: c.dataUpdatedAt,
  };
}

async function store(f: Figures) {
  await prisma.articleFigures.upsert({
    where: { scope: f.scope },
    create: { scope: f.scope, session: f.session, data: f as never },
    update: { session: f.session, data: f as never, computedAt: new Date() },
  });
}

/** Figures of a scope from the cache, computed (and stored) the first time only. */
export async function loadFigures(scope: string): Promise<Figures> {
  const row = await prisma.articleFigures.findUnique({ where: { scope } });
  if (row) return row.data as unknown as Figures;
  const f = await computeFigures(scope);
  await store(f);
  return f;
}

export async function loadFiguresFor(city: string | null) {
  return loadFigures(cityScope(city));
}

/**
 * After a sync, or when cities open or close: every scope recomputed, then each guide whose
 * quoted figures changed since its last review goes to « À relire » (it stays online). Returns
 * the guides that changed status.
 */
export async function refreshArticleFigures(
  opts: { review?: boolean } = {},
): Promise<{ scopes: number; toReview: string[] }> {
  const ctx = await context();
  const articles = await prisma.article.findMany({
    select: {
      id: true,
      title: true,
      city: true,
      body: true,
      status: true,
      reviewedValues: true,
    },
  });
  const scopes = new Set<string>([
    SCOPE_ALL,
    ...ctx.open.map((z) => cityScope(z.slug)),
    ...articles.map((a) => cityScope(a.city)),
  ]);
  const figures = new Map<string, Figures>();
  for (const s of scopes) {
    const f = await computeFigures(s, ctx);
    await store(f);
    figures.set(s, f);
  }
  // Scopes nobody needs any more (a city closed and without guide).
  await prisma.articleFigures.deleteMany({ where: { scope: { notIn: [...scopes] } } });

  const toReview: string[] = [];
  if (opts.review)
    for (const a of articles) {
      if (a.status === 'TO_REVIEW') continue;
      const changed = changedTokens(
        a.body,
        a.reviewedValues as Record<string, string> | null,
        figures.get(cityScope(a.city))!,
      );
      if (!changed.length) continue;
      await prisma.article.update({ where: { id: a.id }, data: { status: 'TO_REVIEW' } });
      toReview.push(a.id);
      await audit(
        null,
        'ARTICLES',
        `Guide · ${a.title}`,
        'Chiffres changés depuis la dernière relecture',
        {
          action: 'a passé en « À relire » le guide',
          target: { type: 'ARTICLE', id: a.id },
          diff: changed.map((c) => ({ field: `{{${c.code}}}`, before: c.before, after: c.after })),
        },
      );
    }
  return { scopes: scopes.size, toReview };
}

/**
 * Cities closed: their guides go offline and to « À relire » (a guide never stays public on a
 * closed city). Returns the guides taken offline.
 */
export async function closeCityArticles(slugs: string[]): Promise<string[]> {
  if (!slugs.length) return [];
  const list = await prisma.article.findMany({
    where: { city: { in: slugs }, OR: [{ online: true }, { status: { not: 'DRAFT' } }] },
    select: { id: true, title: true, city: true, online: true },
  });
  for (const a of list) {
    await prisma.article.update({
      where: { id: a.id },
      data: { online: false, status: 'TO_REVIEW' },
    });
    await audit(
      null,
      'ARTICLES',
      `Guide · ${a.title}`,
      `Ville fermée (${a.city}) : guide dépublié`,
      {
        action: 'a dépublié le guide',
        target: { type: 'ARTICLE', id: a.id },
      },
    );
  }
  return list.map((a) => a.id);
}
