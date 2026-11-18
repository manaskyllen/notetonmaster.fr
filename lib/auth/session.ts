import 'server-only';
import { createHash } from 'node:crypto';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { randomToken } from '@/lib/crypto';
import type { SessionKind } from '@/lib/db/generated/enums';
import {
  REAUTH_MS,
  SESSION_POLICY,
  adminSessionOptions,
  staffSessionOptions,
  studentSessionOptions,
} from './cookies';

/**
 * Sessions: a cookie sealed by iron-session carries a random session identifier (`sid`), and
 * the session itself lives in the database (AuthSession, only the SHA-256 of `sid`). Logout
 * revokes the row, so a copied cookie stops working at once; inactivity and maximum age are
 * checked on the server at every request.
 *
 * - Admin: 30 minutes of inactivity, 8 hours at most, cookie SameSite=Strict.
 * - Student and teaching team: 14 days of inactivity; the cookie lasts 30 days and is renewed
 *   while the site is used (proxy.ts), so an active session never ends by itself.
 * - Over HTTPS the cookies are named `__Host-…` (Secure, Path=/, no Domain).
 */

export interface StudentSession {
  sid?: string;
  studentId?: string;
  issuedAt?: number;
  /** Last renewal of the cookie (proxy.ts, sliding 30 days). */
  refreshedAt?: number;
}

export interface AdminSession {
  sid?: string;
  adminId?: string;
  /** Password checked, waiting for the TOTP step. */
  pendingAdminId?: string;
  pendingSince?: number;
  totpVerified?: boolean;
  /** Encrypted TOTP secret being set up (first login). */
  setupSecret?: string;
  issuedAt?: number;
}

/** Teaching team member (droit de réponse): verified responder, or a code pending. */
export interface StaffSession {
  sid?: string;
  responderId?: string;
  pendingResponderId?: string;
  issuedAt?: number;
  refreshedAt?: number;
}

export {
  REAUTH_MS,
  SESSION_POLICY,
  SESSION_COOKIE_RE,
  cookieName,
  isRealDeployment,
  staffSessionOptions,
  studentSessionOptions,
} from './cookies';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export async function studentSession() {
  return getIronSession<StudentSession>(await cookies(), studentSessionOptions());
}

export async function adminSession() {
  return getIronSession<AdminSession>(await cookies(), adminSessionOptions());
}

export async function staffSession() {
  return getIronSession<StaffSession>(await cookies(), staffSessionOptions());
}

// ───────────── server-side session rows ─────────────

const sidHash = (sid: string) => createHash('sha256').update(sid).digest('hex');

/** Opens a new session (a new identifier at every login) and returns the raw identifier. */
export async function startSession(kind: SessionKind, subjectId: string): Promise<string> {
  const sid = randomToken(32);
  await prisma.authSession.create({
    data: {
      id: sidHash(sid),
      kind,
      subjectId,
      reauthAt: kind === 'ADMIN' ? new Date() : null,
    },
  });
  return sid;
}

/**
 * The live session row of `sid` for this subject, or null when it is unknown, revoked, idle
 * too long or too old. Records the activity (at most once a minute).
 */
export async function validateSession(
  kind: SessionKind,
  sid: string | undefined,
  subjectId: string,
) {
  if (!sid || sid.length > 100) return null;
  const row = await prisma.authSession.findUnique({ where: { id: sidHash(sid) } });
  const now = Date.now();
  const p = SESSION_POLICY[kind];
  if (
    !row ||
    row.kind !== kind ||
    row.subjectId !== subjectId ||
    row.revokedAt ||
    now - row.lastSeenAt.getTime() > p.idleMs ||
    (p.maxMs !== null && now - row.createdAt.getTime() > p.maxMs)
  )
    return null;
  if (now - row.lastSeenAt.getTime() > MINUTE)
    await prisma.authSession
      .update({ where: { id: row.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => {});
  return row;
}

export async function revokeSession(sid: string | undefined) {
  if (!sid) return;
  await prisma.authSession.updateMany({
    where: { id: sidHash(sid), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Every session of a subject (account deleted, admin removed, role changed…). */
export async function revokeAllSessions(kind: SessionKind, subjectId: string) {
  await prisma.authSession.updateMany({
    where: { kind, subjectId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** True when the admin session confirmed the password + TOTP or a TOTP code recently. */
export async function recentlyAuthenticated(sid: string | undefined, withinMs = REAUTH_MS) {
  if (!sid) return false;
  const row = await prisma.authSession.findUnique({ where: { id: sidHash(sid) } });
  return !!row?.reauthAt && Date.now() - row.reauthAt.getTime() <= withinMs;
}

export async function markReauthenticated(sid: string | undefined) {
  if (!sid) return;
  await prisma.authSession.updateMany({
    where: { id: sidHash(sid), revokedAt: null },
    data: { reauthAt: new Date() },
  });
}

/** Purge (worker): rows ended for more than 30 days. */
export async function purgeSessions(now = new Date()) {
  const r = await prisma.authSession.deleteMany({
    where: {
      OR: [
        { revokedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
        { lastSeenAt: { lt: new Date(now.getTime() - 30 * DAY) } },
      ],
    },
  });
  return r.count;
}
