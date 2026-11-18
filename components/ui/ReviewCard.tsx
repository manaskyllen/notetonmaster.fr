import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { Grade } from './Grade';

export type ReviewLevel = 'M1' | 'M2' | 'D';

const LEVEL_CLASS: Record<ReviewLevel, string> = {
  M1: 'bg-coral-300 text-on-lime',
  M2: 'bg-violet-100 text-violet-700',
  D: 'bg-lime-400 text-on-lime',
};

export interface ReviewCardProps {
  level: ReviewLevel;
  /** e.g. "M2 · promo 2025" — never a name. */
  who: string;
  date?: string;
  rating: number;
  title?: string | null;
  plus: string;
  minus: string;
  verified?: boolean;
  /** Shows the "Ouvert aux questions" label. */
  openToQuestions?: boolean;
  /** Graduates: « en poste · chargé de mission patrimoine » (after « Aujourd'hui : »). */
  today?: string | null;
  /** Helpful button, report link, ask button… (defaults to a report link only). */
  actions?: React.ReactNode;
  /** Content rendered under the actions (e.g. the question form). */
  footer?: React.ReactNode;
  /** Between the text and the actions: the reply of the teaching team (droit de réponse). */
  reply?: React.ReactNode;
  reportHref?: string;
  className?: string;
  headingLevel?: 'h2' | 'h3';
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-pill bg-success-bg px-2 py-0.5 text-[12px] font-bold text-success">
      <Icon name="check" size={12} strokeWidth={2.8} />
      Parcours vérifié
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-pill bg-surface-100 px-2 py-0.5 text-[12px] font-bold text-ink">
      Non vérifié
    </span>
  );
}

export function ReviewCard({
  level,
  who,
  date,
  rating,
  title,
  plus,
  minus,
  verified = true,
  openToQuestions,
  today,
  actions,
  footer,
  reply,
  reportHref = '/signaler',
  className,
  headingLevel = 'h3',
}: ReviewCardProps) {
  const H = headingLevel;
  return (
    <article
      className={cn(
        'flex flex-col gap-3.5 rounded-lg border border-border bg-surface-0 p-6 text-ink max-sm:p-4.5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-11 flex-none items-center justify-center rounded-[14px] font-display text-[16px] font-extrabold',
              LEVEL_CLASS[level],
            )}
          >
            {level}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-bold">Anonyme · {who}</span>
            <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <VerifiedBadge verified={verified} />
              {openToQuestions && (
                <span className="rounded-pill bg-violet-100 px-2 py-0.5 text-[12px] font-bold text-violet-700">
                  Ouvert aux questions
                </span>
              )}
              {date}
            </span>
          </span>
        </div>
        <Grade value={rating} />
      </div>
      {title ? <H className="m-0 font-display text-h3 font-bold">« {title} »</H> : null}
      {today ? (
        <span className="inline-flex items-center gap-2 self-start rounded-[12px] bg-surface-50 px-3.5 py-2 text-[14px] text-ink">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none"
          >
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
            <path d="M3 13h18" />
          </svg>
          <span>
            <strong>Aujourd’hui :</strong> {today}
          </span>
        </span>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
        <div className="flex flex-col gap-1.5 rounded-md bg-lime-100 px-4 py-3.5 text-[15px] leading-[1.5]">
          <span className="text-[12px] font-bold tracking-[0.05em] text-lime-800 uppercase">
            On a aimé
          </span>
          <span className="whitespace-pre-line">{plus}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-md bg-coral-100 px-4 py-3.5 text-[15px] leading-[1.5]">
          <span className="text-[12px] font-bold tracking-[0.05em] text-coral-800 uppercase">
            Moins bien
          </span>
          <span className="whitespace-pre-line">{minus}</span>
        </div>
      </div>
      {reply}
      <div className="flex flex-wrap items-center gap-2.5">
        {actions ?? <ReportLink href={reportHref} />}
      </div>
      {footer}
    </article>
  );
}

export function ReportLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-tap items-center px-3.5 text-[14px] text-ink-muted underline"
    >
      Signaler
    </Link>
  );
}

/** Presentational "Utile" toggle; wire `onClick` to a server action from a client wrapper. */
/**
 * « Utile » (.vote): on a vote the button turns lime, the thumb tips over, a
 * « +1 » flies off, four sparks burst and the counter scrolls. `celebrate` is set only right
 * after the visitor's click, so nothing plays on load or when the vote is taken back.
 */
export function HelpfulButton({
  count,
  pressed,
  celebrate,
  ...rest
}: {
  count: number;
  pressed: boolean;
  celebrate?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const party = pressed && celebrate;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-celebrate={party ? '' : undefined}
      className={cn(
        'nm-vote relative inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-pill border-[1.5px] px-4 font-sans text-[14px] font-semibold text-ink',
        pressed ? 'border-lime-400 bg-lime-400 text-on-lime' : 'border-border-control bg-surface-0',
      )}
      {...rest}
    >
      <span className="nm-thumb inline-flex">
        <Icon name="thumb" size={16} />
      </span>
      Utile ·
      <span className="inline-flex h-[1.3em] overflow-hidden tabular-nums">
        <span key={count} className={party ? 'nm-roll' : undefined}>
          {count}
        </span>
      </span>
      {party && (
        <>
          <span className="nm-plus1" aria-hidden="true">
            +1
          </span>
          <span className="nm-spark nm-s1" aria-hidden="true" />
          <span className="nm-spark nm-s2" aria-hidden="true" />
          <span className="nm-spark nm-s3" aria-hidden="true" />
          <span className="nm-spark nm-s4" aria-hidden="true" />
        </>
      )}
    </button>
  );
}
