'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { TurnstileNotice, useTurnstile } from '@/components/ui/Turnstile';
import { RESEND_AFTER_S } from '@/lib/auth/login-code';
import type { TurnstileForm } from '@/lib/turnstile-forms';

/**
 * « Saisis le code reçu par mail » (login, review without account, change of address): six
 * boxes, then « Renvoyer un code » (after 30 seconds, Turnstile, capped per hour by the server)
 * and « Changer d'adresse ». The link of the same mail stays a fallback.
 */
export function CodeEntry({
  email,
  verify,
  resend,
  onChangeEmail,
  turnstileForm,
  submitLabel = 'Valider',
  changeLabel = 'Changer d’adresse',
  compact,
}: {
  email: string;
  /** Resolves with an error, or redirects / reports success itself. */
  verify: (code: string) => Promise<{ error: string } | void>;
  /** Sends a new code; resolves with an error message, or null when sent. */
  resend: (turnstileToken: string | undefined) => Promise<string | null>;
  onChangeEmail?: () => void;
  turnstileForm: TurnstileForm;
  submitLabel?: string;
  changeLabel?: string;
  /** Inside a card (Mon espace, « Merci » screen): no oversized boxes. */
  compact?: boolean;
}) {
  const labelId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [wait, setWait] = useState(RESEND_AFTER_S);
  const [checking, startCheck] = useTransition();
  const [sending, startSend] = useTransition();
  const turnstile = useTurnstile(turnstileForm);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const check = (value: string) => {
    if (value.length !== 6 || checking) return;
    setError(null);
    setInfo(null);
    startCheck(async () => {
      const r = await verify(value);
      if (r && 'error' in r) {
        setError(r.error);
        // Empty boxes for the next try.
        setRound((n) => n + 1);
        setCode('');
      }
    });
  };

  return (
    <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-4'}>
      <span id={labelId} className="text-[15px] font-semibold">
        Code à 6 chiffres envoyé à <strong className="break-all">{email}</strong>
      </span>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          check(code);
        }}
      >
        <CodeInput
          key={round}
          labelId={labelId}
          autoFocus
          invalid={!!error}
          disabled={checking}
          onChange={setCode}
          onComplete={check}
        />
        <p
          role={error ? 'alert' : 'status'}
          aria-live="polite"
          className={`m-0 min-h-5 text-[14px] font-semibold ${error ? 'text-danger' : 'text-ink-muted'}`}
        >
          {error ??
            info ??
            (checking ? 'Vérification…' : 'Valable 10 minutes. Pense à regarder les spams.')}
        </p>
        <Button type="submit" size="form" disabled={checking || code.length !== 6}>
          {checking ? 'Vérification…' : submitLabel}
        </Button>
      </form>
      {turnstile.field}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          disabled={wait > 0 || sending}
          onClick={() =>
            startSend(async () => {
              setError(null);
              const msg = await resend(await turnstile.getToken());
              turnstile.reset();
              if (msg) setError(msg);
              else {
                setInfo('Nouveau code envoyé. L’ancien ne marche plus.');
                setRound((n) => n + 1);
                setCode('');
                setWait(RESEND_AFTER_S);
              }
            })
          }
          className="min-h-tap cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold text-ink underline disabled:cursor-default disabled:text-ink-muted disabled:no-underline"
        >
          {sending ? 'Envoi…' : wait > 0 ? `Renvoyer un code (dans ${wait} s)` : 'Renvoyer un code'}
        </button>
        {onChangeEmail && (
          <button
            type="button"
            onClick={onChangeEmail}
            className="min-h-tap cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold text-ink underline"
          >
            {changeLabel}
          </button>
        )}
      </div>
      {!compact && <TurnstileNotice />}
    </div>
  );
}
