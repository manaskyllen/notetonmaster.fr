/**
 * Real sessions for integration tests: admins of each role (password + TOTP), students (code by
 * mail), a verified teaching-team member. Each helper leaves the fake request (helpers/request)
 * logged in as that person; `request.snapshot()` keeps the cookies to switch back later.
 *
 * The test file must mock next/headers, next/navigation, next/cache and @/lib/mail/send.
 */
import { generateSync } from 'otplib';
import { prisma } from '@/lib/db';
import { encrypt, hashEmail } from '@/lib/crypto';
import { hashPassword } from '@/lib/auth/password';
import { newTotpSecret } from '@/lib/auth/totp';
import type { AdminRole } from '@/lib/db/generated/enums';
import { TURNSTILE_MOCK_TOKEN } from '@/lib/turnstile-forms';
import { request, run } from './request';
import { lastCode } from './mailbox';
import { FX } from '../fixtures/ids';

const PASSWORD = 'correct horse battery staple 42';
const tag = `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
export const created = {
  admins: [] as string[],
  students: [] as string[],
  responders: [] as string[],
};

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/** A new admin of this role, logged in on a fresh visitor. */
export async function adminAs(role: AdminRole) {
  const secret = newTotpSecret();
  const a = await prisma.adminUser.create({
    data: {
      email: `${tag}-${role.toLowerCase()}-${created.admins.length}@example.org`,
      name: `Test ${role}`,
      role,
      passwordHash: await hashPassword(PASSWORD),
      totpSecretEnc: encrypt(secret),
      totpEnabledAt: new Date(),
    },
  });
  created.admins.push(a.id);
  request.reset();
  const { loginAction } = await import('@/app/admin/login/actions');
  await loginAction(
    { step: 'password' },
    fd({
      step: 'password',
      email: a.email,
      password: PASSWORD,
      'cf-turnstile-response': TURNSTILE_MOCK_TOKEN,
    }),
  );
  const done = await run(() =>
    loginAction({ step: 'totp' }, fd({ step: 'totp', code: generateSync({ secret }) })),
  );
  if (!('redirect' in (done as object)))
    throw new Error(`admin login failed: ${JSON.stringify(done)}`);
  return { ...a, secret, cookies: request.snapshot() };
}

/** A new student, logged in with the code of the mail. */
export async function studentAs(name = 'student') {
  const email = `${tag}-${name}-${created.students.length}@example.org`;
  request.reset();
  const { requestLoginCode, verifyLoginCode } = await import('@/app/(public)/connexion/actions');
  await requestLoginCode(
    { status: 'idle' } as never,
    fd({ email, 'cf-turnstile-response': TURNSTILE_MOCK_TOKEN }),
  );
  await run(() => verifyLoginCode(email, lastCode(email)));
  const s = await prisma.student.findUniqueOrThrow({ where: { emailHash: hashEmail(email) } });
  created.students.push(s.id);
  return { ...s, email, cookies: request.snapshot() };
}

/** A verified teaching-team member of a university, logged in. */
export async function staffAs(universityId?: string) {
  // Nantes Université (official domain univ-nantes.fr in the fixtures) unless another is asked.
  const u = await prisma.university.findUniqueOrThrow({
    where: universityId ? { id: universityId } : { slug: FX.universities.nantes },
    select: { id: true, mailDomains: true },
  });
  const email = `${tag}-staff-${created.responders.length}@${u.mailDomains[0]}`;
  request.reset();
  const { requestStaffCode, verifyStaffCode } =
    await import('@/app/(public)/reponse-formation/actions');
  await requestStaffCode(
    { status: 'idle' } as never,
    fd({ email, universityId: u.id, 'cf-turnstile-response': TURNSTILE_MOCK_TOKEN }),
  );
  await verifyStaffCode({ status: 'idle' } as never, fd({ code: lastCode(email) }));
  const r = await prisma.staffResponder.findUniqueOrThrow({
    where: { emailHash: hashEmail(email) },
  });
  created.responders.push(r.id);
  return { ...r, universityId: u.id, cookies: request.snapshot() };
}

export async function cleanupActors() {
  await prisma.authSession.deleteMany({
    where: { subjectId: { in: [...created.admins, ...created.students, ...created.responders] } },
  });
  await prisma.savedView.deleteMany({ where: { userId: { in: created.admins } } });
  await prisma.job.deleteMany({ where: { createdById: { in: created.admins } } });
  await prisma.adminUser.updateMany({
    where: { id: { in: created.admins } },
    data: { removedAt: new Date() },
  });
  await prisma.review.deleteMany({ where: { studentId: { in: created.students } } });
  await prisma.conversation.deleteMany({ where: { askerStudentId: { in: created.students } } });
  await prisma.student.deleteMany({ where: { id: { in: created.students } } });
  await prisma.staffResponder.deleteMany({ where: { id: { in: created.responders } } });
}
