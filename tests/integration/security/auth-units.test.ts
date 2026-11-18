/**
 * Building blocks of authentication: single-use tokens and codes, TOTP, invitations, the guard
 * of admin pages, the origin check, the environment check.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request, run } = await import('../helpers/request');
const { adminAs, cleanupActors } = await import('../helpers/actors');
const { prisma } = await import('@/lib/db');
const { hashToken } = await import('@/lib/crypto');
const ml = await import('@/lib/auth/magic-link');
const totp = await import('@/lib/auth/totp');
const { hashPassword, verifyPassword } = await import('@/lib/auth/password');
const { findInvitation } = await import('@/lib/auth/invitation');
const { acceptInvitation } = await import('@/app/admin/invitation/[token]/actions');
const { requireAdmin, requireRole, ForbiddenError } = await import('@/lib/auth/admin');
const { isAllowedOrigin } = await import('@/lib/security/origin');
const { assertEnv, isInsecureLocalProd } = await import('@/lib/env');

const emailHash = `test-ml-${Date.now()}`;
const invited: string[] = [];

afterAll(async () => {
  await prisma.magicLinkToken.deleteMany({ where: { emailHash } });
  await prisma.adminUser.updateMany({
    where: { id: { in: invited } },
    data: { removedAt: new Date() },
  });
  await cleanupActors();
});

describe('single-use tokens', () => {
  it('peek does not consume, consume works once, expired and wrong purpose refused', async () => {
    const t = await ml.createToken({ emailHash, purpose: 'REPLY', ttlMs: 60_000 });
    expect(await ml.peekToken(t, 'REPLY')).not.toBeNull();
    expect(await ml.peekToken(t, 'LOGIN')).toBeNull();
    expect(await ml.consumeToken(t, 'REPLY')).not.toBeNull();
    expect(await ml.consumeToken(t, 'REPLY')).toBeNull();
    expect(await ml.peekToken(t, 'REPLY')).toBeNull();
    const old = await ml.createToken({ emailHash, purpose: 'REPLY', ttlMs: -1 });
    expect(await ml.consumeToken(old, 'REPLY')).toBeNull();
    expect(await ml.consumeToken('', 'REPLY')).toBeNull();
    expect(await ml.peekToken('x'.repeat(300), 'REPLY')).toBeNull();
  });

  it('a new link revokes the previous one of the same kind', async () => {
    const a = await ml.createLinkAndCode({ emailHash, purpose: 'LOGIN' });
    const b = await ml.createLinkAndCode({ emailHash, purpose: 'LOGIN' });
    expect(await ml.peekToken(a.token, 'LOGIN')).toBeNull();
    expect(await ml.peekToken(b.token, 'LOGIN')).not.toBeNull();
    expect(
      await prisma.magicLinkToken.findUnique({ where: { tokenHash: hashToken(b.token) } }),
    ).toMatchObject({ codeHash: expect.not.stringContaining(b.code) });
  });

  it('codes: format, wrong (attempts left), locked after 5, right one consumed once', async () => {
    const { code } = await ml.createLinkAndCode({ emailHash, purpose: 'CHANGE_EMAIL' });
    expect(await ml.consumeCode({ emailHash, purpose: 'CHANGE_EMAIL', code: '12' })).toEqual({
      error: 'format',
    });
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await ml.consumeCode({ emailHash, purpose: 'CHANGE_EMAIL', code: wrong })).toEqual({
      error: 'wrong',
      remaining: 4,
    });
    expect(
      await ml.consumeCode({
        emailHash,
        purpose: 'CHANGE_EMAIL',
        code: `${code.slice(0, 3)} ${code.slice(3)}`,
      }),
    ).toHaveProperty('row');
    expect(await ml.consumeCode({ emailHash, purpose: 'CHANGE_EMAIL', code })).toEqual({
      error: 'expired',
    });
    const second = await ml.createLinkAndCode({ emailHash, purpose: 'CHANGE_EMAIL' });
    for (let i = 0; i < 5; i++)
      await ml.consumeCode({ emailHash, purpose: 'CHANGE_EMAIL', code: wrong });
    expect(await ml.consumeCode({ emailHash, purpose: 'CHANGE_EMAIL', code: second.code })).toEqual(
      { error: 'locked' },
    );
  });

  it('messages of a failed code', () => {
    expect(ml.codeFailureMessage({ error: 'format' })).toMatch(/6 chiffres/);
    expect(ml.codeFailureMessage({ error: 'expired' })).toMatch(/expiré/);
    expect(ml.codeFailureMessage({ error: 'locked' })).toMatch(/Trop/);
    expect(ml.codeFailureMessage({ error: 'wrong', remaining: 1 })).toMatch(/1 essai\./);
    expect(ml.formatCode('482913')).toBe('482 913');
    expect(ml.cleanCode(42)).toBe('');
  });
});

describe('TOTP and passwords', () => {
  it('a code of the secret is valid, any other format refused', () => {
    const s = totp.newTotpSecret();
    expect(totp.verifyTotp(s, totp.totpCode(s))).toBe(true);
    expect(totp.verifyTotp(s, 'abcdef')).toBe(false);
    expect(totp.verifyTotpStep(s, '12')).toBeNull();
    expect(totp.verifyTotp('not a secret', '123456')).toBe(false);
    expect(totp.totpUri(s, 'a@example.org')).toMatch(/^otpauth:\/\/totp\/notetonmaster/);
  });
  it('argon2id: right and wrong passwords, broken hash', async () => {
    const h = await hashPassword('un mot de passe solide');
    expect(await verifyPassword(h, 'un mot de passe solide')).toBe(true);
    expect(await verifyPassword(h, 'autre')).toBe(false);
    expect(await verifyPassword('pas-un-hash', 'x')).toBe(false);
  });
});

describe('invitations', () => {
  it('a valid invitation gives only what the page shows, and is used once', async () => {
    const token = `test-invite-${Date.now()}`;
    const a = await prisma.adminUser.create({
      data: {
        email: `invite-${Date.now()}@example.org`,
        name: 'Invité·e',
        role: 'MODERATOR',
        invitedAt: new Date(),
        inviteTokenHash: hashToken(token),
      },
    });
    invited.push(a.id);
    expect(await findInvitation(token)).toEqual({ id: a.id, email: a.email, role: 'MODERATOR' });
    expect(await findInvitation('')).toBeNull();
    const fd = new FormData();
    fd.set('name', 'Camille');
    fd.set('password', 'un mot de passe de plus de 12');
    fd.set('confirm', 'un mot de passe de plus de 12');
    expect(await run(() => acceptInvitation(token, {}, fd))).toEqual({
      redirect: '/admin/login?active=1',
    });
    expect(await findInvitation(token)).toBeNull();
  });
  it('an expired invitation is refused', async () => {
    const token = `test-invite-old-${Date.now()}`;
    const a = await prisma.adminUser.create({
      data: {
        email: `invite-old-${Date.now()}@example.org`,
        name: 'X',
        role: 'MODERATOR',
        invitedAt: new Date(Date.now() - 8 * 86_400_000),
        inviteTokenHash: hashToken(token),
      },
    });
    invited.push(a.id);
    expect(await findInvitation(token)).toBeNull();
    expect(await acceptInvitation(token, {}, new FormData())).toMatchObject({
      error: expect.any(String),
    });
  });
});

describe('guard of admin pages', () => {
  it('no session: login page; missing permission: back to the overview; role: Forbidden', async () => {
    request.reset();
    expect(await run(() => requireAdmin())).toEqual({ redirect: '/admin/login' });
    await expect(requireRole('dashboard.view')).rejects.toBeInstanceOf(ForbiddenError);
    await adminAs('MODERATOR');
    expect(await run(() => requireAdmin('team.manage'))).toEqual({ redirect: '/admin?refus=1' });
    expect(await requireAdmin('moderation.manage')).toMatchObject({ role: 'MODERATOR' });
  });
});

describe('origin and environment', () => {
  it('an invalid APP_URL or origin refuses everything in production', () => {
    expect(
      isAllowedOrigin('https://x.fr', { NODE_ENV: 'production', APP_URL: 'pas une url' }),
    ).toBe(false);
    expect(
      isAllowedOrigin('pas une url', { NODE_ENV: 'production', APP_URL: 'https://x.fr' }),
    ).toBe(false);
  });
  it('assertEnv throws on a refused configuration; the local flag needs a local address', () => {
    expect(() => assertEnv({ NODE_ENV: 'production', APP_URL: 'http://x.fr' })).toThrow(
      /ne démarre pas/,
    );
    expect(() => assertEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(
      isInsecureLocalProd({ ALLOW_INSECURE_LOCAL_PROD: '1', APP_URL: 'http://localhost:3002' }),
    ).toBe(true);
    expect(isInsecureLocalProd({ ALLOW_INSECURE_LOCAL_PROD: '1', APP_URL: 'pas une url' })).toBe(
      false,
    );
  });
});
