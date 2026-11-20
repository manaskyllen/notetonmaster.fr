'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSearchShortcut } from '@/components/public/SearchShortcut';
import { HoverLink } from '@/components/ui/HoverLink';
import { cn } from '@/lib/cn';
import type { HomeZone } from '@/lib/home/data';
import {
  explorerHref,
  goLabel,
  QUICK_FILTERS,
  quickMask,
  type Quick,
  type QuickKey,
} from '@/lib/home/form';
import type { CountTable } from '@/lib/home/labels';
import { setHomeCity, useHomeCity } from './home-city';
import type { PanelKeys, SuggestPanelProps } from './SuggestPanel';

type Panel = (p: SuggestPanelProps) => React.ReactNode;
type Picker = typeof import('@/components/catalog/CityPickerPanel').CityPickerPanel;

/**
 * The guided search of the home (MainV2 mockup): « Quoi ? », « Où ? », the quick filters and
 * « Voir les n masters », then the line of the open cities. A real GET form to the Explorer, with
 * its parameters (q, lieu, modalite, avis, entree): it works without JavaScript (native select
 * and checkboxes, shown only then). With JavaScript, the suggestions and the city picker are
 * loaded at the first interaction (focus, pointer, key), never with the page.
 *
 * The count of the button: from the table in the page while « Quoi ? » is empty, else from the
 * answer of the suggestions; the previous figure stays until the new one, and the button keeps
 * its width (tabular figures, minimum width): nothing moves.
 */
