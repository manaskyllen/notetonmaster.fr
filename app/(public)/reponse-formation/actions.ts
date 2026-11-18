'use server';

import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { staffCodeMail } from '@/emails/templates';
import { revokeSession, staffSession, startSession } from '@/lib/auth/session';
import { getCurrentResponder } from '@/lib/auth/staff';
import { saveResponse } from '@/lib/responses';
import { hashEmail, hmac, normalizeEmail, randomCode } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { checkStaffEmail, RESPONSE_MAX } from '@/lib/domain/staff-domains';
import { fieldErrors, type FormState } from '@/lib/form';
import { sendMailSafe } from '@/lib/mail/send';
import { HOUR, MINUTE, rateLimit } from '@/lib/rate-limit';
import { clientIp, logConnection } from '@/lib/request';
import { turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { email as emailSchema } from '@/lib/validation';

const CODE_TTL = 15 * MINUTE;

/** The code is kept as an HMAC salted by the address: 10⁶ values are no secret on their own. */
const staffCodeHash = (emailHash: string, code: string) => hmac(`staff-code:${emailHash}:${code}`);
const MAX_ATTEMPTS = 5;

/** Step 1: an address of an official domain of the establishment receives a 6-digit code. */
export async function requestStaffCode(
  _prev: FormState<{ email: string }>,
  fd: FormData,
): Promise<FormState<{ email: string }>> {
  const parsed = z
    .object({ email: emailSchema, universityId: z.string().min(1).max(40) })
    .safeParse({ email: fd.get('email'), universityId: fd.get('universityId') });
  const values = { email: String(fd.get('email') ?? '') };
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error), values };
  const human = await verifyTurnstile('staff-code', turnstileTokenOf(fd));
  if (!human.ok) return { status: 'error', message: human.message, values };
  const uni = await prisma.university.findUnique({
    where: { id: parsed.data.universityId },
    select: { id: true, name: true, mailDomains: true },
  });
  if (!uni) return { status: 'error', message: 'Établissement introuvable.', values };
  const email = normalizeEmail(parsed.data.email);
  const check = checkStaffEmail(email, uni.mailDomains);
  if (!check.ok)
    return {
      status: 'error',
      fieldErrors: {
        email:
          check.reason === 'student'
            ? 'Les adresses étudiantes ne sont pas acceptées : utilisez votre adresse professionnelle.'
            : 'Cette adresse n’appartient pas à un domaine officiel de l’établissement.',
      },
      values,
    };
  const emailHash = hashEmail(email);
  const ok =
    (await rateLimit(`staff-code:${emailHash}`, 3, 15 * MINUTE)) &&
    (await rateLimit(`staff-code-ip:${await clientIp()}`, 20, HOUR));
  if (!ok)
    return { status: 'error', message: 'Trop de demandes. Attendez quelques minutes.', values };
  const code = randomCode();
  const data = {
    universityId: uni.id,
    domain: check.domain,
    codeHash: staffCodeHash(emailHash, code),
    codeExpiresAt: new Date(Date.now() + CODE_TTL),
    codeAttempts: 0,
  };
  const r = await prisma.staffResponder.upsert({
    where: { emailHash },
    create: { emailHash, ...data },
    update: data,
  });
  const session = await staffSession();
  session.pendingResponderId = r.id;
  session.issuedAt = Date.now();
  await session.save();
  await sendMailSafe(email, staffCodeMail({ code, universityName: uni.name }));
  return { status: 'success', data: { email } };
}

/** Step 1 bis: the code opens the « Répondre » step (verification valid 12 months). */
export async function verifyStaffCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = String(fd.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code))
    return { status: 'error', fieldErrors: { code: 'Le code fait 6 chiffres.' } };
  const session = await staffSession();
  const id = session.pendingResponderId;
  const r = id ? await prisma.staffResponder.findUnique({ where: { id } }) : null;
  if (!r || !r.codeHash || !r.codeExpiresAt || r.codeExpiresAt < new Date())
    return { status: 'error', message: 'Ce code a expiré. Demandez-en un nouveau.' };
  // Counted before comparing, atomically: parallel guesses cannot exceed the limit.
  const counted = await prisma.staffResponder.updateMany({
    where: { id: r.id, codeAttempts: { lt: MAX_ATTEMPTS } },
    data: { codeAttempts: { increment: 1 } },
  });
  if (counted.count !== 1)
    return { status: 'error', message: 'Trop d’essais. Demandez un nouveau code.' };
  const expected = Buffer.from(r.codeHash, 'hex');
  const given = Buffer.from(staffCodeHash(r.emailHash, code), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return { status: 'error', fieldErrors: { code: 'Code incorrect.' } };
  await prisma.staffResponder.update({
    where: { id: r.id },
    data: {
      verifiedAt: new Date(),
      lastUsedAt: new Date(),
      codeHash: null,
      codeExpiresAt: null,
      codeAttempts: 0,
    },
  });
  await revokeSession(session.sid);
  session.sid = await startSession('STAFF', r.id);
  session.responderId = r.id;
  session.pendingResponderId = undefined;
  session.issuedAt = Date.now();
  session.refreshedAt = Date.now();
  await session.save();
  await logConnection('STAFF_VERIFIED', r.id);
  revalidatePath('/reponse-formation');
  return { status: 'success' };
}

const responseInput = z.object({
  reviewId: z.string().min(1).max(40),
  body: z
    .string()
    .trim()
    .min(20, 'Au moins 20 caractères.')
    .max(RESPONSE_MAX, `${RESPONSE_MAX} caractères au maximum.`),
});

/**
 * Step 2: one public reply per review, from the establishment of its parcours. A new text goes
 * (back) to moderation; contact details are masked like in the messaging.
 */
export async function submitResponse(
  raw: unknown,
): Promise<{ ok: true; status: 'PENDING' } | { ok: false; error: string }> {
  const responder = await getCurrentResponder();
  if (!responder) return { ok: false, error: 'Vérifiez d’abord votre adresse (étape 1).' };
  const p = responseInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Réponse invalide.' };
  const r = await saveResponse(responder, p.data.reviewId, p.data.body);
  if (!r.ok) return r;
  await prisma.staffResponder.update({
    where: { id: responder.id },
    data: { lastUsedAt: new Date() },
  });
  revalidatePath('/reponse-formation');
  revalidatePath(`/parcours/${r.slug}`);
  return { ok: true, status: 'PENDING' };
}

export async function staffLogout() {
  const s = await staffSession();
  await revokeSession(s.sid);
  s.destroy();
  revalidatePath('/reponse-formation');
}
