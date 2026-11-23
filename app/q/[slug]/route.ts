import { after } from 'next/server';
import { isBot, isPrefetch } from '@/lib/domain/qr';
import { activeTarget, countScan } from '@/lib/qr/links';

export const dynamic = 'force-dynamic';

/**
 * Short link of a printed QR code (issue #17): one scan more for the day, then a 302 to the
 * target, whose address stays clean (no utm, no ?source=). 302 and no-store: a cached redirect
 * would not be counted again. Nothing about the visitor is stored or logged: the user agent is
 * only read to leave robots and link previews out. An unknown or archived link goes to the home
 * page, never to a 404 (a printed code must always lead somewhere), and is not counted.
 */
function redirectTo(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      // A path of this site only (lib/domain/qr.ts isInternalPath): resolved on this origin.
      Location: path,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

async function resolve(slug: string) {
  // The lookup must not stop the redirect: on an error, the home page.
  return activeTarget(slug).catch(() => null);
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const target = await resolve(slug);
  if (!target) return redirectTo('/');
  const h = (name: string) => req.headers.get(name);
  if (!isBot(h('user-agent')) && !isPrefetch(h))
    // After the answer: counting never delays the redirect, and a failure is ignored.
    after(() => countScan(target.id).catch(() => {}));
  return redirectTo(target.path);
}

/** HEAD: the same answer, never counted. */
export async function HEAD(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const target = await resolve(slug);
  return redirectTo(target?.path ?? '/');
}
