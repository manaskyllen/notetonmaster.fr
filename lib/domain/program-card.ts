/**
 * What a master card shows: establishment, city,
 * a modality line, the rating and its number of reviews. Never places, applications or access
 * rate: those stay in the Admission tab of the fiche.
 */

/** Modalities of the search index: presentiel | alternance | continue | distance. */
export interface ModalityInput {
  durationYears: number;
  entryLevel: 'M1' | 'M2' | string;
  modalities: string[];
}

/** « 2 ans · Présentiel », « M2 seul · en alternance », « 2 ans · Présentiel, formation continue ». */
export function modalityLine({ durationYears, entryLevel, modalities }: ModalityInput): string {
  const length =
    entryLevel === 'M2' ? 'M2 seul' : `${durationYears} an${durationYears > 1 ? 's' : ''}`;
  const has = (m: string) => modalities.includes(m);
  const ways = [
    has('presentiel') ? 'Présentiel' : null,
    has('alternance') ? 'en alternance' : null,
    has('continue') ? 'formation continue' : null,
    has('distance') ? 'à distance' : null,
  ].filter((x): x is string => !!x);
  if (!ways.length) return length;
  const [first, ...rest] = ways;
  return `${length} · ${[first!, ...rest].join(', ')}`;
}

/** « 12 avis » and « 83 % le recommandent » (null without reviews). */
export function reviewsLine(count: number, recommendShare: number | null) {
  if (!count) return null;
  return {
    count: `${count} avis`,
    recommend: recommendShare != null ? `${recommendShare} % le recommandent` : null,
  };
}

/** Cursus of a parcours as the index gives them (issue #21). */
export interface CursusInput {
  cursusCount?: number | null;
  cursusLabels?: string[] | null;
  cursusKind?: string | null;
}

/**
 * Line « 3 cursus » of a card, with the names up to 3 cursus (« 4 cursus » alone beyond). Only
 * for cursus named by a place or a suffix: a pair told apart by the rhythm only says « Initiale ou
 * alternance » on its pill, numbers that nothing tells apart show nothing.
 */
export function cursusLine(c: CursusInput): { count: string; names: string[] } | null {
  const n = c.cursusCount ?? 1;
  if (c.cursusKind !== 'named' || n < 2) return null;
  return { count: `${n} cursus`, names: n <= 3 ? (c.cursusLabels ?? []).slice(0, 3) : [] };
}

/** Pill of the rhythm: « Alternance », or « Initiale ou alternance » for a pair of both. */
export function rhythmPill(modalities: string[], c: CursusInput): string | null {
  if (c.cursusKind === 'rhythm') return 'Initiale ou alternance';
  return modalities.includes('alternance') ? 'Alternance' : null;
}
