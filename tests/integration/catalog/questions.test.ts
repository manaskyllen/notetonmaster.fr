/** Questions publiques (feature 6): rights to answer, best answer, votes, digest without repeat. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encrypt, hashEmail } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { bestAnswer } from '@/lib/domain/questions';
import {
  accountVoterKey,
  answerQuestion,
  answerRight,
  askQuestion,
  decidePublic,
  sendQuestionDigests,
  toggleQuestionVote,
} from '@/lib/questions';
import { FX } from '../fixtures/ids';
import { fixtureAdmin, programBySlug, universityBySlug } from '../fixtures/lookup';

describe('best answer', () => {
  const a = (id: string, kind: 'ALUMNI' | 'TEAM', voteCount: number, day: number) => ({
    id,
    kind,
    voteCount,
    publishedAt: new Date(2026, 0, day),
  });
  it('the official answer of the team first, even with fewer votes', () => {
    const r = bestAnswer([a('x', 'ALUMNI', 9, 1), a('team', 'TEAM', 0, 5), a('y', 'ALUMNI', 3, 2)]);
    expect(r.best?.id).toBe('team');
    expect(r.others.map((o) => o.id)).toEqual(['x', 'y']);
  });
  it('else the most voted, the earliest on a tie', () => {
    expect(
      bestAnswer([a('x', 'ALUMNI', 2, 3), a('y', 'ALUMNI', 5, 4), a('z', 'ALUMNI', 5, 1)]).best?.id,
    ).toBe('z');
    expect(bestAnswer([])).toEqual({ best: null, others: [] });
  });
});

describe('questions (database)', () => {
  const tag = randomUUID().slice(0, 8);
  let programId = '';
  let questionId = '';
  const ids: Record<'asker' | 'stranger' | 'alum', string> = { asker: '', stranger: '', alum: '' };
  let team = { id: '', universityIds: [] as string[] };
  let otherTeam = { id: '', universityIds: [] as string[] };
  let admin = { id: '', name: '' };

  beforeAll(async () => {
    const p = await programBySlug(FX.programs.questions);
    programId = p.id;
    for (const k of ['asker', 'stranger', 'alum'] as const) {
      const email = `${k}.${tag}@test.notetonmaster.local`;
      ids[k] = (
        await prisma.student.create({
          data: {
            emailHash: hashEmail(email),
            emailEnc: encrypt(email),
            acceptsQuestions: k === 'alum',
          },
        })
      ).id;
    }
    await prisma.programVerification.create({
      data: {
        studentId: ids.alum,
        programId,
        method: 'DOCUMENT',
        status: 'APPROVED',
        declaredLevel: 'GRADUATE',
        declaredCohort: 2025,
      },
    });
    const other = await universityBySlug(FX.universities.strasbourg);
    team = {
      id: (
        await prisma.staffResponder.create({
          data: {
            emailHash: `test:${tag}:t`,
            universityId: p.universityId,
            domain: 'exemple.fr',
            verifiedAt: new Date(),
          },
        })
      ).id,
      universityIds: [p.universityId],
    };
    otherTeam = {
      id: (
        await prisma.staffResponder.create({
          data: {
            emailHash: `test:${tag}:o`,
            universityId: other.id,
            domain: 'autre.fr',
            verifiedAt: new Date(),
          },
        })
      ).id,
      universityIds: [other.id],
    };
    const a = await fixtureAdmin();
    admin = { id: a.id, name: a.name };
  });
  /**
   * Each test starts from one published question of its own, without votes, answers nor digest:
   * the parcours of the fixtures has no other question.
   */
  beforeEach(async () => {
    await prisma.question.deleteMany({ where: { programId } });
    await prisma.questionDigestItem.deleteMany({ where: { studentId: ids.alum } });
    questionId = (
      await prisma.question.create({
        data: {
          programId,
          authorStudentId: ids.asker,
          alias: 'Étudiant·e anonyme #A1B',
          body: 'Peut-on faire le stage de M2 à l’étranger ?',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          moderatedById: admin.id,
          moderatedAt: new Date(),
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.question.deleteMany({ where: { programId } });
    await prisma.student.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.staffResponder.deleteMany({ where: { emailHash: { startsWith: `test:${tag}` } } });
    await prisma.$disconnect();
  });

  it('a question is published under a pseudonym after moderation, contact details masked', async () => {
    const r = await askQuestion(
      ids.asker,
      programId,
      'Peut-on faire le stage de M2 à l’étranger ? Écrivez-moi : moi@exemple.fr',
    );
    expect(r.ok).toBe(true);
    const asked = (r as { id: string }).id;
    const q = await prisma.question.findUniqueOrThrow({ where: { id: asked } });
    expect(q).toMatchObject({ status: 'PENDING', hadMaskedContent: true });
    expect(q.alias).toMatch(/^Étudiant·e anonyme #[0-9A-F]{3}$/);
    expect(q.body).toContain('[coordonnées masquées]');
    expect(await decidePublic(admin, `q:${asked}`, 'reject', '')).toEqual({
      ok: false,
      error: 'Indique un motif.',
    });
    expect(await decidePublic(admin, `q:${asked}`, 'publish', '')).toMatchObject({ ok: true });
  });

  it('only verified alumni of this master and its verified team may answer', async () => {
    expect(await answerRight(programId, { studentId: ids.stranger })).toBeNull();
    expect(await answerRight(programId, { responder: otherTeam })).toBeNull();
    expect(await answerRight(programId, { studentId: ids.alum })).toEqual({
      kind: 'ALUMNI',
      who: 'Diplômé·e · promo 2025',
    });
    expect(await answerRight(programId, { responder: team })).toMatchObject({ kind: 'TEAM' });
    const refused = await answerQuestion(
      questionId,
      { studentId: ids.stranger },
      'Je pense que oui, mais je n’ai pas suivi ce master.',
    );
    expect(refused.ok).toBe(false);
    expect(await prisma.answer.count({ where: { questionId } })).toBe(0);
  });

  it('one vote per account or visitor', async () => {
    const k1 = accountVoterKey(ids.stranger);
    expect(await toggleQuestionVote(questionId, k1)).toEqual({ voted: true, count: 1 });
    expect(await toggleQuestionVote(questionId, 'visitor-hash')).toEqual({ voted: true, count: 2 });
    expect(await toggleQuestionVote(questionId, k1)).toEqual({ voted: false, count: 1 });
    expect(await prisma.questionVote.count({ where: { questionId } })).toBe(1);
  });

  it('weekly digest to the verified alumni: a question is never listed twice', async () => {
    expect(await sendQuestionDigests({ programIds: [programId] })).toBe(1);
    expect(await sendQuestionDigests({ programIds: [programId] })).toBe(0);
    expect(await prisma.questionDigestItem.count({ where: { studentId: ids.alum } })).toBe(1);
  });

  it('a published answer counts on its question and tells its author; the team answer comes first', async () => {
    const alum = await answerQuestion(
      questionId,
      { studentId: ids.alum },
      'Oui, deux personnes de ma promo l’ont fait, avec une convention signée avant mars.',
    );
    const off = await answerQuestion(
      questionId,
      { responder: team },
      'Oui, avec l’accord du ou de la responsable du parcours.',
    );
    expect(alum.ok && off.ok).toBe(true);
    const pub = await decidePublic(admin, `a:${(alum as { id: string }).id}`, 'publish', '');
    expect(pub).toMatchObject({ ok: true, notified: true });
    await decidePublic(admin, `a:${(off as { id: string }).id}`, 'publish', '');
    expect(
      (await prisma.question.findUniqueOrThrow({ where: { id: questionId } })).answerCount,
    ).toBe(2);
    const answers = await prisma.answer.findMany({ where: { questionId, status: 'PUBLISHED' } });
    expect(bestAnswer(answers).best?.kind).toBe('TEAM');
    // answered: never in a digest
    expect(await sendQuestionDigests({ programIds: [programId] })).toBe(0);
  });
});
