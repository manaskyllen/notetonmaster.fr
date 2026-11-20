import { formatGrade } from '@/components/ui/Grade';
import { gradeColor } from '@/lib/domain/rating';

/**
 * The small tilted rating of the indexes and the city cards: « 4,1/5 · 12 avis ». Server-safe:
 * no hook, so the home renders it without shipping the index code.
 */
export function IndexRating({ avg, reviews }: { avg: number | null; reviews: number }) {
  if (avg == null || reviews === 0)
    return <span className="text-[13px] text-ink-muted">Pas encore d’avis</span>;
  const v = formatGrade(avg);
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
      <span
        role="img"
        aria-label={`Note moyenne : ${v} sur 5`}
        style={{ backgroundColor: gradeColor(avg, 5) }}
        className="inline-flex -rotate-3 items-baseline rounded-[8px] px-[7px] pt-0.5 pb-[3px] font-display text-[15px] leading-tight font-extrabold text-on-lime tabular-nums"
      >
        <span aria-hidden="true">{v}</span>
        <span aria-hidden="true" className="text-[10px] opacity-80">
          /5
        </span>
      </span>
      {reviews} avis
    </span>
  );
}
