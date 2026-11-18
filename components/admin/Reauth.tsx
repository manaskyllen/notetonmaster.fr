'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { TextField } from '@/components/ui/TextField';
import { Modal } from '@/components/ui/Modal';
import { confirmIdentity } from '@/app/admin/login/actions';

/**
 * Re-authentication before a sensitive action (roles, open cities, exports, removals, legal
 * requests). The server refuses with `{ reauth: true }` when the last code is more than 5 minutes
 * old (lib/auth/admin.ts, guardSensitive); `withReauth` then asks for the code and runs the
 * action again once it is confirmed.
 */
type Run = <T>(fn: () => Promise<T>) => Promise<T>;

const Ctx = createContext<Run>((fn) => fn());

export const useReauth = () => useContext(Ctx);

const needsReauth = (r: unknown) =>
  !!r && typeof r === 'object' && (r as { reauth?: unknown }).reauth === true;

export function ReauthProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const settle = useRef<((ok: boolean) => void) | null>(null);

  const run = useCallback<Run>(async (fn) => {
    const first = await fn();
    if (!needsReauth(first)) return first;
    setError(null);
    setCode('');
    setOpen(true);
    const ok = await new Promise<boolean>((resolve) => (settle.current = resolve));
    return ok ? fn() : first;
  }, []);

  const close = (ok: boolean) => {
    setOpen(false);
    settle.current?.(ok);
    settle.current = null;
  };

  const submit = async (value: string) => {
    if (!value) return;
    setPending(true);
    const r = await confirmIdentity(value);
    setPending(false);
    if (r.ok) close(true);
    else setError(r.error);
  };

  return (
    <Ctx.Provider value={run}>
      {children}
      <Modal open={open} onClose={() => close(false)} labelledBy="reauth-title">
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
        >
          <h2 id="reauth-title" className="m-0 font-display text-[22px] font-extrabold">
            Confirme ton code
          </h2>
          <p className="m-0 text-[15px] leading-[1.5] text-ink-muted">
            Cette action est sensible : saisis le code de ton application d’authentification
            {recovery ? ', ou un code de secours' : ''}.
          </p>
          {error && (
            <p
              role="alert"
              className="m-0 rounded-[12px] bg-danger-bg px-3.5 py-2.5 text-[14px] font-semibold text-danger"
            >
              {error}
            </p>
          )}
          {recovery ? (
            <TextField
              name="code"
              label="Code de secours"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          ) : (
            <>
              <span id="reauth-label" className="nm-label">
                Code
              </span>
              <CodeInput
                labelId="reauth-label"
                autoFocus
                invalid={!!error}
                disabled={pending}
                onChange={setCode}
                onComplete={(c) => void submit(c)}
              />
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? 'Vérification…' : 'Confirmer'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Annuler
            </Button>
            <button
              type="button"
              className="text-[13px] font-semibold underline"
              onClick={() => {
                setRecovery((r) => !r);
                setCode('');
              }}
            >
              {recovery ? 'Code de l’application' : 'Code de secours'}
            </button>
          </div>
        </form>
      </Modal>
    </Ctx.Provider>
  );
}
