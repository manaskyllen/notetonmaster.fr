import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getCurrentStudent, unreadCount } from '@/lib/auth/student';
import { decrypt, maskEmail } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { followedIds } from '@/lib/favorites';
import { verifiedSummary } from '@/lib/domain/verification';
import { getStudentConversations, waitingQuestions } from '@/lib/messaging/queries';
import { getSettings } from '@/lib/settings';

const DAY = 24 * 3600_000;

/**
 * Everything « Mon espace » shows (sidebar and the six tabs), loaded once per request.
 * Redirects to the login page without a session.
 */
export const getEspace = cache(async () => {
  const student = await getCurrentStudent();
  if (!student) redirect('/connexion');
  const [reviews, verifications, favorites, conversations, settings] = await Promise.all([
    prisma.review.findMany({
      where: { studentId: student.id },
      orderBy: { submittedAt: 'desc' },
      include: {
        program: {
          select: {
            id: true,
            title: true,
            slug: true,
            city: true,
            university: { select: { id: true, name: true, shortName: true, emailDomains: true } },
          },
        },
        _count: { select: { conversations: true } },
      },
    }),
    prisma.programVerification.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        programId: true,
        method: true,
        status: true,
        codeExpiresAt: true,
        universityEmailHash: true,
        decidedAt: true,
        reason: true,
        createdAt: true,
        program: { select: { universityId: true } },
      },
    }),
    // Counter only: the « Masters suivis » tab pages its own list.
    followedIds(student.id),
    // Dashboard: the 3 latest conversations; the Messages tab pages its own list.
    getStudentConversations(student.id, { take: 3 }),
    getSettings(),
  ]);
  const [waiting, unread] = await Promise.all([
    waitingQuestions(student.id),
    unreadCount(student.id),
  ]);
  const weekViews = await prisma.reviewView.count({
    where: {
      review: { studentId: student.id },
      day: { gte: new Date(Date.now() - 7 * DAY) },
    },
  });
  const email = decrypt(student.emailEnc);
  const programIds = reviews.map((r) => r.programId);
  return {
    student,
    email,
    maskedEmail: maskEmail(email),
    reviews,
    verifications,
    favorites,
    conversations,
    settings,
    weekViews,
    verified: verifiedSummary(programIds, verifications),
    waiting,
    unread,
    toFix: reviews.filter((r) => r.status === 'NEEDS_EDIT').length,
  };
});

export type EspaceData = Awaited<ReturnType<typeof getEspace>>;
