import { cn } from '@/lib/cn';

export type Kind = 'parcours' | 'mention' | 'universite' | 'ville';

const KIND_CLASS: Record<Kind | 'neutral', string> = {
  parcours: 'bg-violet-100 text-violet-700',
  mention: 'bg-lime-100 text-lime-800',
  universite: 'bg-coral-100 text-coral-800',
  ville: 'bg-warning-bg text-warning',
  neutral: 'bg-surface-100 text-ink',
};

export const KIND_LABEL: Record<Kind, string> = {
  parcours: 'Parcours',
  mention: 'Mention',
  universite: 'Université',
  ville: 'Ville',
};

export interface BadgeProps {
  kind?: Kind | 'neutral';
  children?: React.ReactNode;
  className?: string;
}

export function Badge({ kind = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-bold tracking-[0.05em] uppercase',
        KIND_CLASS[kind],
        className,
      )}
    >
      {children ?? (kind !== 'neutral' ? KIND_LABEL[kind] : '')}
    </span>
  );
}
