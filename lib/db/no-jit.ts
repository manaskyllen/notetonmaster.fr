import { prisma } from '@/lib/db';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Runs read queries with Postgres JIT off. The admin lists aggregate several CTEs (Fiches: every
 * program, mention and establishment with its problems and provenance); the planner overestimates
 * their rows by three orders of magnitude and spends ~850 ms compiling a 100 ms query. SET LOCAL
 * only lasts for this short transaction.
 */
export function noJit<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // raw-sql: constant statement.
    await tx.$executeRawUnsafe('SET LOCAL jit = off');
    return fn(tx);
  });
}
