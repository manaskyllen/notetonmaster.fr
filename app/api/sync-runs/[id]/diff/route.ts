import { ForbiddenError, requireRole } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import { diffCsv, type RecordPlan } from '@/lib/data/diff';

export const dynamic = 'force-dynamic';

/** Difference report of a run, as CSV (one line per field change). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('dashboard.view');
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('forbidden', { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const run = await prisma.syncRun.findUnique({
    where: { id },
    include: { source: { select: { key: true } } },
  });
  if (!run) return new Response('not found', { status: 404 });
  const rows = await prisma.stagingRecord.findMany({
    where: { runId: id },
    orderBy: { recordKey: 'asc' },
    select: { recordKey: true, plan: true },
  });
  const csv = diffCsv(
    rows.map((r) => ({ recordKey: r.recordKey, plan: r.plan as RecordPlan | null })),
  );
  const day = (run.finishedAt ?? run.queuedAt).toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rapport-${run.source.key}-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
