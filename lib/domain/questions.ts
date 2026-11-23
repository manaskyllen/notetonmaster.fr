/**
 * Questions publiques (feature 6): best answer, sorts, labels. Pure functions.
 */
import { authorWho, type ReviewLevelKey } from './rating';

export const QUESTIONS_PER_PAGE = 10;
export const QUESTION_MAX = 300;
export const ANSWER_MAX = 1500;

export const QUESTION_SORTS = [
  { id: 'populaires', label: 'Populaires' },
  { id: 'recentes', label: 'Récentes' },
  { id: 'sans-reponse', label: 'Sans réponse' },
] as const;
export type QuestionSort = (typeof QUESTION_SORTS)[number]['id'];

export interface AnswerLike {
  id: string;
  kind: 'ALUMNI' | 'TEAM';
  voteCount: number;
  publishedAt: Date | null;
}

/**
 * The answer put forward: the official answer of the teaching team first (the earliest one), else
 * the most voted (the earliest on a tie). The others follow, most voted first.
 */
export function bestAnswer<A extends AnswerLike>(answers: A[]): { best: A | null; others: A[] } {
  if (!answers.length) return { best: null, others: [] };
  const t = (a: A) => a.publishedAt?.getTime() ?? 0;
  const team = answers.filter((a) => a.kind === 'TEAM').sort((a, b) => t(a) - t(b));
  const byVotes = [...answers].sort((a, b) => b.voteCount - a.voteCount || t(a) - t(b));
  const best = team[0] ?? byVotes[0]!;
  return { best, others: byVotes.filter((a) => a !== best) };
}

/**
 * « Diplômé·e · promo 2025 » / « M2 · promo 2026 » / « Parti·e avant la fin » (never a
 * year) / « Ancien·ne du parcours ».
 */
export function alumniWho(level: ReviewLevelKey | null, cohort: number | null): string {
  return level ? authorWho(level, cohort) : 'Ancien·ne du parcours';
}

export const BADGE = { ALUMNI: 'Parcours vérifié', TEAM: 'Réponse officielle' } as const;
export const TEAM_WHO = 'Équipe pédagogique · vérifiée';

/** « 3 réponses », « aucune réponse ». */
export function answersLabel(n: number): string {
  return n === 0 ? 'aucune réponse' : `${n} réponse${n > 1 ? 's' : ''}`;
}

/** « il y a 3 mois », « il y a 2 semaines », « il y a 2 jours », « aujourd’hui ». */
export function ago(d: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - d.getTime()) / 864e5);
  if (days < 1) return 'aujourd’hui';
  if (days === 1) return 'hier';
  if (days < 14) return `il y a ${days} jours`;
  if (days < 60) return `il y a ${Math.round(days / 7)} semaines`;
  if (days < 365) return `il y a ${Math.round(days / 30.44)} mois`;
  const y = Math.round(days / 365);
  return `il y a ${y} an${y > 1 ? 's' : ''}`;
}
