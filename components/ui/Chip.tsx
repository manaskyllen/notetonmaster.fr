import { cn } from '@/lib/cn';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  count?: number;
  /** filter: toggle with aria-pressed · suggest: dashed suggestion */
  variant?: 'filter' | 'suggest';
}

export function chipClasses(
  selected: boolean,
  variant: 'filter' | 'suggest' = 'filter',
  className?: string,
) {
  return cn(
    'nm-chip group inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-pill border-[1.5px] px-4 font-sans text-ink no-underline',
    variant === 'suggest'
      ? 'border-dashed border-border-control bg-transparent text-[14px] font-medium'
      : selected
        ? 'border-night bg-night text-[15px] font-semibold text-on-night'
        : 'border-border-control bg-surface-0 text-[15px] font-semibold',
    className,
  );
}

export function ChipCount({ count, selected }: { count: number; selected?: boolean }) {
  return (
    <span
      // Keyed by the value: a new count fades in (type filters of the home page).
      key={count}
      className={cn(
        'nm-count rounded-pill px-2 py-0.5 text-[12px] font-bold',
        selected ? 'bg-lime-400 text-on-lime' : 'bg-surface-100 text-ink',
      )}
    >
      {count}
    </span>
  );
}

export function Chip({
  selected = false,
  count,
  variant = 'filter',
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={variant === 'suggest' ? undefined : selected}
      className={chipClasses(selected, variant, className)}
      {...rest}
    >
      {children}
      {count !== undefined && (
        <ChipCount count={count} selected={selected && variant !== 'suggest'} />
      )}
    </button>
  );
}
