'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Icon, MatchedBy, ShortcutKbd, withBrand } from '@/components/ui';
import { cn } from '@/lib/cn';
import { normalize } from '@/lib/domain/search';
import { useSearch, type SearchHit } from './useSearch';

/**
 * « Quel master as-tu suivi ? »: the site search bound to the field,
 * results in a list hanging under it (typed words highlighted, « Trouvé par … » for codes),
 * combobox + listbox, keyboard (↑ ↓ Enter Escape), 8 options at most, « Dis-le nous » footer.
 * Once chosen, the master shows in a violet card with « Changer ». ⌘K puts the cursor here.
 */

export interface MasterOption {
  slug: string;
  title: string;
  subtitle: string;
}

const MAX = 8;

/** Title split into highlighted / plain parts for the typed words (accents ignored). */
function segments(title: string, query: string) {
  const words = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const n = normalize(title);
  // normalize() keeps one character per character of an NFC title: positions match.
  const mark = Array<boolean>(title.length).fill(false);
  for (const w of words)
    for (let k = n.indexOf(w); k !== -1; k = n.indexOf(w, k + 1))
      for (let x = k; x < k + w.length && x < mark.length; x++) mark[x] = true;
  const out: { text: string; on: boolean }[] = [];
  for (let i = 0; i < title.length; i++) {
    const last = out.at(-1);
    if (last && last.on === mark[i]) last.text += title[i];
    else out.push({ text: title[i]!, on: mark[i]! });
  }
  return out;
}

