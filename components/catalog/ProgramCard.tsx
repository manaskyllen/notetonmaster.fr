import Link from 'next/link';
import { Grade } from '@/components/ui/Grade';
import { MatchedBy } from '@/components/ui/MatchedBy';
import type { MatchedBy as MatchedByValue } from '@/lib/domain/search';
import { cn } from '@/lib/cn';
import { cursusLine, modalityLine, reviewsLine, rhythmPill } from '@/lib/domain/program-card';
import { uniToneOf } from '@/lib/ui-helpers';

/** What the card needs, from the search index (Explorer, mention) or another query. */
export interface ProgramCardData {
  programId: string;
  slug: string;
  title: string;
  universityId: string;
  /** Short name of the directory, on the pill; the full name in its title. */
  universityShort: string;
  universityName: string;
  cityName: string;
  modalities: string[];
  entryLevel: string;
  durationYears: number;
  isPublicSector: boolean;
  avgRating: number | null;
  reviewCount: number;
  recommendShare: number | null;
  /** Cursus of the parcours (issue #21), from the search index. */
  cursusCount?: number;
  cursusLabels?: string[];
  cursusKind?: string;
  matchedBy?: MatchedByValue | null;
}

/**
 * The card of a master, the same in Explorer, « Même mention,
 * ailleurs » and Masters suivis: establishment and city (« Alternance » if so), the heart
 * « Suivre » top right (slot), the title, a modality line, then the overall rating tilted by −3°
 * with the number of reviews and the share that recommend it. Never places nor applications.
 * Presentational: usable from a server or a client component; the islands come as slots.
 */
export function ProgramCard({
  p,
  index = 0,
  follow,
  badge,
  action,
  firstReviewLink,
  className,
}: {
  p: ProgramCardData;
  /** Position in the list: delay of the cascade. */
  index?: number;
  /** « Suivre » heart (FollowButton variant="icon"), or the « Ne plus suivre » of Mon espace. */
  follow?: React.ReactNode;
  /** Under the title (Masters suivis: « 2 nouveaux avis »). */
  badge?: React.ReactNode;
  /** Right of the footer (« Comparer »). */
  action?: React.ReactNode;
  /** « Pas encore d'avis · Donner le premier » (Même mention, ailleurs). */
  firstReviewLink?: boolean;
  /** Animation of the list (`nm-drop` by default, `mm-card` under a fiche). */
  className?: string;
}) {
  const reviews = p.avgRating != null ? reviewsLine(p.reviewCount, p.recommendShare) : null;
  const cursus = cursusLine(p);
  const rhythm = rhythmPill(p.modalities, p);
  return (
    <li
      className={cn(
        'nm-lift nm-followcard relative flex flex-col gap-3 rounded-[22px] border-2 border-border bg-surface-0 p-4.75',
        className ?? 'nm-drop',
      )}
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      {follow}
      <div className="flex flex-wrap items-center gap-1.5 pr-13">
        <span
          title={p.universityName}
          className={cn(
            'rounded-pill px-2.5 py-1 text-[12px] font-bold',
            uniToneOf(p.universityId),
          )}
        >
          {p.universityShort}
        </span>
        <span className="text-[13px] text-ink-muted">{p.cityName}</span>
        {rhythm && (
          <span className="rounded-pill bg-warning-bg px-2.5 py-1 text-[12px] font-bold text-warning">
            {rhythm}
          </span>
        )}
        {!p.isPublicSector && (
          <span className="rounded-pill bg-coral-100 px-2.5 py-1 text-[12px] font-bold text-coral-800">
            Établissement privé
          </span>
        )}
      </div>
      <Link
        href={`/parcours/${p.slug}`}
        className="font-display text-[20px] leading-[1.15] font-bold text-ink no-underline hover:underline"
      >
        {p.title}
      </Link>
      <span className="text-[14px] text-ink-soft">{modalityLine(p)}</span>
      {cursus && (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[13px] font-bold text-ink">{cursus.count}</span>
          {cursus.names.map((n) => (
            <span
              key={n}
              className="inline-flex items-center rounded-[8px] bg-surface-100 px-2.25 py-0.75 text-[12px] font-semibold text-ink-soft"
            >
              {n}
            </span>
          ))}
        </span>
      )}
      {p.matchedBy && <MatchedBy match={p.matchedBy} />}
      {badge}
      <div className="mt-auto flex items-center justify-between gap-2">
        {reviews ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <Grade value={p.avgRating!} size="s" className="flex-none" />
            <span className="flex flex-col text-[12px] leading-[1.3] text-ink-soft">
              <strong className="text-[14px] text-ink">{reviews.count}</strong>
              {reviews.recommend}
            </span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-muted">
            Pas encore d’avis
            {firstReviewLink && (
              <>
                {' · '}
                <Link href={`/avis/nouveau?parcours=${p.slug}`} className="font-bold">
                  Donner le premier
                </Link>
              </>
            )}
          </span>
        )}
        {action}
      </div>
    </li>
  );
}
