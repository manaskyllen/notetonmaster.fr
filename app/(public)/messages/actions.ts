'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentStudent } from '@/lib/auth/student';
import { consumeToken } from '@/lib/auth/magic-link';
import { decrypt, encrypt, hashEmail, hmac, normalizeEmail } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { fieldErrors } from '@/lib/form';
import {
  canAskQuestions,
  loadConversation,
  maskIfEnabled,
  newAlias,
  notifyRecipient,
  postMessage,
} from '@/lib/messaging/service';
import { DAY, HOUR, rateLimit } from '@/lib/rate-limit';
import { withReference } from '@/lib/reports';
import { turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { clientIp, logConnection } from '@/lib/request';
import { getSettings } from '@/lib/settings';
import { MESSAGE_REPORT_REASONS, questionSchema, replySchema } from '@/lib/validation';

type Result =
  | { ok: true; masked?: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** "Poser une question" on a review open to questions. */
export async function askQuestion(input: unknown): Promise<Result> {
  const student = await getCurrentStudent();
  const raw = input as Record<string, unknown>;
  const parsed = questionSchema.safeParse({
    ...raw,
    email: student ? decrypt(student.emailEnc) : raw.email,
  });
  if (!parsed.success)
    return {
      ok: false,
      error: 'Certains champs sont à corriger.',
      fieldErrors: fieldErrors(parsed.error),
    };
  const human = await verifyTurnstile('question', turnstileTokenOf(input));
  if (!human.ok) return { ok: false, error: human.message };
  const { reviewId, message } = parsed.data;
  if (!(await canAskQuestions(reviewId)))
    return {
      ok: false,
      error: 'L’auteur·rice de cet avis ne reçoit pas de questions pour le moment.',
    };
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { studentId: true },
  });
  if (student && review?.studentId === student.id)
    return { ok: false, error: 'Tu ne peux pas te poser une question à toi-même.' };

  const email = normalizeEmail(parsed.data.email);
  const emailHash = hashEmail(email);
  const settings = await getSettings();
  if (settings['chat.limitEnabled']) {
    const since = new Date(Date.now() - DAY);
    const count = await prisma.conversation.count({
      where: { askerEmailHash: emailHash, createdAt: { gte: since } },
    });
    if (count >= settings['chat.limitPerDay'])
      return {
        ok: false,
        error: `Tu as déjà ouvert ${count} conversations aujourd’hui. Réessaie demain.`,
      };
  }
  if (!(await rateLimit(`ask-ip:${await clientIp()}`, 10, HOUR)))
    return {
      ok: false,
      error: 'Trop de questions envoyées depuis cette connexion. Réessaie plus tard.',
    };

  const masked = await maskIfEnabled(message);
  const conv = await prisma.conversation.create({
    data: {
      reviewId,
      askerEmailEnc: encrypt(email),
      askerEmailHash: emailHash,
      askerStudentId: student?.id ?? null,
      alias: await newAlias(reviewId),
      messages: {
        create: { fromRole: 'ASKER', body: masked.text, hadMaskedContent: masked.masked },
      },
    },
  });
  await logConnection('MESSAGE_SENT', emailHash);
  await notifyRecipient(conv.id, 'ASKER', masked.text, true);
  return { ok: true, masked: masked.masked };
}

/** Which side of the conversation the logged-in student is on. */
async function myRole(conversationId: string) {
  const student = await getCurrentStudent();
  if (!student) return null;
  const c = await loadConversation(conversationId);
  if (!c) return null;
  if (c.review.studentId === student.id) return { c, role: 'AUTHOR' as const, student };
  if (c.askerStudentId === student.id) return { c, role: 'ASKER' as const, student };
  return null;
}

