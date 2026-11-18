/**
 * Situation of graduates: « Et aujourd'hui ? » is required for a graduate's review,
 * and « Ton poste » (3 to 80 characters) when they are employed. Pure rules, tested.
 */

export const EMPLOYMENT_STATUSES = ['EMPLOYED', 'JOB_SEEKING', 'FURTHER_STUDY', 'OTHER'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Choice labels of the form. */
export const EMPLOYMENT_LABEL: Record<EmploymentStatus, string> = {
  EMPLOYED: 'En poste',
  JOB_SEEKING: 'En recherche',
  FURTHER_STUDY: 'En poursuite d’études',
  OTHER: 'Autre situation',
};

export const JOB_TITLE_MIN = 3;
export const JOB_TITLE_MAX = 80;
export const JOB_TITLE_HELP =
  'Un intitulé et un type de structure suffisent. Ne cite pas ton employeur : ça pourrait permettre de te reconnaître.';

export interface GraduateSituation {
  level?: string | null;
  employmentStatus?: string | null;
  jobTitle?: string | null;
}

/** Field errors of the situation; empty when valid. Only graduates answer it. */
export function graduateSituationErrors(s: GraduateSituation): Record<string, string> {
  if (s.level !== 'GRADUATE') return {};
  if (
    !s.employmentStatus ||
    !(EMPLOYMENT_STATUSES as readonly string[]).includes(s.employmentStatus)
  )
    return { employmentStatus: 'Dis-nous ce que tu fais aujourd’hui.' };
  if (s.employmentStatus !== 'EMPLOYED') return {};
  const title = (s.jobTitle ?? '').trim();
  if (title.length < JOB_TITLE_MIN)
    return { jobTitle: `Indique ton poste (${JOB_TITLE_MIN} caractères minimum).` };
  if (title.length > JOB_TITLE_MAX) return { jobTitle: `${JOB_TITLE_MAX} caractères maximum.` };
  return {};
}

/** What is stored: nothing for a non-graduate, no job title unless employed. */
export function normalizeSituation(s: GraduateSituation): {
  employmentStatus: EmploymentStatus | null;
  jobTitle: string | null;
} {
  if (s.level !== 'GRADUATE' || !s.employmentStatus)
    return { employmentStatus: null, jobTitle: null };
  const status = s.employmentStatus as EmploymentStatus;
  return {
    employmentStatus: status,
    jobTitle: status === 'EMPLOYED' ? (s.jobTitle ?? '').trim() || null : null,
  };
}

/** « en poste · chargé de mission patrimoine » — after « Aujourd'hui : » on a review card. */
export function todayLine(status?: string | null, jobTitle?: string | null): string | null {
  switch (status) {
    case 'EMPLOYED':
      return jobTitle?.trim() ? `en poste · ${jobTitle.trim()}` : 'en poste';
    case 'JOB_SEEKING':
      return 'en recherche d’emploi';
    case 'FURTHER_STUDY':
      return 'en poursuite d’études';
    case 'OTHER':
      return 'autre situation';
    default:
      return null;
  }
}
