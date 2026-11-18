import { FillBar } from './FillBar';
import { cn } from '@/lib/cn';

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  valueLabel?: string;
  tone?: 'success' | 'warning' | 'danger';
  className?: string;
}

const FILL = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' } as const;

export function ProgressBar({
  value,
  max = 100,
  label,
  valueLabel,
  tone,
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {(label || valueLabel) && (
        <div className="flex justify-between gap-2 text-[13px] text-ink-muted">
          {/* A new step of a running sync fades in. */}
          <span key={label} className="nm-count">
            {label}
          </span>
          <span>{valueLabel ?? `${Math.round(pct)} %`}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label ?? 'Progression'}
      >
        <FillBar
          fraction={pct / 100}
          trackClassName="h-2 bg-surface-100"
          className={tone ? FILL[tone] : 'bg-violet-500'}
        />
      </div>
    </div>
  );
}
