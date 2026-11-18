/**
 * Questions publiques (feature 6), server side. No 'server-only' guard: the worker sends the weekly
 * digest from here.
 */
import { publicMonth } from '@/lib/domain/public-date';
import { appUrl } from '@/emails/Layout';
import { answerPublishedMail, questionDigestMail } from '@/emails/templates';
import { audit } from '@/lib/audit';
import { decrypt, hmac } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db/generated/client';
import { maskContacts } from '@/lib/domain/masking';
import {
  alumniWho,
  bestAnswer,
  QUESTIONS_PER_PAGE,
  TEAM_WHO,
  type QuestionSort,
} from '@/lib/domain/questions';
import { conversationAlias } from '@/lib/domain/references';
import { sendMailSafe } from '@/lib/mail/send';

/** One vote per account (its id, hashed), or per visitor (hashed cookie). */
export const accountVoterKey = (studentId: string) => hmac(`voter:student:${studentId}`);

const ORDER: Record<QuestionSort, Prisma.QuestionOrderByWithRelationInput[]> = {
  populaires: [{ voteCount: 'desc' }, { publishedAt: 'desc' }, { id: 'asc' }],
  recentes: [{ publishedAt: 'desc' }, { id: 'asc' }],
  'sans-reponse': [{ publishedAt: 'desc' }, { id: 'asc' }],
};

/** One page (10) of the published questions of a program, with their best answer. */
export async function getQuestionsPage(
  programId: string,
  sort: QuestionSort,
  page: number,
  voterKey: string | null,
) {
  const where: Prisma.QuestionWhereInput = {
    programId,
    status: 'PUBLISHED',
    ...(sort === 'sans-reponse' ? { answerCount: 0 } : {}),
  };
  const [count, total, unanswered] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.count({ where: { programId, status: 'PUBLISHED' } }),
    prisma.question.count({ where: { programId, status: 'PUBLISHED', answerCount: 0 } }),
  ]);
  const last = Math.max(1, Math.ceil(count / QUESTIONS_PER_PAGE));
  const p = Math.min(Math.max(1, page), last);
  const rows = await prisma.question.findMany({
    where,
    orderBy: ORDER[sort],
    skip: (p - 1) * QUESTIONS_PER_PAGE,
    take: QUESTIONS_PER_PAGE,
    select: {
      id: true,
      body: true,
      alias: true,
      voteCount: true,
      answerCount: true,
      publishedAt: true,
      answers: {
        where: { status: 'PUBLISHED' },
        select: { id: true, kind: true, who: true, body: true, voteCount: true, publishedAt: true },
      },
    },
  });
  const ids = rows.map((r) => r.id);
  const answerIds = rows.flatMap((r) => r.answers.map((a) => a.id));
  const [qVotes, aVotes] = voterKey
    ? await Promise.all([
        prisma.questionVote.findMany({
          where: { voterKey, questionId: { in: ids } },
          select: { questionId: true },
        }),
        prisma.answerVote.findMany({
          where: { voterKey, answerId: { in: answerIds } },
          select: { answerId: true },
        }),
      ])
    : [[], []];
  const votedQ = new Set(qVotes.map((v) => v.questionId));
  const votedA = new Set(aVotes.map((v) => v.answerId));
  return {
    page: p,
    count,
    total,
    unanswered,
    items: rows.map((q) => {
      const { best, others } = bestAnswer(q.answers);
      const withVote = <A extends { id: string; publishedAt: Date | null }>(a: A) => ({
        ...a,
        publishedAt: publicMonth(a.publishedAt),
        voted: votedA.has(a.id),
      });
      return {
        id: q.id,
        body: q.body,
        alias: q.alias,
        voteCount: q.voteCount,
        voted: votedQ.has(q.id),
        publishedAt: publicMonth(q.publishedAt),
        answerCount: q.answers.length,
        best: best ? withVote(best) : null,
        others: others.map(withVote),
      };
    }),
  };
}

/**
 * Who may answer a question of this program: a student whose parcours is verified for it
 * (ProgramVerification APPROVED), or the verified teaching team of its establishment.
 */
