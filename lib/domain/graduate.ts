/**
 * « Et aujourd'hui ? »: required for a graduate's review, with « Ton poste » (3 to 80 characters)
 * when they are employed; optional for someone who left the master during the year (LEFT), never
 * with a job title. Pure rules, tested.
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

/** Choices for LEFT, in this order (same values, words of someone who did not finish). */
export const LEFT_STATUSES = ['FURTHER_STUDY', 'EMPLOYED', 'JOB_SEEKING', 'OTHER'] as const;
export const LEFT_LABEL: Record<EmploymentStatus, string> = {
  FURTHER_STUDY: 'Dans une autre formation',
  EMPLOYED: 'En emploi',
  JOB_SEEKING: 'En recherche',
  OTHER: 'Autre situation',
};
export const LEFT_HELP =
  'Ton avis compte autant que celui des diplômé·es : savoir pourquoi on part aide les suivant·es à choisir.';

/** Levels that answer « Et aujourd'hui ? ». */
export const hasSituation = (level?: string | null) => level === 'GRADUATE' || level === 'LEFT';

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
  if (s.level === 'LEFT')
    return s.employmentStatus &&
      !(EMPLOYMENT_STATUSES as readonly string[]).includes(s.employmentStatus)
      ? { employmentStatus: 'Choix inconnu.' }
      : {};
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

/** What is stored: nothing for M1 / M2, a job title only for an employed graduate. */
export function normalizeSituation(s: GraduateSituation): {
  employmentStatus: EmploymentStatus | null;
  jobTitle: string | null;
} {
  if (!hasSituation(s.level) || !s.employmentStatus)
    return { employmentStatus: null, jobTitle: null };
  const status = s.employmentStatus as EmploymentStatus;
  return {
    employmentStatus: status,
    jobTitle:
      s.level === 'GRADUATE' && status === 'EMPLOYED' ? (s.jobTitle ?? '').trim() || null : null,
  };
}

/**
 * « en poste · chargé de mission patrimoine » — after « Aujourd'hui : » on a review card. For
 * LEFT, the words of its choices (« dans une autre formation », « en emploi »…).
 */
export function todayLine(
  status?: string | null,
  jobTitle?: string | null,
  level?: string | null,
): string | null {
  if (level === 'LEFT')
    return status && (EMPLOYMENT_STATUSES as readonly string[]).includes(status)
      ? LEFT_LABEL[status as EmploymentStatus].toLowerCase()
      : null;
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
