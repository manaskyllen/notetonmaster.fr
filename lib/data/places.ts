/** Cities (by INSEE code) and campuses (university × commune × place label). */
import { prisma } from '@/lib/db';
import { centre, type Commune } from './geo';
import { normText, slugify } from './normalize';

const cityCache = new Map<string, string>();

/** City row for a commune, created or completed (name, department, region, centre) by INSEE code. */
export async function ensureCity(c: Commune): Promise<string> {
  const hit = cityCache.get(c.code);
  if (hit) return hit;
  const pos = centre(c);
  const data = {
    name: c.nom,
    department: c.departement?.nom ?? c.codeDepartement,
    departmentCode: c.codeDepartement,
    region: c.region?.nom ?? '',
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
  };
  const existing = await prisma.city.findUnique({ where: { inseeCode: c.code } });
  let id: string;
  if (existing) {
    const patch = Object.fromEntries(
      Object.entries(data).filter(
        ([k, v]) => v != null && v !== '' && (existing as Record<string, unknown>)[k] == null,
      ),
    );
    if (Object.keys(patch).length)
      await prisma.city.update({ where: { id: existing.id }, data: patch });
    id = existing.id;
  } else {
    let slug = slugify(c.nom);
    if (await prisma.city.findUnique({ where: { slug } }))
      slug = `${slug}-${c.codeDepartement.toLowerCase()}`;
    if (await prisma.city.findUnique({ where: { slug } })) slug = `${slug}-${c.code}`;
    id = (await prisma.city.create({ data: { inseeCode: c.code, slug, ...data } })).id;
  }
  cityCache.set(c.code, id);
  return id;
}

/** Campus of a university in a commune, keyed by its normalised label. */
export async function ensureCampus(
  universityId: string,
  cityId: string,
  label: string,
  pos?: { lat: number; lng: number } | null,
) {
  const key = normText(label) || 'campus';
  return prisma.campus.upsert({
    where: { universityId_cityId_key: { universityId, cityId, key } },
    create: {
      universityId,
      cityId,
      key,
      name: label,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
    },
    update: {},
  });
}

export function resetPlaceCaches() {
  cityCache.clear();
}
