import { cn } from '@/lib/cn';

/** Placeholder block while data loads: surface-100 with a sweeping highlight (1.4s loop). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('nm-skeleton block', className)} />;
}

/** Accessible wrapper of a loading page: announced once, never an empty screen. */
export function LoadingPage({
  label = 'Chargement…',
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-4', className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
