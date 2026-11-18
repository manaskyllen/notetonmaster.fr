'use client';

import { useReauth } from '@/components/admin/Reauth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import {
  bulkStatus,
  deleteView,
  ignoreIssue,
  loadFicheDrawer,
  saveView,
  searchUniversities,
  setSector,
  startBulk,
} from '@/app/admin/(panel)/fiches/actions';
import type { FicheRow } from '@/lib/admin/fiche-query';
import type { FicheDrawerData } from '@/lib/admin/fiche-drawer';
import { formatWhen, cap } from '@/lib/admin/when';
import { cn } from '@/lib/cn';
import { ClearFilters, Drawer, SearchBox, Sel } from './list';
import { ISSUE_TONE, KIND_TAG, MiniBar, PUBLICATION_TAG, Tag, TD, TH, URGENCY } from './ui';
import { useListUrl } from './useListUrl';
import { cancelUrlUpdate } from '@/lib/url-update';

const nf = new Intl.NumberFormat('fr-FR');
const ISSUE_SHORT: Record<string, string> = {
  CONFLICT: 'Conflit',
  COLLECT_ERROR: 'Erreur de collecte',
  NO_PROGRAM: 'Sans programme',
  OLD_PROGRAM: 'Programme ancien',
  NO_UAI: 'Sans UAI',
};
const BTN =
  'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-pill border-[1.5px] px-4 text-[13px] font-bold whitespace-nowrap no-underline disabled:cursor-not-allowed disabled:opacity-40';
const GHOST = `${BTN} border-[#d7d3e0] bg-surface-0 text-ink hover:border-ink dark:border-border-control`;
const DARK = `${BTN} border-transparent bg-night text-on-night`;

/** Downloads a CSV produced by an export job (1 000 lines or fewer). */
function download(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface JobState {
  label: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  progress: number;
  total: number | null;
  summary: string | null;
}

/** Runs a bulk action through the job queue and follows its progress (polled every second). */
function useBulkJob(onDone: () => void) {
  const reauth = useReauth();
  const [job, setJob] = useState<JobState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = useCallback(
    async (label: string, input: { action: string; ids?: string[]; query?: string }) => {
      setJob({
        label,
        status: 'QUEUED',
        progress: 0,
        total: input.ids?.length ?? null,
        summary: null,
      });
      const r = await reauth(() => startBulk(input));
      const jobId = 'jobId' in r ? r.jobId : undefined;
      if (!jobId) {
        setJob({
          label,
          status: 'FAILED',
          progress: 0,
          total: null,
          summary: ('error' in r ? r.error : null) ?? 'Erreur.',
        });
        return;
      }
      const poll = async () => {
        const s = await bulkStatus(jobId);
        if (!s.ok) return;
        setJob({
          label,
          status: s.status,
          progress: s.progress,
          total: s.total,
          summary: s.summary,
        });
        if (s.status === 'DONE' || s.status === 'FAILED') {
          if (s.csv) download(s.csv, `fiches-${new Date().toISOString().slice(0, 10)}.csv`);
          onDone();
        } else timer.current = window.setTimeout(poll, 1000);
      };
      timer.current = window.setTimeout(poll, 600);
    },
    [onDone, reauth],
  );
  return { job, run, clear: () => setJob(null) };
}

function JobProgress({
  job,
  onClose,
  dark,
}: {
  job: JobState;
  onClose: () => void;
  dark?: boolean;
}) {
  const pct = job.total
    ? Math.round((job.progress / job.total) * 100)
    : job.status === 'DONE'
      ? 100
      : 0;
  const done = job.status === 'DONE' || job.status === 'FAILED';
  return (
    <span className="flex min-w-60 flex-1 items-center gap-3" role="status">
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-[13px] font-semibold">
          {done
            ? (job.summary ?? (job.status === 'FAILED' ? 'Échec de l’action.' : 'Terminé.'))
            : `${job.label}… ${job.total ? `${nf.format(job.progress)} / ${nf.format(job.total)}` : 'en file'}`}
        </span>
        {!done && (
          <span
            className={cn(
              'h-1.5 overflow-hidden rounded-pill',
              dark ? 'bg-white/15' : 'bg-surface-100',
            )}
          >
            <span
              className="block h-full bg-lime-400 transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </span>
        )}
      </span>
      {done && (
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'cursor-pointer border-0 bg-transparent text-[13px] font-semibold underline',
            dark ? 'text-on-night' : 'text-violet-700',
          )}
        >
          OK
        </button>
      )}
    </span>
  );
}

