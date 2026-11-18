'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { guard } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import { canTransition } from '@/lib/domain/review-status';
import { computeVerified } from '@/lib/reviews/verified';
import { afterReviewChange } from '@/lib/cache/next';

const schema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(['publish', 'hide']),
  reason: z.string().trim().max(500).default(''),
});

/** Bulk publish / hide. Only allowed transitions are applied; the others are reported. */
export async function bulkReviews(raw: unknown) {
  return guard('moderation.manage', async (admin) => {
    const p = schema.safeParse(raw);
    if (!p.success) return { ok: false as const, error: 'Sélection invalide.' };
    const { ids, action, reason } = p.data;
    if (action === 'hide' && reason.length < 3)
      return { ok: false as const, error: 'Indique le motif du masquage.' };
    const to = action === 'publish' ? 'PUBLISHED' : 'HIDDEN';
    const reviews = await prisma.review.findMany({ where: { id: { in: ids } } });
    let done = 0;
    for (const r of reviews) {
      if (!canTransition(r.status, to) || r.status === to) continue;
      await prisma.review.update({
        where: { id: r.id },
        data: {
          status: to,
          moderatedById: admin.id,
          moderatedAt: new Date(),
          moderationReason: to === 'HIDDEN' ? reason : null,
          publishedAt: to === 'PUBLISHED' ? (r.publishedAt ?? new Date()) : r.publishedAt,
          hiddenAt: to === 'HIDDEN' ? new Date() : r.hiddenAt,
          isVerified: to === 'PUBLISHED' ? await computeVerified(r) : r.isVerified,
        },
      });
      await audit(
        admin,
        'MODERATION',
        r.ref,
        to === 'PUBLISHED'
          ? 'Avis publié (action groupée)'
          : `Avis masqué (action groupée) · motif : ${reason}`,
      );
      done++;
    }
    if (done) await afterReviewChange(reviews.map((r) => r.programId));
    revalidatePath('/admin/avis');
    return {
      ok: true as const,
      message: `${done} avis ${to === 'PUBLISHED' ? 'publié(s)' : 'masqué(s)'}${reviews.length - done ? ` · ${reviews.length - done} ignoré(s) (transition non autorisée)` : ''}.`,
    };
  });
}
