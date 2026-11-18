import { formatRating } from '@/lib/format';

export const CRITERIA = [
  'CONTENT',
  'SUPERVISION',
  'INTERNSHIPS',
  'ATMOSPHERE',
  'OUTCOMES',
] as const;
export type CriterionKey = (typeof CRITERIA)[number];

export const CRITERION_LABEL: Record<CriterionKey, string> = {
  CONTENT: 'Contenu des cours',
  SUPERVISION: 'Encadrement & suivi',
  INTERNSHIPS: 'Stages & réseau pro',
  ATMOSPHERE: 'Ambiance de promo',
  OUTCOMES: 'Débouchés',
};

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** "4,3 · 6 avis" — a rating is always shown with its number of reviews. */
export function ratingSummary(values: number[]): {
  average: number | null;
  label: string;
  count: number;
} {
  const avg = average(values);
  const count = values.length;
  if (avg == null) return { average: null, label: 'Aucun avis', count };
  return { average: avg, label: `${formatRating(avg)} · ${count} avis`, count };
}

export const LEVEL_SHORT = { M1: 'M1', M2: 'M2', GRADUATE: 'D' } as const;
export const LEVEL_LABEL = { M1: 'M1', M2: 'M2', GRADUATE: 'Diplômé·e' } as const;

/**
 * Light tints from red (1) to green (5); the text on them stays `ink` (contrast ≥ 10:1).
 */
export const GRADE_STOPS = [
  [255, 176, 161], // 1 · #FFB0A1
  [255, 199, 154], // 2 · #FFC79A
  [255, 224, 122], // 3 · #FFE07A
  [212, 240, 117], // 4 · #D4F075
  [155, 224, 168], // 5 · #9BE0A8
] as const;

/** Background of a rating, interpolated in RGB for an average (4,1 → between 4 and 5). */
export function gradeColor(value: number, max = 5): string {
  const v = Number.isFinite(value) ? (value / max) * 5 : 1;
  const x = Math.max(1, Math.min(5, v)) - 1;
  const i = Math.min(3, Math.floor(x));
  const t = x - i;
  const a = GRADE_STOPS[i]!;
  const b = GRADE_STOPS[i + 1]!;
  return `rgb(${a.map((c, k) => Math.round(c + (b[k]! - c) * t)).join(', ')})`;
}
