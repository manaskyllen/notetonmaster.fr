import { z } from 'zod';
import { REVIEW_LEVEL_IDS } from '@/lib/domain/rating';
import {
  EMPLOYMENT_STATUSES,
  graduateSituationErrors,
  JOB_TITLE_MAX,
  type GraduateSituation,
} from '@/lib/domain/graduate';

/** Shared Zod schemas (client forms and server actions). Messages in French. */
export const email = z
  .string({ error: 'Indique ton adresse mail.' })
  .trim()
  .min(1, 'Indique ton adresse mail.')
  .max(254, 'Adresse trop longue.')
  .email('Cette adresse ne semble pas valide.');

export const contactSchema = z
  .object({
    subject: z.enum(['missing', 'error', 'univ', 'programme', 'other'], {
      error: 'Choisis un sujet.',
    }),
    email,
    link: z.string().trim().max(500).optional().or(z.literal('')),
    message: z
      .string()
      .trim()
      .min(10, '10 caractères minimum.')
      .max(4000, '4 000 caractères maximum.'),
  })
  .refine((v) => (v.subject !== 'error' && v.subject !== 'programme') || !!v.link, {
    path: ['link'],
    message: 'Ajoute le lien de la fiche concernée.',
  });

export const CONTACT_SUBJECTS = {
  missing: 'Une formation manque',
  error: 'Une donnée est fausse',
  univ: 'Je représente une université',
  programme: 'Le programme d’un parcours',
  other: 'Autre chose',
} as const;

// ───────────── reviews ─────────────

/**
 * Minimum of « Ce que tu as aimé » and « Ce que tu n'as pas aimé », spaces at both ends not
 * counted: the schemas below (server) and the counters of the forms (client) all read it.
 */
export const REVIEW_MIN_CHARS = 15;

/** Counter under these two fields: « Encore 3 caractères au moins », then « C'est bon ✓ ». */
export function reviewTextHint(value: string): { text: string; tone: 'ok' | 'muted' } {
  const left = REVIEW_MIN_CHARS - value.trim().length;
  return left <= 0
    ? { text: 'C’est bon ✓', tone: 'ok' }
    : { text: `Encore ${left} caractère${left > 1 ? 's' : ''} au moins`, tone: 'muted' };
}
/** « Qu'est-ce qui t'a fait partir ? » (LEFT only, optional). */
export const LEAVE_REASON_MAX = 1500;
export const CURRENT_YEAR = new Date().getFullYear();

export const reviewStep1 = z.object({
  programSlug: z.string({ error: 'Choisis ton master.' }).min(1, 'Choisis ton master.'),
  level: z.enum(REVIEW_LEVEL_IDS, { error: 'Indique ton niveau.' }),
  cohortYear: z.coerce
    .number({ error: 'Indique ton année d’entrée.' })
    .int()
    .min(2000, 'Année invalide.')
    .max(CURRENT_YEAR, 'Année invalide.'),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).nullish().or(z.literal('')),
  jobTitle: z.string().trim().max(JOB_TITLE_MAX).nullish(),
});

/** Graduates: situation required, job title when employed (lib/domain/graduate.ts). */
function checkSituation(v: GraduateSituation, ctx: z.RefinementCtx) {
  for (const [path, message] of Object.entries(graduateSituationErrors(v)))
    ctx.addIssue({ code: 'custom', path: [path], message });
}

const criterionScore = z.coerce.number().int().min(1).max(5).optional();

