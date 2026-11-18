'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { TURNSTILE_MOCK_TOKEN, type TurnstileForm } from '@/lib/turnstile-forms';

/**
 * Cloudflare Turnstile, client side: Managed widget, explicit rendering, appearance
 * `interaction-only` (invisible for most visitors; a challenge shows only when Cloudflare has a
 * doubt). The script is loaded on demand. Mode and site key come from <html data-turnstile-*>
 * (set at runtime by the root layout). In `mock` mode no script is loaded: the token is
 * XXXX.DUMMY.TOKEN.XXXX, or the value of localStorage "nm-turnstile-mock" (tests use "fail").
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    // The CSP allows scripts by nonce: reuse the page's.
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
    if (nonce) s.nonce = nonce;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile script'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

function config() {
  const d = document.documentElement.dataset;
  return { live: d.turnstileMode === 'live', siteKey: d.turnstileSitekey ?? '' };
}

export function useTurnstile(form: TurnstileForm) {
  const tokenRef = useRef<string | null>(null);
  const [token, setTokenState] = useState('');
  const widget = useRef<string | null>(null);
  // State, not a ref: the widget is drawn when its box appears (e.g. at step 3 of a form).
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const waited = useRef(false);
  const setToken = useCallback((t: string | null) => {
    tokenRef.current = t;
    setTokenState(t ?? '');
  }, []);

  useEffect(() => {
    const { live, siteKey } = config();
    if (!live) {
      let t: string = TURNSTILE_MOCK_TOKEN;
      try {
        t = localStorage.getItem('nm-turnstile-mock') || t;
      } catch {
        /* no storage */
      }
      const id = window.setTimeout(() => setToken(t), 0);
      return () => window.clearTimeout(id);
    }
    if (!box) return;
    let cancelled = false;
    // The script is loaded when the form comes into view, not with the page.
    const visible = new Promise<void>((resolve) => {
      if (typeof IntersectionObserver === 'undefined') return resolve();
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          resolve();
        }
      });
      io.observe(box.closest('form') ?? box);
    });
    visible
      .then(() => (cancelled ? undefined : loadScript()))
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widget.current = window.turnstile.render(box, {
          sitekey: siteKey,
          action: form,
          appearance: 'interaction-only',
          language: 'fr',
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [form, box, setToken]);

  /** The token, waiting for it 500ms at most (then whatever there is: the server decides). */
  const getToken = useCallback(async () => {
    for (let i = 0; i < 10 && !tokenRef.current; i++)
      await new Promise((r) => window.setTimeout(r, 50));
    return tokenRef.current ?? '';
  }, []);

  /** Tokens are single-use: ask for a fresh one after a submission (live mode). */
  const reset = useCallback(() => {
    if (widget.current && window.turnstile) {
      setToken(null);
      window.turnstile.reset(widget.current);
    }
  }, [setToken]);

  /**
   * onSubmit of a form posted as FormData: when the token is not there yet, wait for it
   * (500ms at most) and submit again. The send button stays enabled.
   */
  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      if (tokenRef.current || waited.current) {
        waited.current = false;
        return;
      }
      e.preventDefault();
      const f = e.currentTarget;
      waited.current = true;
      void getToken().then(() => f.requestSubmit());
    },
    [getToken],
  );

  /** Hidden field (FormData forms) and the widget box (empty unless a challenge is needed). */
  const field = (
    <>
      <input type="hidden" name="cf-turnstile-response" value={token} />
      <div ref={setBox} className="empty:hidden" />
    </>
  );

  return { token, getToken, reset, onSubmit, field };
}

/** « Protégé contre les robots par Cloudflare Turnstile… », under the send button. */
export function TurnstileNotice({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted',
        className,
      )}
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      Protégé contre les robots par Cloudflare Turnstile, sans case à cocher.{' '}
      <Link href="/legal/confidentialite" className="text-ink-muted">
        Confidentialité
      </Link>
    </span>
  );
}
