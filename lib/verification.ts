import 'server-only';
import { prisma } from '@/lib/db';
import type { VerificationMethod } from '@/lib/db/generated/enums';
import { refreshVerifiedForStudent } from '@/lib/reviews/verified';

/**
 * Grants « Parcours vérifié » for one (student, program): at most one APPROVED verification per
 * pair (a master is never verified twice), then the badge of the student's reviews is updated.
 */
export async function grantProgramVerification(data: {
  studentId: string;
  programId: string;
  method: VerificationMethod;
  universityEmailHash?: string | null;
  documentId?: string | null;
  documentType?: string | null;
  decidedById?: string | null;
}) {
  const existing = await prisma.programVerification.findFirst({
    where: { studentId: data.studentId, programId: data.programId, status: 'APPROVED' },
  });
  if (!existing)
    await prisma.programVerification.create({
      data: { ...data, status: 'APPROVED', decidedAt: new Date() },
    });
  await refreshVerifiedForStudent(data.studentId);
}
