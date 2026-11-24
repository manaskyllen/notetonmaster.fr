'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { CityPickerPanel } from '@/components/catalog/CityPickerPanel';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/cn';
import { GUIDES_PER_PAGE, shortLede, THEMES, themeInfo } from '@/lib/articles/model';
import {
  countLabel,
  guidesHref,
  highlight,
  pageSlice,
  searchGuides,
  type GuideFilters,
} from '@/lib/articles/search';
import type { ArticleTheme } from '@/lib/db/generated/enums';

export interface BrowserGuide {
  slug: string;
  title: string;
  lede: string;
  theme: ArticleTheme;
  city: { slug: string; name: string } | null;
  searchKeywords: string[];
  minutes: number;
}

/**
 * /guides (ArticlesIndex mockup, 24): the search block of the home (same classes: .sbox, .sfield,
 * .tg…), « Quoi ? » and « Où ? » (the city picker of the site), a row of subjects, then one line
 * per guide. Rendered by the server from the address (it works without JavaScript: a GET form);
 * with JavaScript, the list filters while typing and the address follows (replaceState). Beyond
 * CLIENT_SEARCH_MAX guides (`mode` server), the browser only holds the current page and each change
 * asks the server.
 */
export function GuidesBrowser({
  guides,
  total,
  mode,
  initial,
  cities,
  icons,
}: {
  /** Every public guide (client mode), or the guides of the page (server mode). */
  guides: BrowserGuide[];
  /** Results of the current filters (server mode). */
  total: number;
  mode: 'client' | 'server';
  initial: GuideFilters & { page: number };
  /** Open cities with at least one guide, and their count. */
  cities: { slug: string; name: string; count: number }[];
  icons: Record<'search' | 'clear' | 'pin' | 'chevron', React.ReactNode>;
}) {
  const router = useRouter();
  const id = useId();
  const [f, setF] = useState<GuideFilters>({
    q: initial.q,
    city: initial.city,
    subject: initial.subject,
  });
  const [page, setPage] = useState(initial.page);
  const [cpOpen, setCpOpen] = useState(false);
  const where = useRef<HTMLDivElement>(null);
  const whereBtn = useRef<HTMLButtonElement>(null);
  const first = useRef(true);

  const zone = cities.find((c) => c.slug === f.city) ?? null;
  const results = mode === 'client' ? searchGuides(guides, f) : guides;
  const count = mode === 'client' ? results.length : total;
  const shown = mode === 'client' ? pageSlice(results, page) : results;
  const active = !!(f.q.trim() || f.city || f.subject);

  // Each change: page 1, the address follows (no reload); in server mode the server answers.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const href = guidesHref(f, 1);
    if (mode === 'server') {
      const t = setTimeout(() => router.replace(href, { scroll: false }), 300);
      return () => clearTimeout(t);
    }
    window.history.replaceState(window.history.state, '', href);
  }, [f, mode, router]);

  const change = (next: Partial<GuideFilters>) => {
    setF((x) => ({ ...x, ...next }));
    setPage(1);
  };
  const clear = () => change({ q: '', city: null, subject: null });

  return (
    <div className="hs flex flex-col gap-6">
      <form
        method="get"
        action="/guides"
        role="search"
        aria-label="Chercher un guide"
        className="sbox mt-0! max-w-none!"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="srow">
          <div className="sfield flex-[1.7_1_0]">
            <label htmlFor={`${id}-q`} className="slabel">
              Quoi ?
            </label>
            <span className="flex items-center gap-2.5">
              {icons.search}
              <input
                id={`${id}-q`}
                name="q"
                type="search"
                autoComplete="off"
                enterKeyHint="search"
                aria-describedby={`${id}-count`}
                placeholder="Alternance, sélectivité, droit européen…"
                value={f.q}
                maxLength={120}
                onChange={(e) => change({ q: e.target.value })}
                className="hs-input"
              />
              {f.q && (
                <button
                  type="button"
                  aria-label="Effacer la recherche"
                  onClick={() => change({ q: '' })}
                  className="hs-clear nm-js-only"
                >
                  {icons.clear}
                </button>
              )}
            </span>
          </div>
          <span aria-hidden="true" className="sdiv" />
          <div ref={where} className="sfield relative flex-[1_1_0]">
            <span id={`${id}-wl`} className="slabel">
              Où ?
            </span>
            <button
              ref={whereBtn}
              type="button"
              aria-labelledby={`${id}-wl ${id}-wv`}
              aria-haspopup="dialog"
              aria-expanded={cpOpen}
              aria-controls={cpOpen ? `${id}-cp` : undefined}
              onClick={() => setCpOpen((o) => !o)}
              data-chosen={zone ? '' : undefined}
              className="hs-where nm-js-only"
            >
              {icons.pin}
              <span id={`${id}-wv`} className="min-w-0 flex-1 truncate">
                {zone?.name ?? 'Toutes les villes'}
              </span>
              <span className={cn('cp-chevron inline-flex', cpOpen && 'rotate-180')}>
                {icons.chevron}
              </span>
            </button>
            {/* Without JavaScript: the native list of the cities. */}
            <select
              name="ville"
              aria-labelledby={`${id}-wl`}
              defaultValue={f.city ?? ''}
              className="nm-nojs-only min-h-11 w-full rounded-[12px] border-[1.5px] border-border-control bg-surface-0 px-2 font-sans text-[16px] font-semibold text-ink"
            >
              <option value="">Toutes les villes</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            {zone && (
              <button
                type="button"
                aria-label="Retirer le filtre de ville"
                onClick={() => change({ city: null })}
                className="hs-unset nm-js-only"
              >
                Effacer
              </button>
            )}
            {cpOpen && (
              <CityPickerPanel
                id={`${id}-cp`}
                cities={cities}
                value={f.city}
                unit={['guide', 'guides']}
                container={where}
                note="Les guides « toutes villes » restent toujours affichés."
                onPick={(slug) => {
                  change({ city: slug });
                  setCpOpen(false);
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
          <noscript>
            <button type="submit" className="go">
              Chercher
            </button>
          </noscript>
        </div>
        {/* Subjects: one at a time (the « Seulement : » row of the home). */}
        <div role="group" aria-label="Sujet" className="hs-only">
          {[{ slug: null as string | null, filter: 'Tous les sujets' }, ...THEMES].map((t) => {
            const on = f.subject === t.slug;
            return (
              <button
                key={t.slug ?? 'all'}
                type="submit"
                name={t.slug ? 'sujet' : undefined}
                value={t.slug ?? undefined}
                aria-pressed={on}
                onClick={(e) => {
                  e.preventDefault();
                  change({ subject: t.slug });
                }}
                className="tg px-3.5!"
              >
                {t.filter}
              </button>
            );
          })}
        </div>
      </form>

      <section aria-labelledby={`${id}-count`} className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
          <h2
            id={`${id}-count`}
            aria-live="polite"
            className="m-0 text-[16px] font-bold text-ink"
            data-testid="guides-count"
          >
            {countLabel(count, zone?.name ?? null)}
          </h2>
          {active && (
            <Link
              href="/guides"
              scroll={false}
              onClick={(e) => {
                e.preventDefault();
                clear();
              }}
              className="text-[14px] font-semibold text-violet-700 underline"
            >
              Tout effacer
            </Link>
          )}
        </div>
        {count === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-4 rounded-[22px] border-[1.5px] border-dashed border-border-control px-6 py-10 text-center">
            <p className="m-0 font-display text-[22px] font-extrabold tracking-[-0.02em]">
              {f.q.trim()
                ? `Aucun guide ne correspond à « ${f.q.trim()} »${zone ? ` pour ${zone.name}` : ''}.`
                : `Aucun guide ne correspond à ces filtres${zone ? ` pour ${zone.name}` : ''}.`}
            </p>
            <p className="m-0 text-[15px] text-ink-muted">
              Essaie un autre mot, ou regarde tous les guides de la ville.
            </p>
            <button
              type="button"
              onClick={clear}
              className="min-h-12 rounded-pill bg-night px-6 text-[16px] font-bold text-on-night"
            >
              Tout effacer
            </button>
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {shown.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} className="g-row">
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span
                      className="self-start rounded-pill px-2.5 py-0.75 text-[12px] font-bold"
                      style={{ background: themeInfo(g.theme).bg, color: themeInfo(g.theme).fg }}
                    >
                      {themeInfo(g.theme).label}
                    </span>
                    <span className="g-row__t font-display text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">
                      {highlight(g.title, f.q).map((p, i) =>
                        p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
                      )}
                    </span>
                    <span className="text-[15px] leading-normal text-ink-muted">
                      {shortLede(g.lede)}
                    </span>
                  </span>
                  <span className="flex flex-none flex-col items-end gap-1 text-right max-sm:flex-row max-sm:items-center max-sm:gap-3">
                    <span className="text-[14px] font-bold">
                      {g.city?.name ?? 'Toutes les villes'}
                    </span>
                    <span className="text-[13px] text-ink-muted">
                      {g.minutes} min{' '}
                      <span aria-hidden="true" className="g-arr">
                        →
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {count > GUIDES_PER_PAGE && (
          <Pagination
            pathname="/guides"
            params={{
              ...(f.q.trim() ? { q: f.q.trim() } : {}),
              ...(f.city ? { ville: f.city } : {}),
              ...(f.subject ? { sujet: f.subject } : {}),
            }}
            page={page}
            perPage={GUIDES_PER_PAGE}
            total={count}
            targetId={`${id}-count`}
            className="mt-8"
          />
        )}
      </section>
    </div>
  );
}
