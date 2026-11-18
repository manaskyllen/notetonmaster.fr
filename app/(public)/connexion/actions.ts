'use server';

import { redirect } from 'next/navigation';
import { magicLinkMail } from '@/emails/templates';
import { appUrl } from '@/emails/Layout';
import {
  codeFailureMessage,
  consumeCode,
  consumeToken,
  createLinkAndCode,
} from '@/lib/auth/magic-link';
import { RESEND_AFTER_S } from '@/lib/auth/login-code';
import { revokeSession, startSession, studentSession } from '@/lib/auth/session';
import { findOrCreateStudent } from '@/lib/auth/students';
import { getCurrentStudent } from '@/lib/auth/student';
import { decrypt, encrypt, hashEmail, normalizeEmail } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { PROGRAM_ID, setFollowed } from '@/lib/favorites';
import { fieldErrors, type FormState } from '@/lib/form';
import { sendMailSafe } from '@/lib/mail/send';
import { HOUR, MINUTE, rateLimit } from '@/lib/rate-limit';
import { turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { clientIp, logConnection } from '@/lib/request';
import { email as emailSchema } from '@/lib/validation';
import { z } from 'zod';
import { afterReviewChange } from '@/lib/cache/next';
import { containsContacts } from '@/lib/domain/masking';
import { normalize } from '@/lib/domain/search';
import { computeVerified } from '@/lib/reviews/verified';
import { getSettings } from '@/lib/settings';

/** The action that sent the visitor to the login page, done on the way back. */
const programOf = (v: unknown) => (typeof v === 'string' && PROGRAM_ID.test(v) ? v : undefined);

const safeNext = (n: unknown) =>
  typeof n === 'string' && /^\/[a-z0-9/_#?=&%.-]*$/i.test(n) && !n.startsWith('//') ? n : '/espace';

export type LoginRequest = FormState<{ email: string }>;

/** Sends a 6-digit code (and the fallback link) to any address; the space is created on first login. */
export async function requestLoginCode(_prev: LoginRequest, fd: FormData): Promise<LoginRequest> {
  const parsed = z.object({ email: emailSchema }).safeParse({ email: fd.get('email') });
  if (!parsed.success)
    return {
      status: 'error',
      fieldErrors: fieldErrors(parsed.error),
      values: { email: String(fd.get('email') ?? '') },
    };
  const email = normalizeEmail(parsed.data.email);
  const human = await verifyTurnstile('login', turnstileTokenOf(fd));
  if (!human.ok) return { status: 'error', message: human.message, values: { email } };
  const emailHash = hashEmail(email);
  if (!(await rateLimit(`login-resend:${emailHash}`, 1, RESEND_AFTER_S * 1000)))
    return {
      status: 'error',
      message: `Un code vient de partir. Attends ${RESEND_AFTER_S} secondes avant d’en redemander un.`,
      values: { email },
    };
  const ok =
    (await rateLimit(`login:${emailHash}`, 5, HOUR)) &&
    (await rateLimit(`login-ip:${await clientIp()}`, 20, HOUR));
  if (!ok)
    return {
      status: 'error',
      message: 'Trop de codes demandés pour cette adresse. Réessaie dans une heure.',
      values: { email },
    };
  const follow = programOf(fd.get('suivre'));
  const { token, code } = await createLinkAndCode({
    emailHash,
    purpose: 'LOGIN',
    payload: {
      emailEnc: encrypt(email),
      next: safeNext(fd.get('next')),
      ...(follow ? { follow } : {}),
    },
  });
  await sendMailSafe(email, magicLinkMail({ url: `${appUrl()}/connexion/lien/${token}`, code }));
  return { status: 'success', data: { email } };
}

type LoginPayload = {
  emailEnc?: string;
  studentId?: string;
  next?: string;
  follow?: string;
  /** Review sent « avec mon espace » before logging in: attached once the address is proven. */
  confirmReviewId?: string;
};

/** Opens the session of a consumed LOGIN row, does the pending action and goes back. */
async function openSession(payload: LoginPayload): Promise<{ error: string } | never> {
  const student = payload.studentId
    ? await prisma.student.findUnique({ where: { id: payload.studentId } })
    : payload.emailEnc
      ? await findOrCreateStudent(decrypt(payload.emailEnc))
      : null;
  if (!student || student.deletedAt) return { error: 'Cet espace n’existe plus.' };
  const session = await studentSession();
  await revokeSession(session.sid);
  // A new server-side session (and identifier) at every login.
  session.sid = await startSession('STUDENT', student.id);
  session.studentId = student.id;
  session.issuedAt = Date.now();
  session.refreshedAt = Date.now();
  await session.save();
  await prisma.student.update({
    where: { id: student.id },
    data: { lastSeenAt: new Date(), inactivityWarnedAt: null },
  });
  await logConnection('STUDENT_LOGIN', student.id);
  // « Suivre » clicked without an account: done on the way back.
  const program = async (id?: string) =>
    id
      ? prisma.program.findFirst({
          where: { id, isPublished: true, inOpenZone: true },
          select: { id: true },
        })
      : null;
  const followed = await program(payload.follow);
  if (followed) await setFollowed(student.id, followed.id, true);
  if (payload.confirmReviewId) await attachPendingReview(payload.confirmReviewId, student);
  redirect(safeNext(payload.next));
}

/**
 * The review sent « avec mon espace » before the login: the code (or link) just proved the
 * address, so the review joins the space and enters moderation (or is published).
 */
async function attachPendingReview(reviewId: string, student: { id: string; emailHash: string }) {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, authorEmailHash: student.emailHash, status: 'PENDING_CONFIRMATION' },
  });
  if (!review) return;
  const autoPublish = (await getSettings())['moderation.autoPublish'];
  const publish =
    autoPublish && !containsContacts(`${review.pros} ${review.cons}`) && !(await watched(review));
  await prisma.review.update({
    where: { id: review.id },
    data: {
      studentId: student.id,
      status: publish ? 'PUBLISHED' : 'PENDING',
      submittedAt: new Date(),
      publishedAt: publish ? new Date() : null,
    },
  });
  await prisma.student.update({
    where: { id: student.id },
    data: { level: review.level, ...(review.acceptsQuestions ? { acceptsQuestions: true } : {}) },
  });
  if (publish) {
    await prisma.review.update({
      where: { id: review.id },
      data: { isVerified: await computeVerified({ ...review, studentId: student.id }) },
    });
    await afterReviewChange([review.programId]);
  }
}

