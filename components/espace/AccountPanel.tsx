'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/form/Field';
import { Input } from '@/components/ui/form/Controls';
import { Notice } from '@/components/ui/Notice';
import { TurnstileNotice, useTurnstile } from '@/components/ui/Turnstile';
import { requestEmailChange, type StudentPref } from '@/app/(public)/espace/actions';
import { confirmEmailChangeByCode } from '@/app/(public)/connexion/actions';
import { CodeEntry } from '@/components/public/CodeEntry';
import { AccountActions } from './AccountActions';
import { PrefSwitch } from './PrefSwitch';

const H2 = 'm-0 font-display text-[24px] font-extrabold tracking-[-0.02em]';
const CARD = 'flex flex-col gap-3 rounded-[24px] border border-border bg-surface-0 p-5.5';

const PREFS: { key: StudentPref; label: string; hint: string }[] = [
  {
    key: 'notifyNewMessage',
    label: 'Nouvelles questions sur mes avis',
    hint: 'Un mail à chaque nouveau message.',
  },
  {
    key: 'notifyReviewStatus',
    label: 'Publication de mes avis',
    hint: 'Quand un avis est publié, à reformuler ou refusé.',
  },
  {
    key: 'notifySavedDigest',
    label: 'Nouveaux avis sur les masters que je suis',
    hint: 'Un récapitulatif par semaine au maximum.',
  },
  {
    key: 'notifyQuestionDigest',
    label: 'Questions sans réponse sur mon master vérifié',
    hint: 'Un récapitulatif par semaine au maximum, si tu acceptes les questions.',
  },
];

/** « Compte » tab: login address (change by magic link), notifications, my data. */
export function AccountPanel({
  maskedEmail,
  prefs,
  changed,
}: {
  maskedEmail: string;
  prefs: Record<StudentPref, boolean>;
  /** The new address has just been confirmed. */
  changed: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  /** The new address a code was sent to: the code screen replaces the form. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    changed
      ? {
          tone: 'success',
          text: 'C’est fait : tu te connectes désormais avec ta nouvelle adresse.',
        }
      : null,
  );
  const [pending, start] = useTransition();
  const turnstile = useTurnstile('email-change');
  return (
    <>
      <h1 className="m-0 font-display text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.035em]">
        Compte
      </h1>
      <section aria-labelledby="acc-mail" className={CARD}>
        <h2 id="acc-mail" className={H2}>
          Adresse de connexion
        </h2>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[15px] font-semibold">
            {maskedEmail}{' '}
            <span className="font-normal text-ink-muted">· jamais affichée sur le site</span>
          </span>
          {!editing && !sentTo && (
            <Button
              variant="outline"
              size="m"
              onClick={() => setEditing(true)}
              aria-expanded={false}
            >
              Changer d’adresse
            </Button>
          )}
        </div>
        {editing && (
          <form
            className="nm-unfold"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await requestEmailChange(email, await turnstile.getToken());
                turnstile.reset();
                if (r.ok) {
                  setMsg(null);
                  setSentTo(r.message ?? email);
                  setEditing(false);
                  setEmail('');
                } else setMsg({ tone: 'danger', text: r.error });
              });
            }}
          >
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-end gap-2.5">
                <Field
                  label="Nouvelle adresse"
                  className="min-w-0 flex-[1_1_260px]"
                  hint="On y envoie un code à 6 chiffres, valable 10 minutes."
                >
                  {(a) => (
                    <Input
                      {...a}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ton.adresse@mail.fr"
                    />
                  )}
                </Field>
                <Button
                  type="submit"
                  variant="night"
                  size="form"
                  disabled={pending || !email.includes('@')}
                >
                  Recevoir le code
                </Button>
              </div>
              {turnstile.field}
              <TurnstileNotice />
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-tap cursor-pointer self-start border-0 bg-transparent p-0 text-[14px] font-semibold text-ink underline"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
        {sentTo && (
          <div className="nm-unfold">
            <CodeEntry
              compact
              email={sentTo}
              turnstileForm="email-change"
              submitLabel="Confirmer la nouvelle adresse"
              changeLabel="Annuler"
              verify={(code) => confirmEmailChangeByCode(sentTo, code)}
              resend={async (token) => {
                const r = await requestEmailChange(sentTo, token);
                return r.ok ? null : r.error;
              }}
              onChangeEmail={() => setSentTo(null)}
            />
          </div>
        )}
      </section>
      <section aria-labelledby="acc-notif" className={CARD}>
        <h2 id="acc-notif" className={H2}>
          Notifications par mail
        </h2>
        {PREFS.map((p) => (
          <div
            key={p.key}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
          >
            <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{p.label}</span>
              <span className="text-[13px] text-ink-muted">{p.hint}</span>
            </span>
            <PrefSwitch pref={p.key} initial={prefs[p.key]} label={p.label} />
          </div>
        ))}
      </section>
      <section aria-labelledby="acc-data" className={CARD}>
        <h2 id="acc-data" className={H2}>
          Mes données
        </h2>
        <AccountActions />
      </section>
    </>
  );
}