export const reviewStep2 = z.object({
  overallRating: z.coerce
    .number({ error: 'Donne une note globale.' })
    .int()
    .min(1, 'Donne une note globale.')
    .max(5),
  pros: z
    .string()
    .trim()
    .min(REVIEW_MIN_CHARS, `${REVIEW_MIN_CHARS} caractères minimum.`)
    .max(3000, '3 000 caractères maximum.'),
  cons: z
    .string()
    .trim()
    .min(REVIEW_MIN_CHARS, `${REVIEW_MIN_CHARS} caractères minimum.`)
    .max(3000, '3 000 caractères maximum.'),
  leaveReason: z
    .string()
    .trim()
    .max(LEAVE_REASON_MAX, '1 500 caractères maximum.')
    .nullish()
    .or(z.literal('')),
  scores: z
    .object({
      CONTENT: criterionScore,
      SUPERVISION: criterionScore,
      INTERNSHIPS: criterionScore,
      ATMOSPHERE: criterionScore,
      OUTCOMES: criterionScore,
    })
    .default({}),
});

export const reviewStep3 = z.object({
  mode: z.enum(['none', 'account'], { error: 'Choisis comment publier.' }),
  email,
  acceptsQuestions: z.boolean().default(false),
  wantsBadge: z.boolean().default(false),
  charter: z.literal(true, { error: 'Coche la case pour accepter la charte.' }),
});

export const reviewSchema = reviewStep1
  .superRefine(checkSituation)
  .and(reviewStep2)
  .and(reviewStep3);
/** Step 1 as the form checks it before « Continuer ». */
export const reviewStep1Checked = reviewStep1.superRefine(checkSituation);
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Editing an existing review (from the student space). */
export const reviewEditSchema = reviewStep2
  .extend({
    level: reviewStep1.shape.level,
    cohortYear: reviewStep1.shape.cohortYear,
    employmentStatus: reviewStep1.shape.employmentStatus,
    jobTitle: reviewStep1.shape.jobTitle,
    acceptsQuestions: z.boolean().default(false),
  })
  .superRefine(checkSituation);

// ───────────── reports & legal notices ─────────────

export const REPORT_REASONS = {
  name: 'Il nomme ou vise une personne',
  insult: 'Il est injurieux ou haineux',
  false: 'Il contient des informations fausses',
  off: 'Il ne parle pas de la formation',
  fake: 'Je pense que l’auteur n’a pas suivi ce parcours',
} as const;

export const MESSAGE_REPORT_REASONS = {
  spam: 'Démarchage ou spam',
  harassment: 'Harcèlement ou pression',
  personal: 'Demande d’informations personnelles',
  other: 'Autre',
} as const;

export const simpleReportSchema = z.object({
  target: z.string().trim().min(1, 'Indique l’avis concerné (lien ou identifiant).').max(500),
  reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS], {
    error: 'Choisis un motif.',
  }),
  details: z.string().trim().max(2000).optional().or(z.literal('')),
  email: email.optional().or(z.literal('')),
});

export const NOTICE_QUALITIES = {
  person: 'Personne concernée par le contenu',
  school: 'Établissement d’enseignement',
  lawyer: 'Avocat·e ou représentant·e',
  other: 'Autre',
} as const;

export const formalNoticeSchema = z.object({
  name: z.string().trim().min(2, 'Indique ton nom ou ta raison sociale.').max(200),
  quality: z.enum(Object.keys(NOTICE_QUALITIES) as [keyof typeof NOTICE_QUALITIES], {
    error: 'Indique à quel titre tu agis.',
  }),
  email,
  url: z.string().trim().min(5, 'Indique l’adresse exacte du contenu.').max(500),
  grounds: z.string().trim().min(30, '30 caractères minimum.').max(5000),
  law: z.string().trim().max(300).optional().or(z.literal('')),
  goodFaith: z.literal(true, { error: 'La déclaration de bonne foi est obligatoire.' }),
});

// ───────────── messaging ─────────────

export const questionSchema = z.object({
  reviewId: z.string().cuid(),
  email,
  message: z
    .string()
    .trim()
    .min(10, '10 caractères minimum.')
    .max(2000, '2 000 caractères maximum.'),
});

export const replySchema = z.object({
  message: z.string().trim().min(2, 'Ton message est vide.').max(2000, '2 000 caractères maximum.'),
});
