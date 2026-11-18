import { prisma } from '@/lib/db';
import { isReviewVerified } from '@/lib/domain/verification';
import { afterReviewChange } from '@/lib/cache/next';

/** Recomputes the "Parcours vérifié" flag of every review of a student (after a decision). */
export async function refreshVerifiedForStudent(studentId: string) {
  const [verifs, reviews] = await Promise.all([
    prisma.programVerification.findMany({
      where: { studentId, status: 'APPROVED' },
      select: { programId: true, status: true },
    }),
    prisma.review.findMany({
      where: { studentId },
      select: { id: true, programId: true, isVerified: true },
    }),
  ]);
  const changed: string[] = [];
  for (const r of reviews) {
    const v = isReviewVerified(r.programId, verifs);
    if (v !== r.isVerified) {
      await prisma.review.update({ where: { id: r.id }, data: { isVerified: v } });
      changed.push(r.programId);
    }
  }
  if (changed.length) await afterReviewChange(changed);
}

/** Verified flag for one review (reviews without account are never verified). */
export async function computeVerified(review: {
  studentId: string | null;
  programId: string;
}): Promise<boolean> {
  if (!review.studentId) return false;
  const approved = await prisma.programVerification.findFirst({
    where: { studentId: review.studentId, programId: review.programId, status: 'APPROVED' },
    select: { id: true },
  });
  return !!approved;
}
