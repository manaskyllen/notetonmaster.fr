/** A review is hidden after reports of several different people, never by one person alone. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request } = await import('../helpers/request');
const { prisma } = await import('@/lib/db');
const { submitReport } = await import('@/app/(public)/signaler/actions');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');
const { newReviewRef } = await import('@/lib/reviews/ref');

const reviewIds: string[] = [];

async function publishedReview() {
  const program = await programBySlug(FX.programs.questions);
  const r = await prisma.review.create({
    data: {
      ref: await newReviewRef(),
      programId: program!.id,
      authorEmailHash: `test-report-${Date.now()}-${Math.random()}`,
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

const report = (ref: string) =>
  submitReport({
    target: ref,
    reason: 'false',
    details: '',
    email: '',
    turnstileToken: TURNSTILE_MOCK_TOKEN,
  });

beforeAll(() => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
});

afterAll(async () => {
  await prisma.report.deleteMany({ where: { targetId: { in: reviewIds } } });
  await prisma.review.deleteMany({ where: { id: { in: reviewIds } } });
});

describe('automatic hiding after reports', () => {
  it('three reports of the same person do not hide the review', async () => {
    const r = await publishedReview();
    request.reset('198.51.100.77');
    for (let i = 0; i < 3; i++) expect(await report(r.ref)).toMatchObject({ ok: true });
    expect((await prisma.review.findUnique({ where: { id: r.id } }))?.status).toBe('PUBLISHED');
  });

  it('the same person changing cookies is still one person', async () => {
    const r = await publishedReview();
    for (let i = 0; i < 3; i++) {
      request.reset('198.51.100.78');
      await report(r.ref);
    }
    expect((await prisma.review.findUnique({ where: { id: r.id } }))?.status).toBe('PUBLISHED');
  });

  it('three different people hide it until moderation', async () => {
    const r = await publishedReview();
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      request.reset(ip);
      await report(r.ref);
    }
    expect((await prisma.review.findUnique({ where: { id: r.id } }))?.status).toBe('HIDDEN');
  });
});
