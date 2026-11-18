'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/cn';
import type { ProgrammeEdit } from '@/lib/admin/fiche-edit';
import { CATEGORY_BY_ID, classifyCourse, COURSE_CATEGORIES } from '@/lib/domain/course-categories';
import type { CourseCategory, MilestoneKind } from '@/lib/db/generated/enums';
import { importBooklet } from '@/app/admin/(panel)/fiches/[id]/actions';

export type Sem = ProgrammeEdit['semesters'][number];

const KINDS: { id: MilestoneKind; label: string }[] = [
  { id: 'INTERNSHIP', label: 'Stage' },
  { id: 'THESIS', label: 'Mémoire' },
  { id: 'PROJECT', label: 'Projet' },
  { id: 'STUDY_TRIP', label: 'Voyage d’étude' },
  { id: 'CERTIFICATION', label: 'Certification' },
];
export const DEFAULT_SEMESTERS = [
  'M1 · Semestre 1',
  'M1 · Semestre 2',
  'M2 · Semestre 3',
  'M2 · Semestre 4',
];

const INPUT =
  'min-h-9 w-full min-w-0 rounded-[12px] border-[1.5px] border-border-control bg-surface-0 px-3 text-[14px] text-ink box-border';
const LINK = 'cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-violet-700';
const GHOST =
  'inline-flex min-h-8.5 cursor-pointer items-center rounded-pill border-[1.5px] border-[#d7d3e0] bg-surface-0 px-3.5 text-[13px] font-bold text-ink hover:border-ink dark:border-border-control';
const GRID =
  'grid grid-cols-[1fr_200px_70px_34px] items-center gap-2 max-sm:grid-cols-[1fr_70px_34px]';

/**
 * Programme of a parcours (AdminFicheEdit mockup): one accordion per semester (« M1 · Semestre 1 —
 * Les bases du patrimoine · 6 éléments · 23 ECTS ») with a line per course or milestone (title,
 * theme with its colour, ECTS, remove). Controlled: the page saves it with the rest of the fiche.
 * A theme chosen by hand is locked (the keyword table no longer changes it).
 */
