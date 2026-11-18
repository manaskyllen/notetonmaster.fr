/**
 * `pnpm admin:create` (scripts/admin-create.ts, lib/admin/invite.ts): an account without a
 * password and a single-use invitation link by mail; the password is chosen on the invitation
 * page, and the double authentication is required at the first login. Nothing secret on the
 * command line or in the output.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request, run } = await import('../helpers/request');
const { lastMail } = await import('../helpers/mailbox');
const { prisma } = await import('@/lib/db');
const { sendMail } = await import('@/lib/mail/send');
const { inviteAdmin } = await import('@/lib/admin/invite');
const { findInvitation } = await import('@/lib/auth/invitation');
const { acceptInvitation } = await import('@/app/admin/invitation/[token]/actions');
const { loginAction } = await import('@/app/admin/login/actions');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');

const email = `cli-admin-${Date.now()}@notetonmaster.test`;
const PASSWORD = 'un mot de passe assez long 2026';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => request.reset());
afterAll(async () => {
  await prisma.adminUser.updateMany({ where: { email }, data: { removedAt: new Date() } });
});

describe('admin:create', () => {
  it('invites by mail, single-use link, TOTP required at the first login', async () => {
    const r = await inviteAdmin(email, 'ADMIN', sendMail);
    expect(r).toEqual({ ok: true, email });
    const a = await prisma.adminUser.findUniqueOrThrow({ where: { email } });
    expect(a).toMatchObject({ role: 'ADMIN', passwordHash: null, totpEnabledAt: null });

    const mail = lastMail(email);
    const token = /\/admin\/invitation\/([\w-]+)/.exec(mail?.text ?? '')?.[1];
    expect(token).toBeTruthy();
    // Only the hash of the token is stored.
    expect(a.inviteTokenHash).not.toBe(token);
    expect(await findInvitation(token!)).toMatchObject({ email, role: 'ADMIN' });

    const accepted = await run(() =>
      acceptInvitation(
        token!,
        {},
        fd({ name: 'Admin CLI', password: PASSWORD, confirm: PASSWORD }),
      ),
    );
    expect(accepted).toEqual({ redirect: '/admin/login?active=1' });
    // Single use.
    expect(await findInvitation(token!)).toBeNull();
    expect(
      await run(() =>
        acceptInvitation(token!, {}, fd({ name: 'Autre', password: PASSWORD, confirm: PASSWORD })),
      ),
    ).toEqual({ error: 'Invitation expirée ou déjà utilisée.' });

    // The password alone opens nothing: the TOTP must be set up first.
    const step = await loginAction(
      { step: 'password' },
      fd({
        step: 'password',
        email,
        password: PASSWORD,
        'cf-turnstile-response': TURNSTILE_MOCK_TOKEN,
      }),
    );
    expect(step.step).toBe('setup');
  });

  it('refuses a member who already has an account', async () => {
    expect(await inviteAdmin(email, 'MODERATOR', sendMail)).toMatchObject({ ok: false });
  });

  it('takes no password and never prints the link', () => {
    const src = readFileSync('scripts/admin-create.ts', 'utf8');
    expect(src).not.toMatch(/argValue\('password'\)|PASSWORD/);
    const printed = [...src.matchAll(/console\.(log|error)\(([\s\S]*?)\);/g)].map((m) => m[2]);
    for (const p of printed) expect(p).not.toMatch(/token|invitation\//);
  });
});
