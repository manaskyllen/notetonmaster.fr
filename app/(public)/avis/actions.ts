'use server';

import { appUrl } from '@/emails/Layout';
import { confirmReviewMail, magicLinkMail, reviewDuplicateMail } from '@/emails/templates';
import { consumeCode, consumeToken, createLinkAndCode } from '@/lib/auth/magic-link';
import { getCurrentStudent } from '@/lib/auth/student';
import { decrypt, encrypt, hashEmail, normalizeEmail } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import type { Criterion } from '@/lib/db/generated/enums';
import { normalizeSituation } from '@/lib/domain/graduate';
import { detectNamedPerson } from '@/lib/domain/names';
import { containsContacts } from '@/lib/domain/masking';
import { normalize } from '@/lib/domain/search';
import { fieldErrors } from '@/lib/form';
import { sendMailSafe } from '@/lib/mail/send';
import { DAY, HOUR, MINUTE, rateLimit } from '@/lib/rate-limit';
import { turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { clientIp, logConnection } from '@/lib/request';
import { computeVerified } from '@/lib/reviews/verified';
import { newReviewRef } from '@/lib/reviews/ref';
import { getSettings } from '@/lib/settings';
import { reviewSchema } from '@/lib/validation';
import { afterReviewChange } from '@/lib/cache/next';

export type SubmitResult =
  | {
      ok: true;
      mode: 'none' | 'account';
      email: string;
      loggedIn: boolean;
      wantsBadge: boolean;
      acceptsQuestions: boolean;
    }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> };

