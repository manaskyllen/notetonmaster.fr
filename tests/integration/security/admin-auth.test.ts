/**
 * Admin authentication: server-side sessions (revoked at logout, 30 min of inactivity, 8 h at
 * most), cookie attributes, re-authentication for sensitive actions, new-device alert, TOTP
 * replay, recovery codes, progressive lock, no enumeration of admin addresses.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request, run } = await import('../helpers/request');
const { mailbox } = await import('../helpers/mailbox');
const { prisma } = await import('@/lib/db');
const { encrypt } = await import('@/lib/crypto');
const { hashPassword } = await import('@/lib/auth/password');
const { newTotpSecret, totpCode } = await import('@/lib/auth/totp');
const { getCurrentAdmin } = await import('@/lib/auth/admin');
const { loginAction, adminLogout, confirmIdentity } = await import('@/app/admin/login/actions');
const { changeRole } = await import('@/app/admin/(panel)/equipe/actions');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');
const { generateSync } = await import('otplib');
/** A long test-only session secret, built at run time (never a real value). */
const FAKE_SECRET = `test-only-${'s'.repeat(40)}`;

const tag = `sec-admin-${Date.now()}`;
const PASSWORD = 'correct horse battery staple 42';
const ids: string[] = [];

async function makeAdmin(name: string, withTotp = true) {
  const secret = newTotpSecret();
  const a = await prisma.adminUser.create({
    data: {
      email: `${tag}-${name}@example.org`,
      name,
      role: 'ADMIN',
      passwordHash: await hashPassword(PASSWORD),
      totpSecretEnc: withTotp ? encrypt(secret) : null,
      totpEnabledAt: withTotp ? new Date() : null,
    },
  });
  ids.push(a.id);
  return { ...a, secret };
}

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

const passwordStep = (email: string, password = PASSWORD) =>
  loginAction(
    { step: 'password' },
    fd({ step: 'password', email, password, 'cf-turnstile-response': TURNSTILE_MOCK_TOKEN }),
  );
const totpStep = (code: string) =>
  run(() => loginAction({ step: 'totp' }, fd({ step: 'totp', code })));

async function login(a: { email: string; secret: string }, code = totpCode(a.secret)) {
  const s = await passwordStep(a.email);
  expect(s.step).toBe('totp');
  return totpStep(code);
}

/** The code of the next 30 s window is still accepted (clock drift): a fresh code for a 2nd use. */
const nextCode = (secret: string) =>
  generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 });

beforeAll(() => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
});
beforeEach(() => request.reset());

afterAll(async () => {
  await prisma.authSession?.deleteMany({ where: { subjectId: { in: ids } } }).catch(() => {});
  await prisma.adminUser.updateMany({
    where: { id: { in: ids } },
    data: { removedAt: new Date() },
  });
});

describe('admin session on the server', () => {
  it('logout revokes the session: a copy of the cookie no longer works', async () => {
    const a = await makeAdmin('logout');
    expect(await login(a)).toEqual({ redirect: '/admin' });
    const stolen = request.snapshot();
    expect((await getCurrentAdmin())?.id).toBe(a.id);
    await run(() => adminLogout());
    request.restore(stolen);
    expect(await getCurrentAdmin()).toBeNull();
  });

  it('expires after 30 minutes without activity', async () => {
    const a = await makeAdmin('idle');
    await login(a);
    await prisma.authSession.updateMany({
      where: { subjectId: a.id },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect(await getCurrentAdmin()).toBeNull();
  });

  it('expires after 8 hours whatever the activity', async () => {
    const a = await makeAdmin('max');
    await login(a);
    await prisma.authSession.updateMany({
      where: { subjectId: a.id },
      data: { createdAt: new Date(Date.now() - 8 * 3600_000 - 60_000), lastSeenAt: new Date() },
    });
    expect(await getCurrentAdmin()).toBeNull();
  });

  it('a new session identifier at each login', async () => {
    const a = await makeAdmin('regen');
    await login(a);
    const first = await prisma.authSession.findMany({ where: { subjectId: a.id } });
    await run(() => adminLogout());
    await login(a, nextCode(a.secret));
    const all = await prisma.authSession.findMany({ where: { subjectId: a.id } });
    expect(all).toHaveLength(2);
    expect(all.filter((s) => !s.revokedAt).map((s) => s.id)).not.toContain(first[0]!.id);
  });
});

describe('cookies', () => {
  it('in production over https: __Host- prefix, HttpOnly, Secure, SameSite=Strict for the admin', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'production',
      APP_URL: 'https://notetonmaster.fr',
      SESSION_SECRET: FAKE_SECRET,
    });
    try {
      const { adminSession, studentSession } = await import('@/lib/auth/session');
      const s = await adminSession();
      s.pendingSince = Date.now();
      await s.save();
      const c = request.cookie('__Host-nm_admin');
      expect(c?.options).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
      });
      expect(c?.options?.domain).toBeUndefined();
      const st = await studentSession();
      st.issuedAt = Date.now();
      await st.save();
      expect(request.cookie('__Host-nm_student')?.options).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      });
    } finally {
      process.env = saved;
    }
  });
});

