/**
 * Incoming items nobody would see otherwise notify the team, by the notification matrix
 * (Paramètres › Notifications): a contact message, a formal notice, a reported review, a proof of
 * study. The mail holds the type of event, the reference and the admin link, never the visitor's
 * name, address or text.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request } = await import('../helpers/request');
const { mailbox } = await import('../helpers/mailbox');
const { studentAs, cleanupActors, created } = await import('../helpers/actors');
const { prisma } = await import('@/lib/db');
const { getSettings } = await import('@/lib/settings');
const { sendContact } = await import('@/app/(public)/a-propos/actions');
const { submitNotice, submitReport } = await import('@/app/(public)/signaler/actions');
const { submitDocument } = await import('@/lib/verification-upload');
const { newReviewRef } = await import('@/lib/reviews/ref');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');

type Role = 'ADMIN' | 'MODERATOR' | 'DATA_EDITOR' | 'LEGAL';
const ROLES: Role[] = ['ADMIN', 'MODERATOR', 'DATA_EDITOR', 'LEGAL'];
const tag = `notif-${Date.now()}`;
const team = {} as Record<Role, string>;
const adminIds: string[] = [];
const reviewIds: string[] = [];

/** What a visitor typed: none of it may appear in a mail to the team. */
const VISITOR = {
  email: `visiteur.${tag}@example.org`,
  name: `Jeanne Témoin ${tag}`,
  text: `Texte personnel du visiteur ${tag}, qui ne doit jamais partir par mail.`,
  url: `https://notetonmaster.fr/parcours/secret-${tag}`,
};

beforeAll(async () => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
  // One active member per role (an account without password, still invited, is never notified).
  for (const role of ROLES) {
    const a = await prisma.adminUser.create({
      data: {
        email: `${tag}-${role.toLowerCase()}@example.org`,
        name: role,
        role,
        passwordHash: 'x',
      },
    });
    team[role] = a.email;
    adminIds.push(a.id);
  }
});

afterAll(async () => {
  await prisma.report.deleteMany({ where: { targetId: { in: reviewIds } } });
  await prisma.review.deleteMany({ where: { id: { in: reviewIds } } });
  await prisma.contactMessage.deleteMany({ where: { body: VISITOR.text } });
  await prisma.legalRequest.deleteMany({ where: { requesterName: VISITOR.name } });
  await prisma.programVerification.deleteMany({ where: { studentId: { in: created.students } } });
  await cleanupActors();
  await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
});

/** Mails sent to the test team since `from`, for this reference. */
async function expectNotified(
  event: 'contact.received' | 'legal.received' | 'review.reported' | 'document.submitted',
  from: number,
  path: string,
  secrets: string[] = [VISITOR.email, VISITOR.name, VISITOR.text, VISITOR.url],
) {
  const sent = mailbox.slice(from).filter((m) => Object.values(team).includes(m.to));
  const matrix = (await getSettings())['notifications.matrix'][event];
  const expected = ROLES.filter((r) => matrix[r]).map((r) => team[r]);
  expect(expected.length).toBeGreaterThan(0);
  expect(sent.map((m) => m.to).sort()).toEqual(expected.sort());
  for (const m of sent) {
    expect(m.subject).toMatch(/^\[Admin\] .+ · [A-Z]{3}-[\w-]+$/);
    expect(m.text).toContain(`/admin/moderation?file=${path}`);
    for (const s of secrets) {
      expect(m.subject).not.toContain(s);
      expect(m.text).not.toContain(s);
    }
  }
  return sent[0]!;
}

async function publishedReview() {
  const program = await programBySlug(FX.programs.questions);
  const r = await prisma.review.create({
    data: {
      ref: await newReviewRef(),
      programId: program!.id,
      authorEmailHash: `${tag}-${Math.random()}`,
      level: 'M2',
      cohortYear: 2023,
      overallRating: 3,
      pros: 'x'.repeat(40),
      cons: 'y'.repeat(40),
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  reviewIds.push(r.id);
  return r;
}

describe('incoming items notify the team', () => {
  it('a message of the contact form', async () => {
    request.reset();
    const from = mailbox.length;
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      subject: 'other',
      email: VISITOR.email,
      link: VISITOR.url,
      message: VISITOR.text,
      'cf-turnstile-response': TURNSTILE_MOCK_TOKEN,
    }))
      fd.set(k, v);
    expect(await sendContact({ status: 'idle' } as never, fd)).toEqual({ status: 'success' });
    const m = await expectNotified('contact.received', from, 'contact');
    const saved = await prisma.contactMessage.findFirstOrThrow({ where: { body: VISITOR.text } });
    expect(m.subject).toContain(`CON-${saved.id.slice(-8).toUpperCase()}`);
  });

  it('a formal notice (legal.received)', async () => {
    request.reset();
    const from = mailbox.length;
    const r = await submitNotice({
      name: VISITOR.name,
      quality: Object.keys((await import('@/lib/validation')).NOTICE_QUALITIES)[0],
      email: VISITOR.email,
      url: VISITOR.url,
      grounds: VISITOR.text,
      law: '',
      goodFaith: true,
      turnstileToken: TURNSTILE_MOCK_TOKEN,
    });
    expect(r).toMatchObject({ ok: true, formal: true });
    const m = await expectNotified('legal.received', from, 'legal');
    expect(m.subject).toContain((r as { reference: string }).reference);
  });

  it('a reported review (review.reported)', async () => {
    request.reset();
    const review = await publishedReview();
    const from = mailbox.length;
    const r = await submitReport({
      target: review.ref,
      reason: 'false',
      details: VISITOR.text,
      email: VISITOR.email,
      turnstileToken: TURNSTILE_MOCK_TOKEN,
    });
    expect(r).toMatchObject({ ok: true });
    const m = await expectNotified('review.reported', from, 'signal');
    expect(m.subject).toContain((r as { reference: string }).reference);
  });

  it('a proof of study (document.submitted)', async () => {
    const student = await studentAs('notif');
    const program = await programBySlug(FX.programs.questions);
    const review = await prisma.review.create({
      data: {
        ref: await newReviewRef(),
        programId: program!.id,
        studentId: student.id,
        authorEmailHash: `${tag}-doc`,
        level: 'M2',
        cohortYear: 2024,
        overallRating: 4,
        pros: 'x'.repeat(40),
        cons: 'y'.repeat(40),
        status: 'PENDING',
      },
    });
    reviewIds.push(review.id);
    const fd = new FormData();
    fd.set('programId', program!.id);
    fd.set('document', new File([new TextEncoder().encode('%PDF-1.4 test')], 'justif.pdf'));
    const from = mailbox.length;
    expect(await submitDocument(student.id, fd)).toMatchObject({ ok: true });
    const v = await prisma.programVerification.findFirstOrThrow({
      where: { studentId: student.id, method: 'DOCUMENT' },
    });
    const m = await expectNotified('document.submitted', from, 'justif', [student.email]);
    expect(m.subject).toContain(`JUS-${v.id.slice(-8).toUpperCase()}`);
  });
});
