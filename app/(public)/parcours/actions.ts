'use server';

import { HELPFUL_PER_HOUR } from '@/lib/domain/limits';
import { HOUR, rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentStudent } from '@/lib/auth/student';
import { getVoterKey } from '@/lib/voter';
import { PROGRAM_ID, setFollowed } from '@/lib/favorites';

/** Toggles the visitor's "Utile" vote (one vote per visitor cookie). */
export async function toggleHelpful(
  reviewId: string,
): Promise<{ count: number; voted: boolean } | { error: string }> {
  const id = z.string().cuid().safeParse(reviewId);
  if (!id.success) return { error: 'Avis introuvable.' };
  const review = await prisma.review.findFirst({
    where: { id: id.data, status: 'PUBLISHED' },
    select: { id: true },
  });
  if (!review) return { error: 'Avis introuvable.' };
  // Per connection (real IP), whatever the cookies: clearing them does not give more votes.
  if (!(await rateLimit(`helpful:${await clientIp()}`, HELPFUL_PER_HOUR, HOUR)))
    return { error: 'Trop de votes depuis cette connexion. Réessaie plus tard.' };
  const voterKey = (await getVoterKey(true))!;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.helpfulVote.findUnique({
      where: { reviewId_voterKey: { reviewId: review.id, voterKey } },
    });
    if (existing) {
      await tx.helpfulVote.delete({ where: { id: existing.id } });
      const r = await tx.review.update({
        where: { id: review.id },
        data: { helpfulCount: { decrement: 1 } },
      });
      return { count: Math.max(0, r.helpfulCount), voted: false };
    }
    await tx.helpfulVote.create({ data: { reviewId: review.id, voterKey } });
    const r = await tx.review.update({
      where: { id: review.id },
      data: { helpfulCount: { increment: 1 } },
    });
    return { count: r.helpfulCount, voted: true };
  });
}

/**
 * « Suivre » / « Ne plus suivre »: sets the state asked (never a toggle, so a stale button or a
 * double click cannot do the opposite of what is shown). The answer is the stored state.
 */
export async function setFollow(
  programId: string,
  followed: boolean,
): Promise<{ followed: boolean } | { error: string }> {
  const student = await getCurrentStudent();
  if (!student) return { error: 'Ta session a expiré : reconnecte-toi pour suivre ce master.' };
  if (typeof programId !== 'string' || !PROGRAM_ID.test(programId) || typeof followed !== 'boolean')
    return { error: 'Parcours introuvable.' };
  const program = await prisma.program.findFirst({
    where: { id: programId, isPublished: true, inOpenZone: true },
    select: { id: true },
  });
  if (!program && followed) return { error: 'Parcours introuvable.' };
  await setFollowed(student.id, programId, followed);
  revalidatePath('/espace', 'layout');
  return { followed };
}
