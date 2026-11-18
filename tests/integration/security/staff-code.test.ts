/** Teaching-team code: salted keyed hash, attempts counted atomically, compared in constant time. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { universityBySlug } from '../fixtures/lookup';

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { request } = await import('../helpers/request');
const { lastCode } = await import('../helpers/mailbox');
const { prisma } = await import('@/lib/db');
const { hashEmail } = await import('@/lib/crypto');
const { requestStaffCode, verifyStaffCode } =
  await import('@/app/(public)/reponse-formation/actions');
const { TURNSTILE_MOCK_TOKEN } = await import('@/lib/turnstile-forms');

let email = '';
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  process.env.RATE_LIMIT_MULTIPLIER = '50';
  const u = await universityBySlug(FX.universities.nantes);
  email = `sec-staff-${Date.now()}@${u!.mailDomains[0]}`;
  request.reset();
  const r = await requestStaffCode(
    { status: 'idle' } as never,
    fd({ email, universityId: u!.id, 'cf-turnstile-response': TURNSTILE_MOCK_TOKEN }),
  );
  expect(r.status).toBe('success');
});

afterAll(async () => {
  await prisma.staffResponder.deleteMany({ where: { emailHash: hashEmail(email) } });
});

describe('staff code', () => {
  it('is not stored as a bare SHA-256 of 6 digits', async () => {
    const row = await prisma.staffResponder.findUnique({ where: { emailHash: hashEmail(email) } });
    expect(row?.codeHash).not.toBe(createHash('sha256').update(lastCode(email)).digest('hex'));
  });

  it('parallel wrong guesses never count more than 5 attempts', async () => {
    const code = lastCode(email);
    const wrong = code === '000000' ? '111111' : '000000';
    await Promise.all(
      Array.from({ length: 12 }, () =>
        verifyStaffCode({ status: 'idle' } as never, fd({ code: wrong })),
      ),
    );
    const row = await prisma.staffResponder.findUnique({ where: { emailHash: hashEmail(email) } });
    expect(row?.codeAttempts).toBe(5);
    expect((await verifyStaffCode({ status: 'idle' } as never, fd({ code }))).status).toBe('error');
  });

  it('compares in constant time', () => {
    const src = readFileSync('app/(public)/reponse-formation/actions.ts', 'utf8');
    expect(src).not.toMatch(/hashToken\(code\) !== /);
    expect(src).toMatch(/timingSafeEqual/);
  });
});
