import { crawlerUserAgent } from '../data/http';

/**
 * API Découpage administratif (geo.api.gouv.fr, Licence Ouverte): intercommunalities (EPCI) and
 * their communes. Called from the admin (« Ajouter une ville ») and by the yearly refresh of the
 * worker, never at request time on the public site. Same User-Agent as the collection
 * (CRAWLER_INFO_URL and CRAWLER_CONTACT_EMAIL).
 */
const BASE = 'https://geo.api.gouv.fr';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { accept: 'application/json', 'user-agent': crawlerUserAgent() },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`geo.api.gouv.fr ${path} : HTTP ${r.status}`);
  return (await r.json()) as T;
}

export interface Epci {
  code: string;
  nom: string;
}

/** An EPCI by its SIREN code (null when unknown). */
export async function epciByCode(code: string): Promise<Epci | null> {
  if (!/^\d{9}$/.test(code)) return null;
  try {
    return await get<Epci>(`/epcis/${code}?fields=nom,code`);
  } catch {
    return null;
  }
}

/** EPCIs whose name matches (« lyon » → Métropole de Lyon…), at most `limit`. */
export async function searchEpcis(q: string, limit = 6): Promise<Epci[]> {
  const name = q.trim().slice(0, 60);
  if (name.length < 2) return [];
  return get<Epci[]>(`/epcis?nom=${encodeURIComponent(name)}&fields=nom,code&limit=${limit}`);
}

/** INSEE codes of the communes of an EPCI, sorted. */
export async function epciCommunes(code: string): Promise<string[]> {
  const list = await get<{ code: string }[]>(`/epcis/${code}/communes?fields=code`);
  return list.map((c) => c.code).sort();
}
