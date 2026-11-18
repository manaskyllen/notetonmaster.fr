import 'server-only';
import { appUrl } from '@/emails/Layout';
import { questionReceivedMail, replyReceivedMail } from '@/emails/templates';
import { createToken, REPLY_TTL_MS, revokeTokens } from '@/lib/auth/magic-link';
import { decrypt, hashEmail } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import type { MessageRole } from '@/lib/db/generated/enums';
import { conversationAlias } from '@/lib/domain/references';
import { maskContacts } from '@/lib/domain/masking';
import { sendMailSafe } from '@/lib/mail/send';
import { getSettings } from '@/lib/settings';

/**
 * Contact details are always masked in the private messaging, on the server, before storage:
 * no setting switches it off (the messaging puts strangers in touch).
 */
export async function maskIfEnabled(text: string) {
  return maskContacts(text);
}

/** Alias unique within the review ("Étudiant·e anonyme #4F2"). */
export async function newAlias(reviewId: string) {
  for (let i = 0; i < 20; i++) {
    const alias = conversationAlias();
    if (
      !(await prisma.conversation.findFirst({ where: { reviewId, alias }, select: { id: true } }))
    )
      return alias;
  }
  return conversationAlias();
}

type Conv = NonNullable<Awaited<ReturnType<typeof loadConversation>>>;

export function loadConversation(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      review: {
        select: {
          id: true,
          title: true,
          studentId: true,
          contactEmailEnc: true,
          acceptsQuestions: true,
          student: { select: { emailEnc: true, deletedAt: true, notifyNewMessage: true } },
          program: { select: { title: true, slug: true, university: { select: { name: true } } } },
        },
      },
    },
  });
}

/** Email of each party (never shown to the other party). */
function authorEmail(c: Conv): string | null {
  if (c.review.student && !c.review.student.deletedAt) return decrypt(c.review.student.emailEnc);
  return c.review.contactEmailEnc ? decrypt(c.review.contactEmailEnc) : null;
}

/** Link the recipient uses to read/answer: their space, or a fresh single-use reply link (7 days). */
async function replyUrlFor(
  c: Conv,
  recipient: MessageRole,
  emailHash: string,
): Promise<{ url: string; hasAccount: boolean }> {
  const hasAccount =
    recipient === 'AUTHOR'
      ? !!(c.review.studentId && !c.review.student?.deletedAt)
      : !!c.askerStudentId;
  if (hasAccount) return { url: `${appUrl()}/espace/messages/${c.id}`, hasAccount };
  await revokeTokens({
    emailHash,
    purpose: 'REPLY',
    payloadKey: { path: ['conversationId'], equals: c.id },
  });
  const token = await createToken({
    emailHash,
    purpose: 'REPLY',
    ttlMs: REPLY_TTL_MS,
    payload: { conversationId: c.id, role: recipient },
  });
  return { url: `${appUrl()}/reponse/${token}`, hasAccount };
}

/** Notifies the other party of a new message. */
export async function notifyRecipient(
  conversationId: string,
  from: MessageRole,
  body: string,
  isFirstQuestion = false,
) {
  const c = await loadConversation(conversationId);
  if (!c) return;
  const recipient: MessageRole = from === 'ASKER' ? 'AUTHOR' : 'ASKER';
  const to = recipient === 'AUTHOR' ? authorEmail(c) : decrypt(c.askerEmailEnc);
  if (!to) return;
  // « Nouvelles questions sur mes avis » switched off: the message waits in the space.
  if (recipient === 'AUTHOR' && c.review.student && !c.review.student.notifyNewMessage) return;
  const { url, hasAccount } = await replyUrlFor(c, recipient, hashEmail(to));
  const mail =
    isFirstQuestion && recipient === 'AUTHOR'
      ? questionReceivedMail({
          programTitle: c.review.program.title,
          universityName: c.review.program.university.name,
          reviewTitle: c.review.title,
          question: body,
          replyUrl: url,
          hasAccount,
        })
      : replyReceivedMail({
          programTitle: c.review.program.title,
          reply: body,
          url,
          hasAccount,
          fromAuthor: from === 'AUTHOR',
        });
  await sendMailSafe(to, mail);
}

/** Posts a message in a conversation (masking contacts), updates timestamps and notifies. */
export async function postMessage(conversationId: string, from: MessageRole, raw: string) {
  const masked = await maskIfEnabled(raw.trim());
  const other: MessageRole = from === 'ASKER' ? 'AUTHOR' : 'ASKER';
  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, fromRole: from, body: masked.text, hadMaskedContent: masked.masked },
    }),
    // Answering implies having read the other party's messages.
    prisma.message.updateMany({
      where: { conversationId, fromRole: other, readAt: null },
      data: { readAt: new Date() },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    }),
  ]);
  await notifyRecipient(conversationId, from, masked.text);
  return masked;
}

/** Whether the "Poser une question" button is offered for this review. */
export async function canAskQuestions(reviewId: string) {
  if (!(await getSettings())['chat.enabled']) return false;
  const r = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      status: true,
      acceptsQuestions: true,
      student: { select: { acceptsQuestions: true, deletedAt: true } },
    },
  });
  if (!r || r.status !== 'PUBLISHED' || !r.acceptsQuestions) return false;
  return r.student ? r.student.acceptsQuestions && !r.student.deletedAt : true;
}
