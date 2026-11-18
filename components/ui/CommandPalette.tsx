'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearch, type SearchHit } from '@/components/public/useSearch';
import { cn } from '@/lib/cn';
import { matchedByText, normalize, type SearchType } from '@/lib/domain/search';
import { Icon, type IconName } from './Icon';
import { Kbd } from './Kbd';

/**
 * ⌘K palette (fiches and pages without a search field): search a master, a university, a city,
 * an RNCP, Mon Master or UAI number without leaving the page, and navigate. Same search and same
 * rows as the home page results (.palbg, .palbox, .prow).
 */

type RowKind = 'ville' | 'mention' | 'universite' | 'parcours' | 'action';

interface Row {
  key: string;
  kind: RowKind;
  title: string;
  subtitle: string;
  href: string;
  code: string | null;
}

const ACTIONS: (Omit<Row, 'kind' | 'code' | 'key'> & { keywords: string })[] = [
  {
    title: 'Donner mon avis',
    subtitle: 'Formulaire en 3 étapes, avec ou sans compte',
    href: '/avis/nouveau',
    keywords: 'avis noter ecrire',
  },
  {
    title: 'Explorer les masters',
    subtitle: 'Catalogue, filtres et comparaison',
    href: '/explorer',
    keywords: 'explorer catalogue liste comparer',
  },
  {
    title: 'Mon espace',
    subtitle: 'Mes avis, messages, masters suivis',
    href: '/espace',
    keywords: 'espace compte messages suivis',
  },
  {
    title: 'Se connecter',
    subtitle: 'Lien de connexion par mail',
    href: '/connexion',
    keywords: 'connexion login',
  },
  {
    title: 'Signaler un contenu',
    subtitle: 'Avis problématique ou demande de retrait',
    href: '/signaler',
    keywords: 'signaler retrait',
  },
  {
    title: 'À propos et contact',
    subtitle: 'Sources des données, FAQ, nous écrire',
    href: '/a-propos',
    keywords: 'contact faq sources',
  },
];

/** Groups, in display order, with their maximum size. */
const GROUPS: { label: string; kind: RowKind; type?: SearchType; max: number }[] = [
  { label: 'Villes', kind: 'ville', type: 'city', max: 4 },
  { label: 'Mentions nationales', kind: 'mention', type: 'mention', max: 4 },
  { label: 'Universités', kind: 'universite', type: 'university', max: 4 },
  { label: 'Masters', kind: 'parcours', type: 'program', max: 7 },
  { label: 'Aller à', kind: 'action', max: 6 },
];

const ICON: Record<RowKind, IconName> = {
  ville: 'pin',
  mention: 'mention',
  universite: 'universite',
  parcours: 'parcours',
  action: 'arrow',
};
const ICON_CLASS: Record<RowKind, string> = {
  ville: 'bg-warning-bg text-warning',
  mention: 'bg-lime-100 text-lime-800',
  universite: 'bg-coral-100 text-coral-800',
  parcours: 'bg-violet-100 text-violet-700',
  action: 'bg-night text-lime-400',
};

const KIND_OF: Record<SearchType, RowKind> = {
  city: 'ville',
  mention: 'mention',
  university: 'universite',
  program: 'parcours',
};

const nf = new Intl.NumberFormat('fr-FR');
/** « les 312 résultats » / « le résultat » */
function seeAll(n: number) {
  return n > 1 ? `les ${nf.format(n)} résultats` : 'le résultat';
}

function toRow(h: SearchHit): Row {
  return {
    key: `${h.type}:${h.id}`,
    kind: KIND_OF[h.type],
    title: h.title,
    subtitle: h.subtitle,
    href: h.href,
    code: matchedByText(h.matchedBy),
  };
}

/** Exit animation length (fade out), 0 when motion is reduced. */
function exitDelay() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150;
}

