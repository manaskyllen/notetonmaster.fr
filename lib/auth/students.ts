import 'server-only';
import { prisma } from '@/lib/db';
import { encrypt, hashEmail, normalizeEmail } from '@/lib/crypto';

/** Finds or creates the student space for an email. A deleted space is recreated empty. */
export async function findOrCreateStudent(email: string) {
  const emailHash = hashEmail(email);
  const existing = await prisma.student.findUnique({ where: { emailHash } });
  if (existing && !existing.deletedAt) return existing;
  if (existing) await prisma.student.delete({ where: { id: existing.id } });
  return prisma.student.create({ data: { emailHash, emailEnc: encrypt(normalizeEmail(email)) } });
}
