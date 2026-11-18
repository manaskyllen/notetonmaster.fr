import { ForbiddenError, requireRole } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Progress of a sync run, polled by the admin "Récupération" page. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('dashboard.view');
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: 'forbidden' }, { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const run = await prisma.syncRun.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      progress: true,
      step: true,
      finishedAt: true,
      error: true,
      logs: { orderBy: { at: 'desc' }, take: 6, select: { level: true, message: true, at: true } },
    },
  });
  if (!run) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(run, { headers: { 'Cache-Control': 'no-store' } });
}
