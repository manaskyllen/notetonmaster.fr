'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Switch } from '@/components/ui/Switch';
import {
  applyRule,
  configureProfile,
  loadGroupItems,
  loadRunLines,
  loadRuns,
  pauseCollect,
  retryCollect,
} from '@/app/admin/(panel)/recuperation/actions';
import { resolveAlert } from '@/app/admin/(panel)/actions';
import type { ConflictGroup, ConflictItem } from '@/lib/admin/conflict-groups';
import type { CollectError, NoProfile, RunRow } from '@/lib/admin/recuperation';
import { cn } from '@/lib/cn';
import { useListUrl } from './useListUrl';
import { cancelUrlUpdate } from '@/lib/url-update';

const BTN =
  'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-pill border-[1.5px] px-4 text-[13px] font-bold whitespace-nowrap no-underline disabled:cursor-not-allowed disabled:opacity-40';
const GHOST = `${BTN} border-[#d7d3e0] bg-surface-0 text-ink hover:border-ink dark:border-border-control`;
const DARK = `${BTN} border-transparent bg-night text-on-night`;
const LINK = 'cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-violet-700';

/** Tabs kept in the URL (`onglet=`): role="tab", arrows move between them. */
export function UrlTabs({
  tabs,
  current,
}: {
  tabs: { key: string; label: string; count?: number }[];
  current: string;
}) {
  const router = useRouter();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (k: string) => {
    // A search typed in the previous tab and still waiting must not bring that tab back.
    cancelUrlUpdate();
    router.replace(k === tabs[0]!.key ? '/admin/recuperation' : `/admin/recuperation?onglet=${k}`, {
      scroll: false,
    });
  };
  return (
    <div
      role="tablist"
      aria-label="Récupération"
      className="flex flex-wrap gap-1 self-start rounded-pill border border-border bg-surface-0 p-1"
    >
      {tabs.map((t, i) => {
        const on = t.key === current;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={on}
            aria-controls="tab-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => go(t.key)}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const n = (i + d + tabs.length) % tabs.length;
              refs.current[n]?.focus();
              go(tabs[n]!.key);
            }}
            className={cn(
              'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-pill border-0 px-3.5 text-[14px] font-semibold',
              on ? 'bg-night text-on-night' : 'bg-transparent text-ink',
            )}
          >
            {t.label}
            {!!t.count && (
              <span
                className={cn(
                  'rounded-pill px-2 py-0.5 text-[11px] font-bold text-ink',
                  on ? 'bg-lime-400' : 'bg-[#ff8a73]',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CollectErrorCard({ e, canRun }: { e: CollectError; canRun: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'run' | 'done' | 'paused'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  if (state === 'paused') return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[14px] border border-[#ffd9cf] bg-[#fff7f5] px-3.5 py-3 dark:border-transparent dark:bg-danger-bg">
      <span className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.75">
        <strong>{e.name}</strong>
        <span className="font-mono text-[12px] break-words text-danger">{e.message}</span>
        <span className="text-[12px] text-ink-muted">{e.meta}</span>
        {error && (
          <span role="alert" className="text-[12px] font-semibold text-danger">
            {error}
          </span>
        )}
        {state === 'done' && (
          <span role="status" className="text-[12px] font-semibold text-success">
            Relance en file : le résultat arrive dans le journal.
          </span>
        )}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {canRun && (
          <button
            type="button"
            className={DARK}
            disabled={state !== 'idle'}
            onClick={() => {
              setState('run');
              start(async () => {
                const r = await retryCollect(e.issueId);
                if (!r.ok) {
                  setError(('error' in r ? r.error : null) ?? 'Erreur.');
                  setState('idle');
                } else setState('done');
              });
            }}
          >
            {state === 'run' ? 'Relance…' : state === 'done' ? 'Relancée' : 'Relancer'}
          </button>
        )}
        <Link href={`/admin/recuperation?onglet=journal&source=${e.sourceKey}`} className={GHOST}>
          Journal
        </Link>
        {canRun && (
          <button
            type="button"
            className={GHOST}
            onClick={() =>
              start(async () => {
                const r = await pauseCollect(e.issueId);
                if (!r.ok) setError(('error' in r ? r.error : null) ?? 'Erreur.');
                else {
                  setState('paused');
                  router.refresh();
                }
              })
            }
          >
            Pause 7 jours
          </button>
        )}
      </span>
    </div>
  );
}

export function ConflictGroupCard({ g, canEdit }: { g: ConflictGroup; canEdit: boolean }) {
  const router = useRouter();
  const [rule, setRule] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ConflictItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = () => {
    setOpen((o) => !o);
    if (!items)
      start(async () => {
        const r = await loadGroupItems(g.key);
        if (r.ok && 'items' in r) setItems(r.items);
      });
  };
  return (
    <div className="overflow-hidden rounded-[14px] border border-border" data-group={g.key}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-2.5 px-3.5 py-3',
          rule ? 'bg-success-subtle' : 'bg-surface-0',
        )}
      >
        <span className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.75">
          <span>
            <strong>{g.fieldLabel}</strong> · {g.sources[0].label} ≠ {g.sources[1].label}
          </span>
          <span className="text-[12px] text-ink-muted">
            {g.count} fiches · {g.universityName} · ex. {g.example.title} ({g.example.a} /{' '}
            {g.example.b})
          </span>
          {error && (
            <span role="alert" className="text-[12px] font-semibold text-danger">
              {error}
            </span>
          )}
        </span>
        {rule ? (
          <span
            role="status"
            className="rounded-pill bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success"
          >
            Règle créée : {rule}
          </span>
        ) : (
          canEdit && (
            <span className="flex flex-wrap gap-1.5">
              {g.sources.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={GHOST}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await applyRule(g.key, s.key);
                      if (!r.ok || !('rule' in r))
                        setError(('error' in r ? r.error : null) ?? 'Erreur.');
                      else {
                        setRule(r.rule);
                        router.refresh();
                      }
                    })
                  }
                >
                  Toujours : {s.label}
                </button>
              ))}
            </span>
          )
        )}
        <button type="button" aria-expanded={open} onClick={toggle} className={LINK}>
          {open ? 'Masquer' : `Voir les ${g.count} fiches`}
        </button>
      </div>
      {open && (
        <ul className="expand m-0 list-none px-3.5 pt-1 pb-2.5">
          {!items && <li className="py-2 text-[13px] text-ink-muted">Chargement…</li>}
          {items?.map((i) => (
            <li
              key={i.conflictId}
              className="flex flex-wrap gap-x-3 gap-y-1 border-b border-surface-100 py-1.75 text-[13px]"
            >
              <Link
                href={`/admin/fiches/${i.programId}#conflit-${g.field}`}
                className="flex-[1_1_240px] font-semibold text-ink"
              >
                {i.title}
              </Link>
              <span className="text-ink-muted">{i.a}</span>
              <span className="text-ink-muted" aria-label="différent de">
                ≠
              </span>
              <span className="text-ink-muted">{i.b}</span>
            </li>
          ))}
          {items && !items.length && (
            <li className="py-2 text-[13px] text-success">Tout le groupe est réglé.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function NoProfileRow({
  p,
  canEdit,
  templates,
}: {
  p: NoProfile;
  canEdit: boolean;
  templates: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col border-b border-surface-100 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-0 flex-[1_1_260px] flex-col">
          <strong>{p.name}</strong>
          <span className="text-[12px] text-ink-muted">{p.detail}</span>
        </span>
        {canEdit && (
          <button
            type="button"
            className={GHOST}
            aria-expanded={open}
            onClick={() => setOpen((x) => !x)}
          >
            Configurer un profil
          </button>
        )}
      </div>
      {open && (
        <form
          className="expand mt-2 flex flex-wrap items-end gap-2 rounded-[12px] bg-surface-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await configureProfile(
                p.id,
                String(fd.get('template')),
                String(fd.get('url')),
              );
              if (!r.ok) setError(('error' in r ? r.error : null) ?? 'Erreur.');
              else router.refresh();
            });
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] font-semibold">
            Gabarit du site
            <select
              name="template"
              className="min-h-9.5 rounded-[10px] border-[1.5px] border-border-control bg-surface-0 px-2.5 text-[13px] font-semibold"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-[12px] font-semibold">
            Page qui liste les masters
            <input
              name="url"
              type="url"
              required
              placeholder="https://formations.exemple.fr/masters"
              className="min-h-9.5 rounded-[10px] border-[1.5px] border-border-control bg-surface-0 px-2.5 text-[13px]"
            />
          </label>
          <button type="submit" disabled={pending} className={DARK}>
            {pending ? 'Enregistrement…' : 'Enregistrer le profil'}
          </button>
          {error && (
            <span role="alert" className="w-full text-[12px] font-semibold text-danger">
              {error}
            </span>
          )}
          <span className="w-full text-[12px] text-ink-muted">
            La prochaine collecte lit ce site (robots.txt vérifié pour chaque hôte).
          </span>
        </form>
      )}
    </div>
  );
}

export function AlertRow({
  a,
  canResolve,
}: {
  a: {
    id: string;
    severity: string;
    title: string;
    detail: string;
    link: string | null;
    linkLabel: string | null;
  };
  canResolve: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-surface-100 py-2 text-[13px]">
      <span className="flex min-w-0 flex-[1_1_320px] flex-col">
        <strong>{a.title}</strong>
        <span className="text-[12px] text-ink-muted">{a.detail}</span>
      </span>
      {a.link && (
        <Link href={a.link} className="font-semibold">
          {a.linkLabel ?? 'Voir'}
        </Link>
      )}
      {canResolve && (
        <button
          type="button"
          disabled={pending}
          className={cn(GHOST, 'min-h-8.5')}
          onClick={() =>
            start(async () => {
              await resolveAlert(a.id);
              router.refresh();
            })
          }
        >
          Marquer comme vue
        </button>
      )}
    </div>
  );
}

/** « Villes ouvertes seulement » (on by default: `toutes=1` in the URL turns it off). */
export function ZoneSwitch({ on }: { on: boolean }) {
  const { go } = useListUrl();
  return (
    <span className="ml-auto inline-flex items-center gap-2 text-[13px] font-semibold">
      <span id="zone-only">Villes ouvertes seulement</span>
      <Switch
        checked={on}
        labelledBy="zone-only"
        onChange={(v) => go({ toutes: v ? null : '1' })}
      />
    </span>
  );
}

const DOT = {
  ok: 'bg-success',
  err: 'bg-danger',
  warn: 'bg-[#c99a00]',
  run: 'bg-violet-500',
} as const;
const LEVEL: Record<string, string> = {
  START: 'text-[#c9bdff]',
  INFO: 'text-[#c9bdff]',
  OK: 'text-[#5fd69a]',
  WARN: 'text-[#f2c14e]',
  SKIP: 'text-[#85809a]',
  ERROR: 'text-[#ff8a73]',
};

/** Journal: one line per pass; a click unfolds its log lines (dark box, mono, scrolls). */
export function RunList({
  initial,
  next: next0,
  filters,
}: {
  initial: RunRow[];
  next: string | null;
  filters: { source: string | null; level: 'err' | 'warn' | null; days: number | null };
}) {
  const [rows, setRows] = useState(initial);
  const [next, setNext] = useState(next0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [lines, setLines] = useState<
    Record<string, { id: string; t: string; level: string; message: string }[] | 'purged'>
  >({});
  const [pending, start] = useTransition();
  const toggle = (id: string) => {
    const was = open[id];
    setOpen((o) => ({ ...o, [id]: !was }));
    if (!was && !lines[id])
      start(async () => {
        const r = await loadRunLines(id);
        if (r.ok && 'lines' in r) setLines((l) => ({ ...l, [id]: r.purged ? 'purged' : r.lines }));
      });
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-0">
      {rows.map((r) => {
        const isOpen = !!open[r.id];
        const l = lines[r.id];
        return (
          <div key={r.id} className="border-b border-surface-100">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`run-${r.id}`}
              onClick={() => toggle(r.id)}
              className={cn(
                'trow flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1.5 border-0 px-3.5 py-2.75 text-left text-ink hover:bg-[#f8f7fb] dark:hover:bg-surface-50',
                r.tone === 'err' ? 'bg-[#fff7f5] dark:bg-danger-bg' : 'bg-surface-0',
              )}
            >
              <span aria-hidden="true" className={cn('size-2.25 rounded-pill', DOT[r.tone])} />
              <strong className="flex-[1_1_240px]">{r.name}</strong>
              <span className="whitespace-nowrap text-ink-muted">{r.when}</span>
              <span className="whitespace-nowrap text-ink-muted">{r.duration}</span>
              <span className="whitespace-nowrap">{r.result}</span>
              <span className="sr-only">
                {r.tone === 'err'
                  ? 'avec erreurs'
                  : r.tone === 'warn'
                    ? 'avec avertissements'
                    : r.tone === 'run'
                      ? 'en cours'
                      : 'réussi'}
              </span>
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
                  isOpen && 'rotate-180',
                )}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div
                id={`run-${r.id}`}
                className="expand mx-3.5 mb-3 flex max-h-55 flex-col gap-0.75 overflow-y-auto rounded-[12px] bg-[#16131f] px-3 py-2.5 text-[#e7e3f0]"
                tabIndex={0}
                aria-label={`Journal du passage ${r.name}`}
              >
                {!l && <span className="font-mono text-[12px] text-[#85809a]">Chargement…</span>}
                {l === 'purged' && (
                  <span className="font-mono text-[12px] text-[#85809a]">
                    Détail ligne par ligne supprimé (gardé 30 jours).
                  </span>
                )}
                {Array.isArray(l) &&
                  l.map((x) => (
                    <span key={x.id} className="flex gap-2.5 font-mono text-[12px]">
                      <span className="flex-none text-[#85809a]">{x.t}</span>
                      <span className={cn('w-11 flex-none', LEVEL[x.level])}>
                        {x.level === 'ERROR' ? 'ERR' : x.level}
                      </span>
                      <span className="min-w-0 break-words">{x.message}</span>
                    </span>
                  ))}
                {r.reportHref && (
                  <Link
                    href={r.reportHref}
                    className="mt-1 text-[12px] font-semibold text-[#c9bdff]"
                  >
                    Voir le rapport de différences →
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!rows.length && (
        <p className="m-0 p-6 text-center text-ink-muted">Aucun passage avec ces filtres.</p>
      )}
      {next && (
        <div className="bg-surface-subtle px-3.5 py-2.5 text-center">
          <button
            type="button"
            className={cn(GHOST, 'min-h-8.5')}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await loadRuns(filters, next);
                if (r.ok && 'rows' in r) {
                  setRows((x) => [...x, ...r.rows]);
                  setNext(r.next);
                }
              })
            }
          >
            {pending ? 'Chargement…' : 'Passages plus anciens'}
          </button>
        </div>
      )}
    </div>
  );
}
