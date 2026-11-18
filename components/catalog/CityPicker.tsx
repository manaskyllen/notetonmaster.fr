'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { plural, type IndexCity } from '@/lib/catalog/index-labels';
import { normalize } from '@/lib/domain/search';

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

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
 * alphabetical order, each with its count in the context of the page. It holds with 3 cities as
 * with 80: the list scrolls beyond about seven. ARIA combobox inside a dialog: arrows, Enter,
 * Escape; a click outside closes. Only the cities that have something in the page are given.
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
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const current = cities.find((c) => c.slug === value) ?? null;
  const nq = normalize(q.trim());
  const opts: { slug: string | null; label: string; count: number | null }[] = [
    { slug: null, label: 'Toutes les villes', count: null },
    ...[...cities]
      .sort((a, b) => collator.compare(a.name, b.name))
      .filter((c) => !nq || normalize(c.name).includes(nq))
      .map((c) => ({ slug: c.slug, label: c.name, count: c.count })),
  ];
  const active = Math.min(hi, opts.length - 1);
  const none = !!nq && opts.length === 1;

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };
  const pick = (slug: string | null) => {
    onChange(slug);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const out = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [open]);

  // The highlighted option stays in view while the list scrolls.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => {
          setQ('');
          setHi(0);
          setOpen((o) => !o);
        }}
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
        <div
          id={`${id}-panel`}
          role="dialog"
          aria-label="Choisir une ville"
          className="cp-pop absolute top-[calc(100%+8px)] left-0 z-30 w-[min(340px,86vw)] overflow-hidden rounded-lg border-2 border-ink bg-surface-0 shadow-[0_24px_60px_rgba(22,19,31,.22)]"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            }
          }}
        >
          <div className="border-b border-border p-2.5">
            <input
              ref={field}
              type="search"
              role="combobox"
              aria-label="Chercher une ville"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={opts.length ? `${id}-o${active}` : undefined}
              placeholder="Chercher une ville…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHi((active + 1) % opts.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHi((active - 1 + opts.length) % opts.length);
                } else if (e.key === 'Home' && !q) {
                  e.preventDefault();
                  setHi(0);
                } else if (e.key === 'End' && !q) {
                  e.preventDefault();
                  setHi(opts.length - 1);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const o = opts[active];
                  if (o) pick(o.slug);
                }
              }}
              className="box-border min-h-10.5 w-full rounded-[12px] border-[1.5px] border-[#d7d3e0] bg-surface-0 px-3 text-[15px] text-ink placeholder:text-ink-muted dark:border-border-control"
            />
          </div>
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label="Villes ouvertes"
            className="m-0 max-h-[300px] list-none overflow-y-auto p-1.5"
          >
            {opts.map((o, i) => {
              const on = o.slug === (current?.slug ?? null);
              return (
                <li
                  key={o.slug ?? '*'}
                  id={`${id}-o${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  onClick={() => pick(o.slug)}
                  onPointerMove={() => i !== active && setHi(i)}
                  className={cn(
                    'cp-opt flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-[15px] text-ink',
                    on ? 'font-bold' : 'font-medium',
                    i === active && 'bg-surface-100',
                  )}
                >
                  <span className="flex-1">{o.label}</span>
                  {o.count != null && (
                    <span className="text-[13px] font-medium text-ink-muted">
                      {plural(o.count, unit[0], unit[1])}
                    </span>
                  )}
                  <span aria-hidden="true" className="inline-flex w-4 text-violet-500">
                    {on ? '✓' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
          {none && (
            <p
              role="status"
              className="m-0 px-4 pt-1 pb-3.5 text-[14px] leading-normal text-ink-muted"
            >
              Pas encore de masters à « {q.trim()} ». On ouvre les villes petit à petit.
            </p>
          )}
          <p className="m-0 border-t border-border bg-surface-50 px-4 py-2.5 text-[12px] text-ink-muted">
            {plural(cities.length, 'ville ouverte', 'villes ouvertes')} · les autres arrivent petit
            à petit
          </p>
        </div>
      )}
    </div>
  );
}
