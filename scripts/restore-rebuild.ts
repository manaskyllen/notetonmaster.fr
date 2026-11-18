/**
 * Rebuilds what a backup leaves out (scripts/backup.sh), after `pg_restore` (scripts/restore.sh):
 * ratings and counters of the parcours, the search index and its view, the ratings of the
 * mentions and universities, the figures of the cities. The sitemaps follow on their own: they
 * are read from the index, and the app container is recreated with an empty cache.
 */
import { prisma } from '../lib/db';
import { rebuildProgramSearchIndex } from '../lib/catalog/program-index';

const t = Date.now();
try {
  const n = await rebuildProgramSearchIndex();
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW search_document`;
  console.log(`[restore] index reconstruit : ${n} parcours publiés (${Date.now() - t} ms)`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
