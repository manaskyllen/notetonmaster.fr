'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { appUrl } from '@/emails/Layout';
import {
  legalDecisionMail,
  messageWarningMail,
  reportDecisionMail,
  reviewDecisionMail,
  verificationResultMail,
} from '@/emails/templates';
import { audit } from '@/lib/audit';
import { shortRef } from '@/lib/admin/notify';
import { guard, guardSensitive, type Admin } from '@/lib/auth/admin';
import { decrypt } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import type { ReviewStatus } from '@/lib/db/generated/enums';
import { assertTransition, canTransition } from '@/lib/domain/review-status';
import { sendMailSafe } from '@/lib/mail/send';
import { refreshVerifiedForStudent, computeVerified } from '@/lib/reviews/verified';
import { deleteDocument } from '@/lib/uploads';
import { grantProgramVerification } from '@/lib/verification';
import { afterReviewChange } from '@/lib/cache/next';
import { decideReviewResponse } from '@/lib/responses';
import { decidePublic } from '@/lib/questions';
import { expireTags } from '@/lib/cache/next';
import { TAGS } from '@/lib/cache/tags';

type Result = { ok: true; message: string } | { ok: false; error: string };

const input = z.object({
  kind: z.enum(['avis', 'justif', 'msg', 'signal', 'reponses', 'questions', 'contact', 'legal']),
  id: z.string().min(1),
  action: z.string().min(1),
  reason: z.string().trim().max(1000).default(''),
  /** Documents: other programs the same document also validates. */
  alsoPrograms: z.array(z.string().min(1)).max(20).default([]),
});

/** Single entry point: one decision on one queue item. Every decision is audited and notified. */
export async function moderate(raw: unknown): Promise<Result> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Requête invalide.' };
  const { kind, id, action, reason, alsoPrograms } = parsed.data;
  const permission = kind === 'legal' ? 'legal.manage' : 'moderation.manage';
  // Legal requests, removals and exports ask for the code again (5 minutes).
  const sensitive = kind === 'legal' || action === 'remove' || action === 'export';
  const r = await (sensitive ? guardSensitive : guard)(permission, async (admin) => {
    switch (kind) {
      case 'avis':
        return decideReview(admin, id, action, reason);
      case 'justif':
        return decideDocument(admin, id, action, reason, alsoPrograms);
      case 'msg':
        return decideMessage(admin, id, action, reason);
      case 'signal':
        return decideReported(admin, id, action, reason);
      case 'reponses':
        return decideResponse(admin, id, action, reason);
      case 'questions': {
        const r = await decidePublic(admin, id, action, reason);
        if (r.ok) expireTags([TAGS.program(r.programId)]);
        return r.ok ? { ok: true, message: r.message } : r;
      }
      case 'contact':
        return decideContact(admin, id, action);
      case 'legal':
        return decideLegal(admin, id, action, reason);
    }
  });
  revalidatePath('/admin/moderation');
  revalidatePath('/admin', 'layout');
  return r as Result;
}

const needReason = (reason: string): Result | null =>
  reason.length < 3
    ? { ok: false, error: 'Indique le motif communiqué : il est obligatoire pour cette décision.' }
    : null;

/** Notifies the author of a review (account email or contact email of a review without account). */
async function notifyAuthor(
  reviewId: string,
  decision: 'PUBLISHED' | 'NEEDS_EDIT' | 'REJECTED' | 'HIDDEN',
  reason: string | null,
) {
  const r = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { student: true, program: { select: { title: true, slug: true } } },
  });
  if (!r) return;
  const to =
    r.student && !r.student.deletedAt
      ? decision === 'PUBLISHED' && !r.student.notifyReviewStatus
        ? null
        : decrypt(r.student.emailEnc)
      : r.contactEmailEnc
        ? decrypt(r.contactEmailEnc)
        : null;
  if (!to) return;
  await sendMailSafe(
    to,
    reviewDecisionMail({
      decision,
      programTitle: r.program.title,
      reviewTitle: r.title,
      reason,
      hasAccount: !!r.student,
      programUrl: `${appUrl()}/parcours/${r.program.slug}#${r.ref}`,
    }),
  );
}

