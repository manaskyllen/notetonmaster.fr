'use server';

import { verifyTurnstile } from '@/lib/turnstile';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { appUrl } from '@/emails/Layout';
import { emailChangeMail, verificationCodeMail } from '@/emails/templates';
import { revokeAllSessions, studentSession } from '@/lib/auth/session';
import { getCurrentStudent } from '@/lib/auth/student';
import { createLinkAndCode } from '@/lib/auth/magic-link';
import { encrypt, hashEmail, hmac, normalizeEmail, randomCode } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import type { Criterion } from '@/lib/db/generated/enums';
import { detectNamedPerson } from '@/lib/domain/names';
import { matchUniversityDomain, VERIFICATION_CODE_TTL_MS } from '@/lib/domain/verification';
import { fieldErrors } from '@/lib/form';
import { sendMailSafe } from '@/lib/mail/send';
import { HOUR, MINUTE, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { deleteDocument } from '@/lib/uploads';
import { grantProgramVerification } from '@/lib/verification';
import { normalizeSituation } from '@/lib/domain/graduate';
import { email as emailSchema, reviewEditSchema } from '@/lib/validation';
import { afterReviewChange } from '@/lib/cache/next';

type Result =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function requireStudent() {
  const s = await getCurrentStudent();
  if (!s) redirect('/connexion');
  return s;
}

// ───────────── verification, master by master ─────────────

/** A master the student reviewed, with its university (only those can be verified). */
async function reviewedProgram(studentId: string, programId: string) {
  const review = await prisma.review.findFirst({
    where: { studentId, programId },
    select: {
      level: true,
      cohortYear: true,
      program: {
        select: {
          id: true,
          title: true,
          university: { select: { id: true, name: true, emailDomains: true } },
        },
      },
    },
  });
  return review;
}

export async function sendUniversityCode(
  programId: string,
  rawEmail: string,
  turnstileToken?: string,
): Promise<Result> {
  const student = await requireStudent();
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: 'Cette adresse ne semble pas valide.' };
  const human = await verifyTurnstile('university-code', turnstileToken);
  if (!human.ok) return { ok: false, error: human.message };
  const reviewed = await reviewedProgram(student.id, programId);
  if (!reviewed) return { ok: false, error: 'Ce master ne fait pas partie de tes avis.' };
  const uni = reviewed.program.university;
  const email = normalizeEmail(parsed.data);
  // Only an address of this master's university proves anything about it.
  if (!matchUniversityDomain(email, [uni]))
    return {
      ok: false,
      error: `Cette adresse n’est pas une adresse de ${uni.name}. Utilise ton mail de ${uni.name}, ou un justificatif qui mentionne ce master.`,
    };
  if (!(await rateLimit(`uni-code:${student.id}`, 5, HOUR)))
    return { ok: false, error: 'Trop de codes demandés. Réessaie dans une heure.' };
  const code = randomCode();
  await prisma.programVerification.deleteMany({
    where: { studentId: student.id, programId, method: 'UNIVERSITY_EMAIL', status: 'PENDING' },
  });
  await prisma.programVerification.create({
    data: {
      studentId: student.id,
      programId,
      method: 'UNIVERSITY_EMAIL',
      status: 'PENDING',
      universityEmailHash: hashEmail(email),
      codeHash: hmac(`code:${student.id}:${programId}:${code}`),
      codeExpiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
      declaredLevel: reviewed.level,
      declaredCohort: reviewed.cohortYear,
    },
  });
  await sendMailSafe(email, verificationCodeMail({ code }));
  revalidatePath('/espace', 'layout');
  return { ok: true, message: `Code envoyé. Il est valable 15 minutes (${uni.name}).` };
}

