import 'server-only';
import { appUrl } from '@/emails/Layout';
import { responsePublishedMail } from '@/emails/templates';
import { audit } from '@/lib/audit';
import { decrypt } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { maskContacts } from '@/lib/domain/masking';
import { sendMailSafe } from '@/lib/mail/send';

/**
 * Droit de réponse (feature 5): one public reply per review, from the establishment of its
 * parcours. A new text goes (back) to moderation; contact details are masked as in the messaging.
 */
export async function saveResponse(
  responder: { id: string; universityIds: string[] },
  reviewId: string,
  body: string,
): Promise<{ ok: true; status: 'PENDING'; slug: string } | { ok: false; error: string }> {
  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      status: 'PUBLISHED',
      program: { universityId: { in: responder.universityIds } },
    },
    select: {
      id: true,
      program: { select: { slug: true } },
      response: { select: { id: true, responderId: true, status: true } },
    },
  });
  if (!review)
    return { ok: false, error: 'Cet avis ne concerne pas un parcours de votre établissement.' };
  // one reply per review; a refused reply of a colleague does not lock the review
  if (
    review.response &&
    review.response.responderId !== responder.id &&
    review.response.status !== 'REJECTED'
  )
    return {
      ok: false,
      error: 'Une réponse a déjà été déposée sous cet avis : une seule par avis.',
    };
  const { text, masked } = maskContacts(body);
  if (review.response)
    await prisma.reviewResponse.update({
      where: { id: review.response.id },
      data: {
        responderId: responder.id,
        body: text,
        hadMaskedContent: masked,
        status: 'PENDING',
        editedAt: new Date(),
        reason: null,
        moderatedAt: null,
        moderatedById: null,
      },
    });
  else
    await prisma.reviewResponse.create({
      data: {
        reviewId: review.id,
        responderId: responder.id,
        body: text,
        hadMaskedContent: masked,
      },
    });
  return { ok: true, status: 'PENDING', slug: review.program.slug };
}

/**
 * Droit de réponse: publish the reply under the review (the author of the review is told when we
 * can reach them), or refuse it with a reason (shown to the team on /reponse-formation).
 */
export async function decideReviewResponse(
  admin: { id: string; name: string },
  id: string,
  action: string,
  reason: string,
): Promise<
  | { ok: true; message: string; programId?: string; notified?: boolean }
  | { ok: false; error: string }
> {
  const r = await prisma.reviewResponse.findUnique({
    where: { id },
    include: {
      review: {
        select: {
          ref: true,
          programId: true,
          contactEmailEnc: true,
          program: { select: { title: true, slug: true } },
          student: { select: { emailEnc: true, deletedAt: true, notifyReviewStatus: true } },
        },
      },
    },
  });
  if (!r || r.status !== 'PENDING') return { ok: false, error: 'Réponse déjà traitée.' };
  if (action === 'publish') {
    await prisma.reviewResponse.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        moderatedById: admin.id,
        moderatedAt: new Date(),
        reason: null,
      },
    });
    const s = r.review.student;
    const to =
      s && !s.deletedAt
        ? s.notifyReviewStatus
          ? decrypt(s.emailEnc)
          : null
        : r.review.contactEmailEnc
          ? decrypt(r.review.contactEmailEnc)
          : null;
    if (to)
      await sendMailSafe(
        to,
        responsePublishedMail({
          programTitle: r.review.program.title,
          url: `${appUrl()}/parcours/${r.review.program.slug}#${r.review.ref}`,
        }),
      );
    await audit(
      admin,
      'MODERATION',
      `Réponse de formation · avis ${r.review.ref}`,
      `Publiée sous l’avis${to ? ', auteur·rice prévenu·e' : ''}.`,
    );
    return {
      ok: true,
      message: 'Réponse publiée sous l’avis.',
      programId: r.review.programId,
      notified: !!to,
    };
  }
  if (action === 'reject') {
    if (!reason) return { ok: false, error: 'Indique un motif.' };
    await prisma.reviewResponse.update({
      where: { id },
      data: { status: 'REJECTED', moderatedById: admin.id, moderatedAt: new Date(), reason },
    });
    await audit(
      admin,
      'MODERATION',
      `Réponse de formation · avis ${r.review.ref}`,
      `Refusée : ${reason}`,
    );
    return { ok: true, message: 'Réponse refusée.', programId: r.review.programId };
  }
  return { ok: false, error: 'Action inconnue.' };
}
