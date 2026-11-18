'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { confirmIdentity } from '@/app/admin/login/actions';

/** The code of the authenticator app (or a recovery code), then the sensitive page itself. */
export function ConfirmIdentity({ next }: { next: string }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (value: string) => {
    setPending(true);
    const r = await confirmIdentity(value);
    setPending(false);
    if (r.ok) window.location.assign(next);
    else setError(r.error);
  };
  return (
    <form
      className="flex max-w-[440px] flex-col gap-4 rounded-xl bg-surface-0 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <h1 className="m-0 font-display text-[24px] font-extrabold">Confirme ton code</h1>
      <p className="m-0 text-[15px] leading-[1.5] text-ink-muted">
        Ce téléchargement contient des données sensibles : saisis le code de ton application
        d’authentification.
      </p>
      {error && (
        <p
          role="alert"
          className="m-0 rounded-[12px] bg-danger-bg px-3.5 py-2.5 text-[14px] font-semibold text-danger"
        >
          {error}
        </p>
      )}
      <span id="confirm-label" className="nm-label">
        Code
      </span>
      <CodeInput
        labelId="confirm-label"
        autoFocus
        invalid={!!error}
        disabled={pending}
        onChange={setCode}
        onComplete={(c) => void submit(c)}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Vérification…' : 'Confirmer et télécharger'}
      </Button>
    </form>
  );
}
