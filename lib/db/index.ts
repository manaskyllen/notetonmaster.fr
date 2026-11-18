import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

/**
 * One pool per process, sized for its job: the site serves many short queries in
 * parallel; the worker writes by batches in short transactions and must never take the
 * connections the site needs during a sync. DB_POOL_MAX overrides the default.
 */
const isWorker =
  process.env.NM_PROCESS === 'worker' ||
  process.argv.some((a) => /worker(\/index\.ts|\.js)$/.test(a));
const poolMax = Number(process.env.DB_POOL_MAX) || (isWorker ? 4 : 12);

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // A runaway query never holds a connection of the site for long.
    statement_timeout: isWorker ? 600_000 : 15_000,
  });
  const client = new PrismaClient({
    adapter,
    // Dev: queries slower than 100 ms are logged, with their SQL.
    log: process.env.NODE_ENV !== 'production' ? [{ emit: 'event', level: 'query' }] : [],
  });
  if (process.env.NODE_ENV !== 'production' && !process.env.VITEST)
    (
      client as unknown as {
        $on: (e: 'query', cb: (q: { duration: number; query: string }) => void) => void;
      }
    ).$on('query', (q) => {
      if (q.duration > 100)
        console.warn(`[db] ${q.duration} ms · ${q.query.replace(/\s+/g, ' ').slice(0, 300)}`);
    });
  return client;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
