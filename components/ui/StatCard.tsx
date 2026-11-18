import { CountUp } from './CountUp';
import { cn } from '@/lib/cn';

export type StatTone = 'default' | 'night' | 'brand' | 'lime';

const TONE: Record<StatTone, { box: string; muted: string }> = {
  default: { box: 'bg-surface-0 border-border text-ink', muted: 'text-ink-muted' },
  night: { box: 'bg-night border-night text-on-night', muted: 'text-on-night-muted' },
  brand: {
    box: 'bg-violet-500 border-violet-500 text-on-violet',
    muted: 'text-on-violet opacity-85',
  },
  lime: { box: 'bg-lime-400 border-lime-400 text-on-lime', muted: 'text-on-lime' },
};

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: StatTone;
  className?: string;
}

export function StatCard({ label, value, hint, tone = 'default', className }: StatCardProps) {
  const t = TONE[tone];
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-lg border p-5.5', t.box, className)}>
      <span className={cn('text-[14px] font-medium', t.muted)}>{label}</span>
      <span className="font-display text-stat tabular-nums max-sm:text-[40px]">
        {/* A number counts up from 0 the first time it shows (700ms). */}
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </span>
      {hint ? <span className={cn('text-[13px]', t.muted)}>{hint}</span> : null}
    </div>
  );
}
