/**
 * Level filters of the reviews of a program (« Tous · M1 · M2 · Diplômé·es · Parti·es avant
 * la fin »). `onlyIfAny`: shown only when the fiche has at least one review of that level.
 */
export const REVIEW_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'M1', label: 'M1' },
  { id: 'M2', label: 'M2' },
  { id: 'GRADUATE', label: 'Diplômé·es' },
  { id: 'LEFT', label: 'Parti·es avant la fin', onlyIfAny: true },
] as const;
export type ReviewLevelId = (typeof REVIEW_FILTERS)[number]['id'];

/** End of « sur N avis, dont X vérifiés » when a level filter is on. */
export const LEVEL_SUFFIX: Record<ReviewLevelId, string> = {
  all: '',
  M1: ' · M1',
  M2: ' · M2',
  GRADUATE: ' · diplômé·es',
  LEFT: ' · parti·es avant la fin',
};

/** The filters to show, given the number of published reviews per level of the fiche. */
export function visibleReviewFilters(byLevel: Partial<Record<string, number>>, current: string) {
  return REVIEW_FILTERS.filter(
    (f) => !('onlyIfAny' in f) || (byLevel[f.id] ?? 0) > 0 || current === f.id,
  );
}
