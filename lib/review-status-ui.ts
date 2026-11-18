import type { ReviewStatus } from '@/lib/db/generated/enums';

/** Student-facing status labels and pill colors. */
export const STUDENT_STATUS: Record<ReviewStatus, { label: string; cls: string }> = {
  PENDING_CONFIRMATION: { label: 'Mail à confirmer', cls: 'bg-surface-100 text-ink' },
  PENDING: { label: 'En relecture', cls: 'bg-violet-100 text-violet-700' },
  PUBLISHED: { label: 'Publié', cls: 'bg-success-bg text-success' },
  NEEDS_EDIT: { label: 'À reformuler', cls: 'bg-warning-bg text-warning' },
  HIDDEN: { label: 'Masqué', cls: 'bg-surface-100 text-ink-muted' },
  REJECTED: { label: 'Refusé', cls: 'bg-danger-bg text-danger' },
};
