'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button, buttonClasses, Notice } from '@/components/ui';
import { confirmReview } from '@/app/(public)/avis/actions';

export function ConfirmReviewButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'published'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (state !== 'idle')
    return (
      <div role="status" className="flex flex-col gap-3">
        <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
          C’est confirmé, merci !
        </h1>
        <p className="m-0 text-[16px]">
          {state === 'published'
            ? 'Ton avis est publié.'
            : 'Ton avis passe en relecture : une personne de l’équipe le lit sous 48 heures. Tu recevras un mail quand il sera publié.'}
        </p>
        <Link href="/explorer" className={buttonClasses('night', 'm', 'self-start')}>
          Explorer d’autres masters
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em]">
        Confirme ton avis
      </h1>
      <p className="m-0 text-[16px] text-ink-muted">
        Un clic et ton avis part en relecture. Il sera publié sans badge « Parcours vérifié ».
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button
        size="l"
        disabled={pending}
        className="self-start"
        onClick={() =>
          start(async () => {
            const r = await confirmReview(token);
            if ('error' in r) setError(r.error);
            else setState(r.published ? 'published' : 'done');
          })
        }
      >
        {pending ? 'Un instant…' : 'Confirmer mon avis'}
      </Button>
    </div>
  );
}
