'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  attachFicheAction,
  renameCursusAction,
  splitCursusAction,
} from '@/app/admin/(panel)/fiches/[id]/cursus-actions';
import { buttonClasses } from '@/components/ui/Button';
import type { AdminCursusData } from '@/lib/admin/cursus';

const KIND: Record<string, string> = {
  single: 'Un seul cursus',
  named: 'Cursus nommés (lieu ou suffixe)',
  rhythm: 'Initiale ou alternance',
  unnamed: 'Cursus sans libellé : à nommer',
};

/**
 * Cursus of a parcours in the admin (issue #21): their labels (typed by hand: kept at every
 * sync), « Séparer » a cursus, « Rattacher » another fiche. Every action asks for a confirmation
 * and goes to the audit log.
 */
export function CursusPanel({ data }: { data: AdminCursusData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fiche, setFiche] = useState('');
  const run = (
    confirmText: string,
    fn: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) => {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? '' });
      if (r.ok) router.refresh();
    });
  };

  if (data.mergedInto)
    return (
      <section
        aria-labelledby="cursus-admin"
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface-0 p-5"
      >
        <h2 id="cursus-admin" className="m-0 text-[18px] font-bold">
          Cursus
        </h2>
        <p className="m-0 text-[14px]">
          Cette fiche est un cursus du parcours{' '}
          <Link href={`/admin/fiches/${data.mergedInto.id}`} className="font-semibold">
            {data.mergedInto.title}
          </Link>{' '}
          : son adresse redirige vers lui. Pour la rétablir, sépare-la depuis ce parcours.
        </p>
      </section>
    );

  const live = data.cursus.filter((c) => c.live);
  const old = data.cursus.filter((c) => !c.live);
  return (
    <section
      aria-labelledby="cursus-admin"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface-0 p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cursus-admin" className="m-0 text-[18px] font-bold">
          Cursus ({live.length})
        </h2>
        <span className="text-[13px] text-ink-muted">{KIND[data.kind] ?? data.kind}</span>
      </div>
      {live.length > 1 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {live.map((c) => (
            <li key={c.code} className="flex flex-col gap-2 rounded-md border border-border p-3.5">
              <form
                className="flex flex-wrap items-end gap-2.5"
                aria-label={`Cursus ${c.code}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const label = String(f.get('label') ?? '');
                  const leadsTo = String(f.get('leadsTo') ?? '');
                  run(
                    `Enregistrer le libellé « ${label || 'calculé'} » du cursus ${c.code} ?`,
                    () =>
                      renameCursusAction({
                        programId: data.programId,
                        code: c.code,
                        label,
                        leadsTo,
                      }),
                  );
                }}
              >
                <span className="flex min-w-[140px] flex-col gap-0.5 text-[13px]">
                  <span className="font-mono font-semibold">{c.code}</span>
                  <span className="text-ink-muted">
                    {c.places != null ? `${c.places} places` : 'places n.c.'}
                    {c.home && (
                      <>
                        {' · venu de '}
                        <Link href={`/admin/fiches/${c.home.id}`}>{c.home.slug}</Link>
                      </>
                    )}
                  </span>
                </span>
                <label className="flex flex-col gap-1 text-[13px] font-semibold">
                  Libellé
                  <input
                    name="label"
                    defaultValue={c.manualLabel ?? ''}
                    placeholder={c.label ?? 'sans libellé'}
                    maxLength={60}
                    className="min-h-tap rounded-sm border border-border-control px-2.5 font-normal"
                  />
                </label>
                <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] font-semibold">
                  Mène vers
                  <input
                    name="leadsTo"
                    defaultValue={c.leadsTo ?? ''}
                    placeholder="M2 visé (facultatif)"
                    maxLength={300}
                    className="min-h-tap rounded-sm border border-border-control px-2.5 font-normal"
                  />
                </label>
                <button type="submit" disabled={pending} className={buttonClasses('outline')}>
                  Enregistrer le libellé
                </button>
                {c.home && live.length > 1 && (
                  <button
                    type="button"
                    disabled={pending}
                    className={buttonClasses('ghost')}
                    onClick={() =>
                      run(
                        `Séparer le cursus ${c.code} ? Il redevient une fiche à part (${c.home!.slug}), avec son adresse, et ne sera plus regroupé.`,
                        () => splitCursusAction({ programId: data.programId, code: c.code }),
                      )
                    }
                  >
                    Séparer
                  </button>
                )}
              </form>
              <span className="text-[12px] text-ink-muted">
                Affiché : {c.label ?? '— (sans libellé)'}
                {c.manualLabel ? ' · saisi à la main' : ' · calculé par les règles'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {old.length > 0 && (
        <p className="m-0 text-[13px] text-ink-muted">
          Numéros des sessions précédentes : {old.map((c) => c.code).join(', ')}.
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!fiche.trim()) return;
          run(
            `Rattacher la fiche « ${fiche.trim()} » à ce parcours ? Elle en devient un cursus et son adresse redirigera ici.`,
            () => attachFicheAction({ programId: data.programId, fiche }),
          );
        }}
      >
        <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-[13px] font-semibold">
          Rattacher une fiche à ce parcours
          <input
            value={fiche}
            onChange={(e) => setFiche(e.target.value)}
            placeholder="Adresse /parcours/…, n° Mon Master ou identifiant"
            className="min-h-tap rounded-sm border border-border-control px-2.5 font-normal"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !fiche.trim()}
          className={buttonClasses('outline')}
        >
          Rattacher
        </button>
      </form>
      {msg && (
        <p
          role="status"
          className={msg.ok ? 'm-0 text-[14px] text-success' : 'm-0 text-[14px] text-danger'}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
