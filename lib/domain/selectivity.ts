/**
 * Selectivity: "≈ 1 proposition pour N candidatures", N = round(applications / offers).
 * This is an in-house calculation and must never be called an "admission rate".
 */
export interface Selectivity {
  /** N in "1 proposition pour N candidatures"; null when not computable. */
  ratio: number | null;
  /** Share of offers over applications, 0–100, for the meter bar. */
  percent: number | null;
  text: string;
}

export function computeSelectivity(
  applications: number | null | undefined,
  offers: number | null | undefined,
): Selectivity {
  if (!applications || !offers || applications <= 0 || offers <= 0) {
    return { ratio: null, percent: null, text: 'Données non publiées' };
  }
  const ratio = Math.max(1, Math.round(applications / offers));
  const percent = Math.min(100, Math.max(2, Math.round((offers / applications) * 100)));
  return {
    ratio,
    percent,
    text: `≈ 1 proposition pour ${ratio} candidature${ratio > 1 ? 's' : ''}`,
  };
}
