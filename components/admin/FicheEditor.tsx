'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { cn } from '@/lib/cn';
import type { FicheEditData } from '@/lib/admin/fiche-edit';
import type { EditConflict, FicheEditExtras, SectionId } from '@/lib/admin/fiche-edit-extras';
import { saveFiche, saveProgramme } from '@/app/admin/(panel)/fiches/[id]/actions';
import { applyRule, resolveConflict } from '@/app/admin/(panel)/recuperation/actions';
import { DEFAULT_SEMESTERS, ProgrammeEditor, type Sem } from './ProgrammeEditor';
import { KIND_TAG, Tag, TD, TH } from './ui';

const DOT = {
  OK: 'bg-success',
  STALE: 'bg-[#c99a00]',
  CONFLICT: 'bg-[#c99a00]',
  MISSING: 'bg-border-control',
  ERROR: 'bg-danger',
} as const;
const PROBLEM_TONE = {
  Conflit: 'bg-warning-bg text-warning',
  Ancien: 'bg-warning-bg text-warning',
  Manquant: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted',
  Erreur: 'bg-danger-bg text-danger',
} as const;
const STATE = {
  ok: { label: 'À jour', cls: 'bg-success-bg text-success' },
  conflict: { label: 'Conflit', cls: 'bg-warning-bg text-warning' },
  old: { label: 'Ancien', cls: 'bg-warning-bg text-warning' },
  missing: { label: 'Manquant', cls: 'bg-surface-100 text-[#3b3648] dark:text-ink-muted' },
  manual: { label: 'Saisi à la main', cls: 'bg-violet-100 text-violet-700' },
} as const;
const INPUT =
  'box-border w-full min-h-10.5 rounded-[12px] border-[1.5px] border-border-control bg-surface-0 px-3 text-[14px] text-ink';
const BTN =
  'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-pill border-[1.5px] px-4 text-[13px] font-bold whitespace-nowrap no-underline disabled:cursor-not-allowed disabled:opacity-40';
const CARD = 'flex scroll-mt-4 flex-col gap-4 rounded-[18px] border border-border bg-surface-0 p-5';
const H2 = 'm-0 font-display text-[20px] font-extrabold';

/** A conflict inside the section of its field: two cards to choose from, applied to the group. */
function ConflictBox({ c, onDone }: { c: EditConflict; onDone: () => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [applyAll, setApplyAll] = useState(!!c.group);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = (c.group?.others ?? 0) + 1;
  const picked = c.options.find((o) => o.id === choice);
  return (
    <div
      id={`conflit-${c.field}`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-2xl border-2 border-[#f2c230] p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag className="bg-warning-bg text-warning">Conflit</Tag>
        <strong>{c.label} : deux sources ne sont pas d’accord</strong>
      </div>
      <div
        role="radiogroup"
        aria-label={`Valeur à retenir pour ${c.label}`}
        className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5"
      >
        {c.options.map((o) => {
          const on = choice === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!!done}
              onClick={() => setChoice(o.id)}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-[14px] border-2 px-3.5 py-3 text-left text-ink',
                on ? 'border-ink bg-[#fbfaff] dark:bg-surface-50' : 'border-border bg-surface-0',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 size-4.5 flex-none rounded-[6px] border-2 border-ink',
                  on ? 'bg-violet-500' : 'bg-surface-0',
                )}
              />
              <span className="flex flex-col gap-1">
                <span className="text-[14px] font-bold">{o.value}</span>
                <span className="text-[12px] text-ink-muted">{o.source}</span>
              </span>
            </button>
          );
        })}
      </div>
      {c.group && (
        <label className="flex items-start gap-2 text-[13px] leading-[1.45]">
          <input
            type="checkbox"
            checked={applyAll}
            disabled={!!done}
            onChange={() => setApplyAll((x) => !x)}
            className="mt-px size-4.5 accent-violet-500"
          />
          Appliquer ce choix aux {c.group.others} autre{c.group.others > 1 ? 's' : ''} fiche
          {c.group.others > 1 ? 's' : ''} de {c.group.universityName} où ces deux sources divergent
          sur ce champ
        </label>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!picked || !!done || pending}
        className={cn(BTN, 'self-start border-transparent bg-night text-on-night')}
        onClick={() =>
          start(async () => {
            setError(null);
            const r =
              applyAll && c.group
                ? await applyRule(c.group.key, picked!.family)
                : await resolveConflict(c.id, picked!.id);
            if (!r.ok) setError(('error' in r ? r.error : null) ?? 'Erreur.');
            else {
              setDone(
                applyAll && c.group && 'rule' in r
                  ? `Règle créée : ${r.rule} (${n} fiches)`
                  : 'Choix enregistré · champ verrouillé',
              );
              onDone();
            }
          })
        }
      >
        {done
          ? 'Choix enregistré'
          : pending
            ? 'Enregistrement…'
            : applyAll && c.group
              ? `Retenir pour ces ${n} fiches`
              : 'Retenir pour cette fiche'}
      </button>
      {done && (
        <p role="status" className="m-0 text-[13px] font-semibold text-success">
          {done}
        </p>
      )}
    </div>
  );
}

