'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { buttonClasses, Button, CtaArrow, ctaClasses } from '@/components/ui/Button';
import { Grade } from '@/components/ui/Grade';
import { cn } from '@/lib/cn';
import { deleteMyReview } from '@/app/(public)/espace/actions';

export interface MyReview {
  id: string;
  ref: string;
  programTitle: string;
  programSlug: string;
  city: string;
  /** « Ce que tu as aimé », cut at two lines. */
  excerpt: string;
  rating: number;
  status: string;
  statusLabel: string;
  statusCls: string;
  message: string | null;
  editable: boolean;
  /** Published reviews only. */
  stats: { views: number; helpful: number; questions: number; publishedOn: string } | null;
}

/** « Mes avis » tab: one card per review, statistics once published, two-step deletion. */
export function MyReviews({ reviews }: { reviews: MyReview[] }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const list = reviews.filter((r) => !gone.includes(r.id));
  return (
    <>
      {list.map((r) => (
        <article
          key={r.id}
          id={r.ref}
          className="flex flex-col gap-3 rounded-[24px] border border-border bg-surface-0 p-5.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/parcours/${r.programSlug}`} className="text-[14px] font-semibold">
              {r.programTitle} · {r.city}
            </Link>
            <span className={cn('rounded-pill px-2.5 py-1 text-[12px] font-bold', r.statusCls)}>
              {r.statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Grade value={r.rating} />
            <span className="line-clamp-2 min-w-0 text-[15px] leading-[1.5]">{r.excerpt}</span>
          </div>
          {r.message && (
            <div className="rounded-[14px] bg-warning-bg px-4 py-3 text-[14px] leading-[1.5] text-ink">
              <strong>Message de la modération :</strong> {r.message}
            </div>
          )}
          {r.stats && (
            <div className="flex flex-wrap gap-x-4.5 gap-y-1 text-[14px] text-ink-muted">
              <span>
                <strong className="text-ink">{r.stats.views}</strong> lecture
                {r.stats.views > 1 ? 's' : ''}
              </span>
              <span>
                <strong className="text-ink">{r.stats.helpful}</strong> « Utile »
              </span>
              <span>
                <strong className="text-ink">{r.stats.questions}</strong> question
                {r.stats.questions > 1 ? 's' : ''}
              </span>
              <span>Publié le {r.stats.publishedOn}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {r.editable && (
              <Link href={`/espace/avis/${r.ref}`} className={buttonClasses('outline', 's')}>
                {r.status === 'NEEDS_EDIT' ? 'Reformuler' : 'Modifier'}
              </Link>
            )}
            {r.stats && (
              <Link
                href={`/parcours/${r.programSlug}#${r.ref}`}
                className={buttonClasses('outline', 's')}
              >
                Voir sur la fiche
              </Link>
            )}
            {confirm === r.id ? (
              <>
                <Button
                  variant="danger"
                  size="s"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteMyReview(r.id);
                      if (res.ok) setGone((g) => [...g, r.id]);
                      setConfirm(null);
                    })
                  }
                >
                  Confirmer la suppression
                </Button>
                <Button variant="ghost" size="s" onClick={() => setConfirm(null)}>
                  Annuler
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="s" onClick={() => setConfirm(r.id)}>
                Supprimer
              </Button>
            )}
          </div>
        </article>
      ))}
      {list.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-[24px] border border-dashed border-border-control bg-surface-0 p-6">
          <span className="font-display text-[22px] font-bold">Aucun avis pour l’instant</span>
          <span className="text-[15px] text-ink-muted">
            3 minutes suffisent, et ça aide la promo d’après.
          </span>
          <Link href="/avis/nouveau" className={ctaClasses('primary', 'm')}>
            Donner mon avis
            <CtaArrow />
          </Link>
        </div>
      )}
    </>
  );
}