export function HomeSearch({
  zones,
  counts,
  frequent,
  tries,
  domains,
  initial,
  fallback,
}: {
  zones: HomeZone[];
  counts: CountTable;
  frequent: { name: string; parcours: number }[];
  tries: string[];
  domains: { slug: string; name: string; tone: string }[];
  initial: { q: string; city: string | null; quick: Quick; count: number | null };
  /** Rendered by the server (HomeSearchStatic): the no-JS fields and the open cities line. */
  fallback: {
    where: React.ReactNode;
    quick: Record<QuickKey, React.ReactNode>;
    line: React.ReactNode;
    /** Static SVG of the form, drawn by the server. */
    icons: Record<'search' | 'clear' | 'pin' | 'chevron' | 'arrow' | 'check', React.ReactNode>;
  };
}) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState(initial.q);
  const city = useHomeCity(initial.city);
  const [quick, setQuick] = useState<Quick>(initial.quick);
  const [open, setOpen] = useState(false);
  const [cpOpen, setCpOpen] = useState(false);
  const [qCount, setQCount] = useState<number | null>(initial.count);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [live, setLive] = useState('');
  const [mods, setMods] = useState<{ panel?: Panel; picker?: Picker }>({});
  const loading = useRef(false);
  const keys = useRef<PanelKeys | null>(null);
  const registerKeys = useCallback((k: PanelKeys | null) => {
    keys.current = k;
  }, []);
  const box = useRef<HTMLDivElement>(null);
  const where = useRef<HTMLDivElement>(null);
  const whereBtn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // ⌘K / « / » put the cursor in « Quoi ? ».
  useSearchShortcut({ kind: 'focus', get: () => input.current });

  /** The suggestions and the city picker, at the first interaction with the form. */
  const load = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    void Promise.all([import('./SuggestPanel'), import('@/components/catalog/CityPickerPanel')])
      .then(([s, c]) => setMods({ panel: s.SuggestPanel, picker: c.CityPickerPanel }))
      .catch(() => {
        loading.current = false;
      });
  }, []);

  const query = q.trim();
  const zone = zones.find((z) => z.slug === city) ?? null;
  const tableCount = counts[city ?? '']?.[quickMask(quick)] ?? 0;
  const count = query ? (qCount ?? tableCount) : tableCount;
  const href = explorerHref({ q: query, city, quick });

  const pickCity = (slug: string | null) => {
    setHomeCity(slug);
    setCpOpen(false);
  };

  // A click outside the search box closes the suggestions.
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [open]);

  /**
   * The block goes to the top of the screen (under the header) when what opens under it would
   * not fit: the list of suggestions (up to 560 px) or the city picker stays visible. Phones: always.
   */
  const toTop = () => {
    const el = box.current;
    if (!el) return;
    const phone = window.matchMedia('(max-width: 760px)').matches;
    if (!phone && el.getBoundingClientRect().bottom + 580 <= window.innerHeight) return;
    el.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const listId = `${id}-o-list`;
  const Panel = mods.panel;
  const Picker = mods.picker;

  return (
    <form
      method="get"
      action="/explorer"
      role="search"
      aria-label="Chercher un master"
      className="hs flex w-full flex-col items-center gap-4"
      onPointerDownCapture={load}
      onFocusCapture={load}
      onKeyDownCapture={load}
      onClick={(e) => {
        // A city of the line (server-rendered submit buttons): fills « Où ? ».
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-city]');
        if (!b) return;
        e.preventDefault();
        const slug = b.dataset.city!;
        pickCity(city === slug ? null : slug);
        setLive(
          city === slug
            ? 'Toutes les villes.'
            : `Ville choisie : ${zones.find((z) => z.slug === slug)?.name ?? ''}.`,
        );
      }}
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        router.push(href);
      }}
    >
      <div ref={box} className="sbox">
        <div className="srow">
          {/* Quoi ? */}
          <div className="sfield flex-[1.7_1_0]">
            <label htmlFor={`${id}-q`} className="slabel">
              Quoi ?
            </label>
            <span className="flex items-center gap-2.5">
              {fallback.icons.search}
              <input
                ref={input}
                id={`${id}-q`}
                name="q"
                type="search"
                autoComplete="off"
                enterKeyHint="search"
                role="combobox"
                aria-expanded={open && !cpOpen}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={open ? activeId : undefined}
                placeholder="Discipline, métier, nom du master…"
                value={q}
                maxLength={120}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                  setCpOpen(false);
                }}
                onFocus={() => {
                  setCpOpen(false);
                  setOpen(true);
                  toTop();
                }}
                onClick={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (open) {
                      e.preventDefault();
                      setOpen(false);
                    }
                    return;
                  }
                  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
                    e.preventDefault();
                    setOpen(true);
                    return;
                  }
                  if (open) keys.current?.onKey(e);
                }}
                className="hs-input"
              />
              {q && (
                <button
                  type="button"
                  aria-label="Effacer la recherche"
                  onClick={() => {
                    setQ('');
                    setOpen(true);
                    input.current?.focus();
                  }}
                  className="hs-clear nm-js-only"
                >
                  {fallback.icons.clear}
                </button>
              )}
            </span>
          </div>

          <span aria-hidden="true" className="sdiv" />

          {/* Où ? */}
          <div ref={where} className="sfield relative flex-[1_1_0]">
            <span id={'home-wl'} className="slabel">
              Où ?
            </span>
            <button
              ref={whereBtn}
              type="button"
              aria-labelledby={'home-wl home-wv'}
              aria-haspopup="dialog"
              aria-expanded={cpOpen}
              aria-controls={cpOpen ? `${id}-cp` : undefined}
              onClick={() => {
                setOpen(false);
                if (!cpOpen) toTop();
                setCpOpen((o) => !o);
              }}
              data-chosen={zone ? '' : undefined}
              className="hs-where nm-js-only"
            >
              {fallback.icons.pin}
              <span id={'home-wv'} className="min-w-0 flex-1 truncate">
                {zone?.name ?? 'Toutes les villes'}
              </span>
              <span className={cn('cp-chevron inline-flex', cpOpen && 'rotate-180')}>
                {fallback.icons.chevron}
              </span>
            </button>
            {fallback.where}
            {zone && (
              <button
                type="button"
                aria-label="Retirer le filtre de ville"
                onClick={() => pickCity(null)}
                className="hs-unset nm-js-only"
              >
                Effacer
              </button>
            )}
            {cpOpen && Picker && (
              <Picker
                id={`${id}-cp`}
                cities={zones.map((z) => ({ slug: z.slug, name: z.name, count: z.masters }))}
                value={city}
                unit={['master', 'masters']}
                container={where}
                onPick={(slug) => {
                  pickCity(slug);
                  whereBtn.current?.focus();
                }}
                onClose={(focus) => {
                  setCpOpen(false);
                  if (focus) whereBtn.current?.focus();
                }}
                className="top-[calc(100%+12px)] left-0 z-[23] w-[min(360px,86vw)] max-sm:right-0 max-sm:w-auto"
              />
            )}
          </div>

          <button type="submit" className="go nm-cta">
            <span>{goLabel(count)}</span>
            {fallback.icons.arrow}
          </button>
        </div>

        {/* Seulement : */}
        <div className="hs-only">
          <span className="hs-only-l">Seulement :</span>
          {QUICK_FILTERS.map((f) => {
            const on = quick[f.key];
            return (
              <span key={f.key} className="contents">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setQuick((x) => ({ ...x, [f.key]: !x[f.key] }))}
                  className="tg nm-js-only"
                >
                  <span aria-hidden="true" className="bx">
                    {on && fallback.icons.check}
                  </span>
                  {f.label}
                </button>
                {fallback.quick[f.key]}
              </span>
            );
          })}
          <HoverLink href={href} className="hs-more">
            Plus de filtres →
          </HoverLink>
        </div>

        {Panel && (
          <Panel
            id={`${id}-o`}
            q={q}
            city={city}
            quick={quick}
            open={open && !cpOpen}
            zones={zones}
            frequent={frequent}
            tries={tries}
            domains={domains}
            registerKeys={registerKeys}
            onActive={setActiveId}
            onLive={setLive}
            onCount={setQCount}
            onFill={(text) => {
              setQ(text);
              setOpen(true);
              input.current?.focus();
            }}
            onCity={(slug) => {
              pickCity(slug);
              setQ('');
              setOpen(false);
              setLive(`Ville choisie : ${zones.find((z) => z.slug === slug)?.name ?? ''}.`);
            }}
            onGo={(to) => {
              setOpen(false);
              router.push(to);
            }}
          />
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>

      {fallback.line}
    </form>
  );
}
