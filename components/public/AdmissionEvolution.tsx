'use client';

import { useState } from 'react';
import {
  PROMO_MIN_REVIEWS,
  sessionsLabel,
  type Annotation,
  type EvolutionPoint,
  type PromoRating,
} from '@/lib/domain/admission-evolution';
import { gradeColor } from '@/lib/domain/rating';
import { formatInt, formatRating } from '@/lib/format';

const rate1 = (x: number) =>
  x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const MEASURES = [
  { id: 'applications', title: 'Candidatures', fmt: (x: number) => formatInt(x) },
  { id: 'offers', title: 'Propositions', fmt: (x: number) => formatInt(x) },
  { id: 'rate', title: 'Pour 100 candidatures', fmt: rate1 },
] as const;

/**
 * « Comment ce master évolue » (Admission tab): three small column charts, one
 * axis each (never two scales on one chart), value above each column, hover detail; a session
 * without data is not drawn. Annotations when something changes; the rating promo by promo.
 */
export function AdmissionEvolution({
  points,
  annotations,
  promos,
}: {
  points: EvolutionPoint[];
  annotations: Annotation[];
  promos: PromoRating[];
}) {
  const [hover, setHover] = useState<{ m: string; s: number } | null>(null);
  const charts = points.length >= 2;
  if (!charts && !promos.length && !annotations.length) return null;
  const sessions = points.map((p) => p.session);
  const figures = MEASURES.map((m) => {
    const bars = points
      .filter((p) => p[m.id] != null)
      .map((p) => ({ session: p.session, v: p[m.id]! }));
    const max = Math.max(...bars.map((b) => b.v), 0) || 1;
    return { ...m, bars, max };
  });
  const hc = hover && figures.find((f) => f.id === hover.m);
  const hb = hc && hc.bars.find((b) => b.session === hover.s);
  const hoverText =
    hc && hb ? `${hc.title} en ${hb.session} : ${hc.fmt(hb.v)}` : 'Survole une colonne.';

  return (
    <section
      aria-labelledby="ev-title"
      className="flex flex-col gap-4.5 rounded-[24px] border border-border bg-surface-0 p-7 max-sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="ev-title"
            className="m-0 font-display text-[26px] leading-[1.2] font-extrabold tracking-[-0.02em]"
          >
            Comment ce master évolue
          </h2>
          {charts && (
            <span className="text-[14px] text-ink-soft">
              Sessions Mon Master {sessions[0]} à {sessions.at(-1)}
            </span>
          )}
        </div>
        {charts && (
          <span className="text-[14px] font-semibold text-ink-soft" aria-live="polite">
            {hoverText}
          </span>
        )}
      </div>

      {charts && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
          {figures.map((c) => (
            <figure
              key={c.id}
              className="m-0 flex flex-col gap-2.5 rounded-[20px] border border-surface-100 bg-[color-mix(in_srgb,var(--surface-0)_70%,var(--surface-50))] p-4"
            >
              <figcaption className="text-[14px] font-bold">{c.title}</figcaption>
              <div
                role="img"
                aria-label={`${c.title} : ${c.bars.map((b) => `${b.session} ${c.fmt(b.v)}`).join(', ')}`}
                className="flex h-[130px] items-end gap-2.5 border-b border-border px-1"
              >
                {c.bars.map((b, i) => {
                  const on = hover?.m === c.id;
                  return (
                    <div
                      key={b.session}
                      onMouseEnter={() => setHover({ m: c.id, s: b.session })}
                      onMouseLeave={() => setHover(null)}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span className="text-[12px] font-bold">{c.fmt(b.v)}</span>
                      <span
                        className="ev-bar w-full max-w-11 rounded-t-[4px] bg-violet-500"
                        style={{
                          height: `${Math.max(3, Math.round((b.v / c.max) * 80))}%`,
                          opacity: on && hover.s !== b.session ? 0.4 : 1,
                          animationDelay: `${120 * i}ms`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div aria-hidden="true" className="flex gap-2.5 px-1">
                {c.bars.map((b) => (
                  <span key={b.session} className="flex-1 text-center text-[12px] text-ink-muted">
                    {b.session}
                  </span>
                ))}
              </div>
            </figure>
          ))}
        </div>
      )}

      {annotations.map((a) => (
        <div
          key={`${a.kind}-${a.when}`}
          className="flex flex-wrap items-center gap-2.5 rounded-[16px] bg-surface-50 px-4 py-3 text-[14px] leading-[1.5]"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span className="min-w-0 flex-1">
            <strong>{a.when} :</strong> {a.text}
          </span>
        </div>
      ))}

      {promos.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-surface-100 pt-4">
          <h3 className="m-0 font-display text-[19px] font-bold">La note, promo par promo</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-2.5">
            {promos.map((p) => (
              <div
                key={p.year}
                className="flex flex-col items-start gap-1.5 rounded-[18px] border border-surface-100 bg-[color-mix(in_srgb,var(--surface-0)_70%,var(--surface-50))] p-3.5"
              >
                <span className="text-[12px] font-bold text-ink-muted">Promo {p.year}</span>
                <span
                  role="img"
                  aria-label={`Promo ${p.year} : ${formatRating(p.avg)} sur 5`}
                  className="inline-flex -rotate-3 items-baseline rounded-[11px] px-2.5 pt-1 pb-1.5 font-display text-[22px] font-extrabold text-on-lime"
                  style={{ backgroundColor: gradeColor(p.avg) }}
                >
                  <span aria-hidden="true">{formatRating(p.avg)}</span>
                  <span aria-hidden="true" className="text-[13px] text-[#3b3648]">
                    /5
                  </span>
                </span>
                <span className="text-[12px] text-ink-soft">{p.count} avis</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="m-0 text-[13px] text-ink-muted">
        {charts
          ? `Source : Mon Master, données ouvertes du ministère, sessions ${sessionsLabel(sessions)} (tous les numéros Mon Master du parcours, anciens compris). `
          : ''}
        {promos.length
          ? `Notes : moyenne des avis publiés de chaque promo, à partir de ${PROMO_MIN_REVIEWS} avis.`
          : ''}
      </p>
    </section>
  );
}
