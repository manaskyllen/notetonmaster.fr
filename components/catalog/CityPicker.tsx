'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { IndexCity } from '@/lib/catalog/index-labels';
import { CityPickerPanel } from './CityPickerPanel';

export function PinIcon({
  size = 15,
  stroke = 'currentColor',
}: {
  size?: number;
  stroke?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
    >
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

/**
 * The one city filter of the site: a white pill
 * « Ville · Toutes ⌄ » that opens a panel with a search field and the open cities in
 * alphabetical order, each with its count in the context of the page (CityPickerPanel, also
 * behind « Où ? » on the home). It holds with 3 cities as with 80: the list scrolls beyond about
 * seven. Only the cities that have something in the page are given.
 */
export function CityPicker({
  cities,
  value,
  onChange,
  unit,
}: {
  cities: IndexCity[];
  /** Slug of the chosen city, or null for all of them. */
  value: string | null;
  onChange: (slug: string | null) => void;
  /** Noun of the counts: ['mention', 'mentions']. */
  unit: readonly [string, string];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = cities.find((c) => c.slug === value) ?? null;

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'ix-chip inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border-[1.5px] bg-surface-0 py-0 pr-3 pl-1.5 text-[14px] font-semibold text-ink',
          current ? 'border-ink' : 'border-[#d7d3e0] dark:border-border-control',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-7.5 items-center justify-center rounded-pill bg-lime-400 text-on-lime"
        >
          <PinIcon />
        </span>
        <span className="font-medium text-ink-muted">Ville</span>
        <span>{current?.name ?? 'Toutes'}</span>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('cp-chevron flex-none', open && 'rotate-180')}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {current && (
        <button
          type="button"
          aria-label="Retirer le filtre de ville"
          onClick={() => onChange(null)}
          className="absolute -top-1.5 -right-1.5 flex size-5.5 cursor-pointer items-center justify-center rounded-pill border-2 border-surface-50 bg-ink p-0 text-[12px] leading-none font-bold text-surface-0"
        >
          ×
        </button>
      )}
      {open && (
        <CityPickerPanel
          id={`${id}-panel`}
          cities={cities}
          value={value}
          unit={unit}
          container={root}
          onPick={(slug) => {
            onChange(slug);
            close(true);
          }}
          onClose={close}
          className="top-[calc(100%+8px)] left-0 z-30 w-[min(340px,86vw)]"
        />
      )}
    </div>
  );
}
