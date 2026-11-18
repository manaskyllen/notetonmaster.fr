'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { TurnstileNotice, useTurnstile } from '@/components/ui/Turnstile';
import { domainHint, RESPONSE_MAX } from '@/lib/domain/staff-domains';
import type { FormState } from '@/lib/form';
import {
  requestStaffCode,
  submitResponse,
  verifyStaffCode,
} from '@/app/(public)/reponse-formation/actions';

const STEPS = ['1. Vérifier', '2. Répondre', '3. Modération'];

/** The three steps (.dr-step). */
export function DrSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol aria-label="Étapes" className="m-0 flex list-none gap-1.5 p-0">
      {STEPS.map((l, i) => (
        <li
          key={l}
          aria-current={i === current ? 'step' : undefined}
          className={`dr-step flex-1 rounded-[12px] px-2.5 py-2 text-center text-[13px] font-bold ${i <= current ? 'bg-ink text-surface-0' : 'bg-surface-100 text-ink-muted'}`}
        >
          {l}
        </li>
      ))}
    </ol>
  );
}

const idle = { status: 'idle' } as const;

/**
 * Step 1: an address of an official domain of the establishment (live message under the field),
 * then the code received by mail.
 */
export function StaffVerify({
  universityId,
  universityName,
  domains,
}: {
  universityId: string;
  universityName: string;
  domains: string[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [state, action, pending] = useActionState(
    requestStaffCode,
    idle as FormState<{ email: string }>,
  );
  const [codeState, codeAction, codePending] = useActionState(verifyStaffCode, idle as FormState);
  const turnstile = useTurnstile('staff-code');
  const { reset } = turnstile;
  useEffect(() => {
    if (state.status !== 'idle') reset();
  }, [state, reset]);
  useEffect(() => {
    if (codeState.status === 'success') router.refresh();
  }, [codeState, router]);
  const hint = domainHint(email, domains, universityName);
  const [code, setCode] = useState('');
  const codeForm = useRef<HTMLFormElement>(null);
  const sent = state.status === 'success';
  const err = state.status === 'error' ? state : null;
  const codeErr = codeState.status === 'error' ? codeState : null;

  if (sent)
    return (
      <form ref={codeForm} action={codeAction} className="flex flex-col gap-2.5" noValidate>
        <p role="status" className="m-0 text-[14px] leading-[1.5]">
          Un code à 6 chiffres vient d’être envoyé à <strong>{state.data?.email}</strong>. Il est
          valable 15 minutes.
        </p>
        {codeErr?.message && (
          <p
            role="alert"
            className="m-0 rounded-md bg-danger-bg px-4 py-3 text-[14px] font-semibold text-danger"
          >
            {codeErr.message}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <span id="dr-code-label" className="text-[14px] font-semibold">
            Code reçu
          </span>
          {/* Six boxes, as on the login pages: the sixth digit sends the form. */}
          <CodeInput
            labelId="dr-code-label"
            autoFocus
            invalid={!!codeErr}
            disabled={codePending}
            onChange={setCode}
            onComplete={(c) => {
              setCode(c);
              requestAnimationFrame(() => codeForm.current?.requestSubmit());
            }}
          />
          <input type="hidden" name="code" value={code} />
          {codeErr?.fieldErrors?.code && (
            <span className="text-[13px] font-semibold text-danger">
              {codeErr.fieldErrors.code}
            </span>
          )}
        </div>
        <Button type="submit" disabled={codePending || code.length < 6}>
          {codePending ? 'Vérification…' : 'Valider le code'}
        </Button>
      </form>
    );

  return (
    <form
      action={action}
      onSubmit={turnstile.onSubmit}
      className="flex flex-col gap-2.5"
      noValidate
    >
      <input type="hidden" name="universityId" value={universityId} />
      {err?.message && (
        <p
          role="alert"
          className="m-0 rounded-md bg-danger-bg px-4 py-3 text-[14px] font-semibold text-danger"
        >
          {err.message}
        </p>
      )}
      <label htmlFor="dr-mail" className="text-[14px] font-semibold">
        Adresse universitaire
      </label>
      <input
        id="dr-mail"
        name="email"
        type="email"
        className="nm-control"
        autoComplete="email"
        placeholder={`prenom.nom@${domains[0] ?? 'universite.fr'}`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby="dr-mail-hint"
        aria-invalid={err?.fieldErrors?.email ? true : undefined}
        required
      />
      <span
        id="dr-mail-hint"
        aria-live="polite"
        className={`text-[13px] ${err?.fieldErrors?.email || hint.tone === 'error' ? 'text-danger' : hint.tone === 'ok' ? 'font-semibold text-success' : 'text-ink-muted'}`}
      >
        {err?.fieldErrors?.email ?? hint.text}
      </span>
      {turnstile.field}
      <Button type="submit" disabled={pending || hint.tone !== 'ok'}>
        {pending ? 'Envoi…' : 'Recevoir un code'}
      </Button>
      <TurnstileNotice />
    </form>
  );
}

const STATUS = {
  PENDING: { label: 'En relecture', cls: 'bg-warning-bg text-warning' },
  PUBLISHED: { label: 'Publiée', cls: 'bg-success-bg text-success' },
  REJECTED: { label: 'Refusée', cls: 'bg-danger-bg text-danger' },
} as const;

/** Step 2 for one review: the reply (one per review), back to moderation after each edit. */
export function ResponseEditor({
  reviewId,
  mine,
  taken,
}: {
  reviewId: string;
  mine: { body: string; status: keyof typeof STATUS; reason: string | null } | null;
  /** Another member of the team already replied. */
  taken: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(mine?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const id = `dr-txt-${reviewId}`;
  if (taken)
    return (
      <p className="m-0 text-[13px] text-ink-muted">
        Une réponse de votre établissement est déjà déposée sous cet avis.
      </p>
    );
  if (sent)
    return (
      <div
        role="status"
        className="flex flex-col gap-2.5 rounded-[18px] bg-lime-100 p-4.5 text-on-lime"
      >
        <span className="font-display text-[20px] font-extrabold">Réponse envoyée</span>
        <span className="text-[14px] leading-[1.5]">
          Elle sera publiée sous l’avis après relecture, en général sous 48 h. L’auteur·rice de
          l’avis est prévenu·e.
        </span>
      </div>
    );
  return (
    <div className="flex flex-col gap-2.5">
      {mine && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className={`rounded-pill px-2.5 py-1 font-bold ${STATUS[mine.status].cls}`}>
            Ma réponse · {STATUS[mine.status].label}
          </span>
          {mine.status === 'REJECTED' && mine.reason && (
            <span className="text-ink-muted">Motif : {mine.reason}</span>
          )}
        </div>
      )}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 cursor-pointer self-start rounded-pill border-2 border-ink bg-transparent px-4 text-[14px] font-bold text-ink"
        >
          {mine ? 'Modifier ma réponse' : 'Répondre à cet avis'}
        </button>
      ) : (
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await submitResponse({ reviewId, body });
              if (r.ok) {
                setSent(true);
                router.refresh();
              } else setError(r.error);
            });
          }}
        >
          <label htmlFor={id} className="text-[14px] font-semibold">
            Votre réponse
          </label>
          <textarea
            id={id}
            className="nm-control"
            rows={6}
            maxLength={RESPONSE_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-describedby={`${id}-count`}
            required
          />
          <span id={`${id}-count`} className="text-right text-[13px] text-ink-muted">
            {body.length.toLocaleString('fr-FR')} / 1 500
          </span>
          <ul className="m-0 pl-4.5 text-[13px] leading-[1.5] text-ink-soft">
            <li>Pas d’attaque contre l’auteur·rice, pas de tentative d’identification.</li>
            <li>Pour demander un retrait, passez par « Signaler un contenu ».</li>
            <li>
              Relue par l’équipe de modération avant publication
              {mine ? ' (une modification repasse en relecture)' : ''}.
            </li>
          </ul>
          {error && (
            <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Envoi…' : 'Envoyer en modération'}
          </Button>
        </form>
      )}
    </div>
  );
}
