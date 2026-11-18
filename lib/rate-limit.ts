import 'server-only';
import { prisma } from '@/lib/db';
import { hmac } from '@/lib/crypto';

/**
 * Fixed-window rate limiting backed by the database (shared by every app instance).
 * Returns true when the action is allowed (and records the hit). Atomic: a transaction-level
 * advisory lock on the bucket serialises the count and the insert, so parallel requests cannot
 * all pass the check before any of them is recorded.
 */
export async function rateLimit(bucket: string, limit: number, windowMs: number): Promise<boolean> {
  // The dev stack raises every limit (docker-compose.yml); production keeps them (factor 1).
  limit *= Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER) || 1);
  const key = hmac(`rl:${bucket}`);
  const since = new Date(Date.now() - windowMs);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const count = await tx.rateLimitHit.count({ where: { bucket: key, at: { gte: since } } });
    if (count >= limit) return false;
    await tx.rateLimitHit.create({ data: { bucket: key } });
    return true;
  });
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
