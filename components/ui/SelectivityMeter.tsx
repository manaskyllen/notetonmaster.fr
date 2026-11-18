import { FillBar } from './FillBar';
import { cn } from '@/lib/cn';
import { computeSelectivity } from '@/lib/domain/selectivity';

export interface SelectivityMeterProps {
  offers: number | null | undefined;
  applications: number | null | undefined;
  label?: string;
  /** Replacement text when Mon Master data is missing (e.g. "Taux d'accès 43 % (rentrée 2024)"). */
  fallback?: React.ReactNode;
  /** Source line rendered under the meter. */
  source?: React.ReactNode;
  className?: string;
}

export function SelectivityMeter({
  offers,
  applications,
  label = 'Sélectivité',
  fallback,
  source,
  className,
}: SelectivityMeterProps) {
  const s = computeSelectivity(applications, offers);
  return (
    <div className={cn('flex flex-col gap-2.5 rounded-lg bg-night p-5.5 text-on-night', className)}>
      <span className="text-[14px] font-medium text-on-night-muted">{label}</span>
      <span className="font-display text-[28px] leading-[1.05] font-extrabold">
        {s.ratio == null && fallback ? fallback : s.text}
      </span>
      <FillBar
        fraction={(s.percent ?? 0) / 100}
        trackClassName="h-2.5 bg-white/18"
        className="bg-lime-400"
      />
      {source ? <span className="text-[13px] text-on-night-muted">{source}</span> : null}
    </div>
  );
}
