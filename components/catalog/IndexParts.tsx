'use client';

import { useEffect, useId, useRef } from 'react';
import { useSearchShortcut } from '@/components/public/SearchShortcut';
import { Icon } from '@/components/ui/Icon';
import { ShortcutKbd } from '@/components/ui/Kbd';
import { gradeColor } from '@/lib/domain/rating';
import { formatGrade } from '@/components/ui/Grade';

/**
 * Pieces shared by the indexes /mentions and /universites: the filter field (⌘K puts the cursor
 * in it on these pages), « Trier par », the small
 * tilted rating, the empty state, and the state kept in the address.
 */

export function IndexSearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}) {
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  useSearchShortcut({ kind: 'focus', get: () => field.current });
  return (
    <div className="nm-search-field flex min-w-0 flex-[0_1_440px] items-center gap-2.5 rounded-[18px] border-2 border-ink bg-surface-0 px-4 focus-within:shadow-[0_0_0_4px_var(--focus-halo)] max-sm:flex-auto">
      <Icon name="search" size={20} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={field}
        id={id}
        type="search"
        aria-keyshortcuts="Meta+K Control+K"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent py-3.5 text-[16px] text-ink outline-none placeholder:text-ink-muted"
      />
      {!value && <ShortcutKbd />}
    </div>
  );
}

export function IndexSort<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[14px] font-semibold whitespace-nowrap">
      Trier par
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-11 cursor-pointer rounded-[12px] border-[1.5px] border-border-control bg-surface-0 px-3 text-[14px] font-semibold text-ink"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** « 4,1/5 » tilted −3° on the colour of the rating, then « 12 avis »; or « Pas encore d’avis ». */
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

export function IndexEmpty({ title, onReset }: { title: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-border-control bg-surface-0 px-6 py-9 text-center">
      <span className="font-display text-[22px] font-bold">{title}</span>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-pill border-0 bg-ink px-4.5 text-[15px] font-bold text-surface-0"
      >
        Effacer les filtres
      </button>
    </div>
  );
}

/**
 * Keeps the filters in the address without a server round trip (`?ville=nantes&tri=note`): the
 * defaults are left out, so the bare page stays `/mentions`.
 */
export function useUrlState(
  state: Record<string, string | null>,
  defaults: Record<string, string>,
) {
  const key = JSON.stringify(state);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(JSON.parse(key) as Record<string, string | null>)) {
      if (v && v !== defaults[k]) p.set(k, v);
      else p.delete(k);
    }
    p.delete('page');
    const qs = p.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `defaults` is a constant
  }, [key]);
}

export function ArrowGo() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="go mt-[3px] flex-none"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
