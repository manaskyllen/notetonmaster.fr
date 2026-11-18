/**
 * Communes (API Découpage administratif, geo.api.gouv.fr, Licence Ouverte 2.0).
 * The whole list is downloaded once per run (one request, ~35 000 communes) and kept as a snapshot,
 * then communes are resolved locally: by INSEE code, or by name + department (Mon Master `lieux`
 * only give "TROYES CEDEX 9 (10)").
 */
import { readFile } from 'node:fs/promises';
import { normCity } from './normalize';

export const GEO_COMMUNES_URL =
  'https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,codeDepartement,departement,region,centre&format=json&geometry=centre';

export interface Commune {
  code: string;
  nom: string;
  codeDepartement: string;
  departement?: { code: string; nom: string };
  region?: { code: string; nom: string };
  codesPostaux?: string[];
  centre?: { type: 'Point'; coordinates: [number, number] };
}

export interface CommuneIndex {
  byCode: Map<string, Commune>;
  byNameDep: Map<string, Commune[]>;
  byPostal: Map<string, Commune[]>;
}

export function indexCommunes(list: Commune[]): CommuneIndex {
  const byCode = new Map<string, Commune>();
  const byNameDep = new Map<string, Commune[]>();
  const byPostal = new Map<string, Commune[]>();
  for (const c of list) {
    byCode.set(c.code, c);
    const k = `${normCity(c.nom)}|${c.codeDepartement}`;
    byNameDep.set(k, [...(byNameDep.get(k) ?? []), c]);
    for (const p of c.codesPostaux ?? []) byPostal.set(p, [...(byPostal.get(p) ?? []), c]);
  }
  return { byCode, byNameDep, byPostal };
}

export async function loadCommunes(path: string): Promise<CommuneIndex> {
  return indexCommunes(JSON.parse(await readFile(path, 'utf8')) as Commune[]);
}

/**
 * Resolves a commune by name and department. Paris, Lyon and Marseille arrondissements
 * ("PARIS 13", "LYON 7EME") resolve to the commune; an ambiguous name returns null.
 */
export function resolveCommune(
  idx: CommuneIndex,
  name: string,
  department: string | null,
): Commune | null {
  const dep = (department ?? '').toUpperCase().replace(/^(\d)$/, '0$1');
  const tries = [name, name.replace(/\s+\d{1,2}(?:\s*(?:e|eme|er))?\s*(?:arrondissement)?$/i, '')];
  for (const t of tries) {
    const key = normCity(t);
    if (dep) {
      const hit = idx.byNameDep.get(`${key}|${dep}`);
      if (hit?.length === 1) return hit[0]!;
    } else {
      const all = [...idx.byNameDep.entries()]
        .filter(([k]) => k.startsWith(`${key}|`))
        .flatMap(([, v]) => v);
      if (all.length === 1) return all[0]!;
    }
  }
  return null;
}

/** [lat, lng] of a commune centre (GeoJSON is [lng, lat]). */
export function centre(c: Commune): { lat: number; lng: number } | null {
  const xy = c.centre?.coordinates;
  return xy ? { lat: xy[1], lng: xy[0] } : null;
}
