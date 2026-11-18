/**
 * Retention: contact messages 12 months, Turnstile log 90 days, proofs of study not reviewed
 * within 30 days deleted, original file names erased at the decision, orphan files removed,
 * ended sessions purged.
 */
import { existsSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FX } from '../fixtures/ids';
import { programBySlug } from '../fixtures/lookup';

const dir = mkdtempSync(join(tmpdir(), 'nm-retention-'));
process.env.UPLOADS_DIR = dir;

vi.mock('next/headers', async () => (await import('../helpers/request')).nextHeaders);
vi.mock('next/navigation', async () => (await import('../helpers/request')).nextNavigation);
vi.mock('next/cache', async () => (await import('../helpers/request')).nextCache);
vi.mock('@/lib/mail/send', async () => (await import('../helpers/mailbox')).mailModule);

const { prisma } = await import('@/lib/db');
const { purgePersonalData } = await import('@/lib/admin/retention');
const { encrypt } = await import('@/lib/crypto');

const DAY = 86_400_000;
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const ids = { contacts: [] as string[], students: [] as string[] };

beforeAll(async () => {
  for (const [days, handled] of [
    [400, true],
    [400, false],
    [100, true],
  ] as const) {
    const c = await prisma.contactMessage.create({
      data: {
        subject: 'Test',
        emailEnc: encrypt('x@example.org'),
        body: 'test',
        createdAt: ago(days),
        handledAt: handled ? ago(days - 1) : null,
      },
    });
    ids.contacts.push(c.id);
  }
  await prisma.turnstileLog.createMany({
    data: [
      { form: 'test-retention', outcome: 'OK', errorCodes: [], at: ago(91) },
      { form: 'test-retention', outcome: 'OK', errorCodes: [], at: ago(10) },
    ],
  });
});

afterAll(async () => {
  await prisma.contactMessage.deleteMany({ where: { id: { in: ids.contacts } } });
  await prisma.turnstileLog.deleteMany({ where: { form: 'test-retention' } });
  await prisma.student.deleteMany({ where: { id: { in: ids.students } } });
});

async function pendingProof(days: number) {
  const program = await programBySlug(FX.programs.questions);
  const s = await prisma.student.create({
    data: { emailHash: `test-ret-${Math.random()}`, emailEnc: encrypt('s@example.org') },
  });
  ids.students.push(s.id);
  const name = `${Math.random().toString(36).slice(2)}.pdf`;
  writeFileSync(join(dir, name), '%PDF-1.4 test');
  const v = await prisma.programVerification.create({
    data: {
      studentId: s.id,
      programId: program!.id,
      method: 'DOCUMENT',
      status: 'PENDING',
      documentPath: name,
      documentMime: 'application/pdf',
      documentName: 'Carte_etudiante_Jean_Dupont.pdf',
      createdAt: ago(days),
    },
  });
  return { v, file: join(dir, name) };
}

describe('purgePersonalData', () => {
  it('contact messages: 12 months', async () => {
    await purgePersonalData(now);
    const left = await prisma.contactMessage.findMany({ where: { id: { in: ids.contacts } } });
    expect(left.map((c) => c.id)).toEqual([ids.contacts[2]]);
  });

  it('Turnstile log: 90 days', async () => {
    await purgePersonalData(now);
    expect(await prisma.turnstileLog.count({ where: { form: 'test-retention' } })).toBe(1);
  });

  it('a proof not reviewed within 30 days: file and name deleted, student asked to send it again', async () => {
    const old = await pendingProof(31);
    const recent = await pendingProof(5);
    await purgePersonalData(now);
    const v = await prisma.programVerification.findUnique({ where: { id: old.v.id } });
    expect(existsSync(old.file)).toBe(false);
    expect(v).toMatchObject({ status: 'MORE_INFO', documentPath: null, documentName: null });
    expect(existsSync(recent.file)).toBe(true);
    expect(
      (await prisma.programVerification.findUnique({ where: { id: recent.v.id } }))?.status,
    ).toBe('PENDING');
  });

  it('files no verification refers to are removed (after a day)', async () => {
    const orphan = join(dir, 'orphelin.pdf');
    writeFileSync(orphan, '%PDF-1.4');
    utimesSync(orphan, ago(2), ago(2));
    const fresh = join(dir, 'en-cours.pdf');
    writeFileSync(fresh, '%PDF-1.4');
    await purgePersonalData(now);
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it('ended sessions are purged after 30 days', async () => {
    await prisma.authSession.create({
      data: { id: `test-ret-${Date.now()}`, kind: 'STUDENT', subjectId: 'x', lastSeenAt: ago(40) },
    });
    await purgePersonalData(now);
    expect(await prisma.authSession.count({ where: { lastSeenAt: { lt: ago(31) } } })).toBe(0);
  });
});

describe('decision on a proof', () => {
  it('the original file name is erased with the file', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('app/admin/(panel)/moderation/actions.ts', 'utf8'),
    );
    expect(src).toMatch(/documentPath: null,\s*documentName: null/);
  });
});
