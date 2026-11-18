import { prisma } from '../db';
import { loadCommunes, type CommuneIndex } from './geo';

/**
 * Every French commune (latest geo.api.gouv.fr snapshot downloaded by the establishments
 * connector), loaded once per process. Null when no snapshot exists (tests, a fresh database):
 * callers then rely on the City table only.
 */
let communes: CommuneIndex | null | undefined;
export async function communeIndex(): Promise<CommuneIndex | null> {
  if (communes !== undefined) return communes;
  const snap = await prisma.rawSnapshot.findFirst({
    where: { url: { contains: 'geo.api.gouv.fr/communes' } },
    orderBy: { fetchedAt: 'desc' },
  });
  communes = snap ? await loadCommunes(snap.storagePath).catch(() => null) : null;
  return communes;
}

/** A new snapshot may have been downloaded (start of a rebuild). */
export function forgetCommuneIndex() {
  communes = undefined;
}
