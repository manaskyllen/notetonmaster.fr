'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  adminSession,
  cookieName,
  markReauthenticated,
  revokeSession,
  startSession,
} from '@/lib/auth/session';
import { newTotpSecret, totpUri, verifyTotpStep } from '@/lib/auth/totp';
import { decrypt, encrypt, hmac, normalizeEmail, randomToken } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { newDeviceMail } from '@/emails/templates';
import { sendMailSafe } from '@/lib/mail/send';
import { turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { MINUTE, rateLimit } from '@/lib/rate-limit';
import { clientIp, logConnection } from '@/lib/request';
import { getCurrentAdmin } from '@/lib/auth/admin';
import { isDemoAddress, isRealProduction } from '@/lib/auth/demo';

const MAX_ATTEMPTS = 5;
/** Progressive lock: 15 minutes, then 1 hour, then 4 hours (lockCount, reset by a login). */
const LOCK_STEPS_MS = [15 * MINUTE, 60 * MINUTE, 240 * MINUTE];
const PENDING_MS = 10 * MINUTE;
const RECOVERY_CODES = 10;

export type LoginState =
  | { step: 'password'; error?: string; email?: string }
  | { step: 'totp'; error?: string }
  | { step: 'setup'; error?: string; secret: string; uri: string }
  | { step: 'recovery'; codes: string[] };

/** One answer for every failure of the password step: it never tells whether an address exists. */
const PASSWORD_FAILED = 'Adresse ou mot de passe incorrect, ou compte temporairement bloqué.';

const lockMessage = (until: Date) =>
  `Compte verrouillé après ${MAX_ATTEMPTS} essais. Réessaie à ${until.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}.`;

/** Records a failed attempt; after 5, locks the account (longer at each lock in a row). */
async function fail(adminId: string): Promise<{ locked: Date | null; left: number }> {
  const a = await prisma.adminUser.update({
    where: { id: adminId },
    data: { failedAttempts: { increment: 1 } },
  });
  await logConnection('ADMIN_LOGIN_FAILED', adminId);
  if (a.failedAttempts < MAX_ATTEMPTS)
    return { locked: null, left: MAX_ATTEMPTS - a.failedAttempts };
  const ms = LOCK_STEPS_MS[Math.min(a.lockCount, LOCK_STEPS_MS.length - 1)]!;
  const until = new Date(Date.now() + ms);
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { lockedUntil: until, failedAttempts: 0, lockCount: { increment: 1 } },
  });
  await audit(
    null,
    'AUTH',
    a.email,
    `Compte verrouillé ${Math.round(ms / MINUTE)} minutes après ${MAX_ATTEMPTS} échecs de connexion`,
    { action: 'a verrouillé le compte', target: { type: 'ADMIN', id: adminId } },
  );
  return { locked: until, left: 0 };
}

/** The attempts count and the lock are shown only at the TOTP step (password already proven). */
async function totpFailure(adminId: string): Promise<string> {
  const f = await fail(adminId);
  if (f.locked) return lockMessage(f.locked);
  return `Code incorrect. ${f.left} essai${f.left > 1 ? 's' : ''} restant${f.left > 1 ? 's' : ''} avant blocage.`;
}

export async function passwordStep(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1).max(200) })
    .safeParse({ email: fd.get('email'), password: fd.get('password') });
  const email = String(fd.get('email') ?? '').slice(0, 254);
  if (!parsed.success) return { step: 'password', error: PASSWORD_FAILED, email };
  const human = await verifyTurnstile('admin-login', turnstileTokenOf(fd));
  if (!human.ok) return { step: 'password', error: human.message, email };
  // The real IP (lib/ip.ts) is limited before any account counter.
  if (!(await rateLimit(`admin-login:${await clientIp()}`, 20, 15 * MINUTE)))
    return {
      step: 'password',
      error: 'Trop de tentatives depuis cette connexion. Réessaie dans 15 minutes.',
      email,
    };
  const admin = await prisma.adminUser.findUnique({
    where: { email: normalizeEmail(parsed.data.email) },
  });
  // Demo accounts (public password and TOTP) never log in on a real deployment.
  const demo = isRealProduction() && isDemoAddress(parsed.data.email);
  if (!admin || admin.removedAt || !admin.passwordHash || demo) {
    await verifyPassword(
      '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000',
      parsed.data.password,
    );
    return { step: 'password', error: PASSWORD_FAILED, email };
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    await verifyPassword(admin.passwordHash, parsed.data.password);
    return { step: 'password', error: PASSWORD_FAILED, email };
  }
  if (!(await verifyPassword(admin.passwordHash, parsed.data.password))) {
    await fail(admin.id);
    return { step: 'password', error: PASSWORD_FAILED, email };
  }

  const session = await adminSession();
  await revokeSession(session.sid);
  session.sid = undefined;
  session.pendingAdminId = admin.id;
  session.pendingSince = Date.now();
  session.adminId = undefined;
  session.totpVerified = false;
  if (!admin.totpSecretEnc || !admin.totpEnabledAt) {
    const secret = newTotpSecret();
    session.setupSecret = encrypt(secret);
    await session.save();
    return { step: 'setup', secret, uri: totpUri(secret, admin.email) };
  }
  await session.save();
  return { step: 'totp' };
}

