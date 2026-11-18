import 'server-only';
import { prisma } from '@/lib/db';
import { reviewRef } from '@/lib/domain/references';

/** Unique short reference "avis-xxxxxx". */
export async function newReviewRef(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const ref = reviewRef();
    if (!(await prisma.review.findUnique({ where: { ref }, select: { id: true } }))) return ref;
  }
  throw new Error('Could not allocate a review reference');
}