export async function answerRight(
  programId: string,
  who: { studentId?: string | null; responder?: { id: string; universityIds: string[] } | null },
): Promise<{ kind: 'ALUMNI'; who: string } | { kind: 'TEAM'; who: string } | null> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { universityId: true },
  });
  if (!program) return null;
  if (who.responder?.universityIds.includes(program.universityId))
    return { kind: 'TEAM', who: TEAM_WHO };
  if (!who.studentId) return null;
  const v = await prisma.programVerification.findFirst({
    where: { studentId: who.studentId, programId, status: 'APPROVED' },
    select: { declaredLevel: true, declaredCohort: true },
  });
  if (!v) return null;
  const review = await prisma.review.findFirst({
    where: { studentId: who.studentId, programId },
    orderBy: { submittedAt: 'desc' },
    select: { level: true, cohortYear: true },
  });
  return {
    kind: 'ALUMNI',
    who: alumniWho(review?.level ?? v.declaredLevel, review?.cohortYear ?? v.declaredCohort),
  };
}

/** A question (published under a pseudonym after moderation). */
export async function askQuestion(studentId: string, programId: string, body: string) {
  const program = await prisma.program.findFirst({
    where: { id: programId, isPublished: true },
    select: { id: true },
  });
  if (!program) return { ok: false as const, error: 'Parcours introuvable.' };
  const { text, masked } = maskContacts(body);
  let alias = conversationAlias();
  for (
    let i = 0;
    i < 5 &&
    (await prisma.question.findFirst({ where: { programId, alias }, select: { id: true } }));
    i++
  )
    alias = conversationAlias();
  const q = await prisma.question.create({
    data: { programId, authorStudentId: studentId, alias, body: text, hadMaskedContent: masked },
  });
  return { ok: true as const, id: q.id };
}

/** An answer, after checking the right to answer (moderated before publication). */
export async function answerQuestion(
  questionId: string,
  who: { studentId?: string | null; responder?: { id: string; universityIds: string[] } | null },
  body: string,
) {
  const q = await prisma.question.findFirst({
    where: { id: questionId, status: 'PUBLISHED' },
    select: { programId: true },
  });
  if (!q) return { ok: false as const, error: 'Question introuvable.' };
  const right = await answerRight(q.programId, who);
  if (!right)
    return {
      ok: false as const,
      error:
        'Seul·es les ancien·nes dont le parcours est vérifié pour ce master et l’équipe pédagogique peuvent répondre.',
    };
  const { text, masked } = maskContacts(body);
  const a = await prisma.answer.create({
    data: {
      questionId,
      kind: right.kind,
      who: right.who,
      body: text,
      hadMaskedContent: masked,
      authorStudentId: right.kind === 'ALUMNI' ? who.studentId : null,
      responderId: right.kind === 'TEAM' ? who.responder!.id : null,
    },
  });
  return { ok: true as const, id: a.id };
}