async function watched(r: { title: string | null; pros: string; cons: string }) {
  const terms = (await getSettings())['moderation.watchTerms'] as string[];
  const text = normalize(`${r.title ?? ''} ${r.pros} ${r.cons}`);
  return terms.map(normalize).some((w) => w && text.includes(w));
}

/** « Se connecter sur cet appareil »: the button of the confirmation page consumes the link. */
export async function confirmLogin(token: string): Promise<{ error: string } | never> {
  const row = await consumeToken(token, 'LOGIN');
  if (!row) return { error: 'Ce lien a expiré ou a déjà servi. Demande un nouveau code.' };
  return openSession((row.payload ?? {}) as LoginPayload);
}

/** The 6 digits typed on the login page (or on the « Merci » screen of a review). */
export async function verifyLoginCode(
  rawEmail: string,
  code: string,
): Promise<{ error: string } | never> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { error: 'Adresse invalide. Recommence avec « Changer d’adresse ».' };
  if (!(await rateLimit(`login-code-ip:${await clientIp()}`, 30, 15 * MINUTE)))
    return { error: 'Trop d’essais depuis cette connexion. Réessaie dans quelques minutes.' };
  const r = await consumeCode({
    emailHash: hashEmail(normalizeEmail(parsed.data)),
    purpose: 'LOGIN',
    code,
  });
  if ('error' in r) return { error: codeFailureMessage(r) };
  return openSession((r.row.payload ?? {}) as LoginPayload);
}

export async function logout() {
  const session = await studentSession();
  await revokeSession(session.sid);
  session.destroy();
  redirect('/');
}

type EmailChangePayload = { studentId?: string; emailEnc?: string };

async function applyEmailChange(emailHash: string, payload: EmailChangePayload) {
  if (!payload.studentId || !payload.emailEnc)
    return { error: 'Ce lien a expiré ou a déjà servi.' };
  const taken = await prisma.student.findUnique({ where: { emailHash } });
  if (taken && taken.id !== payload.studentId)
    return { error: 'Cette adresse est déjà liée à un autre espace.' };
  await prisma.student.update({
    where: { id: payload.studentId },
    data: { emailHash, emailEnc: payload.emailEnc },
  });
  await logConnection('EMAIL_CHANGE', payload.studentId);
  redirect('/espace/compte?adresse=ok');
}

/** Opens the « change of address » link: the student's address becomes the new one. */
export async function confirmEmailChange(token: string): Promise<{ error: string } | never> {
  const t = await consumeToken(token, 'CHANGE_EMAIL');
  if (!t) return { error: 'Ce lien a expiré ou a déjà servi.' };
  return applyEmailChange(t.emailHash, (t.payload ?? {}) as EmailChangePayload);
}

/** The code typed in Mon espace › Compte, for the new address. Only by the space that asked. */
export async function confirmEmailChangeByCode(
  rawEmail: string,
  code: string,
): Promise<{ error: string } | never> {
  const student = await getCurrentStudent();
  if (!student) return { error: 'Ta session a expiré. Reconnecte-toi.' };
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { error: 'Adresse invalide.' };
  const emailHash = hashEmail(normalizeEmail(parsed.data));
  const r = await consumeCode({
    emailHash,
    purpose: 'CHANGE_EMAIL',
    code,
    scope: { key: 'studentId', value: student.id },
  });
  if ('error' in r) return { error: codeFailureMessage(r) };
  return applyEmailChange(emailHash, (r.row.payload ?? {}) as EmailChangePayload);
}
