import type { Metadata } from 'next';
import { ReviewsTable } from '@/components/admin/ReviewsTable';
import { AdminHeader, KpiCard } from '@/components/admin/ui';
import { Pagination } from '@/components/ui/Pagination';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db/generated/client';
import type { ReviewStatus } from '@/lib/db/generated/enums';
import { LEVEL_SHORT } from '@/lib/domain/rating';
import { codeCandidates, codeVariants } from '@/lib/domain/search';
import { readPage, type Params } from '@/lib/pagination';

export const metadata: Metadata = { title: 'Tous les avis' };

const d = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Paris',
});
const PER_PAGE = 25;
const STATUSES: ReviewStatus[] = [
  'PENDING_CONFIRMATION',
  'PENDING',
  'PUBLISHED',
  'NEEDS_EDIT',
  'HIDDEN',
  'REJECTED',
];

export default async function AvisAdminPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin('moderation.manage');
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? '';
  const q = one('q').trim();
  const status = STATUSES.find((s) => s === one('statut'));
  const { page, offset } = readPage(sp, { perPage: PER_PAGE });

  // Search: title, reference, program title, or a code of the program (RNCP, Mon Master).
  const codes = [...new Set(codeCandidates(q).flatMap((c) => codeVariants(c.code)))];
  const coded = codes.length
    ? (
        await prisma.identifier.findMany({
          where: { entityType: 'PROGRAM', OR: codes.map((v) => ({ value: { startsWith: v } })) },
          select: { entityId: true },
        })
      ).map((i) => i.entityId)
    : [];
  const search: Prisma.ReviewWhereInput = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { ref: { contains: q, mode: 'insensitive' } },
          { program: { title: { contains: q, mode: 'insensitive' } } },
          ...(coded.length ? [{ programId: { in: coded } }] : []),
        ],
      }
    : {};
  const where = { ...search, ...(status ? { status } : {}) };

  const [rows, total, byStatus, demo, decided] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: PER_PAGE,
      select: {
        id: true,
        ref: true,
        submittedAt: true,
        title: true,
        level: true,
        cohortYear: true,
        overallRating: true,
        status: true,
        isDemo: true,
        program: { select: { title: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.groupBy({ by: ['status'], where: search, _count: { _all: true } }),
    prisma.review.count({ where: { isDemo: true } }),
    prisma.$queryRaw<{ hours: number | null }[]>`
      SELECT avg(extract(epoch FROM ("moderatedAt" - "submittedAt")) / 3600)::float AS hours
        FROM "Review" WHERE "moderatedAt" IS NOT NULL AND status <> 'PENDING'`,
  ]);
  const flags = new Map(
    (
      await prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: 'REVIEW', targetId: { in: rows.map((r) => r.id) } },
        _count: { _all: true },
      })
    ).map((r) => [r.targetId, r._count._all]),
  );
  // KPI over every review (not the filter).
  const all = await prisma.review.groupBy({ by: ['status'], _count: { _all: true } });
  const n = (list: typeof all, s?: ReviewStatus) =>
    list.filter((x) => !s || x.status === s).reduce((a, x) => a + x._count._all, 0);
  const received = n(all);
  const counts: Record<string, number> = { all: n(byStatus) };
  for (const s of STATUSES) counts[s] = n(byStatus, s);
  const avgHours = decided[0]?.hours;

  return (
    <>
      <AdminHeader
        kicker={demo ? 'Contient des données d’exemple' : undefined}
        title="Tous les avis"
      />
      <section
        aria-label="Chiffres"
        className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"
      >
        <KpiCard label="Avis reçus" value={received} />
        <KpiCard label="Publiés" value={n(all, 'PUBLISHED')} />
        <KpiCard
          label="Taux de refus"
          value={`${received ? Math.round((n(all, 'REJECTED') / received) * 100) : 0} %`}
        />
        <KpiCard
          label="Délai moyen de modération"
          value={avgHours == null ? 'n.c.' : `${Math.round(avgHours)} h`}
          tone="brand"
        />
      </section>
      <h2 id="avis-liste" className="sr-only">
        Avis, page {page}
      </h2>
      <ReviewsTable
        q={q}
        status={status ?? 'all'}
        counts={counts}
        rows={rows.map((r) => ({
          id: r.id,
          ref: r.ref,
          date: d.format(r.submittedAt),
          title: r.title,
          program: r.program.title,
          author: `Anonyme · ${LEVEL_SHORT[r.level]} · ${r.cohortYear}`,
          rating: r.overallRating,
          flags: flags.get(r.id) ?? 0,
          status: r.status,
          demo: r.isDemo,
        }))}
        pagination={
          <Pagination
            pathname="/admin/avis"
            params={sp}
            page={page}
            perPage={PER_PAGE}
            total={total}
            targetId="avis-liste"
          />
        }
      />
    </>
  );
}
