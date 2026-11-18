'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { applyRun } from '@/app/admin/(panel)/recuperation/actions';
import { recomputeRun } from '@/app/admin/(panel)/recuperation/rapprochements/actions';

/** « Appliquer » of a simulation; replaced by « Recalculer » when newer decisions exist (decision G). */
export function ApplyRunButton({
  runId,
  stale,
  canRecompute,
}: {
  runId: string;
  stale: boolean;
  canRecompute: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="night"
          disabled={pending || stale}
          onClick={() =>
            start(async () => {
              const r = await applyRun(runId);
              if ('runId' in r && r.runId) {
                setMsg({
                  tone: 'success',
                  text: 'Application lancée : suivez la progression sur la page Récupération.',
                });
                router.refresh();
              } else if ('error' in r && r.error) setMsg({ tone: 'danger', text: r.error });
            })
          }
        >
          Appliquer cette simulation
        </Button>
        {stale && canRecompute && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await recomputeRun(runId);
                setMsg(
                  'error' in r && r.error
                    ? { tone: 'danger', text: r.error }
                    : { tone: 'success', text: 'Recalcul lancé (sans retéléchargement).' },
                );
                router.refresh();
              })
            }
          >
            Recalculer la simulation
          </Button>
        )}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
