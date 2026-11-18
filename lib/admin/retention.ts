import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { deleteDocument, UPLOADS_DIR } from '@/lib/uploads';

const DAY = 86_400_000;

/**
 * Sync journal retention: log lines 30 days, passes 90 days. The last finished pass of each
 * source is kept (its health and its report depend on it), and so are passes whose raw files are
 * still kept (RawSnapshot, purged by their own rule).
 */
export async function purgeSyncJournal(now = new Date()) {
  const lines = await prisma.syncLog.deleteMany({
    where: { at: { lt: new Date(now.getTime() - 30 * DAY) } },
  });
  const runs = await prisma.$executeRaw`
    DELETE FROM "SyncRun" r
     WHERE r."queuedAt" < ${new Date(now.getTime() - 90 * DAY)}
       AND r.status NOT IN ('QUEUED', 'RUNNING')
       AND NOT EXISTS (SELECT 1 FROM "RawSnapshot" s WHERE s."runId" = r.id)
       AND r.id <> (SELECT l.id FROM "SyncRun" l WHERE l."sourceId" = r."sourceId"
                     AND l.status IN ('SUCCEEDED', 'FAILED', 'AWAITING_VALIDATION')
                     ORDER BY l."queuedAt" DESC LIMIT 1)`;
  return { lines: lines.count, runs };
}

/**
 * Audit log retention: 1 year, 5 years for the LEGAL category. The table refuses any other
 * deletion (trigger audit_log_immutable).
 */
export async function purgeAuditLog(now = new Date()) {
  return prisma.$executeRaw`
    DELETE FROM "AuditLog"
     WHERE at < ${new Date(now.getTime() - 365 * DAY)}
       AND (category <> 'LEGAL' OR at < ${new Date(now.getTime() - 5 * 365 * DAY)})`;
}

/**
 * Personal data kept no longer than needed (daily, worker):
 * - contact messages: 12 months;
 * - Turnstile log: 90 days (no personal data, but it grows);
 * - proofs of study not reviewed within 30 days: file and original name deleted, the student is
 *   asked to send it again (MORE_INFO);
 * - files of the uploads volume that no verification refers to, after a day (interrupted upload);
 * - ended sessions (revoked or idle) after 30 days.
 */
export async function purgePersonalData(now = new Date()) {
  const contacts = await prisma.contactMessage.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 365 * DAY) } },
  });
  const turnstile = await prisma.turnstileLog.deleteMany({
    where: { at: { lt: new Date(now.getTime() - 90 * DAY) } },
  });

  const stale = await prisma.programVerification.findMany({
    where: {
      status: 'PENDING',
      documentPath: { not: null },
      createdAt: { lt: new Date(now.getTime() - 30 * DAY) },
    },
    select: { id: true, documentPath: true },
  });
  for (const v of stale) {
    await deleteDocument(v.documentPath);
    await prisma.programVerification.update({
      where: { id: v.id },
      data: {
        status: 'MORE_INFO',
        documentPath: null,
        documentName: null,
        decidedAt: now,
        reason:
          'Ton justificatif n’a pas pu être vérifié sous 30 jours : il a été supprimé. Envoie-le à nouveau.',
      },
    });
  }

  let orphans = 0;
  const files = await readdir(UPLOADS_DIR).catch(() => [] as string[]);
  if (files.length) {
    const used = new Set(
      (
        await prisma.programVerification.findMany({
          where: { documentPath: { in: files } },
          select: { documentPath: true },
        })
      ).map((v) => v.documentPath),
    );
    for (const f of files) {
      if (used.has(f)) continue;
      const info = await stat(join(UPLOADS_DIR, f)).catch(() => null);
      if (info?.isFile() && now.getTime() - info.mtime.getTime() > DAY) {
        await unlink(join(UPLOADS_DIR, f)).catch(() => {});
        orphans++;
      }
    }
  }

  const sessions = await prisma.authSession.deleteMany({
    where: {
      OR: [
        { revokedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
        { lastSeenAt: { lt: new Date(now.getTime() - 30 * DAY) } },
      ],
    },
  });
  return {
    contacts: contacts.count,
    turnstile: turnstile.count,
    staleProofs: stale.length,
    orphans,
    sessions: sessions.count,
  };
}