export function ProgrammeEditor({
  programId,
  mentionName,
  semesters,
  onChange,
  source,
  old,
}: {
  programId: string;
  mentionName: string;
  semesters: Sem[];
  onChange: (s: Sem[]) => void;
  source: string;
  old: string | null;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const [importing, setImporting] = useState(false);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const edit = (i: number, f: (s: Sem) => Sem) =>
    onChange(semesters.map((s, k) => (k === i ? f(s) : s)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="s-prog-t" className="m-0 font-display text-[20px] font-extrabold">
          Programme
        </h2>
        <span className="flex gap-1.5">
          <button
            type="button"
            className={GHOST}
            aria-expanded={importing}
            onClick={() => setImporting((x) => !x)}
          >
            Importer un livret (URL ou PDF)
          </button>
          <button
            type="button"
            className={GHOST}
            onClick={() => {
              const n = semesters.length;
              onChange([
                ...semesters,
                {
                  label: DEFAULT_SEMESTERS[n] ?? `Semestre ${n + 1}`,
                  title: '',
                  ects: 30,
                  courses: [],
                  milestones: [],
                },
              ]);
              setOpen((o) => ({ ...o, [n]: true }));
            }}
          >
            + Semestre
          </button>
        </span>
      </div>
      {importing && (
        <form
          className="expand flex flex-wrap items-end gap-2 rounded-[14px] bg-surface-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await importBooklet(programId, url);
              if (!r.ok || !('semesters' in r) || !r.semesters) {
                setMsg({
                  tone: 'err',
                  text: ('error' in r ? r.error : null) ?? 'Import impossible.',
                });
                return;
              }
              onChange(r.semesters);
              setOpen({ 0: true });
              setMsg({
                tone: 'ok',
                text: `${r.semesters.length} semestres lus sur ${r.source} : vérifie-les, puis enregistre.`,
              });
              setImporting(false);
            });
          }}
        >
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-[13px] font-semibold">
            Adresse de la page ou du livret
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className={INPUT}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className={cn(GHOST, 'border-night bg-night text-on-night')}
          >
            {pending ? 'Lecture…' : 'Lire le programme'}
          </button>
          <span className="w-full text-[12px] text-ink-muted">
            La page est lue comme par la collecte (robots.txt respecté). Rien n’est enregistré avant
            « Enregistrer ».
          </span>
        </form>
      )}
      {msg && (
        <p
          role="status"
          className={cn(
            'm-0 rounded-[12px] px-3 py-2.5 text-[13px]',
            msg.tone === 'ok' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger',
          )}
        >
          {msg.text}
        </p>
      )}
      {old && (
        <p className="m-0 rounded-[12px] bg-warning-bg px-3 py-2.5 text-[13px] text-[#3b3648] dark:text-ink">
          <strong>Programme ancien</strong> · source : {old}. Le site affiche « le programme a pu
          évoluer » tant qu’aucune version récente n’est trouvée.
        </p>
      )}
      {!semesters.length && (
        <p className="m-0 rounded-[12px] bg-surface-50 px-3 py-2.5 text-[13px] text-ink-muted">
          Aucun programme trouvé sur le site de l’université. Importe un livret ou ajoute un
          semestre.
        </p>
      )}
      {semesters.length > 0 && <p className="m-0 text-[12px] text-ink-muted">Source : {source}</p>}
      {semesters.map((s, i) => {
        const isOpen = !!open[i];
        const ects = s.courses.reduce((a, c) => a + (c.ects ?? 0), 0);
        const n = s.courses.length + s.milestones.length;
        return (
          <div key={i} className="overflow-hidden rounded-[14px] border border-border">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
              className={cn(
                'flex min-h-12 w-full cursor-pointer items-center gap-2.5 border-0 px-3.5 text-left text-ink',
                isOpen ? 'bg-[#fbfafd] dark:bg-surface-50' : 'bg-surface-0',
              )}
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  'transition-transform motion-reduce:transition-none',
                  isOpen && 'rotate-90',
                )}
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span className="font-bold">{s.label}</span>
              {s.title && <span className="text-ink-muted">{s.title}</span>}
              <span className="ml-auto text-[12px] text-ink-muted">
                {n} élément{n > 1 ? 's' : ''} · {ects} ECTS
              </span>
            </button>
            {isOpen && (
              <div className="expand flex flex-col px-3.5 pt-1.5 pb-3.5">
                <div className="mb-1 grid grid-cols-[1fr_1fr_90px] gap-2 max-sm:grid-cols-1">
                  <label className="flex flex-col gap-1 text-[12px] font-semibold">
                    Intitulé du semestre
                    <input
                      className={INPUT}
                      value={s.label}
                      onChange={(e) => edit(i, (x) => ({ ...x, label: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] font-semibold">
                    Titre
                    <input
                      className={INPUT}
                      value={s.title}
                      placeholder="Les bases du patrimoine"
                      onChange={(e) => edit(i, (x) => ({ ...x, title: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] font-semibold">
                    ECTS
                    <input
                      type="number"
                      min={0}
                      max={60}
                      className={INPUT}
                      value={s.ects}
                      onChange={(e) =>
                        edit(i, (x) => ({ ...x, ects: Number(e.target.value) || 0 }))
                      }
                    />
                  </label>
                </div>
                <div
                  className={cn(
                    GRID,
                    'py-1.5 text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase',
                  )}
                  aria-hidden="true"
                >
                  <span>Cours ou jalon</span>
                  <span className="max-sm:hidden">Thématique</span>
                  <span>ECTS</span>
                  <span />
                </div>
                {s.courses.map((c, k) => (
                  <div key={`c${k}`} className={cn(GRID, 'py-1')}>
                    <input
                      aria-label={`Intitulé du cours ${k + 1}, ${s.label}`}
                      className={INPUT}
                      value={c.label}
                      onChange={(e) =>
                        edit(i, (x) => ({
                          ...x,
                          courses: x.courses.map((y, j) =>
                            j === k
                              ? {
                                  ...y,
                                  label: e.target.value,
                                  category: y.categoryLocked
                                    ? y.category
                                    : classifyCourse(e.target.value, { mentionName }),
                                }
                              : y,
                          ),
                        }))
                      }
                    />
                    <span className="flex items-center gap-1.5 max-sm:hidden">
                      <span
                        aria-hidden="true"
                        className="size-2.5 flex-none rounded-[3px]"
                        style={{ background: CATEGORY_BY_ID[c.category].color }}
                      />
                      <select
                        aria-label={`Thématique de ${c.label || `cours ${k + 1}`}${c.categoryLocked ? ' (choisie à la main)' : ''}`}
                        className="min-h-9.5 min-w-0 flex-1 rounded-[10px] border-[1.5px] border-[#d7d3e0] bg-surface-0 px-2 text-[13px] font-semibold text-ink dark:border-border-control"
                        value={c.category}
                        onChange={(e) =>
                          edit(i, (x) => ({
                            ...x,
                            courses: x.courses.map((y, j) =>
                              j === k
                                ? {
                                    ...y,
                                    category: e.target.value as CourseCategory,
                                    categoryLocked: true,
                                  }
                                : y,
                            ),
                          }))
                        }
                      >
                        {COURSE_CATEGORIES.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </span>
                    <input
                      aria-label={`ECTS de ${c.label || `cours ${k + 1}`}`}
                      type="number"
                      min={0}
                      max={60}
                      step={0.5}
                      className={INPUT}
                      value={c.ects ?? ''}
                      onChange={(e) =>
                        edit(i, (x) => ({
                          ...x,
                          courses: x.courses.map((y, j) =>
                            j === k
                              ? {
                                  ...y,
                                  ects: e.target.value === '' ? null : Number(e.target.value),
                                }
                              : y,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Supprimer ${c.label || `le cours ${k + 1}`}`}
                      onClick={() =>
                        edit(i, (x) => ({ ...x, courses: x.courses.filter((_, j) => j !== k) }))
                      }
                      className="size-8.5 cursor-pointer rounded-[10px] border-0 bg-surface-50 text-ink dark:bg-surface-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {s.milestones.map((m, k) => (
                  <div key={`m${k}`} className={cn(GRID, 'py-1')}>
                    <input
                      aria-label={`Titre du jalon ${k + 1}, ${s.label}`}
                      placeholder="Stage de 3 à 6 mois"
                      className={INPUT}
                      value={m.title}
                      onChange={(e) =>
                        edit(i, (x) => ({
                          ...x,
                          milestones: x.milestones.map((y, j) =>
                            j === k ? { ...y, title: e.target.value } : y,
                          ),
                        }))
                      }
                    />
                    <span className="flex items-center gap-1.5 max-sm:hidden">
                      <span
                        aria-hidden="true"
                        className="size-2.5 flex-none rounded-[3px]"
                        style={{ background: CATEGORY_BY_ID.PROJECTS.color }}
                      />
                      <select
                        aria-label={`Type du jalon ${m.title || k + 1}`}
                        className="min-h-9.5 min-w-0 flex-1 rounded-[10px] border-[1.5px] border-[#d7d3e0] bg-surface-0 px-2 text-[13px] font-semibold text-ink dark:border-border-control"
                        value={m.kind}
                        onChange={(e) =>
                          edit(i, (x) => ({
                            ...x,
                            milestones: x.milestones.map((y, j) =>
                              j === k ? { ...y, kind: e.target.value as MilestoneKind } : y,
                            ),
                          }))
                        }
                      >
                        {KINDS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span className="text-center text-[12px] text-ink-muted">—</span>
                    <button
                      type="button"
                      aria-label={`Supprimer ${m.title || `le jalon ${k + 1}`}`}
                      onClick={() =>
                        edit(i, (x) => ({
                          ...x,
                          milestones: x.milestones.filter((_, j) => j !== k),
                        }))
                      }
                      className="size-8.5 cursor-pointer rounded-[10px] border-0 bg-surface-50 text-ink dark:bg-surface-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <span className="mt-1.5 flex gap-3">
                  <button
                    type="button"
                    className={LINK}
                    onClick={() =>
                      edit(i, (x) => ({
                        ...x,
                        courses: [
                          ...x.courses,
                          { label: '', ects: null, category: 'CORE', categoryLocked: false },
                        ],
                      }))
                    }
                  >
                    + Cours
                  </button>
                  <button
                    type="button"
                    className={LINK}
                    onClick={() =>
                      edit(i, (x) => ({
                        ...x,
                        milestones: [
                          ...x.milestones,
                          { kind: 'INTERNSHIP', title: '', detail: '' },
                        ],
                      }))
                    }
                  >
                    + Stage, mémoire ou projet
                  </button>
                  <button
                    type="button"
                    className={cn(LINK, 'ml-auto text-danger')}
                    onClick={() => {
                      onChange(semesters.filter((_, j) => j !== i));
                      setOpen({});
                    }}
                  >
                    Retirer le semestre
                  </button>
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
