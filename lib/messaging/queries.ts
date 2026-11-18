import 'server-only';
import { prisma } from '@/lib/db';

export interface ConversationView {
  id: string;
  role: 'AUTHOR' | 'ASKER';
  /** Name shown for the other party. */
  otherAlias: string;
  reviewTitle: string | null;
  programTitle: string;
  status: 'OPEN' | 'BLOCKED' | 'CLOSED';
  lastMessageAt: string;
  unread: number;
  isDemo: boolean;
  messages: { id: string; mine: boolean; body: string; createdAt: string; masked: boolean }[];
}

export const CONVERSATIONS_PER_PAGE = 20;
export const MESSAGES_PER_LOAD = 30;

const studentWhere = (studentId: string) => ({
  OR: [{ review: { studentId } }, { askerStudentId: studentId }],
});

type MessageRow = {
  id: string;
  fromRole: 'AUTHOR' | 'ASKER';
  body: string;
  createdAt: Date;
  readAt: Date | null;
  hadMaskedContent: boolean;
};

function view(
  studentId: string,
  c: {
    id: string;
    alias: string;
    status: 'OPEN' | 'BLOCKED' | 'CLOSED';
    lastMessageAt: Date;
    isDemo: boolean;
    review: { studentId: string | null; title: string | null; program: { title: string } };
  },
  messages: MessageRow[],
  unread: number,
): ConversationView {
  const role = c.review.studentId === studentId ? 'AUTHOR' : 'ASKER';
  return {
    id: c.id,
    role,
    otherAlias: role === 'AUTHOR' ? c.alias : 'Auteur·rice de l’avis',
    reviewTitle: c.review.title,
    programTitle: c.review.program.title,
    status: c.status,
    lastMessageAt: c.lastMessageAt.toISOString(),
    unread,
    isDemo: c.isDemo,
    messages: messages.map((m) => ({
      id: m.id,
      mine: m.fromRole === role,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      masked: m.hadMaskedContent,
    })),
  };
}

const MESSAGE_SELECT = {
  id: true,
  fromRole: true,
  body: true,
  createdAt: true,
  readAt: true,
  hadMaskedContent: true,
} as const;

/**
 * Conversations of a student (as author of the review or as the person who asked), latest first,
 * one page at a time, with only their last message (preview). Never exposes emails.
 */
export async function getStudentConversations(
  studentId: string,
  page: { skip?: number; take?: number } = {},
): Promise<ConversationView[]> {
  const rows = await prisma.conversation.findMany({
    where: studentWhere(studentId),
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }],
    skip: page.skip ?? 0,
    take: page.take ?? CONVERSATIONS_PER_PAGE,
    include: {
      review: { select: { studentId: true, title: true, program: { select: { title: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: MESSAGE_SELECT },
      _count: {
        select: {
          messages: { where: { readAt: null } },
        },
      },
    },
  });
  // Unread = messages from the other party: counted per role in one grouped query.
  const unread = await prisma.message.groupBy({
    by: ['conversationId', 'fromRole'],
    where: { conversationId: { in: rows.map((r) => r.id) }, readAt: null },
    _count: { _all: true },
  });
  return rows.map((c) => {
    const role = c.review.studentId === studentId ? 'AUTHOR' : 'ASKER';
    const other = role === 'AUTHOR' ? 'ASKER' : 'AUTHOR';
    const n =
      unread.find((u) => u.conversationId === c.id && u.fromRole === other)?._count._all ?? 0;
    return view(studentId, c, c.messages, n);
  });
}

export function countStudentConversations(studentId: string) {
  return prisma.conversation.count({ where: studentWhere(studentId) });
}

/**
 * One conversation with its latest messages (30), oldest first; `before` (a message id) loads the
 * 30 before it (« Messages précédents »). Null when the student is not part of it.
 */
export async function getConversationThread(
  studentId: string,
  id: string,
  before?: string,
): Promise<{ conversation: ConversationView; hasMore: boolean } | null> {
  const c = await prisma.conversation.findFirst({
    where: { id, ...studentWhere(studentId) },
    include: {
      review: { select: { studentId: true, title: true, program: { select: { title: true } } } },
    },
  });
  if (!c) return null;
  const cursor = before
    ? await prisma.message.findFirst({
        where: { id: before, conversationId: id },
        select: { createdAt: true, id: true },
      })
    : null;
  const rows = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MESSAGES_PER_LOAD + 1,
    select: MESSAGE_SELECT,
  });
  const hasMore = rows.length > MESSAGES_PER_LOAD;
  const page = rows.slice(0, MESSAGES_PER_LOAD).reverse();
  const role = c.review.studentId === studentId ? 'AUTHOR' : 'ASKER';
  const unread = await prisma.message.count({
    where: { conversationId: id, readAt: null, fromRole: role === 'AUTHOR' ? 'ASKER' : 'AUTHOR' },
  });
  return { conversation: view(studentId, c, page, unread), hasMore };
}

/** Conversations on the student's reviews waiting for an answer (dashboard). */
export async function waitingQuestions(studentId: string) {
  const [asked, count, first] = await Promise.all([
    prisma.conversation.count({ where: { review: { studentId } } }),
    prisma.conversation.count({
      where: { review: { studentId }, messages: { some: { readAt: null, fromRole: 'ASKER' } } },
    }),
    prisma.conversation.findFirst({
      where: { review: { studentId }, messages: { some: { readAt: null, fromRole: 'ASKER' } } },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        review: { select: { title: true, program: { select: { title: true } } } },
      },
    }),
  ]);
  return { asked, count, first };
}
