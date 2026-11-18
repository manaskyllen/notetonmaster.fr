import { cn } from '@/lib/cn';

export type Status = 'ok' | 'running' | 'warning' | 'stale' | 'error' | 'draft';

export const STATUS_LABEL: Record<Status, string> = {
  ok: 'À jour',
  running: 'En cours',
  warning: 'À vérifier',
  stale: 'Obsolète',
  error: 'Erreur',
  draft: 'Brouillon',
};

const STATUS_CLASS: Record<Status, string> = {
  ok: 'bg-success-bg text-success',
  running: 'bg-violet-100 text-violet-700',
  warning: 'bg-warning-bg text-warning',
  stale: 'bg-warning-bg text-warning',
  error: 'bg-danger-bg text-danger',
  draft: 'bg-surface-100 text-ink-muted',
};

/** Status never relies on color alone: label + dot shape (full, pulsing, hollow). */
export function StatusPill({
  status,
  children,
  className,
}: {
  status: Status;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-pill py-[5px] pr-3 pl-2.5 text-[13px] font-semibold whitespace-nowrap',
        STATUS_CLASS[status],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-pill',
          status === 'stale'
            ? 'size-1.5 border-2 border-current bg-transparent box-content'
            : 'size-2 bg-current',
          status === 'running' &&
            'animate-[nm-pulse_1.2s_ease-in-out_infinite] motion-reduce:animate-none',
        )}
      />
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}
