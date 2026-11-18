'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  byName,
  byRating,
  citiesLabel,
  countLabel,
  groupByLetter,
  matchesWords,
  MENTION_SORTS,
  plural,
  type IndexCity,
  type MentionSort,
} from '@/lib/catalog/index-labels';
import type { MentionEntry, ZoneName } from '@/lib/catalog/indexes';
import { normalize } from '@/lib/domain/search';
import { CityPicker } from './CityPicker';
import {
  ArrowGo,
  IndexEmpty,
  IndexRating,
  IndexSearchField,
  IndexSort,
  useUrlState,
} from './IndexParts';

export interface DomainInfo {
  slug: string;
  name: string;
  tone: string;
}

/** Colours of the national domains, those of the home tiles: [background, ink]. */
const TONE: Record<string, [string, string]> = {
  violet: ['var(--violet-500)', '#ffffff'],
  lime: ['var(--lime-400)', 'var(--on-lime)'],
  coral: ['var(--coral-300)', 'var(--on-lime)'],
  night: ['var(--night)', '#ffffff'],
};
const toneOf = (t: string | undefined) => TONE[t ?? ''] ?? TONE.violet!;

const SMALL = new Set(['de', 'du', 'des', 'et', 'la', 'le', 'les']);
/** « Arts, lettres, langues » → AL, « Sciences, technologies, santé » → ST. */
const abbr = (name: string) =>
  normalize(name)
    .split(/[^a-z]+/)
    .filter((w) => w && !SMALL.has(w))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

/**
 * /mentions: the filter field, the five domain tiles, the city picker
 * and the sort, then every mention published, grouped by letter in A → Z. The whole list comes
 * from the server; filters and sorts run here, kept in the address.
 */
