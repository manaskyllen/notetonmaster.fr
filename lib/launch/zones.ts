import { prisma } from '../db';
import { communeIndex } from '../data/commune-index';
import { resolveCommune, type CommuneIndex } from '../data/geo';
import { normCity } from '../data/normalize';

/**
 * Launch limited to a few cities. A program is published
 * when `isPublished && inOpenZone`; `inOpenZone` is true when one of its sites (`siteCommunes`,
 * INSEE codes) is a commune of an open LaunchZone. Both are columns of Program, recomputed:
 * - the sites, at each sync (full rebuild of the search index) and when a fiche is refreshed;
 * - the flag, then, and whenever a zone is opened or closed.
 * The public lists only read ProgramSearchIndex, which holds published programs only: no join on
 * the communes at request time. No 'server-only' guard: the worker rebuilds the index.
 */

/**
 * « UFR Sciences et Techniques - SAINT-NAZAIRE (44) » → { site: 'UFR Sciences et Techniques',
 * city: 'SAINT-NAZAIRE', dep: '44' }. Entries are separated by « | » or « , ».
 */
export function parseLieux(
  text: string | null | undefined,
): { site: string; city: string; dep: string | null }[] {
  if (!text) return [];
  const out: { site: string; city: string; dep: string | null }[] = [];
  for (const piece of text.split(/[|,]/)) {
    const i = piece.lastIndexOf(' - ');
    if (i < 0) continue;
    const m = /^(.+?)\s*(?:\((\d[\dAB]?|\d{3})\))?\s*$/.exec(piece.slice(i + 3).trim());
    if (!m) continue;
    const city = m[1]!.replace(/\s+c[ée]dex(\s*\d+)?$/i, '').trim();
    if (city) out.push({ site: piece.slice(0, i).trim(), city, dep: m[2] ?? null });
  }
  return out;
}

/**
 * Teaching sites of a `lieux` value. Mon Master often adds the establishment itself
 * (« Nantes Université - NANTES (44) », its head office) next to the real site
 * (« UFR Sciences et Techniques - SAINT-NAZAIRE (44) »): that line is not a site when another
 * one is given.
 */
export function teachingSites(
  text: string | null | undefined,
  establishment: string[],
): { city: string; dep: string | null }[] {
  const all = parseLieux(text);
  const names = new Set(establishment.filter(Boolean).map((n) => normCity(n)));
  const real = all.filter((l) => !names.has(normCity(l.site)));
  return (real.length ? real : all).map(({ city, dep }) => ({ city, dep }));
}

interface CityRef {
  byNameDep: Map<string, string>;
  byName: Map<string, string[]>;
}

async function cityRef(): Promise<CityRef> {
  const cities = await prisma.city.findMany({
    where: { inseeCode: { not: null } },
    select: { name: true, inseeCode: true, departmentCode: true },
  });
  const byNameDep = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const c of cities) {
    const k = normCity(c.name);
    if (c.departmentCode) byNameDep.set(`${k}|${c.departmentCode}`, c.inseeCode!);
    byName.set(k, [...(byName.get(k) ?? []), c.inseeCode!]);
  }
  return { byNameDep, byName };
}

function resolve(
  ref: CityRef,
  idx: CommuneIndex | null,
  name: string,
  dep: string | null,
): string | null {
  const k = normCity(name);
  if (dep) {
    const d = dep.padStart(2, '0');
    const hit = ref.byNameDep.get(`${k}|${d}`);
    if (hit) return hit;
  } else {
    const all = ref.byName.get(k) ?? [];
    if (all.length === 1) return all[0]!;
  }
  return idx ? (resolveCommune(idx, name, dep)?.code ?? null) : null;
}

/**
 * Sites of the programs (all, or these ones): the commune of the campus, the communes named by
 * the latest Mon Master `lieux`, and, when neither is known, the city of the program in one of
 * the departments of its university. Writes `Program.siteCommunes` where it changed.
 */
