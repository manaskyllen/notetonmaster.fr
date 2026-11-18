import 'server-only';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { resolveClientIp } from '@/lib/ip';

/**
 * Visitor IP (rate limits, ConnectionLog, Turnstile): CF-Connecting-IP behind Cloudflare when
 * TRUST_CLOUDFLARE=true and the request comes from a Cloudflare address, else the first
 * X-Forwarded-For hop of the trusted proxy (lib/ip.ts).
 */
export async function clientIp(): Promise<string> {
  return resolveClientIp(await headers(), process.env.TRUST_CLOUDFLARE === 'true');
}

/** Technical connection log (kept 1 year, LEGAL role only). */
export async function logConnection(kind: string, subjectRef: string | null) {
  const h = await headers();
  await prisma.connectionLog.create({
    data: {
      kind,
      subjectRef,
      ip: await clientIp(),
      userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
    },
  });
}
