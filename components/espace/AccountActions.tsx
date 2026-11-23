'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { deleteAccount, requestDataExport } from '@/app/(public)/espace/actions';

export function AccountActions() {
  const [exported, setExported] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="outline"
          size="s"
          icon="download"
          className="max-w-full py-2 text-center whitespace-normal!"
          disabled={pending || !!exported}
          onClick={() =>
            start(async () => {
              const r = await requestDataExport();
              setExported(r.ok ? (r.message ?? 'Envoyé.') : r.error);
            })
          }
        >
          {exported ? 'Copie de mes données demandée ✓' : 'Recevoir une copie de mes données'}
        </Button>
        <Button
          variant="ghost"
          size="s"
          className="text-danger"
          onClick={() => setDeleting(true)}
          aria-expanded={deleting}
          aria-controls="delete-confirm"
        >
          Supprimer mon compte
        </Button>
      </div>
      {exported && (
        <p role="status" className="m-0 text-[14px] text-ink-muted">
          {exported}
        </p>
      )}
      {deleting && (
        <div id="delete-confirm">
          <Notice tone="danger" title="Supprimer ton compte ?">
            <span className="block">
              Ton espace, tes conversations et tes vérifications seront supprimés. Tes avis restent
              publiés sans lien avec toi (supprime-les avant si tu préfères).
            </span>
            <span className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="danger"
                size="s"
                disabled={pending}
                onClick={() => start(async () => void (await deleteAccount()))}
              >
                Confirmer la suppression
              </Button>
              <Button variant="ghost" size="s" onClick={() => setDeleting(false)}>
                Annuler
              </Button>
            </span>
          </Notice>
        </div>
      )}
    </div>
  );
}