export async function computeSiteCommunes(ids: string[] | null): Promise<number> {
  const list = ids ? [...new Set(ids.filter(Boolean))] : null;
  if (list && !list.length) return 0;
  const rows = await prisma.$queryRaw<
    {
      id: string;
      city: string;
      campus: string | null;
      lieux: string | null;
      deps: string[];
      current: string[];
      uname: string;
      ushort: string | null;
    }[]
  >`
    SELECT p.id, p.city, ci."inseeCode" AS campus, l.lieux, p."siteCommunes" AS current,
           u.name AS uname, u."shortName" AS ushort,
           coalesce((SELECT array_agg(DISTINCT c2."departmentCode") FROM "Campus" k
                       JOIN "City" c2 ON c2.id = k."cityId"
                      WHERE k."universityId" = p."universityId" AND c2."departmentCode" IS NOT NULL), '{}') AS deps
      FROM "Program" p
      JOIN "University" u ON u.id = p."universityId"
      LEFT JOIN "Campus" ca ON ca.id = p."campusId"
      LEFT JOIN "City" ci ON ci.id = ca."cityId"
      LEFT JOIN LATERAL (
        SELECT s.raw->>'lieux' AS lieux FROM "AdmissionStat" s
         WHERE s."programId" = p.id AND s.raw ? 'lieux'
         ORDER BY s.session DESC LIMIT 1
      ) l ON true
     WHERE (${list}::text[] IS NULL OR p.id = ANY(${list}::text[]))`;
  const [ref, idx] = await Promise.all([cityRef(), communeIndex()]);
  const changes: { id: string; codes: string[] }[] = [];
  for (const r of rows) {
    const codes = new Set<string>();
    if (r.campus) codes.add(r.campus);
    for (const l of teachingSites(r.lieux, [r.uname, r.ushort ?? ''])) {
      const c = resolve(ref, idx, l.city, l.dep);
      if (c) codes.add(c);
    }
    if (!codes.size && r.city) {
      const c =
        r.deps.map((d) => resolve(ref, idx, r.city, d)).find(Boolean) ??
        resolve(ref, idx, r.city, null);
      if (c) codes.add(c);
    }
    const next = [...codes].sort();
    if (next.join(',') !== [...r.current].sort().join(',')) changes.push({ id: r.id, codes: next });
  }
  for (let i = 0; i < changes.length; i += 1000)
    await prisma.$executeRaw`
      UPDATE "Program" p SET "siteCommunes" = ARRAY(SELECT jsonb_array_elements_text(v.codes))
        FROM jsonb_to_recordset(${JSON.stringify(changes.slice(i, i + 1000))}::jsonb) AS v(id text, codes jsonb)
       WHERE p.id = v.id`;
  return changes.length;
}

/**
 * `Program.inOpenZone` from the sites and the open zones (all programs, or these ones). Returns
 * the programs whose flag changed: their rows of the search index must be rebuilt.
 */
export async function refreshOpenZoneFlags(ids: string[] | null): Promise<string[]> {
  const list = ids ? [...new Set(ids.filter(Boolean))] : null;
  if (list && !list.length) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH open AS (
      SELECT coalesce(array_agg(DISTINCT c), '{}'::text[]) AS codes
        FROM "LaunchZone" z, unnest(z."communeCodes") c WHERE z.open
    )
    UPDATE "Program" p SET "inOpenZone" = (p."siteCommunes" && (SELECT codes FROM open))
     WHERE (${list}::text[] IS NULL OR p.id = ANY(${list}::text[]))
       AND p."inOpenZone" IS DISTINCT FROM (p."siteCommunes" && (SELECT codes FROM open))
    RETURNING p.id`;
  return rows.map((r) => r.id);
}

/** Sites then flag of these programs (a fiche refreshed, a campus moved). */
export async function refreshProgramAvailability(ids: string[] | null): Promise<string[]> {
  await computeSiteCommunes(ids);
  return refreshOpenZoneFlags(ids);
}

export interface OpenZone {
  slug: string;
  name: string;
  /** Published programs (public establishments) in the zone. */
  programs: number;
  /** INSEE code of the main commune (Explorer filter « Lieu »). */
  insee: string | null;
}

/**
 * Open zones with their published programs (from the search index) and the commune of their
 * name, for the city pills and the sentences that name the cities (« Strasbourg · 312 masters »).
 * A zone without any published master is left out: the site never shows a city with nothing in
 * it (Paramètres › Villes ouvertes warns about it). The most furnished cities come first.
 */
export async function getOpenZones(): Promise<OpenZone[]> {
  const zones = await prisma.launchZone.findMany({
    where: { open: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { slug: true, name: true, communeCodes: true },
  });
  if (!zones.length) return [];
  const counts = await prisma.$queryRaw<{ slug: string; n: number }[]>`
    SELECT z.slug, count(DISTINCT i."programId")::int AS n
      FROM "LaunchZone" z
      JOIN "Program" p ON p."siteCommunes" && z."communeCodes"
      JOIN "ProgramSearchIndex" i ON i."programId" = p.id AND i."isPublicSector"
     WHERE z.open
     GROUP BY z.slug`;
  const cities = await prisma.city.findMany({
    where: { inseeCode: { in: zones.flatMap((z) => z.communeCodes) } },
    select: { name: true, inseeCode: true },
  });
  return orderZones(
    zones.map((z) => ({
      slug: z.slug,
      name: z.name,
      programs: counts.find((c) => c.slug === z.slug)?.n ?? 0,
      insee:
        cities.find(
          (c) => normCity(c.name) === normCity(z.name) && z.communeCodes.includes(c.inseeCode!),
        )?.inseeCode ?? null,
    })),
  );
}

/**
 * The zones shown on the site: at least one published master, the most furnished first (stable:
 * equal counts keep the order of the zones).
 */
export function orderZones<Z extends { programs: number }>(zones: Z[]): Z[] {
  return zones
    .map((z, i) => ({ z, i }))
    .filter(({ z }) => z.programs > 0)
    .sort((a, b) => b.z.programs - a.z.programs || a.i - b.i)
    .map(({ z }) => z);
}

/** « Strasbourg, Mulhouse et Nantes », or « 5 villes » beyond three. */
export function zonesLabel(names: string[]): string {
  if (names.length > 3) return `${names.length} villes`;
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
}
