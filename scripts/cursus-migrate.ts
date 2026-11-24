/**
 * Grouping of the cursus (issue #21), after the schema migration 20261126090000_cursus:
 *   pnpm cursus:migrate            groups the fiches (journaled), recomputes labels, index, ratings
 *   pnpm cursus:migrate --down     undoes every grouping from the journal (exact way back)
 * Database: CURSUS_DATABASE_URL, else DATABASE_URL. Take a counts snapshot first with
 * `pnpm cursus:check --snapshot`, then compare with `pnpm cursus:check`.
 * The full way back: --down, then `prisma db execute --file prisma/migrations/20261126090000_cursus/down.sql`.
 */
if (process.env.CURSUS_DATABASE_URL) process.env.DATABASE_URL = process.env.CURSUS_DATABASE_URL;
process.env.NM_PROCESS ??= 'worker';

const down = process.argv.includes('--down');
const { prisma } = await import('../lib/db');
const { applyCursusGrouping, revertAll } = await import('../lib/catalog/cursus');
const { refreshSearchIndex } = await import('../lib/search-index');
const t0 = Date.now();
try {
  if (down) {
    const n = await revertAll();
    console.log(`[cursus] ${n} écritures annulées`);
  } else {
    const r = await applyCursusGrouping({ runId: `migrate:${new Date().toISOString()}` }, (m) =>
      console.log(`[cursus] ${m}`),
    );
    console.log(
      `[cursus] ${r.groups} parcours regroupés, ${r.merged} fiches rattachées, ${r.skipped.length} groupes laissés tels quels`,
    );
  }
  await refreshSearchIndex();
  console.log(`[cursus] index reconstruit · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  await prisma.$disconnect();
}

export {};
