'use client';

import { useReauth } from '@/components/admin/Reauth';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { loadAuditPage, startAuditExport } from '@/app/admin/(panel)/audit/actions';
import { bulkStatus } from '@/app/admin/(panel)/fiches/actions';
import type { AuditEntry } from '@/lib/admin/audit-entries';
import { cn } from '@/lib/cn';
import { Tag, TD, TH } from './ui';
import { useListUrl } from './useListUrl';

const GHOST =
  'inline-flex min-h-10 cursor-pointer items-center justify-center rounded-pill border-[1.5px] border-[#d7d3e0] bg-surface-0 px-4 text-[13px] font-bold whitespace-nowrap text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 dark:border-border-control';

/** « Masquer les actions automatiques » (checked by default: `auto=1` shows them). */
export function HideAutomatic({ hidden }: { hidden: boolean }) {
  const { go } = useListUrl();
  return (
    <label className="ml-auto inline-flex items-center gap-2 text-[13px] font-semibold">
      <input
        type="checkbox"
        checked={hidden}
        onChange={() => go({ auto: hidden ? '1' : null })}
        className="size-4.5 cursor-pointer accent-violet-500"
      />
      Masquer les actions automatiques
    </label>
  );
}

/** « Exporter la sélection (CSV) »: in the background; downloaded up to 1 000 lines, else mailed. */
export function AuditExportButton({ query }: { query: string }) {
  const reauth = useReauth();
  const [state, setState] = useState<{ text: string; done: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = async () => {
    setState({ text: 'Export en file…', done: false });
    const r = await reauth(() => startAuditExport(query));
    const jobId = 'jobId' in r ? r.jobId : null;
    if (!jobId) return setState({ text: ('error' in r ? r.error : null) ?? 'Erreur.', done: true });
    const poll = async () => {
      const s = await bulkStatus(jobId);
      if (!s.ok) return;
      if (s.status === 'DONE' || s.status === 'FAILED') {
        if (s.csv) {
          const url = URL.createObjectURL(new Blob([s.csv], { type: 'text/csv;charset=utf-8' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        setState({ text: s.summary ?? 'Terminé.', done: true });
      } else {
        setState({ text: `Export… ${s.progress} lignes`, done: false });
        timer.current = window.setTimeout(poll, 1000);
      }
    };
    timer.current = window.setTimeout(poll, 600);
  };
  return (
    <span className="flex items-center gap-2">
      {state && (
        <span role="status" className="text-[13px] text-ink-muted">
          {state.text}
        </span>
      )}
      <button
        type="button"
        className={GHOST}
        disabled={!!state && !state.done}
        onClick={() => void run()}
      >
        Exporter la sélection (CSV)
      </button>
    </span>
  );
}

function Entry({ e }: { e: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = e.diff.length > 0 || (!!e.action && !!e.detail);
  const object = e.href ? (
    <Link href={e.href} className="font-semibold">
      {e.target}
    </Link>
  ) : (
    <span className="font-semibold">{e.target}</span>
  );
  return (
    <div className="border-b border-surface-100 last:border-b-0">
      <div className="trow flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 hover:bg-[#f8f7fb] dark:hover:bg-surface-50">
        <time className="w-11 font-mono text-[12px] text-ink-muted">{e.time}</time>
        <span
          aria-hidden="true"
          className={cn(
            'flex size-7 flex-none items-center justify-center rounded-[9px] text-[11px] font-extrabold',
            e.avatar,
          )}
        >
          {e.initials}
        </span>
        <span className="min-w-0 flex-[1_1_320px] text-[14px]">
          <strong>{e.who}</strong>{' '}
          {e.action ? (
            <>
              {e.action} {object}
            </>
          ) : (
            <>
              <span className="text-ink-muted">· {e.detail}</span> · {object}
            </>
          )}
        </span>
        <Tag className={e.categoryCls}>{e.category}</Tag>
        {hasDetail && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`d-${e.id}`}
            onClick={() => setOpen((x) => !x)}
            className="cursor-pointer border-0 bg-transparent text-[13px] font-semibold whitespace-nowrap text-violet-700"
          >
            {open ? 'Masquer' : 'Détail'}
          </button>
        )}
      </div>
      {open && (
        <div
          id={`d-${e.id}`}
          className="expand mx-3.5 mb-3 overflow-hidden rounded-[12px] border border-border sm:ml-17.5"
        >
          {e.diff.length > 0 && (
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">Avant et après</caption>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Champ
                  </th>
                  <th scope="col" className={TH}>
                    Avant
                  </th>
                  <th scope="col" className={TH}>
                    Après
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.diff.map((d, i) => (
                  <tr key={i}>
                    <th scope="row" className={cn(TD, 'text-left font-semibold')}>
                      {d.field}
                    </th>
                    <td
                      className={cn(
                        TD,
                        'bg-[#fff7f5] break-words text-coral-800 dark:bg-danger-bg dark:text-danger',
                      )}
                    >
                      {d.before}
                    </td>
                    <td
                      className={cn(TD, 'bg-[#f4fbf6] break-words text-success dark:bg-success-bg')}
                    >
                      {d.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {e.action && e.detail && (
            <p className="m-0 px-3 py-2 text-[13px] text-[#3b3648] dark:text-ink-muted">
              {e.detail}
            </p>
          )}
          <p className="m-0 bg-[#fbfafd] px-3 py-2 font-mono text-[12px] text-ink-muted dark:bg-surface-50">
            {e.meta}
          </p>
        </div>
      )}
    </div>
  );
}

/** Entries grouped by day (« Aujourd'hui », « Hier », then the date); « Entrées plus anciennes ». */
export function AuditList({
  initial,
  next: next0,
  query,
}: {
  initial: AuditEntry[];
  next: string | null;
  query: string;
}) {
  const [entries, setEntries] = useState(initial);
  const [next, setNext] = useState(next0);
  const [pending, start] = useTransition();
  const days: { day: string; label: string; items: AuditEntry[] }[] = [];
  for (const e of entries) {
    const last = days.at(-1);
    if (last?.day === e.day) last.items.push(e);
    else days.push({ day: e.day, label: e.dayLabel, items: [e] });
  }
  return (
    <>
      <div className="flex flex-col gap-3.5">
        {days.map((d) => (
          <section
            key={d.day}
            aria-label={d.label}
            className="overflow-hidden rounded-2xl border border-border bg-surface-0"
          >
            <h2 className="m-0 border-b border-border bg-[#fbfafd] px-3.5 py-2.5 text-[12px] font-bold tracking-[0.05em] text-ink-muted uppercase dark:bg-surface-50">
              {d.label}
            </h2>
            {d.items.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </section>
        ))}
      </div>
      {!entries.length && (
        <p className="m-0 rounded-2xl border-[1.5px] border-dashed border-[#b9b3c8] p-7 text-center text-ink-muted">
          Aucune entrée avec ces filtres.
        </p>
      )}
      {next && (
        <button
          type="button"
          className={cn(GHOST, 'self-center')}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await loadAuditPage(query, next);
              if (r.ok && 'entries' in r) {
                setEntries((x) => [...x, ...r.entries]);
                setNext(r.next);
              }
            })
          }
        >
          {pending ? 'Chargement…' : 'Entrées plus anciennes'}
        </button>
      )}
    </>
  );
}