const slugOf = (h: SearchHit) => h.href.replace(/^\/parcours\//, '');

export function MasterAutocomplete({
  value,
  onChange,
  onPick,
  programs,
  error,
  inputRef,
}: {
  /** Chosen program slug, or ''. */
  value: string;
  onChange: (slug: string) => void;
  /** The chosen option (title and subtitle from the search), before onChange. */
  onPick?: (o: MasterOption) => void;
  programs: MasterOption[];
  error?: string;
  /** The field, for ⌘K (registered by the form, which knows the current step). */
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const input = inputRef;
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const { results, query } = useSearch(q, { types: ['program'], limit: MAX });

  const picked = programs.find((p) => p.slug === value);
  const open = q.trim() !== '';
  const matches = results.slice(0, MAX);
  const current = Math.min(hi, Math.max(0, matches.length - 1));
  const settled = query === q.trim();

  const pick = (h: SearchHit | undefined) => {
    if (!h) return;
    onPick?.({ slug: slugOf(h), title: h.title, subtitle: h.subtitle });
    onChange(slugOf(h));
    setQ('');
    setHi(0);
  };

  if (picked)
    return (
      <div className="flex flex-col gap-2.5">
        <span className="nm-label">Quel master as-tu suivi ?</span>
        <div className="nm-picked flex items-center gap-3.5 rounded-[18px] border-2 border-violet-500 bg-violet-100 px-4 py-3.5">
          <span
            aria-hidden="true"
            className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-violet-500 text-on-violet"
          >
            <Icon name="parcours" size={20} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-display text-[17px] leading-[1.2] font-bold">{picked.title}</span>
            <span className="text-[13px] text-[color-mix(in_srgb,var(--ink)_50%,var(--ink-muted))]">
              {picked.subtitle}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange('');
              window.setTimeout(() => input.current?.focus(), 0);
            }}
            className="min-h-tap flex-none cursor-pointer rounded-pill border-[1.5px] border-ink bg-surface-0 px-3.5 font-sans text-[14px] font-semibold text-ink"
          >
            Changer
            <span className="sr-only"> de master</span>
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor={id} className="nm-label">
        Quel master as-tu suivi ?
      </label>
      <div className="flex flex-col gap-2">
        <div className="relative z-20">
          <div
            className={cn(
              'nm-psearch relative z-[3] box-border flex min-h-[58px] items-center gap-2.5 border-2 bg-surface-0 pr-2 pl-4',
              error ? 'border-danger' : 'border-ink',
              open ? 'rounded-[18px_18px_0_0]' : 'rounded-[18px]',
            )}
          >
            <Icon name="search" size={20} strokeWidth={2.2} />
            <input
              ref={input}
              id={id}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open && matches.length ? `${id}-opt-${current}` : undefined}
              aria-describedby={[hintId, error ? errId : null].filter(Boolean).join(' ')}
              aria-invalid={error ? true : undefined}
              aria-keyshortcuts="Meta+K Control+K"
              autoComplete="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (q) e.preventDefault();
                  setQ('');
                  setHi(0);
                  return;
                }
                if (!matches.length) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHi((current + 1) % matches.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHi((current - 1 + matches.length) % matches.length);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  pick(matches[current]);
                }
              }}
              placeholder="Intitulé, université, ville, n° RNCP, code Mon Master…"
              className="min-w-0 flex-1 border-0 bg-transparent py-[15px] font-sans text-[17px] text-ink outline-none placeholder:text-ink-muted"
            />
            {q ? (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => {
                  setQ('');
                  input.current?.focus();
                }}
                className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-[12px] border-0 bg-surface-100 text-ink"
              >
                <Icon name="close" size={18} />
              </button>
            ) : (
              <ShortcutKbd className="mr-2" />
            )}
          </div>
          {open && (
            <div
              id={listId}
              role="listbox"
              aria-label="Masters trouvés"
              className="nm-acpanel absolute top-full right-0 left-0 z-30 -mt-0.5 box-border max-h-[236px] overflow-y-auto rounded-[0_0_18px_18px] border-2 border-t border-ink border-t-border bg-surface-0 p-1.5 shadow-[0_18px_40px_rgba(40,20,120,.16)]"
            >
              {matches.map((m, i) => {
                const on = i === current;
                return (
                  <button
                    key={m.id}
                    id={`${id}-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={on}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(m)}
                    onMouseMove={() => setHi(i)}
                    className={cn(
                      'nm-opt flex w-full cursor-pointer items-center gap-3 rounded-[12px] border-0 px-3 py-2.5 text-left font-sans text-ink',
                      on ? 'bg-surface-100' : 'bg-transparent',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8.5 flex-none items-center justify-center rounded-[10px] bg-violet-100 text-violet-700"
                    >
                      <Icon name="parcours" size={18} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] leading-[1.3]">
                        {segments(m.title, q).map((s, k) => (
                          <span
                            key={k}
                            className={cn(
                              'rounded-[4px]',
                              s.on ? 'bg-lime-100 font-extrabold' : 'font-semibold',
                            )}
                          >
                            {s.text}
                          </span>
                        ))}
                      </span>
                      <span className="truncate text-[13px] text-ink-muted">{m.subtitle}</span>
                      <MatchedBy match={m.matchedBy} />
                    </span>
                    {on && (
                      <span
                        aria-hidden="true"
                        className="flex-none rounded-[8px] border border-[var(--focus-halo)] bg-surface-0 px-2 py-1 text-[12px] font-bold text-violet-700"
                      >
                        Entrée ↵
                      </span>
                    )}
                  </button>
                );
              })}
              {settled && matches.length === 0 && (
                <div className="p-3 text-[14px] text-[color-mix(in_srgb,var(--ink)_50%,var(--ink-muted))]">
                  Aucun master ne correspond à « {q.trim()} ». Essaie un autre mot : ville,
                  université, discipline.
                </div>
              )}
              <div className="mt-1 border-t border-surface-100 px-3 py-2.5 text-[13px] text-ink-muted">
                Ton master n’est pas dans la liste ?{' '}
                <Link href="/a-propos#contact">Dis-le nous</Link>, on l’ajoute.
              </div>
            </div>
          )}
        </div>
        <span id={hintId} className="nm-hint">
          {open
            ? '↑ ↓ pour parcourir, Entrée pour choisir, Échap pour effacer.'
            : 'Plusieurs mots possibles, sans accents : « patrimoine nantes », « alternance versailles », « RNCP42684 ». ⌘ K (ou Ctrl K) place le curseur ici.'}
        </span>
        <span role="status" className="sr-only">
          {open && settled
            ? matches.length
              ? `${matches.length} ${matches.length > 1 ? 'masters trouvés' : 'master trouvé'}`
              : 'Aucun master trouvé'
            : ''}
        </span>
        {error && (
          <span id={errId} className="nm-error">
            {withBrand(error)}
          </span>
        )}
      </div>
    </div>
  );
}