/** « Moi aussi je me pose la question »: one vote per account or visitor, toggled. */
export async function toggleQuestionVote(questionId: string, voterKey: string) {
  return prisma.$transaction(async (tx) => {
    const q = await tx.question.findFirst({
      where: { id: questionId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!q) return null;
    const existing = await tx.questionVote.findUnique({
      where: { questionId_voterKey: { questionId, voterKey } },
    });
    if (existing) await tx.questionVote.delete({ where: { id: existing.id } });
    else await tx.questionVote.create({ data: { questionId, voterKey } });
    const r = await tx.question.update({
      where: { id: questionId },
      data: { voteCount: { increment: existing ? -1 : 1 } },
      select: { voteCount: true },
    });
    return { voted: !existing, count: Math.max(0, r.voteCount) };
  });
}

/** « Utile » on an answer: one vote per account or visitor, toggled. */
export async function toggleAnswerVote(answerId: string, voterKey: string) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.answer.findFirst({
      where: { id: answerId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!a) return null;
    const existing = await tx.answerVote.findUnique({
      where: { answerId_voterKey: { answerId, voterKey } },
    });
    if (existing) await tx.answerVote.delete({ where: { id: existing.id } });
    else await tx.answerVote.create({ data: { answerId, voterKey } });
    const r = await tx.answer.update({
      where: { id: answerId },
      data: { voteCount: { increment: existing ? -1 : 1 } },
      select: { voteCount: true },
    });
    return { voted: !existing, count: Math.max(0, r.voteCount) };
  });
}

type Decision =
  | { ok: true; message: string; programId: string; notified?: boolean }
  | { ok: false; error: string };

/**
 * Moderation (« Questions publiques »): `q:<id>` or `a:<id>`. Publishing an answer counts it on its
 * question and tells the author of the question.
 */
export async function decidePublic(
  admin: { id: string; name: string },
  itemId: string,
  action: string,
  reason: string,
): Promise<Decision> {
  const [type, id] = itemId.split(':') as ['q' | 'a', string];
  if (action === 'reject' && !reason) return { ok: false, error: 'Indique un motif.' };
  if (type === 'q') {
    const q = await prisma.question.findUnique({
      where: { id },
      select: { status: true, programId: true, alias: true },
    });
    if (!q || q.status !== 'PENDING') return { ok: false, error: 'Question déjà traitée.' };
    const publish = action === 'publish';
    if (!publish && action !== 'reject') return { ok: false, error: 'Action inconnue.' };
    await prisma.question.update({
      where: { id },
      data: {
        status: publish ? 'PUBLISHED' : 'REJECTED',
        publishedAt: publish ? new Date() : null,
        moderatedById: admin.id,
        moderatedAt: new Date(),
        reason: publish ? null : reason,
      },
    });
    await audit(
      admin,
      'MODERATION',
      `Question publique · ${q.alias}`,
      publish ? 'Publiée.' : `Refusée : ${reason}`,
    );
    return {
      ok: true,
      message: publish ? 'Question publiée.' : 'Question refusée.',
      programId: q.programId,
    };
  }
  const a = await prisma.answer.findUnique({
    where: { id },
    select: {
      status: true,
      questionId: true,
      question: {
        select: {
          programId: true,
          alias: true,
          author: { select: { emailEnc: true, deletedAt: true } },
          program: { select: { title: true, slug: true } },
        },
      },
    },
  });
  if (!a || a.status !== 'PENDING') return { ok: false, error: 'Réponse déjà traitée.' };
  if (action === 'reject') {
    await prisma.answer.update({
      where: { id },
      data: { status: 'REJECTED', moderatedById: admin.id, moderatedAt: new Date(), reason },
    });
    await audit(
      admin,
      'MODERATION',
      `Réponse à une question · ${a.question.alias}`,
      `Refusée : ${reason}`,
    );
    return { ok: true, message: 'Réponse refusée.', programId: a.question.programId };
  }
  if (action !== 'publish') return { ok: false, error: 'Action inconnue.' };
  await prisma.$transaction([
    prisma.answer.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        moderatedById: admin.id,
        moderatedAt: new Date(),
        reason: null,
      },
    }),
    prisma.question.update({
      where: { id: a.questionId },
      data: { answerCount: { increment: 1 } },
    }),
  ]);
  const author = a.question.author;
  const notified =
    !!author &&
    !author.deletedAt &&
    (await sendMailSafe(
      decrypt(author.emailEnc),
      answerPublishedMail({
        programTitle: a.question.program.title,
        url: `${appUrl()}/parcours/${a.question.program.slug}?qtri=recentes#questions`,
      }),
    ));
  await audit(
    admin,
    'MODERATION',
    `Réponse à une question · ${a.question.alias}`,
    `Publiée${notified ? ', auteur·rice prévenu·e' : ''}.`,
  );
  return { ok: true, message: 'Réponse publiée.', programId: a.question.programId, notified };
}

/**
 * Weekly digest to the verified alumni of a master who accept questions (and did not switch the
 * digest off): its published questions still without an answer. A question is never listed twice
 * to the same person (QuestionDigestItem).
 */
export async function sendQuestionDigests(only?: { programIds?: string[] }) {
  const questions = await prisma.question.findMany({
    where: {
      status: 'PUBLISHED',
      answerCount: 0,
      ...(only?.programIds ? { programId: { in: only.programIds } } : {}),
    },
    select: {
      id: true,
      body: true,
      programId: true,
      program: { select: { title: true, slug: true } },
    },
  });
  let mails = 0;
  for (const [programId, qs] of Map.groupBy(questions, (q) => q.programId)) {
    const alumni = await prisma.student.findMany({
      where: {
        deletedAt: null,
        isDemo: false,
        acceptsQuestions: true,
        notifyQuestionDigest: true,
        verifications: { some: { programId, status: 'APPROVED' } },
      },
      select: { id: true, emailEnc: true },
    });
    for (const s of alumni) {
      // claim first: the unique key keeps a question from being listed twice
      const fresh = await prisma.questionDigestItem.createManyAndReturn({
        data: qs.map((q) => ({ studentId: s.id, questionId: q.id })),
        skipDuplicates: true,
        select: { questionId: true },
      });
      if (!fresh.length) continue;
      const list = qs.filter((q) => fresh.some((f) => f.questionId === q.id));
      const ok = await sendMailSafe(
        decrypt(s.emailEnc),
        questionDigestMail({
          programTitle: list[0]!.program.title,
          url: `${appUrl()}/parcours/${list[0]!.program.slug}?qtri=sans-reponse#questions`,
          questions: list.map((q) => q.body),
          settingsUrl: `${appUrl()}/espace/compte`,
        }),
      );
      if (ok) mails++;
    }
  }
  return mails;
}