/** « Exporter (CSV) » of the current view: downloaded up to 1 000 lines, else sent by mail. */
export function ExportButton({ query, total }: { query: string; total: number }) {
  const router = useRouter();
  const { job, run, clear } = useBulkJob(useCallback(() => router.refresh(), [router]));
  if (job)
    return (
      <span className="flex min-h-10 items-center rounded-pill border border-border bg-surface-0 px-4">
        <JobProgress job={job} onClose={clear} />
      </span>
    );
  return (
    <button
      type="button"
      className={GHOST}
      disabled={!total}
      onClick={() => run('Export', { action: 'export', query })}
      title={total > 1000 ? 'Plus de 1 000 lignes : le fichier est envoyé par mail' : undefined}
    >
      Exporter (CSV)
    </button>
  );
}

/** « + Enregistrer cette vue » (or delete the saved view being shown). */
export function SaveViewButton({
  query,
  existing,
}: {
  query: string;
  existing: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (existing)
    return (
      <button
        type="button"
        className={cn(GHOST, 'min-h-8.5 self-start text-[12px]')}
        disabled={pending}
        onClick={() =>
          start(async () => {
            await deleteView(existing.id);
            router.refresh();
          })
        }
      >
        Supprimer « {existing.name} »
      </button>
    );
  if (!open)
    return (
      <button
        type="button"
        className={cn(GHOST, 'min-h-8.5 self-start text-[12px]')}
        onClick={() => setOpen(true)}
      >
        + Enregistrer cette vue
      </button>
    );
  return (
    <form
      className="flex flex-col gap-1.5 px-1"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveView(name, query);
          if (!r.ok) setError('error' in r ? r.error : 'Erreur.');
          else {
            setOpen(false);
            setName('');
            cancelUrlUpdate();
            router.push(query ? `/admin/fiches?${query}` : '/admin/fiches');
            router.refresh();
          }
        });
      }}
    >
      <label htmlFor="view-name" className="text-[12px] font-semibold">
        Nom de la vue
      </label>
      <input
        id="view-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        className="min-h-9 rounded-[10px] border-[1.5px] border-border-control bg-surface-0 px-2.5 text-[13px]"
      />
      {error && <span className="text-[12px] text-danger">{error}</span>}
      <span className="flex gap-1.5">
        <button type="submit" className={cn(DARK, 'min-h-8.5 text-[12px]')} disabled={pending}>
          Enregistrer
        </button>
        <button
          type="button"
          className={cn(GHOST, 'min-h-8.5 text-[12px]')}
          onClick={() => setOpen(false)}
        >
          Annuler
        </button>
      </span>
    </form>
  );
}

