'use client';

import { useState } from 'react';
import { CURSUS_VISIBLE, type CursusItem } from '@/lib/catalog/cursus-view';
import { formatInt } from '@/lib/format';

/**
 * Compact table of the cursus (beyond 6, the CNAM) or of the Mon Master numbers that nothing tells
 * apart: sorted by places, the order can be reversed, 6 rows then « Voir les N … ». Below 640 px
 * each row becomes a small card (no horizontal scroll at 320 px). The only script of the section.
 */
export function CursusTable({
  items,
  firstColumn,
  moreLabel,
}: {
  items: CursusItem[];
  /** « Cursus » (named) or « Fiche Mon Master » (numbers without label). */
  firstColumn: 'Cursus' | 'Fiche Mon Master';
  /** « Voir les 26 cursus », « Voir les 25 fiches ». */
  moreLabel: string;
}) {
  const [all, setAll] = useState(false);
  const [asc, setAsc] = useState(false);
  const sorted = asc ? [...items].reverse() : items;
  const shown = all ? sorted : sorted.slice(0, CURSUS_VISIBLE);
  const num = (n: number | null) => (n == null ? 'n.c.' : formatInt(n));
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full border-collapse text-[14px] max-sm:block">
        <thead className="max-sm:sr-only">
          <tr className="border-b border-border text-left text-[12px] text-ink-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">
              {firstColumn}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold" aria-sort={asc ? 'ascending' : 'descending'}>
              <button
                type="button"
                onClick={() => setAsc((v) => !v)}
                className="inline-flex min-h-tap items-center gap-1 font-semibold text-ink-muted"
              >
                Places <span aria-hidden="true">{asc ? '↑' : '↓'}</span>
                <span className="sr-only">
                  {asc ? ' (de la plus petite à la plus grande, inverser)' : ' (de la plus grande à la plus petite, inverser)'}
                </span>
              </button>
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">
              Candidatures
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Taux d’accès
            </th>
          </tr>
        </thead>
        <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-2">
          {shown.map((c) => {
            const name = firstColumn === 'Cursus' && c.label ? c.label : c.code;
            return (
              <tr
                key={c.code}
                className="border-b border-border max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-3 max-sm:gap-y-1 max-sm:rounded-[14px] max-sm:border max-sm:p-3"
              >
                <th scope="row" className="py-2.5 pr-3 text-left font-semibold max-sm:w-full max-sm:py-0">
                  {c.url ? (
                    <a href={c.url} rel="noopener noreferrer" target="_blank">
                      {firstColumn === 'Cursus' ? name : <span className="font-mono text-[13px]">{c.code}</span>} ↗
                      <span className="sr-only"> (fiche Mon Master, nouvel onglet)</span>
                    </a>
                  ) : (
                    name
                  )}
                </th>
                <td className="py-2.5 pr-3 text-right tabular-nums max-sm:p-0 max-sm:text-left">
                  {num(c.places)}
                  <span className="sm:sr-only"> places</span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums max-sm:p-0 max-sm:text-left">
                  {num(c.applications)}
                  <span className="sm:sr-only"> candidatures</span>
                </td>
                <td className="py-2.5 text-right tabular-nums max-sm:p-0 max-sm:text-left">
                  {c.rate == null ? 'n.c.' : `${c.rate} %`}
                  <span className="sm:sr-only"> taux d’accès</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length > CURSUS_VISIBLE && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
          className="inline-flex min-h-tap items-center self-start rounded-pill border-[1.5px] border-ink px-4 text-[14px] font-bold"
        >
          {all ? 'Voir moins' : moreLabel}
        </button>
      )}
    </div>
  );
}