export async function confirmUniversityCode(programId: string, code: string): Promise<Result> {
  const student = await requireStudent();
  if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: 'Le code fait 6 chiffres.' };
  if (!(await rateLimit(`uni-confirm:${student.id}`, 10, 15 * MINUTE)))
    return { ok: false, error: 'Trop d’essais. Attends quelques minutes.' };
  const v = await prisma.programVerification.findFirst({
    where: { studentId: student.id, programId, method: 'UNIVERSITY_EMAIL', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!v || !v.codeExpiresAt || v.codeExpiresAt < new Date())
    return { ok: false, error: 'Code expiré. Demande un nouveau code.' };
  if (v.codeAttempts >= 5)
    return { ok: false, error: 'Trop d’essais avec ce code. Demande un nouveau code.' };
  if (v.codeHash !== hmac(`code:${student.id}:${programId}:${code.trim()}`)) {
    await prisma.programVerification.update({
      where: { id: v.id },
      data: { codeAttempts: { increment: 1 } },
    });
    return { ok: false, error: 'Ce code ne correspond pas.' };
  }
  await prisma.programVerification.delete({ where: { id: v.id } });
  await grantProgramVerification({
    studentId: student.id,
    programId,
    method: 'UNIVERSITY_EMAIL',
    universityEmailHash: v.universityEmailHash,
  });
  revalidatePath('/espace', 'layout');
  return { ok: true, message: 'Master vérifié : tes avis sur ce master portent le badge.' };
}

/**
 * The same verified university address serves for another master of that university, in one
 * click and without a new code.
 */
export async function reuseUniversityEmail(programId: string): Promise<Result> {
  const student = await requireStudent();
  const reviewed = await reviewedProgram(student.id, programId);
  if (!reviewed) return { ok: false, error: 'Ce master ne fait pas partie de tes avis.' };
  const proof = await prisma.programVerification.findFirst({
    where: {
      studentId: student.id,
      method: 'UNIVERSITY_EMAIL',
      status: 'APPROVED',
      universityEmailHash: { not: null },
      program: { universityId: reviewed.program.university.id },
    },
  });
  if (!proof)
    return { ok: false, error: `Aucune adresse de ${reviewed.program.university.name} vérifiée.` };
  await grantProgramVerification({
    studentId: student.id,
    programId,
    method: 'UNIVERSITY_EMAIL',
    universityEmailHash: proof.universityEmailHash,
  });
  revalidatePath('/espace', 'layout');
  return { ok: true, message: 'Master vérifié avec ton adresse universitaire.' };
}

// The proof of study (up to 10 MB) is sent to /api/espace/justificatif, not through a Server
// Action: Server Actions accept 1 MB at most (next.config.ts).

// ───────────── reviews ─────────────

export async function deleteMyReview(reviewId: string): Promise<Result> {
  const student = await requireStudent();
  const r = await prisma.review.findFirst({ where: { id: reviewId, studentId: student.id } });
  if (!r) return { ok: false, error: 'Avis introuvable.' };
  await prisma.review.delete({ where: { id: r.id } });
  if (r.status === 'PUBLISHED') await afterReviewChange([r.programId]);
  revalidatePath('/espace');
  return { ok: true };
}

/** Editing sends the review back to moderation (PUBLISHED or NEEDS_EDIT → PENDING). */
export async function updateMyReview(reviewId: string, input: unknown): Promise<Result> {
  const student = await requireStudent();
  const r = await prisma.review.findFirst({ where: { id: reviewId, studentId: student.id } });
  if (!r || !['PENDING', 'PUBLISHED', 'NEEDS_EDIT'].includes(r.status))
    return { ok: false, error: 'Cet avis ne peut plus être modifié.' };
  const parsed = reviewEditSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: 'Certains champs sont à corriger.',
      fieldErrors: fieldErrors(parsed.error),
    };
  const d = parsed.data;
  const leaveReason = (d.level === 'LEFT' && d.leaveReason?.trim()) || null;
  if ((await getSettings())['moderation.nameDetection']) {
    const hit = detectNamedPerson(d.pros, d.cons, leaveReason, d.jobTitle);
    if (hit.found)
      return {
        ok: false,
        error: `Ton texte semble citer une personne (« ${hit.matches[0]} »). Parle plutôt du cours ou de l’organisation.`,
      };
  }
  const scores = Object.entries(d.scores).filter(
    (e): e is [string, number] => typeof e[1] === 'number',
  );
  await prisma.$transaction([
    prisma.reviewCriterionScore.deleteMany({ where: { reviewId: r.id } }),
    prisma.review.update({
      where: { id: r.id },
      data: {
        level: d.level,
        ...normalizeSituation(d),
        cohortYear: d.cohortYear,
        overallRating: d.overallRating,
        pros: d.pros,
        cons: d.cons,
        leaveReason,
        acceptsQuestions: d.acceptsQuestions,
        status: 'PENDING',
        nameFlagged: false,
        submittedAt: new Date(),
        scores: {
          create: scores.map(([criterion, score]) => ({
            criterion: criterion as Criterion,
            score,
          })),
        },
      },
    }),
  ]);
  if (r.status === 'PUBLISHED') await afterReviewChange([r.programId]);
  revalidatePath('/espace');
  return { ok: true, message: 'Avis modifié : il repasse en relecture.' };
}