export function CommandPalette({
  open,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  /** Focused again once the dialog is closed (the header pill on the fiches). */
  returnFocusTo?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState('');
  // null: nothing chosen with the arrows yet, the best-ranked result is the active row.
  const [active, setActive] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const {
    results,
    totals,
    hiddenPrivate,
    notYet,
    query: answered,
  } = useSearch(open ? q : '', {
    limit: 19,
    limits: { city: 4, mention: 4, university: 4, program: 7 },
  });

  const groups = useMemo(() => {
    const words = normalize(q).split(/\s+/).filter(Boolean);
    const actions = ACTIONS.filter((a) => {
      const hay = normalize(`${a.title} ${a.subtitle} ${a.keywords}`);
      return words.every((w) => hay.includes(w));
    }).map((a) => ({ ...a, kind: 'action' as const, code: null, key: `action:${a.href}` }));
    const rows: Row[] = q.trim() ? results.map(toRow) : [];
    // « Lyon »: a city not open yet, a row of the Villes group rather than nothing
    if (q.trim() && notYet)
      rows.unshift({
        key: `city:not-yet:${notYet.place}`,
        kind: 'ville',
        title: notYet.place,
        subtitle: 'Pas encore disponible · on ouvre les villes petit à petit',
        href: `/pas-encore?ville=${encodeURIComponent(notYet.place)}`,
        code: null,
      });
    return GROUPS.map((g) => ({
      ...g,
      rows: (g.kind === 'action' ? actions : rows.filter((r) => r.kind === g.kind)).slice(0, g.max),
    })).filter((g) => g.rows.length > 0);
  }, [q, results, notYet]);
  const flat = groups.flatMap((g) => g.rows);
  const best = results[0]
    ? flat.findIndex((r) => r.key === `${results[0]!.type}:${results[0]!.id}`)
    : -1;
  const current = Math.min(active ?? Math.max(0, best), Math.max(0, flat.length - 1));
  const optionId = (i: number) => `${listId}-opt-${i}`;
  // Rows cascade in again when the list changes, not on every keystroke.
  const listKey = flat.map((r) => r.key).join('|');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      inputRef.current?.focus();
    }
    if (!open && d.open) {
      d.close();
      // After close(): the browser would otherwise focus what had it before showModal().
      returnFocusTo?.focus();
    }
  }, [open, returnFocusTo]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setQ('');
      setActive(null);
      onClose();
    }, exitDelay());
  };

  const go = (row: Row | undefined) => {
    if (!row) return;
    close();
    router.push(row.href);
  };

  let index = -1;
  return (
    <dialog
      ref={ref}
      aria-label="Recherche et navigation"
      data-closing={closing ? '' : undefined}
      className="nm-palette"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {open && (
        <div className="nm-palbox flex flex-col overflow-hidden rounded-[22px] border-2 border-ink bg-surface-0 text-ink shadow-[0_30px_80px_rgba(22,19,31,.35)]">
          <div className="flex items-center gap-3 border-b border-border pr-3.5 pl-4.5">
            <Icon name="search" size={22} strokeWidth={2.2} />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={flat.length ? optionId(current) : undefined}
              aria-autocomplete="list"
              aria-label="Rechercher"
              autoComplete="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && flat.length) {
                  e.preventDefault();
                  setActive((current + 1) % flat.length);
                } else if (e.key === 'ArrowUp' && flat.length) {
                  e.preventDefault();
                  setActive((current - 1 + flat.length) % flat.length);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(flat[current]);
                }
              }}
              placeholder="Un master, une fac, une ville, un n° RNCP ou Mon Master…"
              className="min-w-0 flex-1 border-0 bg-transparent py-5 font-sans text-[18px] text-ink outline-none placeholder:text-ink-muted"
            />
            <Kbd>Échap</Kbd>
          </div>
          <div
            id={listId}
            key={listKey}
            role="listbox"
            aria-label="Résultats"
            className="max-h-[52vh] overflow-y-auto p-2"
          >
            {groups.map((g) => (
              <div
                key={g.label}
                role="group"
                aria-label={g.label}
                className="flex flex-col gap-0.5 pb-1.5"
              >
                <span className="px-2.5 pt-2 pb-1 text-[12px] font-bold tracking-[0.05em] text-ink-muted uppercase">
                  {g.label}
                </span>
                {g.rows.map((row) => {
                  index++;
                  const i = index;
                  const on = i === current;
                  return (
                    <a
                      key={row.key}
                      id={optionId(i)}
                      role="option"
                      aria-selected={on}
                      href={row.href}
                      tabIndex={-1}
                      onClick={(e) => {
                        e.preventDefault();
                        go(row);
                      }}
                      onMouseMove={() => setActive(i)}
                      onMouseEnter={() => router.prefetch(row.href)}
                      onFocus={() => router.prefetch(row.href)}
                      style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                      className={cn(
                        'nm-prow flex items-center gap-3 rounded-[12px] p-2.5 text-ink no-underline',
                        on ? 'bg-surface-100' : 'bg-transparent',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-8.5 flex-none items-center justify-center rounded-[10px]',
                          ICON_CLASS[row.kind],
                        )}
                      >
                        <Icon name={ICON[row.kind]} size={18} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-bold">{row.title}</span>
                        <span className="truncate text-[13px] text-ink-muted">{row.subtitle}</span>
                      </span>
                      {row.code && (
                        <span className="nm-codehit max-sm:hidden">
                          <span className="sr-only">Trouvé par </span>
                          {row.code}
                        </span>
                      )}
                      {on && <Kbd>↵</Kbd>}
                    </a>
                  );
                })}
              </div>
            ))}
            {q.trim() && flat.length === 0 && (
              <div className="px-3 py-5.5 text-center text-[14px] text-ink">
                Rien ne correspond à « {q.trim()} ». Essaie un intitulé, une ville, un n° RNCP ou un
                code Mon Master.
              </div>
            )}
          </div>
          {q.trim() &&
            answered === q.trim() &&
            totals.program + totals.mention + totals.university > 0 && (
              <a
                href={`/?q=${encodeURIComponent(q.trim())}#resultats`}
                onClick={(e) => {
                  e.preventDefault();
                  close();
                  router.push(`/?q=${encodeURIComponent(q.trim())}#resultats`);
                }}
                className="flex items-center justify-between gap-2 border-t border-border px-4.5 py-3 text-[14px] font-semibold text-violet-500"
              >
                Voir {seeAll(totals.program + totals.mention + totals.university)}
                <Icon name="arrow" size={16} />
              </a>
            )}
          {q.trim() && answered === q.trim() && hiddenPrivate > 0 && (
            <p className="m-0 px-4.5 pb-2 text-[13px] text-ink-muted">
              {nf.format(hiddenPrivate)} parcours d’établissements privés masqués ·{' '}
              <a href={`/?q=${encodeURIComponent(q.trim())}&prive=1#resultats`}>Afficher</a>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3.5 border-t border-border bg-surface-50 px-4 py-2.5 text-[12px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> naviguer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>↵</Kbd> ouvrir
            </span>
            <span className="inline-flex items-center gap-1.5 max-sm:hidden">
              <Kbd>⌘ K</Kbd> ou <Kbd>Ctrl K</Kbd> partout sur le site
            </span>
          </div>
        </div>
      )}
    </dialog>
  );
}