/** Establishment filter: a select up to 20 establishments, an autocomplete beyond. */
function UniversityFilter({
  universities,
  current,
}: {
  universities: { id: string; name: string }[] | null;
  current: { id: string; name: string } | null;
}) {
  const { go } = useListUrl();
  const [text, setText] = useState(current?.name ?? '');
  const [items, setItems] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const list = useId();
  if (universities)
    return (
      <Sel
        param="etablissement"
        label="Établissement"
        value={current?.id ?? ''}
        options={[
          { value: '', label: 'Tous les établissements' },
          ...universities.map((u) => ({ value: u.id, label: u.name })),
        ]}
        className="max-w-60"
      />
    );
  const pick = (u: { id: string; name: string } | null) => {
    setText(u?.name ?? '');
    setOpen(false);
    go({ etablissement: u?.id ?? null });
  };
  return (
    <div className="relative">
      <label htmlFor={`${list}-in`} className="sr-only">
        Établissement
      </label>
      <input
        id={`${list}-in`}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={list}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${list}-${active}` : undefined}
        value={text}
        placeholder="Tous les établissements"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setActive(-1);
          window.clearTimeout(timer.current);
          if (!v.trim()) {
            if (current) pick(null);
            setItems([]);
            return;
          }
          timer.current = window.setTimeout(async () => {
            const r = await searchUniversities(v);
            if (r.ok) {
              setItems(r.items);
              setOpen(true);
            }
          }, 180);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && active >= 0 && items[active]) {
            e.preventDefault();
            pick(items[active]!);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={cn(
          'min-h-9.5 w-56 rounded-[10px] border-[1.5px] bg-surface-0 px-2.5 text-[13px] font-semibold text-ink',
          current ? 'border-ink' : 'border-[#d7d3e0] dark:border-border-control',
        )}
      />
      {open && items.length > 0 && (
        <ul
          id={list}
          role="listbox"
          className="absolute top-full left-0 z-20 m-0 mt-1 w-80 list-none rounded-[12px] border border-border bg-surface-0 p-1 shadow-[0_12px_30px_rgba(22,19,31,.15)]"
        >
          {items.map((u, i) => (
            <li
              key={u.id}
              id={`${list}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
              className={cn(
                'cursor-pointer rounded-[8px] px-2.5 py-1.5 text-[13px]',
                i === active && 'bg-violet-100',
              )}
            >
              <span className="font-semibold">{u.name}</span>
              {u.city && <span className="text-ink-muted"> · {u.city}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FichesToolbar({
  q,
  type,
  city,
  problem,
  sort,
  cities,
  universities,
  university,
}: {
  q: string;
  type: string;
  city: string;
  problem: string;
  sort: string;
  cities: { slug: string; name: string }[];
  universities: { id: string; name: string }[] | null;
  university: { id: string; name: string } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox
        label="Rechercher une fiche"
        placeholder="Nom, établissement, n° Mon Master, RNCP, UAI…"
        value={q}
      />
      <Sel
        param="type"
        label="Type"
        value={type}
        options={[
          { value: '', label: 'Tous les types' },
          { value: 'parcours', label: 'Parcours' },
          { value: 'mention', label: 'Mentions' },
          { value: 'etablissement', label: 'Établissements' },
        ]}
      />
      <Sel
        param="ville"
        label="Ville"
        value={city}
        options={[
          { value: '', label: 'Toutes les villes' },
          ...cities.map((c) => ({ value: c.slug, label: c.name })),
          { value: 'hors', label: 'Hors ville ouverte' },
        ]}
      />
      <UniversityFilter
        key={university?.id ?? ''}
        universities={universities}
        current={university}
      />
      <Sel
        param="probleme"
        label="Problème"
        value={problem}
        options={[
          { value: '', label: 'Tous les problèmes' },
          { value: 'conflit', label: 'Conflit' },
          { value: 'erreur', label: 'Erreur de collecte' },
          { value: 'sans-programme', label: 'Sans programme' },
          { value: 'programme-ancien', label: 'Programme ancien' },
          { value: 'sans-uai', label: 'Sans UAI' },
        ]}
      />
      <ClearFilters params={['q', 'type', 'ville', 'etablissement', 'probleme']} />
      <label className="ml-auto flex items-center gap-1.5 text-[13px] font-semibold">
        Trier
        <Sel
          param="tri"
          label="Tri"
          value={sort}
          defaultValue="priorite"
          options={[
            { value: 'priorite', label: 'Priorité' },
            { value: 'nom', label: 'Nom A → Z' },
            { value: 'synchro', label: 'Dernière synchro' },
            { value: 'completude', label: 'Moins complètes' },
          ]}
        />
      </label>
    </div>
  );
}

const FIELD_DOT = {
  ok: 'bg-success',
  warn: 'bg-[#c99a00]',
  bad: 'bg-danger',
  locked: 'bg-violet-500',
} as const;

function FicheDrawer({
  data,
  loading,
  onClose,
  onIgnore,
  onResync,
  canEdit,
  canSync,
}: {
  data: FicheDrawerData | null;
  loading: boolean;
  onClose: () => void;
  onIgnore: (issueId: string) => void;
  onResync: () => void;
  canEdit: boolean;
  canSync: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const review = data?.fields.filter((f) => f.review) ?? [];
  const shown = !data
    ? []
    : showAll
      ? data.fields
      : review.length
        ? review
        : data.fields.slice(0, 3);
  const hidden = (data?.fields.length ?? 0) - shown.length;
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border px-5 py-4.5">
        <div className="flex items-center gap-1.5">
          {data && (
            <>
              <Tag upper className={KIND_TAG[data.type].cls}>
                {KIND_TAG[data.type].label}
              </Tag>
              <Tag className={PUBLICATION_TAG[data.publication].cls}>
                {PUBLICATION_TAG[data.publication].label}
              </Tag>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            data-autofocus
            className="ml-auto size-9 cursor-pointer rounded-[10px] border-0 bg-surface-100 text-[18px] text-ink"
          >
            ×
          </button>
        </div>
        <h2
          id="drawer-title"
          className="m-0 font-display text-[22px] leading-[1.15] font-extrabold"
        >
          {data?.name ?? (loading ? 'Chargement…' : 'Fiche introuvable')}
        </h2>
        {data && (
          <>
            <span className="text-[13px] text-ink-muted">{data.sub}</span>
            <span className="font-mono text-[12px] text-ink-muted">{data.ident}</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {canEdit && (
                <Link href={data.editHref} className={cn(DARK, 'min-h-9')}>
                  Modifier
                </Link>
              )}
              {data.publicHref && (
                <Link href={data.publicHref} target="_blank" className={cn(GHOST, 'min-h-9')}>
                  Voir sur le site
                </Link>
              )}
              {canSync && data.type !== 'MENTION' && (
                <button type="button" className={cn(GHOST, 'min-h-9')} onClick={onResync}>
                  Resynchroniser
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {data && (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {data.issues.length ? (
            <section aria-labelledby="drawer-issues" className="flex flex-col gap-2">
              <h3
                id="drawer-issues"
                className="m-0 text-[12px] font-bold tracking-[0.05em] text-ink-muted uppercase"
              >
                À traiter ({data.issues.length})
              </h3>
              {data.issues.map((i) => {
                const u = i.severity === 'BLOCK' ? 'block' : i.severity === 'HIGH' ? 'high' : 'low';
                return (
                  <div
                    key={i.id}
                    className={cn('flex gap-2.5 rounded-[14px] p-3', URGENCY[u].pill)}
                  >
                    <span aria-hidden="true" className="w-1 flex-none rounded-[4px] bg-current" />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <span className="font-bold">{i.label}</span>
                      <span className="text-[13px] leading-[1.45] text-[#2a2635] dark:text-ink">
                        {i.text}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        <Link href={i.href} className={cn(DARK, 'min-h-8 px-3 text-[12px]')}>
                          {i.cta}
                        </Link>
                        {canEdit && (
                          <button
                            type="button"
                            disabled={pending}
                            className={cn(GHOST, 'min-h-8 px-3 text-[12px]')}
                            onClick={() => start(() => onIgnore(i.id))}
                          >
                            Ignorer
                          </button>
                        )}
                      </span>
                    </span>
                  </div>
                );
              })}
            </section>
          ) : (
            <p className="m-0 rounded-[14px] bg-success-bg p-3 font-semibold text-success">
              Rien à traiter sur cette fiche.
            </p>
          )}
          {data.sectorToCheck && canEdit && (
            <p className="m-0 flex flex-wrap items-center gap-2 rounded-[14px] bg-warning-bg p-3 text-[13px] text-warning">
              Secteur absent de l’annuaire : à vérifier.
              {(['PUBLIC', 'PRIVATE'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cn(GHOST, 'min-h-8 px-3 text-[12px]')}
                  onClick={() =>
                    start(async () => {
                      await setSector(data.id, s);
                      router.refresh();
                    })
                  }
                >
                  {s === 'PUBLIC' ? 'Public' : 'Privé'}
                </button>
              ))}
            </p>
          )}
          <section aria-labelledby="drawer-fields" className="flex flex-col">
            <h3
              id="drawer-fields"
              className="m-0 mb-1.5 text-[12px] font-bold tracking-[0.05em] text-ink-muted uppercase"
            >
              Champs
            </h3>
            {shown.map((f, i) => (
              <div
                key={`${f.label}-${i}`}
                className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 border-b border-surface-100 py-2.25"
              >
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <span
                    aria-hidden="true"
                    className={cn('size-1.75 flex-none rounded-pill', FIELD_DOT[f.tone])}
                  />
                  {f.label}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] break-words">{f.value}</span>
                  <span className="text-[12px] text-ink-muted">{f.source}</span>
                </span>
              </div>
            ))}
            {(hidden > 0 || showAll) && (
              <button
                type="button"
                onClick={() => setShowAll((x) => !x)}
                className="mt-2 cursor-pointer self-start border-0 bg-transparent px-0 py-1 text-[13px] font-semibold text-violet-700"
              >
                {showAll
                  ? 'Ne montrer que les champs à revoir'
                  : `Voir les ${hidden} autres champs`}
              </button>
            )}
          </section>
          {data.history && (
            <p className="m-0 text-[12px] text-ink-muted">
              {data.history.text} · <Link href={data.history.href}>Historique</Link>
            </p>
          )}
        </div>
      )}
    </>
  );
}

export function FichesTable({
  rows,
  total,
  viewLabel,
  query,
  canEdit,
  canSync,
  initialDrawer,
}: {
  rows: FicheRow[];
  total: number;
  viewLabel: string;
  query: string;
  canEdit: boolean;
  canSync: boolean;
  initialDrawer: FicheDrawerData | null;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allInView, setAllInView] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialDrawer?.id ?? null);
  const [drawer, setDrawer] = useState<FicheDrawerData | null>(initialDrawer);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => router.refresh(), [router]);
  const { job, run, clear } = useBulkJob(
    useCallback(() => {
      setSel(new Set());
      setAllInView(false);
      router.refresh();
    }, [router]),
  );

  // The selection is that of the page shown: a new page or new filters start empty.
  const [rowsKey, setRowsKey] = useState(query);
  if (rowsKey !== query) {
    setRowsKey(query);
    setSel(new Set());
    setAllInView(false);
  }

  const setUrlFiche = (id: string | null) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('fiche', id);
    else u.searchParams.delete('fiche');
    window.history.replaceState(window.history.state, '', u);
  };
  const open = async (id: string) => {
    setOpenId(id);
    setUrlFiche(id);
    if (drawer?.id !== id) {
      setDrawer(null);
      setLoading(true);
    }
    const r = await loadFicheDrawer(id);
    setDrawer('data' in r ? (r.data ?? null) : null);
    setLoading(false);
  };
  const close = () => {
    setOpenId(null);
    setUrlFiche(null);
  };

  const pageIds = rows.map((r) => r.id);
  const allOnPage = rows.length > 0 && pageIds.every((id) => sel.has(id));
  const count = allInView ? total : sel.size;
  const toggle = (id: string) => {
    setAllInView(false);
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const bulk = (action: string, label: string) =>
    run(label, allInView ? { action, query } : { action, ids: [...sel] });

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <caption className="sr-only">Fiches · {viewLabel}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(TH, 'w-9')}>
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner sur la page"
                  checked={allOnPage}
                  onChange={() => {
                    setAllInView(false);
                    setSel(allOnPage ? new Set() : new Set(pageIds));
                  }}
                  className="size-4.5 cursor-pointer accent-violet-500"
                />
              </th>
              <th scope="col" className={TH}>
                Fiche
              </th>
              <th scope="col" className={TH}>
                À traiter
              </th>
              <th scope="col" className={TH}>
                Complétude
              </th>
              <th scope="col" className={TH}>
                Synchro
              </th>
              <th scope="col" className={TH}>
                Publication
              </th>
            </tr>
          </thead>
          <tbody>
            {allOnPage && total > rows.length && (
              <tr>
                <td
                  colSpan={6}
                  className="bg-violet-100 px-3 py-2 text-center text-[13px] text-violet-700"
                >
                  {allInView ? (
                    <>
                      Les {nf.format(total)} fiches de la vue sont sélectionnées.{' '}
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent font-bold text-violet-700 underline"
                        onClick={() => {
                          setAllInView(false);
                          setSel(new Set());
                        }}
                      >
                        Annuler la sélection
                      </button>
                    </>
                  ) : (
                    <>
                      Les {rows.length} fiches de la page sont sélectionnées.{' '}
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent font-bold text-violet-700 underline"
                        onClick={() => setAllInView(true)}
                      >
                        Sélectionner les {nf.format(total)} fiches de la vue
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const on = sel.has(r.id) || allInView;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    'trow hover:bg-[#f8f7fb] dark:hover:bg-surface-50',
                    openId === r.id ? 'bg-violet-100' : on && 'bg-[#f8f6ff] dark:bg-surface-50',
                  )}
                >
                  <td className={TD}>
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${r.name}`}
                      checked={on}
                      onChange={() => {
                        if (allInView) {
                          setAllInView(false);
                          setSel(new Set(pageIds.filter((id) => id !== r.id)));
                        } else toggle(r.id);
                      }}
                      className="size-4.5 cursor-pointer accent-violet-500"
                    />
                  </td>
                  <td className={cn(TD, 'max-w-90')}>
                    <button
                      type="button"
                      onClick={() => void open(r.id)}
                      aria-haspopup="dialog"
                      className="flex max-w-full cursor-pointer flex-col gap-0.5 border-0 bg-transparent p-0 text-left text-ink"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Tag upper className={KIND_TAG[r.type].cls}>
                          {KIND_TAG[r.type].label}
                        </Tag>
                        <span className="truncate text-[14px] font-bold">{r.name}</span>
                      </span>
                      <span className="truncate text-[12px] text-ink-muted">{r.sub}</span>
                    </button>
                  </td>
                  <td className={TD}>
                    <span className="flex flex-wrap gap-1">
                      {r.issues.slice(0, 2).map((k) => (
                        <Tag key={k} className={ISSUE_TONE[k]}>
                          {ISSUE_SHORT[k]}
                        </Tag>
                      ))}
                      {r.issues.length > 2 && (
                        <Tag className="bg-surface-50 text-[#3b3648] dark:bg-surface-100 dark:text-ink-muted">
                          +{r.issues.length - 2}
                        </Tag>
                      )}
                      {!r.issues.length && (
                        <span className="text-[12px] font-semibold text-success">Rien</span>
                      )}
                    </span>
                  </td>
                  <td className={cn(TD, 'min-w-32')}>
                    <MiniBar pct={r.pct} />
                  </td>
                  <td
                    className={cn(
                      TD,
                      'whitespace-nowrap',
                      r.syncFailed ? 'text-danger' : 'text-ink-muted',
                    )}
                  >
                    {r.syncFailed ? 'Échec · ' : ''}
                    {r.lastSync
                      ? r.syncFailed
                        ? formatWhen(r.lastSync)
                        : cap(formatWhen(r.lastSync))
                      : r.syncFailed
                        ? 'collecte'
                        : 'Jamais'}
                  </td>
                  <td className={TD}>
                    <Tag className={PUBLICATION_TAG[r.publication].cls}>
                      {PUBLICATION_TAG[r.publication].label}
                    </Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(count > 0 || job) && (
        <div
          role="region"
          aria-label="Actions groupées"
          className="bulk fixed bottom-4 left-1/2 z-30 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-pill bg-night py-2.5 pr-2.5 pl-4.5 text-on-night shadow-[0_20px_50px_rgba(22,19,31,.3)] lg:left-[calc(50%+118px)]"
        >
          {job ? (
            <JobProgress job={job} onClose={clear} dark />
          ) : (
            <>
              <span className="mr-1.5 font-bold" role="status">
                {nf.format(count)} fiche{count > 1 ? 's' : ''} sélectionnée{count > 1 ? 's' : ''}
              </span>
              {canSync && (
                <button
                  type="button"
                  className={cn(BTN, 'min-h-9 border-transparent bg-violet-500 text-on-violet')}
                  onClick={() => bulk('resync', 'Resynchronisation')}
                >
                  Resynchroniser
                </button>
              )}
              {canEdit && (
                <>
                  <button
                    type="button"
                    className={cn(BTN, 'min-h-9 border-transparent bg-lime-400 text-on-lime')}
                    onClick={() => bulk('publish', 'Publication')}
                  >
                    Publier
                  </button>
                  <button
                    type="button"
                    className={cn(BTN, 'min-h-9 border-transparent bg-[#2d2840] text-white')}
                    onClick={() => bulk('unpublish', 'Dépublication')}
                  >
                    Dépublier
                  </button>
                  <button
                    type="button"
                    className={cn(BTN, 'min-h-9 border-transparent bg-[#2d2840] text-white')}
                    onClick={() => bulk('ignore', 'Ignorer les problèmes')}
                  >
                    Ignorer les problèmes
                  </button>
                </>
              )}
              <button
                type="button"
                className={cn(BTN, 'min-h-9 border-transparent bg-[#2d2840] text-white')}
                onClick={() => bulk('export', 'Export')}
              >
                Exporter
              </button>
              <button
                type="button"
                aria-label="Annuler la sélection"
                onClick={() => {
                  setSel(new Set());
                  setAllInView(false);
                }}
                className="size-9 cursor-pointer rounded-pill border-0 bg-[#2d2840] text-[16px] text-white"
              >
                ×
              </button>
            </>
          )}
        </div>
      )}

      <Drawer open={!!openId} onClose={close} labelledBy="drawer-title">
        <FicheDrawer
          data={drawer}
          loading={loading}
          onClose={close}
          canEdit={canEdit}
          canSync={canSync}
          onResync={() => openId && run('Resynchronisation', { action: 'resync', ids: [openId] })}
          onIgnore={async (issueId) => {
            await ignoreIssue(issueId);
            if (openId) await open(openId);
            refresh();
          }}
        />
      </Drawer>
    </>
  );
}