async function setReviewStatus(
  admin: Admin,
  reviewId: string,
  to: ReviewStatus,
  reason: string | null,
) {
  const r = await prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
  assertTransition(r.status, to);
  const published = to === 'PUBLISHED';
  await prisma.review.update({
    where: { id: r.id },
    data: {
      status: to,
      moderationReason: published ? null : reason,
      moderatedById: admin.id,
      moderatedAt: new Date(),
      publishedAt: published ? (r.publishedAt ?? new Date()) : r.publishedAt,
      hiddenAt: to === 'HIDDEN' ? new Date() : r.hiddenAt,
      isVerified: published ? await computeVerified(r) : r.isVerified,
    },
  });
  if (published || r.status === 'PUBLISHED') await afterReviewChange([r.programId]);
  return r;
}

async function decideReview(
  admin: Admin,
  id: string,
  action: string,
  reason: string,
): Promise<Result> {
  const r = await prisma.review.findUnique({
    where: { id },
    include: { program: { select: { title: true, slug: true } } },
  });
  if (!r || r.status !== 'PENDING') return { ok: false, error: 'Cet avis n’est plus en attente.' };
  if (action === 'publish') {
    await setReviewStatus(admin, id, 'PUBLISHED', null);
    await audit(admin, 'MODERATION', r.ref, `Avis publié · ${r.program.title}`, {
      action: 'a publié l’avis',
      target: { type: 'REVIEW', id: r.id },
      diff: [{ field: 'Statut', before: 'En attente', after: 'Publié' }],
    });
    await notifyAuthor(id, 'PUBLISHED', null);
    // Followers get the weekly digest (worker/schedule.ts, weeklyDigest).
    return { ok: true, message: 'Avis publié.' };
  }
  const missing = needReason(reason);
  if (missing) return missing;
  const to = action === 'needs_edit' ? 'NEEDS_EDIT' : action === 'reject' ? 'REJECTED' : null;
  if (!to) return { ok: false, error: 'Action inconnue.' };
  await setReviewStatus(admin, id, to, reason);
  await audit(
    admin,
    'MODERATION',
    r.ref,
    `${to === 'NEEDS_EDIT' ? 'Reformulation demandée' : 'Avis refusé'} · motif : ${reason}`,
    {
      action: to === 'NEEDS_EDIT' ? 'a demandé une reformulation de l’avis' : 'a refusé l’avis',
      target: { type: 'REVIEW', id: r.id },
      diff: [
        {
          field: 'Statut',
          before: 'En attente',
          after: to === 'NEEDS_EDIT' ? 'À reformuler' : 'Refusé',
        },
      ],
    },
  );
  await notifyAuthor(id, to, reason);
  return {
    ok: true,
    message:
      to === 'NEEDS_EDIT'
        ? 'Demande de reformulation envoyée à l’auteur.'
        : 'Avis rejeté, motif envoyé.',
  };
}

async function decideDocument(
  admin: Admin,
  id: string,
  action: string,
  reason: string,
  alsoPrograms: string[] = [],
): Promise<Result> {
  const v = await prisma.programVerification.findUnique({
    where: { id },
    include: { student: true, program: { select: { title: true } } },
  });
  if (!v || v.status !== 'PENDING')
    return { ok: false, error: 'Ce justificatif a déjà été traité.' };
  const status =
    action === 'approve'
      ? 'APPROVED'
      : action === 'more_info'
        ? 'MORE_INFO'
        : action === 'reject'
          ? 'REJECTED'
          : null;
  if (!status) return { ok: false, error: 'Action inconnue.' };
  if (status !== 'APPROVED') {
    const missing = needReason(reason);
    if (missing) return missing;
  }
  // The file is deleted as soon as a decision is made, whatever it is.
  await deleteDocument(v.documentPath);
  await prisma.programVerification.update({
    where: { id },
    data: {
      status,
      // The file and its original name (often the student's name) go with the decision.
      documentPath: null,
      documentName: null,
      decidedById: admin.id,
      decidedAt: new Date(),
      reason: reason || null,
    },
  });
  let extra = 0;
  if (status === 'APPROVED') {
    // The same document may name other masters of the author: ticked ones are validated too.
    const reviewed = await prisma.review.findMany({
      where: { studentId: v.studentId, programId: { in: alsoPrograms } },
      select: { programId: true },
    });
    for (const programId of new Set(reviewed.map((r) => r.programId))) {
      await grantProgramVerification({
        studentId: v.studentId,
        programId,
        method: 'DOCUMENT',
        documentId: v.documentId ?? v.id,
        documentType: v.documentType,
        decidedById: admin.id,
      });
      extra++;
    }
    await refreshVerifiedForStudent(v.studentId);
  }
  await audit(
    admin,
    'MODERATION',
    `Justificatif · ${v.program.title}${extra ? ` (+${extra} autre${extra > 1 ? 's' : ''} master${extra > 1 ? 's' : ''})` : ''}`,
    `${status === 'APPROVED' ? 'Badge accordé' : status === 'MORE_INFO' ? 'Autre document demandé' : 'Justificatif refusé'}${reason ? ` · motif : ${reason}` : ''} · document supprimé`,
  );
  await sendMailSafe(
    decrypt(v.student.emailEnc),
    verificationResultMail({
      approved: status === 'APPROVED',
      moreInfo: status === 'MORE_INFO',
      reason: reason || null,
    }),
  );
  return {
    ok: true,
    message:
      status === 'APPROVED'
        ? `Badge accordé${extra ? ` pour ${extra + 1} masters` : ''}, document supprimé.`
        : 'Décision envoyée, document supprimé.',
  };
}

