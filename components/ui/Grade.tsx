import { cn } from '@/lib/cn';
import { gradeColor } from '@/lib/domain/rating';

export type GradeSize = 's' | 'm' | 'l';

const SIZE: Record<GradeSize, string> = {
  s: 'text-[18px]',
  m: 'text-[26px]',
  l: 'text-[44px]',
};

/** "4" for an integer, "4,1" for an average (one decimal, French comma). */
export function formatGrade(v: number): string {
  return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
}

export interface GradeProps {
  value: number;
  max?: number;
  size?: GradeSize;
  className?: string;
}

/**
 * A rating: the figure in a block tilted by −3°, like the "master" block of the logo, whose
 * background follows the rating from red (1) to green (5) (`gradeColor`). Never stars; the
 * figure stays the information, the colour is never used alone.
 */
export function Grade({ value, max = 5, size = 'm', className }: GradeProps) {
  const v = formatGrade(value);
  return (
    <span
      role="img"
      aria-label={`Note : ${v} sur ${max}`}
      style={{ backgroundColor: gradeColor(value, max) }}
      className={cn(
        'nm-grade inline-flex -rotate-3 items-baseline gap-px rounded-[0.46em] px-[0.46em] pt-[0.2em] pb-[0.28em] font-display leading-none font-extrabold tracking-[-0.03em] text-on-lime tabular-nums',
        SIZE[size],
        className,
      )}
    >
      <span aria-hidden="true">{v}</span>
      <span aria-hidden="true" className="text-[0.58em] opacity-80">
        /{max}
      </span>
    </span>
  );
}
