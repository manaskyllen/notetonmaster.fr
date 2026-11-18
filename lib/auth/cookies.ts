/**
 * Session cookie options, without any database access: shared by lib/auth/session.ts and
 * proxy.ts (sliding renewal of the student and teaching-team cookies).
 */
import type { SessionOptions } from 'iron-session';

type Kind = 'ADMIN' | 'STUDENT' | 'STAFF';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * - Admin: 30 minutes of inactivity, 8 hours at most, cookie SameSite=Strict.
 * - Student and teaching team: 14 days of inactivity; the cookie lasts 30 days and is renewed
 *   while the site is used (proxy.ts).
 */
export const SESSION_POLICY: Record<
  Kind,
  { idleMs: number; maxMs: number | null; cookieTtlS: number }
> = {
  ADMIN: { idleMs: 30 * MINUTE, maxMs: 8 * HOUR, cookieTtlS: 8 * 3600 },
  STUDENT: { idleMs: 14 * DAY, maxMs: null, cookieTtlS: 30 * 86_400 },
  STAFF: { idleMs: 14 * DAY, maxMs: null, cookieTtlS: 30 * 86_400 },
};

/** Sensitive admin actions need a password + TOTP or a TOTP confirmation this recent. */
export const REAUTH_MS = 5 * MINUTE;

/** An HTTPS APP_URL means a real deployment: development secrets are refused there. */
export function isRealDeployment() {
  return (
    process.env.NODE_ENV === 'production' && (process.env.APP_URL ?? '').startsWith('https://')
  );
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  if (isRealDeployment() && s.startsWith('dev-only'))
    throw new Error('SESSION_SECRET still has its development value');
  return s;
}

/** Secure cookies (and the `__Host-` prefix, which requires them) over HTTPS only. */
const secureCookies = () => (process.env.APP_URL ?? '').startsWith('https://');

/** Name of a cookie: `__Host-nm_admin` over HTTPS, `nm_admin` on a local http address. */
export function cookieName(base: 'nm_admin' | 'nm_student' | 'nm_staff' | 'nm_device') {
  return secureCookies() ? `__Host-${base}` : base;
}

/** Every name a session cookie may have (proxy.ts, cache rules). */
export const SESSION_COOKIE_RE = /^(__Host-)?nm_(admin|student|staff)$/;

function options(
  name: 'nm_admin' | 'nm_student' | 'nm_staff',
  ttl: number,
  sameSite: 'lax' | 'strict',
): SessionOptions {
  return {
    password: secret(),
    cookieName: cookieName(name),
    ttl,
    cookieOptions: { httpOnly: true, sameSite, secure: secureCookies(), path: '/' },
  };
}

export const adminSessionOptions = () =>
  options('nm_admin', SESSION_POLICY.ADMIN.cookieTtlS, 'strict');
export const studentSessionOptions = () =>
  options('nm_student', SESSION_POLICY.STUDENT.cookieTtlS, 'lax');
export const staffSessionOptions = () =>
  options('nm_staff', SESSION_POLICY.STAFF.cookieTtlS, 'lax');
