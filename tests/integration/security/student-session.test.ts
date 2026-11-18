/** Student sessions: server-side, revoked at logout, 14 days of inactivity, renewed while used. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request, run } = await import('../helpers/request');
const { lastCode } = await import('../helpers/mailbox');
const { prisma } = await import('@/lib/db');
const { hashEmail } = await import('@/lib/crypto');
const { getCurrentStudent } = await import('@/lib/auth/student');
const { requestLoginCode, verifyLoginCode, logout } =
  await import('@/app/(public)/connexion/actions');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');

const tag = `sec-student-${Date.now()}`;
const emails: string[] = [];

async function loginAs(name: string) {
  const email = `${tag}-${name}@example.org`;
  emails.push(email);
  const f = new FormData();
  f.set('email', email);
  f.set('cf-turnstile-response', TURNSTILE_MOCK_TOKEN);
  await requestLoginCode({ status: 'idle' } as never, f);
  expect(await run(() => verifyLoginCode(email, lastCode(email)))).toMatchObject({
    redirect: '/espace',
  });
  return (await prisma.student.findUnique({ where: { emailHash: hashEmail(email) } }))!;
}

beforeAll(() => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
});
beforeEach(() => request.reset());
afterAll(async () => {
  const hashes = emails.map(hashEmail);
  const students = await prisma.student.findMany({ where: { emailHash: { in: hashes } } });
  await prisma.authSession
    ?.deleteMany({ where: { subjectId: { in: students.map((s) => s.id) } } })
    .catch(() => {});
  await prisma.student.deleteMany({ where: { emailHash: { in: hashes } } });
  await prisma.magicLinkToken.deleteMany({ where: { emailHash: { in: hashes } } });
});

describe('student session', () => {
  it('logout revokes it on the server', async () => {
    const s = await loginAs('logout');
    expect((await getCurrentStudent())?.id).toBe(s.id);
    const stolen = request.snapshot();
    await run(() => logout());
    request.restore(stolen);
    expect(await getCurrentStudent()).toBeNull();
  });

  it('ends after 14 days without activity', async () => {
    const s = await loginAs('idle');
    await prisma.authSession.updateMany({
      where: { subjectId: s.id },
      data: { lastSeenAt: new Date(Date.now() - 15 * 86_400_000) },
    });
    expect(await getCurrentStudent()).toBeNull();
  });

  it('stays open while used (13 days of inactivity), and the activity is recorded', async () => {
    const s = await loginAs('active');
    await prisma.authSession.updateMany({
      where: { subjectId: s.id },
      data: {
        lastSeenAt: new Date(Date.now() - 13 * 86_400_000),
        createdAt: new Date(Date.now() - 60 * 86_400_000),
      },
    });
    expect((await getCurrentStudent())?.id).toBe(s.id);
    const row = await prisma.authSession.findFirst({ where: { subjectId: s.id } });
    expect(Date.now() - row!.lastSeenAt.getTime()).toBeLessThan(60_000);
  });
});
