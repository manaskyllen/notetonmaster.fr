/**
 * Server Actions accept 1 MB at most; the proof of study (10 MB) goes through its own route,
 * which checks the session, the origin (proxy.ts) and the size before reading the body.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request, run } = await import('../helpers/request');
const { lastCode } = await import('../helpers/mailbox');
const { prisma } = await import('@/lib/db');
const { hashEmail } = await import('@/lib/crypto');
const { requestLoginCode, verifyLoginCode } = await import('@/app/(public)/connexion/actions');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');
const route = await import('@/app/api/espace/justificatif/route');

const email = `sec-upload-${Date.now()}@example.org`;
let programId = '';
let session: ReturnType<typeof request.snapshot> = [];

const post = (fd: FormData, length?: number) =>
  route.POST(
    new Request('http://localhost/api/espace/justificatif', {
      method: 'POST',
      body: fd,
      headers: length ? { 'content-length': String(length) } : {},
    }),
  );

beforeAll(async () => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
  request.reset();
  const f = new FormData();
  f.set('email', email);
  f.set('cf-turnstile-response', TURNSTILE_MOCK_TOKEN);
  await requestLoginCode({ status: 'idle' } as never, f);
  await run(() => verifyLoginCode(email, lastCode(email)));
  session = request.snapshot();
  const student = await prisma.student.findUnique({ where: { emailHash: hashEmail(email) } });
  const program = await programBySlug(FX.programs.questions);
  programId = program!.id;
  await prisma.review.create({
    data: {
      ref: `avis-${Date.now().toString(16).slice(-6)}`,
      programId,
      studentId: student!.id,
      authorEmailHash: hashEmail(email),
      level: 'M2',
      cohortYear: 2024,
      overallRating: 4,
      pros: 'x'.repeat(40),
      cons: 'y'.repeat(40),
      status: 'PENDING',
    },
  });
});

afterAll(async () => {
  const student = await prisma.student.findUnique({ where: { emailHash: hashEmail(email) } });
  if (student) {
    await prisma.programVerification.deleteMany({ where: { studentId: student.id } });
    await prisma.review.deleteMany({ where: { studentId: student.id } });
    await prisma.student.delete({ where: { id: student.id } });
  }
});

const doc = () => {
  const fd = new FormData();
  fd.set('programId', programId);
  fd.set('document', new File([new TextEncoder().encode('%PDF-1.4 test')], 'justif.pdf'));
  return fd;
};

describe('upload of a proof of study', () => {
  // Each test starts as the logged-in student, whatever ran before.
  beforeEach(() => request.restore(session));
  it('Server Actions are limited to 1 MB', () => {
    expect(readFileSync('next.config.ts', 'utf8')).toMatch(/bodySizeLimit: '1mb'/);
  });

  it('refuses a body announced over 11 MB before reading it', async () => {
    expect((await post(doc(), 12 * 1024 * 1024)).status).toBe(413);
  });

  it('accepts the proof of the logged-in student', async () => {
    const r = await post(doc());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  it('refuses without a session', async () => {
    request.reset();
    expect((await post(doc())).status).toBe(401);
  });
});