describe('re-authentication for sensitive actions', () => {
  it('changing a role more than 5 minutes after the last code asks for the code again', async () => {
    const a = await makeAdmin('reauth');
    const other = await makeAdmin('target');
    await login(a);
    await prisma.authSession.updateMany({
      where: { subjectId: a.id, revokedAt: null },
      data: { reauthAt: new Date(Date.now() - 10 * 60_000) },
    });
    const refused = await changeRole(other.id, 'MODERATOR');
    expect(refused).toMatchObject({ ok: false, reauth: true });
    expect((await prisma.adminUser.findUnique({ where: { id: other.id } }))?.role).toBe('ADMIN');
    expect(await confirmIdentity(nextCode(a.secret))).toMatchObject({ ok: true });
    expect(await changeRole(other.id, 'MODERATOR')).toMatchObject({ ok: true });
  });
});

describe('new device', () => {
  it('a login from an unknown device sends an alert to the admin, not from a known one', async () => {
    const a = await makeAdmin('device');
    const before = mailbox.length;
    await login(a);
    const alerts = mailbox.slice(before).filter((m) => m.to === a.email);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.subject).toMatch(/connexion/i);
    await run(() => adminLogout());
    await login(a, nextCode(a.secret));
    expect(mailbox.slice(before).filter((m) => m.to === a.email)).toHaveLength(1);
  });
});

describe('TOTP', () => {
  it('a code already used cannot be used again', async () => {
    const a = await makeAdmin('replay');
    const code = totpCode(a.secret);
    expect(await login(a, code)).toEqual({ redirect: '/admin' });
    await run(() => adminLogout());
    expect(await login(a, code)).toMatchObject({ step: 'totp', error: expect.any(String) });
  });

  it('setting up TOTP gives 10 recovery codes, each usable once, stored hashed', async () => {
    const a = await makeAdmin('recovery', false);
    const s = await passwordStep(a.email);
    expect(s.step).toBe('setup');
    const secret = (s as { secret: string }).secret;
    const done = await run(() => loginAction(s, fd({ step: 'setup', code: totpCode(secret) })));
    expect(done).toMatchObject({ step: 'recovery' });
    const codes = (done as { codes: string[] }).codes;
    expect(codes).toHaveLength(10);
    const stored = await prisma.adminRecoveryCode.findMany({ where: { adminId: a.id } });
    expect(stored).toHaveLength(10);
    for (const c of stored) expect(codes).not.toContain(c.codeHash);
    await run(() => adminLogout());
    request.reset();
    expect(await (async () => (await passwordStep(a.email), totpStep(codes[0]!)))()).toEqual({
      redirect: '/admin',
    });
    await run(() => adminLogout());
    request.reset();
    await passwordStep(a.email);
    expect(await totpStep(codes[0]!)).toMatchObject({ step: 'totp', error: expect.any(String) });
  });

  it('the lock grows: 15 minutes, then 1 hour', async () => {
    const a = await makeAdmin('lock');
    await passwordStep(a.email);
    for (let i = 0; i < 5; i++) await totpStep('000000');
    const first = (await prisma.adminUser.findUnique({ where: { id: a.id } }))!.lockedUntil!;
    expect(first.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(first.getTime() - Date.now()).toBeLessThan(16 * 60_000);
    await prisma.adminUser.update({
      where: { id: a.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    request.reset();
    await passwordStep(a.email);
    for (let i = 0; i < 5; i++) await totpStep('000000');
    const second = (await prisma.adminUser.findUnique({ where: { id: a.id } }))!.lockedUntil!;
    expect(second.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
  });
});

describe('admin addresses', () => {
  it('a wrong password gives the same answer for an existing and an unknown address', async () => {
    const a = await makeAdmin('enum');
    const known = await passwordStep(a.email, 'wrong password');
    request.reset();
    const unknown = await passwordStep(`${tag}-nobody@example.org`, 'wrong password');
    expect({ ...known, email: '' }).toEqual({ ...unknown, email: '' });
  });
});
