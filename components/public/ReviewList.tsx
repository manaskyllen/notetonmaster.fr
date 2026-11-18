'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import {
  chipClasses,
  HelpfulButton,
  ReportLink,
  ReviewCard,
  type ReviewLevel,
} from '@/components/ui';
import { todayLine } from '@/lib/domain/graduate';
import type { ReviewLevelId } from '@/lib/domain/review-filters';
import { gradeColor, LEVEL_SHORT } from '@/lib/domain/rating';
import { formatRating } from '@/lib/format';
import { toggleHelpful } from '@/app/(public)/parcours/actions';
import { AskQuestionToggle } from './AskQuestion';
import { DrReply } from './DrReply';

export interface ReviewItem {
  id: string;
  ref: string;
  level: 'M1' | 'M2' | 'GRADUATE';
  employmentStatus: 'EMPLOYED' | 'JOB_SEEKING' | 'FURTHER_STUDY' | 'OTHER' | null;
  jobTitle: string | null;
  who: string;
  date: string;
  rating: number;
  title: string | null;
  pros: string;
  cons: string;
  isVerified: boolean;
  acceptsQuestions: boolean;
  helpfulCount: number;
  voted: boolean;
  reply?: { body: string; domain: string; date: string } | null;
}

type Level = ReviewLevelId;

/** Figures of the « Note globale » card, over every review of the level filter (not the page). */
export interface ReviewFigures {
  count: number;
  avg: number | null;
  verified: number;
  positiveShare: number | null;
  graduates: number;
  employed: number;
}

export interface ReviewLink {
  id: string;
  label: string;
  href: string;
}

function Helpful({ review }: { review: ReviewItem }) {
  const [state, setState] = useState({
    count: review.helpfulCount,
    voted: review.voted,
    celebrate: false,
  });
  const [pending, start] = useTransition();
  return (
    <HelpfulButton
      count={state.count}
      pressed={state.voted}
      celebrate={state.celebrate}
      disabled={pending}
      onClick={() => {
        // Optimistic: the vote shows at once; the server's count comes right after.
        const voted = !state.voted;
        setState({ count: state.count + (voted ? 1 : -1), voted, celebrate: voted });
        start(async () => {
          const r = await toggleHelpful(review.id);
          if ('count' in r) setState((s) => ({ ...s, count: r.count, voted: r.voted }));
        });
      }}
    />
  );
}

const LEVEL_SUFFIX = { all: '', M1: ' · M1', M2: ' · M2', GRADUATE: ' · diplômé·es' } as const;

/**
 * "Note globale" card: average, count and verified share of the reviews of the level filter.
 * Its background follows the average from red to green (500ms when the filter changes).
 */
function OverallCard({ stats, level }: { stats: ReviewFigures; level: Level }) {
  if (stats.avg == null || !stats.count) return null;
  const text = formatRating(stats.avg);
  return (
    <div
      className="nm-overall flex flex-[1_1_240px] flex-col gap-1.5 rounded-lg p-6 text-on-lime"
      style={{ backgroundColor: gradeColor(stats.avg) }}
    >
      <span className="text-[14px] font-semibold">Note globale</span>
      <span
        role="img"
        aria-label={`Note globale : ${text} sur 5`}
        data-testid="overall-rating"
        className="font-display text-[72px] leading-none font-extrabold tracking-[-0.04em]"
      >
        <span aria-hidden="true">{text}</span>
        <span aria-hidden="true" className="text-[28px]">
          /5
        </span>
      </span>
      <span className="text-[14px]">
        sur {stats.count} avis, dont {stats.verified} vérifié{stats.verified > 1 ? 's' : ''}
        {LEVEL_SUFFIX[level]}
      </span>
    </div>
  );
}

export function ReviewList({
  reviews,
  stats,
  level,
  levels,
  sorts,
  sort,
  pagination,
  chatEnabled,
  loggedIn,
  criteria,
}: {
  /** The reviews of the page. */
  reviews: ReviewItem[];
  stats: ReviewFigures;
  level: Level;
  /** Level filters and sorts, as links (?niveau=…&tri=…, back to page 1). */
  levels: ReviewLink[];
  sorts: ReviewLink[];
  sort: string;
  pagination?: React.ReactNode;
  chatEnabled: boolean;
  loggedIn?: boolean;
  /** Detailed criteria bars, shown next to the "Note globale" card. */
  criteria?: React.ReactNode;
}) {
  // One read per visitor and per day for the reviews of this page (Mon espace › Lectures).
  const ids = reviews.map((r) => r.id).join(',');
  useEffect(() => {
    if (!ids) return;
    void fetch('/api/reviews/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ids.split(',') }),
      keepalive: true,
    }).catch(() => {});
  }, [ids]);
  const shown = reviews;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <OverallCard stats={stats} level={level} />
        {criteria && stats.count > 0 && (
          <div className="flex flex-[2_1_340px] flex-col gap-3.5 rounded-lg border border-border bg-surface-0 p-6">
            {criteria}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="avis-titre"
          className="m-0 font-display text-[30px] font-extrabold tracking-[-0.02em] max-sm:text-[26px]"
        >
          Ce qu’en disent les étudiant·es
        </h2>
        <nav aria-label="Filtrer les avis par niveau" className="flex flex-wrap gap-1.5">
          {levels.map((f) => (
            <Link
              key={f.id}
              href={f.href}
              scroll={false}
              aria-current={level === f.id ? 'true' : undefined}
              className={chipClasses(level === f.id, 'filter', 'px-3.5 text-[14px]')}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>
      <nav aria-label="Trier les avis" className="flex flex-wrap items-center gap-1.5 text-[14px]">
        <span className="font-semibold">Trier :</span>
        {sorts.map((o) => (
          <Link
            key={o.id}
            href={o.href}
            scroll={false}
            aria-current={sort === o.id ? 'true' : undefined}
            className={
              sort === o.id
                ? 'rounded-pill bg-surface-100 px-3 py-1.5 font-bold text-ink no-underline'
                : 'rounded-pill px-3 py-1.5 font-semibold text-ink-muted'
            }
          >
            {o.label}
          </Link>
        ))}
      </nav>
      <div key={ids} className="flex flex-col gap-4">
        {shown.map((r) => {
          const ask =
            r.acceptsQuestions && chatEnabled ? (
              <AskQuestionToggle review={r} loggedIn={loggedIn} />
            ) : null;
          return (
            <div key={r.id} id={r.ref} className="nm-drop scroll-mt-24">
              <ReviewCard
                level={LEVEL_SHORT[r.level] as ReviewLevel}
                who={r.who}
                date={r.date}
                rating={r.rating}
                title={r.title}
                plus={r.pros}
                minus={r.cons}
                verified={r.isVerified}
                openToQuestions={r.acceptsQuestions}
                today={r.level === 'GRADUATE' ? todayLine(r.employmentStatus, r.jobTitle) : null}
                reply={r.reply ? <DrReply {...r.reply} /> : undefined}
                actions={
                  <>
                    <Helpful review={r} />
                    {ask}
                    <ReportLink href={`/signaler?avis=${r.ref}`} />
                  </>
                }
              />
            </div>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-control bg-surface-0 p-7 text-center text-[15px] text-ink-muted">
          Pas encore d’avis pour ce niveau. Tu es concerné·e ? Lance-toi.
        </div>
      )}
      {pagination}
    </div>
  );
}
