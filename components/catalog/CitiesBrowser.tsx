'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BrandName } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  CITY_SORTS,
  cityOrder,
  cityReviewsShown,
  countLabel,
  domainShares,
  matchesWords,
  plural,
  regionSlug,
  type CityEntry,
  type CitySort,
  type DomainLegend,
} from '@/lib/catalog/index-labels';
import { PinIcon } from './CityPicker';
import { IndexEmpty, IndexRating, IndexSearchField, IndexSort, useUrlState } from './IndexParts';

/** Colours of the national domains, those of the home tiles. */
const TONE: Record<string, string> = {
  violet: 'var(--violet-500)',
  lime: 'var(--lime-400)',
  coral: 'var(--coral-300)',
  night: 'var(--night)',
};
const toneOf = (t: string) => TONE[t] ?? TONE.violet!;

const nf = new Intl.NumberFormat('fr-FR');

/**
 * /masters (VillesIndex mockup): the field, the legend of the domains, the region and the
 * sort, then one card per open city. The list (one light row per city) comes from the server;
 * filters and sorts run here, kept in the address. Holds from 3 to 80 cities: one grid, no
 * section per region.
 */
export function CitiesBrowser({
  entries,
  domains,
  initial,
}: {
  entries: CityEntry[];
  domains: DomainLegend[];
  initial: { q: string; region: string | null; tri: CitySort };
}) {
  const [q, setQ] = useState(initial.q);
  const [region, setRegion] = useState(initial.region);
  const [sort, setSort] = useState<CitySort>(initial.tri);
  useUrlState({ q: q.trim() || null, region, tri: sort }, { tri: 'masters' });

  const regions = useMemo(
    () =>
      [...new Set(entries.map((e) => e.region).filter((r): r is string => !!r))]
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map((name) => ({ slug: regionSlug(name), name })),
    [entries],
  );

  const text = (e: CityEntry) => `${e.name} ${e.region ?? ''}`;
  const rows = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            (!region || (e.region && regionSlug(e.region) === region)) && matchesWords(text(e), q),
        )
        .sort(cityOrder(sort)),
    [entries, region, q, sort],
  );
  // The text names a city of another region: the filters are too narrow, the city is there.
  const elsewhere = rows.length === 0 && entries.some((e) => matchesWords(text(e), q));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4.5">
        <div className="flex flex-[1_1_520px] flex-col gap-2.5">
          <h1 className="m-0 font-display text-[clamp(38px,5vw,60px)] leading-none font-extrabold tracking-[-0.035em]">
            Les masters par ville
          </h1>
          <p className="m-0 max-w-[620px] text-[17px] leading-normal text-ink-muted">
            {entries.length > 1
              ? `${nf.format(entries.length)} villes ouvertes pour commencer.`
              : 'Une ville ouverte pour commencer.'}{' '}
            Choisis la tienne : tous ses masters publics, ses établissements et les avis de leurs
            étudiant·es.
          </p>
        </div>
        <IndexSearchField
          value={q}
          onChange={setQ}
          label="Chercher une ville ou une région"
          placeholder="Chercher une ville ou une région…"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul
          aria-label="Légende des domaines"
          className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0"
        >
          {domains.map((d) => (
            <li
              key={d.slug}
              className="inline-flex items-center gap-[7px] text-[13px] text-ink-muted"
            >
              <span
                aria-hidden="true"
                className="size-3 rounded-[4px]"
                style={{ background: toneOf(d.tone) }}
              />
              {d.name}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[14px] font-semibold whitespace-nowrap">
            Région
            <select
              value={region ?? ''}
              onChange={(e) => setRegion(e.target.value || null)}
              className={cn(
                'min-h-11 cursor-pointer rounded-[12px] border-[1.5px] bg-surface-0 px-3 text-[14px] font-semibold text-ink',
                region ? 'border-ink' : 'border-border-control',
              )}
            >
              <option value="">Toutes les régions</option>
              {regions.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <IndexSort value={sort} options={CITY_SORTS} onChange={setSort} />
        </div>
      </div>

      <span role="status" className="text-[14px] font-semibold text-ink-muted">
        {countLabel(rows.length, entries.length, 'ville', 'villes')}
      </span>

      {rows.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-3.5 p-0 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((c, i) => (
            <li key={c.slug} className="flex">
              <CityCard city={c} domains={domains} delay={Math.min(i, 9) * 40} />
            </li>
          ))}
        </ul>
      ) : elsewhere || !q.trim() ? (
        <IndexEmpty
          title="Aucune ville avec ces filtres"
          onReset={() => {
            setQ('');
            setRegion(null);
          }}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-[24px] border-2 border-ink bg-surface-0 px-6 py-8 text-center">
          <span className="font-display text-[24px] font-extrabold">
            « {q.trim()} » n’est pas encore sur <BrandName size="sm" />
          </span>
          <span className="max-w-[520px] text-[15px] leading-normal text-ink-muted">
            On ouvre les villes petit à petit, pour avoir assez d’avis dans chacune avant de la
            mettre en ligne. La tienne arrive bientôt.
          </span>
        </div>
      )}

      <section
        aria-label="Les autres villes"
        className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] bg-[#16131f] px-5.5 py-4.5 text-white"
      >
        <span
          aria-hidden="true"
          className="flex size-10 flex-none -rotate-3 items-center justify-center rounded-[12px] bg-lime-400"
        >
          <PinIcon size={18} stroke="#16131F" />
        </span>
        <span className="flex flex-[1_1_360px] flex-col gap-0.5">
          <strong className="text-[16px]">Ta ville n’est pas encore là ?</strong>
          <span className="text-[14px] text-[#cfcadb]">
            On ouvre les villes petit à petit, pour avoir assez d’avis dans chacune. En attendant,
            si tu as fait ton master dans l’une de ces villes, ton avis aide les suivant·es.
          </span>
        </span>
        <Link
          href="/avis/nouveau"
          className="inline-flex min-h-11 items-center rounded-pill bg-lime-400 px-4.5 text-[14px] font-bold text-on-lime no-underline hover:text-on-lime"
        >
          Donner mon avis
        </Link>
      </section>
    </>
  );
}

