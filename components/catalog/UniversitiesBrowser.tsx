'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  byName,
  byRating,
  citiesLabel,
  countLabel,
  matchesWords,
  plural,
  TILES,
  UNIVERSITY_SORTS,
  type IndexCity,
  type UniversitySort,
} from '@/lib/catalog/index-labels';
import type { UniversityEntry, ZoneName } from '@/lib/catalog/indexes';
import { normalize } from '@/lib/domain/search';
import { CityPicker, PinIcon } from './CityPicker';
import {
  ArrowGo,
  IndexEmpty,
  IndexRating,
  IndexSearchField,
  IndexSort,
  useUrlState,
} from './IndexParts';

const TYPES = [
  { id: null, label: 'Tous' },
  { id: 'univ', label: 'Universités' },
  { id: 'ecole', label: 'Écoles et instituts' },
] as const;
type Kind = 'univ' | 'ecole';

/** At most this many communes on the « Campus : » line. */
const MAX_CAMPUS = 5;

/**
 * /universites: the filter field, the type of establishment, the city
 * picker and the sort, then one grid of every public establishment that has a published master
 * in an open city. No section per city: it would not hold with many cities.
 */
export function UniversitiesBrowser({
  entries,
  zones,
  initial,
}: {
  entries: UniversityEntry[];
  zones: ZoneName[];
  initial: { q: string; type: Kind | null; ville: string | null; tri: UniversitySort };
}) {
  const [q, setQ] = useState(initial.q);
  const [type, setType] = useState<Kind | null>(initial.type);
  const [city, setCity] = useState(initial.ville);
  const [sort, setSort] = useState<UniversitySort>(initial.tri);
  useUrlState({ q: q.trim() || null, type, ville: city, tri: sort }, { tri: 'masters' });

  const zoneName = useMemo(() => new Map(zones.map((z) => [z.slug, z.name])), [zones]);
  const cityName = city ? (zoneName.get(city) ?? null) : null;
  const cities: IndexCity[] = useMemo(
    () =>
      zones
        .map((z) => ({ ...z, count: entries.filter((e) => e.zones.includes(z.slug)).length }))
        .filter((c) => c.count > 0),
    [zones, entries],
  );

  const rows = useMemo(() => {
    const text = (e: UniversityEntry) =>
      [e.name, e.mono, ...e.campus, ...e.zones.map((z) => zoneName.get(z) ?? '')].join(' ');
    return entries
      .filter(
        (e) =>
          (!type || e.kind === type) &&
          (!city || e.zones.includes(city)) &&
          matchesWords(text(e), q),
      )
      .sort(
        sort === 'az'
          ? byName
          : sort === 'note'
            ? byRating
            : (a, b) => b.masters - a.masters || byName(a, b),
      );
  }, [entries, type, city, q, sort, zoneName]);

  const reset = () => {
    setQ('');
    setType(null);
    setCity(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4.5">
        <div className="flex flex-[1_1_520px] flex-col gap-2.5">
          <h1 className="m-0 font-display text-[clamp(38px,5vw,60px)] leading-none font-extrabold tracking-[-0.035em]">
            Les universités
          </h1>
          <p className="m-0 max-w-[620px] text-[17px] leading-normal text-ink-muted">
            Les universités et écoles publiques des villes ouvertes, avec leurs masters et les avis
            de leurs étudiant·es.
          </p>
        </div>
        <IndexSearchField
          value={q}
          onChange={setQ}
          label="Filtrer les établissements"
          placeholder="Filtrer : Nantes, INSA, Centrale…"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Type d’établissement" className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => {
            const on = type === t.id;
            const count = entries.filter((e) => !t.id || e.kind === t.id).length;
            return (
              <button
                key={t.id ?? '*'}
                type="button"
                aria-pressed={on}
                onClick={() => setType(t.id)}
                className={cn(
                  'ix-chip inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border-[1.5px] px-3.5 text-[14px] font-semibold',
                  on
                    ? 'border-ink bg-ink text-surface-0'
                    : 'border-[#d7d3e0] bg-surface-0 text-ink dark:border-border-control',
                )}
              >
                {t.label}
                <span className="text-[12px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <CityPicker
            cities={cities}
            value={city}
            onChange={setCity}
            unit={['établissement', 'établissements']}
          />
          <IndexSort value={sort} options={UNIVERSITY_SORTS} onChange={setSort} />
        </div>
      </div>

      <span role="status" className="text-[14px] font-semibold text-ink-muted">
        {countLabel(rows.length, entries.length, 'établissement', 'établissements')}
      </span>

      {rows.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {rows.map((u, i) => {
            const names = u.zones.map((z) => zoneName.get(z) ?? z);
            const where = citiesLabel(names, cityName);
            const campus = [...u.campus].sort(
              (a, b) =>
                Number(names.includes(b)) - Number(names.includes(a)) || a.localeCompare(b, 'fr'),
            );
            const showCampus =
              campus.length > 0 &&
              !(
                campus.length === names.length &&
                campus.every((c) => names.some((n) => normalize(n) === normalize(c)))
              );
            const [bg, ink] = TILES[u.tile]!;
            return (
              <li
                key={u.slug}
                className="ix-card relative flex items-start gap-4 rounded-[20px] border-[1.5px] border-border bg-surface-0 p-4.5 text-ink"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <span
                  aria-hidden="true"
                  style={{ background: bg, color: ink }}
                  className={cn(
                    'flex size-14 flex-none items-center justify-center rounded-md text-center font-display leading-none font-extrabold tracking-[-0.02em]',
                    u.mono.length > 6
                      ? 'text-[12px]'
                      : u.mono.length > 4
                        ? 'text-[13px]'
                        : u.mono.length > 3
                          ? 'text-[15px]'
                          : 'text-[18px]',
                  )}
                >
                  {u.mono}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-start justify-between gap-2.5">
                    {/* the name is the link; its ::after covers the whole card */}
                    <Link
                      href={`/universites/${u.slug}`}
                      className="font-display text-[20px] leading-[1.15] font-bold text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:text-ink"
                    >
                      {u.name}
                    </Link>
                    <ArrowGo />
                  </span>
                  <span className="flex flex-col gap-1.5">
                    <span className="text-[13px] text-ink-muted">
                      <span className="mr-1.5 inline-flex align-[-1px]">
                        <PinIcon size={13} stroke="var(--violet-500)" />
                      </span>
                      <strong className="text-ink">{where}</strong>
                      {' · '}
                      {u.kind === 'univ' ? 'Université' : 'École ou institut'}
                    </span>
                    {showCampus && (
                      <span className="text-[12px] text-ink-muted">
                        Campus : {campus.slice(0, MAX_CAMPUS).join(' · ')}
                        {campus.length > MAX_CAMPUS &&
                          ` et ${plural(campus.length - MAX_CAMPUS, 'autre', 'autres')}`}
                      </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-surface-100 pt-2.5">
                      <span className="text-[13px] text-ink-muted">
                        <strong className="text-ink">
                          {plural(u.masters, 'master', 'masters')}
                        </strong>
                        {' · '}
                        {plural(u.mentions, 'mention', 'mentions')}
                      </span>
                      <IndexRating avg={u.avg} reviews={u.reviews} />
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <IndexEmpty title="Aucun établissement avec ces filtres" onReset={reset} />
      )}
    </>
  );
}
