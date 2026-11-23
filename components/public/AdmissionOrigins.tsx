'use client';

import { useState } from 'react';
import {
  figureLabel,
  RATE_MIN_APPLICATIONS,
  SHARE_MIN_ACCEPTED,
  STAGES,
  type OriginsSummary,
  type Stage,
} from '@/lib/domain/admission-origins';
import { formatInt, NC } from '@/lib/format';

const pct = (n: number, total: number) => `${Math.round((n / total) * 100)} %`;

/**
 * « D'où viennent les admis ? » (Admission tab): stacked bar of the latest
 * session by diploma prepared (Admis by default), legend with numbers and percentages, hover
 * that dims the other segments, rate per origin, three figures and a table view.
 */
export function AdmissionOrigins({
  summary,
  university,
  sourceUrl,
}: {
  summary: OriginsSummary;
  university: string;
  sourceUrl: string;
}) {
  const [stage, setStage] = useState<Stage>('accepted');
  const [hover, setHover] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const word = STAGES.find((s) => s.id === stage)!.word;
  const { total, groups } = summary.stages[stage];
  const shown = groups.filter((g) => g.n != null);
  const h = shown.find((g) => g.id === hover);
  const maxRate = Math.max(25, ...summary.rates.map((r) => r.rate ?? 0));
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % 3
        : e.key === 'ArrowLeft'
          ? (i + 2) % 3
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? 2
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setStage(STAGES[next]!.id);
    document.getElementById(`ao-stage-${STAGES[next]!.id}`)?.focus();
  };

  return (
    <section
      aria-labelledby="ao-title"
      className="flex flex-col gap-4.5 rounded-[24px] border border-border bg-surface-0 p-7 max-sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="ao-title"
            className="m-0 font-display text-[26px] leading-[1.2] font-extrabold tracking-[-0.02em]"
          >
            D’où viennent les admis ?
          </h2>
          <span className="text-[14px] text-ink-soft">
            Diplôme préparé l’année de la candidature · session {summary.session}
          </span>
        </div>
        <div
          role="tablist"
          aria-label="Étape"
          // Wraps on a small phone (320 px) instead of pushing the page sideways.
          className="flex max-w-full flex-wrap gap-1 rounded-[22px] bg-surface-100 p-1"
        >
          {STAGES.map((s, i) => {
            const on = s.id === stage;
            return (
              <button
                key={s.id}
                id={`ao-stage-${s.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="ao-bar"
                tabIndex={on ? 0 : -1}
                onClick={() => setStage(s.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={`min-h-10 cursor-pointer rounded-pill border-0 px-3.5 text-[13px] font-semibold ${on ? 'bg-ink text-surface-0' : 'bg-transparent text-ink'}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-2 text-[14px]">
        <span className="font-bold">
          {formatInt(total)} {word}
        </span>
        <span className="text-ink-soft" aria-live="polite">
          {h && total
            ? `${h.label} : ${formatInt(h.n)} sur ${formatInt(total)} (${pct(h.n!, total)})`
            : 'Survole une couleur pour le détail.'}
        </span>
      </div>

      <div
        id="ao-bar"
        role="img"
        aria-label={
          total
            ? `Répartition des ${word} : ${shown.map((g) => `${g.label} ${pct(g.n!, total)}`).join(', ')}`
            : `Aucun ${word === 'admis' ? 'admis' : word.replace(/s$/, '')} publié`
        }
        className="flex h-10 gap-0.5 overflow-hidden rounded-[10px] bg-surface-100"
      >
        {total
          ? shown.map((g, i) => (
              <span
                key={`${stage}-${g.id}`}
                className="ao-seg"
                onMouseEnter={() => setHover(g.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  flex: `${g.n} 1 0`,
                  minWidth: g.n ? 4 : 0,
                  background: g.color,
                  opacity: hover && hover !== g.id ? 0.35 : 1,
                  animationDelay: `${80 * i}ms`,
                }}
              />
            ))
          : null}
      </div>

      <ul aria-label="Légende" className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
        {groups.map((g) => (
          <li
            key={g.id}
            className="inline-flex items-center gap-2 text-[14px] text-ink-soft"
            onMouseEnter={() => g.n != null && setHover(g.id)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-[4px]"
              style={{ background: g.color }}
            />
            <span>
              <strong className="text-ink">{g.label}</strong> ·{' '}
              {g.n == null ? NC : `${formatInt(g.n)} (${total ? pct(g.n, total) : '0 %'})`}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2.5 border-t border-surface-100 pt-4">
        <h3 className="m-0 font-display text-[19px] font-bold">Tes chances selon ton diplôme</h3>
        {summary.rates.map((r, i) => (
          <div key={r.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            <span className="flex-[0_0_160px] text-[14px] font-semibold">{r.label}</span>
            <span
              aria-hidden="true"
              className="block h-3 flex-[1_1_200px] overflow-hidden rounded-[4px] bg-surface-100"
            >
              {r.rate != null && (
                <span
                  className="ao-rate block h-full rounded-[4px]"
                  style={{
                    width: `${(Math.max(r.rate, 1) / maxRate) * 100}%`,
                    background: r.color,
                    animationDelay: `${100 * i}ms`,
                  }}
                />
              )}
            </span>
            <span className="flex-[0_0_210px] text-[13px] text-ink-soft">
              <strong className="text-ink">{r.rate == null ? NC : `${r.rate} pour 100`}</strong> ·{' '}
              {formatInt(r.offers)} / {formatInt(r.applications)} candidatures
            </span>
          </div>
        ))}
      </div>

      {summary.figures.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-2.5">
          {summary.figures.map((f) => (
            <div
              key={f.id}
              className="flex flex-col gap-0.5 rounded-[18px] bg-surface-50 px-4 py-3.5"
            >
              <span className="font-display text-[28px] font-extrabold">
                {f.share == null ? formatInt(f.n) : `${f.share} %`}
              </span>
              <span className="text-[13px] text-ink-soft">
                {f.share == null ? `sur ${formatInt(summary.acceptedTotal)} admis : ` : ''}
                {figureLabel(f.id, university)}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-expanded={table}
        aria-controls="ao-table"
        onClick={() => setTable((t) => !t)}
        className="min-h-10 cursor-pointer self-start border-0 bg-transparent p-0 text-[14px] font-semibold text-violet-700"
      >
        {table ? 'Masquer le tableau' : 'Voir en tableau'}
      </button>
      {table && (
        <div id="ao-table" className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <caption className="sr-only">
              Candidatures, propositions et admis par diplôme préparé, session {summary.session}
            </caption>
            <thead>
              <tr className="text-left text-[13px] text-ink-muted">
                <th scope="col" className="py-2 pr-3">
                  Diplôme préparé
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  Candidatures
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  Propositions
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  Admis
                </th>
                <th scope="col" className="py-2 text-right">
                  Pour 100 candidatures
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.rates.map((r, i) => (
                <tr key={r.id} className="border-t border-surface-100">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">
                    {r.label}
                  </th>
                  <td className="py-2 pr-3 text-right">{formatInt(r.applications)}</td>
                  <td className="py-2 pr-3 text-right">{formatInt(r.offers)}</td>
                  <td className="py-2 pr-3 text-right">
                    {formatInt(summary.stages.accepted.groups[i]!.n)}
                  </td>
                  <td className="py-2 text-right">{r.rate == null ? NC : r.rate}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-bold">
                <th scope="row" className="py-2 pr-3 text-left">
                  Total
                </th>
                <td className="py-2 pr-3 text-right">
                  {formatInt(summary.stages.applications.total)}
                </td>
                <td className="py-2 pr-3 text-right">{formatInt(summary.stages.offers.total)}</td>
                <td className="py-2 pr-3 text-right">{formatInt(summary.stages.accepted.total)}</td>
                <td className="py-2 text-right" />
              </tr>
              {summary.figures.map((f) => (
                <tr key={f.id} className="border-t border-surface-100">
                  <th scope="row" colSpan={3} className="py-2 pr-3 text-left font-normal">
                    Admis {figureLabel(f.id, university).replace(/^admis /, '')}
                  </th>
                  <td className="py-2 pr-3 text-right">{formatInt(f.n)}</td>
                  <td className="py-2 text-right">{f.share == null ? NC : `${f.share} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="m-0 text-[13px] text-ink-muted">
        Source :{' '}
        <a href={sourceUrl} rel="noopener noreferrer" target="_blank">
          Mon Master, données ouvertes du ministère
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
        , session {summary.session}
        {summary.entries > 1 ? ` (${summary.entries} numéros Mon Master additionnés)` : ''}. « {NC}{' '}
        » sous {RATE_MIN_APPLICATIONS} candidatures ; pourcentages masqués sous {SHARE_MIN_ACCEPTED}{' '}
        admis.
      </p>
    </section>
  );
}
