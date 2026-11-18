'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { useSearch } from './useSearch';

/**
 * Column selector of the comparator: a search among the parcours (the site search, 8 results),
 * never the whole catalogue in a list. Rewrites ?ids= so the comparison stays shareable.
 */
export function ComparePicker({
  index,
  ids,
  current,
}: {
  index: number;
  ids: string[];
  /** Title of the parcours in this column, if any. */
  current?: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const { results } = useSearch(q, { types: ['program'], limit: 8 });
  const open = q.trim() !== '' && results.length > 0;
  const go = (slug: string | null) => {
    const next = [...ids];
    while (next.length <= index) next.push('');
    next[index] = slug ?? '';
    const clean = [...new Set(next.filter(Boolean))];
    setQ('');
    router.push(clean.length ? `/comparer?ids=${clean.join(',')}` : '/comparer', { scroll: false });
  };
  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-semibold text-ink-muted">
        {current
          ? `Remplacer (colonne ${index + 1})`
          : `Choisir un parcours (colonne ${index + 1})`}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${id}-o${hi}` : undefined}
        autoComplete="off"
        value={q}
        placeholder="Chercher un parcours…"
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && results[hi]) {
            e.preventDefault();
            go(results[hi]!.href.replace('/parcours/', ''));
          }
        }}
        className="nm-control min-h-11 text-[14px]"
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Parcours"
          className="absolute top-full z-30 mt-1 flex w-full list-none flex-col rounded-md border border-border bg-surface-0 p-1 shadow-[0_12px_30px_rgba(22,19,31,.15)]"
        >
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r.href.replace('/parcours/', ''));
              }}
              onMouseMove={() => setHi(i)}
              className={cn(
                'cursor-pointer rounded-sm px-2.5 py-2 text-[14px]',
                i === hi && 'bg-surface-100',
              )}
            >
              <span className="block font-semibold">{r.title}</span>
              <span className="block truncate text-[12px] text-ink-muted">{r.subtitle}</span>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <button
          type="button"
          onClick={() => go(null)}
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12px] font-semibold text-ink-muted underline"
        >
          Retirer de la comparaison
        </button>
      )}
    </div>
  );
}
