'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { chipClasses } from '@/components/ui/Chip';
import { controlClass } from '@/components/ui/form/Controls';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { cn } from '@/lib/cn';
import { bulkReviews } from '@/app/admin/(panel)/avis/actions';
import { useListUrl } from './useListUrl';

export interface AdminReviewRow {
  id: string;
  ref: string;
  date: string;
  title: string | null;
  program: string;
  author: string;
  rating: number;
  flags: number;
  status: 'PENDING_CONFIRMATION' | 'PENDING' | 'PUBLISHED' | 'NEEDS_EDIT' | 'HIDDEN' | 'REJECTED';
  demo: boolean;
}

const S: Record<AdminReviewRow['status'], [string, string]> = {
  PENDING_CONFIRMATION: ['Mail à confirmer', 'bg-surface-100 text-ink'],
  PENDING: ['En attente', 'bg-violet-100 text-violet-700'],
  PUBLISHED: ['Publié', 'bg-success-bg text-success'],
  NEEDS_EDIT: ['À reformuler', 'bg-warning-bg text-warning'],
  HIDDEN: ['Masqué', 'bg-surface-100 text-ink-muted'],
  REJECTED: ['Refusé', 'bg-danger-bg text-danger'],
};
const FILTERS = [
  ['all', 'Tous'],
  ['PENDING', 'En attente'],
  ['PUBLISHED', 'Publiés'],
  ['NEEDS_EDIT', 'À reformuler'],
  ['HIDDEN', 'Masqués'],
  ['REJECTED', 'Refusés'],
  ['PENDING_CONFIRMATION', 'Mail à confirmer'],
] as const;
/** Status of the author (?niveau=…): M1, M2, graduates, left during the year. */
const LEVELS = [
  ['all', 'Tous'],
  ['M1', 'M1'],
  ['M2', 'M2'],
  ['GRADUATE', 'Diplômé·es'],
  ['LEFT', 'Parti·es en cours'],
] as const;

/**
 * « Tous les avis »: the page of reviews rendered by the server (?q, ?statut, ?page, 25 per page);
 * the counters of the status filters are totals, not the page.
 */
