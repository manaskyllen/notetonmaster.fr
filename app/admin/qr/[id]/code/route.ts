import { ForbiddenError, requireRole } from '@/lib/auth/admin';
import { prisma } from '@/lib/db';
import { qrPng, qrSvg } from '@/lib/qr/render';
import { siteOrigin } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

/**
 * The QR code of a short link (issue #17), drawn on the server: SVG for the printer (default),
 * PNG with ?format=png. Encodes the short address (notetonmaster.fr/q/{slug}), never the target:
 * the target can change, the printed code cannot. Admin only.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('team.manage');
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const link = await prisma.qrLink.findUnique({ where: { id }, select: { slug: true } });
  if (!link) return new Response('Lien introuvable', { status: 404 });
  const url = `${siteOrigin()}/q/${link.slug}`;
  const png = new URL(req.url).searchParams.get('format') === 'png';
  const headers = {
    'Content-Disposition': `attachment; filename="qr-${link.slug}.${png ? 'png' : 'svg'}"`,
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  };
  return png
    ? new Response(new Uint8Array(qrPng(url)), {
        headers: { ...headers, 'Content-Type': 'image/png' },
      })
    : new Response(qrSvg(url, { title: url }), {
        headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' },
      });
}
