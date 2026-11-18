'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button, Logo, TextField } from '@/components/ui';

export function InvitationForm({
  email,
  roleLabel,
  action,
}: {
  email: string | null;
  roleLabel: string;
  action: (prev: { error?: string }, fd: FormData) => Promise<{ error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <section className="box-border flex w-full max-w-[440px] flex-col gap-5 rounded-xl bg-surface-0 p-8.5 text-ink max-sm:p-6">
      <span className="flex flex-col gap-1.5">
        <Logo size="m" />
        <span className="text-caption text-ink-muted">Administration</span>
      </span>
      {email ? (
        <form action={formAction} className="flex flex-col gap-4">
          <h1 className="m-0 font-display text-[30px] font-extrabold tracking-[-0.03em]">
            Rejoindre l’équipe
          </h1>
          <p className="m-0 text-[15px] text-ink-muted">
            {email} · rôle <strong className="text-ink">{roleLabel}</strong>
          </p>
          {state.error && (
            <p
              role="alert"
              className="m-0 rounded-[12px] bg-danger-bg px-3.5 py-2.5 text-[14px] font-semibold text-danger"
            >
              {state.error}
            </p>
          )}
          <TextField
            name="name"
            label="Ton nom (affiché dans le journal d’audit)"
            required
            autoComplete="name"
          />
          <TextField
            name="password"
            type="password"
            label="Mot de passe"
            hint="12 caractères minimum."
            required
            autoComplete="new-password"
          />
          <TextField
            name="confirm"
            type="password"
            label="Confirmer le mot de passe"
            required
            autoComplete="new-password"
          />
          <Button type="submit" size="form" disabled={pending}>
            {pending ? 'Activation…' : 'Activer mon compte'}
          </Button>
          <span className="text-[13px] text-ink-muted">
            Tu configureras ensuite la double authentification à la connexion.
          </span>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <h1 className="m-0 font-display text-[30px] font-extrabold tracking-[-0.03em]">
            Invitation invalide
          </h1>
          <p className="m-0 text-ink-muted">
            Elle a expiré (7 jours), a déjà servi ou a été annulée. Demande une nouvelle invitation
            à un·e admin.
          </p>
          <Link href="/admin/login" className="font-semibold">
            Connexion admin →
          </Link>
        </div>
      )}
    </section>
  );
}