async function decideMessage(
  admin: Admin,
  messageId: string,
  action: string,
  reason: string,
): Promise<Result> {
  const missing = needReason(reason);
  if (missing) return missing;
  const m = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });
  if (!m) return { ok: false, error: 'Message introuvable.' };
  const status = action === 'dismiss' ? 'DISMISSED' : action === 'warn' ? 'UPHELD' : 'ACTIONED';
  if (action === 'suspend')
    await prisma.conversation.update({
      where: { id: m.conversationId },
      data: { status: 'CLOSED' },
    });
  if (action === 'warn' && m.fromRole === 'ASKER')
    await sendMailSafe(decrypt(m.conversation.askerEmailEnc), messageWarningMail({ reason }));
  await prisma.report.updateMany({
    where: { targetType: 'MESSAGE', targetId: messageId, status: 'OPEN' },
    data: {
      status,
      decidedById: admin.id,
      decidedAt: new Date(),
      decision: action,
      decisionReason: reason,
    },
  });
  await audit(
    admin,
    'MODERATION',
    `Conversation ${m.conversation.alias}`,
    `${action === 'suspend' ? 'Expéditeur suspendu, conversation fermée' : action === 'warn' ? 'Avertissement envoyé' : 'Signalement classé sans suite'} · motif : ${reason}`,
  );
  return {
    ok: true,
    message:
      action === 'suspend'
        ? 'Expéditeur suspendu, conversation fermée.'
        : action === 'warn'
          ? 'Avertissement envoyé.'
          : 'Signalement classé.',
  };
}

async function decideReported(
  admin: Admin,
  reviewId: string,
  action: string,
  reason: string,
): Promise<Result> {
  const missing = needReason(reason);
  if (missing) return missing;
  const r = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!r) return { ok: false, error: 'Avis introuvable.' };
  const reports = await prisma.report.findMany({
    where: { targetType: 'REVIEW', targetId: reviewId, status: 'OPEN' },
  });
  let message: string;
  let decision: string;
  if (action === 'keep') {
    if (r.status === 'HIDDEN') await setReviewStatus(admin, reviewId, 'PUBLISHED', null);
    decision = 'l’avis est maintenu';
    message = 'Avis maintenu, signalants informés.';
  } else if (action === 'hide') {
    if (r.status === 'PUBLISHED') await setReviewStatus(admin, reviewId, 'HIDDEN', reason);
    await audit(admin, 'MODERATION', r.ref, `Avis masqué temporairement · motif : ${reason}`);
    return { ok: true, message: 'Avis masqué temporairement. Les signalements restent ouverts.' };
  } else if (action === 'remove') {
    if (canTransition(r.status, 'REJECTED'))
      await setReviewStatus(admin, reviewId, 'REJECTED', reason);
    else if (r.status === 'PUBLISHED') await setReviewStatus(admin, reviewId, 'HIDDEN', reason);
    await notifyAuthor(reviewId, 'HIDDEN', reason);
    decision = 'l’avis est retiré';
    message = 'Avis retiré, auteur informé.';
  } else return { ok: false, error: 'Action inconnue.' };
  await prisma.report.updateMany({
    where: { id: { in: reports.map((x) => x.id) } },
    data: {
      status: action === 'keep' ? 'UPHELD' : 'ACTIONED',
      decidedById: admin.id,
      decidedAt: new Date(),
      decision: action,
      decisionReason: reason,
    },
  });
  for (const rep of reports)
    if (rep.reporterEmailEnc)
      await sendMailSafe(
        decrypt(rep.reporterEmailEnc),
        reportDecisionMail({ reference: rep.reference, decision, reason }),
      );
  await audit(
    admin,
    'MODERATION',
    r.ref,
    `Signalements traités (${reports.length}) : ${decision} · motif : ${reason}`,
  );
  return { ok: true, message };
}

