'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { CourseCategory, MilestoneKind } from '@/lib/db/generated/enums';
import type { Fact, OutlineYear } from '@/lib/domain/program-outline';

/** Icon paths of the Programme tab. */
const ICON = {
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  job: 'M3 7h18v13H3zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  cap: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
};
const FACT_STYLE: Record<Fact['key'], { icon: string; cls: string }> = {
  duration: { icon: ICON.calendar, cls: 'bg-violet-100 text-violet-700' },
  internships: { icon: ICON.job, cls: 'bg-coral-100 text-coral-800' },
  theses: { icon: ICON.doc, cls: 'bg-lime-100 text-lime-800' },
  certification: { icon: ICON.cap, cls: 'bg-warning-bg text-warning' },
};
const MILESTONE_ICON: Record<MilestoneKind, string> = {
  INTERNSHIP: ICON.job,
  THESIS: ICON.doc,
  PROJECT: ICON.job,
  STUDY_TRIP: ICON.job,
  CERTIFICATION: ICON.cap,
};

export interface PanelCategory {
  id: CourseCategory;
  label: string;
  color: string;
}

export interface PanelMilestone {
  id: string;
  kind: MilestoneKind;
  title: string;
  detail: string | null;
  category: CourseCategory;
}

function Svg({ d, size }: { d: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Programme tab: computed facts, theme filter, one timeline per year. Rendered
 * on the server with every semester; the filter only highlights a theme (others at 0.28).
 */
export function ProgrammePanel({
  facts,
  categories,
  years,
  milestoneCategory,
  footer,
}: {
  facts: Fact[];
  categories: PanelCategory[];
  years: OutlineYear[];
  /** Category of each milestone (by id), for the filter. */
  milestoneCategory: Record<string, CourseCategory>;
  footer: React.ReactNode;
}) {
  const [pick, setPick] = useState<CourseCategory | 'all'>('all');
  const colorOf = Object.fromEntries(categories.map((c) => [c.id, c.color])) as Record<
    CourseCategory,
    string
  >;
  const dim = (c: CourseCategory) => (pick === 'all' || pick === c ? 1 : 0.28);
  return (
    <div className="flex flex-col gap-4.5">
      {facts.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-2.5 p-0">
          {facts.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-3 rounded-[18px] border border-border bg-surface-0 p-3.5"
            >
              <span
                className={cn(
                  'flex size-10 flex-none items-center justify-center rounded-[12px]',
                  FACT_STYLE[f.key].cls,
                )}
              >
                <Svg d={FACT_STYLE[f.key].icon} size={20} />
              </span>
              <span className="flex flex-col gap-px">
                <strong className="text-[15px]">{f.value}</strong>
                <span className="text-[13px] text-ink-soft">{f.label}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {categories.length > 1 && (
        <div
          role="group"
          aria-label="Mettre en avant une thématique"
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="mr-1 text-[13px] font-bold text-ink-muted">Thématiques</span>
          {[{ id: 'all' as const, label: 'Tout', color: 'var(--ink)' }, ...categories].map((c) => {
            const on = pick === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPick(c.id)}
                className={cn(
                  'seg-btn inline-flex min-h-9.5 cursor-pointer items-center gap-2 rounded-pill border-[1.5px] px-3 font-sans text-[13px] font-semibold text-ink',
                  on ? 'border-ink bg-surface-100' : 'border-border bg-surface-0',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-[3px]"
                  style={{ background: c.color }}
                />
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {years.map((y) => (
        <section key={y.label} aria-label={y.aria} className="flex gap-4 max-sm:gap-3">
          <div aria-hidden="true" className="flex w-14 flex-none flex-col items-center max-sm:w-11">
            <span className="flex size-14 -rotate-3 items-center justify-center rounded-[18px] bg-night font-display text-[22px] font-extrabold text-lime-400 max-sm:size-11 max-sm:rounded-[14px] max-sm:text-[18px]">
              {y.label}
            </span>
            <span className="mt-2 w-[3px] flex-1 rounded-[3px] bg-border" />
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3 pb-1.5">
            {y.semesters.map((s) => {
              const dark = s.courses.length === 0 && s.milestones.length > 0;
              return (
                <article
                  key={s.id}
                  className={cn(
                    'flex flex-col gap-3 rounded-[22px] border p-4.5',
                    dark ? 'border-night bg-night text-on-night' : 'border-border bg-surface-0',
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                    <span className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          'text-[12px] font-bold tracking-[0.06em] uppercase',
                          dark ? 'text-lime-400' : 'text-ink-muted',
                        )}
                      >
                        {s.number ? `Semestre ${s.number}` : s.label}
                      </span>
                      {s.title && (
                        <h3 className="m-0 font-display text-[20px] font-bold">{s.title}</h3>
                      )}
                    </span>
                    <span
                      className={cn(
                        'rounded-pill px-2.5 py-0.5 text-[12px] font-extrabold',
                        dark ? 'bg-lime-400 text-on-lime' : 'bg-surface-100 text-ink-soft',
                      )}
                    >
                      {s.ects} ECTS
                    </span>
                  </div>
                  {s.courses.length > 0 && (
                    <ul className="m-0 flex list-none flex-col p-0">
                      {s.courses.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center gap-2.5 border-t border-surface-100 py-2 text-[15px] transition-opacity duration-200 motion-reduce:transition-none"
                          style={{ opacity: dim(c.category) }}
                        >
                          <span
                            aria-hidden="true"
                            className="size-2.5 flex-none rounded-[3px]"
                            style={{ background: colorOf[c.category] }}
                          />
                          <span className="min-w-0 flex-1">{c.label}</span>
                          {c.ects !== null && (
                            <span className="flex-none text-[13px] text-ink-muted tabular-nums">
                              {String(c.ects).replace('.', ',')} ECTS
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.milestones.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                      {s.milestones.map((m) => (
                        <li
                          key={m.id}
                          className={cn(
                            'flex items-center gap-3.5 rounded-[16px] px-3.5 py-3 transition-opacity duration-200 motion-reduce:transition-none',
                            dark ? 'bg-white/8' : 'bg-surface-50',
                          )}
                          style={{ opacity: dim(milestoneCategory[m.id] ?? 'PROJECTS') }}
                        >
                          <span className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-lime-400 text-on-lime">
                            <Svg d={MILESTONE_ICON[m.kind]} size={22} />
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <strong className="text-[16px]">{m.title}</strong>
                            {m.detail && (
                              <span
                                className={cn(
                                  'text-[14px]',
                                  dark ? 'text-on-night-muted' : 'text-ink-soft',
                                )}
                              >
                                {m.detail}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {footer}
    </div>
  );
}
