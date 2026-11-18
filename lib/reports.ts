import 'server-only';
import { prisma } from '@/lib/db';
import { nextReference, type RefPrefix } from '@/lib/domain/references';
import { shouldAutoHide } from '@/lib/domain/review-status';
import { getSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';
import { afterReviewChange } from '@/lib/cache/next';

/** Allocates the next SIG-/NOT-/REQ- reference for the current year. */
export async function allocateReference(prefix: RefPrefix): Promise<string> {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-`;
  const existing =
    prefix === 'SIG'
      ? (
          await prisma.report.findMany({
            where: { reference: { startsWith: like } },
            select: { reference: true },
          })
        ).map((r) => r.reference)
      : (
          await prisma.legalRequest.findMany({
            where: { reference: { startsWith: like } },
            select: { reference: true },
          })
        ).map((r) => r.reference);
  return nextReference(prefix, year, existing);
}

/** Runs `create` with a fresh reference, retrying if two requests race for the same number. */
export async function withReference<T>(
  prefix: RefPrefix,
  create: (reference: string) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 5; i++) {
    const ref = await allocateReference(prefix);
    try {
      return await create(ref);
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  throw new Error('Could not allocate a reference');
}

/** After N reports in 24 h (setting), a published review is hidden pending a decision. */
export async function autoHideIfNeeded(reviewId: string): Promise<boolean> {
  const threshold = (await getSettings())['moderation.reportThreshold'];
  // Distinct reporters (keyed hash of the real IP, lib/ip.ts), not reports: one person sending
  // the form several times is one report.
  const reporters = await prisma.report.groupBy({
    by: ['reporterKey'],
    where: {
      targetType: 'REVIEW',
      targetId: reviewId,
      reporterKey: { not: null },
      createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    },
  });
  const count = reporters.length;
  if (!shouldAutoHide(count, threshold)) return false;
  const r = await prisma.review.updateMany({
    where: { id: reviewId, status: 'PUBLISHED' },
    data: {
      status: 'HIDDEN',
      hiddenAt: new Date(),
      moderationReason: `Masqué temporairement après ${count} signalements en 24 h, en attente de vérification.`,
    },
  });
  if (r.count) {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { ref: true, programId: true },
    });
    await afterReviewChange([review?.programId]);
    await audit(
      null,
      'MODERATION',
      review?.ref ?? reviewId,
      `Avis masqué temporairement après ${count} signalements`,
    );
  }
  return r.count > 0;
}

/** Resolves "avis-7f3a21", a URL containing it, or "#avis-…" to a review. */
export async function findReviewByTarget(target: string) {
  const m = /avis-[0-9a-f]{6}/i.exec(target);
  if (!m) return null;
  return prisma.review.findUnique({
    where: { ref: m[0].toLowerCase() },
    include: { program: { select: { title: true, slug: true } } },
  });
}
