/**
 * Public dates are rounded to the month: an exact time (to the millisecond) of a review, a reply,
 * a question or an answer could be matched against someone's known activity.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';

vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);

const { prisma } = await import('@/lib/db');
const { getPublishedReviews } = await import('@/lib/queries/catalog');
const { getQuestionsPage } = await import('@/lib/questions');
const { sitemapEntries } = await import('@/lib/seo/sitemap');
const { newReviewRef } = await import('@/lib/reviews/ref');

const EXACT = new Date('2026-11-16T15:57:29.803Z');
const MONTH = new Date('2026-11-01T00:00:00.000Z');
const created: { reviews: string[]; questions: string[]; responders: string[] } = {
  reviews: [],
  questions: [],
  responders: [],
};
let program: { id: string; slug: string; universityId: string };

beforeAll(async () => {
  // A parcours listed in the sitemap (public sector, open city).
  const listed = await prisma.programSearchIndex.findFirst({
    where: { slug: FX.programs.questions },
    select: { programId: true },
  });
  program = (await prisma.program.findUnique({
    where: { id: listed!.programId },
    select: { id: true, slug: true, universityId: true },
  }))!;
  const r = await prisma.review.create({
    data: {
      ref: await newReviewRef(),
      programId: program.id,
      authorEmailHash: `test-dates-${Date.now()}`,
      level: 'M1',
      cohortYear: 2025,
      overallRating: 4,
      pros: 'p'.repeat(40),
      cons: 'c'.repeat(40),
      status: 'PUBLISHED',
      publishedAt: EXACT,
    },
  });
  created.reviews.push(r.id);
  const responder = await prisma.staffResponder.create({
    data: {
      emailHash: `test-dates-staff-${Date.now()}`,
      universityId: program.universityId,
      domain: 'univ.example',
      verifiedAt: new Date(),
    },
  });
  created.responders.push(responder.id);
  await prisma.reviewResponse.create({
    data: {
      reviewId: r.id,
      responderId: responder.id,
      body: 'Merci pour cet avis détaillé.',
      status: 'PUBLISHED',
      publishedAt: EXACT,
    },
  });
  const q = await prisma.question.create({
    data: {
      programId: program.id,
      alias: 'Test dates',
      body: 'Une question de test ?',
      status: 'PUBLISHED',
      publishedAt: EXACT,
      answerCount: 1,
      answers: {
        create: {
          kind: 'ALUMNI',
          who: 'Diplômé·e',
          body: 'Une réponse de test.',
          status: 'PUBLISHED',
          publishedAt: EXACT,
        },
      },
    },
  });
  created.questions.push(q.id);
});

afterAll(async () => {
  await prisma.question.deleteMany({ where: { id: { in: created.questions } } });
  await prisma.review.deleteMany({ where: { id: { in: created.reviews } } });
  await prisma.staffResponder.deleteMany({ where: { id: { in: created.responders } } });
});

describe('public dates', () => {
  it('reviews and teaching-team replies: the month only', async () => {
    const r = (await getPublishedReviews(program.id)).find((x) => x.id === created.reviews[0]);
    expect(r?.publishedAt.toISOString()).toBe(MONTH.toISOString());
    expect(r?.reply?.publishedAt.toISOString()).toBe(MONTH.toISOString());
  });

  it('questions and their answers: the month only', async () => {
    const page = await getQuestionsPage(program.id, 'recentes', 1, null);
    const q = page.items.find((x) => x.id === created.questions[0]);
    expect(q?.publishedAt.toISOString()).toBe(MONTH.toISOString());
    const answers = [q?.best, ...(q?.others ?? [])].filter(Boolean) as { publishedAt: Date }[];
    expect(answers.length).toBeGreaterThan(0);
    for (const a of answers) expect(a.publishedAt.toISOString()).toBe(MONTH.toISOString());
  });

  it('the sitemap does not give the exact time of the latest review', async () => {
    const entry = (await sitemapEntries('parcours')).find(
      (e) => e.path === `/parcours/${program.slug}`,
    );
    expect(entry).toBeDefined();
    expect(new Date(entry!.lastmod!).toISOString()).not.toBe(EXACT.toISOString());
  });
});