export async function submitReview(input: unknown): Promise<SubmitResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      fieldErrors: fieldErrors(parsed.error),
      message: 'Certains champs sont à corriger.',
    };
  const d = parsed.data;
  // « Qu'est-ce qui t'a fait partir ? » belongs to LEFT only.
  const leaveReason = (d.level === 'LEFT' && d.leaveReason?.trim()) || null;
  const human = await verifyTurnstile('review', turnstileTokenOf(input));
  if (!human.ok) return { ok: false, message: human.message };
  const settings = await getSettings();
  const current = await getCurrentStudent();
  const email =
    current && d.mode === 'account' ? decrypt(current.emailEnc) : normalizeEmail(d.email);
  const emailHash = hashEmail(email);

  if (d.mode === 'none' && !settings['moderation.anonymousReviews'])
    return {
      ok: false,
      message: 'Les avis sans compte sont temporairement désactivés. Choisis « Avec mon espace ».',
    };

  if (settings['moderation.nameDetection']) {
    const hit = detectNamedPerson(d.title, d.pros, d.cons, leaveReason);
    if (hit.found)
      return {
        ok: false,
        message: `Ton texte semble citer une personne (« ${hit.matches[0]} »). Parle plutôt du cours ou de l’organisation.`,
        fieldErrors: { pros: 'Retire le nom de la personne.' },
      };
    if (detectNamedPerson(d.jobTitle).found)
      return {
        ok: false,
        message:
          'Ton poste semble citer une personne. Indique seulement un intitulé et un type de structure.',
        fieldErrors: { jobTitle: 'Retire le nom de la personne.' },
      };
  }

  const program = await prisma.program.findFirst({
    where: { slug: d.programSlug, isPublished: true },
    select: { id: true, title: true, inOpenZone: true },
  });
  if (!program) return { ok: false, fieldErrors: { programSlug: 'Ce master est introuvable.' } };
  // Launch limited to some cities: no review on a parcours that is not published there yet.
  if (!program.inOpenZone)
    return {
      ok: false,
      fieldErrors: {
        programSlug:
          'Ce master n’est pas encore sur notetonmaster : sa ville n’est pas encore ouverte.',
      },
    };

  const allowed =
    (await rateLimit(`review-ip:${await clientIp()}`, 10, DAY)) &&
    (await rateLimit(`review:${emailHash}`, 3, HOUR));
  if (!allowed)
    return {
      ok: false,
      message: 'Trop d’avis envoyés depuis cette connexion. Réessaie plus tard.',
    };

  // The address is proven only by a session of its own (« avec mon espace » while logged in).
  // Otherwise nothing may tell the visitor whether this address already reviewed this parcours:
  // the answer is the one of any review, and the owner of the address is told by mail.
  const proven = !!current && d.mode === 'account';
  const existing = await prisma.review.findUnique({
    where: { programId_authorEmailHash: { programId: program.id, authorEmailHash: emailHash } },
    select: { id: true, status: true },
  });
  if (existing?.status === 'PENDING_CONFIRMATION' && !proven) {
    // Never confirmed: no right attached to it, the new review (its owner's or not) replaces it.
    await prisma.review.delete({ where: { id: existing.id } });
  } else if (existing) {
    if (proven)
      return {
        ok: false,
        message:
          existing.status === 'NEEDS_EDIT'
            ? 'Tu as déjà un avis à reformuler sur ce parcours : modifie-le depuis ton espace.'
            : 'Tu as déjà donné un avis sur ce parcours (un seul avis par parcours).',
      };
    await sendMailSafe(
      email,
      reviewDuplicateMail({
        programTitle: program.title,
        needsEdit: existing.status === 'NEEDS_EDIT',
        spaceUrl: `${appUrl()}/connexion`,
      }),
    );
    await logConnection('REVIEW_SUBMIT', emailHash);
    return neutralAnswer(d, email, !!current);
  }

  // « Avec mon espace » without a session: the review waits for the code (or link) of the login
  // mail, which proves the address; only then is the space created and the review attached.
  const student = proven ? current : null;
  const watched = (settings['moderation.watchTerms'] as string[])
    .map(normalize)
    .some(
      (w) =>
        w && normalize(`${d.title ?? ''} ${d.pros} ${d.cons} ${leaveReason ?? ''}`).includes(w),
    );
  const autoPublish =
    settings['moderation.autoPublish'] &&
    !watched &&
    !containsContacts(`${d.pros} ${d.cons} ${leaveReason ?? ''}`);
  const status = !student ? 'PENDING_CONFIRMATION' : autoPublish ? 'PUBLISHED' : 'PENDING';
  const scores = Object.entries(d.scores).filter(
    (e): e is [string, number] => typeof e[1] === 'number',
  );

  const review = await prisma.review.create({
    data: {
      ref: await newReviewRef(),
      programId: program.id,
      studentId: student?.id ?? null,
      authorEmailHash: emailHash,
      contactEmailEnc: d.mode === 'none' ? encrypt(email) : null,
      level: d.level,
      ...normalizeSituation(d),
      cohortYear: d.cohortYear,
      overallRating: d.overallRating,
      title: d.title || null,
      pros: d.pros,
      cons: d.cons,
      leaveReason,
      status,
      acceptsQuestions: d.acceptsQuestions,
      wantsBadge: d.mode === 'account' && d.wantsBadge,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      scores: {
        create: scores.map(([criterion, score]) => ({ criterion: criterion as Criterion, score })),
      },
    },
  });
  if (status === 'PUBLISHED') {
    await prisma.review.update({
      where: { id: review.id },
      data: { isVerified: await computeVerified(review) },
    });
    await afterReviewChange([program.id]);
  }
  if (student)
    await prisma.student.update({
      where: { id: student.id },
      // Level of the identity card in Mon espace: the latest review's.
      data: { level: d.level, ...(d.acceptsQuestions ? { acceptsQuestions: true } : {}) },
    });
  await logConnection('REVIEW_SUBMIT', emailHash);

  if (d.mode === 'none') await sendReviewConfirmation(email, emailHash, review.id, program.title);
  else if (!student) {
    const { token, code } = await createLinkAndCode({
      emailHash,
      purpose: 'LOGIN',
      payload: {
        emailEnc: encrypt(email),
        confirmReviewId: review.id,
        next: d.wantsBadge ? `/espace/verification?parcours=${d.programSlug}` : '/espace',
      },
    });
    await sendMailSafe(
      email,
      magicLinkMail({ url: `${appUrl()}/connexion/lien/${token}`, code, reviewPending: true }),
    );
  }

  return neutralAnswer(d, email, !!current);
}

/** The answer of a review sent: the same whether it was recorded or was a duplicate. */
function neutralAnswer(
  d: { mode: 'none' | 'account'; wantsBadge: boolean; acceptsQuestions: boolean },
  email: string,
  loggedIn: boolean,
): SubmitResult {
  return {
    ok: true,
    mode: d.mode,
    email,
    loggedIn,
    wantsBadge: d.wantsBadge,
    acceptsQuestions: d.acceptsQuestions,
  };
}

