import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { TAGS } from '@/lib/cache/tags';

/** Programs created by a sync have UUIDs, the hand-made ones cuids. */
export const PROGRAM_ID = /^[a-z0-9-]{20,40}$/i;

/**
 * « Suivre » lives in the Favorite table only. Every page that shows it (fiche, Explorer,
 * mention and university pages, Mon espace) reads this list while rendering on the server;
 * each change expires the student's tag, so the state is right after any navigation or reload.
 */
export function followedIds(studentId: string): Promise<string[]> {
  return unstable_cache(
    async () =>
      (await prisma.favorite.findMany({ where: { studentId }, select: { programId: true } })).map(
        (f) => f.programId,
      ),
    ['favorites', studentId],
    { tags: [TAGS.favorites(studentId)], revalidate: 300 },
  )();
}

/** The followed programs of the current student (empty without session). */
export async function followedSet(student: { id: string } | null): Promise<Set<string>> {
  return new Set(student ? await followedIds(student.id) : []);
}

/** Idempotent: following twice keeps one row, unfollowing twice is a no-op. */
export async function setFollowed(studentId: string, programId: string, followed: boolean) {
  if (followed)
    await prisma.favorite.upsert({
      where: { studentId_programId: { studentId, programId } },
      create: { studentId, programId },
      update: {},
    });
  else await prisma.favorite.deleteMany({ where: { studentId, programId } });
  revalidateTag(TAGS.favorites(studentId), { expire: 0 });
}
