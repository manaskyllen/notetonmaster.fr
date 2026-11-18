import { ForbiddenError, requireRole } from '@/lib/auth/admin';
import { clientIp } from '@/lib/request';

export const dynamic = 'force-dynamic';

/**
 * The client address as the app sees it behind the reverse proxy (lib/ip.ts,
 * TRUSTED_PROXY_HOPS): `pnpm proxy:check` compares it with the caller's. Admins only, never
 * cached. Only the address of the caller itself, nothing stored.
 */
export async function GET() {
  try {
    await requireRole('team.manage');
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: 'forbidden' }, { status: 403 });
    throw e;
  }
  return Response.json({ ip: await clientIp() }, { headers: { 'Cache-Control': 'no-store' } });
}