async function sendReviewConfirmation(
  email: string,
  emailHash: string,
  reviewId: string,
  programTitle: string,
) {
  const { token, code } = await createLinkAndCode({
    emailHash,
    purpose: 'CONFIRM_REVIEW',
    payload: { reviewId },
    scope: { key: 'reviewId', value: reviewId },
  });
  await sendMailSafe(
    email,
    confirmReviewMail({ url: `${appUrl()}/avis/confirmer/${token}`, code, programTitle }),
  );
}

type Confirmed = { error: string } | { ok: true; published: boolean };

/** A review sent without account enters moderation (or is published if auto-publish is on). */
async function activateReview(reviewId: string): Promise<Confirmed> {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.status !== 'PENDING_CONFIRMATION')
    return { error: 'Cet avis est déjà confirmé.' };
  const autoPublish = (await getSettings())['moderation.autoPublish'];
  await prisma.review.update({
    where: { id: review.id },
    data: {
      status: autoPublish ? 'PUBLISHED' : 'PENDING',
      submittedAt: new Date(),
      publishedAt: autoPublish ? new Date() : null,
    },
  });
  if (autoPublish) await afterReviewChange([review.programId]);
  return { ok: true, published: autoPublish };
}

/** « Confirmer sur cet appareil »: the button of the confirmation page consumes the link. */
export async function confirmReview(token: string): Promise<Confirmed> {
  const row = await consumeToken(token, 'CONFIRM_REVIEW');
  const reviewId = (row?.payload as { reviewId?: string } | null)?.reviewId;
  if (!row || !reviewId) return { error: 'Ce lien a expiré ou a déjà servi.' };
  return activateReview(reviewId);
}

/** The review awaiting confirmation for this address and master, if any. */
async function pendingReview(rawEmail: unknown, programSlug: unknown) {
  if (typeof rawEmail !== 'string' || typeof programSlug !== 'string') return null;
  const emailHash = hashEmail(normalizeEmail(rawEmail));
  const review = await prisma.review.findFirst({
    where: {
      authorEmailHash: emailHash,
      program: { slug: programSlug },
      status: 'PENDING_CONFIRMATION',
    },
    select: { id: true, program: { select: { title: true } } },
  });
  return review ? { ...review, emailHash, email: normalizeEmail(rawEmail) } : null;
}

const CONFIRM_CODE_FAILED =
  'Ce code n’est pas valide ou a expiré. Vérifie-le, ou demande un nouveau code.';

/** The 6 digits typed on the « Merci » screen of a review sent without account. */
export async function confirmReviewByCode(
  email: string,
  programSlug: string,
  code: string,
): Promise<Confirmed> {
  if (!(await rateLimit(`review-code-ip:${await clientIp()}`, 30, 15 * MINUTE)))
    return { error: 'Trop d’essais depuis cette connexion. Réessaie dans quelques minutes.' };
  // One answer for every failure: it must not tell whether a review awaits confirmation for
  // this address and this master.
  const review = await pendingReview(email, programSlug);
  if (!review) return { error: CONFIRM_CODE_FAILED };
  const r = await consumeCode({
    emailHash: review.emailHash,
    purpose: 'CONFIRM_REVIEW',
    code,
    scope: { key: 'reviewId', value: review.id },
  });
  if ('error' in r) return { error: CONFIRM_CODE_FAILED };
  return activateReview(review.id);
}

/** « Renvoyer un code » on the « Merci » screen (Turnstile, 5 per hour). */
export async function resendReviewCode(
  email: string,
  programSlug: string,
  turnstileToken?: string,
): Promise<string | null> {
  const human = await verifyTurnstile('review', turnstileToken);
  if (!human.ok) return human.message;
  const review = await pendingReview(email, programSlug);
  // Nothing to resend: same answer as a resend, nothing tells whether a review awaits.
  if (!review) return null;
  if (
    !(await rateLimit(`review-code:${review.emailHash}`, 5, HOUR)) ||
    !(await rateLimit(`review-code-resend:${review.emailHash}`, 1, 30_000))
  )
    return 'Trop de codes demandés. Réessaie un peu plus tard.';
  await sendReviewConfirmation(review.email, review.emailHash, review.id, review.program.title);
  return null;
}
