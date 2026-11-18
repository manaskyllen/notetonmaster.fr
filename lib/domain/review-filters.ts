/** Level filters of the reviews of a program (« Tous · M1 · M2 · Diplômé·es »). */
export const REVIEW_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'M1', label: 'M1' },
  { id: 'M2', label: 'M2' },
  { id: 'GRADUATE', label: 'Diplômé·es' },
] as const;
export type ReviewLevelId = (typeof REVIEW_FILTERS)[number]['id'];
