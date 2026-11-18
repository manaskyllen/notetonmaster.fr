import { FillBar } from './FillBar';
import { formatRating } from '@/lib/format';

export interface ScoreBarProps {
  label: React.ReactNode;
  value: number | null;
  max?: number;
}

export function ScoreBar({ label, value, max = 5 }: ScoreBarProps) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="grid grid-cols-[minmax(110px,170px)_1fr_40px] items-center gap-3 text-[15px]">
      <span>{label}</span>
      <FillBar fraction={pct / 100} trackClassName="h-3 bg-surface-100" className="bg-violet-500" />
      <span className="text-right font-bold tabular-nums">
        {value == null ? 'n.c.' : formatRating(value)}
        <span className="sr-only"> sur {max}</span>
      </span>
    </div>
  );
}
