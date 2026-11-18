import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { studentSession, validateSession } from './session';

/** Current logged-in student (or null). Deleted accounts are treated as logged out. */
export const getCurrentStudent = cache(async () => {
  const session = await studentSession();
  if (!session.studentId) return null;
  // The session lives on the server: revoked at logout, ended after 14 days without activity.
  if (!(await validateSession('STUDENT', session.sid, session.studentId))) return null;
  const student = await prisma.student.findUnique({ where: { id: session.studentId } });
  if (!student || student.deletedAt) return null;
  return student;
});

/** Unread messages for the student: questions on their reviews + answers to their questions. */
export async function unreadCount(studentId: string): Promise<number> {
  const [asAuthor, asAsker] = await Promise.all([
    prisma.message.count({
      where: { readAt: null, fromRole: 'ASKER', conversation: { review: { studentId } } },
    }),
    prisma.message.count({
      where: { readAt: null, fromRole: 'AUTHOR', conversation: { askerStudentId: studentId } },
    }),
  ]);
  return asAuthor + asAsker;
}
