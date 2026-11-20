'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { plural, type IndexCity } from '@/lib/catalog/index-labels';
import { normalize } from '@/lib/domain/search';

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

/**
 * The panel of the city picker: a search field (accents ignored) and « Toutes les villes » then
 * the open cities in alphabetical order, each with its count. ARIA combobox inside a dialog:
 * arrows (they loop), Home / End, Enter, Escape; a click outside `container` closes it. Opened by
 * the pill of /mentions and /universites (CityPicker) and by « Où ? » on the home, which loads
 * it at the first interaction only.
 */
export function CityPickerPanel({
  id,
  cities,
  value,
  unit,
  container,
  onPick,
  onClose,
  className,
}: {
  id: string;
  cities: IndexCity[];
  value: string | null;
  /** Noun of the counts: ['mention', 'mentions']. */
  unit: readonly [string, string];
  /** What a click must stay inside not to close the panel (the trigger and the panel). */
  container: RefObject<HTMLElement | null>;
  onPick: (slug: string | null) => void;
  /** Closes; `true` when the focus must go back to the trigger (Escape). */
  onClose: (focusTrigger: boolean) => void;
  /** Position and width. */
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

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

  useEffect(() => {
    field.current?.focus();
    const out = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) close.current(false);
    };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [container]);

  // The highlighted option stays in view while the list scrolls.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div
      id={id}
      role="dialog"
      aria-label="Choisir une ville"
      className={cn(
        'cp-pop absolute overflow-hidden rounded-lg border-2 border-ink bg-surface-0 shadow-[0_24px_60px_rgba(22,19,31,.22)]',
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close.current(true);
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
              if (o) onPick(o.slug);
            }
          }}
          // 16 px: iOS does not zoom into the field.
          className="box-border min-h-11 w-full rounded-[12px] border-[1.5px] border-[#d7d3e0] bg-surface-0 px-3 text-[16px] text-ink placeholder:text-ink-muted dark:border-border-control"
        />
      </div>
      <ul
        ref={list}
        id={`${id}-list`}
        role="listbox"
        aria-label="Villes ouvertes"
        className="m-0 max-h-[300px] list-none overflow-y-auto p-1.5 max-sm:max-h-[min(300px,40vh)]"
      >
        {opts.map((o, i) => {
          const on = o.slug === value;
          return (
            <li
              key={o.slug ?? '*'}
              id={`${id}-o${i}`}
              data-i={i}
              role="option"
              aria-selected={on}
              onClick={() => onPick(o.slug)}
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
        <p role="status" className="m-0 px-4 pt-1 pb-3.5 text-[14px] leading-normal text-ink-muted">
          Pas encore de masters à « {q.trim()} ». On ouvre les villes petit à petit.
        </p>
      )}
      <p className="m-0 border-t border-border bg-surface-50 px-4 py-2.5 text-[12px] text-ink-muted">
        {plural(cities.length, 'ville ouverte', 'villes ouvertes')} · on ouvre les suivantes petit à
        petit
      </p>
    </div>
  );
}
