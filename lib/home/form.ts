/**
 * The light rules of the home search, those the form island needs at first load: the Explorer
 * address, the quick filters, the label of the button. The rest (highlight, cities typed, review
 * words) is in ./labels.ts, read by the server and by the suggestions loaded on interaction.
 */

/**
 * « Seulement : » under the fields. Each one is an Explorer filter, with the same URL parameter
 * (lib/catalog/filters.ts): the home never invents one.
 * « Accessibles après la licence »: the parcours recruiting in M1 (entree=M1), « M2 seul » left out.
 */
export const QUICK_FILTERS = [
  { key: 'alt', label: 'En alternance', param: 'modalite', value: 'alternance' },
  { key: 'avis', label: 'Avec des avis', param: 'avis', value: 'avec' },
  { key: 'm1', label: 'Accessibles après la licence', param: 'entree', value: 'M1' },
] as const;
export type QuickKey = (typeof QUICK_FILTERS)[number]['key'];
export type Quick = Record<QuickKey, boolean>;
export const NO_QUICK: Quick = { alt: false, avis: false, m1: false };

/** Index of a combination of quick filters in a row of the count table (0 to 7). */
export function quickMask(f: Quick): number {
  return QUICK_FILTERS.reduce((m, q, i) => (f[q.key] ? m | (1 << i) : m), 0);
}

/** Explorer filter of an open city (the « Lieu » facet: the city and its intercommunality). */
export const zoneLieu = (slug: string) => `zone:${slug}`;

/** The search of the home as Explorer parameters: q, lieu, modalite, avis, entree. */
export function explorerParams(s: { q: string; city: string | null; quick: Quick }) {
  const p = new URLSearchParams();
  if (s.q.trim()) p.set('q', s.q.trim().slice(0, 120));
  if (s.city) p.set('lieu', zoneLieu(s.city));
  for (const f of QUICK_FILTERS) if (s.quick[f.key]) p.set(f.param, f.value);
  return p;
}

export function explorerHref(s: { q: string; city: string | null; quick: Quick }): string {
  const qs = explorerParams(s).toString();
  return qs ? `/explorer?${qs}` : '/explorer';
}

const nf = new Intl.NumberFormat('fr-FR');
export const plural = (n: number, one: string, many: string) =>
  `${nf.format(n)} ${n > 1 ? many : one}`;

/** Label of the button: « Voir les 1 234 masters », « Voir le master », « Chercher ». */
export function goLabel(n: number | null): string {
  if (n === null || n === 0) return 'Chercher';
  return n === 1 ? 'Voir le master' : `Voir les ${nf.format(n)} masters`;
}

/** Hint at the right of « Explorer par domaine ». */
export const domainHint = (cityName: string | null) =>
  cityName ? `Mentions ouvertes à ${cityName}` : 'Les 4 grands domaines nationaux du master';
