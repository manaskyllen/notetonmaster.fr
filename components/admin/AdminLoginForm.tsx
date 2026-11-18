'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button, CodeInput, Logo, Notice, TextField, useTurnstile } from '@/components/ui';
import { buttonClasses } from '@/components/ui/Button';
import { loginAction, type LoginState } from '@/app/admin/login/actions';

function ErrorLine({ text }: { text?: string }) {
  return text ? (
    <p
      role="alert"
      className="m-0 rounded-[12px] bg-danger-bg px-3.5 py-2.5 text-[14px] font-semibold text-danger"
    >
      {text}
    </p>
  ) : null;
}

export function AdminLoginForm({ activated }: { activated?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, { step: 'password' } as LoginState);
  const [recovery, setRecovery] = useState(false);
  // Turnstile on the password step; a fresh token after each answer.
  const turnstile = useTurnstile('admin-login');
  const form = useRef<HTMLFormElement>(null);
  const { reset } = turnstile;
  useEffect(() => {
    if ('error' in state && state.error) reset();
  }, [state, reset]);
  return (
    <section className="relative box-border flex w-full max-w-[440px] flex-col gap-5 rounded-xl bg-surface-0 p-8.5 text-ink max-sm:p-6">
      <Logo size="m" />
      <form
        ref={form}
        action={action}
        onSubmit={state.step === 'password' ? turnstile.onSubmit : undefined}
        className="flex flex-col gap-4"
        noValidate
        key={state.step}
      >
        <input type="hidden" name="step" value={state.step} />
        {state.step === 'password' && (
          <>
            <h1 className="m-0 font-display text-[30px] font-extrabold tracking-[-0.03em]">
              Connexion
            </h1>
            {activated && !('error' in state && state.error) && (
              <Notice tone="success">
                Compte activé : connecte-toi pour configurer la double authentification.
              </Notice>
            )}
            <ErrorLine text={state.error} />
            <TextField
              name="email"
              type="email"
              label="Adresse mail"
              autoComplete="username"
              required
              defaultValue={state.email}
            />
            <TextField
              name="password"
              type="password"
              label="Mot de passe"
              autoComplete="current-password"
              required
            />
            {turnstile.field}
            <Button type="submit" size="form" disabled={pending}>
              {pending ? 'Vérification…' : 'Continuer'}
            </Button>
          </>
        )}
        {state.step === 'totp' && (
          <>
            <h1 className="m-0 font-display text-[30px] font-extrabold tracking-[-0.03em]">
              Double authentification
            </h1>
            <p className="m-0 text-[15px] leading-[1.5] text-ink-muted">
              {recovery
                ? 'Saisis un de tes codes de secours. Chaque code ne sert qu’une fois.'
                : 'Saisis le code à 6 chiffres affiché dans ton application d’authentification.'}
            </p>
            <ErrorLine text={state.error} />
            {recovery ? (
              <TextField
                name="code"
                label="Code de secours"
                autoComplete="one-time-code"
                placeholder="abcd-efgh"
                required
              />
            ) : (
              <TotpCode invalid={!!state.error} disabled={pending} form={form} />
            )}
            <Button type="submit" size="form" disabled={pending}>
              {pending ? 'Vérification…' : 'Se connecter'}
            </Button>
            <button
              type="button"
              className="self-start text-[13px] font-semibold underline"
              onClick={() => setRecovery((r) => !r)}
            >
              {recovery
                ? 'Utiliser l’application d’authentification'
                : 'Utiliser un code de secours'}
            </button>
          </>
        )}
        {state.step === 'recovery' && (
          <>
            <h1 className="m-0 font-display text-[30px] font-extrabold tracking-[-0.03em]">
              Tes codes de secours
            </h1>
            <p className="m-0 text-[15px] leading-[1.5]">
              Si tu perds ton téléphone, chacun de ces codes remplace une fois le code de
              l’application. Range-les dans ton gestionnaire de mots de passe : ils ne seront plus
              jamais affichés.
            </p>
            <ul className="m-0 grid list-none grid-cols-2 gap-2 rounded-md bg-surface-100 p-3.5 font-mono text-[15px]">
              {state.codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <a href="/admin" className={buttonClasses('primary', 'form')}>
              J’ai rangé mes codes, continuer
            </a>
          </>
        )}
        {state.step === 'setup' && (
          <>
            <h1 className="m-0 font-display text-[30px] font-extrabold tracking-[-0.03em]">
              Active la double authentification
            </h1>
            <p className="m-0 text-[15px] leading-[1.5]">
              Ajoute ce compte dans ton application d’authentification (saisie manuelle de la clé),
              puis saisis le code à 6 chiffres affiché.
            </p>
            <div className="flex flex-col gap-1 rounded-md bg-surface-100 p-3.5">
              <span className="text-[12px] font-bold text-ink-muted uppercase">Clé secrète</span>
              <code className="font-mono text-[15px] font-medium tracking-[0.08em] break-all">
                {state.secret.replace(/(.{4})/g, '$1 ').trim()}
              </code>
              <a href={state.uri} className="text-[13px] font-semibold">
                Ouvrir dans l’application (sur mobile)
              </a>
            </div>
            <ErrorLine text={state.error} />
            <TotpCode invalid={!!state.error} disabled={pending} form={form} />
            <Button type="submit" size="form" disabled={pending}>
              {pending ? 'Vérification…' : 'Activer'}
            </Button>
          </>
        )}
      </form>
      <span className="border-t border-border pt-3.5 text-[12px] leading-[1.5] whitespace-nowrap text-ink-muted">
        Protégé contre les robots par Cloudflare Turnstile.
      </span>
    </section>
  );
}

/**
 * The 6-digit TOTP code in six boxes, as on the student login: pasting or the code suggested by
 * the phone fills them, the sixth digit sends the form. The value travels in a hidden `code`.
 */
function TotpCode({
  invalid,
  disabled,
  form,
}: {
  invalid: boolean;
  disabled: boolean;
  form: React.RefObject<HTMLFormElement | null>;
}) {
  const [code, setCode] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <span id="totp-label" className="nm-label">
        Code
      </span>
      <CodeInput
        labelId="totp-label"
        autoFocus
        invalid={invalid}
        disabled={disabled}
        onChange={setCode}
        onComplete={(c) => {
          setCode(c);
          requestAnimationFrame(() => form.current?.requestSubmit());
        }}
      />
      <input type="hidden" name="code" value={code} />
    </div>
  );
}
