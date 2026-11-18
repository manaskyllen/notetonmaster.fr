import 'server-only';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { clientIp } from '@/lib/request';
import { isInsecureLocalProd } from '@/lib/env';
import { getSetting } from '@/lib/settings';
import { TURNSTILE_MOCK_TOKEN, type TurnstileForm } from '@/lib/turnstile-forms';

/**
 * Cloudflare Turnstile, server side. Every protected Server Action calls
 * `verifyTurnstile` before any write. Modes (TURNSTILE_MODE):
 * - `mock` (dev, tests, CI): accepts XXXX.DUMMY.TOKEN.XXXX, refuses anything else ("fail"),
 *   no network call;
 * - `live` (prod): POST siteverify with the secret; checks success, action (the form) and
 *   hostname. A network error refuses the submission (never a send without verification).
 * Each verification is logged in TurnstileLog (form, outcome, error codes; no IP).
 */

/** Official Cloudflare test secret keys: they answer with a fixed hostname, so the hostname check is
 *  skipped for them only. */
const TEST_SECRETS = new Set([
  '1x0000000000000000000000000000000AA', // always passes
  '2x0000000000000000000000000000000AA', // always fails
  '3x0000000000000000000000000000000AA', // "token already spent"
]);

export const TURNSTILE_ERROR = 'La vérification anti-robot a échoué. Recharge la page et réessaie.';

export type TurnstileCheck = { ok: true } | { ok: false; message: string };

/**
 * `mock` only when asked, and never in a real production deployment: there, a missing or wrong
 * TURNSTILE_MODE means `live` (fails closed: without keys every submission is refused).
 */
export function turnstileMode(): 'mock' | 'live' {
  if (process.env.TURNSTILE_MODE === 'live') return 'live';
  if (process.env.NODE_ENV === 'production' && !isInsecureLocalProd()) return 'live';
  return 'mock';
}

async function log(form: TurnstileForm, outcome: 'OK' | 'FAIL' | 'ERROR', errorCodes: string[]) {
  await prisma.turnstileLog.create({ data: { form, outcome, errorCodes } }).catch(() => {});
}

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
  action?: string;
  hostname?: string;
}

export async function verifyTurnstile(
  form: TurnstileForm,
  token: unknown,
): Promise<TurnstileCheck> {
  const enabled = (await getSetting('turnstile.forms'))[form];
  if (enabled === false) return { ok: true };
  const fail = async (outcome: 'FAIL' | 'ERROR', codes: string[]): Promise<TurnstileCheck> => {
    await log(form, outcome, codes);
    return { ok: false, message: TURNSTILE_ERROR };
  };
  if (typeof token !== 'string' || token === '') return fail('FAIL', ['missing-input-response']);

  if (turnstileMode() === 'mock') {
    if (token !== TURNSTILE_MOCK_TOKEN) return fail('FAIL', ['invalid-input-response']);
    await log(form, 'OK', []);
    return { ok: true };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return fail('ERROR', ['missing-input-secret']);
  let data: SiteverifyResponse;
  try {
    const body: Record<string, string> = {
      secret,
      response: token,
      idempotency_key: randomUUID(),
    };
    if (process.env.TRUST_CLOUDFLARE === 'true') {
      const ip = await clientIp();
      if (ip !== 'unknown') body.remoteip = ip;
    }
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    data = (await res.json()) as SiteverifyResponse;
  } catch {
    return fail('ERROR', ['network-error']);
  }
  if (!data.success) return fail('FAIL', data['error-codes'] ?? ['unknown']);
  if (data.action !== form) return fail('FAIL', ['action-mismatch']);
  // Cloudflare's test secrets answer with a fixed hostname: no hostname check for them.
  const expected = new URL(process.env.APP_URL ?? 'http://localhost').hostname;
  if (!TEST_SECRETS.has(secret) && data.hostname !== expected)
    return fail('FAIL', ['hostname-mismatch']);
  await log(form, 'OK', []);
  return { ok: true };
}

/** Token sent by a client form: the `cf-turnstile-response` field (FormData) or `turnstileToken`. */
export function turnstileTokenOf(input: unknown): unknown {
  if (input instanceof FormData) return input.get('cf-turnstile-response');
  if (input && typeof input === 'object') return (input as Record<string, unknown>).turnstileToken;
  return undefined;
}
