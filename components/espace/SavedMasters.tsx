'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { CompareButton } from '@/components/catalog/CompareButton';
import { ProgramCard, type ProgramCardData } from '@/components/catalog/ProgramCard';
import { setFollow } from '@/app/(public)/parcours/actions';

/** A followed master: the data of its card, and the reviews since the student's last visit. */
export interface SavedMaster extends ProgramCardData {
  /** Reviews published since the student last opened the fiche. */
  fresh: number;
}

const MAX = 3;

/**
 * « Masters suivis »: the master card of the whole site (ProgramCard), with a
 * filled heart to stop following, the new reviews since the last visit and the animated
 * « Comparer » button (2 or 3 to compare).
 */
export function SavedMasters({ masters }: { masters: SavedMaster[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [refused, setRefused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = masters.filter((m) => !removed.includes(m.programId));
  const chosen = picked.filter((s) => list.some((m) => m.slug === s));
  const canCompare = chosen.length >= 2;

  const unfollow = (m: SavedMaster) => {
    setRemoved((x) => [...x, m.programId]);
    start(async () => {
      let r: Awaited<ReturnType<typeof setFollow>>;
      try {
        r = await setFollow(m.programId, false);
      } catch {
        r = { error: 'Connexion perdue : rien n’a été enregistré. Réessaie.' };
      }
      if ('error' in r) {
        setRemoved((x) => x.filter((id) => id !== m.programId));
        setError(r.error);
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-display text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.035em]">
            Masters suivis
          </h1>
          <span className="text-[15px] text-ink-muted">
            Coche jusqu’à 3 masters pour les comparer côte à côte.
          </span>
        </div>
        {canCompare ? (
          <Link
            href={`/comparer?ids=${chosen.join(',')}`}
            className={buttonClasses('night', 'form')}
          >
            Comparer ({chosen.length})
          </Link>
        ) : list.length > 1 ? (
          <span
            role="status"
            className="inline-flex min-h-12 items-center rounded-pill bg-surface-100 px-4.5 text-[14px] font-semibold text-ink-soft"
          >
            {chosen.length === 0
              ? 'Coche 2 ou 3 masters pour les comparer'
              : 'Coche encore 1 master pour comparer'}
          </span>
        ) : null}
      </div>
      {refused && (
        <p role="status" className="m-0 text-[14px] font-semibold text-ink-soft">
          Retire un parcours pour en ajouter un autre
        </p>
      )}
      {list.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-3.5 p-0">
          {list.map((m, i) => {
            const on = chosen.includes(m.slug);
            return (
              <ProgramCard
                key={m.programId}
                p={m}
                index={i}
                className="nm-drop nm-svc"
                follow={
                  <span className="absolute top-3.5 right-3.5 z-[1]">
                    <button
                      type="button"
                      onClick={() => unfollow(m)}
                      disabled={pending}
                      aria-label={`Ne plus suivre : ${m.title}`}
                      title="Ne plus suivre"
                      className="nm-unf flex size-11 cursor-pointer items-center justify-center rounded-[14px] border-0 bg-violet-100 text-violet-500"
                    >
                      <svg
                        aria-hidden="true"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
                      </svg>
                    </button>
                  </span>
                }
                badge={
                  m.fresh > 0 ? (
                    <span className="-rotate-2 self-start rounded-[8px] bg-lime-400 px-2.5 py-1 text-[12px] font-extrabold text-on-lime">
                      {m.fresh} {m.fresh > 1 ? 'nouveaux avis' : 'nouvel avis'} depuis ta dernière
                      visite
                    </span>
                  ) : null
                }
                action={
                  <CompareButton
                    title={m.title}
                    on={on}
                    blocked={!on && chosen.length >= MAX}
                    onToggle={() => {
                      setRefused(false);
                      setPicked((x) => (on ? x.filter((s) => s !== m.slug) : [...x, m.slug]));
                    }}
                    onBlocked={() => setRefused(true)}
                  />
                }
              />
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2.5 rounded-[24px] border-[1.5px] border-dashed border-border-control bg-surface-0 p-8 text-center">
          <span className="text-[17px] font-bold">Aucun master suivi</span>
          <span className="text-[15px] text-ink-muted">
            Sur une fiche parcours, clique sur « Suivre » pour le retrouver ici.
          </span>
          <Link href="/explorer" className={buttonClasses('primary', 'm')}>
            Explorer les masters
          </Link>
        </div>
      )}
      {error && <Toast tone="danger" message={error} onDone={() => setError(null)} />}
    </>
  );
}
