import 'server-only';
import { prisma } from '@/lib/db';
import { communeIndex } from '@/lib/data/commune-index';
import { normCity } from '@/lib/data/normalize';

/**
 * « Lyon n'est pas encore sur notetonmaster »: a query that names a commune (or a
 * launch zone not open yet) outside the open cities. Read from local data only, never the API at
 * request time: the City table (communes with a campus), the national list of communes
 * downloaded by the establishments connector, and the closed launch zones. The whole query has
 * to be the place (« Lyon », « saint-étienne »): « droit lyon » is a normal search.
 */
export async function notYetPlace(query: string): Promise<{ place: string } | null> {
  const q = normCity(query.trim().replace(/\s+\(\d[\dAB]?\)$/, ''));
  if (q.length < 3 || q.length > 60) return null;
  const zones = await prisma.launchZone.findMany({
    select: { name: true, epciName: true, open: true, communeCodes: true },
  });
  const openCodes = new Set(zones.filter((z) => z.open).flatMap((z) => z.communeCodes));
  // a launch zone itself, by its name or its intercommunality
  const zone = zones.find((z) => normCity(z.name) === q || normCity(z.epciName) === q);
  if (zone) return zone.open ? null : { place: zone.name };
  // a commune: the cities of the campuses first, then every French commune
  const cities = await prisma.city.findMany({
    where: { inseeCode: { not: null } },
    select: { name: true, inseeCode: true },
  });
  const hits = cities.filter((c) => normCity(c.name) === q);
  if (hits.length)
    return hits.some((c) => openCodes.has(c.inseeCode!)) ? null : { place: hits[0]!.name };
  const idx = await communeIndex();
  if (!idx) return null;
  const all = [...idx.byNameDep.entries()]
    .filter(([k]) => k.startsWith(`${q}|`))
    .flatMap(([, v]) => v);
  if (!all.length) return null;
  return all.some((c) => openCodes.has(c.code)) ? null : { place: all[0]!.nom };
}