export function FicheEditor({ data, extras }: { data: FicheEditData; extras: FicheEditExtras }) {
  const router = useRouter();
  const fields = data.sections.flatMap((s) => s.fields);
  const initialValues = Object.fromEntries(fields.map((f) => [f.key, f.value]));
  const initialLocks = Object.fromEntries(fields.map((f) => [f.key, f.locked]));
  const initialSems: Sem[] = data.programme?.semesters ?? [];
  const [values, setValues] = useState(initialValues);
  const [locks, setLocks] = useState(initialLocks);
  const [published, setPublished] = useState(data.isPublished);
  const [sems, setSems] = useState<Sem[]>(initialSems);
  const [status, setStatus] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState<SectionId>('id');
  // Fresh data from the server (after a save): the form starts again from it, the message stays.
  const sig = JSON.stringify(data);
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) {
    setSeen(sig);
    setValues(initialValues);
    setLocks(initialLocks);
    setPublished(data.isPublished);
    setSems(initialSems);
  }

  const fieldsDirty =
    JSON.stringify(values) !== JSON.stringify(initialValues) ||
    JSON.stringify(locks) !== JSON.stringify(initialLocks) ||
    published !== data.isPublished;
  const progDirty = JSON.stringify(sems) !== JSON.stringify(initialSems);
  const dirty = fieldsDirty || progDirty;
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Leaving with unsaved changes asks first: closing the tab, and links inside the app.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (
        !dirtyRef.current ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey
      )
        return;
      const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.getAttribute('href')!.startsWith('#')) return;
      if (!window.confirm('Des modifications ne sont pas enregistrées. Quitter quand même ?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', click, true);
    };
  }, []);

  const setValue = (key: string, v: string) => {
    setValues((x) => ({ ...x, [key]: v }));
    setLocks((x) => ({ ...x, [key]: true })); // editing a field locks it
    setStatus(null);
  };
  const reset = () => {
    setValues(initialValues);
    setLocks(initialLocks);
    setPublished(data.isPublished);
    setSems(initialSems);
    setStatus(null);
  };
  const save = () =>
    start(async () => {
      if (fieldsDirty) {
        const r = await saveFiche(data.id, { values, locks, published });
        if (!('ok' in r) || !r.ok) {
          setStatus({ tone: 'err', text: ('error' in r ? r.error : null) ?? 'Erreur.' });
          return;
        }
      }
      if (progDirty) {
        const r = await saveProgramme(data.id, {
          semesters: sems.filter((s) => s.courses.length || s.milestones.length || s.title),
        });
        if (!('ok' in r) || !r.ok) {
          setStatus({ tone: 'err', text: ('error' in r ? r.error : null) ?? 'Erreur.' });
          return;
        }
      }
      dirtyRef.current = false;
      setStatus({ tone: 'ok', text: 'Enregistré · ajouté au journal d’audit' });
      router.refresh();
    });

  const sections: { id: SectionId; label: string; href: string }[] = [
    { id: 'id', label: 'Identité', href: '#s-id' },
    ...(data.sections.some((s) => s.id === 'adm')
      ? [{ id: 'adm' as const, label: 'Admission', href: '#s-adm' }]
      : []),
    ...(data.programme ? [{ id: 'prog' as const, label: 'Programme', href: '#s-prog' }] : []),
    { id: 'src', label: 'Provenance', href: '#s-src' },
  ];

  // Highlight the section being read in the sommaire.
  useEffect(() => {
    const els = ['s-id', 's-adm', 's-prog', 's-src']
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id.slice(2) as SectionId);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const renderFields = (id: 'id' | 'adm') =>
    data.sections
      .filter((s) => s.id === id)
      .map((s, si) => (
        <div key={s.title} className="flex flex-col gap-3">
          {si > 0 && (
            <h3 className="m-0 text-[13px] font-bold tracking-[0.04em] text-ink-muted uppercase">
              {s.title.replace(/^Admission · /, '')}
            </h3>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-x-5 gap-y-4">
            {s.fields.map((f) => {
              const locked = locks[f.key];
              const fid = `f-${f.key.replace(/[^a-z0-9]/gi, '-')}`;
              return (
                <div
                  key={f.key}
                  className={cn('flex scroll-mt-4 flex-col gap-1.5', f.wide && 'col-span-full')}
                  id={f.key === 'admissionCriteria' ? 'f-admissionCriteria' : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={fid} className="text-[13px] font-semibold">
                      {f.key === 'admissionCriteria' ? 'Attendus et critères d’examen' : f.label}
                    </label>
                    {!f.readOnly && (
                      <button
                        type="button"
                        aria-pressed={locked}
                        onClick={() => setLocks((x) => ({ ...x, [f.key]: !locked }))}
                        className={cn(
                          'min-h-6.5 cursor-pointer rounded-pill border-[1.5px] px-2.25 text-[11px] font-bold',
                          locked
                            ? 'border-violet-700 bg-violet-100 text-violet-700'
                            : 'border-[#d7d3e0] bg-surface-0 text-ink-muted dark:border-border-control',
                        )}
                      >
                        {locked ? 'Verrouillé' : 'Auto'}
                        <span className="sr-only"> : {f.label}</span>
                      </button>
                    )}
                  </div>
                  {f.type === 'area' ? (
                    <textarea
                      id={fid}
                      value={values[f.key]}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      readOnly={!!f.readOnly}
                      placeholder={
                        f.key === 'admissionCriteria'
                          ? 'À saisir : Mon Master ne permet pas la collecte automatique de ce champ.'
                          : undefined
                      }
                      className={cn(INPUT, 'min-h-20 resize-y py-2.5 leading-normal')}
                    />
                  ) : f.type === 'select' ? (
                    <select
                      id={fid}
                      value={values[f.key]}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      disabled={!!f.readOnly}
                      className={INPUT}
                    >
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={fid}
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={values[f.key]}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      readOnly={!!f.readOnly}
                      className={INPUT}
                    />
                  )}
                  <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-1.75 flex-none rounded-pill',
                        locked ? 'bg-violet-500' : DOT[f.state],
                      )}
                    />
                    {f.readOnly ?? (locked ? 'Verrouillé · saisi à la main' : f.source)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ));

  const conflictsOf = (id: SectionId) =>
    extras.conflicts
      .filter((c) => c.section === id)
      .map((c) => <ConflictBox key={c.id} c={c} onDone={() => router.refresh()} />);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="flex flex-wrap gap-1.5">
            <Tag upper className={KIND_TAG[data.type].cls}>
              {KIND_TAG[data.type].label}
            </Tag>
            {extras.sub && (
              <Tag className="bg-surface-50 text-[#3b3648] dark:bg-surface-100 dark:text-ink-muted">
                {extras.sub}
              </Tag>
            )}
          </span>
          <h1 className="m-0 font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em]">
            {data.name}
          </h1>
          <span className="font-mono text-[12px] text-ink-muted">{data.ident}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Publication"
            className="inline-flex rounded-pill border border-border bg-surface-0 p-1"
          >
            {(
              [
                [true, 'Publiée'],
                [false, 'Brouillon'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={published === v}
                onClick={() => setPublished(v)}
                className={cn(
                  'min-h-8.5 cursor-pointer rounded-pill border-0 px-3.5 text-[13px] font-semibold',
                  published === v ? 'bg-night text-on-night' : 'bg-transparent text-ink',
                )}
              >
                {l}
              </button>
            ))}
          </div>
          {extras.publicHref && (
            <Link
              href={extras.publicHref}
              target="_blank"
              className={cn(
                BTN,
                'border-[#d7d3e0] bg-surface-0 text-ink dark:border-border-control',
              )}
            >
              Voir sur le site ↗
            </Link>
          )}
        </div>
      </div>

      {extras.problems.length > 0 && (
        <section
          aria-labelledby="pb-t"
          className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-[#f2dfa0] bg-warning-bg px-4 py-3 dark:border-transparent"
        >
          <strong id="pb-t" className="text-[14px]">
            {extras.problems.length} point{extras.problems.length > 1 ? 's' : ''} à régler
          </strong>
          {extras.problems.map((p) => (
            <a
              key={p.href + p.label}
              href={p.href}
              className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink no-underline"
            >
              <Tag className={PROBLEM_TONE[p.tag]}>{p.tag}</Tag>
              <span className="underline group-hover:no-underline">{p.label} →</span>
            </a>
          ))}
        </section>
      )}

      <div className="flex items-start gap-5.5 max-lg:flex-col">
        <nav
          aria-label="Sections"
          className="flex flex-[0_0_190px] flex-col gap-0.5 lg:sticky lg:top-4 max-lg:w-full"
        >
          {sections.map((s) => {
            const n = extras.problems.filter((p) => p.section === s.id).length;
            const on = current === s.id;
            return (
              <a
                key={s.id}
                href={s.href}
                onClick={() => setCurrent(s.id)}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'flex min-h-9.5 items-center gap-2 rounded-[10px] px-3 text-ink no-underline',
                  on ? 'bg-surface-0 font-bold' : 'font-medium',
                )}
              >
                <span className="flex-1">{s.label}</span>
                {n > 0 && (
                  <Tag className="bg-warning-bg text-warning">
                    {n}
                    <span className="sr-only"> point{n > 1 ? 's' : ''} à régler</span>
                  </Tag>
                )}
              </a>
            );
          })}
          <p className="m-0 mt-3 px-3 text-[12px] leading-[1.45] text-ink-muted">
            Un champ modifié est verrouillé : la synchro ne l’écrase plus.
          </p>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4 max-lg:w-full">
          <section id="s-id" aria-labelledby="s-id-t" className={CARD}>
            <h2 id="s-id-t" className={H2}>
              Identité
            </h2>
            {renderFields('id')}
            {conflictsOf('id')}
          </section>

          {data.sections.some((s) => s.id === 'adm') && (
            <section id="s-adm" aria-labelledby="s-adm-t" className={cn(CARD, 'gap-3.5')}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="s-adm-t" className={H2}>
                  Admission
                </h2>
                {extras.admissionSource && (
                  <span className="text-[12px] text-ink-muted">{extras.admissionSource}</span>
                )}
              </div>
              {extras.admission && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
                  {extras.admission.map((a) => (
                    <div
                      key={a.label}
                      className="flex flex-col gap-0.5 rounded-[12px] bg-surface-50 p-3 dark:bg-surface-100"
                    >
                      <span className="text-[12px] text-ink-muted">{a.label}</span>
                      <span className="text-[16px] font-bold tabular-nums">{a.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {conflictsOf('adm')}
              {renderFields('adm')}
            </section>
          )}

          {data.programme && (
            <section id="s-prog" aria-labelledby="s-prog-t" className={cn(CARD, 'gap-3')}>
              <ProgrammeEditor
                programId={data.id}
                mentionName={data.programme.mentionName}
                semesters={sems}
                onChange={(s) => {
                  setSems(s);
                  setStatus(null);
                }}
                source={
                  data.programme.locked ? 'saisi à la main (verrouillé)' : data.programme.source
                }
                old={extras.oldProgramme}
              />
              {!sems.length && (
                <button
                  type="button"
                  className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-violet-700"
                  onClick={() =>
                    setSems(
                      DEFAULT_SEMESTERS.map((label) => ({
                        label,
                        title: '',
                        ects: 30,
                        courses: [],
                        milestones: [],
                      })),
                    )
                  }
                >
                  Partir des 4 semestres habituels
                </button>
              )}
            </section>
          )}

          <section id="s-src" aria-labelledby="s-src-t" className={cn(CARD, 'gap-2.5')}>
            <h2 id="s-src-t" className={H2}>
              Provenance
            </h2>
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <caption className="sr-only">Source, date et état de chaque champ</caption>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      Champ
                    </th>
                    <th scope="col" className={TH}>
                      Source
                    </th>
                    <th scope="col" className={TH}>
                      Date
                    </th>
                    <th scope="col" className={TH}>
                      État
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {extras.provenance.map((p, i) => (
                    <tr key={`${p.field}-${i}`}>
                      <th scope="row" className={cn(TD, 'text-left font-semibold')}>
                        {p.field}
                      </th>
                      <td className={TD}>{p.source}</td>
                      <td className={cn(TD, 'whitespace-nowrap text-ink-muted')}>{p.date}</td>
                      <td className={TD}>
                        <Tag className={STATE[p.state].cls}>{STATE[p.state].label}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* Fixed save bar (the page keeps 110 px free at the bottom). */}
      <div className="h-16" aria-hidden="true" />
      <div className="fixed right-0 bottom-0 left-0 z-20 box-border flex flex-wrap items-center justify-end gap-2.5 border-t border-border bg-surface-0/95 px-7 py-3 backdrop-blur-sm lg:left-59">
        <span
          role="status"
          className={cn(
            'mr-auto text-[14px] font-semibold',
            status?.tone === 'err'
              ? 'text-danger'
              : status?.tone === 'ok' && !dirty
                ? 'text-success'
                : dirty
                  ? 'text-warning'
                  : 'text-ink-muted',
          )}
        >
          {status && (status.tone === 'err' || !dirty)
            ? status.text
            : dirty
              ? 'Modifications non enregistrées'
              : 'Aucune modification'}
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={!dirty || pending}
          className={cn(BTN, 'border-[#d7d3e0] bg-surface-0 text-ink dark:border-border-control')}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className={cn(BTN, 'border-transparent bg-violet-500 text-on-violet')}
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </>
  );
}