/** Random device cookie (1 year): a login from a device never seen sends an alert mail. */
async function checkDevice(admin: { id: string; email: string; name: string }) {
  const jar = await cookies();
  const name = cookieName('nm_device');
  let raw = jar.get(name)?.value;
  if (!raw || raw.length > 100) {
    raw = randomToken(24);
    jar.set(name, raw, {
      httpOnly: true,
      secure: name.startsWith('__Host-'),
      sameSite: 'strict',
      path: '/',
      maxAge: 365 * 86_400,
    });
  }
  const deviceHash = hmac(`device:${raw}`);
  const known = await prisma.adminDevice.findUnique({
    where: { adminId_deviceHash: { adminId: admin.id, deviceHash } },
  });
  const h = await import('next/headers').then((m) => m.headers());
  const userAgent = h.get('user-agent')?.slice(0, 300) ?? null;
  if (known) {
    await prisma.adminDevice.update({ where: { id: known.id }, data: { lastSeenAt: new Date() } });
    return;
  }
  await prisma.adminDevice.create({ data: { adminId: admin.id, deviceHash, userAgent } });
  await sendMailSafe(admin.email, newDeviceMail({ name: admin.name, userAgent, at: new Date() }));
}

async function completeLogin(adminId: string) {
  const session = await adminSession();
  await revokeSession(session.sid);
  // A new session identifier at every login (fixation), stored on the server.
  session.sid = await startSession('ADMIN', adminId);
  session.adminId = adminId;
  session.totpVerified = true;
  session.pendingAdminId = undefined;
  session.pendingSince = undefined;
  session.issuedAt = Date.now();
  session.setupSecret = undefined;
  await session.save();
  const a = await prisma.adminUser.update({
    where: { id: adminId },
    data: { lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null, lockCount: 0 },
  });
  await checkDevice(a);
  await logConnection('ADMIN_LOGIN', adminId);
  await audit(
    { id: a.id, name: a.name },
    'AUTH',
    'Compte admin',
    'Connexion réussie avec double authentification',
    { action: 's’est connecté·e', target: { type: 'ADMIN', id: a.id } },
  );
}

async function pendingAdmin() {
  const session = await adminSession();
  if (
    !session.pendingAdminId ||
    !session.pendingSince ||
    Date.now() - session.pendingSince > PENDING_MS
  )
    return null;
  const admin = await prisma.adminUser.findUnique({ where: { id: session.pendingAdminId } });
  if (!admin || admin.removedAt) return null;
  return { admin, session };
}

const RECOVERY_RE = /^[a-z0-9]{4}-?[a-z0-9]{4}$/i;

/**
 * A TOTP code (never a step already used) or a recovery code (single use). Atomic: two
 * parallel requests cannot both use the same step or the same recovery code.
 */
