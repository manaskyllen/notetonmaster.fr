import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { TAGS } from '@/lib/cache/tags';
import { countFiches, readFicheQuery, readViewCounts } from './fiche-query';

export * from './fiche-query';

/** Counters of the views of Fiches, cached 5 minutes with the admin counters. */
export const viewCounts = unstable_cache(readViewCounts, ['admin-fiche-views-v1'], {
  revalidate: 300,
  tags: [TAGS.admin],
});

/** Count of a saved view, cached like the views. */
export const savedViewCount = unstable_cache(
  async (query: string) =>
    countFiches(readFicheQuery(Object.fromEntries(new URLSearchParams(query)))),
  ['admin-saved-view-v1'],
  { revalidate: 300, tags: [TAGS.admin] },
);

/** Options of the filters: open cities, establishments (select up to 20, else autocomplete). */
export async function ficheFilterOptions(universityId: string | null) {
  const [cities, uniCount, current] = await Promise.all([
    prisma.launchZone.findMany({
      where: { open: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true },
    }),
    prisma.university.count(),
    universityId
      ? prisma.university.findUnique({
          where: { id: universityId },
          select: { id: true, name: true },
        })
      : null,
  ]);
  const universities =
    uniCount <= 20
      ? await prisma.university.findMany({
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : null;
  return { cities, universities, current };
}
