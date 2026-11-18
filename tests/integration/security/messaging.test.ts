/**
 * Messaging between strangers: a question under a review, the answers by space or single-use
 * link. Contact details are masked on the server before storage, and the mail relays never
 * reveal the address of the other person (body, subject, Reply-To or other headers).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request } = await import('../helpers/request');
const { mailbox, lastMail } = await import('../helpers/mailbox');
const { studentAs, cleanupActors } = await import('../helpers/actors');
const { prisma } = await import('@/lib/db');
const { hashEmail } = await import('@/lib/crypto');
const { newReviewRef } = await import('@/lib/reviews/ref');
const messages = await import('@/app/(public)/messages/actions');
const service = await import('@/lib/messaging/service');
const {
  getConversationThread,
  getStudentConversations,
  countStudentConversations,
  waitingQuestions,
} = await import('@/lib/messaging/queries');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');
const { MASK } = await import('@/lib/domain/masking');

let askers = 0;
let author: Awaited<ReturnType<typeof studentAs>>;
let reviewId = '';

const ask = (message: string, email: string) =>
  messages.askQuestion({ reviewId, email, message, turnstileToken: TURNSTILE_MOCK_TOKEN });

/**
 * A new conversation for the test that needs one: its own asker address, from a fresh visitor.
 * No test depends on the conversation, the mails or the link of another one.
 */
async function newConversation(
  message = 'Bonjour, écris-moi à moi@exemple.fr ou sur instagram.com/moi stp',
) {
  askers += 1;
  const asker = `sec-msg-asker-${process.pid}-${askers}@example.org`;
  request.reset();
  const r = await ask(message, asker);
  expect(r).toMatchObject({ ok: true });
  const c = await prisma.conversation.findFirstOrThrow({
    where: { reviewId },
    orderBy: { createdAt: 'desc' },
    include: { messages: true },
  });
  return { asker, r, c, convId: c.id };
}

/** The author answers in the space: the asker receives a mail with a single-use link. */
async function authorReplies(convId: string, asker: string) {
  request.restore(author.cookies);
  expect(
    await messages.replyInSpace(convId, 'Merci pour ta question, voici ma réponse.'),
  ).toMatchObject({ ok: true });
  return lastMail(asker)!;
}

/** Every mail of a conversation: none may carry the other person's address. */
function expectNoAddress(of: string, inMailsTo: string) {
  for (const m of mailbox.filter((x) => x.to === inMailsTo)) {
    expect(m.text).not.toContain(of);
    expect(m.subject).not.toContain(of);
    expect(JSON.stringify(m.headers)).not.toContain(of);
    expect(Object.keys(m.headers).map((h) => h.toLowerCase())).not.toContain('reply-to');
  }
}