function CityCard({
  city: c,
  domains,
  delay,
}: {
  city: CityEntry;
  domains: DomainLegend[];
  delay: number;
}) {
  const shares = domainShares(c.domains, domains);
  const shown = cityReviewsShown(c.reviews, c.avg);
  return (
    <div
      className="vc relative flex w-full flex-col gap-3.5 rounded-[22px] border-[1.5px] border-border bg-surface-0 p-5 text-ink"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* The name is the link (its visible text is in its label); its ::after covers the
              whole card. */}
          <Link
            href={`/masters/${c.slug}`}
            aria-label={`Masters à ${c.name} : ${plural(c.masters, 'parcours', 'parcours')}, ${plural(c.reviews, 'avis', 'avis')}`}
            className="font-display text-[28px] leading-[1.05] font-extrabold tracking-[-0.025em] text-ink no-underline [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[22px] after:content-[''] hover:text-ink"
          >
            {c.name}
          </Link>
          {c.region && <span className="text-[13px] text-ink-muted">{c.region}</span>}
        </div>
        <span
          aria-hidden="true"
          className="go flex size-[38px] flex-none items-center justify-center rounded-[12px] bg-surface-100 text-ink"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      <p className="m-0 flex items-baseline gap-2">
        <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
          {nf.format(c.masters)}
        </span>
        <span className="text-[15px] font-semibold text-ink-muted">
          {c.masters > 1 ? 'masters' : 'master'}
        </span>
      </p>
      {shares.length > 0 && (
        <div
          role="img"
          aria-label={`Répartition par domaine : ${shares.map((s) => `${s.name} ${s.pct} %`).join(', ')}`}
          className="flex h-2.5 gap-0.5 overflow-hidden rounded-pill"
        >
          {shares.map((s, k) => (
            <span
              key={s.slug}
              className="seg"
              style={{
                flex: `${s.n} 1 0`,
                background: toneOf(s.tone),
                animationDelay: `${120 + 60 * k}ms`,
              }}
            />
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-surface-100 pt-3">
        <span className="text-[13px] text-ink-muted">
          {plural(c.establishments, 'établissement public', 'établissements publics')}
        </span>
        {shown === 'grade' ? (
          <IndexRating avg={c.avg} reviews={c.reviews} />
        ) : shown === 'count' ? (
          <span className="text-[13px] text-ink-muted">{plural(c.reviews, 'avis', 'avis')}</span>
        ) : (
          <span className="text-[13px] text-ink-muted">Pas encore d’avis</span>
        )}
      </div>
    </div>
  );
}
