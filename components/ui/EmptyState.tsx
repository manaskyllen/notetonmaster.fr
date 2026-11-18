import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed border-border-control bg-surface-0 px-6 py-9 text-center text-ink',
        className,
      )}
    >
      <span className="font-display text-[22px] font-bold">{title}</span>
      {children ? (
        <span className="max-w-[46ch] text-[15px] text-ink-muted">{children}</span>
      ) : null}
      {action}
    </div>
  );
}