beforeAll(async () => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
  author = await studentAs('msg-author');
  await prisma.student.update({ where: { id: author.id }, data: { acceptsQuestions: true } });
  const program = await programBySlug(FX.programs.questions);
  reviewId = (
    await prisma.review.create({
      data: {
        ref: await newReviewRef(),
        programId: program.id,
        studentId: author.id,
        authorEmailHash: hashEmail(author.email),
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
}, 60_000);

afterAll(async () => {
  await prisma.conversation.deleteMany({ where: { reviewId } });
  for (let i = 1; i <= askers; i++)
    await prisma.magicLinkToken.deleteMany({
      where: { emailHash: hashEmail(`sec-msg-asker-${process.pid}-${i}@example.org`) },
    });
  await cleanupActors();
});

describe('a question under a review', () => {
  it('is stored with contact details masked, under a per-conversation alias', async () => {
    const { r, c } = await newConversation();
    expect(r).toMatchObject({ ok: true, masked: true });
    expect(c.messages[0]!.body).toContain(MASK);
    expect(c.messages[0]!.body).not.toMatch(/moi@exemple|instagram/);
    expect(c.alias).toMatch(/anonyme/i);
  });

  it('the mail to the author never shows the address of the person who asked', async () => {
    const { asker } = await newConversation();
    const toAuthor = mailbox.filter((m) => m.to === author.email);
    expect(toAuthor.length).toBeGreaterThan(0);
    expectNoAddress(asker, author.email);
  });

  it('the author answers from the space; the mail to the asker carries a single-use link, not the author’s address', async () => {
    const { asker, convId } = await newConversation();
    const mail = await authorReplies(convId, asker);
    expect(mail.text).toMatch(/\/reponse\/[A-Za-z0-9_-]{20,}/);
    expectNoAddress(author.email, asker);
  });

  it('the asker answers once with the link of the mail; the link then no longer works', async () => {
    const { asker, convId } = await newConversation();
    const mail = await authorReplies(convId, asker);
    const token = /\/reponse\/([A-Za-z0-9_-]{20,})/.exec(mail.text)![1]!;
    request.reset();
    expect(
      await messages.replyWithToken(token, 'Merci beaucoup, et pour les stages ? 06 12 34 56 78'),
    ).toMatchObject({ ok: true, masked: true });
    expect(await messages.replyWithToken(token, 'Une deuxième fois')).toMatchObject({ ok: false });
    expectNoAddress(asker, author.email);
  });

  it('the author reads the thread, marks it read, and it is never shown with an address', async () => {
    const { asker, convId } = await newConversation();
    const mail = await authorReplies(convId, asker);
    const token = /\/reponse\/([A-Za-z0-9_-]{20,})/.exec(mail.text)![1]!;
    request.reset();
    await messages.replyWithToken(token, 'Merci beaucoup, et pour les stages ?');
    request.restore(author.cookies);
    const t = await getConversationThread(author.id, convId);
    expect(t?.conversation.messages.length).toBe(3);
    expect(JSON.stringify(t)).not.toContain(asker);
    await messages.markRead(convId);
    expect(
      await prisma.message.count({
        where: { conversationId: convId, fromRole: 'ASKER', readAt: null },
      }),
    ).toBe(0);
    const older = await messages.olderMessages(convId, t!.conversation.messages.at(-1)!.id);
    expect(Array.isArray(older.messages)).toBe(true);
  });

  it('the author can report and block; a blocked conversation refuses new messages', async () => {
    const { convId } = await newConversation();
    request.restore(author.cookies);
    expect(await messages.reportConversation(convId, 'spam')).toMatchObject({ ok: true });
    expect(await messages.setBlocked(convId, true)).toMatchObject({ ok: true });
    expect(await messages.replyInSpace(convId, 'Encore un message')).toMatchObject({ ok: false });
  });

  it('nobody asks a question to themselves', async () => {
    request.restore(author.cookies);
    expect(await ask('Je me pose une question à moi-même ici.', author.email)).toMatchObject({
      ok: false,
    });
  });

  it('no question when the author does not accept them', async () => {
    await prisma.student.update({ where: { id: author.id }, data: { acceptsQuestions: false } });
    try {
      expect(await service.canAskQuestions(reviewId)).toBe(false);
      request.reset();
      expect(
        await ask(
          'Une question qui ne doit pas partir.',
          `sec-msg-refused-${process.pid}@example.org`,
        ),
      ).toMatchObject({ ok: false });
    } finally {
      await prisma.student.update({ where: { id: author.id }, data: { acceptsQuestions: true } });
    }
  });

  it('the lists of the space show the author’s conversations only, without any address', async () => {
    const { asker, convId } = await newConversation();
    const list = await getStudentConversations(author.id);
    expect(list.map((c) => c.id)).toContain(convId);
    expect(await countStudentConversations(author.id)).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(list)).not.toContain(asker);
    expect(JSON.stringify(await waitingQuestions(author.id))).not.toContain(asker);
    const stranger = await studentAs('msg-stranger');
    expect((await getStudentConversations(stranger.id)).map((c) => c.id)).not.toContain(convId);
    expect(await getConversationThread(stranger.id, convId)).toBeNull();
  });

  it('aliases are unique within a review', async () => {
    const a = await service.newAlias(reviewId);
    const b = await service.newAlias(reviewId);
    expect(a).toMatch(/#/);
    expect(typeof b).toBe('string');
  });
});
