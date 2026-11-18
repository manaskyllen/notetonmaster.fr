import Link from 'next/link';
import { Suspense } from 'react';
import { cn } from '@/lib/cn';
import {
  pageCount,
  pageHref,
  pageItems,
  PER_PAGE,
  rangeSummary,
  type Params,
} from '@/lib/pagination';
import { Icon } from './Icon';
import { PageFocus } from './PageFocus';

/**
 * Page navigation of a server-paginated list. Real links (?page=6): it works without
 * JavaScript and search engines can follow it. Desktop: Précédent, 1 … 4 5 6 7 8 … 42, Suivant;
 * mobile: « Précédent · Page 6 sur 42 · Suivant ». After a change of page, PageFocus brings the
 * list back to the top of the screen and moves the focus to its title.
 */
export interface PaginationProps {
  pathname: string;
  params: Params;
  page: number;
  perPage: number;
  total: number;
  /** id of the list title: focused after a change of page. */
  targetId?: string;
  className?: string;
}

const round =
  'inline-flex size-11 items-center justify-center rounded-pill border-[1.5px] border-[#d7d3e0] bg-white text-[15px] font-semibold text-ink no-underline dark:border-border-control dark:bg-surface-0';
const wide =
  'inline-flex h-11 items-center gap-1.5 rounded-pill border-[1.5px] border-[#d7d3e0] bg-white px-4 text-[15px] font-semibold text-ink no-underline dark:border-border-control dark:bg-surface-0';

function Step({
  href,
  dir,
  compact,
}: {
  href: string | null;
  dir: 'prev' | 'next';
  compact?: boolean;
}) {
  const label = dir === 'prev' ? 'Précédent' : 'Suivant';
  const icon = (
    <Icon name="arrow" size={16} className={dir === 'prev' ? 'rotate-180' : undefined} />
  );
  const body =
    dir === 'prev' ? (
      <>
        {icon}
        <span className={compact ? 'sr-only min-[360px]:not-sr-only' : undefined}>{label}</span>
      </>
    ) : (
      <>
        <span className={compact ? 'sr-only min-[360px]:not-sr-only' : undefined}>{label}</span>
        {icon}
      </>
    );
  if (!href)
    return (
      <span
        aria-disabled="true"
        className={cn(wide, 'cursor-not-allowed border-border text-ink-muted dark:border-border')}
      >
        {body}
      </span>
    );
  return (
    <Link href={href} scroll={false} className={cn(wide, 'nm-page-link')}>
      {body}
    </Link>
  );
}

export function Pagination({
  pathname,
  params,
  page,
  perPage,
  total,
  targetId,
  className,
}: PaginationProps) {
  const last = pageCount(total, perPage);
  const focus = targetId ? (
    <Suspense fallback={null}>
      <PageFocus targetId={targetId} />
    </Suspense>
  ) : null;
  if (last <= 1) return focus;
  const href = (p: number) => pageHref(pathname, params, p);
  const prev = page > 1 ? href(page - 1) : null;
  const next = page < last ? href(page + 1) : null;
  return (
    <nav aria-label="Pagination" className={cn('flex justify-center', className)}>
      {focus}
      {/* Desktop */}
      <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-2 p-0 max-sm:hidden">
        <li>
          <Step href={prev} dir="prev" />
        </li>
        {pageItems(page, last).map((it, i) =>
          it === 'gap' ? (
            <li key={`gap${i}`} aria-hidden="true" className="px-1 text-ink-muted">
              …
            </li>
          ) : (
            <li key={it}>
              {it === page ? (
                <span
                  aria-current="page"
                  className="inline-flex size-11 items-center justify-center rounded-pill border-[1.5px] border-violet-500 bg-violet-500 text-[15px] font-semibold text-white"
                >
                  <span className="sr-only">Page </span>
                  {it}
                </span>
              ) : (
                <Link href={href(it)} scroll={false} className={cn(round, 'nm-page-link')}>
                  <span className="sr-only">Page </span>
                  {it}
                </Link>
              )}
            </li>
          ),
        )}
        <li>
          <Step href={next} dir="next" />
        </li>
      </ul>
      {/* Mobile */}
      <div className="flex items-center gap-3 sm:hidden">
        <Step href={prev} dir="prev" compact />
        <span aria-current="page" className="text-[15px] font-semibold whitespace-nowrap">
          Page {page} sur {last}
        </span>
        <Step href={next} dir="next" compact />
      </div>
    </nav>
  );
}

/** « 61–80 sur 7 746 parcours », above the list (a live region: it follows the filters). */
export function PageSummary({
  page,
  perPage,
  total,
  noun,
  plural,
  className,
}: {
  page: number;
  perPage: number;
  total: number;
  noun: string;
  plural?: string;
  className?: string;
}) {
  return (
    <span role="status" className={cn('text-[15px] font-semibold', className)}>
      {rangeSummary(page, perPage, total, noun, plural)}
    </span>
  );
}

/** Number of items per page (20, 50 or 100…), as links: no JavaScript needed. */
export function PerPageChoice({
  pathname,
  params,
  perPage,
  choices,
  defaultPerPage,
}: {
  pathname: string;
  params: Params;
  perPage: number;
  choices: readonly number[];
  defaultPerPage: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[14px] font-semibold">
      <span id="perpage-label">Par page</span>
      <span role="group" aria-labelledby="perpage-label" className="inline-flex gap-1">
        {choices.map((n) =>
          n === perPage ? (
            <span
              key={n}
              aria-current="true"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-pill bg-night px-2.5 text-on-night"
            >
              {n}
            </span>
          ) : (
            <Link
              key={n}
              scroll={false}
              href={pageHref(pathname, params, 1, {
                [PER_PAGE]: n === defaultPerPage ? null : String(n),
              })}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-pill border-[1.5px] border-[#d7d3e0] bg-white px-2.5 text-ink no-underline dark:border-border-control dark:bg-surface-0"
            >
              {n}
            </Link>
          ),
        )}
      </span>
    </span>
  );
}

/** Below a capped search (1 000 results): « Affine ta recherche pour voir la suite ». */
export function SearchCapNotice({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <p className="m-0 text-center text-[14px] text-ink-muted">
      Affine ta recherche pour voir la suite.
    </p>
  );
}
