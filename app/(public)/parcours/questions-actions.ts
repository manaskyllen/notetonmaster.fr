'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentResponder } from '@/lib/auth/staff';
import { getCurrentStudent } from '@/lib/auth/student';
import { ANSWER_MAX, QUESTION_MAX } from '@/lib/domain/questions';
import { fieldErrors, type FormState } from '@/lib/form';
import {
  accountVoterKey,
  answerQuestion,
  askQuestion,
  toggleAnswerVote,
  toggleQuestionVote,
} from '@/lib/questions';
import { HOUR, rateLimit } from '@/lib/rate-limit';
import { turnstileTokenOf, verifyTurnstile } from '@/lib/turnstile';
import { getVoterKey } from '@/lib/voter';

const id = z.string().min(1).max(40);

/** « Poser une question »: account required, Turnstile, published under a pseudonym after moderation. */
export async function askPublicQuestion(_prev: FormState, fd: FormData): Promise<FormState> {
  const student = await getCurrentStudent();
  if (!student) return { status: 'error', message: 'Connecte-toi pour poser une question.' };
  const p = z
    .object({
      programId: id,
      body: z
        .string()
        .trim()
        .min(10, 'Au moins 10 caractères.')
        .max(QUESTION_MAX, `${QUESTION_MAX} caractères au maximum.`),
    })
    .safeParse({ programId: fd.get('programId'), body: fd.get('body') });
  const values = { body: String(fd.get('body') ?? '') };
  if (!p.success) return { status: 'error', fieldErrors: fieldErrors(p.error), values };
  const human = await verifyTurnstile('public-question', turnstileTokenOf(fd));
  if (!human.ok) return { status: 'error', message: human.message, values };
  if (!(await rateLimit(`public-question:${student.id}`, 5, 24 * HOUR)))
    return { status: 'error', message: 'Cinq questions par jour au maximum.', values };
  const r = await askQuestion(student.id, p.data.programId, p.data.body);
  if (!r.ok) return { status: 'error', message: r.error, values };
  return {
    status: 'success',
    message: 'Merci ! Ta question sera publiée sous un pseudonyme après relecture.',
  };
}

/** An answer: verified alumni of this master, or its verified teaching team. */
export async function postAnswer(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = z
    .object({
      questionId: id,
      body: z
        .string()
        .trim()
        .min(10, 'Au moins 10 caractères.')
        .max(ANSWER_MAX, `${ANSWER_MAX} caractères au maximum.`),
    })
    .safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Réponse invalide.' };
  const [student, responder] = await Promise.all([getCurrentStudent(), getCurrentResponder()]);
  if (!student && !responder) return { ok: false, error: 'Connecte-toi pour répondre.' };
  if (!(await rateLimit(`public-answer:${student?.id ?? responder!.id}`, 20, 24 * HOUR)))
    return { ok: false, error: 'Trop de réponses aujourd’hui.' };
  const r = await answerQuestion(
    p.data.questionId,
    { studentId: student?.id, responder },
    p.data.body,
  );
  return r.ok ? { ok: true } : r;
}

async function voterKey() {
  const student = await getCurrentStudent();
  return student ? accountVoterKey(student.id) : (await getVoterKey(true))!;
}

/** « Moi aussi je me pose la question »: one vote per account or visitor. */
export async function voteQuestion(raw: unknown) {
  const q = id.safeParse(raw);
  if (!q.success) return { error: 'Question introuvable.' };
  const r = await toggleQuestionVote(q.data, await voterKey());
  return r ?? { error: 'Question introuvable.' };
}

/** « Utile » on an answer: one vote per account or visitor. */
export async function voteAnswer(raw: unknown) {
  const a = id.safeParse(raw);
  if (!a.success) return { error: 'Réponse introuvable.' };
  const r = await toggleAnswerVote(a.data, await voterKey());
  revalidatePath('/parcours/[slug]', 'page');
  return r ?? { error: 'Réponse introuvable.' };
}
