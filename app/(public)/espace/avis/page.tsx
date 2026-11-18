import type { Metadata } from 'next';
import { MyReviews, type MyReview } from '@/components/espace/MyReviews';
import { CtaArrow, ctaClasses, Pagination } from '@/components/ui';
import { prisma } from '@/lib/db';
import { getEspace } from '@/lib/espace';
import { readPage, type Params } from '@/lib/pagination';
import { formatDate } from '@/lib/format';
import { STUDENT_STATUS } from '@/lib/review-status-ui';

export const metadata: Metadata = { title: 'Mes avis · Mon espace', robots: { index: false } };
export const dynamic = 'force-dynamic';

const PER_PAGE = 10;

export default async function MyReviewsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [e, sp] = await Promise.all([getEspace(), searchParams]);
  const { page, offset } = readPage(sp, { perPage: PER_PAGE });
  const where = { studentId: e.student.id };
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: PER_PAGE,
      include: {
        program: { select: { title: true, slug: true, city: true } },
        _count: { select: { conversations: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);
  const reviews: MyReview[] = rows.map((r) => {
    const s = STUDENT_STATUS[r.status];
    return {
      id: r.id,
      ref: r.ref,
      programTitle: r.program.title,
      programSlug: r.program.slug,
      city: r.program.city,
      title: r.title,
      rating: r.overallRating,
      status: r.status,
      statusLabel: s.label + (r.status === 'PUBLISHED' && r.isVerified ? ' · vérifié' : ''),
      statusCls: s.cls,
      message: ['NEEDS_EDIT', 'REJECTED', 'HIDDEN'].includes(r.status) ? r.moderationReason : null,
      editable: ['PENDING', 'PUBLISHED', 'NEEDS_EDIT'].includes(r.status),
      stats:
        r.status === 'PUBLISHED'
          ? {
              views: r.viewCount,
              helpful: r.helpfulCount,
              questions: r._count.conversations,
              publishedOn: formatDate(r.publishedAt ?? r.submittedAt),
            }
          : null,
    };
  });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="m-0 font-display text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.035em]">
          Mes avis
        </h1>
        <a href="/avis/nouveau" className={ctaClasses('primary', 'm')}>
          Donner un nouvel avis
          <CtaArrow />
        </a>
      </div>
      <h2 id="mes-avis" className="sr-only">
        Mes avis, page {page}
      </h2>
      <MyReviews reviews={reviews} />
      <Pagination
        pathname="/espace/avis"
        params={sp}
        page={page}
        perPage={PER_PAGE}
        total={total}
        targetId="mes-avis"
      />
    </>
  );
}