export async function replyInSpace(conversationId: string, message: string): Promise<Result> {
  const me = await myRole(conversationId);
  if (!me) return { ok: false, error: 'Conversation introuvable.' };
  const parsed = replySchema.safeParse({ message });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Message invalide.' };
  if (me.c.status !== 'OPEN')
    return {
      ok: false,
      error:
        me.c.status === 'BLOCKED'
          ? 'Cette conversation est bloquée.'
          : 'Cette conversation est fermée.',
    };
  if (!(await rateLimit(`msg:${me.student.id}`, 30, HOUR)))
    return { ok: false, error: 'Trop de messages envoyés. Fais une pause.' };
  const r = await postMessage(conversationId, me.role, parsed.data.message);
  revalidatePath('/espace');
  return { ok: true, masked: r.masked };
}

/** « Messages précédents »: the 30 messages before `beforeId` (cursor) of a conversation. */
export async function olderMessages(conversationId: string, beforeId: string) {
  const student = await getCurrentStudent();
  if (!student) return { messages: [], hasMore: false };
  const { getConversationThread } = await import('@/lib/messaging/queries');
  const t = await getConversationThread(student.id, conversationId, beforeId);
  return t
    ? { messages: t.conversation.messages, hasMore: t.hasMore }
    : { messages: [], hasMore: false };
}

export async function markRead(conversationId: string): Promise<void> {
  const me = await myRole(conversationId);
  if (!me) return;
  await prisma.message.updateMany({
    where: { conversationId, fromRole: me.role === 'AUTHOR' ? 'ASKER' : 'AUTHOR', readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/espace');
}

/** The author can block (the sender can no longer write) and unblock. */
export async function setBlocked(conversationId: string, blocked: boolean): Promise<Result> {
  const me = await myRole(conversationId);
  if (!me || me.role !== 'AUTHOR')
    return { ok: false, error: 'Seul·e l’auteur·rice de l’avis peut bloquer cette conversation.' };
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: blocked ? 'BLOCKED' : 'OPEN' },
  });
  revalidatePath('/espace');
  return { ok: true };
}

/** Reports the last message of the other party (creates a MESSAGE report). */
export async function reportConversation(
  conversationId: string,
  reason: string,
): Promise<Result & { reference?: string }> {
  const me = await myRole(conversationId);
  if (!me) return { ok: false, error: 'Conversation introuvable.' };
  const key = z
    .enum(Object.keys(MESSAGE_REPORT_REASONS) as [keyof typeof MESSAGE_REPORT_REASONS])
    .safeParse(reason);
  if (!key.success) return { ok: false, error: 'Choisis un motif.' };
  const last = await prisma.message.findFirst({
    where: { conversationId, fromRole: me.role === 'AUTHOR' ? 'ASKER' : 'AUTHOR' },
    orderBy: { createdAt: 'desc' },
  });
  if (!last) return { ok: false, error: 'Rien à signaler dans cette conversation.' };
  const report = await withReference('SIG', (reference) =>
    prisma.report.create({
      data: {
        reference,
        targetType: 'MESSAGE',
        targetId: last.id,
        reason: MESSAGE_REPORT_REASONS[key.data],
        details: `Signalé par ${me.role === 'AUTHOR' ? 'l’auteur·rice de l’avis' : 'la personne qui a posé la question'}.`,
        reporterKey: hmac(`reporter:${me.student.id}`),
      },
    }),
  );
  return { ok: true, reference: report.reference };
}

/** Reply through a single-use link (participant without account). */
export async function replyWithToken(token: string, message: string): Promise<Result> {
  const parsed = replySchema.safeParse({ message });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Message invalide.' };
  const row = await consumeToken(token, 'REPLY');
  const payload = row?.payload as { conversationId?: string; role?: 'AUTHOR' | 'ASKER' } | null;
  if (!row || !payload?.conversationId || !payload.role)
    return { ok: false, error: 'Ce lien a expiré ou a déjà servi.' };
  const c = await prisma.conversation.findUnique({ where: { id: payload.conversationId } });
  if (!c) return { ok: false, error: 'Conversation introuvable.' };
  if (c.status !== 'OPEN') return { ok: false, error: 'Cette conversation est fermée.' };
  const r = await postMessage(c.id, payload.role, parsed.data.message);
  await logConnection('MESSAGE_SENT', row.emailHash);
  return { ok: true, masked: r.masked };
}
