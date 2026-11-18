'use client';

import { useReauth } from '@/components/admin/Reauth';
import Link from 'next/link';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/form/Controls';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import type { QueueItem, QueueKind } from '@/lib/admin/moderation';
import { moderate } from '@/app/admin/(panel)/moderation/actions';

const TABS: { id: QueueKind; label: string }[] = [
  { id: 'avis', label: 'Avis à valider' },
  { id: 'justif', label: 'Justificatifs' },
  { id: 'msg', label: 'Messages' },
  { id: 'signal', label: 'Signalements' },
  { id: 'reponses', label: 'Réponses des formations' },
  { id: 'questions', label: 'Questions publiques' },
  { id: 'contact', label: 'Contact' },
  { id: 'legal', label: 'Demandes légales' },
];
const TONE = {
  ok: 'bg-success-bg text-success',
  warn: 'bg-warning-bg text-warning',
  bad: 'bg-danger-bg text-danger',
} as const;
const CHECK = { ok: ['✓', 'check'], warn: ['!', 'alert'], bad: ['×', 'close'] } as const;

/**
 * Moderation queues: one queue at a time (?file=…), 25 items per page (?page=…); tab counters are
 * the totals of each queue.
 */
export function ModerationBoard({
  items,
  allowed,
  tab,
  counts,
  pagination,
}: {
  items: QueueItem[];
  allowed: QueueKind[];
  tab: QueueKind;
  counts: Record<QueueKind, number>;
  pagination?: React.ReactNode;
}) {
  const reauth = useReauth();
  const [gone, setGone] = useState<string[]>([]);
  const live = useMemo(
    () => items.filter((i) => !gone.includes(`${i.kind}:${i.id}`)),
    [items, gone],
  );
  const inTab = live.filter((i) => i.kind === tab);
  const [sel, setSel] = useState<string | null>(null);
  const cur = inTab.find((i) => i.id === sel) ?? inTab[0];
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [also, setAlso] = useState<string[]>([]);
  const [flash, setFlash] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const clearFlash = useCallback(() => setFlash(null), []);
  const [done, setDone] = useState(0);
  const [pending, start] = useTransition();

  const left = (k: QueueKind) =>
    Math.max(0, counts[k] - gone.filter((g) => g.startsWith(`${k}:`)).length);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-muted">
            {done} décision(s) prise(s) cette session
          </span>
          <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
            Modération
          </h1>
        </div>
        <nav
          aria-label="Files"
          className="inline-flex flex-wrap gap-1.5 rounded-[28px] border border-border bg-surface-0 p-1.5"
        >
          {TABS.filter((t) => allowed.includes(t.id)).map((t) => (
            <Link
              key={t.id}
              href={`/admin/moderation?file=${t.id}`}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-tap cursor-pointer items-center rounded-pill border-0 px-4 text-[14px] font-semibold no-underline',
                tab === t.id ? 'bg-night text-on-night' : 'bg-transparent text-ink',
              )}
            >
              {t.label} · {left(t.id)}
            </Link>
          ))}
        </nav>
      </div>
      {/* Decisions are confirmed by a toast (4 s); errors stay inline. */}
      {flash?.tone === 'danger' && <Notice tone="danger">{flash.text}</Notice>}
      {flash?.tone === 'success' && (
        <Toast key={flash.text + done} message={flash.text} onDone={clearFlash} />
      )}

      <div
        className="flex flex-wrap items-start gap-4"
        role="region"
        aria-label={TABS.find((t) => t.id === tab)?.label}
      >
        <ul className="flex min-w-0 flex-[2_1_320px] flex-col gap-2">
          {inTab.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                aria-pressed={cur?.id === i.id}
                onClick={() => {
                  setSel(i.id);
                  setReason('');
                  setNote('');
                  setFlash(null);
                }}
                className={cn(
                  'flex w-full cursor-pointer flex-col gap-1.5 rounded-[18px] border-[1.5px] bg-surface-0 px-4 py-3.5 text-left text-ink',
                  cur?.id === i.id ? 'border-violet-500' : 'border-border',
                )}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn('rounded-pill px-2 py-0.5 text-[12px] font-bold', TONE[i.tone])}
                  >
                    {i.flag}
                  </span>
                  <span className="text-[12px] text-ink-muted">{i.when}</span>
                </span>
                <span className="text-[15px] font-bold">{i.title}</span>
                <span className="text-[12px] text-ink-muted">{i.target}</span>
              </button>
            </li>
          ))}
          {inTab.length === 0 && (
            <li className="flex flex-col items-center gap-1 rounded-[18px] border-[1.5px] border-dashed border-border-control bg-surface-0 px-5 py-8 text-center">
              <span className="font-display text-[20px] font-bold">File vide</span>
              <span className="text-ink-muted">Rien à traiter ici pour l’instant.</span>
            </li>
          )}
          {pagination && <li className="pt-2">{pagination}</li>}
        </ul>

        {cur && (
          <section
            aria-label="Détail"
            className="flex min-w-0 flex-[3_1_460px] flex-col gap-4 rounded-lg border border-border bg-surface-0 p-5.5"
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-ink-muted">{cur.target}</span>
              <h2 className="m-0 font-display text-[24px] leading-[1.15] font-extrabold">
                {cur.title}
              </h2>
              <span className="text-[13px] text-ink-muted">{cur.meta}</span>
            </div>
            <div className="rounded-md bg-surface-50 p-4 text-[15px] leading-[1.55] whitespace-pre-line">
              {cur.body}
            </div>
            {(cur.documentUrl || cur.exportUrl || cur.publicUrl) && (
              <div className="flex flex-wrap gap-2">
                {cur.documentUrl && (
                  <a
                    href={cur.documentUrl}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-tap items-center gap-2 font-semibold"
                  >
                    <Icon name="file" size={16} />
                    Ouvrir le justificatif
                  </a>
                )}
                {cur.exportUrl && (
                  <a
                    href={cur.exportUrl}
                    className="inline-flex min-h-tap items-center gap-2 font-semibold"
                  >
                    <Icon name="download" size={16} />
                    Télécharger l’export (rôle Légal)
                  </a>
                )}
                {cur.publicUrl && (
                  <a
                    href={cur.publicUrl}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-tap items-center gap-2 font-semibold"
                  >
                    <Icon name="external" size={16} />
                    Voir sur le site
                  </a>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase">
                Vérifications automatiques
              </span>
              {cur.checks.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-2.5 rounded-sm px-1 py-1 text-[14px]"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-5.5 flex-none items-center justify-center rounded-pill',
                      TONE[c.k],
                    )}
                  >
                    <Icon name={CHECK[c.k][1]} size={12} strokeWidth={3} />
                  </span>
                  <span className="sr-only">
                    {c.k === 'ok' ? 'Conforme' : c.k === 'warn' ? 'À vérifier' : 'Problème'} :
                  </span>
                  <span className="flex-1">
                    <strong>{c.label}</strong> — {c.detail}
                  </span>
                </div>
              ))}
            </div>
            {cur.reasons.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="motif" className="nm-label">
                  Motif communiqué à l’auteur ou au demandeur
                </label>
                <select
                  id="motif"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={controlClass}
                >
                  <option value="">Choisir un motif…</option>
                  {cur.reasons.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <label htmlFor="motif-note" className="nm-label mt-1">
                  Précisions (facultatif, envoyées avec le motif)
                </label>
                <textarea
                  id="motif-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={controlClass}
                />
              </div>
            )}
            {cur.alsoPrograms && cur.alsoPrograms.length > 0 && (
              <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                <legend className="nm-label mb-1">
                  Le document mentionne aussi (cocher pour valider ces masters)
                </legend>
                {cur.alsoPrograms.map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 text-[14px]">
                    <input
                      type="checkbox"
                      checked={also.includes(p.id)}
                      onChange={(e) =>
                        setAlso((x) =>
                          e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id),
                        )
                      }
                      className="size-5 accent-violet-500"
                    />
                    {p.label}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex flex-wrap gap-2">
              {cur.actions.map((a) => (
                <Button
                  key={a.id}
                  variant={a.variant}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const motive = [reason, note.trim()].filter(Boolean).join(' — ');
                      const r = await reauth(() =>
                        moderate({
                          kind: cur.kind,
                          id: cur.id,
                          action: a.id,
                          reason: motive,
                          alsoPrograms: also,
                        }),
                      );
                      if (r.ok) {
                        setFlash({ tone: 'success', text: r.message });
                        setDone((d) => d + 1);
                        if (!['transmit', 'assign', 'export', 'hide'].includes(a.id))
                          setGone((g) => [...g, `${cur.kind}:${cur.id}`]);
                        setReason('');
                        setNote('');
                        setAlso([]);
                        setSel(null);
                      } else setFlash({ tone: 'danger', text: r.error });
                    })
                  }
                >
                  {a.label}
                </Button>
              ))}
            </div>
            <span className="text-[12px] leading-[1.5] text-ink-muted">
              Chaque décision est horodatée, motivée et notifiée. Les données de connexion des
              auteurs restent conservées un an, hors de portée des modérateurs.
            </span>
          </section>
        )}
      </div>
    </>
  );
}
