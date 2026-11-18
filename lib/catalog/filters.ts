/**
 * Filters of the program lists (Explorer, mention and university pages), read from and written to
 * the URL: ?q=…&domaine=…&lieu=insee:44109&etab=0442953W&modalite=alternance. Several
 * values of one facet are joined by commas. Pure: shared by the server (queries) and the client
 * (facet panel, active filter chips).
 */
import { DEFAULT_KINDS, ESTABLISHMENT_KINDS, type EstablishmentKind } from '@/lib/domain/sector';
import type { Params } from '@/lib/pagination';

export const MODALITIES = [
  { id: 'presentiel', label: 'Présentiel' },
  { id: 'alternance', label: 'Alternance (apprentissage ou contrat pro)' },
  { id: 'continue', label: 'Formation continue' },
  { id: 'distance', label: 'Hybride ou à distance' },
] as const;

export const ENTRIES = [
  { id: 'M1', label: 'M1' },
  { id: 'M2', label: 'M2' },
] as const;

export const ACCESS = [
  { id: 'tres-selectif', label: 'Très sélectif', hint: 'moins de 10 % de propositions' },
  { id: 'selectif', label: 'Sélectif', hint: '10 à 30 %' },
  { id: 'accessible', label: 'Accessible', hint: 'plus de 30 %' },
  { id: 'nc', label: 'Non communiqué', hint: null },
] as const;

export const PLACES = [
  { id: 'moins-16', label: 'Moins de 16', min: null, max: 15 },
  { id: '16-30', label: '16 à 30', min: 16, max: 30 },
  { id: '31-60', label: '31 à 60', min: 31, max: 60 },
  { id: 'plus-60', label: 'Plus de 60', min: 61, max: null },
] as const;

export const REVIEWS = [
  { id: 'avec', label: 'Avec des avis' },
  { id: 'verifies', label: 'Avec des avis vérifiés' },
  { id: 'note-3', label: 'Note moyenne 3 ou plus', grade: 3 },
  { id: 'note-4', label: '4 ou plus', grade: 4 },
] as const;

export const RADII = [10, 25, 50] as const;

export const SORTS = [
  { id: 'pertinence', label: 'Pertinence' },
  { id: 'notes', label: 'Mieux notés' },
  { id: 'avis', label: 'Plus d’avis' },
  { id: 'az', label: 'A → Z' },
] as const;
export type Sort = (typeof SORTS)[number]['id'];

export interface Filters {
  q: string;
  domaines: string[];
  disciplines: string[];
  mentions: string[];
  /** insee:44109 · dep:44 · reg:pays-de-la-loire · nom:<slug> · etranger */
  lieux: string[];
  /** Radius around the first commune of `lieux` (km). */
  rayon: number | null;
  etabs: string[];
  /** Establishment kinds; empty = default (public ones). */
  types: EstablishmentKind[];
  modalites: string[];
  entrees: string[];
  acces: string[];
  places: string[];
  avis: string[];
  composantes: string[];
  tri: Sort | null;
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  domaines: [],
  disciplines: [],
  mentions: [],
  lieux: [],
  rayon: null,
  etabs: [],
  types: [],
  modalites: [],
  entrees: [],
  acces: [],
  places: [],
  avis: [],
  composantes: [],
  tri: null,
};

/** URL parameter of each multi-valued filter. */
export const PARAM: Record<Exclude<keyof Filters, 'q' | 'rayon' | 'tri'>, string> = {
  domaines: 'domaine',
  disciplines: 'discipline',
  mentions: 'mention',
  lieux: 'lieu',
  etabs: 'etab',
  types: 'type',
  modalites: 'modalite',
  entrees: 'entree',
  acces: 'acces',
  places: 'places',
  avis: 'avis',
  composantes: 'composante',
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(',') : (v ?? ''))
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
const within = <T extends string>(xs: string[], allowed: readonly T[]) =>
  xs.filter((x): x is T => (allowed as readonly string[]).includes(x));

export function readFilters(sp: Params): Filters {
  const kindBySlug = new Map(ESTABLISHMENT_KINDS.map((k) => [k.slug, k.id]));
  const rayon = Number(one(sp.rayon));
  return {
    q: one(sp.q).slice(0, 120),
    domaines: list(sp.domaine),
    disciplines: list(sp.discipline),
    mentions: list(sp.mention),
    lieux: list(sp.lieu).filter((l) => /^(insee|dep|reg|nom|zone|etranger)(:|$)/.test(l)),
    rayon: (RADII as readonly number[]).includes(rayon) ? rayon : null,
    etabs: list(sp.etab),
    types: list(sp.type)
      .map((t) => kindBySlug.get(t))
      .filter((k): k is EstablishmentKind => !!k),
    modalites: within(
      list(sp.modalite),
      MODALITIES.map((m) => m.id),
    ),
    entrees: within(
      list(sp.entree),
      ENTRIES.map((m) => m.id),
    ),
    acces: within(
      list(sp.acces),
      ACCESS.map((m) => m.id),
    ),
    places: within(
      list(sp.places),
      PLACES.map((m) => m.id),
    ),
    avis: within(
      list(sp.avis),
      REVIEWS.map((m) => m.id),
    ),
    composantes: list(sp.composante),
    tri: (SORTS.find((s) => s.id === one(sp.tri))?.id ?? null) as Sort | null,
  };
}

/** Kinds actually applied: the visitor's choice, or the public ones by default (D2 bis). */
export function effectiveKinds(f: Filters): EstablishmentKind[] {
  return f.types.length ? f.types : DEFAULT_KINDS;
}

/** Sort applied: the visitor's, else relevance with a query, else the best rated. */
export function effectiveSort(f: Filters): Sort {
  if (f.tri && (f.tri !== 'pertinence' || f.q.trim())) return f.tri;
  return f.q.trim() ? 'pertinence' : 'notes';
}

/** Number of active filters (button « Filtres (3) »), the default kinds not counted. */
export function activeCount(f: Filters): number {
  return (
    (f.q.trim() ? 1 : 0) +
    f.domaines.length +
    f.disciplines.length +
    f.mentions.length +
    f.lieux.length +
    f.etabs.length +
    f.types.length +
    f.modalites.length +
    f.entrees.length +
    f.acces.length +
    f.places.length +
    f.avis.length +
    f.composantes.length
  );
}

/** URL parameters of a set of filters (page left out: a new filter goes back to page 1). */
export function filtersToParams(f: Filters): Record<string, string | null> {
  const kindSlug = new Map(ESTABLISHMENT_KINDS.map((k) => [k.id, k.slug]));
  const out: Record<string, string | null> = {
    q: f.q.trim() || null,
    rayon: f.rayon && f.lieux.length ? String(f.rayon) : null,
    tri: f.tri,
  };
  for (const [key, param] of Object.entries(PARAM) as [keyof typeof PARAM, string][]) {
    const vals = key === 'types' ? f.types.map((t) => kindSlug.get(t)!) : (f[key] as string[]);
    out[param] = vals.length ? vals.join(',') : null;
  }
  return out;
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
