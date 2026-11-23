/**
 * Sending a review without a session never tells whether an address already wrote a review on a
 * parcours, and never attaches a review to an address before its owner proved it (code or link).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request, run } = await import('../helpers/request');
const { lastCode, mailbox } = await import('../helpers/mailbox');
const { prisma } = await import('@/lib/db');
const { hashEmail } = await import('@/lib/crypto');
const { submitReview, confirmReviewByCode, resendReviewCode } =
  await import('@/app/(public)/avis/actions');
const { verifyLoginCode } = await import('@/app/(public)/connexion/actions');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');

const tag = `sec-review-${Date.now()}`;
const attacker = `${tag}-other@example.org`;
let victims = 0;
const victimEmails: string[] = [];

/** An address whose review of this parcours is already published: each test has its own. */
async function publishedVictim() {
  victims += 1;
  const email = `${tag}-victim${victims}@example.org`;
  victimEmails.push(email);
  request.reset();
  expect(await submitReview(form(email, 'none'))).toMatchObject({ ok: true });
  await prisma.review.updateMany({
    where: { authorEmailHash: hashEmail(email) },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
  request.reset();
  return email;
}
let slug = '';

const form = (email: string, mode: 'none' | 'account') => ({
  programSlug: slug,
  level: 'M2',
  cohortYear: 2024,
  overallRating: 4,
  pros: 'Les cours sont solides et bien organisés sur les deux années.',
  cons: 'Peu de lien avec les entreprises pendant la première année.',
  scores: {},
  mode,
  email,
  acceptsQuestions: false,
  wantsBadge: false,
  charter: true,
  turnstileToken: TURNSTILE_MOCK_TOKEN,
});

/** What a visitor can see of an answer (the address echoed back is their own input). */
const visible = (r: unknown) => JSON.stringify(r);

beforeAll(async () => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
  const p = await programBySlug(FX.programs.questions);
  slug = p!.slug;
});

beforeEach(() => request.reset());

afterAll(async () => {
  const hashes = [...victimEmails, attacker].map(hashEmail);
  await prisma.review.deleteMany({ where: { authorEmailHash: { in: hashes } } });
  await prisma.student.deleteMany({ where: { emailHash: { in: hashes } } });
  await prisma.magicLinkToken.deleteMany({ where: { emailHash: { in: hashes } } });
});

describe('sending a review without a session', () => {
  it('answers the same whether the address already reviewed this parcours or not', async () => {
    const victim = await publishedVictim();
    const probeExisting = await submitReview(form(victim, 'none'));
    request.reset();
    const probeFresh = await submitReview(form(attacker, 'none'));

    const neutral = (r: unknown) => visible(r).replaceAll(victim, 'X').replaceAll(attacker, 'X');
    expect(neutral(probeExisting)).toBe(neutral(probeFresh));
    expect(visible(probeExisting)).not.toMatch(/déjà/);
    // Still one review for the victim: nothing was created by the probe.
    expect(await prisma.review.count({ where: { authorEmailHash: hashEmail(victim) } })).toBe(1);
    // The owner of the address learns it by mail, not the visitor.
    expect(mailbox.at(-2)?.to).toBe(victim);
    expect(mailbox.at(-2)?.text).toMatch(/déjà/);
  });

  it('the same in « avec mon espace » mode', async () => {
    const victim = await publishedVictim();
    const probeExisting = await submitReview(form(victim, 'account'));
    request.reset();
    const fresh = `${tag}-fresh@example.org`;
    const probeFresh = await submitReview(form(fresh, 'account'));
    const neutral = (r: unknown) => visible(r).replaceAll(victim, 'X').replaceAll(fresh, 'X');
    expect(neutral(probeExisting)).toBe(neutral(probeFresh));
    await prisma.review.deleteMany({ where: { authorEmailHash: hashEmail(fresh) } });
    await prisma.magicLinkToken.deleteMany({ where: { emailHash: hashEmail(fresh) } });
  });
});

describe('« avec mon espace » without a session', () => {
  const owners = [`${tag}-owner1@example.org`, `${tag}-owner2@example.org`];
  afterAll(async () => {
    const hashes = owners.map(hashEmail);
    await prisma.review.deleteMany({ where: { authorEmailHash: { in: hashes } } });
    await prisma.student.deleteMany({ where: { emailHash: { in: hashes } } });
    await prisma.magicLinkToken.deleteMany({ where: { emailHash: { in: hashes } } });
  });

  it('neither creates a space nor enters moderation before the code of the mail', async () => {
    const owner = owners[0]!;
    const r = await submitReview(form(owner, 'account'));
    expect(r).toMatchObject({ ok: true, mode: 'account', loggedIn: false });
    expect(await prisma.student.findUnique({ where: { emailHash: hashEmail(owner) } })).toBeNull();
    const review = await prisma.review.findFirst({ where: { authorEmailHash: hashEmail(owner) } });
    expect(review?.status).toBe('PENDING_CONFIRMATION');
    expect(review?.studentId).toBeNull();
  });

  it('the code of the mail proves the address: space opened, review attached and in moderation', async () => {
    const owner = owners[1]!;
    expect(await submitReview(form(owner, 'account'))).toMatchObject({ ok: true, loggedIn: false });
    const out = await run(() => verifyLoginCode(owner, lastCode(owner)));
    expect(out).toMatchObject({ redirect: expect.any(String) });
    const student = await prisma.student.findUnique({ where: { emailHash: hashEmail(owner) } });
    const review = await prisma.review.findFirst({ where: { authorEmailHash: hashEmail(owner) } });
    expect(review?.studentId).toBe(student?.id);
    expect(review?.status).toBe('PENDING');
  });
});

describe('the « Merci » screen of a review without account', () => {
  it('a wrong code says the same whether a review awaits confirmation or not', async () => {
    const pending = `${tag}-pending@example.org`;
    await submitReview(form(pending, 'none'));
    const withPending = await confirmReviewByCode(pending, slug, '000000');
    const withNothing = await confirmReviewByCode(`${tag}-nobody@example.org`, slug, '000000');
    expect(withPending).toEqual(withNothing);
    request.reset();
    const resendPending = await resendReviewCode(pending, slug, TURNSTILE_MOCK_TOKEN);
    request.reset();
    const resendNothing = await resendReviewCode(
      `${tag}-nobody2@example.org`,
      slug,
      TURNSTILE_MOCK_TOKEN,
    );
    expect(resendPending).toEqual(resendNothing);
    await prisma.review.deleteMany({ where: { authorEmailHash: hashEmail(pending) } });
    await prisma.magicLinkToken.deleteMany({ where: { emailHash: hashEmail(pending) } });
  });
});

describe('minimum length of « Ce que tu as aimé » and « Ce que tu n’as pas aimé »', () => {
  const FIFTEEN = 'Cours concrets.'; // 15 characters
  it('the server accepts 15 characters (spaces at both ends not counted), refuses 14', async () => {
    const ok = `${tag}-min15@example.org`;
    const short = `${tag}-min14@example.org`;
    victimEmails.push(ok, short);
    expect(
      await submitReview({ ...form(ok, 'none'), pros: `  ${FIFTEEN} `, cons: FIFTEEN }),
    ).toMatchObject({ ok: true });
    const saved = await prisma.review.findFirst({ where: { authorEmailHash: hashEmail(ok) } });
    expect(saved).toMatchObject({ pros: FIFTEEN, cons: FIFTEEN });

    request.reset();
    const refused = await submitReview({
      ...form(short, 'none'),
      pros: `  ${FIFTEEN.slice(0, 14)}  `,
      cons: FIFTEEN,
    });
    expect(refused).toMatchObject({ ok: false, fieldErrors: { pros: '15 caractères minimum.' } });
    expect(await prisma.review.count({ where: { authorEmailHash: hashEmail(short) } })).toBe(0);
  });
});
