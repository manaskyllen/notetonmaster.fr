'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  Button,
  formCardClass,
  Select,
  TextField,
  TurnstileNotice,
  useTurnstile,
} from '@/components/ui';
import { idle } from '@/lib/form';
import { sendContact } from '@/app/(public)/a-propos/actions';

export function ContactForm({
  initialSubject,
  initialLink,
}: {
  /** Prefilled from /a-propos?sujet=…&parcours=… (fiche parcours). */
  initialSubject?: string;
  initialLink?: string;
} = {}) {
  const [state, action, pending] = useActionState(sendContact, idle);
  const [subject, setSubject] = useState(initialSubject ?? '');
  const link = initialLink ?? '';
  const turnstile = useTurnstile('contact');
  const { reset } = turnstile;
  // A token is single-use: a fresh one after each answer of the server.
  useEffect(() => {
    if (state.status !== 'idle') reset();
  }, [state, reset]);
  const err = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const v = state.status === 'error' ? (state.values ?? {}) : {};

  if (state.status === 'success')
    return (
      <div role="status" className={formCardClass}>
        <span className="flex flex-col gap-2">
          <span className="font-display text-[26px] font-extrabold">Message envoyé, merci !</span>
          <span className="text-[15px]">On te répond par mail dans quelques jours.</span>
        </span>
      </div>
    );

  return (
    <form action={action} onSubmit={turnstile.onSubmit} className={formCardClass} noValidate>
      {state.status === 'error' && state.message && (
        <p
          role="alert"
          className="m-0 rounded-md bg-danger-bg px-4 py-3 text-[14px] font-semibold text-danger"
        >
          {state.message}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3.5">
        <Select
          name="subject"
          label="Sujet"
          required
          value={subject || v.subject || ''}
          onChange={(e) => setSubject(e.target.value)}
          error={err.subject}
          placeholder="Choisir…"
          options={[
            { value: 'missing', label: 'Une formation manque' },
            { value: 'error', label: 'Une donnée est fausse' },
            { value: 'univ', label: 'Je représente une université' },
            { value: 'programme', label: 'Le programme d’un parcours' },
            { value: 'other', label: 'Autre chose' },
          ]}
        />
        <TextField
          name="email"
          type="email"
          label="Ton mail"
          autoComplete="email"
          required
          defaultValue={v.email}
          error={err.email}
        />
      </div>
      {['error', 'programme'].includes(subject || v.subject || '') || link ? (
        <TextField
          name="link"
          type="url"
          label="Lien de la fiche concernée"
          placeholder="https://…"
          defaultValue={v.link || link}
          error={err.link}
        />
      ) : null}
      <TextField
        name="message"
        multiline
        label="Message"
        required
        defaultValue={v.message}
        error={err.message}
        hint={err.message ? undefined : '10 caractères minimum.'}
      />
      {turnstile.field}
      <TurnstileNotice />
      <Button type="submit" variant="primary" size="form" disabled={pending} className="self-start">
        {pending ? 'Envoi…' : 'Envoyer'}
      </Button>
    </form>
  );
}
