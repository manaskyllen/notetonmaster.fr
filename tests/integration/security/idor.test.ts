/**
 * Direct access by id (IDOR): nobody reads or changes an object of someone else by sending its
 * id. Reviews, conversations and messages, proofs of study, saved views, exports, teaching-team
 * replies, legal requests. (Review drafts only live in the browser: no server id to guess.)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request, run } = await import('../helpers/request');
const { adminAs, studentAs, staffAs, cleanupActors } = await import('../helpers/actors');
const { prisma } = await import('@/lib/db');
const { newReviewRef } = await import('@/lib/reviews/ref');
const espace = await import('@/app/(public)/espace/actions');
const messages = await import('@/app/(public)/messages/actions');
const fiches = await import('@/app/admin/(panel)/fiches/actions');
const { submitResponse } = await import('@/app/(public)/reponse-formation/actions');

type Actor = { id: string; cookies: ReturnType<typeof request.snapshot> };
let a: Actor, b: Actor, modX: Actor, modY: Actor;
let reviewB = '';
let conv = '';
let programOther = '';
let staff: Actor & { universityId: string };

beforeAll(async () => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
  a = await studentAs('idor-a');
  b = await studentAs('idor-b');
  modX = await adminAs('ADMIN');
  modY = await adminAs('DATA_EDITOR');
  staff = await staffAs();
  const program = await programBySlug(FX.programs.illkirch);
  programOther = program.id;
  reviewB = (
    await prisma.review.create({
      data: {
        ref: await newReviewRef(),
        programId: program.id,
        studentId: b.id,
        authorEmailHash: `idor-${b.id}`,
        level: 'M2',
        cohortYear: 2024,
        overallRating: 4,
        pros: 'x'.repeat(40),
        cons: 'y'.repeat(40),
        status: 'PUBLISHED',
        publishedAt: new Date(),
        acceptsQuestions: true,
      },
    })
  ).id;
  conv = (
    await prisma.conversation.create({
      data: {
        reviewId: reviewB,
        askerEmailEnc: 'v1:x',
        askerEmailHash: `idor-asker-${Date.now()}`,
        alias: 'Étudiant·e anonyme #IDR',
        messages: { create: { fromRole: 'ASKER', body: 'Une question privée.' } },
      },
    })
  ).id;
}, 120_000);

afterAll(async () => {
  await prisma.conversation.deleteMany({ where: { id: conv } });
  await prisma.review.deleteMany({ where: { id: reviewB } });
  await cleanupActors();
});

describe('a student, on the objects of another student', () => {
  it('cannot delete nor edit their review', async () => {
    request.restore(a.cookies);
    expect(await espace.deleteMyReview(reviewB)).toMatchObject({ ok: false });
    expect(await espace.updateMyReview(reviewB, {})).toMatchObject({ ok: false });
    expect(await prisma.review.findUnique({ where: { id: reviewB } })).not.toBeNull();
  });

  it('cannot read, answer, mark read, block nor report a conversation they are not part of', async () => {
    request.restore(a.cookies);
    expect(await messages.olderMessages(conv, 'x')).toEqual({ messages: [], hasMore: false });
    expect(await messages.replyInSpace(conv, 'Je réponds à la place de quelqu’un.')).toMatchObject({
      ok: false,
    });
    expect(await messages.setBlocked(conv, true)).toMatchObject({ ok: false });
    expect(await messages.reportConversation(conv, 'spam')).toMatchObject({ ok: false });
    await messages.markRead(conv);
    const c = await prisma.conversation.findUnique({
      where: { id: conv },
      include: { messages: true },
    });
    expect(c?.status).toBe('OPEN');
    expect(c?.messages).toHaveLength(1);
    expect(c?.messages[0]?.readAt).toBeNull();
  });

  it('the author of the review does see it (control)', async () => {
    request.restore(b.cookies);
    const r = await messages.olderMessages(conv, 'zzzzzzzzzzzzzzzzzzzzzzzz');
    expect(Array.isArray(r.messages)).toBe(true);
  });
});

describe('admins, on the objects of another admin', () => {
  it('a saved view is deleted by its owner only', async () => {
    request.restore(modX.cookies);
    await fiches.saveView('Vue de X', 'vue=a-traiter');
    const view = await prisma.savedView.findFirstOrThrow({ where: { userId: modX.id } });
    request.restore(modY.cookies);
    await fiches.deleteView(view.id);
    expect(await prisma.savedView.findUnique({ where: { id: view.id } })).not.toBeNull();
  });

  it('the progress and the CSV of an export belong to the admin who asked for it', async () => {
    const job = await prisma.job.create({
      data: {
        type: 'BULK_FICHES',
        payload: {},
        createdById: modX.id,
        status: 'DONE',
        result: { csv: 'secret;csv' },
      },
    });
    request.restore(modY.cookies);
    const r = await fiches.bulkStatus(job.id);
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(r).toMatchObject({ ok: false });
  });
});

describe('teaching teams', () => {
  it('cannot reply to a review of a parcours of another establishment', async () => {
    request.restore(staff.cookies);
    const r = await submitResponse({
      reviewId: reviewB,
      body: 'Une réponse assez longue pour être enregistrée.',
    });
    expect(r).toMatchObject({ ok: false });
    expect(await prisma.reviewResponse.findUnique({ where: { reviewId: reviewB } })).toBeNull();
    void programOther;
  });
});

describe('proofs of study and legal requests', () => {
  it('a student or a data editor cannot download a proof; a moderator can reach the route', async () => {
    const route = await import('@/app/admin/justificatifs/[id]/route');
    const get = () =>
      route.GET(new Request('http://x'), { params: Promise.resolve({ id: 'inexistant' }) });
    request.restore(a.cookies);
    expect((await get()).status).toBe(403);
    request.restore(modY.cookies);
    expect((await get()).status).toBe(403);
    request.restore(modX.cookies);
    expect((await get()).status).toBe(404);
  });

  it('the connection data of a legal request is refused to a non-Légal role', async () => {
    const route = await import('@/app/admin/legal/[id]/export/route');
    request.restore(modY.cookies);
    const r = await run(() =>
      route.GET(new Request('http://x'), { params: Promise.resolve({ id: 'inexistant' }) }),
    );
    expect((r as Response).status).toBe(403);
  });
});
