/** « Utile » votes: clearing the cookie does not allow voting without end from one connection. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);

const { request } = await import('../helpers/request');
const { prisma } = await import('@/lib/db');
const { toggleHelpful } = await import('@/app/(public)/parcours/actions');
const { newReviewRef } = await import('@/lib/reviews/ref');
const { HELPFUL_PER_HOUR } = await import('@/lib/domain/limits');

let reviewId = '';

beforeAll(async () => {
  process.env.RATE_LIMIT_MULTIPLIER = '1';
  const program = await programBySlug(FX.programs.questions);
  reviewId = (
    await prisma.review.create({
      data: {
        ref: await newReviewRef(),
        programId: program!.id,
        authorEmailHash: `test-helpful-${Date.now()}`,
        level: 'M2',
        cohortYear: 2024,
        overallRating: 5,
        pros: 'x'.repeat(40),
        cons: 'y'.repeat(40),
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.review.deleteMany({ where: { id: reviewId } });
});

describe('toggleHelpful', () => {
  it('one connection cannot add votes beyond the hourly limit by clearing its cookie', async () => {
    for (let i = 0; i < HELPFUL_PER_HOUR + 5; i++) {
      request.reset('198.51.100.150');
      await toggleHelpful(reviewId);
    }
    const r = await prisma.review.findUnique({ where: { id: reviewId } });
    expect(r!.helpfulCount).toBeLessThanOrEqual(HELPFUL_PER_HOUR);
  });
});