/** A message of the contact form, answered from the contact mailbox: marked as handled. */
async function decideContact(admin: Admin, id: string, action: string): Promise<Result> {
  if (action !== 'handled') return { ok: false, error: 'Action inconnue.' };
  const r = await prisma.contactMessage.updateMany({
    where: { id, handledAt: null },
    data: { handledAt: new Date() },
  });
  if (!r.count) return { ok: false, error: 'Message déjà traité.' };
  await audit(admin, 'MODERATION', shortRef('CON', id), 'Message de contact traité');
  return { ok: true, message: 'Message marqué comme traité.' };
}

async function decideLegal(
  admin: Admin,
  id: string,
  action: string,
  reason: string,
): Promise<Result> {
  const l = await prisma.legalRequest.findUnique({ where: { id } });
  if (!l || l.status === 'CLOSED') return { ok: false, error: 'Demande déjà close.' };
  const requester = decrypt(l.requesterEmailEnc);
  if (action === 'transmit' || action === 'assign') {
    const legal = await prisma.adminUser.findFirst({
      where: { role: 'LEGAL', removedAt: null, passwordHash: { not: null } },
    });
    await prisma.legalRequest.update({
      where: { id },
      data: { status: 'IN_REVIEW', assignedToId: legal?.id ?? admin.id },
    });
    await audit(
      admin,
      'LEGAL',
      l.reference,
      action === 'transmit'
        ? 'Dossier transmis pour analyse juridique'
        : `Dossier assigné au rôle Légal${legal ? ` (${legal.name})` : ''}`,
    );
    return { ok: true, message: 'Dossier assigné.' };
  }
  if (action === 'export') {
    await audit(admin, 'LEGAL', l.reference, 'Export des données de connexion préparé');
    return { ok: true, message: 'Export prêt : utilise le lien « Télécharger l’export ».' };
  }
  const missing = needReason(reason);
  if (missing) return missing;
  let decision = '';
  if (action === 'remove') {
    const ref = /avis-[0-9a-f]{6}/.exec(l.contentUrl)?.[0];
    const review = ref ? await prisma.review.findUnique({ where: { ref } }) : null;
    if (review && canTransition(review.status, 'REJECTED'))
      await setReviewStatus(admin, review.id, 'REJECTED', reason);
    else if (review && review.status === 'PUBLISHED')
      await setReviewStatus(admin, review.id, 'HIDDEN', reason);
    if (review) await notifyAuthor(review.id, 'HIDDEN', reason);
    decision = review ? 'le contenu a été retiré' : 'aucun contenu correspondant trouvé';
  } else if (action === 'refuse') decision = 'le contenu n’est pas retiré';
  else if (action === 'close') decision = 'le dossier est clos';
  else return { ok: false, error: 'Action inconnue.' };
  await prisma.legalRequest.update({
    where: { id },
    data: {
      status: 'CLOSED',
      decision,
      decisionReason: reason,
      decidedById: admin.id,
      decidedAt: new Date(),
    },
  });
  await sendMailSafe(requester, legalDecisionMail({ reference: l.reference, decision, reason }));
  await audit(admin, 'LEGAL', l.reference, `Décision : ${decision} · motif : ${reason}`);
  return { ok: true, message: 'Décision motivée envoyée au demandeur.' };
}

async function decideResponse(
  admin: Admin,
  id: string,
  action: string,
  reason: string,
): Promise<Result> {
  const r = await decideReviewResponse(admin, id, action, reason);
  if (r.ok && r.programId) await afterReviewChange([r.programId]);
  return r.ok ? { ok: true, message: r.message } : r;
}
