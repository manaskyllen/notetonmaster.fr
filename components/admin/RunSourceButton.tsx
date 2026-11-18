'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runSource } from '@/app/admin/(panel)/recuperation/actions';
import { cn } from '@/lib/cn';

const BTN =
  'inline-flex min-h-8 cursor-pointer items-center rounded-pill border-[1.5px] border-[#d7d3e0] bg-surface-0 px-3 text-[13px] font-bold text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 dark:border-border-control';

/** « Lancer » (and « Simuler ») of a source; disabled when the collect is forbidden. */
export function RunSourceButton({
  sourceKey,
  locked,
  running,
}: {
  sourceKey: string;
  locked: boolean;
  running: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (locked)
    return (
      <button type="button" disabled className={BTN} title="robots.txt interdit la collecte">
        Interdit
      </button>
    );
  const run = (mode: 'PREVIEW' | 'APPLY') =>
    start(async () => {
      const r = await runSource(sourceKey, mode);
      setState(r.ok ? 'En file' : (('error' in r ? r.error : null) ?? 'Erreur'));
      router.refresh();
    });
  return (
    <span className="inline-flex items-center gap-1.5">
      {state && (
        <span role="status" className="text-[12px] text-ink-muted">
          {state}
        </span>
      )}
      <button
        type="button"
        className={cn(BTN, 'border-transparent bg-transparent text-violet-700')}
        disabled={pending || running}
        onClick={() => run('PREVIEW')}
      >
        Simuler
      </button>
      <button
        type="button"
        className={BTN}
        disabled={pending || running}
        onClick={() => run('APPLY')}
      >
        {running ? 'En cours' : 'Lancer'}
      </button>
    </span>
  );
}
