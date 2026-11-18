import { audit } from '@/lib/audit';
import { ForbiddenError, requireRole } from '@/lib/auth/admin';
import { adminSession, recentlyAuthenticated } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Connection data export for a requisition. LEGAL role only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireRole('connectionLogs.view');
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Réservé au rôle Légal.', { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  // Sensitive export: the code is asked again when the last one is more than 5 minutes old.
  if (!(await recentlyAuthenticated((await adminSession()).sid)))
    return Response.redirect(
      new URL(
        `/admin/confirmer?suite=${encodeURIComponent(`/admin/legal/${id}/export`)}`,
        process.env.APP_URL,
      ),
      303,
    );
  const l = await prisma.legalRequest.findUnique({ where: { id } });
  if (!l) return new Response('Not found', { status: 404 });
  const ref = /avis-[0-9a-f]{6}/.exec(l.contentUrl)?.[0];
  const slug = /\/parcours\/([a-z0-9-]+)/.exec(l.contentUrl)?.[1];
  const reviews = await prisma.review.findMany({
    where: ref ? { ref } : slug ? { program: { slug } } : { id: '-' },
    select: { studentId: true, authorEmailHash: true, ref: true },
  });
  const subjects = reviews.flatMap((r) =>
    [r.studentId, r.authorEmailHash].filter((x): x is string => !!x),
  );
  const logs = await prisma.connectionLog.findMany({
    where: { subjectRef: { in: subjects } },
    orderBy: { at: 'asc' },
  });
  const lines = [
    'date_utc;type;ip;user_agent',
    ...logs.map((g) =>
      [g.at.toISOString(), g.kind, g.ip ?? '', (g.userAgent ?? '').replace(/;/g, ',')].join(';'),
    ),
  ];
  await audit(
    admin,
    'LEGAL',
    l.reference,
    `Export des données de connexion téléchargé (${logs.length} lignes)`,
  );
  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${l.reference}-connexions.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