export function MentionsBrowser({
  entries,
  zones,
  domains,
  initial,
}: {
  entries: MentionEntry[];
  zones: ZoneName[];
  domains: DomainInfo[];
  initial: { q: string; domaine: string | null; ville: string | null; tri: MentionSort };
}) {
  const [q, setQ] = useState(initial.q);
  const [dom, setDom] = useState(initial.domaine);
  const [city, setCity] = useState(initial.ville);
  const [sort, setSort] = useState<MentionSort>(initial.tri);
  useUrlState({ q: q.trim() || null, domaine: dom, ville: city, tri: sort }, { tri: 'az' });

  const domainOf = useMemo(() => new Map(domains.map((d) => [d.slug, d])), [domains]);
  const cityName = zones.find((z) => z.slug === city)?.name ?? null;

  const cities: IndexCity[] = useMemo(
    () =>
      zones
        .map((z) => ({ ...z, count: entries.filter((e) => e.zones.includes(z.slug)).length }))
        .filter((c) => c.count > 0),
    [zones, entries],
  );
  const zoneName = useMemo(() => new Map(zones.map((z) => [z.slug, z.name])), [zones]);

  const inCity = (e: MentionEntry) => !city || e.zones.includes(city);
  const rows = useMemo(() => {
    const xs = entries.filter(
      (e) =>
        (!dom || e.domain === dom) && (!city || e.zones.includes(city)) && matchesWords(e.name, q),
    );
    return xs.sort(
      sort === 'parcours'
        ? (a, b) => b.parcours - a.parcours || byName(a, b)
        : sort === 'note'
          ? byRating
          : byName,
    );
  }, [entries, dom, city, q, sort]);

  const tiles = [
    {
      slug: null,
      name: 'Tous les domaines',
      short: 'Tout',
      colors: ['var(--night)', 'var(--lime-400)'],
    },
    ...domains.map((d) => ({
      slug: d.slug,
      name: d.name,
      short: abbr(d.name),
      colors: toneOf(d.tone),
    })),
  ];
  const groups = sort === 'az' ? groupByLetter(rows) : [{ letter: '', items: rows }];
  const reset = () => {
    setQ('');
    setDom(null);
    setCity(null);
  };

  let n = 0;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4.5">
        <div className="flex flex-[1_1_520px] flex-col gap-2.5">
          <h1 className="m-0 font-display text-[clamp(38px,5vw,60px)] leading-none font-extrabold tracking-[-0.035em]">
            Les mentions
          </h1>
          <p className="m-0 max-w-[620px] text-[17px] leading-normal text-ink-muted">
            La mention, c’est le nom officiel du diplôme. Chaque université y rattache ses propres
            parcours : une mention peut en avoir un seul ou une dizaine.
          </p>
        </div>
        <IndexSearchField
          value={q}
          onChange={setQ}
          label="Filtrer les mentions"
          placeholder="Filtrer : droit, informatique, patrimoine…"
        />
      </div>

      <div
        role="group"
        aria-label="Domaine"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2.5 max-sm:grid-cols-2"
      >
        {tiles.map((t) => {
          const on = dom === t.slug;
          const count = entries.filter((e) => (!t.slug || e.domain === t.slug) && inCity(e)).length;
          return (
            <button
              key={t.slug ?? '*'}
              type="button"
              aria-pressed={on}
              onClick={() => setDom(t.slug)}
              className={cn(
                'ix-chip flex min-h-16 cursor-pointer items-center gap-3 rounded-[18px] border-2 px-3.5 py-2.5 text-left text-ink',
                on ? 'border-ink bg-surface-0' : 'border-border bg-surface-0/60',
                !t.slug && 'max-sm:col-span-2',
              )}
            >
              <span
                aria-hidden="true"
                style={{ background: t.colors[0], color: t.colors[1] }}
                className={cn(
                  'flex size-8.5 flex-none -rotate-3 items-center justify-center rounded-[10px] font-display font-extrabold',
                  t.short.length > 2 ? 'text-[11px]' : 'text-[14px]',
                )}
              >
                {t.short}
              </span>
              <span className="flex min-w-0 flex-col gap-px">
                <span className="text-[14px] leading-tight font-bold">{t.name}</span>
                <span className="text-[12px] text-ink-muted">
                  {plural(count, 'mention', 'mentions')}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CityPicker
          cities={cities}
          value={city}
          onChange={setCity}
          unit={['mention', 'mentions']}
        />
        <IndexSort value={sort} options={MENTION_SORTS} onChange={setSort} />
      </div>

      <span role="status" className="text-[14px] font-semibold text-ink-muted">
        {countLabel(rows.length, entries.length, 'mention', 'mentions')}
      </span>

      {rows.length > 0 ? (
        <div className="flex flex-col gap-6.5">
          {groups.map((g) => (
            <section
              key={g.letter || 'all'}
              aria-label={g.letter ? `Lettre ${g.letter}` : 'Mentions'}
              className="flex flex-col gap-3"
            >
              {g.letter && (
                <h2 className="m-0 flex items-center gap-3">
                  <span className="inline-flex size-11 -rotate-3 items-center justify-center rounded-[12px] bg-lime-400 font-display text-[24px] font-extrabold text-on-lime">
                    {g.letter}
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                </h2>
              )}
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3 p-0">
                {g.items.map((m) => {
                  const d = m.domain ? domainOf.get(m.domain) : undefined;
                  const where = citiesLabel(
                    m.zones.map((z) => zoneName.get(z) ?? z),
                    cityName,
                  );
                  const i = n++;
                  const href = `/mentions/${m.slug}${city ? `?lieu=${encodeURIComponent(`zone:${city}`)}` : ''}`;
                  return (
                    <li
                      key={m.slug}
                      className="ix-card relative box-border flex min-h-31 flex-col gap-2.5 overflow-hidden rounded-[18px] border-[1.5px] border-border bg-surface-0 py-4 pr-4.5 pl-5.5 text-ink"
                      style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-1.5"
                        style={{ background: toneOf(d?.tone)[0] }}
                      />
                      {d && <span className="text-[12px] font-bold text-ink-muted">{d.name}</span>}
                      <span className="flex items-start justify-between gap-2.5">
                        {/* the name is the link; its ::after covers the whole card */}
                        <Link
                          href={href}
                          className="font-display text-[19px] leading-[1.2] font-bold tracking-[-0.01em] text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:text-ink"
                        >
                          {m.name}
                        </Link>
                        <ArrowGo />
                      </span>
                      <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                        <span className="text-[13px] text-ink-muted">
                          <strong className="text-ink">
                            {plural(m.parcours, 'parcours', 'parcours')}
                          </strong>
                          {where && ` · ${where}`}
                        </span>
                        <IndexRating avg={m.avg} reviews={m.reviews} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <IndexEmpty title="Aucune mention avec ces filtres" onReset={reset} />
      )}
    </>
  );
}
