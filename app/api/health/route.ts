import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Probe of the deployment script and the external monitor: database reachable, deployed commit. */
export async function GET() {
  const version = process.env.APP_VERSION ?? 'dev';
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'ok', version }, { headers });
  } catch {
    return Response.json({ status: 'error', db: 'unreachable', version }, { status: 503, headers });
  }
}