async function checkSecondFactor(
  admin: { id: string; totpSecretEnc: string | null },
  raw: string,
): Promise<boolean> {
  const code = raw.trim();
  if (RECOVERY_RE.test(code)) {
    const norm = code.replace('-', '').toLowerCase();
    const codes = await prisma.adminRecoveryCode.findMany({
      where: { adminId: admin.id, usedAt: null },
    });
    for (const c of codes)
      if (await verifyPassword(c.codeHash, norm)) {
        const used = await prisma.adminRecoveryCode.updateMany({
          where: { id: c.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        return used.count === 1;
      }
    return false;
  }
  if (!admin.totpSecretEnc) return false;
  const step = verifyTotpStep(decrypt(admin.totpSecretEnc), code);
  if (step === null) return false;
  const claimed = await prisma.adminUser.updateMany({
    where: { id: admin.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return claimed.count === 1;
}

export async function totpStep(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const p = await pendingAdmin();
  if (!p) return { step: 'password', error: 'Session expirée, recommence la connexion.' };
  if (p.admin.lockedUntil && p.admin.lockedUntil > new Date())
    return { step: 'password', error: lockMessage(p.admin.lockedUntil) };
  if (!(await checkSecondFactor(p.admin, String(fd.get('code') ?? '').slice(0, 20))))
    return { step: 'totp', error: await totpFailure(p.admin.id) };
  await completeLogin(p.admin.id);
  redirect('/admin');
}

/** 10 recovery codes « abcd-efgh », shown once; only their argon2id hashes are kept. */
async function newRecoveryCodes(adminId: string): Promise<string[]> {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const codes = Array.from({ length: RECOVERY_CODES }, () => {
    const bytes = Buffer.from(randomToken(16), 'base64url');
    const s = [...bytes.subarray(0, 8)].map((b) => alphabet[b % alphabet.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  const hashes = await Promise.all(codes.map((c) => hashPassword(c.replace('-', ''))));
  await prisma.$transaction([
    prisma.adminRecoveryCode.deleteMany({ where: { adminId } }),
    prisma.adminRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({ adminId, codeHash })),
    }),
  ]);
  return codes;
}

export async function setupStep(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const p = await pendingAdmin();
  const enc = p?.session.setupSecret;
  if (!p || !enc) return { step: 'password', error: 'Session expirée, recommence la connexion.' };
  const secret = decrypt(enc);
  const step = verifyTotpStep(secret, String(fd.get('code') ?? ''));
  if (step === null)
    return {
      step: 'setup',
      secret,
      uri: totpUri(secret, p.admin.email),
      error: 'Code incorrect. Vérifie l’heure de ton téléphone et réessaie.',
    };
  await prisma.adminUser.update({
    where: { id: p.admin.id },
    data: { totpSecretEnc: encrypt(secret), totpEnabledAt: new Date(), totpLastStep: step },
  });
  await audit(
    { id: p.admin.id, name: p.admin.name },
    'AUTH',
    p.admin.email,
    'Double authentification activée',
    { action: 'a activé la double authentification', target: { type: 'ADMIN', id: p.admin.id } },
  );
  const codes = await newRecoveryCodes(p.admin.id);
  await completeLogin(p.admin.id);
  return { step: 'recovery', codes };
}

/** Single entry point for the login form: dispatches on the hidden "step" field. */
export async function loginAction(prev: LoginState, fd: FormData): Promise<LoginState> {
  const step = fd.get('step');
  if (step === 'totp') return totpStep(prev, fd);
  if (step === 'setup') return setupStep(prev, fd);
  return passwordStep(prev, fd);
}

/**
 * « Confirme ton code » before a sensitive action (components/admin/Reauth.tsx): a TOTP code or
 * a recovery code renews the confirmation of the session for 5 minutes.
 */
export async function confirmIdentity(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: 'Session expirée : reconnecte-toi.' };
  const row = await prisma.adminUser.findUnique({
    where: { id: admin.id },
    select: { id: true, totpSecretEnc: true, lockedUntil: true },
  });
  if (!row || (row.lockedUntil && row.lockedUntil > new Date()))
    return { ok: false, error: 'Compte temporairement bloqué : réessaie plus tard.' };
  if (!(await checkSecondFactor(row, String(code ?? '').slice(0, 20))))
    return { ok: false, error: await totpFailure(row.id) };
  await prisma.adminUser.update({ where: { id: row.id }, data: { failedAttempts: 0 } });
  await markReauthenticated((await adminSession()).sid);
  return { ok: true };
}

export async function adminLogout() {
  const session = await adminSession();
  await revokeSession(session.sid);
  session.destroy();
  redirect('/admin/login');
}
