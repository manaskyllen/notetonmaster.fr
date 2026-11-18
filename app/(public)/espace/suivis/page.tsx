import type { Metadata } from 'next';
import { SavedMasters, type SavedMaster } from '@/components/espace/SavedMasters';
import { Pagination } from '@/components/ui/Pagination';
import { prisma } from '@/lib/db';
import { getEspace } from '@/lib/espace';
import { readPage, type Params } from '@/lib/pagination';

export const metadata: Metadata = {
  title: 'Masters suivis · Mon espace',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

const PER_PAGE = 24;

export default async function SavedPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [e, sp] = await Promise.all([getEspace(), searchParams]);
  const { page, offset } = readPage(sp, { perPage: PER_PAGE });
  const studentId = e.student.id;
  // A followed master of a closed city is kept (Favorite) but hidden until the city reopens.
  const where = { studentId, program: { isPublished: true, inOpenZone: true } };
  const [favorites, total] = await Promise.all([
    prisma.favorite.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { programId: 'asc' }],
      skip: offset,
      take: PER_PAGE,
      select: {
        lastViewedAt: true,
        program: {
          select: {
            id: true,
            slug: true,
            title: true,
            city: true,
            universityId: true,
            durationYears: true,
            entryLevel: true,
            reviewCount: true,
            avgRating: true,
            recommendShare: true,
            university: { select: { name: true, shortName: true, sector: true } },
            searchIndex: {
              select: {
                title: true,
                universityShort: true,
                cityName: true,
                modalities: true,
                entryLevel: true,
                isPublicSector: true,
              },
            },
          },
        },
      },
    }),
    prisma.favorite.count({ where }),
  ]);
  // Reviews published since the last visit of each fiche, in one query for the page.
  const ids = favorites.map((f) => f.program.id);
  const fresh = ids.length
    ? await prisma.$queryRaw<{ programId: string; n: number }[]>`
        SELECT f."programId", count(r.id)::int AS n
          FROM "Favorite" f
          JOIN "Review" r ON r."programId" = f."programId"
           AND r.status = 'PUBLISHED' AND r."publishedAt" > f."lastViewedAt"
         WHERE f."studentId" = ${studentId} AND f."programId" = ANY(${ids})
         GROUP BY f."programId"`
    : [];
  const freshOf = new Map(fresh.map((r) => [r.programId, r.n]));

  const masters: SavedMaster[] = favorites.map(({ program: p }) => {
    const i = p.searchIndex;
    return {
      programId: p.id,
      slug: p.slug,
      title: i?.title ?? p.title,
      universityId: p.universityId,
      universityShort: i?.universityShort ?? p.university.shortName ?? p.university.name,
      universityName: p.university.name,
      cityName: i?.cityName ?? p.city ?? '',
      modalities: i?.modalities ?? [],
      entryLevel: i?.entryLevel ?? p.entryLevel,
      durationYears: p.durationYears,
      isPublicSector: i?.isPublicSector ?? p.university.sector === 'PUBLIC',
      avgRating: p.reviewCount ? p.avgRating : null,
      reviewCount: p.reviewCount,
      recommendShare: p.recommendShare,
      fresh: freshOf.get(p.id) ?? 0,
    };
  });
  return (
    <>
      <SavedMasters masters={masters} />
      <h2 id="suivis-page" className="sr-only">
        Page {page}
      </h2>
      <Pagination
        pathname="/espace/suivis"
        params={sp}
        page={page}
        perPage={PER_PAGE}
        total={total}
        targetId="suivis-page"
      />
    </>
  );
}
