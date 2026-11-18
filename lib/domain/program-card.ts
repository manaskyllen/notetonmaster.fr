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