export function ReviewsTable({
  rows,
  counts,
  q: initialQ,
  status: st,
  level = 'all',
  pagination,
}: {
  rows: AdminReviewRow[];
  counts: Record<string, number>;
  q: string;
  status: string;
  /** Status of the author: all, M1, M2, GRADUATE, LEFT. */
  level?: string;
  pagination?: React.ReactNode;
}) {
  const url = useListUrl();
  const [q, setQ] = useState(initialQ);
  const [sel, setSel] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const shown = rows;
  const run = (action: 'publish' | 'hide') =>
    start(async () => {
      const r = await bulkReviews({ ids: sel, action, reason });
      if ('ok' in r && r.ok) {
        setMsg({ tone: 'success', text: r.message });
        setSel([]);
        setReason('');
        url.refresh();
      } else setMsg({ tone: 'danger', text: 'error' in r ? r.error : 'Erreur.' });
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 flex-[1_1_260px] items-center gap-2 rounded-md border-[1.5px] border-border-control bg-surface-0 px-3.5 focus-within:shadow-[0_0_0_4px_var(--focus-halo)]">
          <Icon name="search" size={18} />
          <label htmlFor="aq" className="sr-only">
            Rechercher dans les avis
          </label>
          <input
            id="aq"
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              url.typed('q', e.target.value);
            }}
            placeholder="Titre, parcours, identifiant…"
            className="min-w-0 flex-1 border-0 bg-transparent py-3 text-[14px] text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <nav aria-label="Statut" className="flex flex-wrap gap-1.5">
          {FILTERS.map(([k, l]) => (
            <Link
              key={k}
              href={url.hrefWith({ statut: k === 'all' ? null : k })}
              scroll={false}
              aria-current={st === k ? 'true' : undefined}
              className={chipClasses(st === k, 'filter', 'min-h-10 px-3 text-[13px]')}
            >
              {l} · {counts[k] ?? 0}
            </Link>
          ))}
        </nav>
        <nav aria-label="Statut de l’auteur·rice" className="flex flex-wrap gap-1.5">
          {LEVELS.map(([k, l]) => (
            <Link
              key={k}
              href={url.hrefWith({ niveau: k === 'all' ? null : k })}
              scroll={false}
              aria-current={level === k ? 'true' : undefined}
              className={chipClasses(level === k, 'filter', 'min-h-10 px-3 text-[13px]')}
            >
              {l}
            </Link>
          ))}
        </nav>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {sel.length > 0 && (
        <div
          role="region"
          aria-label="Actions groupées"
          className="flex flex-wrap items-center gap-2 rounded-md bg-night px-4 py-3 text-on-night"
        >
          <span className="font-semibold">{sel.length} sélectionné(s)</span>
          <Button variant="lime" size="s" disabled={pending} onClick={() => run('publish')}>
            Publier
          </Button>
          <label htmlFor="bulk-reason" className="sr-only">
            Motif du masquage
          </label>
          <input
            id="bulk-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif du masquage…"
            className={cn(controlClass, 'w-56 max-w-full')}
          />
          <Button
            variant="outline"
            size="s"
            className="text-on-night"
            disabled={pending}
            onClick={() => run('hide')}
          >
            Masquer
          </Button>
          <Button variant="ghost" size="s" className="text-on-night" onClick={() => setSel([])}>
            Annuler
          </Button>
        </div>
      )}
      <div className="relative overflow-x-auto rounded-lg border border-border bg-surface-0">
        <table className="w-full min-w-[860px] border-collapse text-[14px]">
          <caption className="sr-only">Tous les avis</caption>
          <thead>
            <tr>
              <th scope="col" className="w-10 border-b border-border px-3 py-3">
                <span className="sr-only">Sélection</span>
              </th>
              {['Reçu', 'Avis', 'Parcours', 'Auteur', 'Note', 'Signal.', 'Statut'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b border-border px-3 py-3 text-left text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const on = sel.includes(r.id);
              return (
                <tr key={r.id} className={cn('nm-row-hover', on && 'bg-violet-100')}>
                  <td className="border-b border-border px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setSel((x) => (on ? x.filter((i) => i !== r.id) : [...x, r.id]))
                      }
                      aria-label={`Sélectionner ${r.title ?? r.ref}`}
                      className="size-5 accent-violet-500"
                    />
                  </td>
                  <td className="border-b border-border px-3 py-2.5 font-mono text-[12px] whitespace-nowrap text-ink-muted">
                    {r.date}
                  </td>
                  <td className="border-b border-border px-3 py-2.5">
                    <span className="flex flex-col">
                      <span className="font-semibold">
                        {r.title ? `« ${r.title} »` : 'Sans titre'}
                      </span>
                      <span className="font-mono text-[12px] text-ink-muted">
                        {r.ref}
                        {r.demo ? ' · exemple' : ''}
                      </span>
                    </span>
                  </td>
                  <td className="border-b border-border px-3 py-2.5 text-[13px]">{r.program}</td>
                  <td className="border-b border-border px-3 py-2.5 text-[13px] whitespace-nowrap">
                    {r.author}
                  </td>
                  <td className="border-b border-border px-3 py-2.5 tabular-nums">{r.rating}/5</td>
                  <td
                    className={cn(
                      'border-b border-border px-3 py-2.5 font-bold tabular-nums',
                      r.flags > 1 ? 'text-danger' : r.flags ? 'text-warning' : 'text-ink-muted',
                    )}
                  >
                    {r.flags}
                  </td>
                  <td className="border-b border-border px-3 py-2.5">
                    <span
                      className={cn(
                        'rounded-pill px-2.5 py-1 text-[12px] font-bold whitespace-nowrap',
                        S[r.status][1],
                      )}
                    >
                      {S[r.status][0]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="p-7 text-center text-ink-muted">Aucun avis ne correspond.</div>
        )}
        <div className="p-3">{pagination}</div>
      </div>
    </>
  );
}