// ───────────── settings & RGPD ─────────────

export type StudentPref =
  | 'acceptsQuestions'
  | 'notifyNewMessage'
  | 'notifyReviewStatus'
  | 'notifySavedDigest'
  | 'notifyQuestionDigest';

export async function updatePreference(key: StudentPref, value: boolean): Promise<Result> {
  const student = await requireStudent();
  if (
    ![
      'acceptsQuestions',
      'notifyNewMessage',
      'notifyReviewStatus',
      'notifySavedDigest',
      'notifyQuestionDigest',
    ].includes(key)
  )
    return { ok: false, error: 'Réglage inconnu.' };
  await prisma.student.update({ where: { id: student.id }, data: { [key]: !!value } });
  revalidatePath('/espace', 'layout');
  return { ok: true };
}

/**
 * « Changer d'adresse »: a 6-digit code and its fallback link (10 minutes) are sent to the new
 * address; it changes only once one of them is used (Turnstile).
 */
export async function requestEmailChange(
  rawEmail: string,
  turnstileToken?: string,
): Promise<Result> {
  const student = await requireStudent();
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: 'Cette adresse ne semble pas valide.' };
  const human = await verifyTurnstile('email-change', turnstileToken);
  if (!human.ok) return { ok: false, error: human.message };
  const email = normalizeEmail(parsed.data);
  const emailHash = hashEmail(email);
  if (emailHash === student.emailHash)
    return { ok: false, error: 'C’est déjà l’adresse de ton espace.' };
  if (await prisma.student.findUnique({ where: { emailHash }, select: { id: true } }))
    return { ok: false, error: 'Cette adresse est déjà liée à un autre espace.' };
  if (!(await rateLimit(`email-change:${student.id}`, 3, HOUR)))
    return { ok: false, error: 'Trop de demandes. Réessaie dans une heure.' };
  const { token, code } = await createLinkAndCode({
    emailHash,
    purpose: 'CHANGE_EMAIL',
    payload: { studentId: student.id, emailEnc: encrypt(email) },
    scope: { key: 'studentId', value: student.id },
  });
  await sendMailSafe(
    email,
    emailChangeMail({ url: `${appUrl()}/connexion/adresse/${token}`, code }),
  );
  return { ok: true, message: email };
}

export async function requestDataExport(): Promise<Result> {
  const student = await requireStudent();
  if (!(await rateLimit(`export:${student.id}`, 3, 24 * HOUR)))
    return { ok: false, error: 'Tu as déjà demandé plusieurs copies aujourd’hui.' };
  await prisma.job.create({ data: { type: 'EXPORT_DATA', payload: { studentId: student.id } } });
  return {
    ok: true,
    message: 'C’est parti : la copie de tes données arrive par mail dans quelques instants.',
  };
}

/**
 * Account deletion: reviews stay published but are detached; messages, verifications
 * (and their files) and favourites are deleted. Connection logs are kept 1 year (legal).
 */
export async function deleteAccount(): Promise<Result> {
  const student = await requireStudent();
  const verifs = await prisma.programVerification.findMany({
    where: { studentId: student.id },
    select: { documentPath: true },
  });
  for (const v of verifs) await deleteDocument(v.documentPath);
  const reviews = await prisma.review.findMany({
    where: { studentId: student.id },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.conversation.deleteMany({
      where: { OR: [{ review: { studentId: student.id } }, { askerStudentId: student.id }] },
    }),
    ...reviews.map((r) =>
      prisma.review.update({
        where: { id: r.id },
        data: { studentId: null, authorEmailHash: `deleted:${r.id}`, acceptsQuestions: false },
      }),
    ),
    prisma.student.delete({ where: { id: student.id } }),
  ]);
  await revokeAllSessions('STUDENT', student.id);
  const session = await studentSession();
  session.destroy();
  redirect('/?compte=supprime');
}
