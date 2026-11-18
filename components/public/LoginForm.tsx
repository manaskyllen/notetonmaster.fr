'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { TurnstileNotice, useTurnstile } from '@/components/ui/Turnstile';
import type { FormState } from '@/lib/form';
import {
  requestLoginCode,
  verifyLoginCode,
  type LoginRequest,
} from '@/app/(public)/connexion/actions';
import { CodeEntry } from './CodeEntry';

const initial: FormState<{ email: string }> = { status: 'idle' };

/** What brings the visitor back after login: page, and the action to do there. */
export type LoginIntent = { next?: string; follow?: string };

function intentFields(fd: FormData, intent: LoginIntent) {
  if (intent.next) fd.set('next', intent.next);
  if (intent.follow) fd.set('suivre', intent.follow);
  return fd;
}

/**
 * Login in two screens: the address, then the 6-digit code of the mail (whose button
 * « Se connecter sur cet appareil » is the fallback). Back on `next`, the pending action done.
 */
export function LoginForm(intent: LoginIntent) {
  const [state, action, pending] = useActionState(requestLoginCode, initial);
  const [editing, setEditing] = useState(false);
  const turnstile = useTurnstile('login');
  const { reset } = turnstile;
  useEffect(() => {
    if (state.status !== 'idle') reset();
  }, [state, reset]);
  const sentTo = state.status === 'success' && !editing ? state.data?.email : null;

  if (sentTo)
    return (
      <div className="flex flex-col gap-4">
        <span className="flex size-16 items-center justify-center rounded-[20px] bg-lime-400 text-on-lime">
          <Icon name="mail" size={32} />
        </span>
        <h1 className="m-0 font-display text-[36px] leading-[1.05] font-extrabold tracking-[-0.03em] max-sm:text-[30px]">
          Saisis ton code
        </h1>
        <p className="m-0 text-[16px] leading-[1.55] text-ink-muted">
          On t’a envoyé un code à 6 chiffres. Tu peux aussi ouvrir le bouton du mail sur l’appareil
          où tu veux te connecter.
        </p>
        <CodeEntry
          email={sentTo}
          turnstileForm="login"
          submitLabel="Me connecter"
          verify={(code) => verifyLoginCode(sentTo, code)}
          resend={async (token) => {
            const fd = intentFields(new FormData(), intent);
            fd.set('email', sentTo);
            if (token) fd.set('cf-turnstile-response', token);
            const r: LoginRequest = await requestLoginCode(initial, fd);
            return r.status === 'error' ? (r.message ?? 'Envoi impossible.') : null;
          }}
          onChangeEmail={() => setEditing(true)}
        />
      </div>
    );

  const err = state.status === 'error' ? state : null;
  return (
    <form
      action={(fd) => {
        setEditing(false);
        action(intentFields(fd, intent));
      }}
      onSubmit={turnstile.onSubmit}
      className="flex flex-col gap-4.5"
      noValidate
    >
      <h1 className="m-0 font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] max-sm:text-[32px]">
        Accède à ton espace
      </h1>
      <p className="m-0 text-[16px] leading-[1.55] text-ink-muted">
        Pas de mot de passe : on t’envoie un code à 6 chiffres, valable 10 minutes.
      </p>
      {err?.message && (
        <p
          role="alert"
          className="m-0 rounded-md bg-danger-bg px-4 py-3 text-[14px] font-semibold text-danger"
        >
          {err.message}
        </p>
      )}
      <TextField
        name="email"
        type="email"
        label="Ton adresse mail"
        placeholder="ton.adresse@mail.fr"
        autoComplete="email"
        required
        defaultValue={
          err?.values?.email ?? (state.status === 'success' ? state.data?.email : undefined)
        }
        error={
          err?.fieldErrors?.email
            ? 'Vérifie l’adresse : il manque peut-être le @ ou le domaine.'
            : undefined
        }
        hint="Perso ou universitaire, peu importe."
      />
      {turnstile.field}
      <TurnstileNotice />
      <Button type="submit" variant="primary" size="form" disabled={pending}>
        {pending ? 'Envoi…' : 'Recevoir mon code'}
      </Button>
      <p className="m-0 text-[13px] leading-[1.5] text-ink-muted">
        Première fois ? Le même code crée ton espace. En continuant, tu acceptes les{' '}
        <Link href="/legal/cgu">conditions d’utilisation</Link>.
      </p>
      <p className="m-0 rounded-md bg-surface-100 px-4 py-3 text-[14px]">
        Pas besoin d’espace pour donner un avis :{' '}
        <Link href="/avis/nouveau">tu peux le faire sans compte</Link>.
      </p>
    </form>
  );
}
