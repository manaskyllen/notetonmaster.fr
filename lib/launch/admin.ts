import { prisma } from '../db';
import { refreshZoneStats } from '../catalog/index-ratings';
import { closeCityArticles, refreshArticleFigures } from '../articles/figures.server';
import { refreshProgramIndexRows } from '../catalog/program-index';
import { refreshOpenZoneFlags } from './zones';
import { epciCommunes } from './geo';

/**
 * Paramètres › Villes ouvertes: figures of the zones, opening and closing,
 * adding a city. Pure data work, without Next.js: the server actions add the role check, the
 * audit entry and the cache expiry; the worker uses the yearly refresh of the communes.
 */

export interface ZoneRow {
  slug: string;
  name: string;
  epciName: string;
  communes: number;
  open: boolean;
  /** Published parcours it covers (whatever the other zones), establishments, published reviews. */
  programs: number;
  establishments: number;
  reviews: number;
  /**
   * Masters of the zone the public site lists now (search index, public establishments): what
   * the city pill counts. An open zone at 0 is not shown anywhere on the site.
   */
  listed: number;
}

/** Programs that would be published with these communes (published fiches, active). */
const COVERED = (codes: string[]) => prisma.$queryRaw<
  { programs: number; establishments: number; reviews: number }[]
>`
  SELECT count(*)::int AS programs, count(DISTINCT p."universityId")::int AS establishments,
         coalesce(sum(p."reviewCount"), 0)::int AS reviews
    FROM "Program" p
   WHERE p."isPublished" AND p.status IN ('ACTIVE', 'NOT_RENEWED') AND p."siteCommunes" && ${codes}::text[]`;

export async function zoneRows(): Promise<ZoneRow[]> {
  const zones = await prisma.launchZone.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] });
  return Promise.all(
    zones.map(async (z) => {
      const [[c], listed] = await Promise.all([
        COVERED(z.communeCodes),
        prisma.programSearchIndex.count({
          where: { zoneSlugs: { has: z.slug }, isPublicSector: true },
        }),
      ]);
      return {
        slug: z.slug,
        name: z.name,
        epciName: z.epciName,
        communes: z.communeCodes.length,
        open: z.open,
        programs: c?.programs ?? 0,
        establishments: c?.establishments ?? 0,
        reviews: c?.reviews ?? 0,
        listed,
      };
    }),
  );
}

/** « 3 villes ouvertes · 431 parcours publiés · 7 737 parcours masqués ». */
export async function zoneSummary() {
  const [open, published, hidden] = await Promise.all([
    prisma.launchZone.count({ where: { open: true } }),
    prisma.programSearchIndex.count(),
    prisma.program.count({
      where: { isPublished: true, status: { in: ['ACTIVE', 'NOT_RENEWED'] }, inOpenZone: false },
    }),
  ]);
  return { open, published, hidden };
}

/**
 * Opens or closes zones. Then the flags of every program, the rows of the search index of the
 * programs of the zones that changed (opened ones appear, closed ones go; reviews stay in the
 * database and come back with the zone), and the search view. Returns what changed, for the
 * audit log.
 */
export async function applyZoneStates(
  states: { slug: string; open: boolean }[],
  actorId: string | null,
): Promise<{
  changes: { slug: string; name: string; before: boolean; after: boolean }[];
  programs: number;
}> {
  const zones = await prisma.launchZone.findMany();
  const changes = states
    .map((s) => ({ s, z: zones.find((z) => z.slug === s.slug) }))
    .filter(
      (x): x is { s: { slug: string; open: boolean }; z: (typeof zones)[number] } =>
        !!x.z && x.z.open !== x.s.open,
    )
    .map(({ s, z }) => ({
      slug: z.slug,
      name: z.name,
      before: z.open,
      after: s.open,
      codes: z.communeCodes,
    }));
  if (!changes.length) return { changes: [], programs: 0 };
  for (const c of changes)
    await prisma.launchZone.update({
      where: { slug: c.slug },
      data: { open: c.after, ...(c.after ? { openedAt: new Date() } : {}), updatedById: actorId },
    });
  const flipped = await refreshOpenZoneFlags(null);
  const touched = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Program" WHERE "siteCommunes" && ${changes.flatMap((c) => c.codes)}::text[]`;
  const ids = [...new Set([...flipped, ...touched.map((t) => t.id)])];
  for (let i = 0; i < ids.length; i += 500) await refreshProgramIndexRows(ids.slice(i, i + 500));
  // The figures of the cities (/masters), even when no parcours changed.
  await refreshZoneStats();
  // Guides: those of a closed city go offline (« À relire »), and the figures follow the cities.
  await closeCityArticles(changes.filter((c) => !c.after).map((c) => c.slug));
  await refreshArticleFigures();
  // Through a SECURITY DEFINER function: the application role does not own the view.
  await prisma.$executeRaw`SELECT nm_refresh_search_document()`;
  return {
    changes: changes.map(({ codes: _c, ...c }) => {
      void _c;
      return c;
    }),
    programs: flipped.length,
  };
}

/** How many published fiches a set of communes covers (« Lyon · 402 parcours »). */
export async function coveredPrograms(codes: string[]): Promise<number> {
  const [c] = await COVERED(codes);
  return c?.programs ?? 0;
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Adds an intercommunality, closed, with its communes (read on the API). */
export async function addZone(
  epci: { code: string; nom: string },
  name: string,
  actorId: string | null,
) {
  const communes = await epciCommunes(epci.code);
  if (!communes.length) throw new Error('Cette intercommunalité n’a pas de commune connue.');
  const last = await prisma.launchZone.findFirst({
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  let slug = slugify(name) || epci.code;
  if (await prisma.launchZone.findUnique({ where: { slug } })) slug = `${slug}-${epci.code}`;
  return prisma.launchZone.create({
    data: {
      slug,
      name: name.trim(),
      epciCode: epci.code,
      epciName: epci.nom,
      communeCodes: communes,
      communesRefreshedAt: new Date(),
      open: false,
      order: (last?.order ?? 0) + 1,
      updatedById: actorId,
    },
  });
}

/**
 * Yearly refresh of the communes of every zone (communes merge, EPCIs change). Returns the zones
 * whose list changed; their programs are re-flagged and their index rows rebuilt.
 */
export async function refreshZoneCommunes(now = new Date()): Promise<string[]> {
  const year = 365 * 24 * 3600 * 1000;
  const due = await prisma.launchZone.findMany({
    where: {
      OR: [
        { communesRefreshedAt: null },
        { communesRefreshedAt: { lt: new Date(now.getTime() - year) } },
      ],
    },
  });
  const changed: string[] = [];
  for (const z of due) {
    const codes = await epciCommunes(z.epciCode);
    if (!codes.length) continue;
    const same = codes.join(',') === [...z.communeCodes].sort().join(',');
    await prisma.launchZone.update({
      where: { id: z.id },
      data: { communesRefreshedAt: now, ...(same ? {} : { communeCodes: codes }) },
    });
    if (!same) changed.push(z.slug);
  }
  if (changed.length) {
    const flipped = await refreshOpenZoneFlags(null);
    for (let i = 0; i < flipped.length; i += 500)
      await refreshProgramIndexRows(flipped.slice(i, i + 500));
    await refreshZoneStats();
  }
  return changed;
}
