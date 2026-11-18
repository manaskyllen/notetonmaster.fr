import type { ReviewStatus } from '@/lib/db/generated/enums';

/** Allowed moderation transitions. */
const TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  PENDING_CONFIRMATION: ['PENDING'],
  PENDING: ['PUBLISHED', 'NEEDS_EDIT', 'REJECTED'],
  PUBLISHED: ['HIDDEN', 'PUBLISHED'],
  NEEDS_EDIT: ['PENDING'],
  HIDDEN: ['PUBLISHED', 'REJECTED'],
  REJECTED: [],
};

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ReviewStatus, to: ReviewStatus): void {
  if (!canTransition(from, to)) throw new Error(`Transition not allowed: ${from} → ${to}`);
}

/** Every decision other than publishing needs a reason sent to the author. */
export function requiresReason(to: ReviewStatus): boolean {
  return to !== 'PUBLISHED' && to !== 'PENDING';
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING_CONFIRMATION: 'Mail à confirmer',
  PENDING: 'En attente',
  PUBLISHED: 'Publié',
  NEEDS_EDIT: 'À reformuler',
  HIDDEN: 'Masqué',
  REJECTED: 'Refusé',
};

/** Reports in the last 24 h at or above this threshold hide a review temporarily. */
export function shouldAutoHide(reportsLast24h: number, threshold: number): boolean {
  return threshold > 0 && reportsLast24h >= threshold;
}
