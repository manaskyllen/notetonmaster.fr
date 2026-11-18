/** Generic background jobs (table Job). */
import { dataExportMail } from '../emails/templates';
import { decrypt } from '../lib/crypto';
import { prisma } from '../lib/db';
import { sendMail } from '../lib/mail/send';
import { BULK_JOB, runBulkJob, type BulkPayload } from '../lib/admin/bulk';
import {
  AUDIT_EXPORT_JOB,
  runAuditExport,
  type AuditExportPayload,
} from '../lib/admin/audit-export';

async function exportData(studentId: string) {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      reviews: { include: { program: { select: { title: true, slug: true } }, scores: true } },
      verifications: { include: { program: { select: { title: true } } } },
      favorites: { include: { program: { select: { title: true, slug: true } } } },
    },
  });
  if (!s || s.deletedAt) return;
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ review: { studentId } }, { askerStudentId: studentId }] },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      review: { select: { ref: true, studentId: true } },
    },
  });
  const email = decrypt(s.emailEnc);
  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      email,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      acceptsQuestions: s.acceptsQuestions,
      level: s.level,
      notifications: {
        newMessage: s.notifyNewMessage,
        reviewStatus: s.notifyReviewStatus,
        savedDigest: s.notifySavedDigest,
      },
    },
    reviews: s.reviews.map((r) => ({
      ref: r.ref,
      program: r.program.title,
      level: r.level,
      cohortYear: r.cohortYear,
      overallRating: r.overallRating,
      title: r.title,
      pros: r.pros,
      cons: r.cons,
      scores: Object.fromEntries(r.scores.map((x) => [x.criterion, x.score])),
      status: r.status,
      moderationReason: r.moderationReason,
      submittedAt: r.submittedAt,
      publishedAt: r.publishedAt,
    })),
    verifications: s.verifications.map((v) => ({
      program: v.program.title,
      method: v.method,
      status: v.status,
      documentType: v.documentType,
      createdAt: v.createdAt,
      decidedAt: v.decidedAt,
      reason: v.reason,
    })),
    favorites: s.favorites.map((f) => f.program.title),
    conversations: conversations.map((c) => ({
      review: c.review.ref,
      role: c.review.studentId === studentId ? 'author' : 'asker',
      status: c.status,
      messages: c.messages.map((m) => ({
        from:
          m.fromRole === 'AUTHOR'
            ? c.review.studentId === studentId
              ? 'moi'
              : 'auteur·rice'
            : c.review.studentId === studentId
              ? c.alias
              : 'moi',
        body: m.body,
        at: m.createdAt,
      })),
    })),
  };
  await sendMail(email, dataExportMail(), [
    {
      filename: 'notetonmaster-mes-donnees.json',
      content: JSON.stringify(data, null, 2),
      contentType: 'application/json',
    },
  ]);
}

const HANDLERS: Record<
  string,
  (payload: Record<string, unknown>, jobId: string) => Promise<unknown>
> = {
  EXPORT_DATA: (p) => exportData(String(p.studentId)),
  // Admin: bulk actions and exports of Fiches (progress and summary on the Job).
  [BULK_JOB]: (p, jobId) => runBulkJob(jobId, p as unknown as BulkPayload),
  [AUDIT_EXPORT_JOB]: (p, jobId) => runAuditExport(jobId, p as unknown as AuditExportPayload),
};

/** Claims and runs one queued job. Returns false when the queue is empty. */
export async function runNextJob(): Promise<boolean> {
  const job = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Job" WHERE status = 'QUEUED' AND "runAt" <= now() AND type <> 'indexnow'
       ORDER BY "runAt" LIMIT 1 FOR UPDATE SKIP LOCKED`; // indexnow: sent once a minute by flushIndexNow
      if (!rows[0]) return null;
      return tx.job.update({
        where: { id: rows[0].id },
        data: { status: 'RUNNING', attempts: { increment: 1 } },
      });
      // A sync pass can hold connections for a while: wait for one rather than fail the claim.
    },
    { maxWait: 10_000 },
  );
  if (!job) return false;
  const handler = HANDLERS[job.type];
  try {
    if (!handler) throw new Error(`Unknown job type ${job.type}`);
    const result = await handler(job.payload as Record<string, unknown>, job.id);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'DONE', ...(result ? { result: result as never } : {}) },
    });
  } catch (err) {
    const retry = job.attempts < 3 && job.type !== BULK_JOB && job.type !== AUDIT_EXPORT_JOB;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: retry ? 'QUEUED' : 'FAILED',
        lastError: String(err).slice(0, 500),
        ...(retry ? {} : { result: { summary: `Échec : ${String(err).slice(0, 200)}` } }),
        runAt: new Date(Date.now() + job.attempts * 60_000),
      },
    });
    console.error(`[worker] job ${job.type} failed`, err);
  }
  return true;
}
